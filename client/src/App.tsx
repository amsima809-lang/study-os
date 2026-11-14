import { useEffect, useRef, useState } from "react";
import { LanguageProvider, LanguageToggle, useT } from "./i18n.tsx";
import { getJSON, SIGNED_OUT } from "./api.ts";
import { setDraftOwner } from "./noteDraft.ts";
import { ThemeProvider, ThemeToggle } from "./components/ui.tsx";
import { SubscriptionProvider } from "./components/SubscriptionGate.tsx";
import Icon from "./components/Icon.tsx";
import Login from "./screens/Login.tsx";
import Onboarding from "./screens/Onboarding.tsx";
import More from "./screens/More.tsx";
import { DESTINATIONS, destination, useNav, NAVIGATE_EVENT, type DestId } from "./destinations.tsx";
import { useReminderAlerts } from "./reminderAlerts.ts";
import { setDone } from "./components/Reminders.tsx";
import { CourseChip } from "./components/CourseTitle.tsx";

type Tab = DestId | "more";

/**
 * Press-and-hold (or right-click) handlers for a nav item. `fired` tells the
 * click handler that the press was a long one, so it does not also navigate.
 */
function useLongPress(onLongPress: (id: DestId) => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  return {
    fired,
    handlers: (id: DestId) => ({
      onPointerDown: () => {
        fired.current = false;
        cancel();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          onLongPress(id);
        }, 550);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        cancel();
        fired.current = true;
        onLongPress(id);
      },
    }),
  };
}

/**
 * Which frame the app wears. Chosen by HEIGHT as well as width, so a phone on
 * its side does not get a wide sidebar on a 375px-tall screen:
 * - "sidebar": at least 1024 wide and 500 tall — full sidebar with every screen;
 * - "rail":    tablets upright, and any short landscape screen — slim icon rail;
 * - "phone":   everything else — top bar and bottom tabs.
 */
type Layout = "phone" | "rail" | "sidebar";
const SIDEBAR_QUERY = "(min-width: 1024px) and (min-height: 500px)";
const RAIL_QUERY = "(min-width: 768px), (min-width: 560px) and (max-height: 500px)";
function useLayout(): Layout {
  const read = (): Layout =>
    window.matchMedia(SIDEBAR_QUERY).matches ? "sidebar" : window.matchMedia(RAIL_QUERY).matches ? "rail" : "phone";
  const [layout, setLayout] = useState<Layout>(read);
  useEffect(() => {
    const queries = [window.matchMedia(SIDEBAR_QUERY), window.matchMedia(RAIL_QUERY)];
    const onChange = () => setLayout(read());
    queries.forEach((q) => q.addEventListener("change", onChange));
    return () => queries.forEach((q) => q.removeEventListener("change", onChange));
  }, []);
  return layout;
}

