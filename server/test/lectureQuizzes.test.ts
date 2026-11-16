import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { openDb, type DB } from "../src/db.js";
import { createLectureQuizRouter } from "../src/lectureQuizzes.js";

type Question = {
  id: number;
  stem: string;
  options: string[];
  session_no: number;
  correct_index?: number;
  choice?: number;
  evidence_quote?: string;
  evidence_ms?: number;
  explanation?: string;
};
type Quiz = {
  id: number;
  session_no: number | null;
  slot: number;
  status: string;
  score: number | null;
  questions: Question[];
};
type Progress = {
  status: string;
  slot: number;
  attempt_id: number | null;
  score: number | null;
  stats: { quizzes_taken: number; correct_questions: number; incorrect_questions: number; total_questions: number };
};
type Course = {
  code: string;
  pool_size: number;
  course_quiz: Progress;
  lectures: { no: number; quizzes: Progress[] }[];
};

const student = "legacy-user-0001",
  other = "other-reader",
  outsider = "outside-trial";
let db: DB, server: Server, base: string;

function bank(sharedId: number | null, privateId: number | null, prefix: string, total = 25) {
  const id = db
    .prepare(
      `INSERT INTO lecture_quiz_banks(shared_transcript_id,private_transcript_id,source_hash,generator_model,prompt_version)
    VALUES(?,?,?,'deepseek-v4-pro','test')`
    )
    .run(sharedId, privateId, "test-hash").lastInsertRowid;
  const insert =
    db.prepare(`INSERT INTO lecture_quiz_questions(bank_id,slot,stem,options,correct_index,explanation,evidence_ms,evidence_quote,concept)
    VALUES(?,?,?,?,?,'Explanation',1234,'Evidence','Concept')`);
  for (let i = 1; i <= total; i++) {
    insert.run(id, i, prefix + " " + i, JSON.stringify(["a", "b", "c", "d"]), i % 4);
  }
  return Number(id);
}

function shared(code: string, no: number, total = 25) {
  const lecture = db
    .prepare("SELECT id,url FROM course_lectures WHERE course_code=? AND session_no=?")
    .get(code, no) as { id: number; url: string };
  db.prepare(`INSERT INTO shared_lecture_transcripts VALUES(?,?,?,?,?,1,5000,'today')`).run(
    lecture.id,
    code,
    no,
    lecture.url,
    '[{"startMs":0,"endMs":5000,"text":"Evidence"}]'
  );
  // Accounting uses the same recording URL in two majors.
  db.prepare("UPDATE course_lectures SET shared_transcript_id=? WHERE url=?").run(lecture.id, lecture.url);
  return bank(lecture.id, null, code + "-" + no, total);
}

beforeEach(async () => {
  vi.stubEnv("SHARED_LECTURE_USERS", student + "," + other);
  db = openDb(":memory:");
  for (const user of [other, outsider]) {
    db.prepare(
      "INSERT INTO users (id,email,name,created_at,last_login_at) VALUES(?,?,?,datetime('now'),datetime('now'))"
    ).run(user, user + "@example.test", user);
  }
  for (const user of [student, other, outsider]) {
    db.prepare(
      "INSERT OR REPLACE INTO user_profiles(user_id,program_id,university_id) VALUES(?,'bus-mkt','ru')"
    ).run(user);
  }
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: req.get("x-user") ?? student } as Express.User;
    next();
  });
  app.use(createLectureQuizRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  vi.unstubAllEnvs();
});

