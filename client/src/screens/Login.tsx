import { useState } from "react";
import { useT, LanguageToggle } from "../i18n.tsx";
import { postJSON, type ApiError } from "../api.ts";

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const { t } = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setBusy(true);
    try {
      await postJSON("/api/login", { password });
      onAuthed();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center px-6">
      <div
        className="absolute right-4"
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <LanguageToggle />
      </div>
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">📚</div>
        <h1 className="text-2xl font-bold text-indigo-600">{t("app.name")}</h1>
        <p className="text-slate-500 text-sm mt-1">{t("app.tagline")}</p>
      </div>
      <form onSubmit={submit} className="w-full max-w-xs space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.password")}
          autoFocus
          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
        />
        {error && <p className="text-red-600 text-sm text-center">{t("auth.wrong")}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full bg-indigo-600 text-white font-medium rounded-lg py-3 disabled:opacity-40"
        >
          {t("auth.login")}
        </button>
      </form>
    </div>
  );
}
