-- Migration 020: Custom calendar events + fee structure.

-- User-created calendar events (notes, reminders, custom activities).
CREATE TABLE IF NOT EXISTS custom_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL,
  start_time  TEXT,
  end_time    TEXT,
  note        TEXT,
  color       TEXT DEFAULT '#6366f1',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_custom_events_user_date ON custom_events(user_id, date);

-- RU fee structure (reference data, not user-specific).
CREATE TABLE IF NOT EXISTS fee_structure (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT NOT NULL,
  name_th     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  campus      TEXT NOT NULL CHECK (campus IN ('central','regional','both')),
  frequency   TEXT NOT NULL CHECK (frequency IN ('once','per_term','per_credit','per_course')),
  applies_to  TEXT NOT NULL DEFAULT 'regular',
  notes       TEXT
);

-- Insert RU fee data (ส่วนกลาง ภาคปกติ ป.ตรี) — source: aroundram.com/fee, ru.ac.th
-- One-time fees
INSERT INTO fee_structure (category, name_th, name_en, amount, campus, frequency, applies_to, notes) VALUES
  ('enrollment', 'ค่าขึ้นทะเบียนนักศึกษา', 'Student registration', 1000, 'central', 'once', 'regular', 'จ่ายครั้งเดียวตอนสมัคร'),
  ('enrollment', 'ค่าธรรมเนียมแรกเข้า', 'First-entry fee', 1200, 'central', 'once', 'regular', 'จ่ายครั้งเดียวตอนสมัคร'),
  ('enrollment', 'ค่าทำบัตรนักศึกษา', 'Student ID card', 100, 'central', 'once', 'regular', 'จ่ายครั้งเดียวตอนสมัคร'),
  ('enrollment', 'ค่าขึ้นทะเบียนนักศึกษา', 'Student registration', 700, 'regional', 'once', 'regular', NULL),
  ('enrollment', 'ค่าธรรมเนียมแรกเข้า', 'First-entry fee', 900, 'regional', 'once', 'regular', NULL),
  ('enrollment', 'ค่าทำบัตรนักศึกษา', 'Student ID card', 100, 'regional', 'once', 'regular', NULL);

-- Per-term fees
INSERT INTO fee_structure (category, name_th, name_en, amount, campus, frequency, applies_to, notes) VALUES
  ('term', 'ค่าบำรุงการศึกษา', 'Education maintenance', 800, 'central', 'per_term', 'regular', 'จ่ายทุกเทอม'),
  ('term', 'ค่าบริการสารสนเทศ', 'IT service fee', 100, 'central', 'per_term', 'regular', 'จ่ายทุกเทอม'),
  ('term', 'ค่าบำรุงการศึกษา', 'Education maintenance', 600, 'regional', 'per_term', 'regular', 'จ่ายทุกเทอม'),
  ('term', 'ค่าบริการสารสนเทศ', 'IT service fee', 100, 'regional', 'per_term', 'regular', 'จ่ายทุกเทอม');

-- Per-credit fees
INSERT INTO fee_structure (category, name_th, name_en, amount, campus, frequency, applies_to, notes) VALUES
  ('credit', 'ค่าหน่วยกิต', 'Credit fee', 25, 'central', 'per_credit', 'regular', 'หน่วยกิตละ 25 บาท (ส่วนกลาง)'),
  ('credit', 'ค่าหน่วยกิต', 'Credit fee', 50, 'regional', 'per_credit', 'regular', 'หน่วยกิตละ 50 บาท (ส่วนภูมิภาค)');

-- Per-course fees
INSERT INTO fee_structure (category, name_th, name_en, amount, campus, frequency, applies_to, notes) VALUES
  ('exam', 'ค่าธรรมเนียมการสอบ', 'Exam fee', 60, 'regional', 'per_course', 'regular', 'ส่วนภูมิภาคเท่านั้น'),
  ('exam', 'ค่าสอบซ่อม', 'Retake exam fee', 60, 'both', 'per_course', 'retake', 'ต่อกระบวนวิชา'),
  ('exam', 'ค่าปรับลงทะเบียนสอบซ่อมล่าช้า', 'Late retake registration penalty', 100, 'both', 'per_course', 'retake_late', 'กรณีลงทะเบียนล่าช้า');

-- E-Testing fees
INSERT INTO fee_structure (category, name_th, name_en, amount, campus, frequency, applies_to, notes) VALUES
  ('etesting', 'ค่าสอบ e-Testing (ส่วนกลาง)', 'E-Testing fee (central)', 200, 'central', 'per_course', 'etesting', 'วิชาละ 200 บาท'),
  ('etesting', 'ค่าสอบ e-Testing (ส่วนภูมิภาค)', 'E-Testing fee (regional)', 300, 'regional', 'per_course', 'etesting', 'วิชาละ 300 บาท');
