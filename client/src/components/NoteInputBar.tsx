import { useEffect, useRef, useState, type RefObject } from "react";
import { useT } from "../i18n.tsx";
import { inNativeApp } from "../native.ts";
import { nativeDictation } from "../nativeDictation.ts";
import Icon from "./Icon.tsx";

/**
 * The four ways to write a note, as one row of icons (owner 2026-11-16):
 * Speak, Keyboard (shows / hides the on-screen keyboard), External keyboard and
 * Pen. The last two light up BY THEMSELVES when they are being used: keys
 * arriving while no on-screen keyboard is up mean a connected keyboard; a pen
 * touching the note body opens the handwriting editor.
 *
 * Speak uses the browser's own speech recognition (Apple's on an iPad or
 * iPhone, in Thai or English with the app's language). It is hidden where the
 * browser has none. In the app, the AppDictation plugin uses Apple Speech.
 */
export type NoteMode = "type" | "draw";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function speechRecognition(): (new () => Recognition) | null {
  if (inNativeApp()) return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True while the on-screen keyboard covers part of the screen (set by useKeyboardInset in App.tsx). */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(() => document.documentElement.classList.contains("keyboard-open"));
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setOpen(root.classList.contains("keyboard-open")));
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return open;
}

export function NoteInputBar({
  mode,
  onMode,
  textRef,
  penUsed,
  attachmentActions,
  onDictated,
  onListeningChange,
}: {
  mode: NoteMode;
  onMode: (m: NoteMode) => void;
  textRef: RefObject<HTMLTextAreaElement | null>;
  /** A pen has been used on this note (the pad or the text box). */
  penUsed: boolean;
  attachmentActions?: { takePhoto: () => void; addImage: () => void };
  /** Finished words from dictation, to add to the note's text. */
  onDictated: (words: string) => void;
  onListeningChange: (pending: boolean) => void;
}) {
  const { t, lang } = useT();
  const keyboardOpen = useKeyboardOpen();
  const [external, setExternal] = useState(false);
  const [listening, setListeningState] = useState(false);
  const [speakOpen, setSpeakOpen] = useState(false);
  const [interim, setInterim] = useState("");
  const [speechError, setSpeechError] = useState("");
  const rec = useRef<Recognition | null>(null);
  const Speech = speechRecognition();
  const native = nativeDictation();
  const nativeSession = useRef<symbol | null>(null);

  // Keep Save disabled through final transcription, including the interval after Stop.
  function setListening(active: boolean) {
    setListeningState(active);
    onListeningChange(active);
  }

  // Keys typed while no on-screen keyboard is showing come from a connected keyboard.
  // (Listened for on the page, not the box: the box is created later than this bar.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target !== textRef.current || e.isComposing || e.key === "Unidentified") return;
      if (!document.documentElement.classList.contains("keyboard-open")) setExternal(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [textRef]);
  useEffect(() => {
    if (keyboardOpen) setExternal(false);
  }, [keyboardOpen]);

  useEffect(() => () => {
    rec.current?.stop();
    if (nativeSession.current) {
      nativeSession.current = null;
      void nativeDictation()?.stop().catch(() => {});
    }
  }, []);

  /** Focus the text box after React has shown it (switching from the pad). */
  function focusText() {
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }

  function keyboard() {
    if (mode !== "type") {
      onMode("type");
      focusText();
    } else if (document.activeElement === textRef.current && keyboardOpen) {
      textRef.current?.blur(); // hides the on-screen keyboard
    } else {
      focusText();
    }
  }

  function startListening() {
    setSpeechError("");
    if (mode !== "type") onMode("type");
    if (native) {
      if (nativeSession.current) return;
      const session = Symbol();
      nativeSession.current = session;
      setListening(true);
      void native.start({ language: lang === "th" ? "th-TH" : "en-US" })
        .then(({ text }) => {
          if (nativeSession.current === session && text.trim()) onDictated(text.trim());
        })
        .catch((e) => {
          if (nativeSession.current === session) setSpeechError(t(e?.code === "DENIED" ? "input.micDenied" : "input.micFailed"));
        })
        .finally(() => {
          if (nativeSession.current === session) { nativeSession.current = null; setListening(false); }
        });
      return;
    }
    if (!Speech) return;
    const r = new Speech();
    r.lang = lang === "th" ? "th-TH" : "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finished = "";
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finished += res[0].transcript;
        else pending += res[0].transcript;
      }
      if (finished.trim()) onDictated(finished.trim());
      setInterim(pending);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setSpeechError(t("input.micDenied"));
      else if (e.error !== "no-speech" && e.error !== "aborted") setSpeechError(t("input.micFailed"));
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      rec.current = null;
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setSpeechError(t("input.micFailed"));
    }
  }
  function stopListening() {
    if (nativeSession.current) void native?.stop().catch(() => setSpeechError(t("input.micFailed")));
    rec.current?.stop();
  }
  function closeSpeak() {
    stopListening();
    setSpeakOpen(false);
  }

  const items: Array<{ key: string; icon: string; label: string; on: boolean; tap: () => void; hidden?: boolean }> = [
    { key: "speak", icon: "mic", label: t("input.speak"), on: speakOpen, hidden: !Speech && !native,
      tap: () => { if (speakOpen) { stopListening(); setSpeakOpen(false); } else { setSpeakOpen(true); startListening(); } } },
    { key: "keyboard", icon: "keyboard", label: t("input.keyboard"), on: mode === "type" && keyboardOpen, tap: () => { closeSpeak(); keyboard(); } },
    { key: "external", icon: "bluetooth", label: t("input.external"), on: mode === "type" && external, tap: () => { closeSpeak(); onMode("type"); focusText(); } },
    { key: "pen", icon: "pen", label: t("input.pen"), on: mode === "draw" || penUsed, tap: () => { closeSpeak(); onMode("draw"); } },
  ];

  return (
    <div>
      <div className={attachmentActions ? "flex items-center gap-0.5 sm:gap-2" : "flex gap-2"} role="group" aria-label={t("input.label")}>
        {items.filter((i) => !i.hidden).map((i) => (
          <button
            key={i.key}
            type="button"
            onClick={i.tap}
            aria-pressed={i.on}
            aria-label={i.label}
            title={i.label}
            className="min-w-0 flex-1 self-stretch rounded-lg py-1.5 min-h-11 flex flex-col items-center justify-center gap-0.5 text-xs font-medium"
            style={{
              backgroundColor: i.on ? "var(--accent)" : "var(--bg-surface-hover)",
              color: i.on ? "#fff" : "var(--text-secondary)",
            }}
          >
            <Icon name={i.icon} size={18} />
            <span className={attachmentActions ? "hidden min-[375px]:inline" : undefined}>{i.label}</span>
          </button>
        ))}
        {attachmentActions && <>
          <span role="separator" aria-orientation="vertical" className="h-7 shrink-0 border-l mx-0.5" style={{ borderColor: "var(--border)" }}/>
          {[
            { icon: "camera", label: t("notes.camera"), tap: attachmentActions.takePhoto },
            { icon: "imagePlus", label: t("notes.gallery"), tap: attachmentActions.addImage },
          ].map(action => <button key={action.icon} type="button" onClick={action.tap} aria-label={action.label} title={action.label}
            className="grid size-11 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-secondary)" }}>
            <Icon name={action.icon} size={19}/>
          </button>)}
        </>}
      </div>

      {speakOpen && (
        <div className="mt-3 flex flex-col items-center gap-2" aria-live="polite">
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className={`${listening ? "mic-live " : ""}rounded-full flex items-center justify-center`}
            style={{
              width: 96, height: 96,
              backgroundColor: listening ? "var(--accent)" : "var(--bg-surface-hover)",
              color: listening ? "#fff" : "var(--accent-text)",
              border: listening ? "none" : "2px solid var(--accent)",
            }}
            aria-label={t(listening ? "input.stop" : "input.start")}
            aria-pressed={listening}
          >
            <Icon name="mic" size={44} />
          </button>
          <p className="text-sm text-center min-h-5" style={{ color: "var(--text-secondary)" }}>
            {listening ? interim || t("input.listening") : t("input.tapToSpeak")}
          </p>
          {listening && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("input.tapToStop")}</p>}
        </div>
      )}
      {speechError && <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{speechError}</p>}
    </div>
  );
}
