import { describe, it, expect } from "vitest";

// Client logic, tested here because the client has no test runner of its own.
const { sharedBody } = (await import(new URL("../../client/src/shareIntake.ts", import.meta.url).href)) as {
  sharedBody: (s: { title: string; text: string; url: string }) => string;
};

describe("content shared into StudyOS", () => {
  it("puts the link after the text", () => {
    expect(sharedBody({ title: "T", text: "Chapter 3 summary", url: "https://example.org/a" })).toBe("Chapter 3 summary\nhttps://example.org/a");
  });
  it("does not repeat a link the text already contains", () => {
    expect(sharedBody({ title: "", text: "See https://example.org/a now", url: "https://example.org/a" })).toBe("See https://example.org/a now");
  });
  it("copes with only a link, or only text", () => {
    expect(sharedBody({ title: "", text: "", url: "https://example.org/a" })).toBe("https://example.org/a");
    expect(sharedBody({ title: "", text: "  just text  ", url: "" })).toBe("just text");
  });
});
