-- Migration 031: official names for 19 of the 60 courses that had none.
--
-- These codes are not in the 2566/2567 admission guides because they are
-- RETIRED codes from the 2555–2564 curricula (MGT4004 is the one still
-- offered). Names are copied from Ramkhamhaeng University's own documents:
--   G55  2555 central guide, Business Administration section
--        https://www.ru.ac.th/th/Center_study_plan/7/1382583164_02_BBA.pdf
--   G59  2559 central guide, BA section
--        https://www.ru.ac.th/th/Center_study_plan/11/1453264238_05_คณะบริหารธุรกิจ_59.pdf
--   G64  2564 central guide, BA section
--        https://www.ru.ac.th/th/Center_study_plan/16/04_64.pdf
--   R59  2559 regional guide, master course list
--        http://www.regis.ru.ac.th/campus/Ca59/Campus_p2559.pdf
-- Spellings are the source's own, including old or unusual ones
-- (สัมนา, อิเล็กโทรนิกส์, "ในการธุรกิจ"). One exception: every guide prints
-- INB3112 as "…ระหว่างประทศ" (a missing vowel); the university bookstore lists
-- the textbook as "…ระหว่างประเทศ", which is used here.
-- Only rows that still have no name are touched.
--
-- TODO(data): 41 codes remain unnamed (DBC3107/3113/3114, FIN3213–3215,
-- FIN3316/3317, FIN4214–4220, HOT2203/2204, HOT3207–3212, HOT4202–4206,
-- HRM3214–3216, HRM3316–3319, HRM4310–4314, MGT4005). They appear in no
-- official document that could be opened (every central guide 2551–2569, the
-- regional guides 2558–2569, the faculty's course descriptions and transfer
-- forms, the timetables 1/2567–2/2569) and all sit in gaps of the real
-- numbering, so some may not be real codes (HRM3214 looks like a misprint of
-- HRM3314). Do not guess names for them.

UPDATE courses SET name_th = 'เทคนิคการวิเคราะห์และทำรายงานทางการเงิน', name_en = 'Techniques of Financial Analysis and Reporting' WHERE code = 'FIN3207' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'สัมนาการจัดการทรัพยากรมนุษย์', name_en = 'Seminar in Human Resources Management' WHERE code = 'HRM3212' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'เอกสารการค้าระหว่างประเทศ', name_en = 'Documentation in International Trade' WHERE code = 'INB3108' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การจัดการความเสี่ยงสำหรับธุรกิจระหว่างประเทศ', name_en = 'Risk Management for International Business' WHERE code = 'INB3109' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'กฎระเบียบการค้าระหว่างประเทศ', name_en = 'The Regulation of International Trade' WHERE code = 'INB3110' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การจัดการห่วงโซ่อุปทานระหว่างประเทศ', name_en = 'International Supply Chain Management' WHERE code = 'INB3111' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การติดต่อสื่อสารทางธุรกิจระหว่างประเทศ', name_en = 'International Business Communication' WHERE code = 'INB3112' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การตลาดระดับโลก', name_en = 'Global Marketing' WHERE code = 'INB3114' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การบริหารพาณิชย์อิเล็กโทรนิกส์ในธุรกิจระหว่างประเทศ', name_en = 'E-Commerce in International Business' WHERE code = 'INB4103' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การวิเคราะห์ธุรกิจและการแข่งขันในการธุรกิจการค้าระหว่างประเทศ', name_en = 'Business and Competitive Analysis in International Trade' WHERE code = 'INB4104' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การทำธุรกิจในเอเชีย', name_en = 'Doing Business in Asia' WHERE code = 'INB4105' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การวิเคราะห์เพื่อการตัดสินใจทางธุรกิจระหว่างประเทศ', name_en = 'International Business Decision Making' WHERE code = 'INB4106' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การจัดการนวัตกรรมทางโลจิสติกส์และโซ่อุปทาน', name_en = 'Innovation Management for Logistics and Supply Chain' WHERE code = 'LOG3206' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การจัดการการขนส่ง', name_en = 'Transportation Management' WHERE code = 'LOG3207' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การจัดการเชิงกลยุทธ์ทางโลจิสติกส์และโซ่อุปทาน', name_en = 'Strategic Management for Logistics and Supply Chain' WHERE code = 'LOG4203' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การจัดการความสัมพันธ์กับผู้มีส่วนเกี่ยวข้อง', name_en = 'Relationship Management with Stakeholders' WHERE code = 'LOG4204' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'การเป็นผู้ประกอบการ', name_en = 'Entrepreneurship' WHERE code = 'MGT4004' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'นโยบายธุรกิจ', name_en = 'Business Policy' WHERE code = 'MGT4006' AND (name_th IS NULL OR name_th = '');
UPDATE courses SET name_th = 'ธุรกิจระหว่างประเทศ', name_en = 'International Business' WHERE code = 'MGT4007' AND (name_th IS NULL OR name_th = '');
