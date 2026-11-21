export const stampPattern = /\[(\d{1,3}:\d{2}(?::\d{2})?)\]/g;
export type Cue = { startMs: number; endMs: number; text: string };

export function nearestCue(cues: Cue[], stamp: string) {
  const second = stamp.split(":").map(Number).reduce((n, part) => 60 * n + part, 0);
  let best = -1;
  let distance = Infinity;
  for (let i = 0; i < cues.length; i++) {
    const delta = Math.abs(Math.floor(cues[i].startMs / 1000) - second);
    if (delta === 0) return i;
    if (delta < distance) { best = i; distance = delta; }
  }
  return best;
}

/** Build the return links from the text on screen, including a student's edited copy. */
export function summaryCitations(md: string, cues: Cue[], pointLabel: (n: number) => string) {
  const byCue = new Map<number, { line: number; label: string }[]>();
  let section = "", count = 0;
  md.split("\n").forEach((raw, line) => {
    const heading = raw.trim().match(/^(?:\*\*(.+)\*\*|#{1,4}\s+(.+))$/);
    if (heading) { section = heading[1] || heading[2]; count = 0; }
    const stamps = Array.from(raw.matchAll(stampPattern));
    if (!stamps.length) return;
    count++;
    const label = section.includes("⭐") ? `⭐ ${count}` : section && !/ประเด็นหลัก|main points/i.test(section) ? `${section} ${count}` : pointLabel(count);
    for (const idx of new Set(stamps.map((m) => nearestCue(cues, m[1])))) {
      if (idx >= 0) byCue.set(idx, [...(byCue.get(idx) ?? []), { line, label }]);
    }
  });
  return byCue;
}
