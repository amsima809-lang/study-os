import { randomInt } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { hasCatalog } from "./api.js";
import type { DB } from "./db.js";
import { canReadSharedLectures, lectureFilter } from "./savedLectures.js";

type Bank = { bank_id: number; code: string; name_th: string; name_en: string | null; no: number };
type Attempt = { id: number; course_code: string; session_no: number; slot: number; score: number | null };
type Progress = {
  slot: number;
  attempt_id: number | null;
  status: "new" | "in_progress" | "completed";
  score: number | null;
  stats: { quizzes_taken: number; correct_questions: number; incorrect_questions: number; total_questions: number };
};
type AnswerCounts = { session_no: number; slot: number; quizzes_taken: number; correct_questions: number; answered_questions: number };
type Item = {
  question_id: number;
  bank_id: number;
  stem: string;
  options: string;
  correct_index: number;
  explanation: string;
  evidence_ms: number;
  evidence_quote: string;
  option_order: string;
  choice: number | null;
};
type Candidate = { id: number; stem: string; last_seen: number; last_in_quiz: number; in_first_round: number };
const bankSize = 25,
  lectureSize = 5;

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; --i) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function marks(items: unknown[]) {
  return items.map(() => "?").join(",");
}

/** Use precisely the same programme, canonical recording, and shared-over-private precedence as the reader. */
function visibleBanks(db: DB, user: string, code?: string): Bank[] {
  if (!hasCatalog(db, user)) return [];
  const filter = lectureFilter(db, user);
  return db
    .prepare(
      `
    SELECT b.id AS bank_id, cl.course_code AS code, c.name_th, c.name_en, cl.session_no AS no
    FROM course_lectures cl JOIN courses c ON c.code=cl.course_code
    LEFT JOIN shared_lecture_transcripts st ON st.id=cl.shared_transcript_id AND ?=1
    LEFT JOIN lecture_transcripts pt ON st.id IS NULL AND pt.user_id=? AND pt.course_code=cl.course_code AND pt.session_no=cl.session_no
    JOIN lecture_quiz_banks b ON b.shared_transcript_id=st.id OR b.private_transcript_id=pt.id
    WHERE cl.source='ru-vod-subtitle' AND (SELECT COUNT(*) FROM lecture_quiz_questions q WHERE q.bank_id=b.id)=?
    ${code ? "AND cl.course_code=?" : ""} ${filter.sql}
    ORDER BY cl.course_code,cl.session_no`
    )
    .all(Number(canReadSharedLectures(user)), user, bankSize, ...(code ? [code] : []), ...filter.params) as Bank[];
}

/** Revoking any source hides the entire attempt, including its contribution to progress. */
function visibleAttemptFilter(banks: Bank[]) {
  return `a.user_id=? AND a.course_code=? AND NOT EXISTS (
    SELECT 1 FROM lecture_quiz_items i JOIN lecture_quiz_questions q ON q.id=i.question_id
    WHERE i.attempt_id=a.id AND q.bank_id NOT IN (${marks(banks)}))`;
}

function latestAttempts(db: DB, user: string, banks: Bank[]): Attempt[] {
  if (!banks.length) return [];
  return db
    .prepare(
      `SELECT * FROM lecture_quiz_attempts WHERE id IN (
    SELECT MAX(a.id) FROM lecture_quiz_attempts a WHERE ${visibleAttemptFilter(banks)}
    GROUP BY a.session_no,a.slot)`
    )
    .all(user, banks[0].code, ...banks.map((b) => b.bank_id)) as Attempt[];
}

function answerCounts(db: DB, user: string, banks: Bank[]): AnswerCounts[] {
  return db.prepare(`
    SELECT a.session_no, a.slot, COUNT(DISTINCT a.id) AS quizzes_taken,
      COUNT(DISTINCT lecture_quiz_stem(q.stem)) AS answered_questions,
      COUNT(DISTINCT CASE WHEN json_extract(i.option_order, '$[' || i.choice || ']') = q.correct_index
        THEN lecture_quiz_stem(q.stem) END) AS correct_questions
    FROM lecture_quiz_attempts a JOIN lecture_quiz_items i ON i.attempt_id=a.id
    JOIN lecture_quiz_questions q ON q.id=i.question_id
    WHERE a.score IS NOT NULL AND i.choice IS NOT NULL AND ${visibleAttemptFilter(banks)}
    GROUP BY a.session_no, a.slot
  `).all(user, banks[0].code, ...banks.map((b) => b.bank_id)) as AnswerCounts[];
}

