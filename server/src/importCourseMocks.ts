import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import type { DB } from "./db.js";

const counts = { ACC1101: 80, MGT3204: 100, RAM1103: 120, RAM1132: 120 } as const;
const linkedFormats = {
  ACC1101: ["case", "table"], MGT3204: ["case", "grid"],
  RAM1103: ["passage", "poster"], RAM1132: ["record", "table", "passage"],
} as const;
const model = "deepseek-v4-pro";
const nonempty = z.string().trim().min(1);
const positiveInt = z.number().int().positive();
const stimulus = z.object({
  id: nonempty, kind: z.enum(["case", "table", "grid", "poster", "passage", "record"]),
  title: z.string(), text: z.string(), columns: z.array(z.string()), rows: z.array(z.array(z.string())),
});
const question = z.object({
  position: positiveInt, session_no: positiveInt, source_url: nonempty, source_hash: z.string().regex(/^[a-f0-9]{64}$/),
  evidence_ms: z.number().int().nonnegative(), evidence_quote: nonempty, concept: nonempty,
  stimulus: stimulus.nullable(), stem: nonempty, options: z.array(nonempty).length(4),
  correct_index: z.number().int().min(0).max(3), explanation: nonempty,
});
const paperSchema = z.object({
  course_code: z.enum(["ACC1101", "MGT3204", "RAM1103", "RAM1132"]),
  form_key: nonempty, version: nonempty, model: z.literal(model), duration_min: z.literal(150),
  question_count: positiveInt, questions: z.array(question),
  sources: z.array(z.object({ session_no: positiveInt, source_url: nonempty, source_hash: z.string().regex(/^[a-f0-9]{64}$/) })).min(1),
  receipts: z.array(z.object({
    model: z.literal(model), response_id: nonempty, role: z.enum(["author", "blind_review"]),
  }).passthrough()).min(2),
});
export type CourseMockQuestion = z.infer<typeof question>;
type Cue = { startMs: number; endMs: number; text: string };
type Recording = { id: number; session_no: number; source_url: string; cues: string };
const key = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function validatePaper(db: DB, raw: unknown) {
  const paper = paperSchema.parse(raw);
  const code = paper.course_code;
  if (paper.question_count !== counts[code] || paper.questions.length !== counts[code]) {
    throw new Error(`${code}: expected ${counts[code]} questions`);
  }
  if (new Set(paper.receipts.map((receipt) => receipt.role)).size !== 2 ||
    new Set(paper.receipts.map((receipt) => receipt.response_id)).size !== paper.receipts.length) {
    throw new Error(code + ": expected separate generation and blind-review receipts");
  }
  const sources = db.prepare("SELECT id,session_no,source_url,cues FROM shared_lecture_transcripts WHERE course_code=?")
    .all(code) as Recording[];
  const recordings = new Map(sources.map((source) => {
    const cues = (JSON.parse(source.cues) as Cue[]).filter((c) => c.text.trim())
      .sort((a, b) => a.startMs - b.startMs).map(({ startMs, endMs, text }) => ({ startMs, endMs, text }));
    return [source.session_no, { ...source, cues, hash: sha(JSON.stringify(cues)) }];
  }));
  const practice = db.prepare(`SELECT q.stem FROM lecture_quiz_questions q
    JOIN lecture_quiz_banks b ON b.id=q.bank_id JOIN shared_lecture_transcripts t ON t.id=b.shared_transcript_id
    WHERE t.course_code=?`).all(code) as { stem: string }[];
  const seen = new Set(practice.map((q) => key(q.stem)));
  const used = new Set<number>();
  const stimuli = new Map<string, string>();
  const sharedFormats = new Set<string>();
  for (const [index, q] of paper.questions.entries()) {
    const where = `${code}, question ${index + 1}`;
    if (q.position !== index + 1 || seen.has(key(q.stem)) || new Set(q.options.map(key)).size !== 4) {
      throw new Error(where + ": invalid position or duplicated question/choice");
    }
    seen.add(key(q.stem));
    const source = recordings.get(q.session_no);
    if (!source || source.source_url !== q.source_url || source.hash !== q.source_hash
      || !source.cues.some((c) => c.startMs === q.evidence_ms && c.text.includes(q.evidence_quote))) {
      throw new Error(where + ": recording, fingerprint or transcript citation does not match");
    }
    used.add(source.id);
    if (q.stimulus) {
      const s = q.stimulus;
      if ((!s.text.trim() && !s.rows.length) || s.rows.some((r) => r.length !== s.columns.length)
        || ((s.kind === "table" || s.kind === "grid") && (!s.rows.length || !s.columns.length))) {
        throw new Error(where + ": incomplete stimulus");
      }
      const previous = stimuli.get(s.id);
      if (previous && (previous !== JSON.stringify(s) || paper.questions[index-1]?.stimulus?.id !== s.id)) {
        throw new Error(where + ": linked stimulus changed or is out of sequence");
      }
      if (previous) sharedFormats.add(s.kind);
      stimuli.set(s.id, JSON.stringify(s));
    }
  }
  if (!linkedFormats[code].every((kind) => sharedFormats.has(kind))) {
    throw new Error(code + ": incomplete course-specific linked question formats");
  }
  if (used.size !== recordings.size) throw new Error(code + ": paper omits a released lecture");
  const declared = new Set<number>();
  for (const s of paper.sources) {
    const src = recordings.get(s.session_no);
    if (!src || src.hash !== s.source_hash || src.source_url !== s.source_url || !used.has(src.id) || declared.has(src.id)) {
      throw new Error(code + ": source manifest does not match the questions and available recordings");
    }
    declared.add(src.id);
  }
  if (declared.size !== used.size) throw new Error(code + ": missing recording in source manifest");
  // The private publisher seals the final option order and key after blind review.
  // Reproduce its compact UTF-8 serialization before schema normalization.
  const sealed = sha(JSON.stringify((raw as { questions: unknown[] }).questions));
  if (paper.version !== paper.form_key + "-" + sealed.slice(0, 16)) {
    throw new Error(code + ": question fingerprint differs from the reviewed edition");
  }
  return { paper, sourceIds: [...used], hash: sha(JSON.stringify(paper.questions)) };
}

