import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n.tsx";
import { UNIVERSITIES, type University } from "../data/universities.ts";
import { listUniversities, myUniversityId, UNIVERSITY_KEY as STORAGE_KEY } from "../data/universityList.ts";
import Icon from "./Icon.tsx";

/** The university chosen on the login page, remembered in this browser. */
export function useUniversity(): [University | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(myUniversityId);

  function choose(next: string | null) {
    setId(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ok */ }
  }

  const uni = UNIVERSITIES.find((u) => u.id === id) ?? null;
  return [uni, choose];
}

function Swatches({ uni }: { uni: University }) {
  return (
    <span className="flex shrink-0 w-12 -space-x-1.5">
      {uni.swatches.map((s) => (
        <span
          key={s.hex}
          className="w-5 h-5 rounded-full"
          style={{ background: s.hex, border: "1px solid rgba(255,255,255,0.35)" }}
        />
      ))}
    </span>
  );
}

/** Bottom sheet: search and pick a university theme (or go back to the default). */
export default function UniversityPicker({
  current,
  onPick,
  onClose,
}: {
  current: University | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const [query, setQuery] = useState("");
  // The student's own university goes first, in the list and in every search.
  const [mine] = useState(myUniversityId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => listUniversities(lang, mine, query), [query, lang, mine]);
  const own = results[0]?.id === mine ? results[0] : null;
  const others = own ? results.slice(1) : results;

  function pick(id: string | null) {
    onPick(id);
    onClose();
  }

  const rowClass =
    "w-full flex items-center gap-3 text-left rounded-2xl px-3 py-3 transition-colors hover:bg-white/10";

  const row = (u: University) => (
    <button key={u.id} type="button" onClick={() => pick(u.id)} className={rowClass}>
      <Swatches uni={u} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">
          {lang === "th" ? u.nameTh : u.nameEn}
        </span>
        <span className="block text-xs truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
          {u.id === mine ? t("uni.yours") : lang === "th" ? u.nameEn : u.nameTh}
        </span>
      </span>
      {current?.id === u.id && <Icon name="check" size={18} />}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("uni.choose")}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md flex flex-col rounded-t-3xl sm:rounded-3xl border animate-slide-up"
        style={{
          maxHeight: "85dvh",
          background: "rgba(20,20,34,0.96)",
          borderColor: "rgba(255,255,255,0.1)",
          color: "#fff",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold">{t("uni.choose")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("uni.close")}
            className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("uni.search")}
            aria-label={t("uni.search")}
            className="w-full rounded-xl border px-4 py-3 text-base placeholder:text-white/35 min-h-11"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              borderColor: "rgba(255,255,255,0.1)",
              color: "#fff",
            }}
          />
        </div>

        <div className="overflow-y-auto px-2 pb-3">
          {own && row(own)}
          {!query && (
            <button type="button" onClick={() => pick(null)} className={rowClass}>
              <span className="w-12 shrink-0">
                <span
                  className="block w-5 h-5 rounded-full"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #3b82f6)" }}
                />
              </span>
              <span className="flex-1 text-sm font-medium">{t("uni.default")}</span>
              {!current && <Icon name="check" size={18} />}
            </button>
          )}

          {others.map(row)}

          {results.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: "rgba(255,255,255,0.45)" }}>
              {t("uni.none")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
