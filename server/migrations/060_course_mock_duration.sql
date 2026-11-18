-- A paper keeps its own exam length (POL2106's final is two hours; the others 150 minutes),
-- so duration_min is no longer pinned to 150. Same rebuild as 057: ids, rows, the active-paper
-- index and the source triggers are kept. Foreign keys are disabled by the migration runner.
DROP TRIGGER course_mock_source_changed;
DROP TRIGGER course_mock_source_removed;
CREATE TABLE course_mock_papers_new (
  id INTEGER PRIMARY KEY,
  course_code TEXT NOT NULL REFERENCES courses(code),
  form_key TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL CHECK(model IN ('deepseek-v4-pro','openai-codex')),
  duration_min INTEGER NOT NULL CHECK(duration_min BETWEEN 30 AND 240),
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

-- Attempts pinned the deadline to 150 minutes (9000000 ms). Rebuild with the deadline checked
-- against the paper's own length instead; ids, answers and scores are kept.
CREATE TABLE course_mock_attempts_new (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id INTEGER NOT NULL REFERENCES course_mock_papers(id),
  started_ms INTEGER NOT NULL,
  deadline_ms INTEGER NOT NULL CHECK(deadline_ms - started_ms BETWEEN 1800000 AND 14400000),
  finished_ms INTEGER,
  expired INTEGER NOT NULL DEFAULT 0 CHECK(expired IN (0,1)),
  score INTEGER,
  current_position INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 0,
  responses TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(responses)),
  CHECK((score IS NULL) = (finished_ms IS NULL))
);
INSERT INTO course_mock_attempts_new (id,user_id,paper_id,started_ms,deadline_ms,finished_ms,expired,score,current_position,revision,responses)
SELECT id,user_id,paper_id,started_ms,deadline_ms,finished_ms,expired,score,current_position,revision,responses FROM course_mock_attempts;
DROP TABLE course_mock_attempts;
ALTER TABLE course_mock_attempts_new RENAME TO course_mock_attempts;
CREATE INDEX course_mock_owner ON course_mock_attempts(user_id, paper_id, id);
CREATE INDEX course_mock_due ON course_mock_attempts(deadline_ms) WHERE finished_ms IS NULL;
CREATE TRIGGER course_mock_attempt_length BEFORE INSERT ON course_mock_attempts
WHEN NEW.deadline_ms <> NEW.started_ms + 60000 * (SELECT duration_min FROM course_mock_papers WHERE id=NEW.paper_id) BEGIN
  SELECT RAISE(ABORT, 'deadline must match the paper length');
END;
CREATE TRIGGER course_mock_attempt_length_kept BEFORE UPDATE OF started_ms,deadline_ms,paper_id ON course_mock_attempts
WHEN NEW.deadline_ms <> NEW.started_ms + 60000 * (SELECT duration_min FROM course_mock_papers WHERE id=NEW.paper_id) BEGIN
  SELECT RAISE(ABORT, 'deadline must match the paper length');
END;
