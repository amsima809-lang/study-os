-- A manual rewrite takes precedence over the page readings that it replaced.
-- Other pages of the same note can still contribute their words when ready.
ALTER TABLE sketch_pages ADD COLUMN text_replaced INTEGER NOT NULL DEFAULT 0 CHECK (text_replaced IN (0, 1));
