/**
 * In-app alerts for reminders and timed to-dos.
 *
 * While StudyOS is open (also in a background tab), this checks once a minute
 * for items whose time has just arrived and tells the student: always with an
 * in-app banner, and with a device notification too if they allowed it.
 *
 * Nothing here runs when the app is closed: that is the job of web push —
 * client/src/push.ts, client/public/push-sw.js and server/src/push.ts. Both
 * use the same notification tag, so an item is never shown twice.
 */
import { useEffect, useRef, useState } from "react";
import { getJSON, type ReminderOccurrence } from "./api.ts";
import { formatTime } from "./format.ts";

export type NotifyState = "on" | "off" | "blocked" | "unsupported";

export function notificationState(): NotifyState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "blocked" : "off";
}

export async function askForNotifications(): Promise<NotifyState> {
  if (typeof Notification === "undefined") return "unsupported";
  await Notification.requestPermission();
  return notificationState();
}

/** Current "HH:MM" in Bangkok, the timezone reminder times are stored in. */
export function bangkokTime(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Only alert for items that came due in the last few minutes, not hours ago. */
const WINDOW_MIN = 5;

/** Items that have just come due and have not been alerted yet. */
export function newlyDue(items: ReminderOccurrence[], nowHHMM: string, alerted: Set<string>): ReminderOccurrence[] {
  const now = minutes(nowHHMM);
  return items.filter((o) => {
    if (o.done || o.overdue || !o.time || alerted.has(`${o.id}|${o.on}`)) return false;
    const due = minutes(o.time);
    return due <= now && now - due <= WINDOW_MIN;
  });
}

async function showDeviceNotification(o: ReminderOccurrence) {
  if (notificationState() !== "on") return;
  const options = { body: [o.time && formatTime(o.time), o.course_code, o.note].filter(Boolean).join(" · "), tag: `studyos-${o.id}-${o.on}` };
  try {
    // Android only allows notifications through the service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(o.title, options);
    else new Notification(o.title, options);
  } catch { /* the in-app banner still shows */ }
}

const SEEN_KEY = "studyos.alerted";

/** Returns the banners to show and a way to dismiss one. */
export function useReminderAlerts() {
  const [banners, setBanners] = useState<ReminderOccurrence[]>([]);
  const alerted = useRef<Set<string>>(new Set());

  useEffect(() => {
    try { alerted.current = new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]")); } catch { /* ok */ }

    let stopped = false;
    async function check() {
      try {
        const data = await getJSON<{ todayItems: ReminderOccurrence[] }>("/api/reminders");
        if (stopped) return;
        const due = newlyDue(data.todayItems, bangkokTime(), alerted.current);
        if (due.length === 0) return;
        for (const o of due) {
          alerted.current.add(`${o.id}|${o.on}`);
          showDeviceNotification(o);
        }
        try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...alerted.current])); } catch { /* ok */ }
        setBanners((b) => [...b, ...due]);
      } catch { /* offline or signed out: try again next minute */ }
    }
    check();
    const timer = window.setInterval(check, 60_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  return {
    banners,
    dismiss: (o: ReminderOccurrence) => setBanners((b) => b.filter((x) => !(x.id === o.id && x.on === o.on))),
  };
}
