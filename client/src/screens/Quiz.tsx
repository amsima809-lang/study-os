import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n.tsx";
import {
  getJSON,
  postJSON,
  type NoteListItem,
  type QuizQuestion,
  type AnswerResult,
  type ApiError,
  type Course,
  type Chapter,
} from "../api.ts";
import { Card, ConfirmDialog, ErrorBox, Loading } from "../components/ui.tsx";
import { draftOwner } from "../noteDraft.ts";
import { setUnsaved } from "../unsaved.ts";
import Icon from "../components/Icon.tsx";
import { useSubscription, handleSubscriptionError } from "../components/SubscriptionGate.tsx";

type Phase = "setup" | "loading" | "quiz" | "done";

/**
 * A quiz in progress, kept in this browser so that tapping another tab, a
 * refresh or a locked phone does not throw away the questions (which cost an
 * AI call to make) or the student's place in them. One per student, dropped
 * when the quiz is finished or left, and ignored after a day.
 */
type Progress = { questions: QuizQuestion[]; idx: number; answer: string; result: AnswerResult | null; results: AnswerResult[]; savedAt: number };
const progressKey = () => `studyos.quiz:${draftOwner()}`;
function loadProgress(): Progress | null {
  try {
    const p = JSON.parse(localStorage.getItem(progressKey()) ?? "null") as Progress | null;
    const fresh = p && Array.isArray(p.questions) && p.questions.length > 0 && Date.now() - p.savedAt < 24 * 60 * 60 * 1000;
    return fresh ? p : null;
  } catch {
    return null;
  }
}
function saveProgress(p: Omit<Progress, "savedAt">) {
  try { localStorage.setItem(progressKey(), JSON.stringify({ ...p, savedAt: Date.now() })); } catch { /* storage full or blocked */ }
}
function clearProgress() {
  try { localStorage.removeItem(progressKey()); } catch { /* nothing to remove */ }
}

export default function Quiz() {
  const { t } = useT();
  const [resumed] = useState(loadProgress);
  const [phase, setPhase] = useState<Phase>(resumed ? "quiz" : "setup");
  const [questions, setQuestions] = useState<QuizQuestion[]>(resumed?.questions ?? []);
  const [results, setResults] = useState<AnswerResult[]>([]);

  // While the questions are being written, leaving would throw the request away.
  useEffect(() => {
    setUnsaved("quiz", phase === "loading" ? "leave.quizGenerating" : null);
    return () => setUnsaved("quiz", null);
  }, [phase]);

  function reset() {
    clearProgress();
    setQuestions([]);
    setResults([]);
    setPhase("setup");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("quiz.title")}</h1>

      {(phase === "setup" || phase === "loading") && (
        // Stay mounted while loading so the error message and picked source survive a failed request.
        <div hidden={phase === "loading"}>
          <Setup
            onStart={(qs) => {
              setQuestions(qs);
              setResults([]);
              setPhase("quiz");
            }}
            onLoading={() => setPhase("loading")}
            onError={() => setPhase("setup")}
          />
        </div>
      )}
      {phase === "loading" && <Loading>{t("quiz.generating")}</Loading>}
      {phase === "quiz" && (
        <Runner
          questions={questions}
          resumed={resumed && resumed.questions === questions ? resumed : null}
          onLeave={reset}
          onComplete={(rs) => {
            clearProgress();
            setResults(rs);
            setPhase("done");
          }}
        />
      )}
      {phase === "done" && <Summary questions={questions} results={results} onAgain={reset} />}
    </div>
  );
}

