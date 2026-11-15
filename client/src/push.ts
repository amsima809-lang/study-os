/**
 * Turning closed-app notifications on and off for THIS device.
 * The other halves: client/public/push-sw.js (shows them) and
 * server/src/push.ts (sends them).
 */
import { getJSON, postJSON } from "./api.ts";
import { getClock } from "./format.ts";
import { inNativeApp } from "./native.ts";

/**
 * - "on" / "off": this device can receive pushes, and is / is not subscribed;
 * - "needs-install": the browser has no push here yet — on iPhone and iPad it
 *   only works once StudyOS is added to the Home Screen;
 * - "native-app": inside the iOS app, whose web view has no push; it needs Apple's own
 *   notification service, which is not built yet;
 * - "no-worker": the service worker is not running (the dev server);
 * - "unsupported": this browser cannot do it at all.
 */
export type PushState = "on" | "off" | "needs-install" | "native-app" | "no-worker" | "unsupported";

const lang = (): "th" | "en" => {
  try { return localStorage.getItem("studyos.lang") === "en" ? "en" : "th"; } catch { return "th"; }
};

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (inNativeApp()) return "native-app";
  if (!("serviceWorker" in navigator) || typeof Notification === "undefined") return "unsupported";
  if (!("PushManager" in window)) {
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return apple ? "needs-install" : "unsupported";
  }
  const reg = await registration();
  if (!reg) return "no-worker";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

/** The server's key, in the form `subscribe` wants. */
function keyBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Tell the server about this device's subscription, with the language and time format to use. */
async function register(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await postJSON("/api/push/subscribe", { endpoint: sub.endpoint, keys: json.keys, lang: lang(), clock: getClock() });
}

/** Ask permission if needed, subscribe this device, and register it with the server. */
export async function enablePush(): Promise<PushState> {
  const reg = await registration();
  if (!reg || !("PushManager" in window)) return pushState();
  if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") return "off";
  const { publicKey } = await getJSON<{ publicKey: string }>("/api/push/key");
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
  await register(sub);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await postJSON("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return pushState();
}

/**
 * Called when the app opens: if this device is subscribed, make sure the
 * server still has it, under the account now signed in, with today's language
 * and time format.
 */
export async function syncPush(): Promise<void> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) await register(sub);
  } catch { /* offline or blocked: try again next time the app opens */ }
}

/** Ask the server to push a test notification to this student's devices. */
export function sendTestPush(): Promise<{ sent: number; devices: number }> {
  return postJSON<{ sent: number; devices: number }>("/api/push/test", {});
}
