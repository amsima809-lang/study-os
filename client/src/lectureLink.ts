const pendingKey = "studyos.openLectures";

function fromAddress(): string | null {
  const query = new URLSearchParams(window.location.search);
  if (query.get("view") !== "lectures") return null;
  return query.get("summary")?.trim().toUpperCase().slice(0, 32) || "1";
}

/** Sign-in comes back to the home page. Remember only which lecture this tab requested. */
export function rememberLectureLink() {
  const target = fromAddress();
  if (target) {
    try { sessionStorage.setItem(pendingKey, target); } catch { /* storage unavailable */ }
  }
}

/** "1" is the existing library link, e.g. ?view=lectures. A summary link also names the session. */
export function readLectureLink(): string | null {
  const target = fromAddress();
  if (target) return target;
  try { return sessionStorage.getItem(pendingKey); } catch { return null; }
}

export function clearLectureLink() {
  try { sessionStorage.removeItem(pendingKey); } catch { /* storage unavailable */ }
  if (!fromAddress()) return;
  const url = new URL(window.location.href);
  // A network-only entry also works with older installed service workers. Return its shell to the app base.
  url.pathname = url.pathname.replace(/\/api\/open\/lectures\/?$/, "/");
  url.searchParams.delete("view");
  url.searchParams.delete("summary");
  window.history.replaceState(null, "", url);
}
