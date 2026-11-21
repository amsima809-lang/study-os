// The app's own address. It may be under a sub-path (https://example.com/termtrail/):
// the worker's scope says where.
const home = () => (self.registration && self.registration.scope) || self.location.origin + "/";

/*
 * Loaded into the service worker (see `importScripts` in vite.config.ts).
 *
 * "Share → StudyOS" from another app arrives as a form POST to /share, with
 * optional files. A page cannot read a POST, so the service worker takes it:
 * it puts the files in a small cache of their own and sends the app to
 * "/?share_title=…&share_text=…&share_url=…&share_files=N", where
 * client/src/shareIntake.ts picks everything up and empties the cache.
 *
 * Nothing leaves the device here: the files go to the server only when the
 * student saves the note or uploads the document, like any other.
 */
const SHARE_CACHE = "studyos-share";
const MAX_FILES = 10;

async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((f) => typeof f === "object" && f !== null && "arrayBuffer" in f).slice(0, MAX_FILES);

  const cache = await caches.open(SHARE_CACHE);
  for (const old of await cache.keys()) await cache.delete(old); // one share at a time
  await Promise.all(
    files.map((file, i) =>
      cache.put(
        `/__shared/${i}`,
        new Response(file, {
          headers: {
            "content-type": file.type || "application/octet-stream",
            // header values must be ASCII: the name travels percent-encoded
            "x-file-name": encodeURIComponent(file.name || `shared-${i}`),
          },
        }),
      ),
    ),
  );

  const query = new URLSearchParams();
  for (const key of ["share_title", "share_text", "share_url"]) {
    const value = form.get(key);
    if (typeof value === "string" && value) query.set(key, value);
  }
  if (files.length) query.set("share_files", String(files.length));
  return Response.redirect(home() + (query.toString() ? `?${query}` : ""), 303);
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "POST") return;
  if (new URL(event.request.url).pathname !== new URL("share", home()).pathname) return;
  event.respondWith(receiveShare(event.request).catch(() => Response.redirect(home(), 303)));
});
