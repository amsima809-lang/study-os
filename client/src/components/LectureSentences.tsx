import { Fragment, type ReactNode } from "react";

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("th", { granularity: "sentence" }) : null;

/** Each sentence has a place for notes. Splitting the visible text first keeps bold spans and timestamp links intact. */
export function LectureSentences({ text, blockKey, bold = false, renderText }: {
  text: string;
  blockKey: string;
  bold?: boolean;
  renderText: (part: string) => ReactNode;
}) {
  const pieces = bold ? text.split(/\*\*(.+?)\*\*/g) : [text];
  const plain = pieces.join("");
  const sentences = segmenter ? Array.from(segmenter.segment(plain), part => part.segment)
    : plain.match(/[^.!?。！？]+[.!?。！？]*\s*|[.!?。！？]+\s*/gu) ?? [];
  let piece = 0, offset = 0;
  return <>{sentences.map((sentence, index) => {
    const runs: ReactNode[] = [];
    let left = sentence.length;
    while (left > 0 && piece < pieces.length) {
      const value = pieces[piece].slice(offset, offset + left);
      if (value) runs.push(piece % 2
        ? <strong className="font-semibold" style={{ color: "var(--text-primary)" }} key={piece}>{renderText(value)}</strong>
        : <Fragment key={piece}>{renderText(value)}</Fragment>);
      left -= value.length;
      offset += value.length;
      if (offset === pieces[piece].length) { piece++; offset = 0; }
    }
    const key = `${blockKey}:${index}`;
    return <span data-annotation-block={key} key={key}>
      <span data-annotation-text="">{runs}</span><span data-annotation-slot="" data-personal-passage="" />
    </span>;
  })}</>;
}
