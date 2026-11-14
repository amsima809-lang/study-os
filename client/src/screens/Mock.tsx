/**
 * Phase 4 (upgraded): Full-screen mock exam with question grid, flagging,
 * auto-save, per-question timing, custom grade cutoffs, chapter-wise scores,
 * and exam history with trend graph.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import {
  getJSON,
  postJSON,
  putJSON,
  type MockCourse,
  type QuizQuestion,
  type ApiError,
} from "../api.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";
import Icon from "../components/Icon.tsx";

type MockQuestion = QuizQuestion & { chapter_id?: number | null };
type GradeCutoff = { label: string; min_pct: number };
type ChapterScore = { chapter_id: number; name: string; score: number; max: number; pct: number; count: number };

type MockResultData = {
  score: number;
  maxScore: number;
  pct: number;
  grade: string;
  cutoffs: GradeCutoff[];
  questionCount: number;
  weakTopics: { name: string; mastery: number }[];
  chapterScores: ChapterScore[];
  totalSeconds: number;
  timePerQ: Record<string, number>;
};

type HistoryItem = {
  id: number;
  course_code: string;
  name_th: string;
  name_en: string | null;
  finished_at: string;
  score: number;
  maxScore: number;
  pct: number;
  grade: string;
  questionCount: number;
  totalSeconds: number;
  chapterScores: ChapterScore[];
};

type InProgressExam = {
  id: number;
  course_code: string;
  name_th: string;
  name_en: string | null;
  seconds_left: number;
  current_idx: number;
  question_count: number | null;
};

type Tab = "exam" | "history" | "settings";

export default function Mock() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("exam");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("mock.title")}</h1>

      <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: "var(--bg-surface-hover)" }}>
        {(["exam", "history", "settings"] as Tab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className="flex-1 text-sm py-1.5 rounded-md font-medium transition-colors min-h-11"
            style={{
              backgroundColor: tab === tb ? "var(--bg-surface)" : "transparent",
              color: tab === tb ? "var(--accent-text)" : "var(--text-tertiary)",
              boxShadow: tab === tb ? "var(--shadow-sm)" : "none",
            }}
          >
            {t(`mock.tab.${tb}`)}
          </button>
        ))}
      </div>

      {tab === "exam" && <ExamTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

function ExamTab() {
  const { t } = useT();
  const [phase, setPhase] = useState<"list" | "loading" | "exam" | "result">("list");
  const [mockId, setMockId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [durationMin, setDurationMin] = useState(90);
  const [result, setResult] = useState<MockResultData | null>(null);
  const [restoredAnswers, setRestoredAnswers] = useState<Record<string, string>>({});
  const [restoredFlags, setRestoredFlags] = useState<number[]>([]);
  const [restoredIdx, setRestoredIdx] = useState(0);
  const [restoredSeconds, setRestoredSeconds] = useState<number | null>(null);
  const [restoredTimePerQ, setRestoredTimePerQ] = useState<Record<string, number>>({});

  function handleStart(id: number, qs: MockQuestion[], dur: number) {
    setMockId(id);
    setQuestions(qs);
    setDurationMin(dur);
    setResult(null);
    setRestoredAnswers({});
    setRestoredFlags([]);
    setRestoredIdx(0);
    setRestoredSeconds(null);
    setRestoredTimePerQ({});
    setPhase("exam");
  }

  function handleResume(data: {
    mockId: number; questions: MockQuestion[]; durationMin: number;
    answers: Record<string, string>; flags: number[]; currentIdx: number;
    secondsLeft: number; timePerQ: Record<string, number>;
  }) {
    setMockId(data.mockId);
    setQuestions(data.questions);
    setDurationMin(data.durationMin);
    setResult(null);
    setRestoredAnswers(data.answers);
    setRestoredFlags(data.flags);
    setRestoredIdx(data.currentIdx);
    setRestoredSeconds(data.secondsLeft);
    setRestoredTimePerQ(data.timePerQ);
    setPhase("exam");
  }

  return (
    <>
      {(phase === "list" || phase === "loading") && (
        // Stay mounted while loading so the error message survives a failed request.
        <div hidden={phase === "loading"}>
          <CourseList
            onStart={handleStart}
            onResume={handleResume}
            onLoading={() => setPhase("loading")}
            onError={() => setPhase("list")}
          />
        </div>
      )}
      {phase === "loading" && <Loading>{t("mock.generating")}</Loading>}
      {phase === "exam" && mockId != null && (
        <Runner
          mockId={mockId}
          questions={questions}
          durationMin={durationMin}
          initialAnswers={restoredAnswers}
          initialFlags={restoredFlags}
          initialIdx={restoredIdx}
          initialSeconds={restoredSeconds}
          initialTimePerQ={restoredTimePerQ}
          onFinish={(r) => {
            setResult(r);
            setPhase("result");
          }}
        />
      )}
      {phase === "result" && result && (
        <ResultView result={result} onDone={() => setPhase("list")} />
      )}
    </>
  );
}

type CourseChapter = { id: number; name: string };
type AvailableCourse = MockCourse & { chapters: CourseChapter[] };

function CourseList({
  onStart, onResume, onLoading, onError,
}: {
  onStart: (mockId: number, qs: MockQuestion[], dur: number) => void;
  onResume: (data: {
    mockId: number; questions: MockQuestion[]; durationMin: number;
    answers: Record<string, string>; flags: number[]; currentIdx: number;
    secondsLeft: number; timePerQ: Record<string, number>;
  }) => void;
  onLoading: () => void;
  onError: () => void;
}) {
  const { t } = useT();
  const [courses, setCourses] = useState<AvailableCourse[] | null>(null);
  const [inProgress, setInProgress] = useState<InProgressExam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(40);
  const [duration, setDuration] = useState(90);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);

  useEffect(() => {
    Promise.all([
      getJSON<{ courses: AvailableCourse[] }>("/api/mock/available"),
      getJSON<{ exams: InProgressExam[] }>("/api/mock/in-progress"),
    ])
      .then(([c, ip]) => {
        setCourses(c.courses);
        setInProgress(ip.exams);
      })
      .catch(() => setCourses([]));
  }, []);

  if (!courses) return <Loading>{t("status.connecting")}</Loading>;
  if (courses.length === 0) return <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("mock.empty")}</p>;

  async function startExam(code: string) {
    setError(null);
    onLoading();
    try {
      const r = await postJSON<{
        mockId: number; durationMin: number; questions: MockQuestion[];
      }>("/api/mock/generate", {
        course_code: code,
        question_count: questionCount,
        duration_min: duration,
        chapter_ids: selectedChapters.length > 0 ? selectedChapters : undefined,
      });
      onStart(r.mockId, r.questions, r.durationMin);
    } catch (e) {
      setError((e as ApiError).error);
      onError();
    }
  }

  async function resumeExam(mockId: number) {
    onLoading();
    try {
      const data = await getJSON<{
        mockId: number; courseCode: string; durationMin: number;
        questions: MockQuestion[]; answers: Record<string, string>;
        flags: number[]; currentIdx: number; secondsLeft: number;
        timePerQ: Record<string, number>;
      }>(`/api/mock/${mockId}/session`);
      onResume(data);
    } catch {
      onError();
    }
  }

  function toggleChapter(id: number) {
    setSelectedChapters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" };

  return (
    <div className="space-y-3">
      {error && <ErrorBox>{error}</ErrorBox>}

      {inProgress.map((ip) => (
        <Card key={ip.id}>
          <div className="flex items-center justify-between">
            <div>
              <CourseTitle
                code={ip.course_code}
                name_th={ip.name_th}
                name_en={ip.name_en}
                className="font-medium text-sm"
              />
              <p className="text-xs mt-0.5" style={{ color: "var(--warning)" }}>
                {t("mock.resumeInfo", {
                  n: ip.question_count ?? "?",
                  min: Math.ceil(ip.seconds_left / 60),
                })}
              </p>
            </div>
            <button
              onClick={() => resumeExam(ip.id)}
              className="text-sm font-medium rounded-lg px-4 py-2 min-h-11"
              style={{ backgroundColor: "var(--warning)", color: "var(--text-inverse)" }}
            >
              {t("mock.resume")}
            </button>
          </div>
        </Card>
      ))}

      {courses.map((c) => (
        <Card key={c.code}>
          <CourseTitle
            code={c.code}
            name_th={c.name_th}
            name_en={c.name_en}
            className="font-medium text-sm"
          />
          {c.available ? (
            <div className="mt-2 space-y-2">
              <button
                onClick={() => {
                  setExpanded(expanded === c.code ? null : c.code);
                  setSelectedChapters([]);
                }}
                className="text-xs underline min-h-11"
                style={{ color: "var(--accent-text)" }}
              >
                {t("mock.settings")}
              </button>

              {expanded === c.code && (
                <div className="rounded-lg p-3 space-y-3 text-sm" style={{ backgroundColor: "var(--bg-surface-hover)" }}>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("mock.questionCount")}</span>
                      <input
                        type="number" min={5} max={Math.min(c.bankCount, 200)}
                        value={questionCount}
                        onChange={(e) => setQuestionCount(Number(e.target.value) || 40)}
                        className="w-full mt-0.5 rounded border px-2 py-1 text-sm min-h-11"
                        style={inputStyle}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("mock.duration")}</span>
                      <input
                        type="number" min={5} max={300}
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value) || 90)}
                        className="w-full mt-0.5 rounded border px-2 py-1 text-sm min-h-11"
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  {c.chapters.length > 0 && (
                    <div>
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("mock.chapters")}</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <button
                          onClick={() => setSelectedChapters([])}
                          className="text-xs rounded-full px-2 py-0.5 min-h-11"
                          style={{
                            backgroundColor: selectedChapters.length === 0 ? "var(--accent-light)" : "var(--bg-surface)",
                            color: selectedChapters.length === 0 ? "var(--accent-text)" : "var(--text-tertiary)",
                          }}
                        >
                          {t("mock.allChapters")}
                        </button>
                        {c.chapters.map((ch) => (
                          <button
                            key={ch.id}
                            onClick={() => toggleChapter(ch.id)}
                            className="text-xs rounded-full px-2 py-0.5 min-h-11"
                            style={{
                              backgroundColor: selectedChapters.includes(ch.id) ? "var(--accent-light)" : "var(--bg-surface)",
                              color: selectedChapters.includes(ch.id) ? "var(--accent-text)" : "var(--text-tertiary)",
                            }}
                          >
                            {ch.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => startExam(c.code)}
                className="w-full text-sm font-medium rounded-lg py-2 min-h-11"
                style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
              >
                {t("mock.startExam")}
              </button>
            </div>
          ) : (
            <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
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

const AUTOSAVE_INTERVAL = 15_000;
const LS_KEY = "studyos_mock_session";

function Runner({
  mockId, questions, durationMin,
  initialAnswers, initialFlags, initialIdx, initialSeconds, initialTimePerQ,
  onFinish,
}: {
  mockId: number;
  questions: MockQuestion[];
  durationMin: number;
  initialAnswers: Record<string, string>;
  initialFlags: number[];
  initialIdx: number;
  initialSeconds: number | null;
  initialTimePerQ: Record<string, number>;
  onFinish: (r: MockResultData) => void;
}) {
  const { t } = useT();
  const [idx, setIdx] = useState(initialIdx);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [flags, setFlags] = useState<Set<number>>(new Set(initialFlags));
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds ?? durationMin * 60);
  const [timePerQ, setTimePerQ] = useState<Record<string, number>>(initialTimePerQ);
  const [showGrid, setShowGrid] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoSaveMsg, setAutoSaveMsg] = useState(false);
  const finished = useRef(false);
  const qStartTime = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  const q = questions[idx];

  const recordTimeOnQuestion = useCallback(() => {
    const elapsed = Math.round((Date.now() - qStartTime.current) / 1000);
    if (elapsed > 0 && q) {
      setTimePerQ((prev) => ({
        ...prev,
        [String(q.id)]: (prev[String(q.id)] || 0) + elapsed,
      }));
    }
    qStartTime.current = Date.now();
  }, [q]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          void doFinish();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const save = () => {
      const state = {
        mockId,
        answers,
        flags: [...flags],
        current_idx: idx,
        seconds_left: secondsLeft,
        time_per_q: timePerQ,
      };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      } catch { /* quota */ }
      postJSON(`/api/mock/${mockId}/save`, state).catch(() => {});
      setAutoSaveMsg(true);
      setTimeout(() => setAutoSaveMsg(false), 2000);
    };
    const interval = setInterval(save, AUTOSAVE_INTERVAL);
    const onBeforeUnload = () => save();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [mockId, answers, flags, idx, secondsLeft, timePerQ]);

  function setAnswer(val: string) {
    setAnswers((prev) => ({ ...prev, [String(q.id)]: val }));
  }

  function goToQuestion(i: number) {
    recordTimeOnQuestion();
    setIdx(i);
    setShowGrid(false);
  }

  function toggleFlag() {
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function doFinish() {
    if (finished.current) return;
    finished.current = true;
    recordTimeOnQuestion();
    setSubmitting(true);

    const gradePromises = Object.entries(answers).map(([qid, ans]) => {
      if (!ans.trim()) return Promise.resolve();
      return postJSON("/api/quiz/answer", {
        question_id: Number(qid),
        my_answer: ans,
      }).catch(() => {});
    });
    await Promise.all(gradePromises);

    try {
      const r = await postJSON<MockResultData>(`/api/mock/${mockId}/finish`, {
        time_per_q: timePerQ,
      });
      try { localStorage.removeItem(LS_KEY); } catch { /* ok */ }
      onFinish(r);
    } catch {
      onFinish({
        score: 0, maxScore: questions.length * 2, pct: 0, grade: "?",
        cutoffs: [], questionCount: questions.length, weakTopics: [],
        chapterScores: [], totalSeconds: 0, timePerQ: {},
      });
    }
  }

  function handleSubmitClick() {
    setShowConfirm(true);
  }

  if (submitting) return <Loading>{t("mock.submitting")}</Loading>;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const low = secondsLeft < 300;
  const answeredCount = questions.filter((q2) => answers[String(q2.id)]?.trim()).length;
  const currentAnswer = answers[String(q.id)] || "";

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Top bar */}
      <div
        className="flex items-center justify-between rounded-xl px-3 py-2 sticky top-0 z-20"
        style={{ backgroundColor: "var(--bg-surface)", boxShadow: "var(--shadow-sm)" }}
      >
        <button
          onClick={() => setShowGrid(!showGrid)}
          className="text-xs font-medium px-2 py-1 rounded-lg min-h-11"
          style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-text)" }}
        >
          {t("mock.grid")} {answeredCount}/{questions.length}
        </button>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {t("mock.question", { n: idx + 1, total: questions.length })}
        </span>
        <span
          className={`text-sm font-bold tabular-nums ${low ? "animate-pulse" : ""}`}
          style={{ color: low ? "var(--danger)" : "var(--text-primary)" }}
        >
          {mm}:{ss}
        </span>
      </div>

      {autoSaveMsg && (
        <div className="text-center text-xs animate-pulse" style={{ color: "var(--success)" }}>
          {t("mock.autoSaved")}
        </div>
      )}

      {/* Question grid overlay */}
      {showGrid && (
        <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "var(--bg-surface)", boxShadow: "var(--shadow-lg)" }}>
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span>{t("mock.grid")}</span>
            <div className="flex gap-3">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: "var(--accent)" }} /> {t("mock.answered")}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: "var(--warning)" }} /> {t("mock.flagged")}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {questions.map((_, i) => {
              const isAnswered = !!answers[String(questions[i].id)]?.trim();
              const isFlagged = flags.has(i);
              const isCurrent = i === idx;

              let bg: string; let fg: string;
              if (isCurrent) { bg = "var(--accent)"; fg = "var(--text-inverse)"; }
              else if (isFlagged && isAnswered) { bg = "var(--warning)"; fg = "var(--text-inverse)"; }
              else if (isFlagged) { bg = "var(--warning-bg)"; fg = "var(--warning)"; }
              else if (isAnswered) { bg = "var(--accent-light)"; fg = "var(--accent-text)"; }
              else { bg = "var(--bg-surface-hover)"; fg = "var(--text-tertiary)"; }

              return (
                <button
                  key={i}
                  onClick={() => goToQuestion(i)}
                  className="w-full aspect-square rounded text-xs font-medium"
                  style={{ backgroundColor: bg, color: fg }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Question card */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs">
            {q.topic && <span style={{ color: "var(--accent-text)" }}>{q.topic}</span>}
          </span>
          <button
            onClick={toggleFlag}
            className="text-xs px-2 py-0.5 rounded-full min-h-11"
            style={{
              backgroundColor: flags.has(idx) ? "var(--warning-bg)" : "var(--bg-surface-hover)",
              color: flags.has(idx) ? "var(--warning)" : "var(--text-tertiary)",
            }}
          >
            <span className="inline-flex items-center gap-1"><Icon name="flag" size={14} /> {flags.has(idx) ? t("mock.unflag") : t("mock.flag")}</span>
          </button>
        </div>

        <p className="font-medium mb-3" style={{ color: "var(--text-primary)" }}>{q.question}</p>

        {q.type === "mcq" ? (
          <div className="space-y-2">
            {q.choices.map((c, i) => (
              <label
                key={i}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer"
                style={{
                  borderColor: currentAnswer === c ? "var(--accent)" : "var(--border)",
                  backgroundColor: currentAnswer === c ? "var(--accent-light)" : "transparent",
                  color: "var(--text-primary)",
                }}
              >
                <input
                  type="radio"
                  name={`mq${q.id}`}
                  checked={currentAnswer === c}
                  onChange={() => setAnswer(c)}
                />
                {c}
              </label>
            ))}
          </div>
        ) : (
          <textarea
            value={currentAnswer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            placeholder={t("mock.answerPlaceholder")}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
          />
        )}
      </Card>

      {/* Navigation */}
      <div className="flex gap-2">
        <button
          onClick={() => goToQuestion(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="flex-1 font-medium rounded-lg py-2 text-sm disabled:opacity-30 min-h-11"
          style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-secondary)" }}
        >
          ←
        </button>
        {idx + 1 < questions.length ? (
          <button
            onClick={() => goToQuestion(idx + 1)}
            className="flex-1 font-medium rounded-lg py-2 text-sm min-h-11"
            style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
          >
            {t("mock.next")}
          </button>
        ) : (
          <button
            onClick={handleSubmitClick}
            className="flex-1 font-medium rounded-lg py-2 text-sm min-h-11"
            style={{ backgroundColor: "var(--success)", color: "var(--text-inverse)" }}
          >
            {t("mock.submit")}
          </button>
        )}
      </div>

      {idx + 1 < questions.length && (
        <button
          onClick={handleSubmitClick}
          className="w-full text-xs py-1 underline min-h-11"
          style={{ color: "var(--text-tertiary)" }}
        >
          {t("mock.submit")}
        </button>
      )}

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div
            className="rounded-2xl p-5 max-w-sm w-full space-y-3"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <p className="font-medium text-center" style={{ color: "var(--text-primary)" }}>
              {(() => {
                const unanswered = questions.filter(
                  (q2) => !answers[String(q2.id)]?.trim(),
                ).length;
                return unanswered > 0
                  ? t("mock.confirmSubmit", { n: unanswered })
                  : t("mock.confirmSubmitAll");
              })()}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 font-medium rounded-lg py-2 text-sm min-h-11"
                style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-secondary)" }}
              >
                {t("mock.cancel")}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  void doFinish();
                }}
                className="flex-1 font-medium rounded-lg py-2 text-sm min-h-11"
                style={{ backgroundColor: "var(--success)", color: "var(--text-inverse)" }}
              >
                {t("mock.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultView({ result, onDone }: { result: MockResultData; onDone: () => void }) {
  const { t } = useT();
  const totalMin = Math.floor(result.totalSeconds / 60);
  const totalSec = result.totalSeconds % 60;
  const avgSec = result.questionCount > 0 ? Math.round(result.totalSeconds / result.questionCount) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-center space-y-2 py-4">
          <div style={{ color: "var(--accent-text)" }}><Icon name="trophy" size={40} /></div>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{t("mock.resultTitle")}</h2>
          <p className="font-semibold text-2xl" style={{ color: "var(--accent-text)" }}>
            {t("mock.pct", { pct: result.pct })}
          </p>
          <p style={{ color: "var(--text-secondary)" }}>
            {t("mock.resultScore", { score: result.score, max: result.maxScore })}
          </p>
          <p className="text-lg font-bold" style={{ color: "var(--warning)" }}>
            {t("mock.grade", { grade: result.grade })}
          </p>
          {result.totalSeconds > 0 && (
            <div className="text-xs space-y-0.5" style={{ color: "var(--text-tertiary)" }}>
              <p>{t("mock.timeSpent", { min: totalMin, sec: totalSec })}</p>
              <p>{t("mock.avgTimePerQ", { sec: avgSec })}</p>
            </div>
          )}
        </div>
      </Card>

      {result.chapterScores.length > 0 && (
        <Card>
          <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>{t("mock.chapterBreakdown")}</h3>
          <div className="space-y-2">
            {result.chapterScores.map((cs) => {
              const barColor = cs.pct >= 70 ? "var(--success)" : cs.pct >= 50 ? "var(--warning)" : "var(--danger)";
              return (
                <div key={cs.chapter_id}>
                  <div className="flex justify-between text-sm">
                    <span className="truncate" style={{ color: "var(--text-secondary)" }}>{cs.name}</span>
                    <span className="font-medium" style={{ color: barColor }}>{cs.pct}%</span>
                  </div>
                  <div className="rounded-full h-2 mt-0.5" style={{ backgroundColor: "var(--border-light)" }}>
                    <div
                      className="rounded-full h-2 transition-all"
                      style={{ width: `${Math.min(cs.pct, 100)}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {cs.score}/{cs.max} · {cs.count} ข้อ
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {result.weakTopics.length > 0 && (
        <Card>
          <p className="text-sm mb-1" style={{ color: "var(--text-tertiary)" }}>{t("mock.weak")}</p>
          <div className="flex flex-wrap gap-1">
            {result.weakTopics.map((w, i) => (
              <span
                key={i}
                className="text-xs rounded-full px-2 py-0.5"
                style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}
              >
                {w.name} {w.mastery}%
              </span>
            ))}
          </div>
        </Card>
      )}

      <p className="text-xs text-center" style={{ color: "var(--warning)" }}>{t("mock.madeCards")}</p>
      <button
        onClick={onDone}
        className="w-full font-medium rounded-lg py-2 min-h-11"
        style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
      >
        {t("mock.done")}
      </button>
    </div>
  );
}

function HistoryTab() {
  const { t } = useT();
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    getJSON<{ history: HistoryItem[] }>("/api/mock/history")
      .then((d) => setHistory(d.history))
      .catch(() => setHistory([]));
  }, []);

  if (!history) return <Loading>{t("status.connecting")}</Loading>;
  if (history.length === 0) {
    return <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>{t("mock.historyEmpty")}</p>;
  }

  const trendData = [...history].reverse();

  return (
    <div className="space-y-4">
      {trendData.length >= 2 && (
        <Card>
          <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>{t("mock.trend")}</h3>
          <TrendChart data={trendData} />
        </Card>
      )}

      <div className="space-y-2">
        {history.map((h) => (
          <Card key={h.id}>
            <div className="flex items-center justify-between">
              <div>
                <CourseTitle
                  inline
                  code={h.course_code}
                  name_th={h.name_th}
                  name_en={h.name_en}
                  className="font-medium text-sm"
                />
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {new Date(h.finished_at).toLocaleDateString("th-TH", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold" style={{ color: "var(--accent-text)" }}>{h.pct}%</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {h.grade} · {h.score}/{h.maxScore}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: HistoryItem[] }) {
  const W = 300;
  const H = 120;
  const PAD = 20;

  if (data.length < 2) return null;

  const maxPct = 100;
  const xStep = (W - PAD * 2) / (data.length - 1);

  const points = data.map((d, i) => ({
    x: PAD + i * xStep,
    y: H - PAD - ((d.pct / maxPct) * (H - PAD * 2)),
    label: d.pct,
  }));

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
      {[0, 25, 50, 75, 100].map((pct) => {
        const y = H - PAD - ((pct / maxPct) * (H - PAD * 2));
        return (
          <g key={pct}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--border-light)" strokeWidth={0.5} />
            <text x={PAD - 4} y={y + 3} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">
              {pct}
            </text>
          </g>
        );
      })}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill="var(--accent)" />
          <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize={8} fill="var(--accent-text)" fontWeight="bold">
            {p.label}%
          </text>
        </g>
      ))}
    </svg>
  );
}

function SettingsTab() {
  const { t } = useT();
  const [cutoffs, setCutoffs] = useState<GradeCutoff[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GradeCutoff[]>([]);

  useEffect(() => {
    getJSON<{ cutoffs: GradeCutoff[] }>("/api/mock/cutoffs")
      .then((d) => setCutoffs(d.cutoffs))
      .catch(() => setCutoffs([]));
  }, []);

  if (!cutoffs) return <Loading>{t("status.connecting")}</Loading>;

  function startEdit() {
    setDraft([...cutoffs!]);
    setEditing(true);
  }

  async function save() {
    const sorted = [...draft].sort((a, b) => b.min_pct - a.min_pct);
    try {
      await putJSON("/api/mock/cutoffs", { cutoffs: sorted });
      setCutoffs(sorted);
      setEditing(false);
    } catch { /* ignore */ }
  }

  const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium" style={{ color: "var(--text-primary)" }}>{t("mock.cutoffs")}</h3>
        {!editing && (
          <button onClick={startEdit} className="text-xs underline min-h-11" style={{ color: "var(--accent-text)" }}>
            {t("mock.editCutoffs")}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          {draft.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={c.label}
                onChange={(e) => {
                  const next = [...draft];
                  next[i] = { ...c, label: e.target.value };
                  setDraft(next);
                }}
                className="w-16 rounded border px-2 py-1 text-sm text-center min-h-11"
                style={inputStyle}
              />
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("mock.minPct")}</span>
              <input
                type="number" min={0} max={100}
                value={c.min_pct}
                onChange={(e) => {
                  const next = [...draft];
                  next[i] = { ...c, min_pct: Number(e.target.value) || 0 };
                  setDraft(next);
                }}
                className="w-16 rounded border px-2 py-1 text-sm text-center min-h-11"
                style={inputStyle}
              />
            </div>
          ))}
          <button
            onClick={save}
            className="w-full text-sm font-medium rounded-lg py-2 mt-2 min-h-11"
            style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
          >
            {t("mock.saveCutoffs")}
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {cutoffs.map((c, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>{c.label}</span>
              <span style={{ color: "var(--text-tertiary)" }}>{c.min_pct}%+</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
