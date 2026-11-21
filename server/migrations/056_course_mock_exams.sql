-- Complete, independently authored private papers. Existing attempts stay bound
-- to their original question order, stimuli and key when a new edition arrives.
CREATE TABLE course_mock_papers (
  id INTEGER PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES courses(code),
  form_key TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL CHECK(model='deepseek-v4-pro'),
  duration_min INTEGER NOT NULL CHECK(duration_min=150),
  question_count INTEGER NOT NULL CHECK(question_count > 0),
  questions TEXT NOT NULL CHECK(json_valid(questions) AND json_array_length(questions)=question_count),
  receipts TEXT NOT NULL CHECK(json_valid(receipts)),
  valid INTEGER NOT NULL DEFAULT 1 CHECK(valid IN (0,1)),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1) AND active <= valid),
  UNIQUE(course_code, form_key, version)
);
CREATE UNIQUE INDEX course_mock_active_paper ON course_mock_papers(course_code) WHERE active=1;
CREATE TABLE course_mock_sources (
  paper_id INTEGER NOT NULL REFERENCES course_mock_papers(id) ON DELETE CASCADE,
  transcript_id INTEGER NOT NULL REFERENCES shared_lecture_transcripts(id) ON DELETE CASCADE,
  PRIMARY KEY (paper_id,transcript_id)
);
CREATE INDEX course_mock_source_links ON course_mock_sources(transcript_id);
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

CREATE TABLE course_mock_attempts (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id INTEGER NOT NULL REFERENCES course_mock_papers(id),
  started_ms INTEGER NOT NULL,
  deadline_ms INTEGER NOT NULL CHECK(deadline_ms=started_ms+9000000),
  finished_ms INTEGER,
  expired INTEGER NOT NULL DEFAULT 0 CHECK(expired IN (0,1)),
  score INTEGER,
  current_position INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 0,
  responses TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(responses)),
  CHECK((score IS NULL) = (finished_ms IS NULL))
);
CREATE INDEX course_mock_owner ON course_mock_attempts(user_id, paper_id, id);
CREATE INDEX course_mock_due ON course_mock_attempts(deadline_ms) WHERE finished_ms IS NULL;
