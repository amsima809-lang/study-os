import { describe, it, expect } from "vitest";

// Client data, tested here because the client has no test runner of its own.
type Section = { id: string; icon: string; label: string; pages: string[] };
const { PAGE_IDS, SECTIONS, sectionOf, pageNamed } = (await import(new URL("../../client/src/sections.ts", import.meta.url).href)) as {
  PAGE_IDS: readonly string[];
  SECTIONS: Section[];
  sectionOf: (id: string) => Section;
  pageNamed: (name: unknown) => string | null;
};
const i18n = (await import("node:fs")).readFileSync(new URL("../../client/src/i18n.tsx", import.meta.url), "utf8");

describe("Phase 62 — the app's five sections", () => {
  it("has five sections: as many as the phone's menu bar holds, with no overflow menu", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["today", "classes", "study", "practice", "degree"]);
  });

  it("puts every page in exactly one section, and no section holds a page that does not exist", () => {
    const placed = SECTIONS.flatMap((s) => s.pages);
    expect([...placed].sort()).toEqual([...PAGE_IDS].sort());
    expect(new Set(placed).size).toBe(placed.length);
    for (const id of PAGE_IDS) expect(sectionOf(id).pages).toContain(id);
  });

  it("opens Documents & lectures first in Study and keeps Notes selectable", () => {
    expect(sectionOf("library").pages).toEqual(["library", "notes"]);
  });

  it("keeps a section to a handful of tabs", () => {
    for (const s of SECTIONS) {
      expect(s.pages.length, s.id).toBeGreaterThanOrEqual(1);
      expect(s.pages.length, s.id).toBeLessThanOrEqual(5);
    }
  });

  it("names every section in both languages", () => {
    for (const s of SECTIONS) expect(i18n.split(`"${s.label}":`).length - 1, s.label).toBe(2);
  });

  it("opens a page by its name, by a name it used to have, and nothing else", () => {
    expect(pageNamed("trail")).toBe("trail");
    expect(pageNamed("schedule")).toBe("timetable"); // the old combined class-and-exam screen
    expect(pageNamed("weakness")).toBe("stats"); // merged into the Progress page
    expect(pageNamed("more")).toBeNull();
    expect(pageNamed("settings")).toBeNull(); // not a page of a section: only the gear opens it
    expect(pageNamed(undefined)).toBeNull();
    expect(pageNamed({ id: "trail" })).toBeNull();
  });
});
