import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { openDb, type DB } from "./db.js";
import { Bundle } from "./lectures.js";

// [bundle file, its course codes in the bundle's order, the code that holds the original].
// The original is the code listed to students outside the course's own programme, so for a
// recording shared with a former code (LAW1001 = LAW1101 for older IDs) it is the current code.
// Summary files and manifest keys stay named after the bundle's first code.
const sources: [string, string[], string][] = [
  ["subject-15_ACC1101_ACC1103.json", ["ACC1101", "ACC1103"], "ACC1101"],
  ["subject-2_MGT3204.json", ["MGT3204"], "MGT3204"],
  ["subject-3_RAM1103.json", ["RAM1103"], "RAM1103"],
  ["subject-6_RAM1132.json", ["RAM1132"], "RAM1132"],
  // Outside the B.B.A. curriculum (migration 059): reachable only through shared lecture access.
  ["subject-11_CDM1101.json", ["CDM1101"], "CDM1101"],
  ["subject-12_CDM2103_MCS1151.json", ["CDM2103", "MCS1151"], "CDM2103"],
  ["subject-13_LAW1001_LAW1101.json", ["LAW1001", "LAW1101"], "LAW1101"],
  ["subject-5_LAW1002_LAW1102.json", ["LAW1002", "LAW1102"], "LAW1102"],
  ["subject-7_POL1101.json", ["POL1101"], "POL1101"],
  ["subject-9_POL2106.json", ["POL2106"], "POL2106"],
];

const Metadata = z.object({
  course_codes: z.array(z.string()), session_no: z.number().int(), source_url: z.string(),
  model: z.string().min(1), prompt: z.string().min(1), cues: z.number().int(),
});

export function importSavedLectures(db: DB, folder: string) {
  const summaries = join(folder, "lecture-summary/summaries");
  const manifest = JSON.parse(readFileSync(join(summaries, "manifest.json"), "utf8")) as Record<string, unknown>;
  const find = db.prepare("SELECT id FROM course_lectures WHERE course_code = ? AND session_no = ? AND url = ? AND source = ?");
  const save = db.prepare(
    `INSERT INTO shared_lecture_transcripts (id, course_code, session_no, source_url, cues, cue_count, duration_ms, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET cues = excluded.cues, cue_count = excluded.cue_count,
       duration_ms = excluded.duration_ms, collected_at = excluded.collected_at, source_url = excluded.source_url`);
  const saveSummary = db.prepare(
    `INSERT INTO shared_lecture_summaries (transcript_id, summary_md, model, prompt_version, created_at)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT(transcript_id) DO UPDATE SET summary_md = excluded.summary_md,
       model = excluded.model, prompt_version = excluded.prompt_version, created_at = excluded.created_at
     WHERE summary_md <> excluded.summary_md OR model <> excluded.model OR prompt_version <> excluded.prompt_version`);
  const link = db.prepare("UPDATE course_lectures SET shared_transcript_id = ? WHERE id = ?");
  return db.transaction(() => {
    let links = 0;
    const imported = new Set<string>();
    for (const [file, codes, primary] of sources) {
      const lead = codes.indexOf(primary);
      if (lead < 0) throw new Error(`Primary ${primary} is not among the codes of ${file}`);
      const bundle = Bundle.extend({ collected_at: z.string().min(1) }).parse(
        JSON.parse(readFileSync(join(folder, "transcripts/raw", file), "utf8")),
      );
      if (bundle.course_codes.join() !== codes.join()) throw new Error(`Unexpected courses in ${file}`);
      for (const session of bundle.sessions) {
        const name = `${codes[0]}_L${String(session.no).padStart(2, "0")}.md`;
        const parsed = Metadata.safeParse(manifest[name]);
        if (!parsed.success) throw new Error(`Missing or invalid manifest entry for ${name}`);
        const meta = parsed.data;
        if (meta.source_url !== session.url || meta.session_no !== session.no || meta.cues !== session.cues.length ||
            meta.course_codes.join() !== codes.join() || imported.has(name)) throw new Error(`Source mismatch for ${name}`);
        const ids = codes.map((code) => {
          const row = find.get(code, session.no, meta.source_url, bundle.source) as { id: number } | undefined;
          if (!row) throw new Error(`No matching catalogue lecture for ${code} ${session.no}`);
          return row.id;
        });
        const path = join(summaries, name);
        const md = readFileSync(path, "utf8").trim();
        if (!md) throw new Error(`Empty summary in ${name}`);
        const cues = session.cues.filter((cue) => cue.text.trim()).sort((a,b) => a.startMs - b.startMs);
        if (!cues.length) throw new Error(`Empty cues for ${name}`);
        const original = ids[lead];
        save.run(original, primary, session.no, meta.source_url, JSON.stringify(cues), cues.length,
          Math.max(...cues.map((c) => c.endMs)), bundle.collected_at);
        saveSummary.run(original, md, meta.model, meta.prompt, statSync(path).mtime.toISOString());
        for (const id of ids) link.run(original, id);
        links += ids.length;
        imported.add(name);
      }
    }
    for (const name of Object.keys(manifest)) {
      if (!imported.has(name)) throw new Error(`Manifest entry without a matching catalogue source: ${name}`);
    }
    return { recordings: imported.size, catalogueLinks: links };
  })();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [folder, database] = process.argv.slice(2);
  if (!folder || !database || !existsSync(database)) {
    throw new Error("Usage: tsx src/importSavedLectures.ts <private notes folder> <existing SQLite database>");
  }
  const db = openDb(database);
  try { console.log(importSavedLectures(db, folder)); } finally { db.close(); }
}