function Shell() {
  const { t } = useT();
  const { nav, canPin, pin, unpin, replace } = useNav();
  const [tab, setTab] = useState<Tab>(nav[0] ?? "more");
  const [holding, setHolding] = useState<DestId | null>(null);
  const press = useLongPress(setHolding);

  const alerts = useReminderAlerts();
  const layout = useLayout();

  // Screens can ask to open another screen (see navigateTo in destinations.tsx).
  useEffect(() => {
    const onNavigate = (e: Event) => setTab((e as CustomEvent<DestId>).detail);
    window.addEventListener(NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(NAVIGATE_EVENT, onNavigate);
  }, []);

  const tabIds: Tab[] = [...nav, "more"];
  // The sidebar also lists the screens that are not in the student's own menu.
  const others = DESTINATIONS.map((d) => d.id).filter((id) => !nav.includes(id));
  // A screen opened from More, or by a link, is not in the nav: light up "More".
  const activeTab: Tab = tab === "more" || nav.includes(tab) ? tab : "more";
  // The sidebar shows every screen, so it can light up the real one.
  const shown: Tab = layout === "sidebar" ? tab : activeTab;
  const icon = (id: Tab) => (id === "more" ? "moreHorizontal" : destination(id).icon);
  const label = (id: Tab) => t(id === "more" ? "nav.more" : destination(id).navLabel);
  const Screen = tab === "more" ? null : destination(tab).Screen;

  function go(id: Tab) {
    if (press.fired.current) {
      press.fired.current = false; // this click ended a long press
      return;
    }
    setTab(id);
  }

  function moveToMore(id: DestId) {
    unpin(id);
    if (tab === id) setTab("more");
    setHolding(null);
  }

  // No text selection or iOS link preview while holding a nav item.
  const noCallout = { WebkitTouchCallout: "none", userSelect: "none" } as React.CSSProperties;

  // One nav item, drawn three ways: a row in the sidebar, an icon in the rail, a tab at the bottom.
  const sideItem = (id: Tab, pinned: boolean) => (
    <button
      key={id}
      onClick={() => go(id)}
      {...(pinned && id !== "more" ? press.handlers(id) : {})}
      aria-current={shown === id ? "page" : undefined}
      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-xl text-sm font-medium transition-all min-h-11 text-left"
      style={{
        ...noCallout,
        backgroundColor: shown === id ? "var(--accent-light)" : "transparent",
        color: shown === id ? "var(--accent-text)" : "var(--text-secondary)",
        boxShadow: shown === id ? "inset 3px 0 0 var(--accent-2, var(--accent))" : "none",
      }}
    >
      <Icon name={icon(id)} size={20} className="shrink-0" />
      <span className="min-w-0 leading-snug">{t(id === "more" ? "nav.more" : pinned ? destination(id).navLabel : destination(id).label)}</span>
    </button>
  );

  return (
    <div data-layout={layout} className="min-h-dvh flex flex-col" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Wide and tall enough: a sidebar that lists every screen. */}
      {layout === "sidebar" && (
        <aside
          className="flex flex-col w-60 fixed inset-y-0 left-0 z-20 border-r"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-light)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          {/* Two-colour stripe of the chosen palette or school (absent otherwise) */}
          <div style={{ height: 4, background: "var(--brand-bar, transparent)" }} />
          <div className="px-5 py-4 flex items-center gap-2">
            <Icon name="book" size={22} style={{ color: "var(--accent-2, var(--accent-text))" }} />
            <span className="font-bold text-lg" style={{ color: "var(--accent-text)" }}>
              {t("app.name")}
            </span>
          </div>
          <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-1">
            {nav.map((id) => sideItem(id, true))}
            {others.length > 0 && (
              <p className="px-3 pt-4 pb-1 text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>
                {t("nav.otherScreens")}
              </p>
            )}
            {others.map((id) => sideItem(id, false))}
            <div className="pt-2 mt-2 border-t" style={{ borderColor: "var(--border-light)" }}>
              {sideItem("more", true)}
            </div>
          </nav>
          <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: "var(--border-light)" }}>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </aside>
      )}

      {/* A phone on its side, or a tablet upright: a slim rail of icons, so the
          content keeps the width (and, on a short screen, the height). */}
      {layout === "rail" && (
        <aside
          className="flex flex-col fixed inset-y-0 left-0 z-20 border-r"
          style={{
            width: "calc(4.5rem + env(safe-area-inset-left))",
            paddingLeft: "env(safe-area-inset-left)",
            paddingTop: "env(safe-area-inset-top)",
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-light)",
          }}
        >
          <div style={{ height: 4, background: "var(--brand-bar, transparent)" }} />
          <nav className="flex-1 min-h-0 overflow-y-auto py-1 flex flex-col items-stretch">
            {tabIds.map((id) => (
              <button
                key={id}
                onClick={() => go(id)}
                {...(id === "more" ? {} : press.handlers(id))}
                aria-current={activeTab === id ? "page" : undefined}
                className="relative shrink-0 flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-xs font-medium transition-colors"
                style={{ ...noCallout, color: activeTab === id ? "var(--accent-text)" : "var(--text-tertiary)" }}
              >
                {activeTab === id && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ backgroundColor: "var(--accent-2, var(--accent))" }} />
                )}
                <Icon name={icon(id)} size={22} />
                <span className="max-w-full truncate leading-[1.6]">{label(id)}</span>
              </button>
            ))}
            <div className="mt-auto pt-1 flex flex-col items-center">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </nav>
        </aside>
      )}

      {/* Main area */}
      <div
        className="flex-1 flex flex-col"
        style={{ marginLeft: layout === "sidebar" ? "15rem" : layout === "rail" ? "calc(4.5rem + env(safe-area-inset-left))" : 0 }}
      >
        {/* Top bar — phone */}
        {layout === "phone" && (
          <header
            className="sticky top-0 z-10 backdrop-blur-md border-b"
            style={{
              backgroundColor: "color-mix(in srgb, var(--bg-surface) 85%, transparent)",
              borderColor: "var(--border-light)",
              paddingTop: "env(safe-area-inset-top)",
            }}
          >
            <div style={{ height: 4, background: "var(--brand-bar, transparent)" }} />
            <div className="max-w-3xl mx-auto flex justify-between items-center pl-5 pr-3 py-1.5">
              <div className="flex items-center gap-2">
                <Icon name="book" size={20} style={{ color: "var(--accent-2, var(--accent-text))" }} />
                <span className="font-bold" style={{ color: "var(--accent-text)" }}>{t("app.name")}</span>
              </div>
              <div className="flex items-center">
                <ThemeToggle />
                <LanguageToggle />
              </div>
            </div>
          </header>
        )}

        {/* Screen content. Wide screens get more room; reading and form screens keep a reading width. */}
        <main
          className={`flex-1 px-5 py-5 w-full mx-auto ${layout === "phone" ? "pb-24" : ""} ${
            layout === "sidebar" && !(tab !== "more" && destination(tab).narrow) ? "max-w-6xl" : "max-w-3xl"
          }`}
          style={{ paddingRight: "max(1.25rem, env(safe-area-inset-right))" }}
        >
          <div className="animate-fade-in">
            {Screen ? <Screen key={tab} /> : <More nav={nav} canPin={canPin} onPin={pin} onReplace={replace} />}
          </div>
        </main>

        {/* Bottom nav — phone */}
        {layout === "phone" && (
          <nav
            className="fixed bottom-0 inset-x-0 border-t flex justify-around max-w-3xl mx-auto z-10 backdrop-blur-md"
            style={{
              backgroundColor: "color-mix(in srgb, var(--bg-surface) 90%, transparent)",
              borderColor: "var(--border-light)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {tabIds.map((id) => (
              <button
                key={id}
                onClick={() => go(id)}
                {...(id === "more" ? {} : press.handlers(id))}
                aria-current={activeTab === id ? "page" : undefined}
                className="relative flex-1 min-w-0 flex flex-col items-center py-2 text-xs gap-0.5 min-h-12 justify-center font-medium transition-colors"
                style={{
                  ...noCallout,
                  color: activeTab === id ? "var(--accent-text)" : "var(--text-tertiary)",
                }}
              >
                <Icon name={icon(id)} size={20} />
                {/* Taller line box: truncate clips Thai tone marks stacked above a vowel (นี้) at the default height. */}
                <span className="max-w-full truncate px-0.5 leading-[1.6]">{label(id)}</span>
                {activeTab === id && (
                  <span
                    className="absolute top-0 w-8 h-1 rounded-full"
                    style={{ backgroundColor: "var(--accent-2, var(--accent))" }}
                  />
                )}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* A reminder or timed to-do has just come due */}
      {alerts.banners.length > 0 && (
        <div
          className="fixed inset-x-0 z-40 px-3 space-y-2 pointer-events-none"
          style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        >
          {alerts.banners.map((o) => (
            <div
              key={`${o.id}-${o.on}`}
              role="alert"
              className="pointer-events-auto mx-auto max-w-md rounded-2xl border p-3 flex items-start gap-3 animate-slide-up"
              style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--accent-text)", boxShadow: "var(--shadow-lg)" }}
            >
              <Icon name="bell" size={20} style={{ color: "var(--accent-2, var(--accent-text))", marginTop: 2 }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{o.title}</p>
                <p className="text-xs flex flex-wrap items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                  {o.time}
                  {o.course_code && <CourseChip code={o.course_code} />}
                </p>
                <div className="flex gap-2 mt-2">
                  {o.kind !== "event" && <button
                    onClick={() => { setDone(o.id, o.on, true); alerts.dismiss(o); }}
                    className="rounded-lg px-3 min-h-11 text-sm font-semibold"
                    style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                  >
                    {t("rem.markDone")}
                  </button>}
                  <button onClick={() => alerts.dismiss(o)} className="px-3 min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
                    {t("uni.close")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Press-and-hold on a nav item: offer to move it back to More */}
      {holding && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setHolding(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t(destination(holding).label)}
            onClick={(e) => e.stopPropagation()}
            className="w-full md:max-w-sm rounded-t-3xl md:rounded-3xl border p-5 space-y-3 animate-slide-up"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-light)",
              paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
            }}
          >
            <div className="flex items-center gap-3" style={{ color: "var(--text-primary)" }}>
              <Icon name={destination(holding).icon} size={22} style={{ color: "var(--accent-text)" }} />
              <span className="font-semibold">{t(destination(holding).label)}</span>
            </div>
            <button
              onClick={() => moveToMore(holding)}
              className="w-full font-semibold rounded-xl py-3 transition-all active:scale-[0.98] min-h-11"
              style={{ backgroundColor: "var(--accent)", color: "#fff" }}
            >
              {t("nav.move_to_more")}
            </button>
            <button
              onClick={() => setHolding(null)}
              className="w-full text-sm py-2 min-h-11"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("nav.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type User = { id: string; email: string; name: string; avatar_url: string; plan: string; onboarded: number; university_id: string | null };

function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refreshUser = () =>
    getJSON<User | null>("/api/auth/me").then((u) => {
      // Keep this browser's login theme in step with the account's university.
      if (u?.university_id) {
        try { localStorage.setItem("studyos.university", u.university_id); } catch { /* ok */ }
      }
      if (u) setDraftOwner(u.id); // note drafts are kept per student
      setUser(u ?? null);
    });

  useEffect(() => {
    refreshUser().catch(() => setUser(null));
    // The session ended (expired, or signed out elsewhere): go back to login.
    // Unsaved note drafts are kept in the browser and offered again after sign-in.
    const onSignedOut = () => setUser(null);
    window.addEventListener(SIGNED_OUT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT, onSignedOut);
  }, []);

  if (user === undefined) return <div className="min-h-dvh" style={{ backgroundColor: "var(--bg-base)" }} />;
  if (!user) return <Login onAuthed={refreshUser} />;
  if (!user.onboarded) return <Onboarding onDone={refreshUser} />;
  return (
    <SubscriptionProvider>
      <Shell />
    </SubscriptionProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthGate />
      </LanguageProvider>
    </ThemeProvider>
  );
}
