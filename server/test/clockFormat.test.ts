import { describe, it, expect } from "vitest";

// Client logic, tested here because the client has no test runner of its own.
// (Typed by hand: a type import would pull browser-only code into the server's typecheck.)
type Clock = "24" | "12";
const { formatTime, timeRange, hourLabel } = (await import(
  new URL("../../client/src/format.ts", import.meta.url).href
)) as {
  formatTime: (hhmm: string, as?: Clock) => string;
  timeRange: (start: string, end: string, as?: Clock) => string;
  hourLabel: (hour: number, as?: Clock) => string;
};

describe("clock setting: 24-hour or AM/PM", () => {
  it("leaves times alone on the 24-hour clock", () => {
    expect(formatTime("13:30", "24")).toBe("13:30");
    expect(timeRange("08:30", "11:00", "24")).toBe("08:30–11:00");
    expect(hourLabel(9, "24")).toBe("09:00");
  });

  it("formats single times as AM/PM", () => {
    expect(formatTime("00:15", "12")).toBe("12:15 AM");
    expect(formatTime("09:05", "12")).toBe("9:05 AM");
    expect(formatTime("12:00", "12")).toBe("12:00 PM");
    expect(formatTime("13:30", "12")).toBe("1:30 PM");
    expect(formatTime("23:59", "12")).toBe("11:59 PM");
  });

  it("says AM or PM once when a range stays in one half of the day", () => {
    expect(timeRange("08:30", "11:00", "12")).toBe("8:30–11:00 AM");
    expect(timeRange("13:00", "15:30", "12")).toBe("1:00–3:30 PM");
    expect(timeRange("11:00", "13:00", "12")).toBe("11:00 AM–1:00 PM");
  });

  it("labels hour rows", () => {
    expect(hourLabel(0, "12")).toBe("12 AM");
    expect(hourLabel(7, "12")).toBe("7 AM");
    expect(hourLabel(12, "12")).toBe("12 PM");
    expect(hourLabel(20, "12")).toBe("8 PM");
  });

  it("passes through anything that is not a time", () => {
    expect(formatTime("", "12")).toBe("");
    expect(formatTime("TBA", "12")).toBe("TBA");
  });
});
