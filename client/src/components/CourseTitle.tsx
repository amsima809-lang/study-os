import { useT } from "../i18n.tsx";
import { DOT_COLORS, DotMark, type DotType } from "./marks.tsx";

type Props = {
  code?: string | null;
  name_th?: string | null;
  name_en?: string | null;
  className?: string;
  secondaryClassName?: string;
  /** Show only "(CODE) primary" on one line (no faint secondary). */
  inline?: boolean;
  /** What the course is here (a class, an exam, study): the chip takes that kind's mark and colour. */
  kind?: DotType;
  /** With `kind`: leave the icon out (where the row already shows it). */
  noIcon?: boolean;
};

/** A course code as a small chip, e.g. [ACC1103]. Use it wherever a code is shown. */
export function CourseChip({ code, className = "", kind, noIcon = false }: { code: string; className?: string; kind?: DotType; noIcon?: boolean }) {
  // In a class, exam or study context the chip wears that kind's mark and colour (owner
  // 2026-11-16: "add them in the course name chips"); elsewhere it stays the app's accent.
  const color = kind ? DOT_COLORS[kind] : "var(--accent-text)";
  return (
    <span
      className={`${kind && !noIcon ? "inline-flex items-center gap-1" : "inline-block"} align-middle whitespace-nowrap rounded-md px-1.5 py-0.5 text-[length:max(0.8em,12px)] font-semibold leading-none ${className}`}
      style={{ backgroundColor: kind ? `color-mix(in srgb, ${color} 16%, transparent)` : "var(--accent-light)", color }}
    >
      {kind && !noIcon && <DotMark type={kind} size={12} />}
      {code}
    </span>
  );
}

/**
 * Bilingual course label: a code chip, then the primary name, with the other
 * language shown small and faint underneath. Primary follows the UI language.
 */
export function CourseTitle({ code, name_th, name_en, className, secondaryClassName, inline, kind, noIcon }: Props) {
  const { lang } = useT();
  const th = name_th ?? "";
  const en = name_en ?? "";
  const primary = lang === "en" ? en || th : th;
  const secondary = lang === "en" ? th : en;
  const prefix = code ? <CourseChip code={code} className="mr-1.5" kind={kind} noIcon={noIcon} /> : null;

  if (inline) {
    return (
      <span className={className}>
        {prefix}
        {primary}
      </span>
    );
  }

  return (
    <span className={className}>
      <span>
        {prefix}
        {primary}
      </span>
      {secondary && secondary !== primary && (
        <span className={secondaryClassName ?? "block text-xs font-normal mt-0.5"} style={{ color: "var(--text-tertiary)" }}>
          {secondary}
        </span>
      )}
    </span>
  );
}
