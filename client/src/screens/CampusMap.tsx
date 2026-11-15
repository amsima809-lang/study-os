/**
 * The campus map: Ramkhamhaeng's two campuses, drawn in the app's own colours
 * (client/src/maps/). It shows where the student's classes are this term (a room
 * such as "KTB 201" is in building KTB), names any building that is tapped, gives walking
 * directions to it, and can show roughly where the student is standing.
 * Her position is read only when she asks, is used only in this browser to draw the mark,
 * and is never sent to the server.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type WeekData, type ClassSession } from "../api.ts";
import { myUniversityId } from "../data/universityList.ts";
import { weekdayName, timeRange } from "../format.ts";
import { Card } from "../components/ui.tsx";
import { CourseChip } from "../components/CourseTitle.tsx";
import Icon from "../components/Icon.tsx";
import huamak from "../maps/ru-huamak.svg?raw";
import bangna from "../maps/ru-bangna.svg?raw";
import "../maps/maps.css";
import { onDrawing, placeOf, positionOf, type CampusId } from "../maps/locate.ts";
import { DirectionsButton } from "../components/Directions.tsx";
import { GROUND } from "../maps/places.ts";
import { usePanZoom } from "../maps/panZoom.ts";

const CAMPUSES: Record<CampusId, { svg: string; label: string }> = {
  huamak: { svg: huamak, label: "map.huamak" },
  bangna: { svg: bangna, label: "map.bangna" },
};
/** Every building on a map: its code, and its name where the map carries one. */
function buildingsOf(svg: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of svg.matchAll(/<g id="([A-Z0-9]+)" data-code="\1">(?:<title>([^<]*)<\/title>)?/g)) {
    out.set(m[1], (m[2] ?? "").replace(/^[A-Z0-9]+ · /, "").replace(/&amp;/g, "&"));
  }
  return out;
}
const BUILDINGS: Record<CampusId, Map<string, string>> = { huamak: buildingsOf(huamak), bangna: buildingsOf(bangna) };
/** The drawing's width as a multiple of the box: 1 shows the whole campus across. */
const MIN_ZOOM = 1, MAX_ZOOM = 5;
/** What one press of + or − does. */
const ZOOM_STEP = 1.5;
const GROUND_UNIT: Record<CampusId, number> = { huamak: GROUND.huamak.unit, bangna: GROUND.bangna.unit };

