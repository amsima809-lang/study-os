import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, putJSON, type ExamsData, type MyExam } from "../api.ts";
import { formatDate, timeRange } from "../format.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";
import { RuLink } from "../components/TermPreview.tsx";
import { RU_LINKS } from "../ruLinks.ts";

const fieldStyle = { backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" };
const daysUntil = (today: string, date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

/**
 * Her room and seat for an exam, copied from her exam timetable in e-Service (published about a
 * week before the finals). A quiet link until then; in the last ten days it says where to look.
 */
function SeatLine({ exam, date, today, onSaved }: { exam: MyExam; date: string; today: string; onSaved: (all: MyExam[]) => void }) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(exam.seat ?? "");
  const [failed, setFailed] = useState(false);
  const soon = daysUntil(today, date) <= 10 && daysUntil(today, date) >= 0;
  const save = () => {
    setFailed(false);
    putJSON<{ exams: MyExam[] }>(`/api/my-exams/${exam.course_code}`, { seat: value.trim() || null })
      .then((r) => { onSaved(r.exams); setEditing(false); })
      .catch(() => setFailed(true));
  };
  if (editing) {
    return (
      <div className="mt-2 space-y-1">
        <div className="flex gap-2">
          <input autoFocus aria-label={t("exam.seat")} value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} placeholder={t("exams.seatPlaceholder")}
            className="flex-1 min-w-0 rounded-lg border px-3 text-sm min-h-11" style={fieldStyle} />
          <button onClick={save} className="px-3 rounded-lg text-sm min-h-11" style={{ backgroundColor: "var(--accent)", color: "#fff" }}>{t("et.save")}</button>
          <button onClick={() => { setEditing(false); setValue(exam.seat ?? ""); }} className="px-2 text-sm min-h-11" style={{ color: "var(--text-tertiary)" }}>{t("et.cancel")}</button>
        </div>
        {failed && <p className="text-xs" style={{ color: "var(--danger)" }}>{t("exams.saveFailed")}</p>}
      </div>
    );
  }
  return (
    <div className="mt-1 text-xs flex flex-wrap items-center gap-x-3">
      {exam.seat ? (
        <>
          <span style={{ color: "var(--text-secondary)" }}>{t("exam.seat")}: {exam.seat}</span>
          <button onClick={() => setEditing(true)} className="tap-area" style={{ color: "var(--accent-text)" }}>{t("et.edit")}</button>
        </>
      ) : (
        <>
          <button onClick={() => setEditing(true)} className="tap-area" style={{ color: soon ? "var(--accent-text)" : "var(--text-tertiary)" }}>+ {t("exams.addSeat")}</button>
          {soon && <RuLink href={RU_LINKS.EXAM_TIMETABLE}>{t("link.examTimetable")}</RuLink>}
        </>
      )}
    </div>
  );
}

/** The date of a faculty-arranged exam, as she found it out from the faculty or the lecturer. */
function OwnDate({ exam, onSaved }: { exam: MyExam; onSaved: (all: MyExam[]) => void }) {
  const { t, lang } = useT();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(exam.own?.date ?? "");
  const [start, setStart] = useState(exam.own?.start ?? "");
  const [end, setEnd] = useState(exam.own?.end ?? "");
  const [failed, setFailed] = useState(false);
  const save = (clear = false) => {
    setFailed(false);
    putJSON<{ exams: MyExam[] }>(`/api/my-exams/${exam.course_code}`, clear ? { exam_date: null } : { exam_date: date || null, start_time: start || null, end_time: end || null })
      .then((r) => { onSaved(r.exams); setEditing(false); })
      .catch(() => setFailed(true));
  };
  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("exams.ownDate")}
            <input autoFocus type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border px-2 text-sm min-h-11" style={fieldStyle} />
          </label>
          <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("exams.ownStart")}
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full rounded-lg border px-2 text-sm min-h-11" style={fieldStyle} />
          </label>
          <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("exams.ownEnd")}
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full rounded-lg border px-2 text-sm min-h-11" style={fieldStyle} />
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={() => save()} disabled={!date || (!!start && !!end && end <= start)} className="px-3 rounded-lg text-sm min-h-11 disabled:opacity-50" style={{ backgroundColor: "var(--accent)", color: "#fff" }}>{t("et.save")}</button>
          {exam.own && <button onClick={() => save(true)} className="px-3 text-sm min-h-11" style={{ color: "var(--danger)" }}>{t("exams.ownClear")}</button>}
          <button onClick={() => setEditing(false)} className="px-2 text-sm min-h-11" style={{ color: "var(--text-tertiary)" }}>{t("et.cancel")}</button>
        </div>
        {!!start && !!end && end <= start && <p className="text-xs" style={{ color: "var(--danger)" }}>{t("rem.endAfterStart")}</p>}
        {failed && <p className="text-xs" style={{ color: "var(--danger)" }}>{t("exams.saveFailed")}</p>}
      </div>
    );
  }
  return exam.own ? (
    <div className="mt-1 text-xs flex flex-wrap items-center gap-x-3">
      <span style={{ color: "var(--text-primary)" }}>
        {formatDate(exam.own.date, lang)}{exam.own.start && exam.own.end ? ` · ${timeRange(exam.own.start, exam.own.end)}` : ""}
      </span>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("exams.ownLabel")}</span>
      <button onClick={() => setEditing(true)} className="tap-area" style={{ color: "var(--accent-text)" }}>{t("et.edit")}</button>
    </div>
  ) : (
    <button onClick={() => setEditing(true)} className="mt-1 text-sm tap-area" style={{ color: "var(--accent-text)" }}>+ {t("exams.ownAdd")}</button>
  );
}

