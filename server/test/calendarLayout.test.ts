import { describe, it, expect } from "vitest";

// The layout maths lives in the client. It is loaded by path at run time so the
// server's TypeScript project does not have to include client files.
type Layout = {
  placed: { ev: { course_code: string }; start: number; end: number; lane: number; lanes: number }[];
  overflow: { start: number; end: number; count: number; lanes: number }[];
};
const clientFile = new URL("../../client/src/calendarLayout.ts", import.meta.url).href;
const { layoutDay } = (await import(clientFile)) as { layoutDay: (events: unknown[], maxLanes?: number) => Layout };

const ev = (code: string, start?: string, end?: string) =>
  ({ type: "class", course_code: code, name_th: code, name_en: null, start_time: start, end_time: end }) as any;
const lanes = (r: Layout) => r.placed.map((p) => `${p.ev.course_code}:${p.lane}/${p.lanes}`).sort();

describe("Phase 33 — hour grid layout", () => {
  it("gives events that do not overlap the full width", () => {
    expect(lanes(layoutDay([ev("A", "08:30", "09:30"), ev("B", "09:30", "11:00")]))).toEqual(["A:0/1", "B:0/1"]);
  });

  it("puts overlapping events side by side and reuses a lane once it is free", () => {
    const r = layoutDay([ev("A", "08:00", "10:00"), ev("B", "09:00", "11:00"), ev("C", "10:00", "11:00")]);
    expect(lanes(r)).toEqual(["A:0/2", "B:1/2", "C:0/2"]);
    expect(r.overflow).toEqual([]);
  });

  it("leaves untimed events out and draws a reminder half an hour tall", () => {
    const r = layoutDay([ev("TODO"), ev("R", "19:00")]);
    expect(r.placed).toHaveLength(1);
    expect(r.placed[0].end - r.placed[0].start).toBe(30);
  });

  it("draws only the allowed lanes and counts the rest as +N", () => {
    const five = ["A", "B", "C", "D", "E"].map((c) => ev(c, "08:30", "11:00"));
    const r = layoutDay(five, 2);
    expect(lanes(r)).toEqual(["A:0/2", "B:1/2"]);
    expect(r.overflow).toEqual([{ start: 510, end: 660, count: 3, lanes: 2 }]);
    // A phone week column has room for one.
    const one = layoutDay(five, 1);
    expect(lanes(one)).toEqual(["A:0/1"]);
    expect(one.overflow[0].count).toBe(4);
    // A separate, later event is unaffected.
    const later = layoutDay([...five, ev("Z", "13:00", "14:00")], 2);
    expect(lanes(later)).toContain("Z:0/1");
  });

  it("shows everything when lanes are not limited", () => {
    const r = layoutDay(["A", "B", "C"].map((c) => ev(c, "08:30", "11:00")));
    expect(lanes(r)).toEqual(["A:0/3", "B:1/3", "C:2/3"]);
  });
});
