/**
 * The one way universities are listed and searched. The student's own
 * university always comes first; the rest follow in alphabetical order for the
 * language on screen. Every list and search of universities uses this, so a
 * new one cannot forget the rule.
 */
import { UNIVERSITIES, type University } from "./universities.ts";

/** Where this browser remembers the student's university (set on the login page, at onboarding and at sign-in). */
export const UNIVERSITY_KEY = "studyos.university";

/**
 * Ramkhamhaeng: the only university with a curriculum, and the app's own default (owner
 * 2026-11-16: "the default theme is also already the school's colors, so make it the default and
 * first"). It is chosen until the student picks another, listed first, and shown in the app's own
 * default colours, with no campus photo.
 */
export const DEFAULT_UNIVERSITY = "ru";

/** The student's own university: the one chosen in this browser, else Ramkhamhaeng. */
export function myUniversityId(): string {
  try {
    return localStorage.getItem(UNIVERSITY_KEY) ?? DEFAULT_UNIVERSITY;
  } catch {
    return DEFAULT_UNIVERSITY; // storage can be blocked (private mode)
  }
}

/**
 * Universities in the order to show them: `mineId` first (when it is in the
 * results), then any `pinned` ones in the order given, then A to Z. `query`
 * keeps only those whose Thai name, English name or abbreviation contains it.
 */
export function listUniversities(
  lang: "th" | "en",
  mineId: string | null,
  query = "",
  all: readonly University[] = UNIVERSITIES,
  pinned: readonly string[] = [],
): University[] {
  // 0 for the student's own, then 1, 2, ... for pinned ones, then everyone else.
  const rank = (u: University) => (u.id === mineId ? 0 : pinned.includes(u.id) ? 1 + pinned.indexOf(u.id) : 1 + pinned.length);
  const q = query.trim().toLowerCase();
  const matches = q
    ? all.filter((u) => u.nameTh.toLowerCase().includes(q) || u.nameEn.toLowerCase().includes(q) || u.abbr.toLowerCase().includes(q))
    : [...all];
  return matches.sort(
    (a, b) => rank(a) - rank(b) || (lang === "th" ? a.nameTh.localeCompare(b.nameTh, "th") : a.nameEn.localeCompare(b.nameEn, "en")),
  );
}
