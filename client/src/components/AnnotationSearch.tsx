import { useEffect, useState } from "react";
import { getJSON } from "../api.ts";
import { useT } from "../i18n.tsx";

type Match = { id: number; course_code: string; session_no: number; quote: string; transcription: string };

export function AnnotationSearch({ onOpen }: { onOpen: (code: string, no: number, annotationId: number) => void }) {
  const { lang, t } = useT(),
    th = lang === "th";
  const [available, setAvailable] = useState(false),
    [query, setQuery] = useState("");
  const [hits, setHits] = useState<Match[]>([]),
    [loaded, setLoaded] = useState(""),
    [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        getJSON<{ available: boolean; hits: Match[] }>(
          `/api/lectures/annotation-search?q=${encodeURIComponent(query.trim())}`,
        )
          .then((result) => {
            if (live) {
              setAvailable(result.available);
              setHits(result.hits);
              setLoaded(query);
              setError(false);
            }
          })
          .catch(() => {
            if (live) setError(true);
          });
      },
      query ? 180 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);
  if (!available) return null;
  const label = th ? "ค้นหาโน้ตลายมือทุกการบรรยาย" : "Search pen notes across lectures";
  return (
    <div className="space-y-1 my-2">
      <input
        aria-label={label}
        placeholder={label}
        type="search"
        maxLength={300}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-3 py-2 min-h-11 rounded-lg border text-sm"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      />
      {query.trim() && loaded === query && (
        <ul className="space-y-1">
          {hits.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => onOpen(m.course_code, m.session_no, m.id)}
                className="min-h-11 text-left text-sm w-full"
              >
                <span className="font-semibold" style={{ color: "var(--accent-text)" }}>
                  {m.course_code} · {t("lib.lectureNo", { n: m.session_no })}
                </span>
                <span className="block line-clamp-2">{m.transcription || m.quote}</span>
              </button>
            </li>
          ))}
          {!hits.length && (
            <li className="text-sm" role="status">
              {t("lib.noMatches")}
            </li>
          )}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {t("status.failed")}
        </p>
      )}
    </div>
  );
}
