/**
 * The unfinished note, kept in the browser (IndexedDB) so it survives a tab
 * switch, a refresh, a locked phone, a closed tab or the session ending.
 * One draft per signed-in student; it is removed when the note is saved or
 * the student discards it. Nothing here is sent to the server.
 */
import type { Stroke } from "./components/HandwritingPad.tsx";

export type Drawing = { strokes: Stroke[]; pages: number };
export type NoteDraft = {
  courseCode: string;
  title: string;
  text: string;
  mode: "type" | "draw";
  drawing: Drawing | null;
  files: File[];
  savedAt: number;
};

/** Fired whenever the draft is saved or removed, so the Notes list can show or hide its "continue" card. */
export const DRAFT_CHANGED = "studyos:note-draft";

let owner = "anon";
/** Called once the app knows who is signed in; each student gets their own draft. */
export function setDraftOwner(userId: string): void {
  owner = userId;
}

/** A draft with nothing in it is not worth keeping (a chosen course alone does not count). */
export function isEmptyDraft(d: Pick<NoteDraft, "title" | "text" | "drawing" | "files">): boolean {
  return !d.title.trim() && !d.text.trim() && !(d.drawing && d.drawing.strokes.length > 0) && d.files.length === 0;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("studyos", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("drafts");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      const req = work(tx.objectStore("drafts"));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const key = () => `note:${owner}`;

export async function loadNoteDraft(): Promise<NoteDraft | null> {
  try {
    const d = await run<NoteDraft | undefined>("readonly", (s) => s.get(key()));
    return d && !isEmptyDraft(d) ? d : null;
  } catch {
    return null; // private browsing or storage blocked: the app works, just without drafts
  }
}

export async function saveNoteDraft(d: Omit<NoteDraft, "savedAt">): Promise<void> {
  if (isEmptyDraft(d)) return clearNoteDraft();
  const draft: NoteDraft = { ...d, savedAt: Date.now() };
  try {
    await run("readwrite", (s) => s.put(draft, key()));
  } catch {
    // Photos are the usual reason a save fails (storage full): keep the rest.
    try { await run("readwrite", (s) => s.put({ ...draft, files: [] }, key())); } catch { /* no storage */ }
  }
  window.dispatchEvent(new Event(DRAFT_CHANGED));
}

export async function clearNoteDraft(): Promise<void> {
  try { await run("readwrite", (s) => s.delete(key())); } catch { /* nothing to remove */ }
  window.dispatchEvent(new Event(DRAFT_CHANGED));
}
