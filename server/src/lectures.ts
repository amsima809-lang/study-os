/**
 * Catalogue lectures, shared originals, and private student imports and edits.
 *
 * Transcripts arrive as a "bundle" produced by the collector script
 * (client/public/collector/ru-vod.js), which runs on the university's lecture
 * site in the student's own signed-in browser. StudyOS never signs in to that
 * site and never sees the student's university password.
 */
import { Router } from "express";
import { z } from "zod";
import type { DB } from "./db.js";
import { hasCatalog, programFilter } from "./api.js";

import { canReadSharedLectures, getLecture, getLectureSummary } from "./savedLectures.js";

const Cue = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  text: z.string().max(2000),
});

export const Bundle = z.object({
  format: z.literal("studyos-lecture-transcripts"),
  version: z.literal(1),
  source: z.string().min(1).max(40),
  subject_label: z.string().max(120).optional(),
  course_codes: z.array(z.string().regex(/^[A-Z]{3}\d{4}$/)).min(1).max(6),
  sessions: z
    .array(
      z.object({
        no: z.number().int().min(1).max(99),
        url: z.string().url().max(300).optional(),
        cues: z.array(Cue).min(1).max(20000),
      }),
    )
    .min(1)
    .max(60),
});
export type Bundle = z.infer<typeof Bundle>;

/**
 * Save a bundle for one student. A recording can cover two course codes
 * (ACC1101_ACC1103): it is saved under each code that is one of the student's
 * own courses. Importing the same lecture again replaces the earlier copy.
 */
export function importBundle(db: DB, userId: string, bundle: Bundle): { courses: string[]; saved: number } {
  const mine = programFilter(db, userId, "code");
  const marks = bundle.course_codes.map(() => "?").join(",");
  const courses = (
    db
      .prepare(`SELECT code FROM courses WHERE code IN (${marks})${mine.sql} ORDER BY code`)
      .all(...bundle.course_codes, ...mine.params) as { code: string }[]
  ).map((r) => r.code);
  if (courses.length === 0) return { courses: [], saved: 0 };

  const upsert = db.prepare(
    `INSERT INTO lecture_transcripts (user_id, course_code, session_no, source, source_url, cues, cue_count, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, course_code, session_no) DO UPDATE SET
       source = excluded.source, source_url = excluded.source_url, cues = excluded.cues,
       cue_count = excluded.cue_count, duration_ms = excluded.duration_ms, imported_at = datetime('now')`,
  );
  let saved = 0;
  const tx = db.transaction(() => {
    for (const code of courses) {
      for (const s of bundle.sessions) {
        const cues = s.cues.filter((c) => c.text.trim() !== "");
        if (cues.length === 0) continue;
        const duration = Math.max(...cues.map((c) => c.endMs));
        upsert.run(userId, code, s.no, bundle.source, s.url ?? null, JSON.stringify(cues), cues.length, duration);
        saved++;
      }
    }
  });
  tx();
  return { courses, saved };
}

