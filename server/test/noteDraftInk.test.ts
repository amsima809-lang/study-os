import { describe, it, expect } from "vitest";

// Typed here, not with `typeof import(...)`: that would pull the browser-only module into the server's type check.
type Draftish = { title: string; text: string; files: unknown[]; drawing: { strokes: unknown[]; pages: number; ink?: { drawing: string; png: string; colors: string[] } } | null };
const { isEmptyDraft, noteDraftKey, setDraftOwner } = (await import(new URL("../../client/src/noteDraft.ts", import.meta.url).href)) as {
  isEmptyDraft: (d: Draftish) => boolean;
  noteDraftKey: (lecture?: { code: string; sessionNo: number }) => string;
  setDraftOwner: (owner: string) => void;
};

describe("a note draft with handwriting from the iOS app's PencilKit page", () => {
  const base = { title: "", text: "", files: [] as unknown[] };
  it("is kept: PencilKit ink has no web strokes but is still something she wrote", () => {
    expect(isEmptyDraft({ ...base, drawing: { strokes: [], pages: 1, ink: { drawing: "ZmFrZQ==", png: "iVBO", colors: ["#2563eb"] } } })).toBe(false);
  });
  it("is empty when there is no ink and no strokes", () => {
    expect(isEmptyDraft({ ...base, drawing: { strokes: [], pages: 1 } })).toBe(true);
    expect(isEmptyDraft({ ...base, drawing: null })).toBe(true);
  });
});


it("keeps general and lecture drafts separate for each signed-in student", () => {
  try {
    setDraftOwner("student-a");
    const lecture = { code: "ACC1103", sessionNo: 1 };
    const lectureDraft = noteDraftKey(lecture);
    expect(noteDraftKey()).toBe("note:student-a"); // previously saved general drafts keep their key
    expect(lectureDraft).not.toBe(noteDraftKey());
    expect(lectureDraft).not.toBe(noteDraftKey({ ...lecture, sessionNo: 2 }));
    setDraftOwner("student-b");
    expect(noteDraftKey(lecture)).not.toBe(lectureDraft);
  } finally {
    setDraftOwner("anon");
  }
});