function progress(latest: Attempt[], counts: AnswerCounts[], session: number, slot: number, total: number): Progress {
  const a = latest.find((a) => a.session_no === session && a.slot === slot);
  const count = counts.find((c) => c.session_no === session && c.slot === slot);
  const correct = count?.correct_questions ?? 0;
  return {
    slot,
    attempt_id: a?.id ?? null,
    status: !a ? "new" : a.score === null ? "in_progress" : "completed",
    score: a?.score ?? null,
    stats: {
      quizzes_taken: count?.quizzes_taken ?? 0,
      correct_questions: correct,
      incorrect_questions: (count?.answered_questions ?? 0) - correct,
      total_questions: total,
    },
  };
}

function catalog(db: DB, user: string) {
  const groups = new Map<string, Bank[]>();
  for (const bank of visibleBanks(db, user)) {
    const group = groups.get(bank.code) ?? [];
    group.push(bank);
    groups.set(bank.code, group);
  }
  return {
    courses: Array.from(groups.values(), (banks) => {
      const { code, name_th, name_en } = banks[0];
      const latest = latestAttempts(db, user, banks);
      const counts = answerCounts(db, user, banks);
      const sizes = db.prepare(`
        WITH available AS (SELECT bank_id, lecture_quiz_stem(stem) AS stem FROM lecture_quiz_questions
          WHERE bank_id IN (${marks(banks)}))
        SELECT bank_id, COUNT(DISTINCT stem) AS n FROM available GROUP BY bank_id
        UNION ALL SELECT NULL, COUNT(DISTINCT stem) FROM available
      `).all(...banks.map((b) => b.bank_id)) as { bank_id: number | null; n: number }[];
      const poolSize = new Map(sizes.map((s) => [s.bank_id, s.n]));
      const courseTotal = poolSize.get(null)!;
      return {
        code,
        name_th,
        name_en,
        pool_size: courseTotal,
        course_quiz: progress(latest, counts, 0, 1, courseTotal),
        lectures: banks.map((b) => ({
          no: b.no,
          quizzes: Array.from({ length: 5 }, (_, i) => progress(latest, counts, b.no, i + 1, poolSize.get(b.bank_id)!)),
        })),
      };
    }),
  };
}

function itemsFor(db: DB, attempt: number) {
  return db
    .prepare(
      `SELECT q.*,i.question_id,i.option_order,i.choice FROM lecture_quiz_items i
    JOIN lecture_quiz_questions q ON q.id=i.question_id WHERE i.attempt_id=? ORDER BY i.position`
    )
    .all(attempt) as Item[];
}

const stemKey = (stem: string) => stem.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();

function drawQuestions(db: DB, user: string, banks: Bank[], session: number, slot: number, previous?: Attempt) {
  const code = banks[0].code;
  const count = session ? lectureSize : bankSize;
  const candidates = db
    .prepare(
      `
    WITH history AS (
      SELECT i.question_id,MAX(a.id) AS last_seen,
        MAX(CASE WHEN a.session_no=? AND a.slot=? THEN a.id ELSE 0 END) AS last_in_quiz,
        MAX(CASE WHEN a.session_no=? AND a.initial=1 THEN 1 ELSE 0 END) AS in_first_round
      FROM lecture_quiz_attempts a JOIN lecture_quiz_items i ON i.attempt_id=a.id
      WHERE a.user_id=? AND a.course_code=? GROUP BY i.question_id
    )
    SELECT q.id,q.stem,coalesce(h.last_seen,0) AS last_seen,coalesce(h.last_in_quiz,0) AS last_in_quiz,
      coalesce(h.in_first_round,0) AS in_first_round FROM lecture_quiz_questions q
    LEFT JOIN history h ON q.id=h.question_id WHERE q.bank_id IN (${marks(banks)})`
    )
    .all(session, slot, session, user, code, ...banks.map((b) => b.bank_id)) as Candidate[];
  const last = previous ? itemsFor(db, previous.id) : [];
  const lastStems = new Set(last.map((i) => stemKey(i.stem)));
  const seen = new Set<string>();
  const chosen: number[] = [];
  for (const item of last) {
    const order = JSON.parse(item.option_order) as number[];
    if (item.choice !== null && order[item.choice] !== item.correct_index) {
      seen.add(stemKey(item.stem));
      chosen.push(item.question_id);
    }
  }
  // The five first attempts form disjoint slices of this student's random lecture deck,
  // even when they open the slots out of order and interleave retakes.
  const available = shuffled(candidates.filter((q) => previous || !session || !q.in_first_round));
  if (previous || session) {
    available.sort(
      (a, b) =>
        Number(lastStems.has(stemKey(a.stem))) - Number(lastStems.has(stemKey(b.stem))) ||
        Number(a.last_seen > 0) - Number(b.last_seen > 0) ||
        a.last_in_quiz - b.last_in_quiz ||
        a.last_seen - b.last_seen
    );
  }
  for (const q of available) {
    if (chosen.length === count) break;
    const key = stemKey(q.stem);
    if (!seen.has(key)) {
      seen.add(key);
      chosen.push(q.id);
    }
  }
  return chosen.length === count ? shuffled(chosen) : null;
}

