import { useEffect, useRef, useState } from "react";
import { getJSON, postJSON } from "../api.ts";
import { useT } from "../i18n.tsx";
import { draftOwner } from "../noteDraft.ts";
import { Card, ErrorBox, Loading } from "./ui.tsx";

const api = "/api/lecture-quizzes";
const primary = "min-h-11 rounded-lg bg-[var(--accent)] px-4 font-semibold text-white disabled:opacity-50";
const secondary = "min-h-11 rounded-lg px-3 font-medium text-[var(--accent-text)] disabled:opacity-50";
const select = "mt-1 block min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]";
const subtle = "text-sm text-[var(--text-secondary)]";

type Slot = {
  slot: number; attempt_id: number | null; status: "new" | "in_progress" | "completed"; score: number | null;
  stats: { quizzes_taken: number; correct_questions: number; incorrect_questions: number; total_questions: number };
};
type Course = {
  code: string; name_th: string; name_en: string | null; pool_size: number;
  course_quiz: Slot; lectures: { no: number; quizzes: Slot[] }[];
};
type Question = {
  id: number; stem: string; options: string[]; session_no: number;
  choice?: number; correct_index?: number; explanation?: string; evidence_ms?: number; evidence_quote?: string;
};
type Attempt = {
  id: number; course_code: string; session_no: number | null; slot: number;
  status: "in_progress" | "completed"; score: number | null; questions: Question[];
};

function recentKey() { return `studyos.lectureQuiz.open:${draftOwner()}`; }
function rememberOpen(id: number | null) {
  try {
    if (id === null) sessionStorage.removeItem(recentKey());
    else sessionStorage.setItem(recentKey(), String(id));
  } catch { /* The catalog also offers resume and review. */ }
}