export function createLecturesRouter(db: DB): Router {
  const router = Router();

  // Lecture links for the student's own courses, with which ones they hold a transcript for.
  router.get("/lectures", (req, res) => {
    const userId = req.user!.id;
    if (!hasCatalog(db, userId)) return res.json({ courses: [] });
    const mine = programFilter(db, userId, "cl.course_code");
    const rows = db
      .prepare(
        `SELECT cl.course_code, c.name_th, c.name_en, cl.session_no, cl.url,
                COALESCE(st.cue_count, lt.cue_count) AS cue_count,
                COALESCE(st.duration_ms, lt.duration_ms) AS duration_ms,
                summary.transcript_id IS NOT NULL AS has_summary,
                (SELECT count(*) FROM notes n, json_each(n.image_paths) image
                  WHERE n.user_id = ? AND n.lecture_id = cl.id AND image.type = 'text') AS image_count
         FROM course_lectures cl
         JOIN courses c ON c.code = cl.course_code
         LEFT JOIN shared_lecture_transcripts st ON st.id = cl.shared_transcript_id AND ? = 1
         LEFT JOIN shared_lecture_summaries summary ON summary.transcript_id = st.id
         LEFT JOIN lecture_transcripts lt
           ON lt.user_id = ? AND lt.course_code = cl.course_code AND lt.session_no = cl.session_no
         WHERE 1 = 1${mine.sql}
         ORDER BY cl.course_code, cl.session_no`,
      )
      .all(userId, Number(canReadSharedLectures(userId)), userId, ...mine.params) as Array<{
      course_code: string; name_th: string; name_en: string | null; session_no: number; url: string;
      has_summary: number; image_count: number; cue_count: number | null; duration_ms: number | null;
    }>;

    type Course = {
      code: string; name_th: string; name_en: string | null;
      lectures: { no: number; url: string; has_summary: boolean; image_count: number; transcript: { cues: number; minutes: number } | null }[];
    };
    const byCourse = new Map<string, Course>();
    for (const r of rows) {
      if (!byCourse.has(r.course_code)) {
        byCourse.set(r.course_code, { code: r.course_code, name_th: r.name_th, name_en: r.name_en, lectures: [] });
      }
      byCourse.get(r.course_code)!.lectures.push({
        no: r.session_no,
        url: r.url, has_summary: Boolean(r.has_summary), image_count: r.image_count,
        transcript: r.cue_count ? { cues: r.cue_count, minutes: Math.round((r.duration_ms ?? 0) / 60000) } : null,
      });
    }
    res.json({ courses: [...byCourse.values()] });
  });

  // Import a bundle made by the collector script.
  router.post("/lectures/transcripts/import", (req, res) => {
    const parsed = Bundle.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "ไฟล์นี้ไม่ใช่ไฟล์คำบรรยายของ StudyOS", code: "BAD_BUNDLE" });
    }
    const result = importBundle(db, req.user!.id, parsed.data);
    if (result.courses.length === 0) {
      return res.status(400).json({ error: "วิชาในไฟล์นี้ไม่อยู่ในหลักสูตรของคุณ", code: "NOT_YOUR_COURSE" });
    }
    res.json(result);
  });

  // Prefer the shared recording if available. Private imports remain scoped to their owner.
  router.get("/lectures/transcripts/:code/:no", (req, res) => {
    const id = req.user!.id;
    const lecture = canReadSharedLectures(id) && getLecture(db, id, req.params.code, Number(req.params.no));
    if (lecture && lecture.shared_transcript_id) {
      const row = db.prepare(`SELECT source_url, cues, duration_ms, collected_at AS imported_at
        FROM shared_lecture_transcripts WHERE id = ?`).get(lecture.shared_transcript_id) as { cues: string };
      return res.json({ ...row, course_code: req.params.code, session_no: Number(req.params.no), cues: JSON.parse(row.cues), shared: true });
    }
    const row = db
      .prepare(
        `SELECT course_code, session_no, source_url, cues, duration_ms, imported_at
         FROM lecture_transcripts WHERE user_id = ? AND course_code = ? AND session_no = ?`,
      )
      .get(req.user!.id, req.params.code, Number(req.params.no)) as
      | { course_code: string; session_no: number; source_url: string | null; cues: string; duration_ms: number; imported_at: string }
      | undefined;
    if (!row) return res.status(404).json({ error: "ไม่พบคำบรรยาย" });
    res.json({ ...row, cues: JSON.parse(row.cues), shared: false });
  });

  router.delete("/lectures/transcripts/:code/:no", (req, res) => {
    db.prepare("DELETE FROM lecture_transcripts WHERE user_id = ? AND course_code = ? AND session_no = ?").run(
      req.user!.id, req.params.code, Number(req.params.no),
    );
    res.json({ ok: true });
  });

  router.get("/lectures/summaries/:code/:no", (req, res) => {
    const result = getLectureSummary(db, req.user!.id, req.params.code, Number(req.params.no));
    if (!result) return res.status(404).json({ error: "ไม่พบสรุปบทเรียน" });
    res.json(result);
  });

  router.put("/lectures/summaries/:code/:no", (req, res) => {
    const id = req.user!.id;
    const no = Number(req.params.no);
    const current = getLectureSummary(db, id, req.params.code, no);
    if (!current) return res.status(404).json({ error: "ไม่พบสรุปบทเรียน" });
    const parsed = z.object({ summary_md: z.string().trim().min(1).max(120000), previous_md: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "ข้อความไม่ถูกต้อง" });
    if (parsed.data.previous_md !== undefined && parsed.data.previous_md !== current.summary_md) {
      return res.status(409).json({ error: "สรุปเปลี่ยนบนอุปกรณ์อื่นแล้ว เปิดสรุปอีกครั้งก่อนบันทึก" });
    }
    db.prepare(`INSERT INTO student_lecture_summaries (user_id, lecture_id, summary_md) VALUES (?, ?, ?)
      ON CONFLICT(user_id, lecture_id) DO UPDATE SET summary_md = excluded.summary_md`).run(id, current.lecture_id, parsed.data.summary_md);
    res.json(getLectureSummary(db, id, req.params.code, no));
  });

  router.delete("/lectures/summaries/:code/:no", (req, res) => {
    const id = req.user!.id;
    const no = Number(req.params.no);
    const current = getLectureSummary(db, id, req.params.code, no);
    if (!current) return res.status(404).json({ error: "ไม่พบสรุปบทเรียน" });
    db.prepare("DELETE FROM student_lecture_summaries WHERE user_id = ? AND lecture_id = ?").run(id, current.lecture_id);
    res.json(getLectureSummary(db, id, req.params.code, no));
  });

  router.get("/lectures/images/:code/:no", (req, res) => {
    const id = req.user!.id;
    const lecture = getLecture(db, id, req.params.code, Number(req.params.no));
    if (!lecture) return res.status(404).json({ error: "ไม่พบบทเรียน" });
    const images = db.prepare(`SELECT n.id AS note_id, n.title, image.value AS path
      FROM notes n, json_each(n.image_paths) image
      WHERE n.user_id = ? AND n.lecture_id = ? AND image.type = 'text'
      ORDER BY n.created_at, n.id, image.key`).all(id, lecture.id);
    res.json({ images });
  });

  return router;
}
