ALTER TABLE lecture_quiz_questions ADD COLUMN stimulus TEXT
  CHECK (stimulus IS NULL OR (json_valid(stimulus) AND json_type(stimulus) = 'object'));

-- An attempt keeps the wording and grading it opened with. New retakes draw the
-- revised item with its stable question ID, so misses and progress still apply.
CREATE TABLE lecture_quiz_item_snapshots (
  attempt_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  stem TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  evidence_ms INTEGER NOT NULL,
  evidence_quote TEXT NOT NULL,
  stimulus TEXT,
  PRIMARY KEY (attempt_id, question_id),
  FOREIGN KEY (attempt_id, question_id) REFERENCES lecture_quiz_items(attempt_id, question_id) ON DELETE CASCADE
);

CREATE TRIGGER lecture_quiz_snapshot_before_revision
BEFORE UPDATE OF stem, options, correct_index, explanation, evidence_ms, evidence_quote, stimulus ON lecture_quiz_questions
BEGIN
  INSERT INTO lecture_quiz_item_snapshots
    (attempt_id, question_id, stem, options, correct_index, explanation, evidence_ms, evidence_quote, stimulus)
  SELECT i.attempt_id, OLD.id, OLD.stem, OLD.options, OLD.correct_index, OLD.explanation,
    OLD.evidence_ms, OLD.evidence_quote, OLD.stimulus
  FROM lecture_quiz_items i WHERE i.question_id = OLD.id
  ON CONFLICT (attempt_id, question_id) DO NOTHING;
END;
