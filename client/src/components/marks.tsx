/**
 * The marks of the calendar's kinds (class, exam, booked e-Testing, study, …): one icon and one
 * colour each, used in the month grid and its key, the day list's chips and the course chips, so
 * a kind looks the same wherever it appears (owner 2026-11-15/16).
 */
import Icon from "./Icon.tsx";
import type { CalEvent } from "../api.ts";

export type DotType = "class" | "exam" | "task" | "etesting" | "etwindow" | "etbooked" | "reminder" | "todo" | "event" | "busy";
export const DOT_COLORS: Record<DotType, string> = {
  class: "var(--mark-class)", // yellow
  exam: "var(--mark-exam)", // rose; a final's DATE is ringed in rose (owner 2026-11-16)
  task: "var(--mark-study)", // teal: apart from classes (yellow) and booked e-Testing (rose)
  etesting: "#d97706",
  etwindow: "var(--mark-window)", // grey; off-white in dark mode
  etbooked: "var(--mark-exam)", // rose (owner 2026-11-16: green was too close to study teal)
  event: "#6366f1",
  reminder: "#0ea5e9",
  todo: "#a855f7",
  busy: "var(--text-tertiary)",
};

export const DOT_ICON: Record<DotType, string> = {
  class: "whiteboard", exam: "fileEdit", task: "bookOpen", etesting: "pen", etwindow: "fileEdit", etbooked: "fileEdit",
  event: "calendar", reminder: "bell", todo: "square", busy: "clock",
};
/** The dot for an item: e-Testing testing days get their own, quieter mark. */
export const dotOf = (e: { type: CalEvent["type"]; etesting_kind?: string }): DotType => (e.type === "etesting" && e.etesting_kind === "testing" ? "etwindow" : e.type);
export function DotMark({ type, color, label, size = 13 }: { type: DotType; color?: string; /** shown on hover */ label?: string; size?: number }) {
  return (
    <span title={label} className="inline-flex" style={{ opacity: type === "etwindow" ? "var(--mark-window-opacity)" : 1 }}>
      <Icon name={DOT_ICON[type]} size={size} style={{ color: color ?? DOT_COLORS[type], strokeWidth: 2.2 } as React.CSSProperties} />
    </span>
  );
}

/**
 * A final's day: the date number gets a rose ring (owner 2026-11-16: "if today is a final, it's
 * still the purple circle, but with a rose stroke"). The key shows this ring for "Final".
 */
export const finalRing = (color = "var(--mark-exam)") => `0 0 0 1.5px ${color}`;
export function RingSample({ color = "var(--mark-exam)", size = 12 }: { color?: string; size?: number }) {
  return <span aria-hidden="true" className="inline-block rounded-full shrink-0" style={{ width: size, height: size, boxShadow: `inset ${finalRing(color)}` }} />;
}