export default function LectureQuizzes({ onTaking, onEmpty }: { onTaking: (taking: boolean) => void; onEmpty: () => void }) {
  const { t, lang } = useT();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [failed, setFailed] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  // The first lecture is preselected. "course" selects the course-wide question pool.
  const [scope, setScope] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    getJSON<{ courses: Course[] }>(api + "/catalog").then(data => {
      if (active) {
        setCourses(data.courses);
        if (data.courses.length === 0) onEmpty();
      }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [refresh, onEmpty]);

  useEffect(() => {
    let active = true;
    let id = 0;
    try { id = Number(sessionStorage.getItem(recentKey())); } catch { /* optional */ }
    if (id > 0) {
      setBusy(true);
      getJSON<Attempt>(`${api}/attempts/${id}`).then(restored => {
        if (!active) return;
        setCourseCode(restored.course_code);
        setScope(String(restored.session_no ?? "course"));
        setAttempt(restored);
      }).catch(() => { if (active) rememberOpen(null); })
        .finally(() => { if (active) setBusy(false); });
    }
    return () => { active = false; };
  }, []);
  useEffect(() => { onTaking(attempt !== null); }, [attempt, onTaking]);

  const course = courses?.find(c => c.code === courseCode) ?? courses?.[0];
  const lecture = scope === "course" ? undefined : course?.lectures.find(l => String(l.no) === scope) ?? course?.lectures[0];
  const scopeTitle = (no: number | null) => no === null ? t("quiz.wholeCourse") : t("quiz.lectureN", { n: no });
  const setTitle = (no: number | null, slot: number) => no === null ? t("quiz.wholeCourse") : t("quiz.setN", { n: slot });

  async function open(code: string, no: number | null, slot: number, id: number | null, retake = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setActionFailed(false);
    try {
      const next = id !== null && !retake
        ? await getJSON<Attempt>(`${api}/attempts/${id}`)
        : await postJSON<Attempt>(api + "/start", { course_code: code, session_no: no, slot, previous_attempt_id: id });
      rememberOpen(next.id); setAttempt(next);
    } catch { setActionFailed(true); setRefresh(n => n + 1); }
    finally { lock.current = false; setBusy(false); }
  }

  function back() {
    rememberOpen(null); setAttempt(null); setActionFailed(false);
    setCourses(null); setFailed(false);
    setRefresh(n => n + 1);
  }

  if (attempt) {
    const title = [attempt.course_code, scopeTitle(attempt.session_no),
      ...(attempt.session_no === null ? [] : [setTitle(attempt.session_no, attempt.slot)])].join(" · ");
    return <div className="space-y-3">
      <button type="button" className={secondary} disabled={busy} onClick={back}>← {t("quiz.backToSets")}</button>
      {attempt.status === "in_progress"
        ? <AttemptForm key={attempt.id} attempt={attempt} title={title} busy={busy} onBusy={setBusy} onGraded={setAttempt}/>
        : <Results key={attempt.id} attempt={attempt} title={title} busy={busy}
            onRetake={() => void open(attempt.course_code, attempt.session_no, attempt.slot, attempt.id, true)}/>}
      {actionFailed && <ErrorBox/>}
    </div>;
  }

  if (failed) return <ErrorBox onRetry={() => setRefresh(n => n + 1)}/>;
  if (!courses) return <Loading>{t("status.connecting")}</Loading>;
  if (!course) return <Card><p className={subtle}>{t("quiz.noLectureSets")}</p></Card>;

  const no = lecture?.no ?? null;
  const slots = lecture?.quizzes ?? [course.course_quiz];
  return <Card><div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="lecture-quiz-course" className={subtle}>{t("field.course")}</label>
        <select id="lecture-quiz-course" value={course.code} className={select} disabled={busy} onChange={e => {
          setCourseCode(e.target.value); setScope(""); setActionFailed(false);
        }}>
          {courses.map(c => <option key={c.code} value={c.code}>{c.code} · {lang === "en" ? c.name_en || c.name_th : c.name_th}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="lecture-quiz-scope" className={subtle}>{t("quiz.chooseScope")}</label>
        <select id="lecture-quiz-scope" value={no ?? "course"} className={select} disabled={busy}
          onChange={e => { setScope(e.target.value); setActionFailed(false); }}>
          {course.lectures.map(l => <option key={l.no} value={l.no}>{scopeTitle(l.no)}</option>)}
          <option value="course">{t("quiz.wholeCourse")}</option>
        </select>
      </div>
    </div>
    <p className={subtle}>{t(lecture ? "quiz.lectureSets" : "quiz.courseCount")}</p>
    <ul className="divide-y divide-[var(--border-light)]">
      {slots.map(s => {
        const title = setTitle(no, s.slot);
        const action = t(s.status === "in_progress" ? "quiz.resume" : "quiz.begin");
        const metrics = [
          [t("quiz.quizzesTaken"), s.stats.quizzes_taken],
          [t("quiz.questionsCorrect"), t("quiz.correctOfPool", { n: s.stats.correct_questions, total: s.stats.total_questions })],
          [t("quiz.stillIncorrect"), s.stats.incorrect_questions],
        ] as const;
        return <li key={s.slot} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <h2 className="font-semibold">{title}</h2>
            <dl className="mt-2 grid grid-cols-3 gap-x-3">
              {metrics.map(([label, value]) => <div key={label} className="flex min-w-0 flex-col">
                <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
                <dd className="order-first text-base font-semibold tabular-nums">{value}</dd>
              </div>)}
            </dl>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-0">
            <button type="button" className={primary} disabled={busy} aria-label={`${action} · ${title}`}
              onClick={() => void open(course.code, no, s.slot, s.attempt_id, s.status === "completed")}>{action}</button>
            {s.status === "completed" && <button type="button" disabled={busy} className={secondary}
              aria-label={`${t("quiz.review")} · ${title}`} onClick={() => void open(course.code, no, s.slot, s.attempt_id)}>
              {t("quiz.review")}{s.score !== null && <span className="ml-1 text-xs">({s.score}/{lecture ? 5 : 25})</span>}
            </button>}
          </div>
        </li>;
      })}
    </ul>
    {actionFailed && <ErrorBox/>}
    <p className="text-xs text-[var(--text-secondary)]">{t("quiz.disclaimer")}</p>
  </div></Card>;
}

function draftKey(id: number) { return `studyos.lectureQuiz.answers:${draftOwner()}:${id}`; }

function loadChoices(attempt: Attempt): Record<number, number> {
  const choices: Record<number, number> = {};
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(attempt.id)) ?? "{}");
    for (const q of attempt.questions) {
      const choice = saved?.[q.id];
      if (Number.isInteger(choice) && choice >= 0 && choice < q.options.length) choices[q.id] = choice;
    }
  } catch { /* start with an unanswered sheet */ }
  return choices;
}

