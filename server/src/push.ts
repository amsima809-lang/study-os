/**
 * Notifications when StudyOS is closed (Web Push).
 *
 * How it works, and why:
 * - A device that turns this on gives us its "subscription": an address at the
 *   browser maker's push service (Google, Mozilla, Apple, Microsoft).
 * - When a reminder, timed to-do or event comes due, the server sends that
 *   address an EMPTY push — a tap on the shoulder, signed so the push service
 *   knows it is us (VAPID). No reminder text ever passes through a third party.
 * - The tap wakes the app's service worker (client/public/push-sw.js), which
 *   asks this server what is due (`POST /api/push/pending`, with the student's
 *   own session) and shows it.
 *
 * An empty push needs no payload encryption, so this is plain node:crypto and
 * fetch — no extra library.
 */
import { Router } from "express";
import { createECDH, createPrivateKey, sign } from "node:crypto";
import { z } from "zod";
import type { DB } from "./db.js";
import { bangkokToday } from "./api.js";
import { itemsForToday, type Occurrence } from "./reminders.js";

// ---------- signing keys (VAPID) ----------

export type VapidKeys = {
  /** Uncompressed P-256 public key, base64url (what the browser subscribes with). */
  publicKey: string;
  /** The 32-byte private key, base64url. */
  privateKey: string;
};

const b64u = (buf: Buffer | Uint8Array) => Buffer.from(buf).toString("base64url");

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

/**
 * The server's signing keys: from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY if set,
 * otherwise made once and kept in the database. (Changing them cuts off every
 * device that has subscribed, so they must not change between restarts.)
 */
export function loadVapidKeys(db: DB): VapidKeys {
  const fromEnv = { publicKey: process.env.VAPID_PUBLIC_KEY ?? "", privateKey: process.env.VAPID_PRIVATE_KEY ?? "" };
  if (fromEnv.publicKey && fromEnv.privateKey) return fromEnv;
  const get = (name: string) => (db.prepare("SELECT value FROM app_secrets WHERE name = ?").get(name) as { value: string } | undefined)?.value;
  const publicKey = get("vapid_public");
  const privateKey = get("vapid_private");
  if (publicKey && privateKey) return { publicKey, privateKey };
  const made = generateVapidKeys();
  const put = db.prepare("INSERT INTO app_secrets (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value");
  db.transaction(() => { put.run("vapid_public", made.publicKey); put.run("vapid_private", made.privateKey); })();
  return made;
}

/** Who a push service can contact about this sender. Set VAPID_SUBJECT to a real address before launch. */
export const vapidSubject = () => process.env.VAPID_SUBJECT ?? "mailto:admin@example.com"; // TODO(deploy): real contact address

