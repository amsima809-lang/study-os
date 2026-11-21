-- A URL-less private reimport can replace the contents in the same catalogue slot.
ALTER TABLE lecture_transcripts ADD COLUMN annotation_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lecture_annotations ADD COLUMN source TEXT NOT NULL DEFAULT 'summary' CHECK (source IN ('summary','transcript'));
ALTER TABLE lecture_annotations ADD COLUMN recording_key TEXT NOT NULL DEFAULT '';
ALTER TABLE lecture_annotations ADD COLUMN block_key TEXT;
ALTER TABLE lecture_annotations ADD COLUMN ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','ready','failed'));
ALTER TABLE lecture_annotations ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0;
-- A raster editor may update a native drawing's image without being able to edit its vectors.
ALTER TABLE lecture_annotations ADD COLUMN raster_edited INTEGER NOT NULL DEFAULT 0;
-- Before this release runs were stored only after the student approved or wrote them.
UPDATE lecture_annotations SET ocr_status='ready', reviewed=1 WHERE runs != '[]';
