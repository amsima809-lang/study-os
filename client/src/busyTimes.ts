/**
 * Busy times from her own calendars, for the term preview: when she is already taken (work,
 * family), next to her classes and finals. Read on her device only, kept in memory, never sent to
 * Termtrail's server, never stored; only start and end times, never what the event is.
 *
 * Two sources, one chosen per device (localStorage "studyos.busy"):
 * - "iphone": inside the iPhone app, the phone's calendars through the app's own plugin
 *   (native/ios/App/App/AppCalendar.swift): iCloud, and any Google or work account added on the phone.
 * - "google": in a browser, Google Calendar's free/busy answer (scope calendar.freebusy: busy
 *   periods only), with a short-lived token from Google Identity Services, asked for when she
 *   connects and again (with a tap) after it expires. Nothing of it reaches the server.
 */
import { getJSON, SIGNED_OUT } from "./api.ts";
import { inNativeApp } from "./native.ts";

export type BusySource = "iphone" | "google";
export type BusyBlock = { start: string; end: string };
const KEY = "studyos.busy";

type CalendarPlugin = {
  status(): Promise<{ status: string }>;
  request(): Promise<{ granted: boolean }>;
  busy(o: { from: string; to: string }): Promise<{ blocks: BusyBlock[] }>;
};
const plugin = () => (window as { Capacitor?: { Plugins?: { AppCalendar?: CalendarPlugin } } }).Capacitor?.Plugins?.AppCalendar;

/**
 * The source this device can use: the iPhone's calendars in the app, Google in a browser (when
 * configured). Inside an older iPhone app without the calendar plugin, none: Google's window
 * cannot work inside the app (it needs the app update).
 */
export async function availableSource(): Promise<BusySource | null> {
  if (plugin()) return "iphone";
  if (inNativeApp()) return null;
  const config = await getJSON<{ googleClientId: string | null }>("/api/auth/config").catch(() => null);
  return config?.googleClientId ? "google" : null;
}
export const chosenSource = (): BusySource | null => { try { const v = localStorage.getItem(KEY); return v === "iphone" || v === "google" ? v : null; } catch { return null; } };
/**
 * Busy times belong to the student who connected them: on another sign-in on this device, or a
 * sign-out, the choice and Google's token are forgotten (App.tsx calls this with the signed-in id).
 */
const OWNER = "studyos.busyOwner";
export function setBusyOwner(userId: string): void {
  try {
    const was = localStorage.getItem(OWNER);
    if (was && was !== userId) { token = null; localStorage.removeItem(KEY); }
    localStorage.setItem(OWNER, userId);
  } catch { /* ok */ }
}
window.addEventListener(SIGNED_OUT, () => { token = null; try { localStorage.removeItem(KEY); localStorage.removeItem(OWNER); } catch { /* ok */ } });
const choose = (v: BusySource | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* ok */ } window.dispatchEvent(new Event(CHANGED)); };
export const CHANGED = "studyos:busy-changed";

// ---------- Google (browser) ----------
const SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
type TokenClient = { requestAccessToken(o?: { prompt?: string }): void };
type Gis = { accounts: { oauth2: { initTokenClient(o: { client_id: string; scope: string; callback: (r: { access_token?: string; expires_in?: number; error?: string; scope?: string }) => void; error_callback?: (e: unknown) => void }): TokenClient; hasGrantedAllScopes?(r: unknown, s: string): boolean } } };
let token: { value: string; until: number } | null = null; // memory only: gone with the page

function loadGis(): Promise<Gis> {
  const w = window as { google?: Gis };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google?.accounts?.oauth2 ? resolve(w.google) : reject(new Error("GIS")));
    s.onerror = () => reject(new Error("GIS"));
    document.head.appendChild(s);
  });
}
/**
 * Google's window must open straight from her tap: a browser blocks a pop-up opened after
 * waiting for anything. So the script and the client are got ready beforehand (`prepareGoogle`,
 * called when a screen that may need them opens), and the tap only calls `requestAccessToken`.
 */
