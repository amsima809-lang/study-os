/**
 * Settings → Calendars: her term in her own calendar apps.
 *
 * The feed (server/src/calendarFeed.ts): a private address Google Calendar or the iPhone's
 * Calendar subscribes to. It holds her classes, finals, e-Testing registration days and her
 * e-Testing bookings, and updates itself. Anyone with the address can read it, so she can reset
 * it (the old one stops at once) or turn it off.
 * - iPhone / iPad / Mac: a webcal:// link opens the Calendar app's own "subscribe" prompt.
 * - Google Calendar: subscribing works from a computer's browser (Google: "You can't subscribe to
 *   a calendar in the Google Calendar app for Android, iPhone, or iPad"), so the link opens Google
 *   Calendar's add-by-address page there; the address can also be copied.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import { deleteJSON, getJSON, postJSON } from "../api.ts";
import { ConfirmDialog } from "./ui.tsx";
import Icon from "./Icon.tsx";
import { availableSource, chosenSource, connect, disconnect, prepareGoogle, CHANGED, type BusySource } from "../busyTimes.ts";

/**
 * Busy times from her own calendars (busyTimes.ts): on this device only, start and end times only.
 * In the iPhone app: the phone's calendars. In a browser: Google Calendar.
 */
function BusySettings() {
  const { t } = useT();
  const [available, setAvailable] = useState<BusySource | null | undefined>(undefined);
  const [chosen, setChosen] = useState<BusySource | null>(chosenSource());
  const [state, setState] = useState<"" | "busy" | "denied" | "failed">("");
  useEffect(() => { availableSource().then((s) => { setAvailable(s); if (s === "google") void prepareGoogle(); }); }, []);
  useEffect(() => { const on = () => setChosen(chosenSource()); window.addEventListener(CHANGED, on); return () => window.removeEventListener(CHANGED, on); }, []);
  if (available === undefined) return null;
  const button = "inline-flex items-center justify-center gap-1.5 rounded-xl min-h-11 px-4 text-sm font-semibold";
  async function turnOn(source: BusySource) {
    setState("busy");
    try { setState((await connect(source)) ? "" : "denied"); } catch { setState("failed"); }
  }
  return (
    <div className="space-y-2 pt-3 border-t" style={{ borderColor: "var(--border-light)" }}>
      <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{t("busy.title")}</h3>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("busy.what")}</p>
      {!available ? (
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("busy.unavailable")}</p>
      ) : chosen ? (
        <>
          <p className="text-sm font-medium" style={{ color: "var(--success)" }}>{t(chosen === "iphone" ? "busy.onIphone" : "busy.onGoogle")}</p>
          <button onClick={() => disconnect()} className="tap-area text-sm" style={{ color: "var(--text-tertiary)" }}>{t("busy.turnOff")}</button>
          {chosen === "iphone" && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("busy.iphoneRevoke")}</p>}
        </>
      ) : (
        <button onClick={() => turnOn(available)} disabled={state === "busy"} className={button} style={{ backgroundColor: "var(--accent)", color: "#fff" }}>
          <Icon name="calendarRange" size={16} /> {t(available === "iphone" ? "busy.connectIphone" : "busy.connectGoogle")}
        </button>
      )}
      {state === "denied" && <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{t(available === "iphone" ? "busy.deniedIphone" : "busy.failed")}</p>}
      {state === "failed" && <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{t("busy.failed")}</p>}
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("busy.privacy")}</p>
    </div>
  );
}

export default function CalendarLinks() {
  const { t } = useT();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "off" | null>(null);
  const [error, setError] = useState(false);
  // A failed check is an error with a retry, never "off": "Turn on" must not be offered over a working link.
  const [loadFailed, setLoadFailed] = useState(false);
  const load = () => { setLoadFailed(false); getJSON<{ url: string | null }>("/api/calendar-feed").then((r) => setUrl(r.url)).catch(() => setLoadFailed(true)); };
  useEffect(load, []);

  async function run(f: () => Promise<{ url: string | null }>) {
    setBusy(true); setError(false);
    try { setUrl((await f()).url); } catch { setError(true); } finally { setBusy(false); setConfirm(null); }
  }
  const webcal = url ? url.replace(/^https?:\/\//, "webcal://") : "";
  const google = url ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` : "";
  const button = "inline-flex items-center justify-center gap-1.5 rounded-xl min-h-11 px-4 text-sm font-semibold";

  return (
    <section className="rounded-2xl border px-4 py-4 space-y-3" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)", boxShadow: "var(--shadow-sm)" }}>
      <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("feed.title")}</h2>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("feed.what")}</p>
      {loadFailed ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{t("status.error")}</p>
          <button onClick={load} className="tap-area text-sm font-semibold" style={{ color: "var(--accent-text)" }}>{t("feed.retry")}</button>
        </div>
      ) : url === undefined ? null : !url ? (
        <button onClick={() => run(() => postJSON("/api/calendar-feed", {}))} disabled={busy} className={button} style={{ backgroundColor: "var(--accent)", color: "#fff" }}>
          <Icon name="calendarRange" size={16} /> {t("feed.turnOn")}
        </button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <a href={webcal} className={button} style={{ backgroundColor: "var(--accent)", color: "#fff" }}>{t("feed.addApple")}</a>
            <a href={google} target="_blank" rel="noopener noreferrer" className={`${button} border`} style={{ borderColor: "var(--accent-text)", color: "var(--accent-text)" }}>{t("feed.addGoogle")}</a>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("feed.googleHint")}</p>
          <div className="flex gap-2">
            <input readOnly value={url} aria-label={t("feed.address")} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 rounded-xl border px-3 min-h-11 text-xs" style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
            <button
              onClick={() => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
              className={`${button} border shrink-0`} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              {t(copied ? "feed.copied" : "feed.copy")}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("feed.private")}</p>
          <div className="flex gap-4">
            <button onClick={() => setConfirm("reset")} disabled={busy} className="tap-area text-sm" style={{ color: "var(--accent-text)" }}>{t("feed.reset")}</button>
            <button onClick={() => setConfirm("off")} disabled={busy} className="tap-area text-sm" style={{ color: "var(--text-tertiary)" }}>{t("feed.turnOff")}</button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{t("status.error")}</p>}
      <BusySettings />
      {confirm && createPortal(
        <ConfirmDialog
          title={t(confirm === "reset" ? "feed.resetTitle" : "feed.offTitle")}
          message={t(confirm === "reset" ? "feed.resetBody" : "feed.offBody")}
          confirmLabel={t(confirm === "reset" ? "feed.reset" : "feed.turnOff")}
          cancelLabel={t("et.cancel")}
          busy={busy}
          onConfirm={() => run(() => (confirm === "reset" ? postJSON("/api/calendar-feed/reset", {}) : deleteJSON("/api/calendar-feed")))}
          onCancel={() => setConfirm(null)}
        />,
        document.body,
      )}
    </section>
  );
}
