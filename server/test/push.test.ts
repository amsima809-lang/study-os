import { describe, it, expect, beforeEach } from "vitest";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import {
  dueItems, generateVapidKeys, isPushEndpoint, loadVapidKeys, pendingFor, sendDuePushes, sendPush, vapidHeader,
} from "../src/push.js";

const FCM = "https://fcm.googleapis.com/fcm/send/device-a";
const MOZ = "https://updates.push.services.mozilla.com/wpush/v2/device-b";
// Monday 16 Nov 2026, 10:03 in Bangkok (UTC+7).
const at = (hhmm: string) => new Date(`2026-11-16T${hhmm}:00+07:00`);

describe("push: signing (VAPID)", () => {
  it("makes a P-256 key pair in the form browsers expect", () => {
    const k = generateVapidKeys();
    const pub = Buffer.from(k.publicKey, "base64url");
    expect(pub.length).toBe(65);
    expect(pub[0]).toBe(4); // uncompressed point
    expect(Buffer.from(k.privateKey, "base64url").length).toBe(32);
  });

  it("signs a token the push service can verify with the public key", () => {
    const keys = generateVapidKeys();
    const now = Date.UTC(2026, 10, 16, 3, 0, 0);
    const header = vapidHeader(FCM, keys, "mailto:ops@studyos.test", now);
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header)!;
    expect(m).not.toBeNull();
    const [, head, body, sig, k] = m;
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(Buffer.from(head, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    expect(claims.aud).toBe("https://fcm.googleapis.com"); // the push service's origin, not the full address
    expect(claims.sub).toBe("mailto:ops@studyos.test");
    expect(claims.exp - now / 1000).toBe(12 * 60 * 60); // push services refuse more than 24 hours

    const pub = Buffer.from(keys.publicKey, "base64url");
    const publicKey = createPublicKey({
      format: "jwk",
      key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") },
    });
    const good = verify("sha256", Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
    expect(good).toBe(true);
    expect(Buffer.from(sig, "base64url").length).toBe(64); // r || s, as JWT ES256 requires
  });

  it("keeps the same keys across restarts", () => {
    const db = openDb(":memory:");
    const first = loadVapidKeys(db);
    expect(loadVapidKeys(db)).toEqual(first);
  });
});

describe("push: where the server will send", () => {
  it("accepts the real push services over HTTPS", () => {
    for (const ok of [FCM, MOZ, "https://web.push.apple.com/QGx", "https://wns2-sg2p.notify.windows.com/w/?token=x"]) expect(isPushEndpoint(ok)).toBe(true);
  });
  it("refuses anything else, so a made-up subscription cannot make the server call an arbitrary address", () => {
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/x", "https://localhost/x", "https://169.254.169.254/latest/meta-data",
      "https://evil.example/fcm.googleapis.com", "https://fcm.googleapis.com.evil.example/x", "https://user@fcm.googleapis.com/x", "not a url", "",
    ]) expect(isPushEndpoint(bad)).toBe(false);
  });
});

