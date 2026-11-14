import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type ReminderListItem, type ReminderOccurrence } from "../api.ts";
import { AddButton, Card, ErrorBox, Loading } from "../components/ui.tsx";
import Icon from "../components/Icon.tsx";
import { ReminderForm, ReminderRow, setDone, useRemindersChanged } from "../components/Reminders.tsx";
import { notificationState, askForNotifications } from "../reminderAlerts.ts";
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from "../push.ts";
import type { ApiError } from "../api.ts";

type Data = { today: string; items: ReminderListItem[]; todayItems: ReminderOccurrence[] };
type Tab = "today" | "upcoming" | "all" | "done";
const TABS: Tab[] = ["today", "upcoming", "all", "done"];

/** Reminders and to-dos: a familiar list with tabs, soonest first. */
export default function Reminders() {
  const { t } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [notify, setNotify] = useState(notificationState());
  // Notifications when the app is closed (web push), for this device.
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState("");
  useEffect(() => { void pushState().then(setPush); }, []);
  async function changePush(action: () => Promise<PushState>) {
    setPushBusy(true);
    setPushNote("");
    try {
      setPush(await action());
      setNotify(notificationState());
    } catch (e) {
      setPushNote((e as ApiError)?.error ?? t("rem.push.failed"));
    } finally {
      setPushBusy(false);
    }
  }
  async function testPush() {
    setPushBusy(true);
    setPushNote("");
    try {
      const r = await sendTestPush();
      setPushNote(r.sent > 0 ? t("rem.push.testSent", { n: r.sent }) : t("rem.push.testNone"));
    } catch (e) {
      setPushNote((e as ApiError)?.error ?? t("rem.push.failed"));
    } finally {
      setPushBusy(false);
    }
  }

  const load = useCallback(
    () => { setError(false); return getJSON<Data>("/api/reminders").then(setData).catch(() => setError(true)); },
    [],
  );
  useEffect(() => { load(); }, [load]);
  useRemindersChanged(load);

  if (error && !data) return <ErrorBox onRetry={load} />;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;
  const { today, items, todayItems } = data;

  const toggle = (id: number, on: string, done: boolean) => setDone(id, on, !done);
  const saved = () => setEditing(null);

  // The server sends `items` soonest first.
  const open = items.filter((i) => !i.finished);
  const rows =
    tab === "upcoming" ? open.filter((i) => i.next && i.next > today)
    : tab === "all" ? open
    : tab === "done" ? items.filter((i) => i.finished)
    : [];
  const counts: Record<Tab, number> = {
    today: todayItems.filter((o) => !o.done).length,
    upcoming: open.filter((i) => i.next && i.next > today).length,
    all: open.length,
    done: items.filter((i) => i.finished).length,
  };
  const empty = tab === "today" ? todayItems.length === 0 : rows.length === 0;

  const editForm = (id: number) => (
    <li key={`edit-${id}`} className="rounded-xl p-3 my-1" style={{ backgroundColor: "var(--bg-surface-hover)" }}>
      <ReminderForm item={items.find((i) => i.id === id) ?? null} today={today} onSaved={saved} onCancel={() => setEditing(null)} />
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("rem.screen")}</h1>
        <AddButton label={t("cal.add")} expanded={editing === "new"} onClick={() => { setEditing(editing === "new" ? null : "new"); window.scrollTo({ top: 0, behavior: "smooth" }); /* the form opens at the top */ }} />
      </div>

      {editing === "new" && (
        <Card>
          <ReminderForm item={null} today={today} onSaved={saved} onCancel={() => setEditing(null)} />
        </Card>
      )}

      <div role="tablist" aria-label={t("rem.screen")} className="grid grid-cols-4 gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--bg-surface)" }}>
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => { setTab(k); setEditing(null); }}
            className="rounded-lg min-h-11 px-1 text-sm font-medium leading-tight"
            style={{ backgroundColor: tab === k ? "var(--accent)" : "transparent", color: tab === k ? "#fff" : "var(--text-secondary)" }}
          >
            {t(`rem.tab.${k}`)}
            {counts[k] > 0 && <span className="block text-xs font-normal opacity-80">{counts[k]}</span>}
          </button>
        ))}
      </div>

      <Card>
        {empty ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-tertiary)" }}>{t(`rem.empty.${tab}`)}</p>
        ) : (
          <ul className="-mx-2 divide-y divide-[var(--border-light)]">
            {tab === "today"
              ? todayItems.map((o) =>
                  editing === o.id ? editForm(o.id) : (
                    <ReminderRow
                      key={`${o.id}-${o.on}`}
                      item={o} on={o.on} done={o.done} overdue={o.overdue} today={today} hideDate={!o.overdue}
                      onToggle={() => toggle(o.id, o.on, o.done)}
                      onOpen={() => setEditing(o.id)}
                    />
                  ))
              : rows.map((i) => {
                  // The tick acts on the next day the item falls on (its own day if overdue).
                  const on = i.finished ? i.date ?? "" : i.next ?? i.date ?? "";
                  // A repeating item past its last day has nothing left to tick.
                  const ended = i.finished && i.repeat !== "none";
                  return editing === i.id ? editForm(i.id) : (
                    <ReminderRow
                      key={i.id}
                      item={i} on={on} done={i.finished} today={today}
                      overdue={i.overdue}
                      onToggle={ended ? undefined : () => toggle(i.id, on, i.finished)}
                      onOpen={() => setEditing(i.id)}
                    />
                  );
                })}
          </ul>
        )}
      </Card>

      {/* Device notifications */}
      <Card>
        <div className="flex items-start gap-3">
          <Icon name="bell" size={20} style={{ color: "var(--accent-2, var(--accent-text))" }} />
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t(`rem.notify.${notify}`)}</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("rem.notify.limit")}</p>
            {notify === "off" && (
              <button
                onClick={() => askForNotifications().then(setNotify)}
                className="rounded-xl px-4 min-h-11 text-sm font-semibold"
                style={{ backgroundColor: "var(--accent)", color: "#fff" }}
              >
                {t("rem.notify.turnOn")}
              </button>
            )}

            {/* When StudyOS is closed: a push from the server, per device */}
            {push && notify !== "blocked" && (
              <div className="pt-2 mt-1 border-t space-y-2" style={{ borderColor: "var(--border-light)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t(`rem.push.${push}`)}</p>
                {push === "off" && (
                  <button
                    onClick={() => changePush(enablePush)}
                    disabled={pushBusy}
                    className="rounded-xl px-4 min-h-11 text-sm font-semibold disabled:opacity-40"
                    style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                  >
                    {/* The first time, the browser can take half a minute to register with its push service. */}
                    {t(pushBusy ? "rem.push.working" : "rem.push.turnOn")}
                  </button>
                )}
                {push === "on" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={testPush}
                      disabled={pushBusy}
                      className="rounded-xl border px-4 min-h-11 text-sm font-semibold disabled:opacity-40"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      {t("rem.push.test")}
                    </button>
                    <button
                      onClick={() => changePush(disablePush)}
                      disabled={pushBusy}
                      className="px-3 min-h-11 text-sm disabled:opacity-40"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {t("rem.push.turnOff")}
                    </button>
                  </div>
                )}
                {pushNote && <p role="status" className="text-xs" style={{ color: "var(--text-secondary)" }}>{pushNote}</p>}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
