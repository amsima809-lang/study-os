export type InkRun = { text: string; color: string | null };
export type PersonalPassage = { kind: "mine"; id: number; source: "annotation" | "note"; runs: InkRun[] };
type Block = { kind: "summary"; text: string } | PersonalPassage;

export type CreatedLectureNotes = { mode: "separate" | "combined"; blocks: Block[]; version: number };

/** Placement was saved against these exact summary lines. Blank lines are absent in the saved document. */
export function combinedPlacements(markdown: string, created: CreatedLectureNotes | null) {
  if (created?.mode !== "combined") return null;
  const lines = markdown.split(/\r?\n/).map((text, index) => ({ text, index })).filter(line => line.text.trim());
  const placements = new Map<number, PersonalPassage[]>();
  let position = -1;
  for (const block of created.blocks) {
    if (block.kind === "summary") {
      if (lines[++position]?.text !== block.text) return null;
    } else {
      if (position < 0) return null;
      const index = lines[position].index;
      const group = placements.get(index) ?? [];
      group.push(block);
      placements.set(index, group);
    }
  }
  return position === lines.length - 1 ? placements : null;
}

export type PersonalNote = {
  id: number;
  title: string | null;
  created_at: string;
  raw_text: string | null;
  image_paths: string[];
  handwriting_image_index?: number | null;
  sketch_passages?: { runs: InkRun[] }[];
};
export type LectureSources = {
  notes: PersonalNote[];
  annotations: { id: number; quote: string; runs: InkRun[]; image_url: string }[];
};

function signature(runs: InkRun[]) {
  return JSON.stringify(runs.map(run => [run.text, run.color]));
}

/** Each source keeps its saved positions only while all its words and colours still match. */
export function currentCombinedReading(markdown: string, created: CreatedLectureNotes | null, sources: LectureSources) {
  const positions = combinedPlacements(markdown, created);
  if (!positions) return null;
  const live = new Map<string, string[]>();
  for (const note of sources.notes) {
    const typed = (note.raw_text ?? "").split(/\r?\n/).filter(line => line.trim())
      .map(text => signature([{ text, color: null }]));
    const sketches = (note.sketch_passages ?? []).map(p => signature(p.runs));
    live.set("note-" + note.id, [...typed, ...sketches].sort());
  }
  for (const pen of sources.annotations) live.set("annotation-" + pen.id, [signature(pen.runs)]);
  const saved = new Map<string, string[]>();
  for (const group of positions.values()) {
    for (const p of group) {
      const key = p.source + "-" + p.id;
      const values = saved.get(key) ?? [];
      values.push(signature(p.runs));
      saved.set(key, values);
    }
  }
  const matched = new Set<string>();
  for (const [key, signatures] of saved) {
    const originals = live.get(key);
    if (originals?.length === signatures.length && signatures.sort().every((value, i) => value === originals[i])) matched.add(key);
  }
  const notes = new Set<number>();
  const annotations = new Set<number>();
  const lines = new Map<number, PersonalPassage[]>();
  for (const [line, group] of positions) {
    lines.set(line, group.filter(p => {
      if (!matched.has(p.source + "-" + p.id)) return false;
      (p.source === "note" ? notes : annotations).add(p.id);
      return true;
    }));
  }
  return { lines, notes, annotations, allCurrent: matched.size === saved.size };
}
