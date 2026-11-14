-- Migration 019: e-Testing data for semester 2/2569.
-- Source: สวอ. (สถาบันบริการวิชาการทางอิเล็กทรอนิกส์) announcement, October 2569.

-- Table for e-Testing availability per term.
-- course_code has no FK because many e-Testing courses are from other faculties
-- and not in our courses table. Only BBA courses will match.
CREATE TABLE IF NOT EXISTS etesting_courses (
  course_code TEXT NOT NULL,
  term_id     TEXT NOT NULL REFERENCES plan_terms(term_id),
  fee_central   INTEGER NOT NULL DEFAULT 200,
  fee_regional  INTEGER NOT NULL DEFAULT 300,
  has_essay     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (course_code, term_id)
);

-- Table for e-Testing schedule info per term.
CREATE TABLE IF NOT EXISTS etesting_schedule (
  term_id            TEXT NOT NULL PRIMARY KEY REFERENCES plan_terms(term_id),
  registration_start TEXT NOT NULL,
  registration_end   TEXT NOT NULL,
  exam_start         TEXT NOT NULL,
  exam_end           TEXT NOT NULL,
  center_central     TEXT,
  center_regional    TEXT,
  notes              TEXT
);

-- e-Testing schedule for term 2/69.
INSERT OR IGNORE INTO etesting_schedule (
  term_id, registration_start, registration_end, exam_start, exam_end,
  center_central, center_regional, notes
) VALUES (
  '2/69',
  '2026-12-21', '2026-12-25',
  '2027-01-12', '2027-03-07',
  'มหาวิทยาลัยรามคำแหง หัวหมาก กรุงเทพฯ (ตึก SKB ชั้น 8)',
  'ม.รามคำแหง สาขาวิทยบริการเฉลิมพระเกียรติ (เชียงใหม่, ปราจีนบุรี, ขอนแก่น, นครศรีธรรมราช, สงขลา)',
  'จ-ศ สอบ 3 คาบ / ส-อา สอบ 4 คาบ: คาบ1 09:00-11:30, คาบ2 12:00-14:30, คาบ3 15:00-17:30, คาบ4 18:00-20:30'
);

-- All courses available for e-Testing in term 2/69.
-- Courses with * are essay exams (ANT1013, ANT2078, ANT3013).
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('AGR1003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ANT1013', '2/69', 1);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ANT2078', '2/69', 1);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ANT3013', '2/69', 1);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ARA1002', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ARA2001', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ART1003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('BIO1001', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('BIO1105', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('BUS2101', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM2103', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM2105', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM2203', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM2204', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM2302', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM2303', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM2304', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM2402', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM2403', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM3106', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM3209', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CDM3407', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CMS1101', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CMS1103', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CMS2203', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CMS4711', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('CMS4806', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('COS1102', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('DBC2101', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ECO1003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ECO1121', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ECO1122', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ENG1001', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ENG1002', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ENG2001', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ENG2002', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ENG2601', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ENG2901', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('ENG3301', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('FIN2101', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('FIN2202', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('FOL3302', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('FOL4205', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('FRE1012', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('GER1011', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('GER1012', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('HIS1201', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('HOT2102', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('INT1004', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('INT1005', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('JPN1011', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('LAW1004', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('LAW1104', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('LIS1001', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('LIS1003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('LIS2190', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS1151', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS1250', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS1350', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS1460', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS2150', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS2162', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS2260', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS2390', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS3151', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS3250', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS4151', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MCS4170', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MGT1001', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MGT3204', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MKT2101', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MTH1003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MTH1101', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MTH1102', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('MTH1103', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('PHI1002', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('PHI1003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('PHI2002', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('PHI2003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('POL1100', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('POL2106', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('POL2107', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('POL2300', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('POL2301', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('POL3300', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('POL3301', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('POL3302', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('POL4100', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('PSY1001', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1000', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1101', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1103', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1111', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1112', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1114', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1116', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1117', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1121', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1122', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1131', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1132', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1141', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1201', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1202', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1203', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1204', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1211', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1212', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1213', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1214', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1301', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1302', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1303', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RAM1311', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RUS1012', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RUS2011', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('RUS2012', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SCI1002', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SCI1003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SOC1003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SOC1013', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SOC2033', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SOC2043', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SOC2062', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SOC3066', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SOC4077', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SPN1011', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('SPN1012', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('STA1003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('STA2003', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('STA2016', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('THA2104', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('THA2108', '2/69', 0);
INSERT OR IGNORE INTO etesting_courses (course_code, term_id, has_essay) VALUES ('THA3102', '2/69', 0);
