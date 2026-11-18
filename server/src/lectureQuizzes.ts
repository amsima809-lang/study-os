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
  stimulus: string | null;
  correct_index: number;
  explanation: string;
  evidence_ms: number;
  evidence_quote: string;
  option_order: string;
  choice: number | null;
};
type Candidate = { id: number; stem: string; kind: string; last_seen: number; last_in_quiz: number; in_first_round: number };
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
      COUNT(DISTINCT CASE WHEN json_extract(i.option_order, '$[' || i.choice || ']') = COALESCE(v.correct_index,q.correct_index)
        THEN lecture_quiz_stem(q.stem) END) AS correct_questions
    FROM lecture_quiz_attempts a JOIN lecture_quiz_items i ON i.attempt_id=a.id
    JOIN lecture_quiz_questions q ON q.id=i.question_id
    LEFT JOIN lecture_quiz_item_snapshots v ON v.attempt_id=i.attempt_id AND v.question_id=i.question_id
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
      `SELECT q.bank_id,i.question_id,i.option_order,i.choice,
      COALESCE(v.stem,q.stem) AS stem, COALESCE(v.options,q.options) AS options,
      COALESCE(v.correct_index,q.correct_index) AS correct_index, COALESCE(v.explanation,q.explanation) AS explanation,
      COALESCE(v.evidence_ms,q.evidence_ms) AS evidence_ms, COALESCE(v.evidence_quote,q.evidence_quote) AS evidence_quote,
      CASE WHEN v.question_id IS NULL THEN q.stimulus ELSE v.stimulus END AS stimulus
    FROM lecture_quiz_items i JOIN lecture_quiz_questions q ON q.id=i.question_id
    LEFT JOIN lecture_quiz_item_snapshots v ON v.attempt_id=i.attempt_id AND v.question_id=i.question_id
    WHERE i.attempt_id=? ORDER BY i.position`
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
    SELECT q.id,q.stem,coalesce(json_extract(q.stimulus,'$.kind'),'standalone') AS kind,coalesce(h.last_seen,0) AS last_seen,coalesce(h.last_in_quiz,0) AS last_in_quiz,
      coalesce(h.in_first_round,0) AS in_first_round FROM lecture_quiz_questions q
    LEFT JOIN history h ON q.id=h.question_id WHERE q.bank_id IN (${marks(banks)})`
    )
    .all(session, slot, session, user, code, ...banks.map((b) => b.bank_id)) as Candidate[];
  const last = previous ? itemsFor(db, previous.id) : [];
  const byId = new Map(candidates.map(q => [q.id, q]));
  const lastStems = new Set(last.map(i => stemKey(byId.get(i.question_id)!.stem)));
  const seen = new Set<string>(), kinds = new Set<string>();
  const chosen: number[] = [];
  let exhibitCount = 0;
  function take(q: Candidate) {
    const key = stemKey(q.stem);
    if (chosen.length === count || seen.has(key)) return;
    chosen.push(q.id);
    seen.add(key);
    kinds.add(q.kind);
    if (q.kind !== "standalone") exhibitCount++;
  }
  for (const item of last) {
    const order = JSON.parse(item.option_order) as number[];
    if (item.choice !== null && order[item.choice] !== item.correct_index) take(byId.get(item.question_id)!);
  }

  // The five initial lecture sets draw disjoint slices, including when opened out of order.
  const available = shuffled(candidates.filter(q => previous || !session || !q.in_first_round));
  const remainingSets = Math.max(1, Math.ceil(available.length / count));
  const exhibitQuota = session && !previous
    ? Math.ceil(available.filter(q => q.kind !== "standalone").length / remainingSets)
    : count;
  const tiers: Candidate[][] = [[], [], []];
  for (const q of available) {
    const rank = !previous && !session ? 0 : lastStems.has(stemKey(q.stem)) ? 2 : Number(q.last_seen > 0);
    tiers[rank].push(q);
  }
  for (const pool of tiers) {
    if (chosen.length === count) break;
    if (previous || session) pool.sort((a, b) => a.last_in_quiz - b.last_in_quiz || a.last_seen - b.last_seen);
    const fits = (q: Candidate) => q.kind === "standalone" || exhibitCount < exhibitQuota;
    // Cover the available exam formats within each freshness tier, then fill remaining places.
    for (const q of pool) if (!kinds.has(q.kind) && fits(q)) take(q);
    for (const q of pool) if (fits(q)) take(q);
  }
  // If duplicates or history limited the regular draw, finish with eligible items in priority order.
  if (chosen.length < count) for (const pool of tiers) for (const q of pool) take(q);
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

type QuizView = { includeAnswers: boolean; exhibits: boolean };
type Exhibit = { title: string; text: string; columns: string[]; rows: string[][] };

function questionText(item: Item, rich: boolean) {
  if (!item.stimulus) return { stem: item.stem };
  const stimulus: Exhibit = JSON.parse(item.stimulus);
  if (rich) return { stem: item.stem, stimulus };
  // Installed clients that predate exhibit rendering still receive every label and value.
  const rows = stimulus.rows.map(row => row.map((value, i) => stimulus.columns[i] + " = " + value).join(" · "));
  return { stem: [stimulus.title, stimulus.text, ...rows, item.stem].filter(Boolean).join("\n\n") };
}

function present(attempt: Attempt, items: Item[], banks: Bank[], view: QuizView) {
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
        ...questionText(item, view.exhibits),
        options: order.map((i) => options[i]),
        session_no: sessions.get(item.bank_id)!,
        ...(item.choice === null ? {} : { choice: item.choice, correct: order[item.choice] === item.correct_index }),
        ...(view.includeAnswers && attempt.score !== null ? feedback(item) : {}),
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

function startAttempt(db: DB, user: string, request: z.infer<typeof startSchema>, view: QuizView) {
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
    return present(latest, itemsFor(db, latest.id), banks, view);
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
    view
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

function saveAnswers(db: DB, user: string, id: number, answers: z.infer<typeof answerSchema>[], wholeQuiz: boolean, exhibits: boolean) {
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
  return { status: 200, data: present(attempt, items, banks, { includeAnswers: wholeQuiz, exhibits }) };
}

export function createLectureQuizRouter(db: DB): Router {
  // Catalog totals and past answers use the same question identity as the randomized draws.
  db.function("lecture_quiz_stem", { deterministic: true }, stemKey);
  const router = Router();
  router.get("/catalog", (req, res) => res.json(db.transaction(() => catalog(db, req.user!.id))()));
  router.post("/start", (req, res) => {
    const request = startSchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ error: "ข้อมูลแบบทดสอบไม่ถูกต้อง" });
    const attempt = db.transaction(() => startAttempt(db, req.user!.id, request.data, { includeAnswers: req.query.feedback !== "on-demand", exhibits: req.query.exhibits === "1" })).immediate();
    return attempt ? res.json(attempt) : res.status(404).json({ error: "ไม่พบแบบทดสอบ" });
  });
  router.get("/attempts/:id", (req, res) => {
    const result = db.transaction(() => {
      const state = ownedAttempt(db, req.user!.id, Number(req.params.id));
      return state && present(state.attempt, state.items, state.banks, { includeAnswers: req.query.feedback !== "on-demand", exhibits: req.query.exhibits === "1" });
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
    const result = db.transaction(() => saveAnswers(db, req.user!.id, Number(req.params.id), [parsed.data], false, req.query.exhibits === "1")).immediate();
    return res.status(result.status).json(result.data);
  });
  // Older clients send their saved draft as one submission.
  router.post("/attempts/:id/submit", (req, res) => {
    const parsed = answersSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "กรุณาตอบคำถามทุกข้อ" });
    const result = db.transaction(() => saveAnswers(db, req.user!.id, Number(req.params.id), parsed.data.answers, true, req.query.exhibits === "1")).immediate();
    return res.status(result.status).json(result.data);
  });
  return router;
}
