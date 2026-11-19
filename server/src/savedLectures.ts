import type { DB } from "./db.js";
import { hasCatalog, programFilter } from "./api.js";

export type LectureNoteMode = "separate" | "combined";

export function lectureNoteMode(db: DB, user: string, lectureId: number): LectureNoteMode {
  const row = db.prepare("SELECT mode FROM lecture_note_layouts WHERE user_id = ? AND lecture_id = ?")
    .get(user, lectureId) as { mode: LectureNoteMode } | undefined;
  return row?.mode ?? "separate";
}

/** Scope RU's preloaded content to the owner's trial while permission for wider release is pending. */
export function canReadSharedLectures(userId: string) {
  const selected = process.env.SHARED_LECTURE_USERS;
  if (selected === undefined) return process.env.NODE_ENV !== "production";
  const ids = selected.split(",").map((s) => s.trim());
  return ids.includes("*") || ids.includes(userId);
}

/**
 * Accounts whose lecture list shows only their own term's courses (OWN_COURSES_ONLY_USERS, comma-
 * separated ids). Everyone else with shared access also sees the other recorded subjects, folded.
 */
export function ownCoursesOnly(userId: string) {
  return (process.env.OWN_COURSES_ONLY_USERS ?? "").split(",").map((s) => s.trim()).includes(userId);
}

/** One listing per preloaded recording. Prefer the student's programme code when a recording has aliases. */
export function lectureFilter(db: DB, userId: string) {
  const mine = programFilter(db, userId, "cl.course_code");
  if (!canReadSharedLectures(userId)) return mine;
  const program = mine.params[0] ?? null;
  return {
    sql: ` AND ((cl.shared_transcript_id IS NULL${mine.sql}) OR cl.id = (
      SELECT alias.id FROM course_lectures alias WHERE alias.shared_transcript_id = cl.shared_transcript_id
      ORDER BY EXISTS (SELECT 1 FROM program_courses pc WHERE pc.course_code = alias.course_code AND pc.program_id = ?) DESC,
               (alias.id = alias.shared_transcript_id) DESC, alias.id LIMIT 1
    ))`,
    params: [...mine.params, program],
  };
}

export function getLecture(db: DB, userId: string, code: string, no: number) {
  if (!Number.isSafeInteger(no) || !hasCatalog(db, userId)) return undefined;
  const mine = lectureFilter(db, userId);
  return db.prepare(
    `SELECT id, shared_transcript_id FROM course_lectures cl
     WHERE course_code = ? AND session_no = ? AND source = 'ru-vod-subtitle'${mine.sql}`,
  ).get(code, no, ...mine.params) as { id: number; shared_transcript_id: number | null } | undefined;
}

export function getLectureSummary(db: DB, userId: string, code: string, no: number) {
  if (!canReadSharedLectures(userId)) return undefined;
  const lecture = getLecture(db, userId, code, no);
  if (!lecture?.shared_transcript_id) return undefined;
  const row = db.prepare(
    `SELECT original.summary_md AS original_md, mine.summary_md AS edited_md
     FROM shared_lecture_summaries original
     LEFT JOIN student_lecture_summaries mine ON mine.user_id = ? AND mine.lecture_id = ?
     WHERE original.transcript_id = ?`,
  ).get(userId, lecture.id, lecture.shared_transcript_id) as { original_md: string; edited_md: string | null } | undefined;
  if (!row) return undefined;
  return { lecture_id: lecture.id, summary_md: row.edited_md ?? row.original_md, original_md: row.original_md, edited: row.edited_md !== null };
}
