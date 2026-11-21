/**
 * Things shared INTO StudyOS from another app ("Share → StudyOS").
 * This works once StudyOS is installed to the home screen (Android Chrome, and
 * other browsers that support the Web Share Target). The share arrives as a
 * form POST that the service worker takes in (public/share-sw.js); it then
 * opens the app at "/?share_title=…&share_text=…&share_url=…&share_files=N"
 * with any files waiting in the "studyos-share" cache.
 *
 * - Text, links and photos become the start of a new note.
 * - A document (PDF, text file) opens the Library upload form with it chosen.
 */
import { loadNoteDraft, saveNoteDraft } from "./noteDraft.ts";

export type Shared = { title: string; text: string; url: string; files: number };
const SHARE_CACHE = "studyos-share";
const KEY = "studyos.pendingShare";

/** Read what was shared from the address bar, then clean the address bar at once. */
function readFromUrl(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("share_title") && !q.has("share_text") && !q.has("share_url") && !q.has("share_files")) return;
    const shared: Shared = {
      title: (q.get("share_title") ?? "").slice(0, 200),
      text: (q.get("share_text") ?? "").slice(0, 20000),
      url: (q.get("share_url") ?? "").slice(0, 2000),
      files: Math.min(10, Math.max(0, Number(q.get("share_files")) || 0)),
    };
    // Kept for this tab only, so it survives the sign-in round trip.
    if (shared.title || shared.text || shared.url || shared.files) sessionStorage.setItem(KEY, JSON.stringify(shared));
    window.history.replaceState(null, "", window.location.pathname);
  } catch { /* no window, or storage blocked: nothing to take in */ }
}
readFromUrl();

/** What is waiting to be turned into a note, if anything. Taking it removes it. */
export function takeShared(): Shared | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as Shared;
  } catch {
    return null;
  }
}

/** The text a shared item adds to a note: the text, then the link if the text does not already hold it. */
export function sharedBody(s: Shared): string {
  return [s.text.trim(), s.url && !s.text.includes(s.url) ? s.url.trim() : ""].filter(Boolean).join("\n");
}

/** The files the service worker set aside for this share. Reading them empties the cache. */
export async function takeSharedFiles(): Promise<File[]> {
  try {
    const cache = await caches.open(SHARE_CACHE);
    const files: File[] = [];
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (response) {
        const name = decodeURIComponent(response.headers.get("x-file-name") ?? "shared");
        files.push(new File([await response.blob()], name, { type: response.headers.get("content-type") ?? "" }));
      }
      await cache.delete(request);
    }
    return files;
  } catch {
    return []; // no Cache Storage here: nothing was set aside
  }
}

/** Photos go into a note; anything else is a document for the Library. */
export function sortShared(files: File[]): { photos: File[]; documents: File[] } {
  return {
    photos: files.filter((f) => f.type.startsWith("image/")),
    documents: files.filter((f) => !f.type.startsWith("image/")),
  };
}

/** Put the shared content into the note draft — added to an unfinished note, never replacing it. */
export async function addSharedToDraft(s: Shared, photos: File[] = []): Promise<void> {
  const draft = await loadNoteDraft();
  const body = sharedBody(s);
  await saveNoteDraft({
    courseCode: draft?.courseCode ?? "",
    lectureNo: draft?.lectureNo,
    title: draft?.title.trim() ? draft.title : s.title.trim(),
    text: [draft?.text.trim(), body].filter(Boolean).join("\n\n"),
    mode: "type",
    drawing: draft?.drawing ?? null,
    files: [...(draft?.files ?? []), ...photos],
  });
}

let pendingUpload: File | null = null;
/** A shared document waiting for the Library's upload form (which asks which course it belongs to). */
export function offerUpload(file: File): void {
  pendingUpload = file;
}
export function hasPendingUpload(): boolean {
  return pendingUpload !== null;
}
export function takePendingUpload(): File | null {
  const file = pendingUpload;
  pendingUpload = null;
  return file;
}

let openNoteForm = false;
/** Ask the Notes screen to open its "new note" form the next time it appears. */
export function requestNoteForm(): void {
  openNoteForm = true;
}
export function consumeNoteFormRequest(): boolean {
  const wanted = openNoteForm;
  openNoteForm = false;
  return wanted;
}