export default function Exams() {
  const { t, lang } = useT();
  const [data, setData] = useState<ExamsData | null>(null);
  const [error, setError] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(false);
    getJSON<ExamsData>("/api/exams").then(setData).catch(() => setError(true));
  }, [attempt]);

  if (error) return <ErrorBox onRetry={() => setAttempt((n) => n + 1)} />;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;
  const mine = new Map((data.mine ?? []).map((m) => [m.course_code, m]));
  // A saved date can change the clashes: read the page again; a seat only changes the one row.
  const saved = (all: MyExam[], reload = false) => { setData({ ...data, mine: all }); if (reload) setAttempt((n) => n + 1); };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("exams.title")}</h1>

      {data.chosen === false ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("exams.chooseFirst")}</p>
      ) : data.clashes.length === 0 ? (
        <div className="rounded-xl text-sm px-4 py-2" style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}>
          {t("exams.noClash")}
        </div>
      ) : (
        <div className="rounded-xl text-sm px-4 py-2 space-y-1" style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}>
          <div className="font-semibold">{t("exams.clash")}</div>
          {data.clashes.map((c, i) => (
            <div key={i}>
              {t("exams.clashDetail", {
                date: formatDate(c.date, lang),
                courses: c.courses.join(", "),
              })}
            </div>
          ))}
        </div>
      )}

      {data.chosen === false || (data.exams.length === 0 && (data.facultyArranged?.length ?? 0) > 0) ? null : data.exams.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("exams.empty")}</p>
      ) : (
        <ul className="wide-grid space-y-2">
          {data.exams.map((e, i) => (
            <Card key={`${e.course_code}-${i}`}>
              <div className="flex justify-between items-start">
                <div>
                  <CourseTitle
                    code={e.course_code}
                    name_th={e.name_th}
                    name_en={e.name_en}
                    className="font-medium text-sm"
                    kind="exam"
                  />
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {formatDate(e.date, lang)}
                    {e.slot ? ` · ${t("exams.slot", { slot: e.slot })}` : ""}
                    {e.start && e.end ? ` · ${timeRange(e.start.slice(11, 16), e.end.slice(11, 16))}` : ""}
                  </div>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap" style={{ color: "var(--accent-text)" }}>
                  {e.daysLeft === 0 ? t("today.examToday") : t("today.daysLeft", { n: e.daysLeft })}
                </span>
              </div>
              {/* A booked e-Test comes first: pass it and this final is not needed. */}
              {mine.get(e.course_code)?.booking && (() => {
                const b = mine.get(e.course_code)!.booking!;
                return (
                  <p className="text-xs mt-1" style={{ color: "var(--mark-exam)" }}>
                    {t("exams.booked", { date: formatDate(b.date, lang), n: b.period, time: timeRange(b.start, b.end) })}
                  </p>
                );
              })()}
              {mine.get(e.course_code) && <SeatLine exam={mine.get(e.course_code)!} date={e.date} today={data.today} onSaved={(all) => saved(all)} />}
            </Card>
          ))}
        </ul>
      )}

      {(data.facultyArranged?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold pt-2" style={{ color: "var(--text-primary)" }}>{t("exams.facultyTitle")}</h2>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("exams.facultyHint")}</p>
          <ul className="wide-grid space-y-2">
            {data.facultyArranged!.map((e) => (
              <Card key={e.course_code}>
                <CourseTitle code={e.course_code} name_th={e.name_th} name_en={e.name_en} className="font-medium text-sm" kind="exam" />
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{e.note}</div>
                {mine.get(e.course_code) && <OwnDate exam={mine.get(e.course_code)!} onSaved={(all) => saved(all, true)} />}
                {mine.get(e.course_code)?.own && <SeatLine exam={mine.get(e.course_code)!} date={mine.get(e.course_code)!.own!.date} today={data.today} onSaved={(all) => saved(all)} />}
              </Card>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
