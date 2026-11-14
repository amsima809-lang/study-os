import { useEffect, useRef, useState } from "react";
import { LanguageProvider, LanguageToggle, useT } from "./i18n.tsx";
import { getJSON } from "./api.ts";
import { ThemeProvider, ThemeToggle } from "./components/ui.tsx";
import { SubscriptionProvider } from "./components/SubscriptionGate.tsx";
import Icon from "./components/Icon.tsx";
import Login from "./screens/Login.tsx";
import Onboarding from "./screens/Onboarding.tsx";
import More from "./screens/More.tsx";
import { destination, useNav, type DestId } from "./destinations.tsx";

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

function Shell() {
  const { t } = useT();
  const { nav, canPin, pin, unpin, replace } = useNav();
  const [tab, setTab] = useState<Tab>(nav[0] ?? "more");
  const [holding, setHolding] = useState<DestId | null>(null);
  const press = useLongPress(setHolding);

  const tabIds: Tab[] = [...nav, "more"];
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

  return (
    <div className="min-h-dvh flex flex-col md:flex-row" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Sidebar — md+ */}
      <aside
        className="hidden md:flex flex-col w-56 fixed inset-y-0 left-0 z-20 border-r"
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
        <nav className="flex-1 px-3 space-y-1">
          {tabIds.map((id) => (
            <button
              key={id}
              onClick={() => go(id)}
              {...(id === "more" ? {} : press.handlers(id))}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                ...noCallout,
                backgroundColor: tab === id ? "var(--accent-light)" : "transparent",
                color: tab === id ? "var(--accent-text)" : "var(--text-secondary)",
                boxShadow: tab === id ? "inset 3px 0 0 var(--accent-2, var(--accent))" : "none",
              }}
            >
              <Icon name={icon(id)} size={20} />
              {label(id)}
            </button>
          ))}
        </nav>
        <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: "var(--border-light)" }}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col md:ml-56">
        {/* Top bar — mobile */}
        <header
          className="sticky top-0 z-10 md:hidden backdrop-blur-md border-b"
          style={{
            backgroundColor: "color-mix(in srgb, var(--bg-surface) 85%, transparent)",
            borderColor: "var(--border-light)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <div style={{ height: 4, background: "var(--brand-bar, transparent)" }} />
          <div className="max-w-3xl mx-auto flex justify-between items-center px-5 py-3">
            <div className="flex items-center gap-2">
              <Icon name="book" size={20} style={{ color: "var(--accent-2, var(--accent-text))" }} />
              <span className="font-bold" style={{ color: "var(--accent-text)" }}>{t("app.name")}</span>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <LanguageToggle />
            </div>
          </div>
        </header>

        {/* Screen content */}
        <main className="flex-1 px-5 py-5 max-w-3xl w-full mx-auto pb-24 md:pb-5">
          <div className="animate-fade-in">
            {Screen ? <Screen key={tab} /> : <More nav={nav} canPin={canPin} onPin={pin} onReplace={replace} />}
          </div>
        </main>

        {/* Bottom nav — mobile */}
        <nav
          className="fixed bottom-0 inset-x-0 border-t flex justify-around max-w-3xl mx-auto z-10 md:hidden backdrop-blur-md"
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
              className="relative flex-1 min-w-0 flex flex-col items-center py-2 text-xs gap-0.5 min-h-12 justify-center font-medium transition-colors"
              style={{
                ...noCallout,
                color: tab === id ? "var(--accent-text)" : "var(--text-tertiary)",
              }}
            >
              <Icon name={icon(id)} size={20} />
              {/* Taller line box: truncate clips Thai tone marks stacked above a vowel (นี้) at the default height. */}
              <span className="max-w-full truncate px-0.5 leading-[1.6]">{label(id)}</span>
              {tab === id && (
                <span
                  className="absolute top-0 w-8 h-1 rounded-full"
                  style={{ backgroundColor: "var(--accent-2, var(--accent))" }}
                />
              )}
            </button>
          ))}
        </nav>
      </div>

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
              className="w-full font-semibold rounded-xl py-3 transition-all active:scale-[0.98]"
              style={{ backgroundColor: "var(--accent)", color: "#fff" }}
            >
              {t("nav.move_to_more")}
            </button>
            <button
              onClick={() => setHolding(null)}
              className="w-full text-sm py-2"
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
      setUser(u ?? null);
    });

  useEffect(() => {
    refreshUser().catch(() => setUser(null));
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
