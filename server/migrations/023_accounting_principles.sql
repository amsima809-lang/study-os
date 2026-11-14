-- Migration 023: define the two Accounting-only core courses.
-- Migration 017 maps them to the Accounting program (bus-acc) but nothing
-- defined them, so they could not appear anywhere.
-- Source: RU admission guides 2566 and 2567, Faculty of Business Administration,
-- B.Acc. study plan (https://www.ru.ac.th/th/Center_study_plan/19/05.pdf).
INSERT OR IGNORE INTO courses (code, name_th, name_en, credits, category) VALUES
  ('ACC1101', 'การบัญชีขั้นต้น 1', 'Principles of Accounting 1', 3, 'CORE'),
  ('ACC1102', 'การบัญชีขั้นต้น 2', 'Principles of Accounting 2', 3, 'CORE');
