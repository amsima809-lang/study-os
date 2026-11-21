/**
 * Where a class is: the app's own campus map, opened on the building with a pin over it, and
 * underneath a button that hands over to Google Maps with the walk already started.
 *
 * Opened from a class's room (RoomLink) on Today and the timetable. Nothing about the student's
 * position is read here: Google Maps finds where she is by itself once she taps the button.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import { BUILDINGS, CAMPUSES } from "../maps/campuses.ts";
import { directionsUrl, positionOf, type CampusId } from "../maps/locate.ts";
import { usePanZoom } from "../maps/panZoom.ts";
import "../maps/maps.css";
import Icon from "./Icon.tsx";

/** Close enough to read the building and its neighbours, on a phone and on a computer. */
const START_ZOOM = 2.4;

export default function RoomMapSheet({ room, campus, code, onClose }: { room: string; campus: CampusId; code: string; onClose: () => void }) {
  const { t } = useT();
  const view = usePanZoom({ min: 1, max: 5, initial: START_ZOOM });
  // Where the pin's tip goes, as fractions of the drawing's width and height: just above the
  // building's code written on it (maps.css lifts it a few pixels more), so the code stays
  // readable under the pin. A building with no code on it: its top edge.
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const name = BUILDINGS[campus].get(code) ?? "";
  const position = positionOf(campus, code);

  // Find the building on the drawing, mark it, and put it in the middle of the view.
  useLayoutEffect(() => {
    const inner = view.content.current;
    const svg = inner?.querySelector("svg");
    const building = inner?.querySelector(`g[data-code="${code}"]`);
    if (!inner || !svg || !building) return;
    building.querySelectorAll(".b").forEach((el) => el.classList.add("is-selected"));
    const s = svg.getBoundingClientRect(), b = building.getBoundingClientRect();
    const label = building.querySelector("text.code")?.getBoundingClientRect();
    const at = { x: ((label ? label.left + label.width / 2 : b.left + b.width / 2) - s.left) / s.width, y: ((label ?? b).top - s.top) / s.height };
    setPin(at);
    view.centreOn(at.x, (b.top + b.height / 2 - s.top) / s.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus, code]);

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
        aria-label={t("map.whereIs", { room })}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-2xl flex flex-col rounded-t-3xl md:rounded-3xl border animate-slide-up overflow-hidden"
        style={{ maxHeight: "94dvh", backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)" }}
      >
        <div className="flex items-start gap-2 px-5 pt-4 pb-3">
          <Icon name="mapPin" size={20} style={{ color: "var(--accent-text)", marginTop: 3 }} />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{room}</h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {code}{name ? ` · ${name}` : ""} · {t(CAMPUSES[campus].label)}
            </p>
          </div>
          <button onClick={onClose} aria-label={t("uni.close")} className="w-11 h-11 -mr-2 -mt-1 shrink-0 flex items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* The campus, moved and zoomed like the Campus map screen (maps/panZoom.ts). */}
        <div className="relative">
          <div ref={view.scroller} className="map-viewport" style={{ height: "58dvh", backgroundColor: "var(--bg-base)" }}>
            <div ref={view.content} className="campus-map relative">
              {/* Our own drawing, bundled with the app (client/src/maps): safe to put in as markup. */}
              <div dangerouslySetInnerHTML={{ __html: CAMPUSES[campus].svg }} />
              {pin && (
                <span
                  aria-hidden="true"
                  className="room-pin"
                  style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                >
                  <svg viewBox="0 0 32 42" width="34" height="44">
                    <path d="M16 41s13-14.2 13-24.4C29 8.5 23.2 2 16 2S3 8.5 3 16.6C3 26.8 16 41 16 41z" fill="var(--accent-2, var(--accent))" stroke="#fff" strokeWidth="2.5" />
                    <circle cx="16" cy="16.5" r="5" fill="#fff" />
                  </svg>
                </span>
              )}
            </div>
          </div>
          <div className="absolute right-2 bottom-2 flex flex-col gap-1.5">
            {([["plus", 1.5, "map.zoomIn"], ["minus", 1 / 1.5, "map.zoomOut"]] as const).map(([icon, factor, label]) => (
              <button
                key={icon}
                onClick={() => view.zoomBy(factor)}
                disabled={factor > 1 ? view.atMax : view.atMin}
                aria-label={t(label)}
                className="w-11 h-11 rounded-full border flex items-center justify-center text-xl font-semibold disabled:opacity-40"
                style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)", boxShadow: "var(--shadow-md, 0 2px 8px rgba(0,0,0,.15))" }}
              >
                {icon === "plus" ? <Icon name="plus" size={18} /> : "−"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-3 border-t" style={{ borderColor: "var(--border-light)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          {position ? (
            <>
              <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>{t("map.startsWalking")}</p>
              <a
                href={directionsUrl(position, { start: true })}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-xl min-h-11 font-semibold inline-flex items-center justify-center gap-1.5"
                style={{ backgroundColor: "var(--accent)", color: "#fff" }}
              >
                <Icon name="mapPin" size={16} />
                {t("map.openGoogle")}
              </a>
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("map.noPosition")}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
