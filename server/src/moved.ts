/**
 * When the site moves to a new address, the old one keeps working: a request that
 * still arrives at an old address is sent on to the same page at the new one.
 *
 * MOVED_FROM lists the old addresses, separated by commas, for example
 *   MOVED_FROM=https://amsima.com/termtrail,https://www.termtrail.com
 * and APP_URL is the new one. The tunnel (or proxy) must still deliver the old
 * address's requests to this server for it to answer them.
 */
import type { Request, Response, NextFunction } from "express";

export interface OldAddress {
  host: string;
  /** "" for a whole site, or a sub-path such as "/termtrail" (no trailing slash). */
  path: string;
}

export function parseOldAddresses(value: string | undefined): OldAddress[] {
  return (value ?? "")
    .split(",")
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        throw new Error(`MOVED_FROM has something that is not an address: ${text}`);
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`MOVED_FROM has something that is not a web address: ${text}`);
      return { host: url.hostname.toLowerCase(), path: url.pathname.replace(/\/+$/, "") };
    });
}

/**
 * The new address for a request, or null when it did not come to an old one.
 * `url` is the request's path and query as it arrived ("/termtrail/notes?x=1").
 */
export function movedTo(old: OldAddress[], appUrl: string, host: string | undefined, url: string): string | null {
  if (!host || old.length === 0) return null;
  const name = host.toLowerCase().replace(/:\d+$/, "");
  const cut = url.search(/[?#]/);
  const path = cut === -1 ? url : url.slice(0, cut);
  const rest = cut === -1 ? "" : url.slice(cut);
  const home = appUrl.replace(/\/+$/, "");
  for (const o of old) {
    if (o.host !== name) continue;
    if (o.path && path !== o.path && !path.startsWith(`${o.path}/`)) continue;
    const target = `${home}${path.slice(o.path.length) || "/"}${rest}`;
    // An "old" address that is the new one (or inside it) would send the browser round in circles.
    const there = new URL(target);
    if (there.hostname.toLowerCase() === name && (there.pathname === o.path || there.pathname.startsWith(`${o.path}/`))) continue;
    return target;
  }
  return null;
}

export function movedMiddleware(old: OldAddress[], appUrl: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const target = movedTo(old, appUrl, req.hostname, req.originalUrl);
    if (!target) return next();
    // Pages follow as a plain GET; anything else (a form or an API call) keeps its method and body.
    res.redirect(req.method === "GET" || req.method === "HEAD" ? 302 : 307, target);
  };
}
