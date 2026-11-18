export type Stimulus = { kind: string; title: string; text: string; columns: string[]; rows: string[][] };

export function StimulusView({ stimulus }: { stimulus?: Stimulus | null }) {
  if (!stimulus) return null;
  const poster = stimulus.kind === "poster";
  const points = stimulus.kind === "grid" && stimulus.columns.length === 3 ? stimulus.rows.map(row => ({
    label: row[0], x: Number(row[1]), y: Number(row[2]),
  })) : [];
  const plot = points.length > 0 && points.every(p => [p.x, p.y].every(v => Number.isInteger(v) && v >= 1 && v <= 9))
    && new Set(points.map(p => p.x + "," + p.y)).size === points.length;
  const posterLines = poster ? stimulus.text.split(/\n+/).map(s => s.trim()).filter(Boolean) : [];
  return <figure className={poster
    ? "mx-auto max-w-md space-y-3 rounded-lg border-2 border-[var(--accent-text)] bg-[var(--accent-light)] p-5 text-center"
    : "space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface-hover)] p-3"}>
    {stimulus.title && <figcaption className={poster ? "text-sm font-medium" : "font-semibold"}>{stimulus.title}</figcaption>}
    {posterLines.length > 0 ? <div className="space-y-3 border-y border-[var(--accent-text)] py-5">
      {posterLines.map((line, i) => <p key={i} className={i === 0 ? "text-xl font-bold" : i === posterLines.length - 1 ? "font-semibold" : ""}>{line}</p>)}
    </div> : stimulus.text && <p className="whitespace-pre-line break-words">{stimulus.text}</p>}
    {plot && <div aria-hidden="true" className="mx-auto max-w-sm py-2 text-sm">
      <p className="mb-1 font-medium">↑ {stimulus.columns[2]}</p>
      <div className="flex"><div className="flex w-5 flex-col justify-between py-1 text-xs"><span>9</span><span>5</span><span>1</span></div>
        <div className="relative grid aspect-square w-full grid-cols-9 grid-rows-9 border border-[var(--border)] bg-[var(--bg-surface)]"
          style={{backgroundImage: "linear-gradient(to right, var(--border-light) 1px, transparent 1px), linear-gradient(to bottom, var(--border-light) 1px, transparent 1px)", backgroundSize: "calc(100% / 9) calc(100% / 9)"}}>
          {points.map(p => <span key={p.label} style={{gridColumn: p.x, gridRow: 10 - p.y}}
            className="m-auto grid min-h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-xs font-semibold text-white">{p.label}</span>)}
        </div></div>
      <div className="ml-5 flex justify-between px-2 text-xs"><span>1</span><span>5</span><span>9</span></div>
      <p className="text-right font-medium">{stimulus.columns[1]} →</p>
    </div>}
    {stimulus.rows.length > 0 && <div className={plot ? "sr-only" : "max-w-full overflow-x-auto"}><table className="w-full border-collapse text-left text-sm" aria-label={stimulus.title}>
      {stimulus.columns.length > 0 && <thead><tr>{stimulus.columns.map((cell, i) => <th className="border border-[var(--border)] p-2" scope="col" key={i}>{cell}</th>)}</tr></thead>}
      <tbody>{stimulus.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className="border border-[var(--border)] p-2" key={j}>{cell}</td>)}</tr>)}</tbody>
    </table></div>}
  </figure>;
}
