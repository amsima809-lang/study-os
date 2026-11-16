import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getJSON, postJSON, putJSON } from "../api.ts";
import { withBase } from "../base.ts";
import { useT } from "../i18n.tsx";
import { Card, ErrorBox, Loading } from "./ui.tsx";
import { CourseTitle } from "./CourseTitle.tsx";
import Icon from "./Icon.tsx";

const base = "/api/course-mocks";
const primary = "min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-secondary)] disabled:opacity-50";
const quiet = "text-sm text-[var(--text-secondary)]";

type Course = {
  code: string; form_key: string; name_th: string; name_en: string | null; question_count: number; duration_min: number;
  active_attempt_id: number | null; latest_completed_id: number | null;
};
type History = { id: number; course_code: string; form_key: string; score: number; question_count: number; finished_ms: number };
type Catalog = { courses: Course[]; history: History[] };
type Stimulus = { kind: string; title: string; text: string; columns: string[]; rows: string[][] };
type Question = {
  position: number; stem: string; options: string[]; stimulus: Stimulus | null; choice: number | null; flagged: boolean;
  correct_index?: number; explanation?: string; session_no?: number; evidence_ms?: number; evidence_quote?: string; source_url?: string;
};
type Progress = { revision: number; status: "in_progress" | "completed"; server_now_ms: number; deadline_ms: number };
type Attempt = Progress & {
  id: number; course_code: string; form_key: string; current_position: number; questions: Question[]; question_count: number;
  score: number | null; expired: boolean;
};
type Change = { position: number; flagged?: boolean; choice?: number };
const getAttempt = (id: number) => getJSON<Attempt>(base + "/attempts/" + id);

