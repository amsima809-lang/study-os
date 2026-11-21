-- Foreign keys are disabled by the migration runner during this transaction.
-- Preserve paper IDs because both attempts and recording permissions refer to them.
DROP TRIGGER course_mock_source_changed;
DROP TRIGGER course_mock_source_removed;
CREATE TABLE course_mock_papers_new (
  id INTEGER PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES courses(code),
  form_key TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL CHECK(model IN ('deepseek-v4-pro','openai-codex')),
  duration_min INTEGER NOT NULL CHECK(duration_min=150),
  question_count INTEGER NOT NULL CHECK(question_count > 0),
  questions TEXT NOT NULL CHECK(json_valid(questions) AND json_array_length(questions)=question_count),
  receipts TEXT NOT NULL CHECK(json_valid(receipts)),
  valid INTEGER NOT NULL DEFAULT 1 CHECK(valid IN (0,1)),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1) AND active <= valid),
  UNIQUE(course_code,form_key,version)
);
INSERT INTO course_mock_papers_new (id,course_code,form_key,version,content_hash,model,duration_min,question_count,questions,receipts,valid,active)
SELECT id,course_code,form_key,version,content_hash,model,duration_min,question_count,questions,receipts,valid,active FROM course_mock_papers;
DROP TABLE course_mock_papers;
ALTER TABLE course_mock_papers_new RENAME TO course_mock_papers;
CREATE UNIQUE INDEX course_mock_active_paper ON course_mock_papers(course_code,form_key) WHERE active=1;
CREATE TRIGGER course_mock_source_changed AFTER UPDATE OF cues,source_url,course_code,session_no ON shared_lecture_transcripts
WHEN NEW.cues <> OLD.cues OR NEW.source_url IS NOT OLD.source_url
  OR NEW.course_code <> OLD.course_code OR NEW.session_no <> OLD.session_no BEGIN
  UPDATE course_mock_papers SET valid=0,active=0 WHERE id IN
    (SELECT paper_id FROM course_mock_sources WHERE transcript_id=OLD.id);
END;
CREATE TRIGGER course_mock_source_removed BEFORE DELETE ON shared_lecture_transcripts BEGIN
  UPDATE course_mock_papers SET valid=0,active=0 WHERE id IN
    (SELECT paper_id FROM course_mock_sources WHERE transcript_id=OLD.id);
END;
