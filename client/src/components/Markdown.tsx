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
      <strong key={`${keyPrefix}-b${i}`} className="font-semibold" style={{ color: "var(--text-primary)" }}>
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
        <h4 key={idx} className="font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
          {renderInline(line.slice(3), `h${idx}`)}
        </h4>,
      );
      return;
    }
    if (line.startsWith("# ")) {
      out.push(
        <h3 key={idx} className="font-bold mt-2" style={{ color: "var(--text-primary)" }}>
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
          className="flex gap-2 text-sm"
          style={{ paddingLeft: `${level * 16}px`, color: "var(--text-secondary)" }}
        >
          <span style={{ color: "var(--accent-text)" }}>•</span>
          <span>{renderInline(bullet[2], `li${idx}`)}</span>
        </div>,
      );
      return;
    }

    out.push(
      <p key={idx} className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {renderInline(line, `p${idx}`)}
      </p>,
    );
  });

  return <div className="space-y-1">{out}</div>;
}
