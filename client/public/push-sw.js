/*
 * Loaded into the service worker (see `importScripts` in vite.config.ts).
 *
 * Notifications when StudyOS is closed. The server sends an EMPTY push when a
 * reminder, timed to-do or event comes due (server/src/push.ts). That wakes
 * this code, which asks the server what is due — using the student's own
 * sign-in on this device — and shows it. Nothing about the reminder passes
 * through the push service.
 *
 * A push must always end in a visible notification (browsers require it), so
 * when the details cannot be fetched a plain "something is due" is shown.
 */
// The product's name. This file cannot import client/src/brand.ts, so the name is
// repeated here; scripts/rename-app.mjs changes both together.
const APP_NAME = "Termtrail"; // @app-name
const APP_NAME_TH = "Termtrail"; // @app-name-th

const WORDS = {
  th: { due: "มีรายการถึงเวลาแล้ว เปิด " + APP_NAME_TH + " เพื่อดู", test: "การแจ้งเตือนทำงานแล้ว", signIn: "เข้าสู่ระบบ " + APP_NAME_TH + " เพื่อรับการแจ้งเตือนต่อ" },
  en: { due: "Something is due. Open " + APP_NAME + " to see it.", test: "Notifications are working.", signIn: "Sign in to " + APP_NAME + " to keep getting notifications." },
};
const ICON = "/pwa-192x192.png";

async function showWhatIsDue() {
  const show = (title, body, tag) => self.registration.showNotification(title, { body, tag, icon: ICON, badge: ICON, data: { url: "/" } });
  const subscription = await self.registration.pushManager.getSubscription().catch(() => null);

  let answer = null;
  let signedOut = false;
  try {
    const response = await fetch("/api/push/pending", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: subscription ? subscription.endpoint : "" }),
    });
    if (response.ok) answer = await response.json();
    else if (response.status === 401) signedOut = true;
  } catch (e) { /* offline: fall through to the plain notification */ }

  if (signedOut) {
    // Nobody is signed in here any more: stop the pushes for this device.
    if (subscription) await subscription.unsubscribe().catch(() => {});
    return show(APP_NAME, WORDS.th.signIn + " · " + WORDS.en.signIn, "studyos-signin");
  }

  const words = WORDS[answer && answer.lang === "en" ? "en" : "th"];
  const items = (answer && answer.items) || [];
  const shown = [];
  if (answer && answer.test) shown.push(show(APP_NAME, words.test, "studyos-test"));
  // The tag matches the in-app alert's, so an open app and a push never show the same item twice.
  for (const item of items) shown.push(show(item.title, item.body, "studyos-" + item.id + "-" + item.on));
  if (shown.length === 0) shown.push(show(APP_NAME, words.due, "studyos-due"));
  return Promise.all(shown);
}

self.addEventListener("push", (event) => {
  event.waitUntil(showWhatIsDue());
});

// Tapping a notification brings StudyOS forward, or opens it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })(),
  );
});
