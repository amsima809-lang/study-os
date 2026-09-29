-- Full official catalog: courses can belong to a "choose N of" group.
ALTER TABLE courses ADD COLUMN choose_group TEXT;

CREATE TABLE IF NOT EXISTS course_groups (
  id       TEXT PRIMARY KEY,   -- e.g. "GE_THAI", "MAJOR_ELEC", "INTERNSHIP"
  choose   INTEGER NOT NULL,   -- how many courses to pick from this group
  required INTEGER NOT NULL DEFAULT 0,
  note     TEXT
);