function request(path: string, data?: object, user = student) {
  return fetch(base + path, {
    method: data ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-user": user },
    body: data ? JSON.stringify(data) : undefined,
  });
}
async function list(user = student) {
  return ((await (await request("/catalog", undefined, user)).json()) as { courses: Course[] }).courses;
}
async function start(
  session: number | null,
  slot: number,
  previous: number | null = null,
  code = "MGT3204",
  user = student
) {
  const r = await request(
    "/start",
    { course_code: code, session_no: session, slot, previous_attempt_id: previous },
    user
  );
  expect(r.status).toBe(200);
  return (await r.json()) as Quiz;
}
function answers(quiz: Quiz, missed: number[] = []) {
  return quiz.questions.map((q) => {
    const row = db.prepare("SELECT options, correct_index FROM lecture_quiz_questions WHERE id=?").get(q.id) as {
      options: string;
      correct_index: number;
    };
    const correct = q.options.indexOf(JSON.parse(row.options)[row.correct_index]);
    return { question_id: q.id, choice: missed.includes(q.id) ? (correct + 1) % 4 : correct };
  });
}
async function grade(quiz: Quiz, missed: number[] = []) {
  const r = await request("/attempts/" + quiz.id + "/submit", { answers: answers(quiz, missed) });
  expect(r.status).toBe(200);
  return (await r.json()) as Quiz;
}
const ids = (quiz: Quiz) => quiz.questions.map((q) => q.id);

