-- Migration 024: repair course names inserted by migration 017.
-- The names were copied out of a PDF whose Thai font stores tone marks and
-- similar signs as private-use codes (U+F700 to U+F71A) that no font can draw.
-- This migration:
--   1. maps those codes back to the real Thai characters (standard mapping),
--      and joins a split sara am (U+0E4D + U+0E32 -> U+0E33);
--   2. splits 15 names where the English name was stuck on the end of the Thai
--      name and name_en was left empty;
--   3. drops a stray credit digit from the end of 3 English names.
-- Checked against the RU admission guides 2566 and 2567: of the 137 courses
-- that appear there, the repaired Thai name matches for all but one, which
-- differs only by a space.
-- Each UPDATE matches on the old broken name, so it cannot touch a course whose
-- name came from the seed, and it is safe to run on any database.
-- NOT fixed here: 60 courses that migration 017 inserted with no name at all
-- (they are not in the 2566 or 2567 guide). See docs/ARCHITECTURE.md.

UPDATE courses SET name_th = 'การบัญชีต้นทุน 1', name_en = 'Cost Accounting 1' WHERE code = 'ACC3211' AND name_th = 'การบัญชีตนทุน 1 Cost Accounting 1';
UPDATE courses SET name_th = 'การบัญชีต้นทุน 2', name_en = 'Cost Accounting 2' WHERE code = 'ACC3212' AND name_th = 'การบัญชีตนทุน 2 Cost Accounting 2';
UPDATE courses SET name_th = 'ซอฟต์แวร์สำหรับงานบัญชี', name_en = 'Accounting Software' WHERE code = 'ACC3250' AND name_th = 'ซอฟตแวรสําหรับงานบัญชี';
UPDATE courses SET name_th = 'การบัญชีสำหรับอสังหาริมทรัพย์', name_en = 'Accounting for Real Estate' WHERE code = 'ACC3349' AND name_th = 'การบัญชีสําหรับอสังหาริมทรัพย Accounting for Real Estate';
UPDATE courses SET name_th = 'รายงานทางการเงินและการวิเคราะห์', name_en = 'Financial Reporting and Analysis' WHERE code = 'ACC4209' AND name_th = 'รายงานทางการเงินและการวิเคราะห Financial Reporting and Analysis';
UPDATE courses SET name_th = 'การบัญชีระหว่างประเทศ', name_en = 'International Accounting' WHERE code = 'ACC4348' AND name_th = 'การบัญชีระหวางประเทศ';
UPDATE courses SET name_th = 'หลักการและวิชาการประชาสัมพันธ์ยุคดิจิทัล', name_en = 'Principles and Profession of Digital Public Relations' WHERE code = 'DBC3101' AND name_th = 'หลักการและวิชาการประชาสัมพันธยุคดิจิทัล';
UPDATE courses SET name_th = 'การสื่อสารองค์การเพื่อการสื่อสารธุรกิจยุคดิจิทัล', name_en = 'Corporate Communication for Digital Business Communication' WHERE code = 'DBC3103' AND name_th = 'การสื่อสารองคการเพื่อการสื่อสารธุรกิจยุคดิจิทัล';
UPDATE courses SET name_th = 'หลักศิลป์และการออกแบบเพื่อการสื่อสารธุรกิจยุคดิจิทัล', name_en = 'Principles of Art & Design for Digital Public Relations' WHERE code = 'DBC3104' AND name_th = 'หลักศิลปและการออกแบบเพื่อการสื่อสารธุรกิจยุคดิจิทัล';
UPDATE courses SET name_th = 'กลยุทธ์การสร้างสรรค์งานโฆษณา', name_en = 'Advertising Content and Creativity' WHERE code = 'DBC3109' AND name_th = 'กลยุทธการสรางสรรคงานโฆษณา';
UPDATE courses SET name_th = 'การสร้างสรรค์เนื้อหางานประชาสัมพันธ์ยุคดิจิทัล', name_en = 'Digital Public Relations Content and Creativity' WHERE code = 'DBC3110' AND name_th = 'การสรางสรรคเนื้อหางานประชาสัมพันธยุคดิจิทัล';
UPDATE courses SET name_th = 'การประชาสัมพันธ์เพื่อการสื่อสารธุรกิจยุคดิจิทัล', name_en = 'Digital Business Communication for Public Relations' WHERE code = 'DBC4115' AND name_th = 'การประชาสัมพันธเพื่อการสื่อสารธุรกิจยุคดิจิทัล';
UPDATE courses SET name_th = 'การรณรงค์เพื่อการสื่อสารธุรกิจยุคดิจิทัล', name_en = 'Digital Business Communication Campaign' WHERE code = 'DBC4116' AND name_th = 'การรณรงค เพื่อการสื่อสารธุรกิจยุคดิจิทัล';
UPDATE courses SET name_th = 'การจัดการประเด็นและกรณีวิกฤตด้านการสื่อสารธุรกิจยุคดิจิทัล', name_en = 'Issue and Crisis Management in Digital Business Communication' WHERE code = 'DBC4118' AND name_th = 'การจัดการประเด็นและกรณีวิกฤตดานการสื่อสารธุรกิจยุคดิจิทัล';
UPDATE courses SET name_th = 'การวิเคราะห์ข้อมูลสำหรับการสื่อสารธุรกิจยุคดิจิทัล', name_en = 'Data Analytics for Digital Business Communication' WHERE code = 'DBC4119' AND name_th = 'การวิเคราะหขอมูลสําหรับการสื่อสารธุรกิจยุคดิจิทัล';
UPDATE courses SET name_th = 'การนำเสนองานสำหรับการสื่อสารธุรกิจยุคดิจิทัล', name_en = 'Presentation for Digital Business Communication' WHERE code = 'DBC4120' AND name_th = 'การนําเสนองานสําหรับการสื่อสารธุรกิจยุคดิจิทัล';
UPDATE courses SET name_th = 'การประชาสัมพันธ์ยุคดิจิทัลธุรกิจขนาดกลางและขนาดย่อม', name_en = 'Digital Public Relations for Small and Medium Business Enterprises' WHERE code = 'DBC4121' AND name_th = 'การประชาสัมพันธยุคดิจิทัลธุรกิจขนาดกลางและขนาดยอม';
UPDATE courses SET name_th = 'การจัดการชื่อเสียงองค์กรเพื่อการสื่อสารธุรกิจยุคดิจิทัล', name_en = 'Corporate Reputation Management for Digital Business Communication' WHERE code = 'DBC4123' AND name_th = 'การจัดการชื่อเสียงองคกรเพื่อการสื่อสารธุรกิจยุคดิจิทัล';
UPDATE courses SET name_th = 'การออกแบบบรรจุภัณฑ์เพื่อใช้ในการสื่อสารธุรกิจยุคดิจิทัล', name_en = 'Creative Packaging for Digital Business Communication' WHERE code = 'DBC4124' AND name_th = 'การออกแบบบรรจุภัณฑเพื่อใชในการสื่อสารธุรกิจยุคดิจิทัล';
UPDATE courses SET name_th = 'สถาบันการเงินและตลาดการเงิน', name_en = 'Financial Institutions and Financial Markets' WHERE code = 'FIN2202' AND name_th = 'สถาบันการเงินและตลาดการเงิน';
UPDATE courses SET name_th = 'การจัดการการเงินระหว่างประเทศ', name_en = 'International Financial Management' WHERE code = 'FIN3204' AND name_th = 'การจัดการการเงินระหวางประเทศ';
UPDATE courses SET name_th = 'หลักและนโยบายการลงทุน', name_en = 'Principles and Policies of Investment' WHERE code = 'FIN3205' AND name_th = 'หลักและนโยบายการลงทุน';
UPDATE courses SET name_th = 'การบริหารธนาคารพาณิชย์', name_en = 'Commercial Bank Management' WHERE code = 'FIN3206' AND name_th = 'การบริหารธนาคารพาณิชย Commercial Bank Management';
UPDATE courses SET name_th = 'การบริหารการเงินธุรกิจ 1', name_en = 'Financial Management 1' WHERE code = 'FIN3208' AND name_th = 'การบริหารการเงินธุรกิจ 1';
UPDATE courses SET name_th = 'การวิเคราะห์หลักทรัพย์', name_en = 'Securities Analysis' WHERE code = 'FIN3209' AND name_th = 'การวิเคราะหหลักทรัพย Securities Analysis';
UPDATE courses SET name_th = 'การวิเคราะห์เชิงปริมาณทางการเงิน', name_en = 'Quantitative Analysis in Finance' WHERE code = 'FIN3210' AND name_th = 'การวิเคราะหเชิงปริมาณทางการเงิน';
UPDATE courses SET name_th = 'เทคโนโลยีทางการเงินและสินทรัพย์ดิจิทัล', name_en = 'Fintech and Digital Assets' WHERE code = 'FIN3319' AND name_th = 'เทคโนโลยีทางการเงินและสินทรัพยดิจิทัล';
UPDATE courses SET name_th = 'ความรู้เบื้องต้นเกี่ยวกับการลงทุนในธุรกิจอสังหริมทรัพย์', name_en = 'Introduction to Real Estate Investment' WHERE code = 'FIN3321' AND name_th = 'ความรูเบื้องตนเกี่ยวกับการลงทุนในธุรกิจอสังหริมทรัพย';
UPDATE courses SET name_th = 'ตราสารอนุพันธ์และการจัดการความเสี่ยง', name_en = 'Derivatives and Risk Management' WHERE code = 'FIN4213' AND name_th = 'ตราสารอนุพันธและการจัดการความเสี่ยง';
UPDATE courses SET name_th = 'การจัดการการเงินธุรกิจขนาดย่อม', name_en = 'Financial Management of the Small-Business' WHERE code = 'FIN4320' AND name_th = 'การจัดการการเงินธุรกิจขนาดยอม';
UPDATE courses SET name_th = 'การเงินและการธนาคารระหว่างประเทศ', name_en = 'International Finance and Banking' WHERE code = 'FIN4325' AND name_th = 'การเงินและการธนาคารระหวางประเทศ';
UPDATE courses SET name_th = 'กลยุทธ์การลงทุนและการวิเคราะห์กองทุนรวม', name_en = 'Mutual Fund Investment Strategies and Analysis' WHERE code = 'FIN4327' AND name_th = 'กลยุทธการลงทุนและการวิเคราะหกองทุนรวม';
UPDATE courses SET name_th = 'ศิลปะสถาปัตยกรรมไทยเพื่อการท่องเที่ยว', name_en = 'Thai Arts and Architecture for Tourism' WHERE code = 'HIT3301' AND name_th = 'ศิลปะสถาปตยกรรมไทยเพื่อการทองเที่ยว';
UPDATE courses SET name_th = 'หลักการอุตสาหกรรมบริการและการท่องเที่ยว', name_en = 'Principles of Hospitality Industry and Tourism' WHERE code = 'HOT1101' AND name_th = 'หลักการอุตสาหกรรมบริการและการทองเที่ยว';
UPDATE courses SET name_th = 'การจัดการทุนมนุษย์ในอุตสาหกรรมบริการและการท่องเที่ยว', name_en = 'Human Capital Management in Hospitality Industry and Tourism' WHERE code = 'HOT2101' AND name_th = 'การจัดการทุนมนุษยในอุตสาหกรรมบริการและการทองเที่ยว';
UPDATE courses SET name_th = 'ประเด็นทางกฎหมาย จรรยาบรรณ และหลักจริยธรรม ในอุตสาหกรรมบริการและการท่องเที่ยว', name_en = 'Legal Issues, Morality and Ethics in Hospitality Industry and Tourism' WHERE code = 'HOT2102' AND name_th = 'ประเด็นทางกฎหมาย จรรยาบรรณ และหลักจริยธรรม ในอุตสาหกรรมบริการและการทองเที่ยว';
UPDATE courses SET name_th = 'การวิจัยเพื่ออุตสาหกรรมบริการและการท่องเที่ยว', name_en = 'Research for Hospitality Industry and Tourism' WHERE code = 'HOT2103' AND name_th = 'การวิจัยเพื่ออุตสาหกรรมบริการและการทองเที่ยว';
UPDATE courses SET name_th = 'พฤติกรรมและความหลากหลายทางวัฒนธรรมของนักท่องเที่ยว', name_en = 'Tourist Behavior and Cultural Diversity' WHERE code = 'HOT2104' AND name_th = 'พฤติกรรมและความหลากหลายทางวัฒนธรรมของนักทองเที่ยว';
UPDATE courses SET name_th = 'ความรู้เบื้องต้นเกี่ยวกับธุรกิจโรงแรมและที่พัก', name_en = 'Introduction to Hotel and Lodging Business' WHERE code = 'HOT2201' AND name_th = 'ความรูเบื้องตนเกี่ยวกับธุรกิจโรงแรมและที่พัก';
UPDATE courses SET name_th = 'หลักการมัคคุเทศก์เบื้องต้น', name_en = 'Principle of Tour Guiding' WHERE code = 'HOT2202' AND name_th = 'หลักการมัคคุเทศกเบื้องตน';
UPDATE courses SET name_th = 'ทรัพยากรการท่องเที่ยว', name_en = 'Tourism Resources' WHERE code = 'HOT3201' AND name_th = 'ทรัพยากรการทองเที่ยว';
UPDATE courses SET name_th = 'การดำเนินงานและการจัดการธุรกิจนำเที่ยว', name_en = 'Tour Business Operation and Management' WHERE code = 'HOT3202' AND name_th = 'การดําเนินงานและการจัดการธุรกิจนําเที่ยว';
UPDATE courses SET name_th = 'การดำเนินงานและการจัดการบริการส่วนหน้า', name_en = 'Front Office Operation and Management' WHERE code = 'HOT3203' AND name_th = 'การดําเนินงานและการจัดการบริการสวนหนา';
UPDATE courses SET name_th = 'การดำเนินงานและการจัดการอาหารและเครื่องดื่ม', name_en = 'Food and Beverage Operation and Management' WHERE code = 'HOT3204' AND name_th = 'การดําเนินงานและการจัดการอาหารและเครื่องดื่ม';
UPDATE courses SET name_th = 'การจัดการแผนกแม่บ้าน', name_en = 'Housekeeping Management' WHERE code = 'HOT3205' AND name_th = 'การจัดการแผนกแมบาน';
UPDATE courses SET name_th = 'การดำเนินงานและการจัดการแผนกครัว', name_en = 'Culinary Operation and Management' WHERE code = 'HOT3206' AND name_th = 'การดําเนินงานและการจัดการแผนกครัว';
UPDATE courses SET name_th = 'สัมมนาสำหรับอุตสาหกรรมบริการและการท่องเที่ยว', name_en = 'Seminar in Hospitality Industry and Tourism' WHERE code = 'HOT4201' AND name_th = 'สัมมนาสําหรับอุตสาหกรรมบริการและการทองเที่ยว';
UPDATE courses SET name_th = 'การฝึกปฎิบัติเสริมประสบการณ์วิชาชีพในอุตสาหกรรมบริการและการท่องเที่ยว', name_en = 'Skill Enrichment Workshop in Hospitality Industry and Tourism' WHERE code = 'HOT4500' AND name_th = 'การฝกปฎิบัติเสริมประสบการณวิชาชีพในอุตสาหกรรมบริการและการทองเที่ยว';
UPDATE courses SET name_th = 'พฤติกรรมทรัพยากรมนุษย์ในองค์การ', name_en = 'Human Resources Behavior in Organization' WHERE code = 'HRM2202' AND name_th = 'พฤติกรรมทรัพยากรมนุษยในองคการ';
UPDATE courses SET name_th = 'การวางแผนทรัพยากรมนุษย์ การสรรหา และการคัดเลือก', name_en = 'Human Resources Planning , Recruitment and Selection' WHERE code = 'HRM2203' AND name_th = 'การวางแผนทรัพยากรมนุษย การสรรหา และการคัดเลือก';
UPDATE courses SET name_th = 'การพัฒนาทรัพยากรมนุษย์', name_en = 'Human Resources Development' WHERE code = 'HRM2205' AND name_th = 'การพัฒนาทรัพยากรมนุษย Human Resources Development';
UPDATE courses SET name_th = 'การจัดการค่าตอบแทน', name_en = 'Compensation Management' WHERE code = 'HRM3206' AND name_th = 'การจัดการคาตอบแทน';
UPDATE courses SET name_th = 'การจัดการแรงงานสัมพันธ์', name_en = 'Labor Relations Management' WHERE code = 'HRM3207' AND name_th = 'การจัดการแรงงานสัมพันธ Labor Relations Management';
UPDATE courses SET name_th = 'แรงงานสัมพันธ์และกฎหมายที่เกี่ยวข้อง', name_en = 'Labor Relations and the Law' WHERE code = 'HRM3208' AND name_th = 'แรงงานสัมพันธและกฎหมายที่เกี่ยวของ';
UPDATE courses SET name_th = 'สารสนเทศเพื่อการจัดการทรัพยากรมนุษย์', name_en = 'Human Resources Management Information System' WHERE code = 'HRM3209' AND name_th = 'สารสนเทศเพื่อการจัดการทรัพยากรมนุษย Human Resources Management Information System 3';
UPDATE courses SET name_th = 'การจัดการทรัพยากรมนุษย์ภายใต้สถานการณ์ที่เปลี่ยนแปลง', name_en = 'Human Resources Management under Changing Situation' WHERE code = 'HRM3210' AND name_th = 'การจัดการทรัพยากรมนุษยภายใตสถานการณที่เปลี่ยนแปลง';
UPDATE courses SET name_th = 'การจัดการความปลอดภัย อาชีวะอนามัย และสภาพแวดล้อมในการทำงาน', name_en = 'Occupational Health, Safety and Workplace Management' WHERE code = 'HRM3211' AND name_th = 'การจัดการความปลอดภัย อาชีวะอนามัย และสภาพแวดลอมในการทํางาน';
UPDATE courses SET name_th = 'สัมมนาการจัดการทรัพยากรมนุษย์', name_en = 'Seminar in Human Resources Management' WHERE code = 'HRM3213' AND name_th = 'สัมมนาการจัดการทรัพยากรมนุษย Seminar in Human Resources Management';
UPDATE courses SET name_th = 'การสื่อสารในองค์การเชิงปฏิบัติการ', name_en = 'Communication Practices in Organization' WHERE code = 'HRM3312' AND name_th = 'การสื่อสารในองคการเชิงปฏิบัติการ';
UPDATE courses SET name_th = 'การปฏิบัติงานด้านการจัดการทรัพยากรมนุษย์', name_en = 'Practical Training in Human Resources Management' WHERE code = 'HRM3314' AND name_th = 'การปฏิบัติงานดานการจัดการทรัพยากรมนุษย';
UPDATE courses SET name_th = 'การจัดการทรัพยากรมนุษย์ระหว่างประเทศ', name_en = 'International Human Resources Management' WHERE code = 'HRM4315' AND name_th = 'การจัดการทรัพยากรมนุษยระหวางประเทศ';
UPDATE courses SET name_th = 'เทคนิคการสัมภาษณ์', name_en = 'Interviewing Techniques' WHERE code = 'HRM4316' AND name_th = 'เทคนิคการสัมภาษณ Interviewing Techniques';
UPDATE courses SET name_th = 'การให้คำปรึกษาและแนะนำ', name_en = 'Counseling and Advising' WHERE code = 'HRM4317' AND name_th = 'การใหคําปรึกษาและแนะนํา';
UPDATE courses SET name_th = 'การทำงานเป็นทีม', name_en = 'Teamwork' WHERE code = 'HRM4318' AND name_th = 'การทํางานเปนทีม';
UPDATE courses SET name_th = 'กลยุทธ์การเพิ่มผลิตภาพพนักงาน', name_en = 'Strategies for Employee Productivity' WHERE code = 'HRM4320' AND name_th = 'กลยุทธการเพิ่มผลิตภาพพนักงาน';
UPDATE courses SET name_th = 'การตรวจสอบและการวิจัยการบริหารทรัพยากรมนุษย์', name_en = 'Human Resources Management Audit and Research' WHERE code = 'HRM4321' AND name_th = 'การตรวจสอบและการวิจัยการบริหารทรัพยากรมนุษย';
UPDATE courses SET name_th = 'การจัดการเพื่อความก้าวหน้าในวิชาชีพ', name_en = 'Career Management' WHERE code = 'HRM4323' AND name_th = 'การจัดการเพื่อความกาวหนาในวิชาชีพ';
UPDATE courses SET name_th = 'การจัดการบุคลากรที่เป็นเลิศ', name_en = 'Talent Management' WHERE code = 'HRM4324' AND name_th = 'การจัดการบุคลากรที่เปนเลิศ';
UPDATE courses SET name_th = 'การจัดการทรัพยากรมนุษย์เพื่อสร้างสรรค์องค์การนวัตกรรม', name_en = 'Human Resources Management for Creative Innovation Organization' WHERE code = 'HRM4325' AND name_th = 'การจัดการทรัพยากรมนุษยเพื่อสรางสรรคองคการนวัตกรรม';
UPDATE courses SET name_th = 'การบริหารความเสี่ยงด้านทรัพยากรมนุษย์', name_en = 'Risk Management for Human Resources' WHERE code = 'HRM4328' AND name_th = 'การบริหารความเสี่ยงดานทรัพยากรมนุษย Risk Management for Human Resources';
UPDATE courses SET name_th = 'การจัดการแรงงานต่างด้าวและบุคลากรที่หลากหลาย', name_en = 'Foreign Workers and Workforce Diversity' WHERE code = 'HRM4329' AND name_th = 'การจัดการแรงงานตางดาวและบุคลากรที่หลากหลาย';
UPDATE courses SET name_th = 'ความรู้เบื้องต้นเกี่ยวกับธุรกิจระหว่างประเทศ', name_en = 'Introduction to International Business' WHERE code = 'INB3101' AND name_th = 'ความรูเบื้องตนเกี่ยวกับธุรกิจระหวางประเทศ';
UPDATE courses SET name_th = 'หลักและกระบวนการส่งออกและนำเข้า', name_en = 'Principles and Procedure of Export and Import' WHERE code = 'INB3103' AND name_th = 'หลักและกระบวนการสงออกและนําเขา';
UPDATE courses SET name_th = 'พาณิชย์อิเล็กทรอนิกส์และสารสนเทศในธุรกิจระหว่างประเทศเบื้องต้น', name_en = 'Introduction to Electronic Commerce and Information in International Business' WHERE code = 'INB3104' AND name_th = 'พาณิชยอิเล็กทรอนิกสและสารสนเทศในธุรกิจระหวางประเทศเบื้องตน';
UPDATE courses SET name_th = 'กลยุทธ์การทำการค้าระหว่างประเทศ', name_en = 'International Trade Strategies' WHERE code = 'INB3105' AND name_th = 'กลยุทธการทําการคาระหวางประเทศ';
UPDATE courses SET name_th = 'การวิจัยธุรกิจระหว่างประเทศ', name_en = 'International Business Research' WHERE code = 'INB3106' AND name_th = 'การวิจัยธุรกิจระหวางประเทศ';
UPDATE courses SET name_th = 'การจัดการธุรกิจระหว่างประเทศ', name_en = 'International Business Management' WHERE code = 'INB3107' AND name_th = 'การจัดการธุรกิจระหวางประเทศ';
UPDATE courses SET name_th = 'การเงินสำหรับธุรกิจระหว่างประเทศ', name_en = 'Finance for International Business' WHERE code = 'INB3113' AND name_th = 'การเงินสําหรับธุรกิจระหวางประเทศ';
UPDATE courses SET name_th = 'การบริหารความหลากหลายในองค์กรธุรกิจระหว่างประเทศ', name_en = 'Diversity Management in International Business Organization' WHERE code = 'INB3115' AND name_th = 'การบริหารความหลากหลายในองคกรธุรกิจระหวางประเทศ';
UPDATE courses SET name_th = 'การเจรจาต่อรองการค้าและการสื่อสารทางธุรกิจระหว่างประเทศ', name_en = 'International Trade Negotiation and Business Communication' WHERE code = 'INB3116' AND name_th = 'การเจรจาตอรองการคาและการสื่อสารทางธุรกิจระหวางประเทศ';
UPDATE courses SET name_th = 'กฎระเบียบและเอกสารการค้าระหว่างประเทศ', name_en = 'The Regulation and Documentation in International Trade' WHERE code = 'INB3117' AND name_th = 'กฎระเบียบและเอกสารการคาระหวางประเทศ';
UPDATE courses SET name_th = 'วิสาหกิจขนาดกลางและขนาดย่อมในการค้าระหว่างประเทศ', name_en = 'SME in International Trade' WHERE code = 'INB3118' AND name_th = 'วิสาหกิจขนาดกลางและขนาดยอมในการคาระหวางประเทศ';
UPDATE courses SET name_th = 'การตลาดระหว่างประเทศ', name_en = 'International Marketing' WHERE code = 'INB3119' AND name_th = 'การตลาดระหวางประเทศ';
UPDATE courses SET name_th = 'การสัมนาในประเด็นธุรกิจระหว่างประเทศ', name_en = 'Seminar in International Business Topic' WHERE code = 'INB4101' AND name_th = 'การสัมนาในประเด็นธุรกิจระหวางประเทศ';
UPDATE courses SET name_th = 'การเข้าร่วมงานแสดงสินค้านานาชาติ', name_en = 'Participation in International Trade Fair and Exhibition' WHERE code = 'INB4102' AND name_th = 'การเขารวมงานแสดงสินคานานาชาติ';
UPDATE courses SET name_th = 'การทำธุรกิจกับประเทศอาเซียนและกลุ่มประเทศคู่เจรจา', name_en = 'Doing Business with ASEAN and Dialogue Partners' WHERE code = 'INB4109' AND name_th = 'การทําธุรกิจกับประเทศอาเซียนและกลุมประเทศคูเจรจา';
UPDATE courses SET name_th = 'ระบบมาตรฐานระหว่างประเทศเพื่อการส่งออก', name_en = 'International standard for exporting' WHERE code = 'INB4111' AND name_th = 'ระบบมาตรฐานระหวางประเทศเพื่อการสงออก';
UPDATE courses SET name_th = 'การบริหารธุรกิจดิจิตอล และพาณิชย์อิเล็กทรอนิกส์ในธุรกิจระหว่างประเทศ', name_en = 'Digital Business and E-Commerce in International Business' WHERE code = 'INB4113' AND name_th = 'การบริหารธุรกิจดิจิตอล และพาณิชยอิเล็กทรอนิกสในธุรกิจระหวางประเทศ';
UPDATE courses SET name_th = 'การจัดการความเสี่ยงสำหรับธุรกิจระหว่างประเทศ', name_en = 'Risk Management for International Business' WHERE code = 'INB4114' AND name_th = 'การจัดการความเสี่ยงสําหรับธุรกิจระหวางประเทศ';
UPDATE courses SET name_th = 'การจัดการโซ่อุปทานระหว่างประเทศ', name_en = 'International Supply Chain Management' WHERE code = 'INB4115' AND name_th = 'การจัดการโซอุปทานระหวางประเทศ';
UPDATE courses SET name_th = 'หลักการและพื้นฐานการจัดการโลจิสติกส์และโซ่อุปทาน', name_en = 'Principles and Basic Management of Logistics and Supply Chain' WHERE code = 'LOG2201' AND name_th = 'หลักการและพื้นฐานการจัดการโลจิสติกสและโซอุปทาน';
UPDATE courses SET name_th = 'การจัดการขนส่งและการกระจายสินค้า', name_en = 'Freight Transport and Distribution Management' WHERE code = 'LOG2203' AND name_th = 'การจัดการขนสงและการกระจายสินคา';
UPDATE courses SET name_th = 'การวางแผนและการพยากรณ์ในกิจกรรมโลจิสติกส์และโซ่อุปทาน', name_en = 'Planning and Forecasting in Logistics and Supply Chain Activities' WHERE code = 'LOG3201' AND name_th = 'การวางแผนและการพยากรณในกิจกรรมโลจิสติกสและโซอุปทาน';
UPDATE courses SET name_th = 'การจัดซื้อจัดหาในระบบโลจิสติกส์และโซ่อุปทาน', name_en = 'Procurement in Logistics and Supply Chain' WHERE code = 'LOG3202' AND name_th = 'การจัดซื้อจัดหาในระบบโลจิสติกสและโซอุปทาน';
UPDATE courses SET name_th = 'การจัดการคลังสินค้าและศูนย์กระจายสินค้า', name_en = 'Warehouse Management and Distribution Center' WHERE code = 'LOG3203' AND name_th = 'การจัดการคลังสินคาและศูนยกระจายสินคา';
UPDATE courses SET name_th = 'การจัดการระบบสินค้าคงคลัง', name_en = 'Inventory System Management' WHERE code = 'LOG3204' AND name_th = 'การจัดการระบบสินคาคงคลัง';
UPDATE courses SET name_th = 'การลำเลียงวัสดุและบรรจุภัณฑ์', name_en = 'Material Handling and Packaging' WHERE code = 'LOG3205' AND name_th = 'การลําเลียงวัสดุและบรรจุภัณฑ Material Handling and Packaging';
UPDATE courses SET name_th = 'การวิจัยทางด้านโลจิสติกส์และโซ่อุปทาน', name_en = 'Logistics and Supply Chain Research' WHERE code = 'LOG3208' AND name_th = 'การวิจัยทางดานโลจิสติกสและโซอุปทาน';
UPDATE courses SET name_th = 'การจัดการสารสนเทศและเทคโนโลยีดิจิทัลในอุตสาหกรรมโลจิสติกส์', name_en = 'Information and Digital Technology Management for Logistics Industry' WHERE code = 'LOG3209' AND name_th = 'การจัดการสารสนเทศและเทคโนโลยีดิจิทัลในอุตสาหกรรมโลจิสติกส';
UPDATE courses SET name_th = 'การควบคุมต้นทุนการดำเนินการในกิจกรรมโลจิสติกส์และโซ่อุปทาน', name_en = 'Controlling Operating Costs in Logistics and Supply Chain Activities' WHERE code = 'LOG4202' AND name_th = 'การควบคุมตนทุนการดําเนินการในกิจกรรมโลจิสติกสและโซอุปทาน';
UPDATE courses SET name_th = 'กฎหมายด้านโลจิสติกส์และพิธีการศุลกากร', name_en = 'Legal Aspects for Logistics and Customs Clearance' WHERE code = 'LOG4205' AND name_th = 'กฎหมายดานโลจิสติกสและพิธีการศุลกากร';
UPDATE courses SET name_th = 'การจัดการสถานีขนส่งและลานตู้สินค้า', name_en = 'Terminal Management and Container Yard' WHERE code = 'LOG4206' AND name_th = 'การจัดการสถานีขนสงและลานตูสินคา';
UPDATE courses SET name_th = 'หัวข้อพิเศษทางการจัดการโลจิสติกส์และโซ่อุปทาน', name_en = 'Special Issues in Logistics and Supply Chain' WHERE code = 'LOG4207' AND name_th = 'หัวขอพิเศษทางการจัดการโลจิสติกสและโซอุปทาน';
UPDATE courses SET name_th = 'การจัดการการขนส่งทางอากาศ', name_en = 'Air Transport Management' WHERE code = 'LOG4303' AND name_th = 'การจัดการการขนสงทางอากาศ';
UPDATE courses SET name_th = 'การจัดการขนส่งระบบราง', name_en = 'Railway System Management' WHERE code = 'LOG4306' AND name_th = 'การจัดการขนสงระบบราง';
UPDATE courses SET name_th = 'การจัดการขนส่งทางถนนและการขนส่งข้ามแดน', name_en = 'Land Transport Management and Cross Border Transport' WHERE code = 'LOG4307' AND name_th = 'การจัดการขนสงทางถนนและการขนสงขามแดน';
UPDATE courses SET name_th = 'การประกันภัยในอุตสาหกรรมขนส่งและโลจิสติกส์', name_en = 'Insurance on Cargo Transport and Logistics Industry' WHERE code = 'LOG4308' AND name_th = 'การประกันภัยในอุตสาหกรรมขนสงและโลจิสติกส';
UPDATE courses SET name_th = 'การจัดการความปลอดภัยสำหรับโลจิสติกส์และโซ่อุปทาน', name_en = 'Safety Management for Logistics and Supply Chain' WHERE code = 'LOG4309' AND name_th = 'การจัดการความปลอดภัยสําหรับโลจิสติกสและโซอุปทาน';
UPDATE courses SET name_th = 'การขนส่งต่อเนื่องหลายรูปแบบ', name_en = 'Multimodal Transportation' WHERE code = 'LOG4310' AND name_th = 'การขนสงตอเนื่องหลายรูปแบบ';
UPDATE courses SET name_th = 'การบริหารความสัมพันธ์ในโซ่อุปทาน', name_en = 'Relationship Management in Supply Chain' WHERE code = 'LOG4405' AND name_th = 'การบริหารความสัมพันธในโซอุปทาน';
UPDATE courses SET name_th = 'การจัดการโลจิสติกส์ระหว่างประเทศ', name_en = 'International Logistics Management' WHERE code = 'LOG4406' AND name_th = 'การจัดการโลจิสติกสระหวางประเทศ';
UPDATE courses SET name_th = 'จริยธรรมและความรับผิดชอบต่อสังคมในการขนส่งและโลจิสติกส์', name_en = 'Ethics and Social Responsibility in Transport and Logistics' WHERE code = 'LOG4407' AND name_th = 'จริยธรรมและความรับผิดชอบตอสังคมในการขนสงและโลจิสติกส';
UPDATE courses SET name_th = 'ระบบสารสนเทศภูมิศาสตร์สำหรับโลจิสติกส์', name_en = 'Geographic Information System for Logistics' WHERE code = 'LOG4408' AND name_th = 'ระบบสารสนเทศภูมิศาสตรสําหรับโลจิสติกส';
UPDATE courses SET name_th = 'การจัดการงานบริการภาคพื้นส่วนอากาศยาน', name_en = 'Aircraft Ground Handling Services' WHERE code = 'LOG4409' AND name_th = 'การจัดการงานบริการภาคพื้นสวนอากาศยาน';
UPDATE courses SET name_th = 'ระบบวางแผนทรัพยากรองค์กรและการวิเคราะห์ข้อมูลขนาดใหญ่', name_en = 'Enterprise Resource Planning System and Big Data Analysis' WHERE code = 'LOG4410' AND name_th = 'ระบบวางแผนทรัพยากรองคกรและการวิเคราะหขอมูลขนาดใหญ';
UPDATE courses SET name_th = 'การจัดการอุตสาหกรรมและโลจิสติกส์แบบลีน', name_en = 'Lean Industrial and Logistics Management' WHERE code = 'LOG4411' AND name_th = 'การจัดการอุตสาหกรรมและโลจิสติกสแบบลีน';
UPDATE courses SET name_th = 'การจัดการโลจิสติกส์และโซ่อุปทานในธุรกิจบริการ', name_en = 'Logistics and Supply Chain Management in Hospitality Business' WHERE code = 'LOG4412' AND name_th = 'การจัดการโลจิสติกสและโซอุปทานในธุรกิจบริการ';
UPDATE courses SET name_th = 'การฝึกงานด้านโลจิสติกส์และโซ่อุปทาน', name_en = 'Logistics and Supply Chain Internship' WHERE code = 'LOG5000' AND name_th = 'การฝกงานดานโลจิสติกสและโซอุปทาน';
UPDATE courses SET name_th = 'จริยธรรมทางธุรกิจและความรับผิดชอบต่อสังคม', name_en = 'Business Ethics and Social Responsibility' WHERE code = 'MGT2201' AND name_th = 'จริยธรรมทางธุรกิจและความรับผิดชอบตอสังคม';
UPDATE courses SET name_th = 'การจัดการสำนักงาน', name_en = 'Office Management' WHERE code = 'MGT2202' AND name_th = 'การจัดการสํานักงาน';
UPDATE courses SET name_th = 'การวิเคราะห์ธุรกิจเพื่อการตัดสินใจ', name_en = 'Business Analytics for Decision Making' WHERE code = 'MGT3203' AND name_th = 'การวิเคราะหธุรกิจเพื่อการตัดสินใจ';
UPDATE courses SET name_th = 'การจัดการการเปลี่ยนแปลงและการพัฒนาองค์การ', name_en = 'Change Management and Organization Development' WHERE code = 'MGT3204' AND name_th = 'การจัดการการเปลี่ยนแปลงและการพัฒนาองคการ';
UPDATE courses SET name_th = 'ระบบสินค้าคงคลัง', name_en = 'Inventory System' WHERE code = 'MGT3303' AND name_th = 'ระบบสินคาคงคลัง';
UPDATE courses SET name_th = 'การศึกษาความเป็นไปได้ในการจัดการอุตสาหกรรม', name_en = 'Feasibility Study in Industrial Management' WHERE code = 'MGT3308' AND name_th = 'การศึกษาความเปนไปไดในการจัดการอุตสาหกรรม';
UPDATE courses SET name_th = 'การบูรณาการโซ่อุปทานและประเด็นในการนำไปปฏิบัติ', name_en = 'The Integration of Supply Chain and the Implementation Issues' WHERE code = 'MGT3310' AND name_th = 'การบูรณาการโซอุปทานและประเด็นในการนําไปปฏิบัติ';
UPDATE courses SET name_th = 'สภาพแวดล้อมทางธุรกิจ', name_en = 'Business Environment' WHERE code = 'MGT3311' AND name_th = 'สภาพแวดลอมทางธุรกิจ';
UPDATE courses SET name_th = 'การสั่งซื้อสินค้าสำหรับธุรกิจการค้าสมัยใหม่', name_en = 'Merchandise Order for Modern Trade Business' WHERE code = 'MGT3312' AND name_th = 'การสั่งซื้อสินคาสําหรับธุรกิจการคาสมัยใหม Merchandise Order for Modern Trade Business';
UPDATE courses SET name_th = 'การจัดการความรู้', name_en = 'Knowledge Management' WHERE code = 'MGT3401' AND name_th = 'การจัดการความรู Knowledge  Management';
UPDATE courses SET name_th = 'ทฤษฎีองค์การธุรกิจ', name_en = 'Business Organization Theory' WHERE code = 'MGT3402' AND name_th = 'ทฤษฎีองคการธุรกิจ';
UPDATE courses SET name_th = 'การสื่อสารในองค์การ', name_en = 'Organization Communication' WHERE code = 'MGT3403' AND name_th = 'การสื่อสารในองคการ';
UPDATE courses SET name_th = 'ภาวะผู้นำทางธุรกิจ', name_en = 'Business Leadership' WHERE code = 'MGT3404' AND name_th = 'ภาวะผูนําทางธุรกิจ';
UPDATE courses SET name_th = 'การจัดการข้ามวัฒนธรรม', name_en = 'Cross - Cultural Management' WHERE code = 'MGT3405' AND name_th = 'การจัดการขามวัฒนธรรม';
UPDATE courses SET name_th = 'การจัดการกลยุทธ์ในบริบทข้ามชาติ', name_en = 'Strategic Management in Global Context' WHERE code = 'MGT3406' AND name_th = 'การจัดการกลยุทธในบริบทขามชาติ';
UPDATE courses SET name_th = 'การจัดการความเสี่ยงขององค์การ', name_en = 'Risk Management for Organization' WHERE code = 'MGT3407' AND name_th = 'การจัดการความเสี่ยงขององคการ';
UPDATE courses SET name_th = 'การพัฒนาธุรกิจอย่างยั่งยืน', name_en = 'Corporate Sustainability Development' WHERE code = 'MGT3411' AND name_th = 'การพัฒนาธุรกิจอยางยั่งยืน';
UPDATE courses SET name_th = 'การจัดการในทศวรรษหน้า', name_en = 'Management in The Next Decade' WHERE code = 'MGT3412' AND name_th = 'การจัดการในทศวรรษหนา';
UPDATE courses SET name_th = 'การพยากรณ์ธุรกิจ', name_en = 'Business Forecasting' WHERE code = 'MGT4001' AND name_th = 'การพยากรณธุรกิจ';
UPDATE courses SET name_th = 'การบริหารความขัดแย้ง', name_en = 'Conflict Management' WHERE code = 'MGT4003' AND name_th = 'การบริหารความขัดแยง';
UPDATE courses SET name_th = 'การจัดการธุรกิจขนาดย่อม', name_en = 'Small Business Management' WHERE code = 'MGT4206' AND name_th = 'การจัดการธุรกิจขนาดยอม';
UPDATE courses SET name_th = 'การเจรจาต่อรองทางธุรกิจ', name_en = 'Business Negotiation' WHERE code = 'MGT4208' AND name_th = 'การเจรจาตอรองทางธุรกิจ';
UPDATE courses SET name_th = 'พฤติกรรมองค์การ', name_en = 'Organizational Behavior' WHERE code = 'MGT4209' AND name_th = 'พฤติกรรมองคการ';