/** One transaction publishes the complete set. Validation and a dry run never publish a partial set. */
export function importCourseMocks(db: DB, raws: unknown[], dryRun = false) {
  const apply = db.transaction(() => {
    const forms = raws.map((raw) => validatePaper(db, raw));
    if (forms.length !== Object.keys(counts).length || new Set(forms.map((f) => f.paper.course_code)).size !== forms.length) {
      throw new Error("Expected one complete paper for each of the four courses");
    }
    const existing = db.prepare(`SELECT id,content_hash,active FROM course_mock_papers
      WHERE course_code=? AND form_key=? AND version=?`);
    const insert = db.prepare(`INSERT INTO course_mock_papers(course_code,form_key,version,content_hash,model,duration_min,question_count,questions,receipts)
      VALUES(?,?,?,?,?,?,?,?,?)`);
    return forms.map(({ paper, sourceIds, hash }) => {
      const { course_code, form_key, version, question_count } = paper;
      const old = existing.get(course_code, form_key, version) as { id: number; content_hash: string; active: number } | undefined;
      if (old && old.content_hash !== hash) throw new Error(course_code + ": this version already identifies different questions");
      if (!dryRun && !old?.active) {
        const id = old?.id ?? Number(insert.run(course_code, form_key, version, hash, model, paper.duration_min, question_count,
          JSON.stringify(paper.questions), JSON.stringify(paper.receipts)).lastInsertRowid);
        db.prepare("DELETE FROM course_mock_sources WHERE paper_id=?").run(id);
        const link = db.prepare("INSERT INTO course_mock_sources(paper_id,transcript_id) VALUES(?,?)");
        for (const tid of sourceIds) link.run(id, tid);
        db.prepare("UPDATE course_mock_papers SET active=0 WHERE course_code=? AND active=1").run(course_code);
        db.prepare("UPDATE course_mock_papers SET active=1,valid=1 WHERE id=?").run(id);
      }
      return { course_code, form_key, version, question_count, recordings: sourceIds.length, already_active: Boolean(old?.active) };
    });
  });
  return dryRun ? apply.deferred() : apply.immediate();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { database: { type: "string" }, papers: { type: "string" }, "dry-run": { type: "boolean" } } });
  if (!values.database || !values.papers) throw new Error("Usage: --database <migrated SQLite database> --papers <private papers directory> [--dry-run]");
  const raws = Object.keys(counts).map((code) => JSON.parse(readFileSync(join(values.papers!, code + ".json"), "utf8")) as unknown);
  const db = new Database(values.database, { fileMustExist: true, readonly: Boolean(values["dry-run"]) });
  db.pragma("foreign_keys=ON");
  try { console.log(importCourseMocks(db, raws, values["dry-run"])); } finally { db.close(); }
}
