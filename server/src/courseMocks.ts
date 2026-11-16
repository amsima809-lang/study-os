import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";
import { hasCatalog } from "./api.js";
import type { DB } from "./db.js";
import type { CourseMockQuestion } from "./importCourseMocks.js";
import { canReadSharedLectures, lectureFilter } from "./savedLectures.js";

type Paper = {
  id: number; course_code: string; code: string; name_th: string; name_en: string | null;
  question_count: number; duration_min: number; form_key: string; active: number;
};
type Attempt = {
  id: number; paper_id: number; started_ms: number; deadline_ms: number; finished_ms: number | null;
  expired: number; score: number | null; revision: number; current_position: number; responses: string;
};
type ResponseState = { choice: number | null; flagged: boolean };

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const missing = () => new RequestError(404, "Exam unavailable");
const positive = z.number().int().positive();
const revision = z.number().int().nonnegative();
const startInput = z.object({
  course_code: z.string().min(1), form_key: z.string().min(1).default("A"), previous_attempt_id: positive.nullish(),
}).strict();
const change = z.object({
  position: positive, choice: z.number().int().min(0).max(3).nullable().optional(), flagged: z.boolean().optional(),
}).strict();
const progressInput = z.object({ revision, position: positive.optional(), changes: z.array(change).max(120).optional() }).strict();

/** Every recording used by the immutable form must still be accessible in the reader under the same alias. */
function visiblePapers(db: DB, user: string): Paper[] {
  if (!canReadSharedLectures(user) || !hasCatalog(db, user)) return [];
  const filter = lectureFilter(db, user);
  return db.prepare(`SELECT p.id,p.course_code,p.form_key,p.active,p.duration_min,p.question_count,
    cl.course_code AS code,c.name_th,c.name_en FROM course_mock_papers p
    JOIN course_mock_sources s ON s.paper_id=p.id
    JOIN course_lectures cl ON cl.shared_transcript_id=s.transcript_id
    JOIN courses c ON c.code=cl.course_code
    WHERE p.valid=1 AND cl.source='ru-vod-subtitle' ${filter.sql}
    GROUP BY p.id,cl.course_code
    HAVING COUNT(DISTINCT s.transcript_id)=(SELECT COUNT(*) FROM course_mock_sources linked WHERE linked.paper_id=p.id)
    ORDER BY cl.course_code,p.form_key,p.id`).all(...filter.params) as Paper[];
}

// Grade directly against the frozen version and persisted answers. Unanswered
// positions have a NULL choice and therefore never compare equal to the key.
const scoreSql = `(SELECT COUNT(*) FROM course_mock_papers p,json_each(p.questions) item
  WHERE p.id=course_mock_attempts.paper_id
    AND json_extract(item.value,'$.correct_index')=json_extract(course_mock_attempts.responses,
      '$."' || json_extract(item.value,'$.position') || '".choice'))`;

/** The periodic sweep runs while the app is closed; each request also enforces the exact deadline. */
export function expireCourseMocks(db: DB, now = Date.now()) {
  return db.prepare(`UPDATE course_mock_attempts SET finished_ms=deadline_ms,expired=1,revision=revision+1,score=${scoreSql}
    WHERE finished_ms IS NULL AND deadline_ms<=?`).run(now).changes;
}
function ownedAttempt(db: DB, user: string, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw missing();
  const a = db.prepare("SELECT * FROM course_mock_attempts WHERE user_id=? AND id=?").get(user, id) as Attempt | undefined;
  const paper = a && visiblePapers(db, user).find((p) => p.id === a.paper_id);
  if (!a || !paper) throw missing();
  return { a, paper };
}
function fullAttempt(db: DB, a: Attempt, p: Paper, now: number) {
  const completed = a.finished_ms !== null;
  const row = db.prepare("SELECT questions FROM course_mock_papers WHERE id=?").get(p.id) as { questions: string };
  const answers = JSON.parse(a.responses) as Record<string, ResponseState>;
  return {
    id: a.id, course_code: p.code, form_key: p.form_key, question_count: p.question_count, duration_min: p.duration_min,
    status: completed ? "completed" : "in_progress", started_ms: a.started_ms, deadline_ms: a.deadline_ms, server_now_ms: now,
    finished_ms: a.finished_ms, expired: Boolean(a.expired), score: a.score, revision: a.revision, current_position: a.current_position,
    questions: (JSON.parse(row.questions) as CourseMockQuestion[]).map((q) => ({
      position: q.position, stem: q.stem, options: q.options, stimulus: q.stimulus,
      choice: answers[q.position]?.choice ?? null, flagged: answers[q.position]?.flagged ?? false,
      ...(completed && { correct_index: q.correct_index, explanation: q.explanation, session_no: q.session_no,
        source_url: q.source_url, evidence_ms: q.evidence_ms, evidence_quote: q.evidence_quote }),
    })),
  };
}
function guardRevision(a: Attempt, expected: number | undefined) {
  if (expected !== undefined && expected !== a.revision) throw new RequestError(409, "Attempt changed; reload before editing");
}
export function courseMockCatalog(db: DB, user: string, allForms = false) {
  // Installed clients predating form selection can start and display only paper A.
  const papers = visiblePapers(db, user).filter((p) => allForms || p.form_key === "A");
  const byId = new Map(papers.map((p) => [p.id, p]));
  const attempts = db.prepare(`SELECT id,paper_id,score,started_ms,finished_ms,expired FROM course_mock_attempts
    WHERE user_id=? ORDER BY id DESC`).all(user) as Pick<Attempt, "id" | "paper_id" | "score" | "started_ms" | "finished_ms" | "expired">[];
  const visible = attempts.filter((a) => byId.has(a.paper_id));
  return {
    courses: papers.filter((p) => p.active).map((p) => {
      const same = visible.filter((a) => {
        const edition = byId.get(a.paper_id)!;
        return edition.course_code === p.course_code && edition.form_key === p.form_key;
      });
      return { code: p.code, name_th: p.name_th, name_en: p.name_en, question_count: p.question_count,
        duration_min: p.duration_min, form_key: p.form_key,
        active_attempt_id: same.find((a) => a.finished_ms === null)?.id ?? null,
        latest_completed_id: same.find((a) => a.finished_ms !== null)?.id ?? null };
    }),
    history: visible.filter((a) => a.finished_ms !== null).map((a) => {
      const p = byId.get(a.paper_id)!;
      return { id: a.id, course_code: p.code, form_key: p.form_key, question_count: p.question_count, score: a.score,
        started_ms: a.started_ms, finished_ms: a.finished_ms, expired: Boolean(a.expired) };
    }),
  };
}