export function CourseMockExams({ history, legacy, onReading }: {
  history: boolean; legacy: ReactNode; onReading: (reading: boolean) => void;
}) {
  const { t, lang } = useT();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [load, setLoad] = useState(0);
  useEffect(() => {
    let live = true;
    getJSON<Catalog>(base + "/catalog?forms=all").then(data => { if (live) setCatalog(data); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [load]);
  const reading = attempt !== null;
  useEffect(() => { onReading(reading); return () => onReading(false); }, [reading, onReading]);

  async function open(course: Course | null, id: number | null) {
    if (busy) return;
    setBusy(true); setError(false);
    try {
      const result = id !== null ? await getAttempt(id) : await postJSON<Attempt>(base + "/start", {
        course_code: course!.code, form_key: course!.form_key, previous_attempt_id: course!.latest_completed_id,
      });
      setAttempt(result);
    } catch { setError(true); } finally { setBusy(false); }
  }
  function reload() { setError(false); setCatalog(null); setLoad(n => n + 1); }
  if (attempt) {
    const course = catalog?.courses.find(c => c.code === attempt.course_code);
    const exit = () => { setAttempt(null); reload(); };
    return attempt.status === "completed"
      ? <PaperReview attempt={attempt} course={course} exit={exit} />
      : <PaperRunner key={attempt.id} initial={attempt} course={course} onFinish={setAttempt} exit={exit} />;
  }
  if (!catalog && !error) return <Loading>{t("status.connecting")}</Loading>;
  if (!catalog || (catalog.courses.length === 0 && catalog.history.length === 0)) return <>
    {error && <ErrorBox onRetry={reload} />}
    {legacy}
  </>;

  if (history && catalog.history.length === 0) return <>{legacy}</>;
  const byCourse = new Map<string, Course[]>();
  for (const form of catalog.courses) {
    const group = byCourse.get(form.code);
    if (group) group.push(form);
    else byCourse.set(form.code, [form]);
  }
  return <div className="space-y-4">
    <h2 className="text-lg font-semibold">{t(history ? "paper.courseHistory" : "paper.fullLength")}</h2>
    {error && <ErrorBox onRetry={reload} />}
    {history ? <div className="space-y-2">{catalog.history.map(item => {
      const course = catalog.courses.find(c => c.code === item.course_code);
      return <Card key={item.id}><div className="flex flex-wrap items-center justify-between gap-2">
        <div><CourseTitle kind="exam" inline code={item.course_code} {...names(course)} />
          <p className={quiet}>{t("paper.form", {form: item.form_key})} · {new Date(item.finished_ms).toLocaleString(lang === "th" ? "th-TH" : "en-GB", {dateStyle: "medium", timeStyle: "short"})} · {item.score}/{item.question_count}</p></div>
        <button className={secondary} disabled={busy} onClick={() => void open(null, item.id)}>{t("paper.review")}</button>
      </div></Card>;
    })}</div> : <>
      <p className={quiet}>{t("paper.sitting")}</p>
      <div className="grid gap-3 sm:grid-cols-2">{Array.from(byCourse.values(), forms => {
        const course = forms[0];
        return <Card key={course.code} className="flex flex-col gap-2">
          <h3 className="font-semibold"><CourseTitle kind="exam" code={course.code} {...names(course)} /></h3>
          <p className={quiet}>{t("paper.format", {n: course.question_count, minutes: course.duration_min})}</p>
          {formatKey(course.code) && <p className={quiet}>{t("paper." + formatKey(course.code))}</p>}
          <ul className="mt-auto divide-y divide-[var(--border-light)]">
            {forms.map(form => {
              const title = t("paper.form", {form: form.form_key});
              const action = t(form.active_attempt_id ? "mock.resume" : form.latest_completed_id ? "paper.samePaper" : "mock.startExam");
              return <li key={form.form_key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm font-semibold">{title}</span>
                <div className="flex flex-wrap gap-2">
                  <button className={primary} disabled={busy} aria-label={action + " · " + title + " · " + course.code}
                    onClick={() => void open(form, form.active_attempt_id)}>{action}</button>
                  {form.latest_completed_id !== null && <button className={secondary} disabled={busy}
                    aria-label={t("paper.review") + " · " + title + " · " + course.code}
                    onClick={() => void open(null, form.latest_completed_id)}>{t("paper.review")}</button>}
                </div>
              </li>;
            })}
          </ul>
        </Card>;
      })}</div>
      <p className="text-xs text-[var(--text-secondary)]">{t("quiz.disclaimer")}</p>
    </>}
    <details className="border-t border-[var(--border)] pt-2"><summary className="min-h-11 cursor-pointer py-3 font-medium">{t(history ? "paper.customHistory" : "paper.custom")}</summary>{legacy}</details>
  </div>;
}

function formatKey(code: string) {
  return ({ACC1101: "accounting", ACC1103: "accounting", MGT3204: "management", RAM1103: "thai", RAM1132: "information"} as Record<string, string>)[code];
}

function names(course?: Course) { return {name_th: course?.name_th, name_en: course?.name_en}; }

function StimulusView({ stimulus }: { stimulus: Stimulus | null }) {
  if (!stimulus) return null;
  const poster = stimulus.kind === "poster";
  const points = stimulus.kind === "grid" && stimulus.columns.length === 3 ? stimulus.rows.map(row => ({
    label: row[0], x: Number(row[1]), y: Number(row[2]),
  })) : [];
  const plot = points.length > 0 && points.every(p => [p.x, p.y].every(v => Number.isInteger(v) && v >= 1 && v <= 9))
    && new Set(points.map(p => p.x + "," + p.y)).size === points.length;
  const posterLines = poster ? stimulus.text.split(/\n+/).map(s => s.trim()).filter(Boolean) : [];
  return <figure className={poster
    ? "mx-auto max-w-md space-y-3 rounded-lg border-2 border-[var(--accent-text)] bg-[var(--accent-light)] p-5 text-center"
    : "space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface-hover)] p-3"}>
    {stimulus.title && <figcaption className={poster ? "text-sm font-medium" : "font-semibold"}>{stimulus.title}</figcaption>}
    {posterLines.length > 0 ? <div className="space-y-3 border-y border-[var(--accent-text)] py-5">
      {posterLines.map((line, i) => <p key={i} className={i === 0 ? "text-xl font-bold" : i === posterLines.length - 1 ? "font-semibold" : ""}>{line}</p>)}
    </div> : stimulus.text && <p className="whitespace-pre-line break-words">{stimulus.text}</p>}
    {plot && <div aria-hidden="true" className="mx-auto max-w-sm py-2 text-sm">
      <p className="mb-1 font-medium">↑ {stimulus.columns[2]}</p>
      <div className="flex"><div className="flex w-5 flex-col justify-between py-1 text-xs"><span>9</span><span>5</span><span>1</span></div>
        <div className="relative grid aspect-square w-full grid-cols-9 grid-rows-9 border border-[var(--border)] bg-[var(--bg-surface)]"
          style={{backgroundImage: "linear-gradient(to right, var(--border-light) 1px, transparent 1px), linear-gradient(to bottom, var(--border-light) 1px, transparent 1px)", backgroundSize: "calc(100% / 9) calc(100% / 9)"}}>
          {points.map(p => <span key={p.label} style={{gridColumn: p.x, gridRow: 10 - p.y}}
            className="m-auto grid min-h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-xs font-semibold text-white">{p.label}</span>)}
        </div></div>
      <div className="ml-5 flex justify-between px-2 text-xs"><span>1</span><span>5</span><span>9</span></div>
      <p className="text-right font-medium">{stimulus.columns[1]} →</p>
    </div>}
    {stimulus.rows.length > 0 && <div className={plot ? "sr-only" : "max-w-full overflow-x-auto"}><table className="w-full border-collapse text-left text-sm" aria-label={stimulus.title}>
      {stimulus.columns.length > 0 && <thead><tr>{stimulus.columns.map((cell, i) => <th className="border border-[var(--border)] p-2" scope="col" key={i}>{cell}</th>)}</tr></thead>}
      <tbody>{stimulus.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className="border border-[var(--border)] p-2" key={j}>{cell}</td>)}</tr>)}</tbody>
    </table></div>}
  </figure>;
}

function clock(seconds: number) {
  const part = (v: number) => String(v).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  return (hours ? hours + ":" : "") + part(Math.floor(seconds % 3600 / 60)) + ":" + part(seconds % 60);
}

function PaperRunner({ initial, course, onFinish, exit }: {
  initial: Attempt; course?: Course; onFinish: (result: Attempt) => void; exit: () => void;
}) {
  const { t } = useT();
  const [paper, setPaper] = useState(initial);
  const [now, setNow] = useState(initial.server_now_ms);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pendingChange, setPendingChange] = useState<Change | null>(null);
  const lock = useRef(false);
  const anchor = useRef({server: initial.server_now_ms, local: Date.now(), monotonic: performance.now()});
  const heading = useRef<HTMLHeadingElement>(null);
  const grid = useRef<HTMLDetailsElement>(null);
  const path = base + "/attempts/" + initial.id;
  const syncTime = useCallback((server: number) => {
    anchor.current = {server, local: Date.now(), monotonic: performance.now()};
    setNow(server);
  }, []);
  const apply = useCallback((fresh: Attempt) => {
    syncTime(fresh.server_now_ms);
    if (fresh.status === "completed") onFinish(fresh);
    else setPaper(fresh);
  }, [syncTime, onFinish]);
  const refresh = useCallback(async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { apply(await getAttempt(initial.id)); setError(false); }
    catch { setError(true); }
    finally { lock.current = false; setBusy(false); }
  }, [initial.id, apply]);
  useEffect(() => {
    const update = () => {
      const a = anchor.current;
      setNow(a.server + Math.max(Date.now() - a.local, performance.now() - a.monotonic));
    };
    const visible = () => { if (!document.hidden) { update(); void refresh(); } };
    const tick = window.setInterval(update, 500);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", refresh);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", refresh); };
  }, [refresh]);
  const seconds = Math.max(0, Math.ceil((paper.deadline_ms - now) / 1000));
  const expired = seconds === 0;
  useEffect(() => {
    if (!expired) return;
    void refresh();
    const retry = window.setInterval(refresh, 5000);
    return () => clearInterval(retry);
  }, [expired, refresh]);

  const question = paper.questions[paper.current_position - 1];
  const shownChoice = pendingChange?.position === question.position && pendingChange.choice !== undefined ? pendingChange.choice : question.choice;
  const answered = paper.questions.filter(q => q.choice !== null).length;
  async function save(position: number, change?: Change) {
    if (lock.current || expired) return;
    lock.current = true; setBusy(true); setError(false); setPendingChange(change ?? null);
    try {
      const ack = await putJSON<Progress>(path + "/progress", {revision: paper.revision, position, changes: change ? [change] : []});
      if (ack.status === "completed") { apply(await getAttempt(initial.id)); return; }
      syncTime(ack.server_now_ms);
      setPaper(prev => ({...prev, ...ack, current_position: position,
        questions: change ? prev.questions.map(q => q.position === change.position ? {...q, ...change} : q) : prev.questions}));
      if (position !== paper.current_position) {
        if (grid.current) grid.current.open = false;
        requestAnimationFrame(() => { heading.current?.focus({preventScroll: true}); heading.current?.scrollIntoView({block: "start"}); });
      }
    } catch {
      try { apply(await getAttempt(initial.id)); } catch { /* Keep the last confirmed state until online. */ }
      setError(true);
    } finally { lock.current = false; setBusy(false); setPendingChange(null); }
  }
  async function finish() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(false);
    try { apply(await postJSON<Attempt>(path + "/finish", {revision: paper.revision})); }
    catch {
      try { apply(await getAttempt(initial.id)); } catch { /* Retry is available below. */ }
      setError(true); setConfirm(false);
    } finally { lock.current = false; setBusy(false); }
  }
  const blocked = busy || expired;
  return <div className="space-y-4">
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
      <div className="text-sm"><CourseTitle kind="exam" inline code={paper.course_code} {...names(course)} className="font-semibold" /> · {t("paper.form", {form: paper.form_key})}</div>
      <div className={'flex items-center gap-2 font-medium ' + (seconds <= 300 ? 'text-[var(--danger)]' : '')}>
        <Icon name="clock" size={17} /><span className="text-xs">{t("mock.timeLeft")}</span>
        <span role="timer" className="font-semibold tabular-nums">{clock(seconds)}</span>
      </div>
    </div>
    {seconds <= 300 && <p role="status" className={quiet}>{t(expired ? "paper.finishing" : "paper.clockWarning")}</p>}
    {error && <ErrorBox onRetry={refresh}>{t("paper.saveError")}</ErrorBox>}
    <Card className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className={quiet}>{t("mock.question", {n: question.position, total: paper.question_count})}{pendingChange && <span className="ml-2">{t("paper.savePending")}</span>}</span>
        <button className={secondary} aria-pressed={question.flagged} disabled={blocked}
          onClick={() => void save(question.position, {position: question.position, flagged: !question.flagged})}>
          {t(question.flagged ? "mock.unflag" : "mock.flag")}
        </button>
      </div>
      <h2 id="paper-question" ref={heading} tabIndex={-1} className="scroll-mt-28 whitespace-pre-line text-lg font-semibold">{question.stem}</h2>
      <StimulusView stimulus={question.stimulus} />
      <fieldset aria-busy={busy} disabled={blocked} aria-labelledby="paper-question" className="space-y-2">{question.options.map((option, i) =>
        <label key={i} className={'flex min-h-11 cursor-pointer items-baseline gap-3 rounded-lg border px-3 py-2 ' +
          (shownChoice === i ? "border-[var(--accent-text)] bg-[var(--accent-light)]" : "border-[var(--border)]")}>
          <input type="radio" name="paper-answer" checked={shownChoice === i} onChange={() => void save(question.position, {position: question.position, choice: i})}/>
          <span>{option}</span>
        </label>)}</fieldset>
      <div className="flex flex-wrap justify-between gap-2">
        <button className={secondary} disabled={blocked || question.position === 1} onClick={() => void save(question.position - 1)}>{t("quiz.previousQuestion")}</button>
        {question.position < paper.question_count && <button className={primary} disabled={blocked} onClick={() => void save(question.position + 1)}>{t("mock.next")}</button>}
      </div>
    </Card>
    <details ref={grid} className="rounded-lg border border-[var(--border)] px-3">
      <summary className="cursor-pointer py-3 text-sm font-medium">{t("mock.grid")} · {t("mock.answered")} {answered}/{paper.question_count}</summary>
      <div className="grid gap-1 pb-3 [grid-template-columns:repeat(auto-fill,minmax(2.8rem,1fr))]">{paper.questions.map(q =>
        <button key={q.position} disabled={blocked} aria-current={q.position === question.position ? "step" : undefined}
          aria-label={[t("paper.jump", {n: q.position}), t(q.choice === null ? "mock.unanswered" : "mock.answered"), q.flagged && t("mock.flagged")].filter(Boolean).join(", ")}
          className={'min-h-11 rounded-md border text-sm tabular-nums ' + (q.choice === null ? "border-[var(--border)]" : "border-[var(--accent-text)] bg-[var(--accent-light)]") + (q.position === question.position ? " font-bold underline" : "")}
          onClick={() => void save(q.position)}>{q.position}{q.flagged && " ⚑"}</button>)}</div>
    </details>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button className={secondary} disabled={busy} onClick={exit}>{t("paper.leave")}</button>
      {!confirm && <button className={primary} disabled={blocked} onClick={() => setConfirm(true)}>{t("mock.submit")}</button>}
    </div>
    {confirm && !expired && <Card><p>{t(answered === paper.question_count ? "mock.confirmSubmitAll" : "mock.confirmSubmit", {n: paper.question_count - answered})}</p>
      <div className="mt-3 flex gap-2"><button className={secondary} disabled={blocked} onClick={() => setConfirm(false)}>{t("mock.cancel")}</button>
        <button className={primary} disabled={blocked} onClick={() => void finish()}>{t("mock.confirm")}</button></div></Card>}
  </div>;
}