describe("push: announcing what is due", () => {
  let db: DB;
  const A = "legacy-user-0001";
  const B = "user-b";
  const keys = generateVapidKeys();
  const add = (user: string, title: string, time: string | null, kind = "reminder", date = "2026-11-16") =>
    Number(db.prepare("INSERT INTO reminders (user_id, kind, title, date, time, repeat) VALUES (?,?,?,?,?,'none')").run(user, kind, title, date, time).lastInsertRowid);
  const subscribe = (user: string, endpoint: string) =>
    db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, 'p', 'a')").run(user, endpoint);
  const fakeFetch = (status = 201) => {
    const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
    const fetch = async (url: string, init: { method: string; headers: Record<string, string> }) => { calls.push({ url, ...init }); return { status }; };
    return { calls, fetch };
  };

  beforeEach(() => {
    db = openDb(":memory:");
    seedDatabase(db, { reset: false });
    db.prepare("INSERT INTO users (id, email, name, created_at, last_login_at) VALUES (?, 'b@x.test', 'B', datetime('now'), datetime('now'))").run(B);
  });

  it("picks items whose time has just arrived, and nothing else", () => {
    add(A, "Just due", "10:00");
    add(A, "Due long ago", "08:00");
    add(A, "Later today", "10:30");
    add(A, "No time", null, "todo");
    add(A, "Tomorrow", "10:00", "reminder", "2026-11-17");
    const done = add(A, "Already ticked", "10:01", "todo");
    db.prepare("INSERT INTO reminder_done (reminder_id, date) VALUES (?, '2026-11-16')").run(done);
    add(B, "Someone else's", "10:02");
    expect(dueItems(db, A, at("10:03")).map((o) => o.title)).toEqual(["Just due"]);
    expect(dueItems(db, B, at("10:03")).map((o) => o.title)).toEqual(["Someone else's"]);
    expect(dueItems(db, A, at("09:59"))).toEqual([]); // not yet
  });

  it("sends one empty, signed push per device, once", async () => {
    add(A, "Submit assignment", "10:00");
    add(A, "Call the registrar", "10:02");
    subscribe(A, FCM);
    subscribe(A, MOZ);
    const { calls, fetch } = fakeFetch();

    expect(await sendDuePushes(db, keys, at("10:03"), fetch)).toBe(2);
    expect(calls.map((c) => c.url).sort()).toEqual([FCM, MOZ].sort()); // one tap per device, not one per item
    for (const c of calls) {
      expect(c.method).toBe("POST");
      expect(c.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
      expect(c.headers.TTL).toBe("3600");
      expect(c.headers["Content-Length"]).toBe("0"); // no reminder text leaves the server
      expect("body" in c).toBe(false);
    }
    // The next rounds stay quiet: both items are recorded as announced.
    expect(await sendDuePushes(db, keys, at("10:04"), fetch)).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it("announces a later item on its own", async () => {
    add(A, "First", "10:00");
    add(A, "Second", "10:20");
    subscribe(A, FCM);
    const { calls, fetch } = fakeFetch();
    await sendDuePushes(db, keys, at("10:01"), fetch);
    await sendDuePushes(db, keys, at("10:10"), fetch);
    expect(calls).toHaveLength(1);
    await sendDuePushes(db, keys, at("10:20"), fetch);
    expect(calls).toHaveLength(2);
  });

  it("does nothing for a student with no subscribed device, or with nothing due", async () => {
    add(A, "Due, but no device", "10:00");
    add(B, "Not due yet", "11:00");
    subscribe(B, FCM);
    const { calls, fetch } = fakeFetch();
    expect(await sendDuePushes(db, keys, at("10:03"), fetch)).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("forgets a device the push service says is gone", async () => {
    subscribe(A, FCM);
    const sub = db.prepare("SELECT id, user_id, endpoint FROM push_subscriptions").get() as { id: number; user_id: string; endpoint: string };
    expect(await sendPush(db, sub, keys, fakeFetch(410).fetch)).toBe(false);
    expect(db.prepare("SELECT COUNT(*) n FROM push_subscriptions").get()).toEqual({ n: 0 });
  });

  it("keeps a device through a passing error, and never calls an address that is not a push service", async () => {
    subscribe(A, FCM);
    const sub = db.prepare("SELECT id, user_id, endpoint FROM push_subscriptions").get() as { id: number; user_id: string; endpoint: string };
    expect(await sendPush(db, sub, keys, fakeFetch(503).fetch)).toBe(false);
    expect(await sendPush(db, sub, keys, async () => { throw new Error("network down"); })).toBe(false);
    expect(db.prepare("SELECT COUNT(*) n FROM push_subscriptions").get()).toEqual({ n: 1 });

    db.prepare("UPDATE push_subscriptions SET endpoint = 'https://internal.example/hook'").run();
    const bad = db.prepare("SELECT id, user_id, endpoint FROM push_subscriptions").get() as { id: number; user_id: string; endpoint: string };
    const { calls, fetch } = fakeFetch();
    expect(await sendPush(db, bad, keys, fetch)).toBe(false);
    expect(calls).toHaveLength(0);
    expect(db.prepare("SELECT COUNT(*) n FROM push_subscriptions").get()).toEqual({ n: 0 });
  });

  it("tells the device what to show, in the student's time format", () => {
    const id = add(A, "Group meeting", "13:30", "event");
    db.prepare("UPDATE reminders SET end_time = '14:30', course_code = 'MKT2101', note = 'Room 301' WHERE id = ?").run(id);
    expect(pendingFor(db, A, "24", at("13:31"))).toEqual([
      { id, on: "2026-11-16", title: "Group meeting", kind: "event", body: "13:30–14:30 · MKT2101 · Room 301" },
    ]);
    expect(pendingFor(db, A, "12", at("13:31"))[0].body).toBe("1:30 PM–2:30 PM · MKT2101 · Room 301");
    expect(pendingFor(db, B, "24", at("13:31"))).toEqual([]); // never another student's
  });
});

// ── The service-worker half (client/public/push-sw.js), run in a sandbox ──
type Shown = { title: string; body: string; tag: string };
function loadPushWorker(server: { status: number; json?: unknown } | "offline") {
  const shown: Shown[] = [];
  const requests: { url: string; body: string }[] = [];
  const handlers: Record<string, (e: any) => void> = {};
  let unsubscribed = false;
  const opened: string[] = [];
  let focused = 0;
  const self = {
    registration: {
      showNotification: async (title: string, o: { body: string; tag: string }) => { shown.push({ title, body: o.body, tag: o.tag }); },
      pushManager: { getSubscription: async () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/device-a", unsubscribe: async () => { unsubscribed = true; } }) },
    },
    clients: { matchAll: async () => [] as { focus: () => void }[], openWindow: async (url: string) => { opened.push(url); } },
    addEventListener: (type: string, h: (e: any) => void) => { handlers[type] = h; },
  };
  const fetch = async (url: string, init: { body: string }) => {
    requests.push({ url, body: init.body });
    if (server === "offline") throw new Error("offline");
    return { ok: server.status === 200, status: server.status, json: async () => server.json };
  };
  const file = fileURLToPath(new URL("../../client/public/push-sw.js", import.meta.url));
  vm.runInNewContext(readFileSync(file, "utf8"), { self, fetch, Promise, JSON });
  const fire = async (type: string, extra: object = {}) => {
    let work: Promise<unknown> = Promise.resolve();
    handlers[type]({ waitUntil: (p: Promise<unknown>) => { work = p; }, ...extra });
    await work;
  };
  return { shown, requests, fire, self, opened, wasUnsubscribed: () => unsubscribed, focusedCount: () => focused, onFocus: () => { focused++; } };
}

describe("push: the service worker showing a notification", () => {
  it("asks the server what is due and shows each item", async () => {
    const w = loadPushWorker({ status: 200, json: { lang: "en", test: false, items: [
      { id: 7, on: "2026-11-16", title: "Submit assignment", body: "10:00 · MKT2101" },
      { id: 9, on: "2026-11-16", title: "Call the registrar", body: "10:02" },
    ] } });
    await w.fire("push");
    expect(w.requests).toEqual([{ url: "/api/push/pending", body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/device-a" }) }]);
    expect(w.shown).toEqual([
      { title: "Submit assignment", body: "10:00 · MKT2101", tag: "studyos-7-2026-11-16" }, // same tag as the in-app alert
      { title: "Call the registrar", body: "10:02", tag: "studyos-9-2026-11-16" },
    ]);
  });

  it("shows the test notification, in the student's language", async () => {
    const w = loadPushWorker({ status: 200, json: { lang: "th", test: true, items: [] } });
    await w.fire("push");
    expect(w.shown).toEqual([{ title: "StudyOS", body: "การแจ้งเตือนทำงานแล้ว", tag: "studyos-test" }]);
  });

  it("always shows something: a plain notice when offline or when nothing is listed", async () => {
    const offline = loadPushWorker("offline");
    await offline.fire("push");
    expect(offline.shown).toHaveLength(1);
    expect(offline.shown[0].tag).toBe("studyos-due");
    const empty = loadPushWorker({ status: 200, json: { lang: "en", test: false, items: [] } });
    await empty.fire("push");
    expect(empty.shown).toEqual([{ title: "StudyOS", body: "Something is due. Open StudyOS to see it.", tag: "studyos-due" }]);
  });

  it("stops the pushes on a device where nobody is signed in, and shows no reminder text", async () => {
    const w = loadPushWorker({ status: 401 });
    await w.fire("push");
    expect(w.wasUnsubscribed()).toBe(true);
    expect(w.shown).toHaveLength(1);
    expect(w.shown[0].tag).toBe("studyos-signin");
  });

  it("opens the app when a notification is tapped, or brings its window forward", async () => {
    const w = loadPushWorker({ status: 200, json: {} });
    let closed = false;
    await w.fire("notificationclick", { notification: { close: () => { closed = true; } } });
    expect(closed).toBe(true);
    expect(w.opened).toEqual(["/"]);

    w.self.clients.matchAll = async () => [{ focus: w.onFocus }];
    await w.fire("notificationclick", { notification: { close: () => {} } });
    expect(w.focusedCount()).toBe(1);
    expect(w.opened).toEqual(["/"]); // no second window
  });
});
