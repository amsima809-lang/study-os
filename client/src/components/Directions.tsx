/**
 * Walking directions to a building.
 *
 * `DirectionsButton` is what every screen uses. When the site has a Google Maps embed key, a tap
 * opens a sheet with a Google map inside the app: the walking route from where the student is to
 * the building, or, if her position cannot be read, the building alone. Without a key (or with
 * JavaScript's click skipped: a long press, "open in new tab") it is a plain link that opens the
 * same directions in Google Maps.
 *
 * Her position is read only when the sheet opens. It goes from her browser to Google, inside the
 * map's address, to draw the route. It is never sent to this app's server and never stored.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import { getJSON } from "../api.ts";
import { directionsUrl, embedUrl, type Place } from "../maps/locate.ts";
import Icon from "./Icon.tsx";

let embedKey: Promise<string | null> | null = null;
/** The site's Google Maps embed key, asked for once. Null when the site has none. */
export function mapsEmbedKey(): Promise<string | null> {
  embedKey ??= getJSON<{ embedKey: string | null }>("/api/maps/config").then(
    (c) => c.embedKey,
    () => { embedKey = null; return null; }, // could not ask: try again next time
  );
  return embedKey;
}

export function DirectionsButton({ to, label, className, style, children }: { to: Place; /** What the directions lead to, for screen readers and the sheet's title: "KTB 301". */ label: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const { t } = useT();
  const [key, setKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { let alive = true; mapsEmbedKey().then((k) => { if (alive) setKey(k); }); return () => { alive = false; }; }, []);
  return (
    <>
      <a
        href={directionsUrl(to)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("map.directionsTo", { room: label })}
        title={t("map.directionsTo", { room: label })}
        aria-haspopup={key ? "dialog" : undefined}
        onClick={(e) => {
          // With a key, an ordinary tap opens the map in the app; anything else is the link.
          if (!key || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          setOpen(true);
        }}
        className={className}
        style={style}
      >
        {children}
      </a>
      {open && key && <DirectionsSheet mapsKey={key} to={to} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function DirectionsSheet({ mapsKey, to, label, onClose }: { mapsKey: string; to: Place; label: string; onClose: () => void }) {
  const { t, lang } = useT();
  // "asking": waiting for her position. Then either the route from it, or just the building.
  const [from, setFrom] = useState<Place | "asking" | null>("asking");
  useEffect(() => {
    if (!navigator.geolocation) { setFrom(null); return; }
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (alive) setFrom({ lat: +pos.coords.latitude.toFixed(5), lon: +pos.coords.longitude.toFixed(5) }); },
      () => { if (alive) setFrom(null); },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
    );
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("map.directionsTitle", { room: label })}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-2xl flex flex-col rounded-t-3xl md:rounded-3xl border animate-slide-up overflow-hidden"
        style={{ maxHeight: "94dvh", backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)" }}
      >
        <div className="flex items-center gap-2 px-5 pt-4 pb-3">
          <Icon name="mapPin" size={20} style={{ color: "var(--accent-text)" }} />
          <h2 className="flex-1 text-lg font-bold" style={{ color: "var(--text-primary)" }}>{t("map.directionsTitle", { room: label })}</h2>
          <button onClick={onClose} aria-label={t("uni.close")} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="relative" style={{ height: "62dvh", backgroundColor: "var(--bg-base)" }}>
          {from === "asking" ? (
            <p role="status" className="absolute inset-0 flex items-center justify-center text-sm animate-pulse" style={{ color: "var(--text-tertiary)" }}>{t("map.finding")}</p>
          ) : (
            <iframe
              key={from ? "route" : "place"}
              title={t("map.directionsTitle", { room: label })}
              src={embedUrl(mapsKey, to, from, lang)}
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
              style={{ border: 0 }}
            />
          )}
        </div>
        <div className="px-5 py-3 border-t" style={{ borderColor: "var(--border-light)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
            {from === null ? t("map.noRoute") : t("map.routeNote")}
          </p>
          <a
            href={directionsUrl(to)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl min-h-11 font-semibold inline-flex items-center justify-center gap-1.5"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            {t("map.openGoogle")}
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
