/**
 * Writing by hand with Apple's PencilKit inside the iOS app: the AppInk plugin
 * (native/ios/App/App/AppInk.swift) opens a full-screen page with Apple's own
 * canvas and tool picker, the same as Notes, with iPadOS's palm rejection.
 * In a browser there is no such plugin and the note uses the web drawing pad.
 */
import type { NativeInk } from "./noteDraft.ts";

type InkLabels = { title: string; done: string; cancel: string; anchorX?: number; anchorY?: number; accent?: string };

type Result = { cancelled: true } | { empty: true } | NativeInk;
type AppInkPlugin = {
  draw: (o: InkLabels & { drawing?: string }) => Promise<Result>;
  drawInSheet: (o: InkLabels & { sessionID: string; drawing?: string; pencilOnly: boolean }) => Promise<Result>;
  closeSheet: (o: { sessionID: string }) => Promise<void>;
};

function bridge() {
  return (window as { Capacitor?: {
    Plugins?: { AppInk?: AppInkPlugin };
    PluginHeaders?: { name: string; methods: { name: string }[] }[];
  } }).Capacitor;
}

/** True inside an iOS app build that has the PencilKit page. */
export function hasNativeInk(): boolean {
  return !!bridge()?.Plugins?.AppInk;
}

/** Check the methods actually registered by the installed binary, independent of any JS proxy. */
export function hasNativeInkSheet(): boolean {
  const cap = bridge();
  const methods = cap?.PluginHeaders?.find(header => header.name === "AppInk")?.methods;
  return !!cap?.Plugins?.AppInk && !!methods?.some(m => m.name === "drawInSheet") && methods.some(m => m.name === "closeSheet");
}

function inkResult(result: Result): NativeInk | null | undefined {
  if ("empty" in result) return null;
  if ("cancelled" in result) return undefined;
  if (!result.png) throw new Error("MISSING_INK_IMAGE");
  return { drawing: result.drawing, png: result.png, colors: result.colors ?? [], strokeBounds: result.strokeBounds };
}

export async function drawInPencilKitSheet(sessionID: string, drawing: string | undefined, labels: InkLabels) {
  const p = bridge()?.Plugins?.AppInk;
  if (!p) throw Object.assign(new Error("PencilKit unavailable"), { code: "UNIMPLEMENTED" });
  let pencilOnly = false;
  try { pencilOnly = localStorage.getItem("studyos.penOnly") === "1"; } catch { /* storage unavailable */ }
  return inkResult(await p.drawInSheet({ sessionID, drawing, pencilOnly, ...labels }));
}

export function closePencilKitSheet(sessionID: string) {
  void bridge()?.Plugins?.AppInk?.closeSheet?.({ sessionID })?.catch(() => {});
}

/** The selected pen colour is shared by full-page notes and margin annotations. */
export function penAccent(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6d5cdf";
}

/**
 * Open the PencilKit page, starting from `previous` so she can keep editing.
 * Resolves to the new ink, `null` when she cleared everything, or `undefined` when she cancelled.
 */
export async function drawWithPencilKit(
  previous: NativeInk | undefined,
  labels: InkLabels,
): Promise<NativeInk | null | undefined> {
  const p = bridge()?.Plugins?.AppInk;
  if (!p) return undefined;
  return inkResult(await p.draw({ drawing: previous?.drawing, ...labels }));
}

/** The ink's picture as a file to send with the note. */
export function inkBlob(ink: NativeInk): Blob {
  const bytes = Uint8Array.from(atob(ink.png), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}
