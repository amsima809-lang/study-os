import { useEffect, useRef, useState } from "react";
import { LanguageProvider, LanguageToggle, useT } from "./i18n.tsx";
import { getJSON, SIGNED_OUT } from "./api.ts";
import { setDraftOwner } from "./noteDraft.ts";
import { ConfirmDialog, LayoutContext, ThemeProvider, ThemeToggle, useOnline, type Layout } from "./components/ui.tsx";
import { unsavedReason } from "./unsaved.ts";
import { addSharedToDraft, requestNoteForm, takeShared } from "./shareIntake.ts";
import { SubscriptionProvider } from "./components/SubscriptionGate.tsx";
import Icon from "./components/Icon.tsx";
import Login from "./screens/Login.tsx";
import Onboarding from "./screens/Onboarding.tsx";
import More from "./screens/More.tsx";
import { DESTINATIONS, destination, useNav, NAVIGATE_EVENT, type DestId } from "./destinations.tsx";
import { useReminderAlerts } from "./reminderAlerts.ts";
import { setDone } from "./components/Reminders.tsx";
import { CourseChip } from "./components/CourseTitle.tsx";
import { formatTime } from "./format.ts";

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
const SIDEBAR_QUERY = "(min-width: 1024px) and (min-height: 500px)";
const RAIL_QUERY = "(min-width: 768px), (min-width: 560px) and (max-height: 500px)";
// Kept at module level so the media-query objects (and their listeners) live as
// long as the page does.
const layoutQueries = [window.matchMedia(SIDEBAR_QUERY), window.matchMedia(RAIL_QUERY)];
const readLayout = (): Layout => (layoutQueries[0].matches ? "sidebar" : layoutQueries[1].matches ? "rail" : "phone");
function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(readLayout);
  useEffect(() => {
    const onChange = () => setLayout(readLayout());
    layoutQueries.forEach((q) => q.addEventListener("change", onChange));
    // Belt and braces: resizing or turning the device always re-checks.
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    onChange();
    return () => {
      layoutQueries.forEach((q) => q.removeEventListener("change", onChange));
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);
  return layout;
}

/**
 * Pull down from the top of a screen to load it again. Only a touch that starts
 * with the page at the very top, moves mostly downwards, and is not inside
 * something with its own scrolling or drawing (a sheet, the hour grid, the
 * drawing pad, a text field) counts. Returns how far the page is pulled (0–1+)
 * and whether a refresh has just been asked for, for the indicator.
 */
const PULL_AT = 64;
function usePullToRefresh(onRefresh: () => void) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  useEffect(() => {
    let from: { x: number; y: number } | null = null;
    let pulled = 0;
    const blocked = (target: EventTarget | null) => {
      for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
        if (el.matches("canvas, input, textarea, select, [role=dialog], [role=alertdialog], .timegrid-scroll")) return true;
        if (el.scrollTop > 0) return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      from = e.touches.length === 1 && window.scrollY <= 0 && !blocked(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      pulled = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!from) return;
      const dy = e.touches[0].clientY - from.y;
      const dx = e.touches[0].clientX - from.x;
      if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) { from = dy <= 0 ? from : null; pulled = 0; setPull(0); return; }
      pulled = Math.min(110, dy * 0.5); // the page resists: half the finger's travel
      setPull(pulled);
    };
    const onEnd = () => {
      if (from && pulled >= PULL_AT) {
        setRefreshing(true);
        refresh.current();
        window.setTimeout(() => setRefreshing(false), 700);
      }
      from = null;
      pulled = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);
  return { pull, refreshing };
}

function Shell() {
  const { t } = useT();
  const { nav, canPin, pin, unpin, replace } = useNav();
  const [tab, setTab] = useState<Tab>(nav[0] ?? "more");
  const [holding, setHolding] = useState<DestId | null>(null);
  const press = useLongPress(setHolding);

  const alerts = useReminderAlerts();
  const layout = useLayout();
  const online = useOnline();

  // Screens can ask to open another screen (see navigateTo in destinations.tsx).
  useEffect(() => {
    const onNavigate = (e: Event) => open((e as CustomEvent<DestId>).detail);
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

  // Something was shared into StudyOS from another app: start a note with it.
  useEffect(() => {
    const shared = takeShared();
    if (!shared) return;
    void addSharedToDraft(shared).then(() => {
      requestNoteForm();
      setTab("notes");
      setReloads((n) => n + 1); // if Notes is already open, show the form now
    });
  }, []);

  // Pull down to reload the screen's data. Not while leaving would lose work.
  const [reloads, setReloads] = useState(0);
  const puller = usePullToRefresh(() => { if (!unsavedReason()) setReloads((n) => n + 1); });

  // Leaving a screen that holds work which cannot be kept: ask first.
  const [leaving, setLeaving] = useState<{ to: Tab; reason: string } | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  function open(id: Tab) {
    const reason = id === tabRef.current ? null : unsavedReason();
    if (reason) setLeaving({ to: id, reason });
    else setTab(id);
  }
  // The same question when the page itself is being closed or reloaded.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!unsavedReason()) return;
      e.preventDefault();
      e.returnValue = ""; // older browsers need this to show their prompt
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function go(id: Tab) {
    if (press.fired.current) {
      press.fired.current = false; // this click ended a long press
      return;
    }
    open(id);
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

        {/* No connection: say so once, here, instead of every save failing without a reason. */}
        {!online && (
          <div
            role="status"
            className="sticky z-10 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-center"
            style={{ top: layout === "phone" ? "calc(3.75rem + env(safe-area-inset-top))" : 0, backgroundColor: "var(--warning)", color: "#1f1300" }}
          >
            <Icon name="wifiOff" size={16} className="shrink-0" />
            {t("status.offlineBanner")}
          </div>
        )}

        {/* Screen content. Wide screens get more room; reading and form screens keep a reading width. */}
        <main
          className={`flex-1 px-5 py-5 w-full mx-auto ${layout === "phone" ? "pb-36" : ""} ${
            layout === "sidebar" && !(tab !== "more" && destination(tab).narrow) ? "max-w-6xl" : "max-w-3xl"
          }`}
          style={{ paddingRight: "max(1.25rem, env(safe-area-inset-right))" }}
        >
          <LayoutContext.Provider value={layout}>
            <div className="animate-fade-in">
              {Screen ? <Screen key={`${tab}:${reloads}`} /> : <More nav={nav} canPin={canPin} onPin={pin} onReplace={replace} />}
            </div>
          </LayoutContext.Provider>
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

      {/* Pull-to-refresh indicator: follows the finger, turns solid when letting go will reload */}
      {(puller.pull > 0 || puller.refreshing) && (
        <div className="fixed inset-x-0 z-30 flex justify-center pointer-events-none" style={{ top: "calc(0.5rem + env(safe-area-inset-top))" }}>
          <div
            role="status"
            aria-label={t("status.refreshing")}
            className={`w-10 h-10 rounded-full border flex items-center justify-center ${puller.refreshing ? "animate-spin" : ""}`}
            style={{
              transform: puller.refreshing ? undefined : `translateY(${puller.pull}px) rotate(${puller.pull * 3}deg)`,
              marginTop: puller.refreshing ? PULL_AT : 0,
              backgroundColor: puller.pull >= PULL_AT || puller.refreshing ? "var(--accent)" : "var(--bg-surface)",
              borderColor: "var(--border)",
              color: puller.pull >= PULL_AT || puller.refreshing ? "#fff" : "var(--text-secondary)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <Icon name="refresh" size={18} />
          </div>
        </div>
      )}

      {leaving && (
        <ConfirmDialog
          title={t("leave.title")}
          message={t(leaving.reason)}
          confirmLabel={t("leave.go")}
          cancelLabel={t("leave.stay")}
          onConfirm={() => { setTab(leaving.to); setLeaving(null); }}
          onCancel={() => setLeaving(null)}
        />
      )}

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
                  {o.time && formatTime(o.time)}
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

/**
 * The on-screen keyboard. Where the keyboard covers the page instead of
 * shrinking it (iPhone, iPad), sheets pinned to the bottom would have their
 * fields and Save button hidden behind it. This measures the covered strip and
 * publishes it as the CSS variable --keyboard-inset (plus the class
 * "keyboard-open" on <html>); index.css lifts sheets and dialogs by that much.
 * It also brings the field being typed in back into view.
 */
function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const open = covered > 80; // smaller differences are toolbars, not a keyboard
      root.style.setProperty("--keyboard-inset", open ? `${Math.round(covered)}px` : "0px");
      root.classList.toggle("keyboard-open", open);
      const field = document.activeElement;
      if (open && field instanceof HTMLElement && field.matches("input, textarea, select")) {
        field.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    vv.addEventListener("resize", update);
    update();
    return () => vv.removeEventListener("resize", update);
  }, []);
}

function AuthGate() {
  useKeyboardInset();
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
