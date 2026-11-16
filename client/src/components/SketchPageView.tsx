import { Fragment, useEffect, useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import mermaidUrl from "@mermaid-js/tiny/dist/mermaid.tiny.js?url";
import type { SketchPage, SketchReading } from "../../../server/src/sketchSchema.js";
import { withBase } from "../base.ts";
import { useT } from "../i18n.tsx";
import "./sketchNotes.css";

type Block = SketchReading["notes"]["blocks"][number];
type Run = Extract<Block, { type: "text" }>["runs"][number];
type Mermaid = {
  initialize: (options: unknown) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
};
let renderer: Promise<Mermaid> | undefined;
let diagramSequence = 0;

function loadMermaid() {
  if (!renderer)
    renderer = new Promise<Mermaid>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = mermaidUrl;
      script.onload = () => {
        const mermaid = (window as Window & { mermaid?: Mermaid }).mermaid;
        if (!mermaid) {
          renderer = undefined;
          reject(new Error("Diagram renderer unavailable"));
          return;
        }
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          flowchart: { htmlLabels: false },
          theme: "neutral",
        });
        resolve(mermaid);
      };
      script.onerror = () => {
        renderer = undefined;
        script.remove();
        reject(new Error("Diagram renderer unavailable"));
      };
      document.head.append(script);
    });
  return renderer;
}

function MathText({ value }: { value: string }) {
  const html = useMemo(
    () => katex.renderToString(value, { throwOnError: false, trust: false, maxSize: 15, maxExpand: 400 }),
    [value],
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function InkRun({ run }: { run: Run }) {
  return (
    <span
      className={run.marks.map((m) => "sketch-" + m).join(" ")}
      style={{ color: run.ink, backgroundColor: run.highlight ?? undefined }}
    >
      {run.text
        .split(/(\$[^$\n]+\$)/g)
        .map((part, i) =>
          part.startsWith("$") && part.endsWith("$") && part.length > 2 ? (
            <MathText key={i} value={part.slice(1, -1)} />
          ) : (
            <Fragment key={i}>{part}</Fragment>
          ),
        )}
    </span>
  );
}

// The model supplies item and line records, never executable Mermaid syntax. Use our own IDs,
// encode punctuation as Mermaid entities, and restrict colours to the server's hex schema.
const mermaidLabel = (s: string) => s.replace(/[^\p{L}\p{M}\p{N} ]/gu, (c) => `#${c.codePointAt(0)};`);
function Diagram({ block, reading }: { block: Extract<Block, { type: "diagram" }>; reading: SketchReading }) {
  const [svg, setSvg] = useState("");
  const { source, description } = useMemo(() => {
    const ids = new Set(block.item_ids);
    const items = reading.items.filter((i) => ids.has(i.id));
    const keys = new Map(items.map((it, i) => [it.id, `N${i}`]));
    const names = new Map(items.map((it) => [it.id, it.text]));
    const code = ["flowchart TB"];
    const text: string[] = [];
    for (const it of items) code.push(`${keys.get(it.id)}["${mermaidLabel(it.text)}"]`);
    for (const [index, group] of reading.groups.entries()) {
      const members = group.items.filter((i) => keys.has(i));
      if (!members.length) continue;
      code.push(`subgraph G${index}["${mermaidLabel(group.label)}"]`, ...members.map((i) => keys.get(i)!), "end");
      text.push(group.label + " — " + members.map((i) => names.get(i)).join(", "));
    }
    let lineIndex = 0;
    for (const l of reading.lines) {
      if (!ids.has(l.from) || !ids.has(l.to)) continue;
      const reverse = l.head_at_from && !l.head_at_to;
      const a = reverse ? l.to : l.from,
        b = reverse ? l.from : l.to;
      const arrow = l.head_at_from && l.head_at_to ? "<-->" : l.head_at_from || l.head_at_to ? "-->" : "---";
      code.push(`${keys.get(a)} ${arrow} ${keys.get(b)}`);
      if (l.style === "dashed") code.push(`linkStyle ${lineIndex} stroke-dasharray:5 4`);
      lineIndex++;
      text.push(`${names.get(a)} ${arrow === "<-->" ? "↔" : arrow === "-->" ? "→" : "—"} ${names.get(b)}`);
    }
    for (const it of items)
      code.push(`style ${keys.get(it.id)} color:${it.ink},stroke:${it.ink},fill:${it.highlight ?? "#ffffff"}`);
    return { source: code.join("\n"), description: text.join("\n") || items.map((i) => i.text).join(", ") };
  }, [reading, block]);
  useEffect(() => {
    let live = true;
    setSvg("");
    const id = "sketchflow" + ++diagramSequence;
    void loadMermaid()
      .then((m) => m.render(id, source))
      .then((d) => {
        if (live) setSvg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(d.svg));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [source]);
  return (
    <figure>
      {svg ? (
        <img className="sketch-diagram" src={svg} alt={description} />
      ) : (
        <p className="whitespace-pre-line">{description}</p>
      )}
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

function SketchBlock({ block, reading }: { block: Block; reading: SketchReading }) {
  if (block.type === "diagram") return <Diagram block={block} reading={reading} />;
  if (block.type === "math")
    return (
      <div className="sketch-equation">
        {block.label && <p>{block.label}</p>}
        <table>
          <tbody>
            {block.steps.map((s, i) => (
              <tr key={i}>
                <td>
                  <MathText value={s.latex} />
                </td>
                <td className="sketch-op">{s.op && <MathText value={s.op} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {block.answer && (
          <span className="sketch-answer">
            <MathText value={block.answer} />
          </span>
        )}
      </div>
    );
  const Tag = block.type === "heading" ? "h4" : "p";
  return (
    <Tag className="whitespace-pre-wrap">
      {block.runs.map((r, i) => (
        <InkRun key={i} run={r} />
      ))}
    </Tag>
  );
}

export default function SketchPageView({ page, original }: { page: SketchPage; original: string }) {
  const { lang } = useT();
  const href = withBase(original);
  return (
    <article className="sketch-paper">
      <h3>{page.reading.notes.title}</h3>
      {page.reading.notes.blocks.map((block, i) => (
        <section key={i}>
          <SketchBlock block={block} reading={page.reading} />
          {page.pictures
            .filter((pic) => pic.after_block === i)
            .map((pic, k) => {
              const [l, t, r, b] = pic.box;
              return (
                <figure key={k}>
                  <svg
                    role="img"
                    aria-label={pic.name}
                    className="sketch-crop"
                    width={r - l}
                    height={b - t}
                    viewBox={`${l} ${t} ${r - l} ${b - t}`}
                  >
                    <image href={href} width={page.width} height={page.height} />
                  </svg>
                  <figcaption>{pic.name}</figcaption>
                </figure>
              );
            })}
        </section>
      ))}
      <a className="sketch-original" href={href} target="_blank" rel="noreferrer">
        <img src={href} alt="" />
        {lang === "th" ? "ดูหน้าต้นฉบับ" : "Open the original page"}
      </a>
    </article>
  );
}
