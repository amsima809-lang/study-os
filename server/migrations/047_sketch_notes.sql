CREATE TABLE sketch_pages (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  image_index INTEGER NOT NULL CHECK (image_index >= 0),
  stroke_bounds TEXT,
  document_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (note_id, image_index)
);
