import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";

describe("course names (migration 031)", () => {
  const db = openDb(":memory:");
  seedDatabase(db, { reset: false });
  const nameOf = (code: string) => db.prepare("SELECT name_th, name_en FROM courses WHERE code = ?").get(code);
  const unnamed = db.prepare("SELECT code FROM courses WHERE name_th IS NULL OR name_th = '' ORDER BY code").all() as { code: string }[];

  it("names the retired courses found in the university's older guides", () => {
    expect(nameOf("INB4105")).toEqual({ name_th: "การทำธุรกิจในเอเชีย", name_en: "Doing Business in Asia" });
    expect(nameOf("MGT4006")).toEqual({ name_th: "นโยบายธุรกิจ", name_en: "Business Policy" });
    expect(nameOf("LOG3207")).toEqual({ name_th: "การจัดการการขนส่ง", name_en: "Transportation Management" });
    expect(nameOf("MGT4004")).toEqual({ name_th: "การเป็นผู้ประกอบการ", name_en: "Entrepreneurship" });
  });

  it("no longer carries the 41 codes that no official document names (migration 033 removed them)", () => {
    expect(unnamed).toHaveLength(0);
    for (const code of ["MGT4005", "HRM3214", "HOT2203", "FIN4220", "DBC3107"]) {
      expect(db.prepare("SELECT 1 FROM courses WHERE code = ?").get(code)).toBeUndefined();
    }
  });

  it("has no unnamed course in the timetable or the exam list, so students never see a bare code there", () => {
    const shown = db.prepare(
      `SELECT COUNT(*) n FROM courses c WHERE (c.name_th IS NULL OR c.name_th = '')
         AND (EXISTS (SELECT 1 FROM class_sessions s WHERE s.course_code = c.code) OR EXISTS (SELECT 1 FROM exams e WHERE e.course_code = c.code))`,
    ).get() as { n: number };
    expect(shown.n).toBe(0);
  });

  it("keeps Thai names free of the private-use characters that PDFs leave behind", () => {
    const broken = db.prepare("SELECT code, name_th FROM courses WHERE name_th IS NOT NULL").all() as { code: string; name_th: string }[];
    expect(broken.filter((c) => /[-]/.test(c.name_th)).map((c) => c.code)).toEqual([]);
  });
});
