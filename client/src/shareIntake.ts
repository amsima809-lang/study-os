/**
 * Text or a link shared INTO StudyOS from another app ("Share → StudyOS").
 * This works once StudyOS is installed to the home screen (Android Chrome, and
 * other browsers that support the Web Share Target): the system opens the app
 * at "/?share_title=…&share_text=…&share_url=…" (see `share_target` in
 * vite.config.ts). The shared content becomes the start of a new note.
 *
 * Only text and links: sharing photos or files needs a POST handler in the
 * service worker, which is not built.
 */
import { loadNoteDraft, saveNoteDraft } from "./noteDraft.ts";

export type Shared = { title: string; text: string; url: string };
const KEY = "studyos.pendingShare";

/** Read what was shared from the address bar, then clean the address bar at once. */
function readFromUrl(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("share_title") && !q.has("share_text") && !q.has("share_url")) return;
    const shared: Shared = {
      title: (q.get("share_title") ?? "").slice(0, 200),
      text: (q.get("share_text") ?? "").slice(0, 20000),
      url: (q.get("share_url") ?? "").slice(0, 2000),
    };
    // Kept for this tab only, so it survives the sign-in round trip.
    if (shared.title || shared.text || shared.url) sessionStorage.setItem(KEY, JSON.stringify(shared));
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

/** Put the shared content into the note draft — added to an unfinished note, never replacing it. */
export async function addSharedToDraft(s: Shared): Promise<void> {
  const draft = await loadNoteDraft();
  const body = sharedBody(s);
  await saveNoteDraft({
    courseCode: draft?.courseCode ?? "",
    title: draft?.title.trim() ? draft.title : s.title.trim(),
    text: [draft?.text.trim(), body].filter(Boolean).join("\n\n"),
    mode: "type",
    drawing: draft?.drawing ?? null,
    files: draft?.files ?? [],
  });
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
