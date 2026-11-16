/**
 * Writing by hand with Apple's PencilKit inside the iOS app: the AppInk plugin
 * (native/ios/App/App/AppInk.swift) opens a full-screen page with Apple's own
 * canvas and tool picker, the same as Notes, with iPadOS's palm rejection.
 * In a browser there is no such plugin and the note uses the web drawing pad.
 */
import type { NativeInk } from "./noteDraft.ts";

type InkLabels = { title: string; done: string; cancel: string; anchorX?: number; anchorY?: number; accent?: string };

type AppInkPlugin = {
  draw: (o: InkLabels & { drawing?: string }) => Promise<
    { cancelled: true } | { cancelled?: false; empty: true } | { drawing: string; png: string; width: number; height: number; colors: string[]; strokeBounds?: number[][] }
  >;
};

function plugin(): AppInkPlugin | null {
  const cap = (window as { Capacitor?: { Plugins?: { AppInk?: AppInkPlugin } } }).Capacitor;
  return cap?.Plugins?.AppInk ?? null;
}

/** True inside an iOS app build that has the PencilKit page. */
export function hasNativeInk(): boolean {
  return plugin() !== null;
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
  const p = plugin();
  if (!p) return undefined;
  const r = await p.draw({ drawing: previous?.drawing, ...labels });
  if ("cancelled" in r && r.cancelled) return undefined;
  if ("empty" in r) return null;
  if (!("png" in r) || !r.png) return undefined;
  return { drawing: r.drawing, png: r.png, colors: r.colors ?? [], strokeBounds: r.strokeBounds };
}

/** The ink's picture as a file to send with the note. */
export function inkBlob(ink: NativeInk): Blob {
  const bytes = Uint8Array.from(atob(ink.png), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}
