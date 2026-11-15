/**
 * Who is signed in (owner 2026-11-16: "no indicator of who's logged in"): the signed-in student,
 * shared from the app shell, her picture (Google's, or her initial), and signing out.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import Icon from "./Icon.tsx";
import { postJSON, SIGNED_OUT } from "../api.ts";

export type Account = { id: string; email: string; name: string; avatar_url: string };
export const AccountContext = createContext<Account | null>(null);
export const useAccount = () => useContext(AccountContext);

/** Her Google picture, or the first letter of her name on the accent colour. */
export function Avatar({ account, size = 28 }: { account: Account | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const letter = (account?.name || account?.email || "?").trim().charAt(0).toUpperCase();
  if (account?.avatar_url && !broken) {
    return (
      <img
        src={account.avatar_url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="rounded-full shrink-0 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="rounded-full shrink-0 inline-flex items-center justify-center font-semibold"
      style={{ width: size, height: size, backgroundColor: "var(--accent)", color: "#fff", fontSize: Math.max(12, Math.round(size * 0.45)) }}
    >
      {letter}
    </span>
  );
}

/**
 * Sign out: end the session on the server, then tell the app (it returns to the sign-in page, and
 * what belongs to her on this device, such as calendar busy times, is cleared on SIGNED_OUT).
 */
export async function signOut(): Promise<void> {
  try { await postJSON("/api/auth/logout", {}); } catch { /* the page still signs out */ }
  window.dispatchEvent(new Event(SIGNED_OUT));
}

/**
 * Her picture, at the far right of the header (or the foot of the side menu): opens a small menu
 * with who is signed in, Settings and Sign out (owner 2026-11-16).
 */
export function AccountMenu({ onSettings, up = false, size = 28 }: { onSettings: () => void; /** open upwards (at the foot of the side menu) */ up?: boolean; size?: number }) {
  const { t } = useT();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open]);
  const who = account?.name || account?.email || "";
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("account.menu", { who })}
        title={who}
        className="w-11 h-11 flex items-center justify-center rounded-full"
      >
        <Avatar account={account} size={size} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("account.menu", { who })}
          className={`absolute ${up ? "bottom-full mb-2 left-0" : "top-full mt-2 right-0"} z-50 w-64 rounded-2xl border p-3 animate-slide-up`}
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)", boxShadow: "var(--shadow-lg)" }}
        >
          <div className="flex items-center gap-3 px-1 pb-3 border-b" style={{ borderColor: "var(--border-light)" }}>
            <Avatar account={account} size={36} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{account?.name || account?.email}</p>
              {account?.name && <p className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{account.email}</p>}
            </div>
          </div>
          <button
            onClick={() => { setOpen(false); onSettings(); }}
            className="mt-2 w-full flex items-center gap-3 rounded-xl px-2 min-h-11 text-sm text-left"
            style={{ color: "var(--text-primary)" }}
          >
            <Icon name="settings" size={18} />
            {t("nav.settings")}
          </button>
          <button
            onClick={() => { setOpen(false); void signOut(); }}
            className="w-full flex items-center gap-3 rounded-xl px-2 min-h-11 text-sm text-left"
            style={{ color: "var(--danger)" }}
          >
            <Icon name="arrowLeft" size={18} />
            {t("auth.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
