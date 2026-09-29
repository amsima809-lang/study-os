import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import {
  getJSON,
  postJSON,
  type MockCourse,
  type MockResult,
  type QuizQuestion,
  type ApiError,
} from "../api.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";

type Phase = "list" | "loading" | "exam" | "result";

export default function Mock() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>("list");
  const [mockId, setMockId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [durationMin, setDurationMin] = useState(90);
  const [result, setResult] = useState<MockResult | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">{t("mock.title")}</h1>
      <p className="text-sm text-slate-500">{t("mock.intro")}</p>

      {phase === "list" && (
        <CourseList
          onStart={(id, qs, dur) => {
            setMockId(id);
            setQuestions(qs);
            setDurationMin(dur);
            setResult(null);
            setPhase("exam");
          }}
          onLoading={() => setPhase("loading")}
          onError={() => setPhase("list")}
        />
      )}
      {phase === "loading" && <Loading>{t("mock.generating")}</Loading>}
      {phase === "exam" && mockId != null && (
        <Runner
          mockId={mockId}
          questions={questions}
          durationMin={durationMin}
          onFinish={(r) => {
            setResult(r);
            setPhase("result");
          }}
        />
      )}
      {phase === "result" && result && <ResultView result={result} onDone={() => setPhase("list")} />}
    </div>
  );
}

function CourseList({
  onStart,
  onLoading,
  onError,
}: {
  onStart: (mockId: number, qs: QuizQuestion[], dur: number) => void;
  onLoading: () => void;
  onError: () => void;
}) {
  const { t } = useT();
  const [courses, setCourses] = useState<MockCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJSON<{ courses: MockCourse[] }>("/api/mock/available")
      .then((d) => setCourses(d.courses))
      .catch(() => setCourses([]));
  }, []);

  if (!courses) return <Loading>{t("status.connecting")}</Loading>;
  if (courses.length === 0) return <p className="text-slate-400 text-sm">{t("mock.empty")}</p>;

  async function start(code: string) {
    setError(null);
    onLoading();
    try {
      const r = await postJSON<{ mockId: number; durationMin: number; questions: QuizQuestion[] }>(
        "/api/mock/generate",
        { course_code: code },
      );
      onStart(r.mockId, r.questions, r.durationMin);
    } catch (e) {
      setError((e as ApiError).error);
      onError();
    }
  }

  return (
    <div className="space-y-2">
      {error && <ErrorBox>{error}</ErrorBox>}
      {courses.map((c) => (
        <Card key={c.code}>
          <CourseTitle
            code={c.code}
            name_th={c.name_th}
            name_en={c.name_en}
            className="font-medium text-slate-800 text-sm"
          />
          {c.available ? (
            <button
              onClick={() => start(c.code)}
              className="mt-2 w-full bg-indigo-600 text-white text-sm font-medium rounded-lg py-2"
            >
              {t("mock.start")}
            </button>
          ) : (
            <div className="text-xs text-slate-400 mt-1">
              {c.bankCount === 0 && c.daysToExam <= 21
                ? t("mock.noBank")
                : t("mock.locked", { n: c.daysToExam - 21 })}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Runner({
  mockId,
  questions,
  durationMin,
  onFinish,
}: {
  mockId: number;
  questions: QuizQuestion[];
  durationMin: number;
  onFinish: (r: MockResult) => void;
}) {
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(durationMin * 60);
  const [submitting, setSubmitting] = useState(false);
  const finished = useRef(false);

  const q = questions[idx];

  async function finish(minutesUsed: number) {
    if (finished.current) return;
    finished.current = true;
    setSubmitting(true);
    try {
      // grade the currently-shown answer if any
      if (answer.trim()) await gradeSilently(q.id, answer);
      const r = await postJSON<MockResult>(`/api/mock/${mockId}/finish`, { minutes: minutesUsed });
      onFinish(r);
    } catch {
      onFinish({ score: 0, maxScore: questions.length * 2, questionCount: questions.length, weakTopics: [] });
    }
  }

  // countdown; auto-submit at 0
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          void finish(durationMin);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function next() {
    if (answer.trim()) await gradeSilently(q.id, answer);
    if (idx + 1 >= questions.length) {
      void finish(durationMin - Math.round(secondsLeft / 60));
    } else {
      setIdx(idx + 1);
      setAnswer("");
    }
  }

  if (submitting) return <Loading>{t("mock.submitting")}</Loading>;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const low = secondsLeft < 300;

  return (
    <Card>
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs text-slate-400">
          {t("mock.question", { n: idx + 1, total: questions.length })}
        </span>
        <span className={`text-sm font-bold tabular-nums ${low ? "text-red-600" : "text-slate-700"}`}>
          ⏱ {t("mock.timeLeft")} {mm}:{ss}
        </span>
      </div>

      <p className="font-medium text-slate-800 mb-3">{q.question}</p>

      {q.type === "mcq" ? (
        <div className="space-y-2">
          {q.choices.map((c, i) => (
            <label
              key={i}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                answer === c ? "border-indigo-400 bg-indigo-50" : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name={`mq${q.id}`}
                checked={answer === c}
                onChange={() => setAnswer(c)}
              />
              {c}
            </label>
          ))}
        </div>
      ) : (
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          placeholder={t("mock.answerPlaceholder")}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      )}

      <button onClick={next} className="mt-3 w-full bg-indigo-600 text-white font-medium rounded-lg py-2">
        {idx + 1 >= questions.length ? t("mock.submit") : t("mock.next")}
      </button>
    </Card>
  );
}

/** Grade one answer via the shared quiz endpoint (misses auto-create cards). */
async function gradeSilently(questionId: number, myAnswer: string) {
  try {
    await postJSON("/api/quiz/answer", { question_id: questionId, my_answer: myAnswer });
  } catch {
    /* keep the exam flowing even if one grade fails */
  }
}

function ResultView({ result, onDone }: { result: MockResult; onDone: () => void }) {
  const { t } = useT();
  return (
    <Card>
      <div className="text-center space-y-2 py-4">
        <div className="text-4xl">🎯</div>
        <h2 className="text-xl font-bold text-slate-800">{t("mock.resultTitle")}</h2>
        <p className="text-indigo-600 font-semibold text-lg">
          {t("mock.resultScore", { score: result.score, max: result.maxScore })}
        </p>

        {result.weakTopics.length > 0 && (
          <div className="pt-2">
            <p className="text-sm text-slate-500 mb-1">{t("mock.weak")}</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {result.weakTopics.map((w, i) => (
                <span key={i} className="bg-red-50 text-red-600 text-xs rounded-full px-2 py-0.5">
                  {w.name} {w.mastery}%
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-amber-600 pt-1">{t("mock.madeCards")}</p>
        <button onClick={onDone} className="mt-3 bg-indigo-600 text-white font-medium rounded-lg py-2 px-6">
          {t("mock.done")}
        </button>
      </div>
    </Card>
  );
}
