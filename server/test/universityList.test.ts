import { describe, it, expect } from "vitest";

// Client logic, tested here because the client has no test runner of its own.
// (Typed by hand: a type import would pull browser-only code into the server's typecheck.)
type Uni = { id: string; nameTh: string; nameEn: string; abbr: string };
const { listUniversities } = (await import(
  new URL("../../client/src/data/universityList.ts", import.meta.url).href
)) as { listUniversities: (lang: "th" | "en", mineId: string | null, query?: string, all?: readonly Uni[]) => Uni[] };

const ids = (list: Uni[]) => list.map((u) => u.id);

describe("listing universities: the student's own comes first", () => {
  it("is alphabetical in the language shown when no university is chosen", () => {
    const en = listUniversities("en", null);
    expect(en.length).toBeGreaterThan(10);
    expect(en.map((u) => u.nameEn)).toEqual([...en.map((u) => u.nameEn)].sort((a, b) => a.localeCompare(b, "en")));
    const th = listUniversities("th", null);
    expect(th.map((u) => u.nameTh)).toEqual([...th.map((u) => u.nameTh)].sort((a, b) => a.localeCompare(b, "th")));
  });

  it("puts the chosen university first and leaves the rest in order", () => {
    const plain = listUniversities("en", null);
    const mine = listUniversities("en", "ru");
    expect(mine[0].id).toBe("ru");
    expect(ids(mine.slice(1))).toEqual(ids(plain).filter((id) => id !== "ru"));
    expect(listUniversities("th", "ru")[0].id).toBe("ru");
  });

  it("puts it first in search results too", () => {
    // every name contains "university" or "มหาวิทยาลัย", so these searches return many
    for (const q of ["university", "มหาวิทยาลัย", "u"]) {
      const found = listUniversities("en", "ru", q);
      expect(found.length).toBeGreaterThan(1);
      expect(found[0].id).toBe("ru");
    }
  });

  it("does not add it to a search it does not match", () => {
    const found = listUniversities("en", "ru", "thammasat");
    expect(ids(found)).toEqual(["tu"]);
    expect(listUniversities("en", "ru", "no such place")).toEqual([]);
  });

  it("finds by Thai name, English name or abbreviation, whatever the case", () => {
    expect(ids(listUniversities("en", null, "RAMKHAM"))).toContain("ru");
    expect(ids(listUniversities("th", null, "รามคำแหง"))).toContain("ru");
    expect(ids(listUniversities("en", null, "  ru "))).toContain("ru");
  });

  it("ignores a remembered university that is no longer in the list", () => {
    expect(ids(listUniversities("en", "gone"))).toEqual(ids(listUniversities("en", null)));
  });
});
