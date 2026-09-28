import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n.tsx";
import {
  getJSON,
  postJSON,
  type NoteListItem,
  type QuizQuestion,
  type AnswerResult,
  type ApiError,
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
  const [mode, setMode] = useState<"note" | "course">("note");
  const [noteId, setNoteId] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJSON<{ notes: NoteListItem[] }>("/api/notes")
      .then((d) => setNotes(d.notes))
      .catch(() => setNotes([]));
  }, []);

  // Courses that actually have notes (so a course quiz has content).
  const courses = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notes ?? []) if (n.course_code) map.set(n.course_code, n.course_name ?? n.course_code);
    return [...map.entries()];
  }, [notes]);

  if (!notes) return <Loading>{t("status.connecting")}</Loading>;
  if (notes.length === 0) return <p className="text-slate-400 text-sm">{t("quiz.needNotes")}</p>;

  async function start() {
    setError(null);
    const body =
      mode === "note"
        ? { source: "note", note_id: Number(noteId) }
        : { source: "course", course_code: courseCode };
    if (mode === "note" && !noteId) return;
    if (mode === "course" && !courseCode) return;

    onLoading();
    try {
      const r = await postJSON<{ questions: QuizQuestion[] }>("/api/quiz/generate", body);
      onStart(r.questions);
    } catch (e) {
      setError((e as ApiError).error);
      onError();
    }
  }

  return (
    <Card>
      <div className="space-y-3">
        <h2 className="font-semibold text-slate-700">{t("quiz.pickSource")}</h2>

        <div className="flex gap-2">
          {(["note", "course"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                mode === m ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t(m === "note" ? "quiz.byNote" : "quiz.byCourse")}
            </button>
          ))}
        </div>

        {mode === "note" ? (
          <select
            value={noteId}
            onChange={(e) => setNoteId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-sm"
          >
            <option value="">{t("quiz.selectNote")}</option>
            {notes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title || n.course_name || `#${n.id}`}
              </option>
            ))}
          </select>
        ) : (
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

        {error && <ErrorBox>{error}</ErrorBox>}

        <button onClick={start} className="w-full bg-indigo-600 text-white font-medium rounded-lg py-2">
          {t("quiz.start")}
        </button>
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
