/**
 * Minimal, safe Markdown renderer (no HTML injection, no external library).
 * Supports: # / ## headings, - bullets (nested by 2-space indent), **bold**,
 * and plain paragraphs. Enough for AI summaries and bullet mind maps.
 */
import type { ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Split on **bold** and render the odd segments as <strong>.
  return text.split(/\*\*(.+?)\*\*/g).map((seg, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-slate-900">
        {seg}
      </strong>
    ) : (
      <span key={`${keyPrefix}-t${i}`}>{seg}</span>
    ),
  );
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.trim() === "") return;

    if (line.startsWith("## ")) {
      out.push(
        <h4 key={idx} className="font-semibold text-slate-800 mt-2">
          {renderInline(line.slice(3), `h${idx}`)}
        </h4>,
      );
      return;
    }
    if (line.startsWith("# ")) {
      out.push(
        <h3 key={idx} className="font-bold text-slate-800 mt-2">
          {renderInline(line.slice(2), `h${idx}`)}
        </h3>,
      );
      return;
    }

    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bullet) {
      const level = Math.floor(bullet[1].length / 2);
      out.push(
        <div
          key={idx}
          className="flex gap-2 text-sm text-slate-700"
          style={{ paddingLeft: `${level * 16}px` }}
        >
          <span className="text-indigo-400">•</span>
          <span>{renderInline(bullet[2], `li${idx}`)}</span>
        </div>,
      );
      return;
    }

    out.push(
      <p key={idx} className="text-sm text-slate-700">
        {renderInline(line, `p${idx}`)}
      </p>,
    );
  });

  return <div className="space-y-1">{out}</div>;
}
