-- Phase 1: document upload, text extraction, chapters, enhanced quiz.
-- Preserves ALL existing data — only adds new tables and new columns.

-- ---------- Uploaded documents ----------
CREATE TABLE IF NOT EXISTS materials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code   TEXT NOT NULL REFERENCES courses(code),
  filename      TEXT NOT NULL,
  file_type     TEXT NOT NULL CHECK (file_type IN ('pdf','image','text')),
  material_kind TEXT NOT NULL DEFAULT 'textbook' CHECK (material_kind IN ('textbook','past_exam','notes','other')),
  file_path     TEXT NOT NULL,
  file_size     INTEGER NOT NULL DEFAULT 0,
  total_pages   INTEGER,
  pages_done    INTEGER NOT NULL DEFAULT 0,
  upload_status TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending','processing','done','error')),
  error_message TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_code);

-- ---------- Per-page extracted text ----------
CREATE TABLE IF NOT EXISTS material_pages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id       INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  page_num          INTEGER NOT NULL,
  extracted_text    TEXT,
  extraction_method TEXT CHECK (extraction_method IN ('pdf_text','ai_ocr','manual')),
  confidence        REAL,
  image_path        TEXT,
  created_at        TEXT NOT NULL,
  UNIQUE(material_id, page_num)
);

CREATE INDEX IF NOT EXISTS idx_material_pages_material ON material_pages(material_id);

-- ---------- Chapters / topics per course ----------
CREATE TABLE IF NOT EXISTS chapters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code   TEXT NOT NULL REFERENCES courses(code),
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  ai_suggested  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chapters_course ON chapters(course_code);

-- ---------- Content chunks linked to chapter + page range ----------
CREATE TABLE IF NOT EXISTS material_chunks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id    INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  material_id   INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  start_page    INTEGER NOT NULL,
  end_page      INTEGER NOT NULL,
  content_text  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_chapter ON material_chunks(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chunks_material ON material_chunks(material_id);

-- ---------- Extend questions table for source tracking ----------
ALTER TABLE questions ADD COLUMN source TEXT NOT NULL DEFAULT 'ai_generated'
  CHECK (source IN ('ai_generated','past_exam','manual'));
ALTER TABLE questions ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 2
  CHECK (difficulty BETWEEN 1 AND 3);
ALTER TABLE questions ADD COLUMN explanation_th TEXT;
ALTER TABLE questions ADD COLUMN chapter_id INTEGER REFERENCES chapters(id);
ALTER TABLE questions ADD COLUMN source_ref TEXT;
