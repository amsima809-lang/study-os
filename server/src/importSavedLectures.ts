import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { openDb, type DB } from "./db.js";
import { Bundle } from "./lectures.js";

const sources = [
  ["subject-15_ACC1101_ACC1103.json", "ACC1101", "ACC1103"],
  ["subject-2_MGT3204.json", "MGT3204"],
  ["subject-3_RAM1103.json", "RAM1103"],
  ["subject-6_RAM1132.json", "RAM1132"],
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
    for (const [file, ...codes] of sources) {
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
        save.run(ids[0], codes[0], session.no, meta.source_url, JSON.stringify(cues), cues.length,
          Math.max(...cues.map((c) => c.endMs)), bundle.collected_at);
        saveSummary.run(ids[0], md, meta.model, meta.prompt, statSync(path).mtime.toISOString());
        for (const id of ids) link.run(ids[0], id);
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
