/**
 * Ramkhamhaeng's own pages where a student actually registers, books or checks, linked from the
 * screens that talk about them. Every address here was read on the university's own site or
 * document (15 Nov 2569); none is guessed. When one moves, change it here only.
 *
 * - E_SERVICE: the student e-Service. The e-Testing office's 2569 registration manual (linked
 *   from easi.ru.ac.th) shows it at beta-e-service.ru.ac.th, where the menu
 *   "เข้าสู่ระบบลงทะเบียน e-Testing" opens the booking; the older e-service.ru.ac.th redirects there.
 * - EXAM_TIMETABLE: "ตารางสอบไล่รายบุคคล" (a student's own exam timetable, rooms and seats), linked
 *   from the registrar's home page http://www.regis.ru.ac.th/; the registrar's 2569 handbook says
 *   it is in e-Service about a week before the finals.
 * - REGISTER_GUIDE: "คำแนะนำการลงทะเบียนเรียนทาง Application สำหรับนักศึกษาส่วนกลางและส่วนภูมิภาค",
 *   the registrar's guide to registering for courses, linked from its home page.
 * - REGISTRAR: the registrar's site (สวป.), with every registration form and calendar.
 * - ETESTING_OFFICE: the e-Testing office's site: this term's course list, the manual, news.
 */
export const RU_LINKS = {
  E_SERVICE: "https://beta-e-service.ru.ac.th/",
  EXAM_TIMETABLE: "http://e-service.ru.ac.th/search/index.php",
  REGISTER_GUIDE: "http://www.regis.ru.ac.th/document/20231206_AppRegisManual.pdf",
  REGISTRAR: "http://www.regis.ru.ac.th/",
  ETESTING_OFFICE: "https://easi.ru.ac.th/",
} as const;