function AttemptForm({ attempt, title, busy, onBusy, onGraded }: {
  attempt: Attempt; title: string; busy: boolean; onBusy: (busy: boolean) => void; onGraded: (graded: Attempt) => void;
}) {
  const { t } = useT();
  const [choices, setChoices] = useState(() => loadChoices(attempt));
  const [index, setIndex] = useState(() => {
    const first = attempt.questions.findIndex(q => choices[q.id] === undefined);
    return first < 0 ? attempt.questions.length - 1 : first;
  });
  const [failed, setFailed] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const question = attempt.questions[index];
  const final = index === attempt.questions.length - 1;
  useEffect(() => { heading.current?.focus(); }, [index]);
  function choose(value: number) {
    const next = { ...choices, [question.id]: value };
    setChoices(next); setFailed(false);
    try { localStorage.setItem(draftKey(attempt.id), JSON.stringify(next)); setDraftFailed(false); }
    catch { setDraftFailed(true); }
  }

  async function submit() {
    if (lock.current) return;
    const missing = attempt.questions.findIndex(q => choices[q.id] === undefined);
    if (missing !== -1) { setIndex(missing); return; }
    lock.current = true; onBusy(true); setFailed(false);
    const path = `${api}/attempts/${attempt.id}`;
    try {
      const answers = attempt.questions.map(q => ({ question_id: q.id, choice: choices[q.id] }));
      // Another tab may already have submitted it, or the response may have been lost.
      const graded = await postJSON<Attempt>(path + "/submit", { answers }).catch(() => getJSON<Attempt>(path));
      if (graded.status !== "completed") { setFailed(true); return; }
      try { localStorage.removeItem(draftKey(attempt.id)); } catch { /* optional */ }
      onGraded(graded);
    } catch { setFailed(true); }
    finally { lock.current = false; onBusy(false); }
  }

  return <Card><div className="space-y-4">
    <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
      <span>{title}</span><span>{t("quiz.question", { n: index + 1, total: attempt.questions.length })}</span>
    </div>
    <fieldset disabled={busy} className="min-w-0 space-y-2" aria-labelledby="lecture-question">
      <h2 id="lecture-question" ref={heading} tabIndex={-1} className="mb-3 text-lg font-semibold">{question.stem}</h2>
      {question.options.map((option, i) => <label key={question.id + "/" + i}
        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: choices[question.id] === i ? "var(--accent)" : "var(--border)",
          backgroundColor: choices[question.id] === i ? "var(--accent-light)" : undefined }}>
        <input type="radio" name={`lecture-q-${question.id}`} checked={choices[question.id] === i} onChange={() => choose(i)}/>
        <span>{option}</span>
      </label>)}
    </fieldset>
    {failed && <ErrorBox/>}
    {draftFailed && <p role="alert" className={subtle}>{t("quiz.draftUnavailable")}</p>}
    <div className="flex items-center justify-between gap-3">
      <button type="button" className={secondary} disabled={index === 0 || busy}
        onClick={() => setIndex(i => i - 1)}>{t("quiz.previousQuestion")}</button>
      <button type="button" className={primary} disabled={choices[question.id] === undefined || busy}
        onClick={() => final ? void submit() : setIndex(i => i + 1)}>{t(final ? "quiz.gradeQuiz" : "quiz.next")}</button>
    </div>
  </div></Card>;
}

function Results({ attempt, title, busy, onRetake }: { attempt: Attempt; title: string; busy: boolean; onRetake: () => void }) {
  const { t } = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <div className="space-y-4">
    <Card><div className="space-y-3">
      <p className={subtle}>{title}</p>
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">{t("quiz.scoreOf", { score: attempt.score ?? 0, total: attempt.questions.length })}</h2>
      <p className={subtle}>{t("quiz.retakeHint")}</p>
      <button type="button" disabled={busy} className={primary} onClick={onRetake}>{t("quiz.retake")}</button>
    </div></Card>
    <Card><h2 className="mb-2 font-semibold">{t("quiz.review")}</h2>
      {attempt.questions.map((q, i) => {
        const correct = q.choice === q.correct_index;
        const seconds = Math.floor((q.evidence_ms ?? 0) / 1000);
        const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        return <details key={q.id} open={!correct} className="border-t border-[var(--border-light)]">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
            <span className="mr-2" style={{ color: correct ? "var(--success)" : "var(--danger)" }}>{t(correct ? "quiz.correct" : "quiz.missed")}</span>
            {i + 1}. {q.stem}
          </summary>
          <div className="mb-4 space-y-2 text-sm">
            {!correct && q.choice !== undefined && <p><strong>{t("quiz.yourAnswer")}</strong> · {q.options[q.choice]}</p>}
            {q.correct_index !== undefined && <p><strong>{t("quiz.correctAnswer")}</strong> · {q.options[q.correct_index]}</p>}
            {q.explanation && <p>{q.explanation}</p>}
            {q.evidence_quote && <blockquote className="border-l-2 border-[var(--border)] pl-3 text-[var(--text-secondary)]">
              <p>{q.evidence_quote}</p><footer className="mt-1 text-xs">{t("quiz.lectureN", { n: q.session_no })}{q.evidence_ms != null && ` · ${time}`}</footer>
            </blockquote>}
          </div>
        </details>;
      })}
    </Card>
  </div>;
}