let tokenClient: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
export async function prepareGoogle(): Promise<boolean> {
  if (tokenClient) return true;
  const config = await getJSON<{ googleClientId: string | null }>("/api/auth/config").catch(() => null);
  if (!config?.googleClientId) return false;
  const gis = await loadGis().catch(() => null);
  if (!gis) return false;
  tokenClient = gis.accounts.oauth2.initTokenClient({
    client_id: config.googleClientId,
    scope: SCOPE,
    callback: (r) => {
      const p = pending; pending = null;
      // She may untick the permission on Google's screen: then there is no busy-times access.
      if (!r.access_token || (r.scope && !r.scope.includes(SCOPE))) return p?.reject(new Error(r.error ?? "DENIED"));
      token = { value: r.access_token, until: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 };
      p?.resolve(r.access_token);
    },
    error_callback: () => { const p = pending; pending = null; p?.reject(new Error("CLOSED")); },
  });
  return true;
}
/** Ask Google for a busy-times token: call from a tap, after `prepareGoogle` resolved. */
function googleToken(): Promise<string> {
  if (!tokenClient) return Promise.reject(new Error("NOT_READY"));
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient!.requestAccessToken({ prompt: "" });
  });
}
async function googleBusy(from: Date, to: Date): Promise<BusyBlock[]> {
  if (!token || Date.now() > token.until) throw new Error("NEEDS_TAP");
  const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: "Asia/Bangkok", items: [{ id: "primary" }] }),
  });
  if (r.status === 401) { token = null; throw new Error("NEEDS_TAP"); }
  if (!r.ok) throw new Error(`GOOGLE_${r.status}`);
  const body = (await r.json()) as { calendars?: Record<string, { busy?: BusyBlock[]; errors?: unknown[] }> };
  // Google reports a calendar it could not read inside a 200 answer: that is "unknown", not "free".
  if (body.calendars?.primary?.errors?.length || !body.calendars?.primary) throw new Error("GOOGLE_CALENDAR");
  return body.calendars.primary.busy ?? [];
}

// ---------- the one interface the screens use ----------
/** Turn busy times on for this device. Run from a tap (for Google, after `prepareGoogle`). True if it worked. */
export async function connect(source: BusySource): Promise<boolean> {
  if (source === "google") {
    if (inNativeApp()) return false;
    await googleToken(); // first thing: Google's window opens from the tap itself
    choose("google");
    return true;
  }
  if (source === "iphone") {
    const p = plugin();
    if (!p) return false;
    const now = await p.status();
    const ok = now.status === "granted" || (now.status === "notDetermined" && (await p.request()).granted);
    if (ok) choose("iphone");
    return ok;
  }
  return false;
}
/** Turn them off on this device (the iPhone's own permission stays until she changes it in Settings). */
export function disconnect() { token = null; choose(null); }
/** After a token expired: ask Google again (from a tap). */
export const reconnectGoogle = () => googleToken().then(() => { window.dispatchEvent(new Event(CHANGED)); return true; }); // every view asks again

export type BusyResult = { source: BusySource; blocks: BusyBlock[] } | { source: BusySource; needsTap: true } | { source: BusySource; error: true } | null;

/** Her busy times between two Bangkok dates (inclusive), or why there are none. */
export async function busyBetween(fromDate: string, toDate: string): Promise<BusyResult> {
  const source = chosenSource();
  if (!source) return null;
  const from = new Date(`${fromDate}T00:00:00+07:00`), to = new Date(`${toDate}T23:59:59+07:00`);
  try {
    if (source === "iphone") {
      const p = plugin();
      if (!p) return { source, error: true };
      return { source, blocks: (await p.busy({ from: from.toISOString(), to: to.toISOString() })).blocks };
    }
    return { source, blocks: await googleBusy(from, to) };
  } catch (e) {
    return (e as Error).message === "NEEDS_TAP" ? { source, needsTap: true } : { source, error: true };
  }
}

export { blocksByDay } from "./termFit.ts";
