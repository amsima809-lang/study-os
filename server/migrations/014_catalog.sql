-- Migration 014: Catalog tables for multi-program support.
-- Adds faculties, programs, and per-program credit requirements.
-- Seeds Faculty of Business Administration with all 9 programs.

-- ===================== CATALOG TABLES =====================

CREATE TABLE IF NOT EXISTS faculties (
  id       TEXT PRIMARY KEY,
  code     TEXT NOT NULL UNIQUE,
  name_th  TEXT NOT NULL,
  name_en  TEXT
);

CREATE TABLE IF NOT EXISTS programs (
  id             TEXT PRIMARY KEY,
  faculty_id     TEXT NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,
  name_th        TEXT NOT NULL,
  name_en        TEXT,
  degree         TEXT NOT NULL DEFAULT 'BBA',
  total_credits  INTEGER NOT NULL DEFAULT 132,
  UNIQUE (faculty_id, code)
);

CREATE TABLE IF NOT EXISTS program_credit_requirements (
  program_id       TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  category         TEXT NOT NULL,
  required_credits INTEGER NOT NULL,
  PRIMARY KEY (program_id, category)
);

-- ===================== SEED: FACULTY =====================

INSERT INTO faculties (id, code, name_th, name_en) VALUES
  ('fac-bus', 'BUS', 'คณะบริหารธุรกิจ', 'Faculty of Business Administration');

-- ===================== SEED: PROGRAMS =====================

INSERT INTO programs (id, faculty_id, code, name_th, name_en, degree, total_credits) VALUES
  ('bus-mkt',  'fac-bus', 'MKT',  'การตลาด',                       'Marketing',                         'BBA',   132),
  ('bus-mgt',  'fac-bus', 'MGT',  'การจัดการ',                      'Management',                        'BBA',   132),
  ('bus-fin',  'fac-bus', 'FIN',  'การเงินและการธนาคาร',            'Finance and Banking',               'BBA',   132),
  ('bus-hrm',  'fac-bus', 'HRM',  'การบริหารทรัพยากรมนุษย์',        'Human Resource Management',         'BBA',   132),
  ('bus-ib',   'fac-bus', 'IB',   'ธุรกิจระหว่างประเทศ',            'International Business',            'BBA',   132),
  ('bus-adpr', 'fac-bus', 'ADPR', 'การโฆษณาและการประชาสัมพันธ์',    'Advertising and Public Relations',  'BBA',   132),
  ('bus-sbm',  'fac-bus', 'SBM',  'การจัดการธุรกิจบริการ',          'Service Business Management',       'BBA',   132),
  ('bus-tour', 'fac-bus', 'TOUR', 'การท่องเที่ยว',                  'Tourism',                           'BBA',   132),
  ('bus-acc',  'fac-bus', 'ACC',  'บัญชี',                          'Accounting',                        'B.Acc', 135);

-- ===================== SEED: MARKETING CREDIT REQUIREMENTS =====================
-- Matches the previously hardcoded CATEGORY_REQUIRED in planner.ts.

INSERT INTO program_credit_requirements (program_id, category, required_credits) VALUES
  ('bus-mkt', 'GE',        30),
  ('bus-mkt', 'CORE',      42),
  ('bus-mkt', 'MAJOR_REQ', 33),
  ('bus-mkt', 'MAJOR_ELEC',21),
  ('bus-mkt', 'FREE',       6);

-- ===================== LINK LEGACY USER TO MARKETING =====================

UPDATE user_profiles SET faculty_id = 'fac-bus', program_id = 'bus-mkt'
WHERE user_id = 'legacy-user-0001';

-- ===================== INDEXES =====================

CREATE INDEX IF NOT EXISTS idx_programs_faculty ON programs(faculty_id);
CREATE INDEX IF NOT EXISTS idx_pcr_program ON program_credit_requirements(program_id);