function Setup({
  onStart,
  onLoading,
  onError,
}: {
  onStart: (qs: QuizQuestion[]) => void;
  onLoading: () => void;
  onError: () => void;
}) {
  const { t } = useT();
  const { showPaywall } = useSubscription();
  const [notes, setNotes] = useState<NoteListItem[] | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [mode, setMode] = useState<"note" | "course" | "material">("note");
  const [noteId, setNoteId] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [matCourseCode, setMatCourseCode] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [difficulty, setDifficulty] = useState("0");
  const [qType, setQType] = useState("mixed");
  const [count, setCount] = useState("10");

  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoadFailed(false);
    Promise.all([
      getJSON<{ notes: NoteListItem[] }>("/api/notes"),
      getJSON<{ courses: Course[] }>("/api/courses"),
    ]).then(([n, c]) => {
      setNotes(n.notes);
      setAllCourses(c.courses);
    }).catch(() => setLoadFailed(true));
  }, [attempt]);

  useEffect(() => {
    if (!matCourseCode) { setChapters([]); return; }
    getJSON<{ chapters: Chapter[] }>(`/api/chapters?course_code=${matCourseCode}`)
      .then((d) => setChapters(d.chapters))
      .catch(() => setChapters([]));
  }, [matCourseCode]);

  const courses = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notes ?? []) if (n.course_code) map.set(n.course_code, n.course_name ?? n.course_code);
    return [...map.entries()];
  }, [notes]);

  if (!notes) return <Loading>{t("status.connecting")}</Loading>;

  async function start() {
    setError(null);
    onLoading();
    try {
      if (mode === "material") {
        if (!matCourseCode) { onError(); return; }
        const body: Record<string, unknown> = {
          course_code: matCourseCode,
          type: qType,
          count: Number(count),
        };
        if (chapterId) body.chapter_id = Number(chapterId);
        if (difficulty !== "0") body.difficulty = Number(difficulty);
        const r = await postJSON<{ questions: QuizQuestion[] }>("/api/quiz/generate-from-material", body);
        onStart(r.questions);
      } else {
        const body =
          mode === "note"
            ? { source: "note", note_id: Number(noteId) }
            : { source: "course", course_code: courseCode };
        if (mode === "note" && !noteId) { onError(); return; }
        if (mode === "course" && !courseCode) { onError(); return; }
        const r = await postJSON<{ questions: QuizQuestion[] }>("/api/quiz/generate", body);
        onStart(r.questions);
      }
    } catch (e) {
      const err = e as ApiError;
      if (handleSubscriptionError(err, showPaywall)) { onError(); return; }
      setError(err.error);
      onError();
    }
  }

  const modes = [
    { id: "note" as const, label: t("quiz.byNote") },
    { id: "course" as const, label: t("quiz.byCourse") },
    { id: "material" as const, label: t("quiz.fromMaterial") },
  ];

  const selectStyle = {
    backgroundColor: "var(--bg-surface)",
    borderColor: "var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <Card>
      <div className="space-y-3">
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("quiz.pickSource")}</h2>

        <div className="flex gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className="flex-1 rounded-lg py-2 text-sm font-medium transition-colors min-h-11"
              style={{
                backgroundColor: mode === m.id ? "var(--accent)" : "var(--bg-surface-hover)",
                color: mode === m.id ? "var(--text-inverse)" : "var(--text-tertiary)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "note" && (
          <select aria-label={t("quiz.pickNote")}
            value={noteId}
            onChange={(e) => setNoteId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm min-h-11"
            style={selectStyle}
          >
            <option value="">{t("quiz.selectNote")}</option>
            {(notes ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.title || n.course_name || `#${n.id}`}
              </option>
            ))}
          </select>
        )}

        {mode === "course" && (
          <select aria-label={t("field.course")}
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm min-h-11"
            style={selectStyle}
          >
            <option value="">{t("quiz.selectCourse")}</option>
            {courses.map(([code, name]) => (
              <option key={code} value={code}>
                {code} {name}
              </option>
            ))}
          </select>
        )}

        {mode === "material" && (
          <div className="space-y-2">
            <select aria-label={t("field.course")}
              value={matCourseCode}
              onChange={(e) => { setMatCourseCode(e.target.value); setChapterId(""); }}
              className="w-full rounded-lg border px-3 py-2 text-sm min-h-11"
              style={selectStyle}
            >
              <option value="">{t("quiz.selectCourse")}</option>
              {allCourses.map((c) => (
                <option key={c.code} value={c.code}>{c.code} {c.name_th}</option>
              ))}
            </select>
            {chapters.length > 0 && (
              <select aria-label={t("quiz.pickChapter")}
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm min-h-11"
                style={selectStyle}
              >
                <option value="">{t("quiz.selectChapter")}</option>
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("quiz.difficulty")}</label>
                <select aria-label={t("quiz.difficulty")} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm min-h-11" style={selectStyle}>
                  <option value="0">ทุกระดับ</option>
                  <option value="1">{t("quiz.diff.1")}</option>
                  <option value="2">{t("quiz.diff.2")}</option>
                  <option value="3">{t("quiz.diff.3")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("quiz.format")}</label>
                <select aria-label={t("quiz.format")} value={qType} onChange={(e) => setQType(e.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm min-h-11" style={selectStyle}>
                  <option value="mixed">{t("quiz.format.mixed")}</option>
                  <option value="mcq">{t("quiz.format.mcq")}</option>
                  <option value="short">{t("quiz.format.short")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("quiz.count")}</label>
                <select aria-label={t("quiz.count")} value={count} onChange={(e) => setCount(e.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm min-h-11" style={selectStyle}>
                  {[5, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {loadFailed && <ErrorBox onRetry={() => setAttempt((n) => n + 1)} />}
        {error && <ErrorBox>{error}</ErrorBox>}

        <button
          onClick={start}
          className="w-full font-medium rounded-lg py-2 min-h-11"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
        >
          {t("quiz.start")}
        </button>

        <p className="text-xs text-center" style={{ color: "var(--warning)" }}>{t("quiz.disclaimer")}</p>
      </div>
    </Card>
  );
}

function Runner({
  questions,
  resumed,
  onLeave,
  onComplete,
}: {
  questions: QuizQuestion[];
  /** Where the student was, when this quiz is being picked up again. */
  resumed: Progress | null;
  onLeave: () => void;
  onComplete: (results: AnswerResult[]) => void;
}) {
  const { t } = useT();
  const { showPaywall } = useSubscription();
  const [idx, setIdx] = useState(resumed ? Math.min(resumed.idx, questions.length - 1) : 0);
  const [answer, setAnswer] = useState(resumed?.answer ?? "");
  const [result, setResult] = useState<AnswerResult | null>(resumed?.result ?? null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AnswerResult[]>(resumed?.results ?? []);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Keep the place: every answer typed, every question graded, every step forward.
  useEffect(() => {
    saveProgress({ questions, idx, answer, result, results });
  }, [questions, idx, answer, result, results]);

  const q = questions[idx];
  const answered = result !== null;
  const canSubmit = answer.trim().length > 0 && !answered;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await postJSON<AnswerResult>("/api/quiz/answer", {
        question_id: q.id,
        my_answer: answer,
      });
      setResult(r);
      setResults((prev) => [...prev, r]);
    } catch (e) {
      const err = e as ApiError;
      if (handleSubscriptionError(err, showPaywall)) return;
      setError(err.error);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (idx + 1 >= questions.length) {
      onComplete(results);
    } else {
      setIdx(idx + 1);
      setAnswer("");
      setResult(null);
      setError(null);
    }
  }

  if (busy) return <Loading>{t("quiz.grading")}</Loading>;

  return (
    <Card>
      <div className="space-y-3">
        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {t("quiz.question", { n: idx + 1, total: questions.length })}
          {q.topic ? ` · ${q.topic}` : ""}
        </div>
        <p className="font-medium" style={{ color: "var(--text-primary)" }}>{q.question}</p>

        {q.type === "mcq" ? (
          <div className="space-y-2">
            {q.choices.map((c, i) => (
              <label
                key={i}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${answered ? "opacity-70" : ""}`}
                style={{
                  borderColor: answer === c ? "var(--accent)" : "var(--border)",
                  backgroundColor: answer === c ? "var(--accent-light)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name={`q${q.id}`}
                  value={c}
                  checked={answer === c}
                  disabled={answered}
                  onChange={() => setAnswer(c)}
                />
                {c}
              </label>
            ))}
          </div>
        ) : (
          <label className="block">
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("quiz.yourAnswer")}</span>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={answered}
              rows={3}
              placeholder={t("quiz.answerPlaceholder")}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
            />
          </label>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        {answered && result && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <ScoreBadge score={result.score} />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{result.feedback}</span>
            </div>
            <div className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: "var(--bg-surface-hover)" }}>
              <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>{t("quiz.modelAnswer")}: </span>
              <span style={{ color: "var(--text-primary)" }}>{result.modelAnswer}</span>
            </div>
            {result.explanation && (
              <div className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: "var(--accent-light)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--accent-text)" }}>{t("quiz.explanation")}: </span>
                <span style={{ color: "var(--text-primary)" }}>{result.explanation}</span>
              </div>
            )}
            {result.sourceRef && (
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {t("quiz.source")}:
                {result.sourceRef.chapter_name && ` ${t("quiz.sourceChapter").replace("{name}", result.sourceRef.chapter_name)}`}
                {result.sourceRef.source_page && ` ${t("quiz.sourcePage").replace("{page}", String(result.sourceRef.source_page))}`}
              </div>
            )}
            {result.flashcardCreated && (
              <div className="text-xs" style={{ color: "var(--warning)" }}>{t("quiz.flashcardMade")}</div>
            )}
          </div>
        )}

        {!answered ? (
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full font-medium rounded-lg py-2 disabled:opacity-40 min-h-11"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            {t("quiz.submit")}
          </button>
        ) : (
          <button
            onClick={next}
            className="w-full font-medium rounded-lg py-2 min-h-11"
            style={{ backgroundColor: "var(--text-primary)", color: "var(--text-inverse)" }}
          >
            {idx + 1 >= questions.length ? t("quiz.finish") : t("quiz.next")}
          </button>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("quiz.kept")}</p>
          <button onClick={() => setLeaving(true)} className="shrink-0 px-2 min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("quiz.leave")}
          </button>
        </div>
        {leaving && (
          <ConfirmDialog
            title={t("quiz.leaveTitle")}
            message={t("quiz.leaveMsg", { n: questions.length - results.length })}
            confirmLabel={t("quiz.leave")}
            cancelLabel={t("quiz.stay")}
            onConfirm={onLeave}
            onCancel={() => setLeaving(false)}
          />
        )}
      </div>
    </Card>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const bg = score === 2 ? "var(--success-bg)" : score === 1 ? "var(--warning-bg)" : "var(--danger-bg)";
  const fg = score === 2 ? "var(--success)" : score === 1 ? "var(--warning)" : "var(--danger)";
  return (
    <span className="text-sm font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: bg, color: fg }}>
      {score}/2
    </span>
  );
}

function Summary({
  questions,
  results,
  onAgain,
}: {
  questions: QuizQuestion[];
  results: AnswerResult[];
  onAgain: () => void;
}) {
  const { t } = useT();
  const total = results.reduce((s, r) => s + r.score, 0);
  const max = questions.length * 2;
  const cards = results.filter((r) => r.flashcardCreated).length;

  return (
    <Card>
      <div className="text-center space-y-2 py-4">
        <div style={{ color: "var(--accent-text)" }}><Icon name="trophy" size={40} /></div>
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{t("quiz.doneTitle")}</h2>
        <p className="font-semibold text-lg" style={{ color: "var(--accent-text)" }}>
          {t("quiz.totalScore", { score: total, max })}
        </p>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("quiz.cardsMade", { n: cards })}</p>
        <button
          onClick={onAgain}
          className="mt-3 font-medium rounded-lg py-2 px-6 min-h-11"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
        >
          {t("quiz.again")}
        </button>
      </div>
    </Card>
  );
}