export function createCourseMockRouter(db: DB, clock = Date.now) {
  const router = Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (!req.user) { res.sendStatus(401); return; }
    next();
  });
  router.get("/catalog", (req, res) => {
    expireCourseMocks(db, clock());
    res.json(courseMockCatalog(db, req.user!.id, req.query.forms === "all"));
  });
  router.post("/start", (req, res) => {
    const data = startInput.parse(req.body);
    const user = req.user!.id;
    const result = db.transaction(() => {
      const now = clock();
      expireCourseMocks(db, now);
      const versions = visiblePapers(db, user).filter((p) => p.code === data.course_code && p.form_key === data.form_key);
      const paper = versions.find((p) => p.active);
      if (!paper) throw missing();
      const latest = db.prepare(`SELECT * FROM course_mock_attempts WHERE user_id=?
        AND paper_id IN (${versions.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 1`)
        .get(user, ...versions.map((p) => p.id)) as Attempt | undefined;
      if (latest && (latest.finished_ms === null || data.previous_attempt_id !== latest.id)) {
        return fullAttempt(db, latest, versions.find((p) => p.id === latest.paper_id)!, now);
      }
      if (!latest && data.previous_attempt_id != null) throw missing();
      const a = db.prepare(`INSERT INTO course_mock_attempts(user_id,paper_id,started_ms,deadline_ms) VALUES(?,?,?,?) RETURNING *`)
        .get(user, paper.id, now, now + paper.duration_min * 60000) as Attempt;
      return fullAttempt(db, a, paper, now);
    }).immediate();
    res.json(result);
  });
  router.get("/attempts/:id", (req, res) => {
    const now = clock();
    expireCourseMocks(db, now);
    const { a, paper } = ownedAttempt(db, req.user!.id, Number(req.params.id));
    res.json(fullAttempt(db, a, paper, now));
  });
  router.put("/attempts/:id/progress", (req, res) => {
    const patch = progressInput.parse(req.body);
    const result = db.transaction(() => {
      const now = clock();
      expireCourseMocks(db, now);
      const { a, paper } = ownedAttempt(db, req.user!.id, Number(req.params.id));
      const ack = { revision: a.revision, server_now_ms: now, deadline_ms: a.deadline_ms };
      if (a.finished_ms !== null) return { ...ack, status: "completed" };
      guardRevision(a, patch.revision);
      const changes = patch.changes ?? [];
      if ((patch.position ?? 1) > paper.question_count || changes.some((c) => c.position > paper.question_count)) {
        throw new RequestError(400, "Invalid question position");
      }
      const answers = JSON.parse(a.responses) as Record<string, ResponseState>;
      for (const { position, choice, flagged } of changes) {
        const answer = answers[position] ?? { choice: null, flagged: false };
        if (choice !== undefined) answer.choice = choice;
        if (flagged !== undefined) answer.flagged = flagged;
        answers[position] = answer;
      }
      db.prepare(`UPDATE course_mock_attempts SET responses=?,current_position=?,revision=revision+1 WHERE id=?`)
        .run(JSON.stringify(answers), patch.position ?? a.current_position, a.id);
      return { ...ack, revision: a.revision + 1, status: "in_progress" };
    }).immediate();
    res.json(result);
  });
  router.post("/attempts/:id/finish", (req, res) => {
    const data = z.object({ revision: revision.optional() }).strict().parse(req.body ?? {});
    const result = db.transaction(() => {
      const now = clock();
      expireCourseMocks(db, now);
      const { a, paper } = ownedAttempt(db, req.user!.id, Number(req.params.id));
      if (a.finished_ms !== null) return fullAttempt(db, a, paper, now);
      guardRevision(a, data.revision);
      const done = db.prepare(`UPDATE course_mock_attempts SET score=${scoreSql},finished_ms=?,revision=revision+1
        WHERE id=? RETURNING *`).get(now, a.id) as Attempt;
      return fullAttempt(db, done, paper, now);
    }).immediate();
    res.json(result);
  });
  const errors: ErrorRequestHandler = (err, _req, res, next) => {
    if (err instanceof RequestError) res.status(err.status).json({ error: err.message });
    else if (err instanceof z.ZodError) res.status(400).json({ error: "Invalid exam request" });
    else next(err);
  };
  router.use(errors);
  return router;
}
