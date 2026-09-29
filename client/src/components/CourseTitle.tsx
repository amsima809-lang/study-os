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

/**
 * Bilingual course label: "(CODE) <primary name>" with the other language shown
 * small and faint underneath. Primary follows the current UI language.
 */
export function CourseTitle({ code, name_th, name_en, className, secondaryClassName, inline }: Props) {
  const { lang } = useT();
  const th = name_th ?? "";
  const en = name_en ?? "";
  const primary = lang === "en" ? en || th : th;
  const secondary = lang === "en" ? th : en;
  const prefix = code ? `(${code}) ` : "";

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
        <span className={secondaryClassName ?? "block text-xs text-slate-400 font-normal mt-0.5"}>
          {secondary}
        </span>
      )}
    </span>
  );
}
