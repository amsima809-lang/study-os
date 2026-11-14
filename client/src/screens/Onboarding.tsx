import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, putJSON } from "../api.ts";
import Icon from "../components/Icon.tsx";
import { UNIVERSITIES } from "../data/universities.ts";
import { useUniversity } from "../components/UniversityPicker.tsx";

// Only this university has a course catalogue (faculties, programs, schedules).
const CATALOG_UNIVERSITY = "ru";

type Faculty = { id: string; code: string; name_th: string; name_en: string | null };
type Program = {
  id: string;
  faculty_id: string;
  code: string;
  name_th: string;
  name_en: string | null;
  degree: string;
  total_credits: number;
};

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { t, lang } = useT();
  const [loginUni, rememberUni] = useUniversity();
  const [universityId, setUniversityId] = useState(loginUni?.id ?? "");
  const hasCatalog = universityId === CATALOG_UNIVERSITY;
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [programId, setProgramId] = useState("");
  const [entryYear, setEntryYear] = useState("");
  const [entryTerm, setEntryTerm] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getJSON<Faculty[]>("/api/catalog/faculties").then((f) => {
      setFaculties(f);
      if (f.length === 1) setFacultyId(f[0].id); // only one faculty so far
    });
  }, []);

  useEffect(() => {
    if (!facultyId) {
      setPrograms([]);
      setProgramId("");
      return;
    }
    getJSON<Program[]>(`/api/catalog/programs?faculty_id=${facultyId}`).then((p) => {
      setPrograms(p);
      setProgramId("");
    });
  }, [facultyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!universityId || (hasCatalog && (!facultyId || !programId))) return;
    setBusy(true);
    await putJSON("/api/profile", {
      university_id: universityId,
      faculty_id: hasCatalog ? facultyId : undefined,
      program_id: hasCatalog ? programId : undefined,
      entry_year: entryYear || undefined,
      entry_term: entryTerm,
    });
    rememberUni(universityId);
    onDone();
  }

  const universities = [...UNIVERSITIES].sort((a, b) =>
    lang === "th" ? a.nameTh.localeCompare(b.nameTh, "th") : a.nameEn.localeCompare(b.nameEn, "en"),
  );
  const name = (f: Faculty | Program) => (lang === "en" && f.name_en ? f.name_en : f.name_th);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ backgroundColor: "var(--bg-base)" }}>
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-block mb-3" style={{ color: "var(--accent-text)" }}>
            <Icon name="graduationCap" size={48} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            {t("onboard.title")}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {t("onboard.subtitle")}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {/* University */}
          <div>
            <label htmlFor="ob-university" className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              {t("onboard.university")}
            </label>
            <select id="ob-university"
              value={universityId}
              onChange={(e) => setUniversityId(e.target.value)}
              required
              className="w-full rounded-xl border px-4 py-3 text-sm appearance-none min-h-11"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-light)",
                color: "var(--text-primary)",
              }}
            >
              <option value="">{t("onboard.select_university")}</option>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>{lang === "th" ? u.nameTh : u.nameEn}</option>
              ))}
            </select>
            {universityId && !hasCatalog && (
              <p className="text-sm mt-2 rounded-xl px-3 py-2" style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)" }}>
                {t("onboard.no_catalog")}
              </p>
            )}
          </div>

          {hasCatalog && (<>
          {/* Faculty */}
          <div>
            <label htmlFor="ob-faculty" className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              {t("onboard.faculty")}
            </label>
            <select id="ob-faculty"
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              required
              className="w-full rounded-xl border px-4 py-3 text-sm appearance-none min-h-11"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-light)",
                color: "var(--text-primary)",
              }}
            >
              <option value="">{t("onboard.select_faculty")}</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>{name(f)}</option>
              ))}
            </select>
          </div>

          {/* Program */}
          <div>
            <label htmlFor="ob-program" className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              {t("onboard.program")}
            </label>
            <select id="ob-program"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              required
              disabled={!facultyId}
              className="w-full rounded-xl border px-4 py-3 text-sm appearance-none disabled:opacity-40 min-h-11"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-light)",
                color: "var(--text-primary)",
              }}
            >
              <option value="">{t("onboard.select_program")}</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {name(p)} ({p.degree}, {p.total_credits} {lang === "th" ? "หน่วยกิต" : "credits"})
                </option>
              ))}
            </select>
          </div>

          </>)}

          {/* Entry year + term */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="ob-year" className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                {t("onboard.entry_year")}
              </label>
              <input id="ob-year"
                type="text"
                value={entryYear}
                onChange={(e) => setEntryYear(e.target.value)}
                placeholder={lang === "th" ? "เช่น 2569" : "e.g. 2569"}
                inputMode="numeric"
                maxLength={4}
                className="w-full rounded-xl border px-4 py-3 text-sm min-h-11"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-light)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
            <div className="w-28">
              <label htmlFor="ob-term" className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                {t("onboard.entry_term")}
              </label>
              <select id="ob-term"
                value={entryTerm}
                onChange={(e) => setEntryTerm(e.target.value)}
                className="w-full rounded-xl border px-4 py-3 text-sm appearance-none min-h-11"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-light)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="1">{lang === "th" ? "เทอม 1" : "Sem 1"}</option>
                <option value="2">{lang === "th" ? "เทอม 2" : "Sem 2"}</option>
                <option value="S">{lang === "th" ? "ซัมเมอร์" : "Summer"}</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !universityId || (hasCatalog && (!facultyId || !programId))}
            className="w-full font-semibold rounded-xl py-3 transition-all active:scale-[0.98] disabled:opacity-40 min-h-11"
            style={{
              backgroundColor: "var(--accent)",
              color: "#fff",
            }}
          >
            {t("onboard.start")}
          </button>
        </form>
      </div>
    </div>
  );
}
