import { describe, it, expect, beforeEach } from "vitest";
import type session from "express-session";
import { openDb, type DB } from "../src/db.js";
import { SqliteSessionStore } from "../src/sessionStore.js";

const sess = (expires: Date | null, extra: object = {}) =>
  ({ cookie: { expires, originalMaxAge: 1000 }, ...extra }) as unknown as session.SessionData;

const get = (store: SqliteSessionStore, sid: string) =>
  new Promise<session.SessionData | null | undefined>((resolve, reject) =>
    store.get(sid, (err, s) => (err ? reject(err) : resolve(s))),
  );

describe("SqliteSessionStore (sign-ins survive a restart)", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("keeps a session across a new store on the same database", async () => {
    const first = new SqliteSessionStore(db);
    first.set("abc", sess(new Date(Date.now() + 60_000), { passport: { user: "u1" } }));
    // A restart builds a new store; the database is what remains.
    const second = new SqliteSessionStore(db);
    const back = (await get(second, "abc")) as unknown as { passport: { user: string } };
    expect(back.passport.user).toBe("u1");
  });

  it("does not return an expired session, and prunes it", async () => {
    const store = new SqliteSessionStore(db);
    store.set("old", sess(new Date(Date.now() - 1000)));
    expect(await get(store, "old")).toBeNull();
    new SqliteSessionStore(db); // construction prunes
    expect((db.prepare("SELECT COUNT(*) n FROM sessions").get() as { n: number }).n).toBe(0);
  });

  it("destroy signs the session out; touch extends it", async () => {
    const store = new SqliteSessionStore(db);
    store.set("s", sess(new Date(Date.now() + 1000)));
    const later = Date.now() + 3_600_000;
    store.touch("s", sess(new Date(later)));
    expect((db.prepare("SELECT expires FROM sessions WHERE sid = 's'").get() as { expires: number }).expires).toBe(later);
    store.destroy("s");
    expect(await get(store, "s")).toBeNull();
  });

  it("falls back to 30 days when the cookie has no expiry", () => {
    const store = new SqliteSessionStore(db);
    store.set("n", sess(null));
    const { expires } = db.prepare("SELECT expires FROM sessions WHERE sid = 'n'").get() as { expires: number };
    expect(expires).toBeGreaterThan(Date.now() + 29 * 24 * 3_600_000);
  });
});
