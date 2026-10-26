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
import { Card, ErrorBox, Loading } from "../components/ui.tsx";

type Phase = "setup" | "loading" | "quiz" | "done";

export default function Quiz() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>("setup");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [results, setResults] = useState<AnswerResult[]>([]);

  function reset() {
    setQuestions([]);
    setResults([]);
    setPhase("setup");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">{t("quiz.title")}</h1>

      {phase === "setup" && (
        <Setup
          onStart={(qs) => {
            setQuestions(qs);
            setResults([]);
            setPhase("quiz");
          }}
          onLoading={() => setPhase("loading")}
          onError={() => setPhase("setup")}
        />
      )}
      {phase === "loading" && <Loading>{t("quiz.generating")}</Loading>}
      {phase === "quiz" && (
        <Runner
          questions={questions}
          onComplete={(rs) => {
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
  const [notes, setNotes] = useState<NoteListItem[] | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [mode, setMode] = useState<"note" | "course" | "material">("note");
  const [noteId, setNoteId] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Material mode state
  const [matCourseCode, setMatCourseCode] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [difficulty, setDifficulty] = useState("0"); // 0 = any
  const [qType, setQType] = useState("mixed");
  const [count, setCount] = useState("10");

  useEffect(() => {
    Promise.all([
      getJSON<{ notes: NoteListItem[] }>("/api/notes").catch(() => ({ notes: [] as NoteListItem[] })),
      getJSON<{ courses: Course[] }>("/api/courses").catch(() => ({ courses: [] as Course[] })),
    ]).then(([n, c]) => {
      setNotes(n.notes);
      setAllCourses(c.courses);
    });
  }, []);

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
      setError((e as ApiError).error);
      onError();
    }
  }

  const modes = [
    { id: "note" as const, label: t("quiz.byNote") },
    { id: "course" as const, label: t("quiz.byCourse") },
    { id: "material" as const, label: t("quiz.fromMaterial") },
  ];

  return (
    <Card>
      <div className="space-y-3">
        <h2 className="font-semibold text-slate-700">{t("quiz.pickSource")}</h2>

        <div className="flex gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                mode === m.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "note" && (
          <select
            value={noteId}
            onChange={(e) => setNoteId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-sm"
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
          <select
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-sm"
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
            <select
              value={matCourseCode}
              onChange={(e) => { setMatCourseCode(e.target.value); setChapterId(""); }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-sm"
            >
              <option value="">{t("quiz.selectCourse")}</option>
              {allCourses.map((c) => (
                <option key={c.code} value={c.code}>{c.code} {c.name_th}</option>
              ))}
            </select>
            {chapters.length > 0 && (
              <select
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-sm"
              >
                <option value="">{t("quiz.selectChapter")}</option>
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-500">{t("quiz.difficulty")}</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm">
                  <option value="0">ทุกระดับ</option>
                  <option value="1">{t("quiz.diff.1")}</option>
                  <option value="2">{t("quiz.diff.2")}</option>
                  <option value="3">{t("quiz.diff.3")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">{t("quiz.format")}</label>
                <select value={qType} onChange={(e) => setQType(e.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm">
                  <option value="mixed">{t("quiz.format.mixed")}</option>
                  <option value="mcq">{t("quiz.format.mcq")}</option>
                  <option value="short">{t("quiz.format.short")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">{t("quiz.count")}</label>
                <select value={count} onChange={(e) => setCount(e.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm">
                  {[5, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        <button onClick={start} className="w-full bg-indigo-600 text-white font-medium rounded-lg py-2">
          {t("quiz.start")}
        </button>

        <p className="text-xs text-center text-amber-600">{t("quiz.disclaimer")}</p>
      </div>
    </Card>
  );
}

function Runner({
  questions,
  onComplete,
}: {
  questions: QuizQuestion[];
  onComplete: (results: AnswerResult[]) => void;
}) {
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      setError((e as ApiError).error);
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
        <div className="text-xs text-slate-400">
          {t("quiz.question", { n: idx + 1, total: questions.length })}
          {q.topic ? ` · ${q.topic}` : ""}
        </div>
        <p className="font-medium text-slate-800">{q.question}</p>

        {/* answer input */}
        {q.type === "mcq" ? (
          <div className="space-y-2">
            {q.choices.map((c, i) => (
              <label
                key={i}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                  answer === c ? "border-indigo-400 bg-indigo-50" : "border-slate-200"
                } ${answered ? "opacity-70" : ""}`}
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
          <div>
            <span className="text-slate-500 text-sm">{t("quiz.yourAnswer")}</span>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={answered}
              rows={3}
              placeholder={t("quiz.answerPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        {/* result (revealed only after submitting) */}
        {answered && result && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <ScoreBadge score={result.score} />
              <span className="text-sm text-slate-600">{result.feedback}</span>
            </div>
            <div className="text-sm bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-slate-400">{t("quiz.modelAnswer")}: </span>
              <span className="text-slate-700">{result.modelAnswer}</span>
            </div>
            {result.explanation && (
              <div className="text-sm bg-blue-50 rounded-lg px-3 py-2">
                <span className="text-blue-500 text-xs font-medium">{t("quiz.explanation")}: </span>
                <span className="text-slate-700">{result.explanation}</span>
              </div>
            )}
            {result.sourceRef && (
              <div className="text-xs text-slate-400">
                {t("quiz.source")}:
                {result.sourceRef.chapter_name && ` ${t("quiz.sourceChapter").replace("{name}", result.sourceRef.chapter_name)}`}
                {result.sourceRef.source_page && ` ${t("quiz.sourcePage").replace("{page}", String(result.sourceRef.source_page))}`}
              </div>
            )}
            {result.flashcardCreated && (
              <div className="text-xs text-amber-600">{t("quiz.flashcardMade")}</div>
            )}
          </div>
        )}

        {/* actions */}
        {!answered ? (
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full bg-indigo-600 text-white font-medium rounded-lg py-2 disabled:opacity-40"
          >
            {t("quiz.submit")}
          </button>
        ) : (
          <button onClick={next} className="w-full bg-slate-800 text-white font-medium rounded-lg py-2">
            {idx + 1 >= questions.length ? t("quiz.finish") : t("quiz.next")}
          </button>
        )}
      </div>
    </Card>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score === 2 ? "bg-green-100 text-green-700" : score === 1 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`text-sm font-bold rounded-full px-2 py-0.5 ${color}`}>{score}/2</span>;
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
        <div className="text-4xl">🎯</div>
        <h2 className="text-xl font-bold text-slate-800">{t("quiz.doneTitle")}</h2>
        <p className="text-indigo-600 font-semibold text-lg">
          {t("quiz.totalScore", { score: total, max })}
        </p>
        <p className="text-sm text-slate-500">{t("quiz.cardsMade", { n: cards })}</p>
        <button
          onClick={onAgain}
          className="mt-3 bg-indigo-600 text-white font-medium rounded-lg py-2 px-6"
        >
          {t("quiz.again")}
        </button>
      </div>
    </Card>
  );
}
