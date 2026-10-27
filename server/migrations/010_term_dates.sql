-- Add start_date to plan_terms so the calendar knows when classes begin.
-- end of classes = day before the first exam (derived from exams table).
ALTER TABLE plan_terms ADD COLUMN start_date TEXT;

UPDATE plan_terms SET start_date = '2026-11-16' WHERE term_id = '2/69';