export default function CampusMap() {
  const { t, lang } = useT();
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [campus, setCampus] = useState<CampusId>("huamak");
  const [selected, setSelected] = useState<string | null>(null);
  // On a phone the whole campus at once is too small to read: start zoomed in.
  const view = usePanZoom({ min: MIN_ZOOM, max: MAX_ZOOM, initial: window.innerWidth < 700 ? 1.8 : 1 });
  const holder = view.content;
  // Where she is, once she has asked ("Where am I?"). Kept up to date while this screen is open.
  const [me, setMe] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState<"off" | "asking" | "on" | "failed">("off");
  const watch = useRef<number | null>(null);
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current); }, []);
  const whereAmI = () => {
    if (!navigator.geolocation) return setLocating("failed");
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    setLocating("asking");
    let first = true;
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setMe(here);
        setLocating("on");
        if (first) {
          // Show the campus she is standing on, if it is the other one.
          first = false;
          const on = (["huamak", "bangna"] as CampusId[]).find((c) => onDrawing(c, here.lat, here.lon).inside);
          if (on) { setCampus(on); setSelected((cur) => (cur && !BUILDINGS[on].has(cur) ? null : cur)); }
        }
      },
      () => setLocating((s) => (s === "on" ? s : "failed")),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  };
  const notRu = (() => { const u = myUniversityId(); return u !== null && u !== "ru"; })();

  // Where this term's classes are. Opens on the campus that has most of them.
  useEffect(() => {
    if (notRu) return;
    getJSON<WeekData>("/api/schedule/week")
      .then((d) => {
        setClasses(d.classes);
        const count = { huamak: 0, bangna: 0 };
        for (const c of d.classes) { const p = placeOf(c.room); if (p) count[p.campus]++; }
        if (count.bangna > count.huamak) setCampus("bangna");
      })
      .catch(() => {});
  }, [notRu]);

  const mine = useMemo(() => {
    const by = new Map<string, { campus: CampusId; code: string; classes: ClassSession[] }>();
    for (const c of classes) {
      const p = placeOf(c.room);
      if (!p) continue;
      const k = `${p.campus}:${p.code}`;
      (by.get(k) ?? by.set(k, { ...p, classes: [] }).get(k)!).classes.push(c);
    }
    return [...by.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [classes]);

  // Paint the selection, and mark the buildings she has classes in, on the SVG itself.
  useEffect(() => {
    const root = holder.current;
    if (!root) return;
    root.querySelectorAll(".is-selected, .has-class").forEach((el) => el.classList.remove("is-selected", "has-class"));
    for (const m of mine) if (m.campus === campus) root.querySelectorAll(`g[data-code="${m.code}"] .b`).forEach((el) => el.classList.add("has-class"));
    if (selected) {
      const shapes = root.querySelectorAll(`g[data-code="${selected}"] .b`);
      shapes.forEach((el) => el.classList.add("is-selected"));
      shapes[0]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
    // Not on a zoom: that would pull the view away from where she is zooming.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, campus, mine]);

  // Draw "you are here": a soft disc as wide as the mark is uncertain, with a dot in the middle.
  const spot = me ? onDrawing(campus, me.lat, me.lon, me.accuracy) : null;
  useEffect(() => {
    const svg = holder.current?.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".me")?.remove();
    if (!spot?.inside) return;
    const NS = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "me");
    for (const [cls, r] of [["me-halo", spot.radius], ["me-dot", 9]] as const) {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("class", cls); c.setAttribute("cx", String(spot.x)); c.setAttribute("cy", String(spot.y)); c.setAttribute("r", String(r));
      g.appendChild(c);
    }
    svg.appendChild(g);
    if (locating === "on") g.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot?.x, spot?.y, spot?.radius, spot?.inside, campus]);

  if (notRu) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("map.title")}</h1>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("map.unavailable")}</p>
      </div>
    );
  }

  const pick = (c: CampusId, code: string | null) => { setCampus(c); setSelected(code); };
  const name = selected ? BUILDINGS[campus].get(selected) : null;
  const here = selected ? mine.find((m) => m.campus === campus && m.code === selected)?.classes ?? [] : [];
  const position = selected ? positionOf(campus, selected) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("map.title")}</h1>

      <div className="flex gap-2">
        {(Object.keys(CAMPUSES) as CampusId[]).map((id) => (
          <button
            key={id}
            onClick={() => pick(id, null)}
            aria-pressed={campus === id}
            className="flex-1 rounded-lg py-2 text-sm font-medium transition-colors min-h-11"
            style={{ backgroundColor: campus === id ? "var(--accent)" : "var(--bg-surface-hover)", color: campus === id ? "var(--text-inverse)" : "var(--text-tertiary)" }}
          >
            {t(CAMPUSES[id].label)}
          </button>
        ))}
      </div>

      {/* The buildings she has a class in this term: one tap finds each */}
      {mine.length > 0 && (
        <div>
          <p className="text-sm mb-1.5" style={{ color: "var(--text-secondary)" }}>{t("map.yourClasses")}</p>
          <div className="flex flex-wrap gap-2">
            {mine.map((m) => {
              const on = campus === m.campus && selected === m.code;
              return (
                <button
                  key={`${m.campus}:${m.code}`}
                  onClick={() => pick(m.campus, on ? null : m.code)}
                  aria-pressed={on}
                  className="rounded-full border px-3 min-h-11 text-sm font-semibold"
                  style={{ borderColor: on ? "var(--accent)" : "var(--border)", backgroundColor: on ? "var(--accent)" : "var(--bg-surface)", color: on ? "#fff" : "var(--text-primary)" }}
                >
                  {m.code}
                  <span className="font-normal opacity-75"> · {t(CAMPUSES[m.campus].label)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Card className="relative !p-0 overflow-hidden">
        {/* Mouse: drag to move, wheel to zoom. Touch: two fingers move and pinch; one finger scrolls the page. maps/panZoom.ts */}
        <div ref={view.scroller} className="map-viewport" style={{ maxHeight: "68dvh" }}>
          <div
            ref={holder}
            className="campus-map"
            // Our own drawing, bundled with the app (client/src/maps): safe to put in as markup.
            dangerouslySetInnerHTML={{ __html: CAMPUSES[campus].svg }}
            onClick={(e) => {
              const code = (e.target as Element).closest("g[data-code]")?.getAttribute("data-code") ?? null;
              setSelected((cur) => (code === cur ? null : code));
            }}
          />
        </div>
        <div className="absolute right-2 bottom-2 flex flex-col gap-1.5">
          <button
            onClick={whereAmI}
            aria-label={t("map.whereAmI")}
            title={t("map.whereAmI")}
            aria-pressed={locating === "on"}
            className="w-11 h-11 rounded-full border flex items-center justify-center"
            style={{ backgroundColor: locating === "on" ? "var(--accent)" : "var(--bg-surface)", borderColor: "var(--border)", color: locating === "on" ? "#fff" : "var(--text-primary)", boxShadow: "var(--shadow-md, 0 2px 8px rgba(0,0,0,.15))" }}
          >
            <Icon name="crosshair" size={18} className={locating === "asking" ? "animate-pulse" : ""} />
          </button>
          {([["plus", ZOOM_STEP, "map.zoomIn"], ["minus", 1 / ZOOM_STEP, "map.zoomOut"]] as const).map(([icon, factor, label]) => (
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
      </Card>

      {/* What "Where am I?" found */}
      {locating === "failed" && <p role="status" className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>{t("map.noLocation")}</p>}
      {locating === "on" && spot && (
        <p role="status" className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {spot.inside
            ? t("map.meRough", { m: Math.round(spot.radius * GROUND_UNIT[campus] / 5) * 5 })
            : t("map.notHere", { km: (spot.metresAway / 1000).toFixed(spot.metresAway < 10_000 ? 1 : 0) })}
        </p>
      )}

      {selected ? (
        <Card>
          <div className="flex items-start gap-3">
            <Icon name="mapPin" size={20} style={{ color: "var(--accent-text)", marginTop: 3 }} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {selected}
                {name ? <span className="font-normal" style={{ color: "var(--text-secondary)" }}> · {name}</span> : null}
              </p>
              {position && (
                <DirectionsButton
                  to={position}
                  label={selected ?? ""}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-4 min-h-11 text-sm font-semibold"
                  style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                >
                  <Icon name="mapPin" size={15} />
                  {t("map.directions")}
                </DirectionsButton>
              )}
              {here.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {here.map((c, i) => (
                    <li key={i} className="text-sm" style={{ color: "var(--text-primary)" }}>
                      <CourseChip code={c.course_code} className="mr-1.5" />
                      {lang === "en" && c.name_en ? c.name_en : c.name_th}
                      <span className="block text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                        {weekdayName(c.weekday, lang)} {timeRange(c.start_time, c.end_time)} · {c.room}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("map.tapHint")}</p>
      )}
      {campus === "huamak" && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("map.southUp")}</p>}
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {t("map.osm")}{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="tap-area underline">© OpenStreetMap</a>
      </p>
    </div>
  );
}