function PaperReview({ attempt, course, exit }: {attempt: Attempt; course?: Course; exit: () => void}) {
  const { t } = useT();
  const [review, setReview] = useState(false);
  return <div className="space-y-4">
    <Card className="space-y-2"><CourseTitle kind="exam" code={attempt.course_code} {...names(course)} />
      <p className={quiet}>{t("paper.form", {form: attempt.form_key})}</p>
      <h2 className="text-2xl font-semibold">{t("mock.resultScore", {score: attempt.score ?? 0, max: attempt.question_count})}
        <span className="ml-2 text-base text-[var(--text-secondary)]">{Math.round(100 * (attempt.score ?? 0) / attempt.question_count)}%</span></h2>
      {attempt.expired && <p className={quiet}>{t("paper.expired")}</p>}
      <div className="flex flex-wrap gap-2"><button className={primary} onClick={exit}>{t("paper.leave")}</button>
        <button aria-expanded={review} className={secondary} onClick={() => setReview(!review)}>{t("paper.review")}</button></div>
    </Card>
    {review && <div className="space-y-2">{attempt.questions.map(q => <details key={q.position} className="rounded-lg border border-[var(--border)] px-3">
      <summary className="cursor-pointer py-3"><strong>{q.position}.</strong> {q.stem}</summary>
      <div className="space-y-2 pb-3">
        <StimulusView stimulus={q.stimulus}/>
        <p><strong>{t("quiz.yourAnswer")}</strong> · {q.choice === null ? t("mock.unanswered") : q.options[q.choice]}</p>
        {q.correct_index !== undefined && <p><strong>{t("quiz.correctAnswer")}</strong> · {q.options[q.correct_index]}</p>}
        <p>{q.explanation}</p>
        {q.evidence_quote && <blockquote className="border-l-2 border-[var(--accent-text)] pl-3 text-sm">{q.evidence_quote}</blockquote>}
        {q.session_no !== undefined && q.evidence_ms !== undefined && <a className="inline-flex min-h-11 items-center text-sm text-[var(--accent-text)] underline"
          href={withBase(`/?view=lectures&transcript=${attempt.course_code}-${q.session_no}&at=${q.evidence_ms}`)} target="_blank" rel="noreferrer">
          {t("paper.source", {n: q.session_no, time: clock(Math.floor(q.evidence_ms / 1000))})}</a>}
      </div>
    </details>)}<p className={quiet}>{t("quiz.disclaimer")}</p></div>}
  </div>;
}
