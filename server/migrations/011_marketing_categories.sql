-- Update category CHECK constraint for Marketing (B.B.A.) curriculum.
-- FOUNDATION -> CORE, remove MINOR.
-- SQLite cannot alter CHECK constraints, so we recreate the table.
-- FK checks are disabled by the migration runner.

CREATE TABLE courses_new (
  code        TEXT PRIMARY KEY,
  name_th     TEXT NOT NULL,
  name_en     TEXT,
  credits     INTEGER NOT NULL DEFAULT 3,
  category    TEXT NOT NULL CHECK (category IN
                ('GE','CORE','MAJOR_REQ','MAJOR_ELEC','FREE')),
  difficulty  INTEGER NOT NULL DEFAULT 2 CHECK (difficulty IN (1,2,3)),
  notes       TEXT,
  choose_group TEXT
);

INSERT INTO courses_new
  SELECT code, name_th, name_en, credits,
    CASE category
      WHEN 'FOUNDATION' THEN 'CORE'
      WHEN 'MINOR' THEN 'FREE'
      ELSE category
    END,
    difficulty, notes, choose_group
  FROM courses;
DROP TABLE courses;
ALTER TABLE courses_new RENAME TO courses;
