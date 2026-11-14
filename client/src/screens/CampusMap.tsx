/**
 * The campus map: Ramkhamhaeng's two campuses, drawn in the app's own colours
 * (client/src/maps/). It shows where the student's classes are this term (a room
 * such as "KTB 201" is in building KTB), and names any building that is tapped.
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

type CampusId = "huamak" | "bangna";
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
/** "KTB 201" -> { campus: "bangna", code: "KTB" }; a room in no building on either map -> null. */
function placeOf(room: string | null): { campus: CampusId; code: string } | null {
  for (const m of (room ?? "").matchAll(/[A-Z]{2,4}\d?/g)) {
    for (const campus of ["bangna", "huamak"] as CampusId[]) {
      for (const code of [m[0], m[0].replace(/\d$/, "")]) if (BUILDINGS[campus].has(code)) return { campus, code };
    }
  }
  return null;
}
const ZOOMS = [1, 1.8, 2.8];

export default function CampusMap() {
  const { t, lang } = useT();
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [campus, setCampus] = useState<CampusId>("huamak");
  const [selected, setSelected] = useState<string | null>(null);
  // On a phone the whole campus at once is too small to read: start one step in.
  const [zoom, setZoom] = useState(() => (window.innerWidth < 700 ? 1 : 0));
  const holder = useRef<HTMLDivElement>(null);
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
  }, [selected, campus, mine, zoom]);

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
        <div className="overflow-auto" style={{ maxHeight: "68dvh" }}>
          <div
            ref={holder}
            className="campus-map"
            style={{ width: `${ZOOMS[zoom] * 100}%` }}
            // Our own drawing, bundled with the app (client/src/maps): safe to put in as markup.
            dangerouslySetInnerHTML={{ __html: CAMPUSES[campus].svg }}
            onClick={(e) => {
              const code = (e.target as Element).closest("g[data-code]")?.getAttribute("data-code") ?? null;
              setSelected((cur) => (code === cur ? null : code));
            }}
          />
        </div>
        <div className="absolute right-2 bottom-2 flex flex-col gap-1.5">
          {([["plus", 1, "map.zoomIn"], ["minus", -1, "map.zoomOut"]] as const).map(([icon, step, label]) => (
            <button
              key={icon}
              onClick={() => setZoom((z) => Math.max(0, Math.min(ZOOMS.length - 1, z + step)))}
              disabled={step > 0 ? zoom === ZOOMS.length - 1 : zoom === 0}
              aria-label={t(label)}
              className="w-11 h-11 rounded-full border flex items-center justify-center text-xl font-semibold disabled:opacity-40"
              style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)", boxShadow: "var(--shadow-md, 0 2px 8px rgba(0,0,0,.15))" }}
            >
              {icon === "plus" ? <Icon name="plus" size={18} /> : "−"}
            </button>
          ))}
        </div>
      </Card>

      {selected ? (
        <Card>
          <div className="flex items-start gap-3">
            <Icon name="mapPin" size={20} style={{ color: "var(--accent-text)", marginTop: 3 }} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {selected}
                {name ? <span className="font-normal" style={{ color: "var(--text-secondary)" }}> · {name}</span> : null}
              </p>
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
    </div>
  );
}
