import type { DB } from "./db.js";
import { hasCatalog, programFilter } from "./api.js";

/** Scope RU's preloaded content to the owner's trial while permission for wider release is pending. */
export function canReadSharedLectures(userId: string) {
  const selected = process.env.SHARED_LECTURE_USERS;
  if (selected === undefined) return process.env.NODE_ENV !== "production";
  const ids = selected.split(",").map((s) => s.trim());
  return ids.includes("*") || ids.includes(userId);
}

export function getLecture(db: DB, userId: string, code: string, no: number) {
  if (!Number.isSafeInteger(no) || !hasCatalog(db, userId)) return undefined;
  const mine = programFilter(db, userId, "course_code");
  return db.prepare(
    `SELECT id, shared_transcript_id FROM course_lectures
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
