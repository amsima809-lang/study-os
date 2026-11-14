import { useT } from "../i18n.tsx";

type Props = {
  code?: string | null;
  name_th?: string | null;
  name_en?: string | null;
  className?: string;
  secondaryClassName?: string;
  /** Show only "(CODE) primary" on one line (no faint secondary). */
  inline?: boolean;
};

/** A course code as a small chip, e.g. [ACC1103]. Use it wherever a code is shown. */
export function CourseChip({ code, className = "" }: { code: string; className?: string }) {
  return (
    <span
      className={`inline-block align-middle whitespace-nowrap rounded-md px-1.5 py-0.5 text-[length:max(0.8em,12px)] font-semibold leading-none ${className}`}
      style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-text)" }}
    >
      {code}
    </span>
  );
}

/**
 * Bilingual course label: a code chip, then the primary name, with the other
 * language shown small and faint underneath. Primary follows the UI language.
 */
export function CourseTitle({ code, name_th, name_en, className, secondaryClassName, inline }: Props) {
  const { lang } = useT();
  const th = name_th ?? "";
  const en = name_en ?? "";
  const primary = lang === "en" ? en || th : th;
  const secondary = lang === "en" ? th : en;
  const prefix = code ? <CourseChip code={code} className="mr-1.5" /> : null;

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
