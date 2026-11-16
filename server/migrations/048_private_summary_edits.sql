-- The active summary remains the text used throughout study, search and export.
-- Keep the model's version when the author starts a personal edit.
ALTER TABLE notes ADD COLUMN ai_summary_original_md TEXT;