describe("lecture and course transcript quizzes", () => {
  it("counts completed rounds and distinct questions for each student's quiz across retakes", async () => {
    shared("MGT3204", 1);
    const fresh = { quizzes_taken: 0, correct_questions: 0, incorrect_questions: 0, total_questions: 25 };
    const first = await start(1, 1);
    expect((await list())[0].lectures[0].quizzes[0].stats).toEqual(fresh);

    const missed = ids(first).slice(0, 2);
    await grade(first, missed);
    await grade(first, missed); // a retry of the same submission
    const retry = await start(1, 1, first.id);
    expect((await list())[0].lectures[0].quizzes[0].stats).toEqual({
      ...fresh, quizzes_taken: 1, correct_questions: 3, incorrect_questions: 2,
    });
    await grade(retry, [missed[0]]);
    const secondSlot = await start(1, 2);
    await grade(secondSlot, ids(secondSlot));
    const course = await start(null, 1);
    const afterLecture = (await list())[0];
    expect(afterLecture.lectures[0].quizzes.map((s) => s.stats)).toEqual([
      { ...fresh, quizzes_taken: 2, correct_questions: 7, incorrect_questions: 1 },
      { ...fresh, quizzes_taken: 1, incorrect_questions: 5 }, fresh, fresh, fresh,
    ]);
    expect(afterLecture.course_quiz.stats).toEqual(fresh);

    await grade(course, ids(course));
    expect((await list())[0].course_quiz.stats).toEqual({ ...fresh, quizzes_taken: 1, incorrect_questions: 25 });
    const corrected = await start(null, 1, course.id);
    await grade(corrected);
    const recycled = await start(null, 1, corrected.id);
    await grade(recycled, ids(recycled));
    const afterCourse = (await list())[0];
    expect(afterCourse.course_quiz.stats).toEqual({ ...fresh, quizzes_taken: 3, correct_questions: 25 });
    expect(afterCourse.lectures).toEqual(afterLecture.lectures);
    const anotherStudent = (await list(other))[0];
    expect(anotherStudent.course_quiz.stats).toEqual(fresh);
    expect(anotherStudent.lectures[0].quizzes.every((s) => s.stats.quizzes_taken === 0)).toBe(true);
  });

  it("deals all 25 questions across five first quizzes, even out of order and interleaved with retakes", async () => {
    shared("MGT3204", 1);
    const firsts: number[] = [];
    const [a, b] = await Promise.all([start(1, 4), start(1, 4)]);
    expect(a).toEqual(b);
    expect(a.questions.every((q) => q.options.length === 4 && new Set(q.options).size === 4)).toBe(true);
    expect(a.questions[0]).not.toHaveProperty("correct_index");
    expect(a.questions[0]).not.toHaveProperty("evidence_quote");
    expect(a.questions[0]).not.toHaveProperty("explanation");
    firsts.push(...ids(a));
    const missed = ids(a).slice(1, 3);
    const graded = await grade(a, missed);
    expect(graded.score).toBe(3);
    expect(graded.questions[0]).toMatchObject({
      evidence_ms: 1234,
      evidence_quote: "Evidence",
      explanation: "Explanation",
    });
    const [retry, replay] = await Promise.all([start(1, 4, a.id), start(1, 4, a.id)]);
    expect(retry).toEqual(replay);
    expect(retry.id).not.toBe(a.id);
    expect(
      ids(retry)
        .filter((id) => ids(a).includes(id))
        .sort()
    ).toEqual(missed.sort());
    const remainingMiss = [retry.questions[0].id];
    await grade(retry, remainingMiss);
    const third = await start(1, 4, retry.id);
    expect(ids(third).filter((id) => ids(retry).includes(id))).toEqual(remainingMiss);
    expect(
      ids(third)
        .filter((id) => !remainingMiss.includes(id))
        .every((id) => !ids(a).includes(id))
    ).toBe(true);
    for (const slot of [5, 2, 1, 3]) firsts.push(...ids(await start(1, slot)));
    expect(firsts.length).toBe(25);
    expect(new Set(firsts).size).toBe(25);
    const catalog = await list();
    expect(catalog).toHaveLength(1);
    expect(catalog[0].lectures[0].quizzes[3]).toMatchObject({
      slot: 4,
      status: "in_progress",
      attempt_id: third.id,
    });
    expect((await list(other))[0].lectures[0].quizzes.every((q) => q.status === "new")).toBe(true);
  });

  it("uses the course pool, retains every latest miss and prioritizes fresh questions", async () => {
    const firstBank = shared("MGT3204", 1),
      secondBank = shared("MGT3204", 2);
    // One duplicated stem across recordings may not appear twice within the same course attempt.
    db.prepare(
      "UPDATE lecture_quiz_questions SET stem=(SELECT upper(stem) || ' ' FROM lecture_quiz_questions WHERE bank_id=? AND slot=1) WHERE bank_id=? AND slot=1"
    ).run(firstBank, secondBank);
    const course = await start(null, 1);
    expect(course.questions).toHaveLength(25);
    expect(new Set(course.questions.map((q) => q.stem)).size).toBe(25);
    expect((await list())[0].pool_size).toBe(49);
    const missed = ids(course).slice(0, 3);
    await grade(course, missed);
    const retry = await start(null, 1, course.id);
    expect(new Set([...course.questions, ...retry.questions].map((q) => q.session_no))).toEqual(new Set([1, 2]));
    expect(
      ids(retry)
        .filter((id) => missed.includes(id))
        .sort()
    ).toEqual(missed.sort());
    const seen = new Set(course.questions.map((q) => q.stem));
    expect(retry.questions.filter((q) => !missed.includes(q.id)).every((q) => !seen.has(q.stem))).toBe(true);
    await grade(retry, ids(retry));
    const allMissed = await start(null, 1, retry.id);
    expect(new Set(ids(allMissed))).toEqual(new Set(ids(retry)));
    const catalog = (await list())[0];
    expect(catalog.course_quiz.stats).toEqual({
      quizzes_taken: 2, total_questions: 49, correct_questions: 22, incorrect_questions: 25,
    });
    expect(catalog.lectures.flatMap((s) => s.quizzes).every((q) => q.status === "new")).toBe(true);
  });

  it("validates and grades once in stored display order, including when an exhausted pool must recycle", async () => {
    shared("MGT3204", 1);
    const quiz = await start(null, 1),
      path = "/attempts/" + quiz.id + "/submit",
      valid = answers(quiz);
    for (const bad of [
      valid.slice(1),
      valid.map(() => valid[0]),
      valid.map((a) => ({ ...a, choice: 4 })),
      valid.map((a) => ({ ...a, question_id: 99999 })),
    ]) {
      expect((await request(path, { answers: bad })).status).toBe(400);
    }
    expect(((await (await request("/attempts/" + quiz.id)).json()) as Quiz).score).toBeNull();
    const submitted = await grade(quiz);
    expect(submitted.score).toBe(25);
    expect(submitted.questions.every((q) => q.correct_index === q.choice)).toBe(true);
    expect((await request(path, { answers: valid })).status).toBe(200);
    expect((await request(path, { answers: answers(quiz, ids(quiz)) })).status).toBe(409);
    expect(await start(null, 1)).toEqual(submitted);
    expect(new Set(ids(await start(null, 1, quiz.id)))).toEqual(new Set(ids(quiz)));
  });

  it("drops past progress on revoked recordings while keeping progress on accessible ones", async () => {
    shared("ACC1101", 1);
    const pastCourse = await start(null, 1, null, "ACC1103");
    await grade(pastCourse);
    const pastLecture = await start(1, 1, null, "ACC1103");
    await grade(pastLecture);

    const privateId = db.prepare(`INSERT INTO lecture_transcripts(user_id,course_code,session_no,source,cues,cue_count,duration_ms)
      VALUES(?,'ACC1103',2,'my-copy','[]',1,5000)`).run(student).lastInsertRowid;
    bank(null, Number(privateId), "Own recording");
    const own = await start(2, 1, null, "ACC1103");
    await grade(own, [own.questions[0].id]);
    const before = (await list())[0];
    expect(before.course_quiz.stats).toEqual({
      quizzes_taken: 1, correct_questions: 25, incorrect_questions: 0, total_questions: 50,
    });
    vi.stubEnv("SHARED_LECTURE_USERS", other);
    const retained = (await list())[0];
    expect(retained.lectures.map((l) => l.no)).toEqual([2]);
    expect(retained.course_quiz.stats).toEqual({
      quizzes_taken: 0, correct_questions: 0, incorrect_questions: 0, total_questions: 25,
    });
    expect(retained.lectures[0].quizzes[0].stats).toEqual({
      quizzes_taken: 1, correct_questions: 4, incorrect_questions: 1, total_questions: 25,
    });
  });

  it("enforces programme aliases, shared allowlist, account ownership, bank completeness and source revocation", async () => {
    shared("ACC1101", 1);
    shared("MGT3204", 1, 24);
    const privateId = Number(
      db
        .prepare(
          `INSERT INTO lecture_transcripts(user_id,course_code,session_no,source,cues,cue_count,duration_ms)
      VALUES(?,'ACC1103',1,'my-copy','[]',1,5000)`
        )
        .run(outsider).lastInsertRowid
    );
    bank(null, privateId, "Private");
    expect((await list()).map((c) => c.code)).toEqual(["ACC1103"]);
    expect((await list(outsider)).map((c) => c.code)).toEqual(["ACC1103"]);
    const sharedQuiz = await start(1, 1, null, "ACC1103"),
      privateQuiz = await start(1, 1, null, "ACC1103", outsider);
    expect(sharedQuiz.questions.every((q) => q.stem.startsWith("ACC1101"))).toBe(true);
    expect(privateQuiz.questions.every((q) => q.stem.startsWith("Private"))).toBe(true);
    const path = "/attempts/" + sharedQuiz.id;
    expect((await request(path, undefined, other)).status).toBe(404);
    expect((await request(path + "/submit", { answers: answers(sharedQuiz) }, other)).status).toBe(404);
    await grade(sharedQuiz);
    expect((await request(path, undefined, other)).status).toBe(404);
    expect(
      (
        await request(
          "/start",
          { course_code: "ACC1103", session_no: 1, slot: 1, previous_attempt_id: sharedQuiz.id },
          other
        )
      ).status
    ).toBe(404);
    vi.stubEnv("SHARED_LECTURE_USERS", other);
    expect(await list()).toEqual([]);
    expect((await request(path)).status).toBe(404);
    db.prepare("UPDATE user_profiles SET program_id='bus-acc' WHERE user_id=?").run(other);
    expect((await list(other)).map((c) => c.code)).toEqual(["ACC1101"]);
    db.prepare("UPDATE lecture_transcripts SET cues='[1]' WHERE id=?").run(privateId);
    expect(await list(outsider)).toEqual([]);
    expect((await request("/attempts/" + privateQuiz.id, undefined, outsider)).status).toBe(404);
    expect(db.prepare("SELECT 1 FROM lecture_quiz_attempts WHERE id=?").get(privateQuiz.id)).toBeUndefined();
  });
});