function feedback(item: Item) {
  return {
    correct_index: (JSON.parse(item.option_order) as number[]).indexOf(item.correct_index),
    explanation: item.explanation,
    evidence_ms: item.evidence_ms,
    evidence_quote: item.evidence_quote,
  };
}

function present(attempt: Attempt, items: Item[], banks: Bank[], legacyReview: boolean) {
  const sessions = new Map(banks.map((b) => [b.bank_id, b.no]));
  return {
    id: attempt.id,
    course_code: attempt.course_code,
    session_no: attempt.session_no || null,
    slot: attempt.slot,
    status: attempt.score === null ? "in_progress" : "completed",
    score: attempt.score,
    questions: items.map((item) => {
      const order = JSON.parse(item.option_order) as number[],
        options = JSON.parse(item.options) as string[];
      return {
        id: item.question_id,
        stem: item.stem,
        options: order.map((i) => options[i]),
        session_no: sessions.get(item.bank_id)!,
        ...(item.choice === null ? {} : { choice: item.choice, correct: order[item.choice] === item.correct_index }),
        ...(legacyReview && attempt.score !== null ? feedback(item) : {}),
      };
    }),
  };
}

const startSchema = z
  .object({
    course_code: z.string().regex(/^[A-Z]{3}\d{4}$/),
    session_no: z.number().int().positive().nullable().default(null),
    slot: z.number().int().min(1).max(5).default(1),
    previous_attempt_id: z.number().int().positive().nullable().default(null),
  })
  .refine((s) => s.session_no !== null || s.slot === 1);
const answerSchema = z.object({
  question_id: z.number().int().positive(),
  choice: z.number().int().min(0).max(3),
});
const answersSchema = z.object({ answers: z.array(answerSchema).min(lectureSize).max(bankSize) });

function startAttempt(db: DB, user: string, request: z.infer<typeof startSchema>, legacyReview: boolean) {
  const session = request.session_no ?? 0;
  const banks = visibleBanks(db, user, request.course_code).filter((b) => !session || b.no === session);
  if (!banks.length) return null;
  const latest = latestAttempts(db, user, banks).find((a) => a.session_no === session && a.slot === request.slot);
  if (
    request.previous_attempt_id !== null &&
    !db
      .prepare(
        `SELECT 1 FROM lecture_quiz_attempts
    WHERE user_id=? AND course_code=? AND session_no=? AND slot=? AND id=? AND score IS NOT NULL`
      )
      .get(user, request.course_code, session, request.slot, request.previous_attempt_id)
  )
    return null;
  // Two tabs or a lost HTTP response resume the same attempt. A retake must name its graded parent.
  if (latest && (latest.score === null || latest.id !== request.previous_attempt_id)) {
    return present(latest, itemsFor(db, latest.id), banks, legacyReview);
  }
  const ids = drawQuestions(db, user, banks, session, request.slot, latest);
  if (!ids) return null;
  const id = Number(
    db
      .prepare(
        `INSERT INTO lecture_quiz_attempts(user_id,course_code,session_no,slot,initial)
    VALUES(?,?,?,?,?)`
      )
      .run(user, request.course_code, session, request.slot, Number(!latest)).lastInsertRowid
  );
  const add = db.prepare(
    "INSERT INTO lecture_quiz_items(attempt_id,question_id,position,option_order) VALUES(?,?,?,?)"
  );
  ids.forEach((q, i) => add.run(id, q, i, JSON.stringify(shuffled([0, 1, 2, 3]))));
  return present(
    { id, course_code: request.course_code, session_no: session, slot: request.slot, score: null },
    itemsFor(db, id),
    banks,
    legacyReview
  );
}

