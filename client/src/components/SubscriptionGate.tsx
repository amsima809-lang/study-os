import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from "react";
import { getJSON, postJSON, type ApiError } from "../api.ts";
import { useT } from "../i18n.tsx";
import Icon from "./Icon.tsx";

type SubState = { isPremium: boolean; plan: string; expiresAt: string | null; loading: boolean };

const SubContext = createContext<SubState & { refresh: () => void; showPaywall: () => void }>({
  isPremium: false,
  plan: "free",
  expiresAt: null,
  loading: true,
  refresh: () => {},
  showPaywall: () => {},
});

export function useSubscription() {
  return useContext(SubContext);
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubState>({ isPremium: false, plan: "free", expiresAt: null, loading: true });
  const [showModal, setShowModal] = useState(false);

  const refresh = useCallback(() => {
    getJSON<{ plan: string; subscription: { expires_at: string } | null; isPremium: boolean }>("/api/subscription")
      .then((d) =>
        setState({ isPremium: d.isPremium, plan: d.plan, expiresAt: d.subscription?.expires_at ?? null, loading: false }),
      )
      .catch(() => setState((s) => ({ ...s, loading: false })));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SubContext.Provider value={{ ...state, refresh, showPaywall: () => setShowModal(true) }}>
      {children}
      {showModal && <PaywallModal onClose={() => setShowModal(false)} onActivated={refresh} />}
    </SubContext.Provider>
  );
}

function PaywallModal({ onClose, onActivated }: { onClose: () => void; onActivated: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  async function activate() {
    setBusy(true);
    try {
      await postJSON("/api/subscription/activate", {});
      onActivated();
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-7 animate-slide-up relative"
        style={{
          backgroundColor: "var(--bg-surface)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border-light)",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg"
          style={{ color: "var(--text-tertiary)" }}
        >
          <Icon name="x" size={20} />
        </button>

        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)",
            }}
          >
            <Icon name="sparkles" size={28} style={{ color: "#fff" }} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            {t("sub.title")}
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {t("sub.desc")}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {(["summary", "quiz", "exam", "chapters"] as const).map((f) => (
            <div key={f} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--success-bg)" }}
              >
                <Icon name="check" size={16} style={{ color: "var(--success)" }} />
              </div>
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                {t(`sub.features.${f}`)}
              </span>
            </div>
          ))}
        </div>

        <div className="text-center mb-5">
          <span className="text-3xl font-extrabold" style={{ color: "var(--accent-text)" }}>
            {t("sub.price")}
          </span>
        </div>

        <button
          onClick={activate}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl font-semibold text-white disabled:opacity-50 transition-all active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)",
            boxShadow: "0 4px 16px rgba(91,79,199,0.3)",
          }}
        >
          {busy ? t("sub.activating") : t("sub.activate")}
        </button>
      </div>
    </div>
  );
}

export function handleSubscriptionError(err: ApiError, showPaywall: () => void): boolean {
  if (err.code === "SUBSCRIPTION_REQUIRED") {
    showPaywall();
    return true;
  }
  return false;
}
