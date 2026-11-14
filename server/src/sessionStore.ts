/**
 * Sign-in sessions stored in SQLite, so they survive a server restart.
 * (express-session's default keeps them in memory and loses them all.)
 */
import session from "express-session";
import type { DB } from "./db.js";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export class SqliteSessionStore extends session.Store {
  constructor(private db: DB) {
    super();
    this.prune();
    // Clear out expired sessions now and then; never keep the process alive for it.
    setInterval(() => this.prune(), 60 * 60 * 1000).unref();
  }

  private prune(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
  }

  private static expiry(sess: session.SessionData): number {
    const at = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    return Number.isFinite(at) ? at : Date.now() + THIRTY_DAYS;
  }

  get(sid: string, cb: (err: unknown, sess?: session.SessionData | null) => void): void {
    try {
      const row = this.db.prepare("SELECT data, expires FROM sessions WHERE sid = ?").get(sid) as
        { data: string; expires: number } | undefined;
      cb(null, row && row.expires >= Date.now() ? (JSON.parse(row.data) as session.SessionData) : null);
    } catch (err) {
      cb(err);
    }
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
    try {
      this.db
        .prepare(
          `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`,
        )
        .run(sid, JSON.stringify(sess), SqliteSessionStore.expiry(sess));
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    try {
      this.db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  touch(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
    try {
      this.db.prepare("UPDATE sessions SET expires = ? WHERE sid = ?").run(SqliteSessionStore.expiry(sess), sid);
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }
}