function ownedAttempt(db: DB, user: string, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const attempt = db.prepare("SELECT * FROM lecture_quiz_attempts WHERE id=? AND user_id=?").get(id, user) as
    Attempt | undefined;
  if (!attempt) return null;
  const banks = visibleBanks(db, user, attempt.course_code).filter(
    (b) => !attempt.session_no || b.no === attempt.session_no
  );
  const allowed = new Set(banks.map((b) => b.bank_id));
  const items = itemsFor(db, id);
  if (items.length !== (attempt.session_no ? lectureSize : bankSize) || items.some((i) => !allowed.has(i.bank_id)))
    return null;
  return { attempt, items, banks };
}

function saveAnswers(db: DB, user: string, id: number, answers: z.infer<typeof answerSchema>[], wholeQuiz: boolean) {
  const state = ownedAttempt(db, user, id);
  if (!state) return { status: 404, data: { error: "ไม่พบแบบทดสอบ" } };
  const { attempt, items, banks } = state;
  const choices = new Map(answers.map(a => [a.question_id, a.choice]));
  const selected = items.filter(i => choices.has(i.question_id));
  if (selected.length !== answers.length || (wholeQuiz && selected.length !== items.length)) {
    return { status: 400, data: { error: "คำตอบไม่ตรงกับข้อในแบบทดสอบนี้" } };
  }
  if (selected.some(i => i.choice !== null && i.choice !== choices.get(i.question_id))) {
    return { status: 409, data: { error: "บันทึกคำตอบข้อนี้แล้ว" } };
  }
  const update = db.prepare("UPDATE lecture_quiz_items SET choice=? WHERE attempt_id=? AND question_id=?");
  for (const item of selected) {
    if (item.choice !== null) continue;
    item.choice = choices.get(item.question_id)!;
    update.run(item.choice, id, item.question_id);
  }
  if (attempt.score === null && items.every(i => i.choice !== null)) {
    attempt.score = items.filter(i => JSON.parse(i.option_order)[i.choice!] === i.correct_index).length;
    db.prepare("UPDATE lecture_quiz_attempts SET score=?,submitted_at=datetime('now') WHERE id=?").run(attempt.score, id);
  }
  return { status: 200, data: present(attempt, items, banks, wholeQuiz) };
}

export function createLectureQuizRouter(db: DB): Router {
  // Catalog totals and past answers use the same question identity as the randomized draws.
  db.function("lecture_quiz_stem", { deterministic: true }, stemKey);
  const router = Router();
  router.get("/catalog", (req, res) => res.json(db.transaction(() => catalog(db, req.user!.id))()));
  router.post("/start", (req, res) => {
    const request = startSchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ error: "ข้อมูลแบบทดสอบไม่ถูกต้อง" });
    const attempt = db.transaction(() => startAttempt(db, req.user!.id, request.data, req.query.feedback !== "on-demand")).immediate();
    return attempt ? res.json(attempt) : res.status(404).json({ error: "ไม่พบแบบทดสอบ" });
  });
  router.get("/attempts/:id", (req, res) => {
    const result = db.transaction(() => {
      const state = ownedAttempt(db, req.user!.id, Number(req.params.id));
      return state && present(state.attempt, state.items, state.banks, req.query.feedback !== "on-demand");
    })();
    return result ? res.json(result) : res.status(404).json({ error: "ไม่พบแบบทดสอบ" });
  });
  router.get("/attempts/:id/questions/:questionId/explanation", (req, res) => {
    const result = db.transaction(() => {
      const state = ownedAttempt(db, req.user!.id, Number(req.params.id));
      const item = state?.items.find(i => i.question_id === Number(req.params.questionId));
      return item && item.choice !== null ? feedback(item) : null;
    })();
    return result ? res.json(result) : res.status(404).json({ error: "ไม่พบคำอธิบายของคำตอบนี้" });
  });
  router.post("/attempts/:id/answer", (req, res) => {
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "คำตอบไม่ถูกต้อง" });
    const result = db.transaction(() => saveAnswers(db, req.user!.id, Number(req.params.id), [parsed.data], false)).immediate();
    return res.status(result.status).json(result.data);
  });
  // Older clients send their saved draft as one submission.
  router.post("/attempts/:id/submit", (req, res) => {
    const parsed = answersSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "กรุณาตอบคำถามทุกข้อ" });
    const result = db.transaction(() => saveAnswers(db, req.user!.id, Number(req.params.id), parsed.data.answers, true)).immediate();
    return res.status(result.status).json(result.data);
  });
  return router;
}
