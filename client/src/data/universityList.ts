/**
 * The one way universities are listed and searched. The student's own
 * university always comes first; the rest follow in alphabetical order for the
 * language on screen. Every list and search of universities uses this, so a
 * new one cannot forget the rule.
 */
import { UNIVERSITIES, type University } from "./universities.ts";

/** Where this browser remembers the student's university (set on the login page, at onboarding and at sign-in). */
export const UNIVERSITY_KEY = "studyos.university";

/** The student's own university, or null if none has been chosen yet. */
export function myUniversityId(): string | null {
  try {
    return localStorage.getItem(UNIVERSITY_KEY);
  } catch {
    return null; // storage can be blocked (private mode)
  }
}

/**
 * Universities in the order to show them: `mineId` first (when it is in the
 * results), then A to Z. `query` keeps only those whose Thai name, English name
 * or abbreviation contains it.
 */
export function listUniversities(
  lang: "th" | "en",
  mineId: string | null,
  query = "",
  all: readonly University[] = UNIVERSITIES,
): University[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? all.filter((u) => u.nameTh.toLowerCase().includes(q) || u.nameEn.toLowerCase().includes(q) || u.abbr.toLowerCase().includes(q))
    : [...all];
  return matches.sort((a, b) => {
    if (a.id === mineId) return -1;
    if (b.id === mineId) return 1;
    return lang === "th" ? a.nameTh.localeCompare(b.nameTh, "th") : a.nameEn.localeCompare(b.nameEn, "en");
  });
}
