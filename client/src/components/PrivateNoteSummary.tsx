import { useState } from "react";
import { putJSON, type ApiError, type NoteDetail } from "../api.ts";
import { useT } from "../i18n.tsx";
import { Markdown } from "./Markdown.tsx";
import { ConfirmDialog, ErrorBox } from "./ui.tsx";

export function PrivateNoteSummary({ note, onSaved }: { note: NoteDetail; onSaved: (note: NoteDetail) => void }) {
  const { t, lang } = useT();
  const [draft, setDraft] = useState<{ text: string; previous: string } | null>(null);
  const [restore, setRestore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const summary = note.ai_summary_md;
  if (!summary) return null;

  async function save(text: string | null, previous: string) {
    setBusy(true);
    setError("");
    try {
      onSaved(await putJSON<NoteDetail>(`/api/notes/${note.id}/summary`, { summary_md: text, previous_md: previous }));
      setDraft(null);
    } catch (err) {
      const e = err as ApiError & { note?: NoteDetail };
      if (e.code === "SUMMARY_CHANGED" && e.note) {
        onSaved(e.note);
        const changed = lang === "th" ? "มีการแก้ไขสรุปจากที่อื่นแล้ว" : "This summary changed elsewhere.";
        const keepDraft = lang === "th" ? "คัดลอกข้อความที่ต้องการเก็บ แล้วกดยกเลิกเพื่อดูฉบับล่าสุด"
          : "Copy any draft text you want to keep, then cancel to see the latest version.";
        setError(text === null ? changed : `${changed} ${keepDraft}`);
      } else setError(lang === "th" ? e.error || t("status.failed") : t("status.failed"));
    } finally {
      setBusy(false);
      setRestore(false);
    }
  }

  const action = "min-h-11 px-2 text-sm";
  return <>
    {note.summary_edited && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("lec.edited")}</p>}
    {draft ? <>
      <textarea aria-label={t("lec.edit")} className="w-full rounded-lg p-3 text-sm" rows={12} maxLength={120000}
        style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
        value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} />
      <div className="no-print flex gap-2">
        <button className={action} disabled={busy || !draft.text.trim()} onClick={() => void save(draft.text, draft.previous)}>{t("lec.save")}</button>
        <button className={action} disabled={busy} onClick={() => { setDraft(null); setError(""); }}>{t("nav.cancel")}</button>
      </div>
    </> : <>
      <Markdown source={summary}/>
      <div className="no-print flex gap-2" style={{ color: "var(--accent-text)" }}>
        <button className={action} disabled={busy}
          onClick={() => { setError(""); setDraft({ text: summary, previous: summary }); }}>{t("lec.edit")}</button>
        {note.summary_edited && <button className={action} disabled={busy} onClick={() => setRestore(true)}>{t("lec.restore")}</button>}
      </div>
    </>}
    {error && <ErrorBox>{error}</ErrorBox>}
    {restore && <ConfirmDialog title={t("lec.restore")} confirmLabel={t("lec.restore")} cancelLabel={t("nav.cancel")}
      message={lang === "th" ? "แทนที่ฉบับที่คุณแก้ไขด้วยสรุปต้นฉบับจาก AI หรือไม่" : "Replace your edits with the original AI summary?"}
      busy={busy} onCancel={() => setRestore(false)} onConfirm={() => void save(null, summary)}/>}
  </>;
}
