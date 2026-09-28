-- AI-generated fields that don't fit the original notes columns.
ALTER TABLE notes ADD COLUMN ai_terms_json TEXT;   -- JSON: [{term, definition}]
ALTER TABLE notes ADD COLUMN ai_topics_json TEXT;  -- JSON: ["tag", ...]