/** The Authorization header that proves a push comes from this server (RFC 8292). */
export function vapidHeader(endpoint: string, keys: VapidKeys, subject = vapidSubject(), now = Date.now()): string {
  const pub = Buffer.from(keys.publicKey, "base64url"); // 0x04 | X (32) | Y (32)
  const key = createPrivateKey({
    format: "jwk",
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
  });
  const part = (o: object) => b64u(Buffer.from(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: subject })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64u(signature)}, k=${keys.publicKey}`;
}

// ---------- where we are willing to send ----------

/**
 * The address comes from the browser, so it is checked before the server ever
 * calls it: HTTPS only, and only the push services browsers really use.
 * (Otherwise a made-up "subscription" could make this server call any URL.)
 */
const PUSH_HOSTS = [
  /(^|\.)googleapis\.com$/,            // Chrome, Edge on Android, most Chromium browsers (FCM)
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)push\.apple\.com$/,           // Safari, installed web apps on iPhone and iPad
  /(^|\.)notify\.windows\.com$/,       // Edge on Windows
];
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

// ---------- what is due ----------

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** "HH:MM" now in Bangkok, the timezone reminder times are kept in. */
export function bangkokClock(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

/**
 * A student's items whose time arrived within the last `windowMin` minutes and
 * that are not ticked off. The same rule as the in-app alert, with a wider
 * window so a brief restart or a slow wake-up does not lose one.
 */
export function dueItems(db: DB, userId: string, now = new Date(), windowMin = 15): Occurrence[] {
  const clock = minutes(bangkokClock(now));
  return itemsForToday(db, userId, bangkokToday(now)).filter((o) => {
    if (o.done || o.overdue || !o.time || !o.on) return false;
    const due = minutes(o.time);
    return due <= clock && clock - due <= windowMin;
  });
}

// ---------- sending ----------

type Subscription = { id: number; user_id: string; endpoint: string };
type Fetch = (url: string, init: { method: string; headers: Record<string, string> }) => Promise<{ status: number }>;

/** One empty push to one device. True if the push service took it. A dead subscription is removed. */
export async function sendPush(db: DB, sub: Subscription, keys: VapidKeys, fetchImpl: Fetch = fetch): Promise<boolean> {
  if (!isPushEndpoint(sub.endpoint)) {
    db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(sub.id);
    return false;
  }
  try {
    const res = await fetchImpl(sub.endpoint, {
      method: "POST",
      headers: { Authorization: vapidHeader(sub.endpoint, keys), TTL: "3600", Urgency: "high", "Content-Length": "0" },
    });
    // 404 / 410: the device unsubscribed or the app was removed. Stop sending to it.
    if (res.status === 404 || res.status === 410) db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(sub.id);
    return res.status >= 200 && res.status < 300;
  } catch {
    return false; // network trouble: the next round tries again while the item is still in its window
  }
}

/**
 * One round: for every student with a subscribed device, announce each item
 * that has just come due and has not been announced yet. Returns how many
 * pushes the push services accepted.
 */
export async function sendDuePushes(db: DB, keys: VapidKeys, now = new Date(), fetchImpl: Fetch = fetch): Promise<number> {
  const users = db.prepare("SELECT DISTINCT user_id FROM push_subscriptions").all() as { user_id: string }[];
  const already = db.prepare("SELECT 1 FROM reminder_pushes WHERE reminder_id = ? AND date = ?");
  const mark = db.prepare("INSERT OR IGNORE INTO reminder_pushes (reminder_id, date) VALUES (?, ?)");
  let accepted = 0;
  for (const { user_id } of users) {
    const fresh = dueItems(db, user_id, now).filter((o) => !already.get(o.id, o.on));
    if (fresh.length === 0) continue;
    // One tap per device is enough: the device then asks for everything that is due.
    const subs = db.prepare("SELECT id, user_id, endpoint FROM push_subscriptions WHERE user_id = ?").all(user_id) as Subscription[];
    const results = await Promise.all(subs.map((s) => sendPush(db, s, keys, fetchImpl)));
    accepted += results.filter(Boolean).length;
    // Marked even if a device was unreachable: the window is short, and a late repeat is worse than a miss.
    for (const o of fresh) mark.run(o.id, o.on);
  }
  db.prepare("DELETE FROM reminder_pushes WHERE sent_at < datetime('now', '-7 days')").run();
  return accepted;
}

/** Check every half minute. Never keeps the process alive on its own. */
export function startPushScheduler(db: DB, keys: VapidKeys): NodeJS.Timeout {
  const round = () => { sendDuePushes(db, keys).catch((err) => console.error("[StudyOS] push round failed:", err)); };
  const timer = setInterval(round, 30_000);
  timer.unref();
  return timer;
}

// ---------- what the device shows ----------

export type PendingItem = { id: number; on: string; title: string; body: string; kind: string };

/** A time as the student chose to see it (the same rule as client/src/format.ts). */
function showTime(hhmm: string, clock: "24" | "12"): string {
  if (clock === "24") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function pendingFor(db: DB, userId: string, clock: "24" | "12", now = new Date()): PendingItem[] {
  return dueItems(db, userId, now).map((o) => ({
    id: o.id,
    on: o.on,
    title: o.title,
    kind: o.kind,
    body: [
      o.time ? (o.end_time ? `${showTime(o.time, clock)}–${showTime(o.end_time, clock)}` : showTime(o.time, clock)) : "",
      o.course_code ?? "",
      o.note ?? "",
    ].filter(Boolean).join(" · "),
  }));
}

// ---------- routes ----------

const Sub = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  lang: z.enum(["th", "en"]).default("th"),
  clock: z.enum(["24", "12"]).default("24"),
});

export function createPushRouter(db: DB, keys: VapidKeys): Router {
  const router = Router();
  /** Students who asked for a test notification and whose device has not collected it yet. */
  const testing = new Set<string>();

  // The key a browser needs in order to subscribe to this server.
  router.get("/push/key", (_req, res) => {
    res.json({ publicKey: keys.publicKey });
  });

  // Turn closed-app notifications on for this device (or refresh its language and time format).
  router.post("/push/subscribe", (req, res) => {
    const parsed = Sub.safeParse(req.body);
    if (!parsed.success || !isPushEndpoint(parsed.data.endpoint)) {
      return res.status(400).json({ error: "การสมัครรับการแจ้งเตือนไม่ถูกต้อง", code: "BAD_SUBSCRIPTION" });
    }
    const s = parsed.data;
    // A device belongs to whoever is signed in on it now.
    db.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, lang, clock) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
                                           lang = excluded.lang, clock = excluded.clock`,
    ).run(req.user!.id, s.endpoint, s.keys.p256dh, s.keys.auth, s.lang, s.clock);
    res.json({ ok: true });
  });

  // Turn them off for this device.
  router.post("/push/unsubscribe", (req, res) => {
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(req.user!.id, endpoint);
    res.json({ ok: true });
  });

  // Asked by the service worker when a push wakes it: what should it show?
  // (A POST, so the device's push address travels in the body and never in a URL or a log.)
  router.post("/push/pending", (req, res) => {
    const userId = req.user!.id;
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
    const sub = db.prepare("SELECT lang, clock FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").get(userId, endpoint) as
      | { lang: "th" | "en"; clock: "24" | "12" }
      | undefined;
    const test = testing.delete(userId);
    res.json({ items: pendingFor(db, userId, sub?.clock ?? "24"), test, lang: sub?.lang ?? "th" });
  });

  // "Send me a test notification": proves the whole path on the student's own device.
  router.post("/push/test", async (req, res) => {
    const userId = req.user!.id;
    const subs = db.prepare("SELECT id, user_id, endpoint FROM push_subscriptions WHERE user_id = ?").all(userId) as Subscription[];
    if (subs.length === 0) return res.status(409).json({ error: "ยังไม่ได้เปิดการแจ้งเตือนบนอุปกรณ์ใด", code: "NO_SUBSCRIPTION" });
    testing.add(userId);
    const results = await Promise.all(subs.map((s) => sendPush(db, s, keys)));
    const sent = results.filter(Boolean).length;
    if (sent === 0) testing.delete(userId);
    res.json({ sent, devices: subs.length });
  });

  return router;
}
