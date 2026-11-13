-- Migration 016: Program-courses mapping.
-- Links courses to programs so each program shows only its courses.
-- GE and CORE courses are shared across all Business programs.
-- MAJOR_REQ and MAJOR_ELEC are program-specific.

CREATE TABLE IF NOT EXISTS program_courses (
  program_id  TEXT NOT NULL REFERENCES programs(id),
  course_code TEXT NOT NULL REFERENCES courses(code),
  category    TEXT NOT NULL CHECK (category IN ('GE','CORE','MAJOR_REQ','MAJOR_ELEC','FREE')),
  PRIMARY KEY (program_id, course_code)
);

CREATE INDEX idx_program_courses_program ON program_courses(program_id);

-- Map all GE courses to Marketing (bus-mkt).
-- These are shared across all Business programs.
INSERT OR IGNORE INTO program_courses (program_id, course_code, category)
  SELECT 'bus-mkt', code, 'GE' FROM courses WHERE category = 'GE';

-- Map all CORE courses to Marketing.
INSERT OR IGNORE INTO program_courses (program_id, course_code, category)
  SELECT 'bus-mkt', code, 'CORE' FROM courses WHERE category = 'CORE';

-- Map MAJOR_REQ courses to Marketing.
INSERT OR IGNORE INTO program_courses (program_id, course_code, category)
  SELECT 'bus-mkt', code, 'MAJOR_REQ' FROM courses WHERE category = 'MAJOR_REQ';

-- Map MAJOR_ELEC courses to Marketing.
INSERT OR IGNORE INTO program_courses (program_id, course_code, category)
  SELECT 'bus-mkt', code, 'MAJOR_ELEC' FROM courses WHERE category = 'MAJOR_ELEC';

-- Map FREE courses to Marketing.
INSERT OR IGNORE INTO program_courses (program_id, course_code, category)
  SELECT 'bus-mkt', code, 'FREE' FROM courses WHERE category = 'FREE';

-- Also map shared courses (GE + CORE) to all other Business programs.
-- This lets students in other programs at least see the shared courses.
INSERT OR IGNORE INTO program_courses (program_id, course_code, category)
  SELECT p.id, c.code, c.category
  FROM programs p, courses c
  WHERE p.id != 'bus-mkt'
    AND c.category IN ('GE', 'CORE');
