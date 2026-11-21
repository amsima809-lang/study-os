// The statements that rebuild the timetable (class_sessions) and exams from the official
// record of each term (term_offerings), for the courses in the catalogue. Written into the
// migrations by scripts/import-ru-term.mjs and scripts/import-ru-curriculum.mjs;
// server/src/termSchedule.ts runs the same thing at run time (a test compares the two).

// Clock times of exam periods A and B. The registrar's documents print only the letter;
// these are the times the app's first author recorded.
export const PERIODS = { A: ["09:30", "12:00"], B: ["14:00", "16:30"] };

/** `where` narrows the terms, e.g. "term_id = '2/69'". */
export function rebuildSql(where) {
  return `DELETE FROM class_sessions WHERE ${where};
DELETE FROM exams WHERE ${where};
INSERT INTO class_sessions (course_code, term_id, weekday, start_time, end_time, room, instructor, kind)
SELECT o.course_code, o.term_id, json_extract(s.value, '$.weekday'), json_extract(s.value, '$.start'), json_extract(s.value, '$.end'),
       NULLIF(json_extract(s.value, '$.room'), ''), o.teachers, NULLIF(json_extract(s.value, '$.kind'), '')
FROM term_offerings o, json_each(o.sessions) s
WHERE o.${where} AND json_extract(s.value, '$.weekday') IS NOT NULL AND o.course_code IN (SELECT code FROM courses)
ORDER BY o.term_id, o.course_code, s.key;
INSERT INTO exams (course_code, term_id, datetime_start, datetime_end, slot, location)
SELECT course_code, term_id,
       exam_date || CASE exam_slot WHEN 'A' THEN 'T${PERIODS.A[0]}:00+07:00' ELSE 'T${PERIODS.B[0]}:00+07:00' END,
       exam_date || CASE exam_slot WHEN 'A' THEN 'T${PERIODS.A[1]}:00+07:00' ELSE 'T${PERIODS.B[1]}:00+07:00' END,
       exam_slot, NULL
FROM term_offerings
WHERE ${where} AND exam_date IS NOT NULL AND course_code IN (SELECT code FROM courses)
ORDER BY term_id, course_code;
`;
}
