"""Offline authoring/import regression tests with synthetic, non-course material."""

import copy
import hashlib
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).with_name("lecture-quiz-bank.py")
SPEC = importlib.util.spec_from_file_location("lecture_quiz_bank", SOURCE)
quiz = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(quiz)


class QuizBankTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.db = self.folder / "test.sqlite"
        schema = (
            SOURCE.parent.parent / "server/migrations/054_lecture_quizzes.sql"
        ).read_text()
        self.cues = [
            {
                "text": "เมื่อย้ายวัตถุจากกล่องหนึ่งไปอีกกล่อง จำนวนรวมจะเท่าเดิม",
                "startMs": 1000,
                "endMs": 9000,
            }
        ]
        with sqlite3.connect(self.db) as conn:
            conn.executescript("""CREATE TABLE users(id TEXT PRIMARY KEY);
                CREATE TABLE courses(code TEXT PRIMARY KEY);
                CREATE TABLE shared_lecture_transcripts(id INTEGER PRIMARY KEY, course_code TEXT,
                  session_no INTEGER, source_url TEXT, cues TEXT);
                CREATE TABLE lecture_transcripts(id INTEGER PRIMARY KEY, user_id TEXT, course_code TEXT,
                  session_no INTEGER, source_url TEXT, cues TEXT);""")
            conn.executescript(schema)
            conn.executescript((SOURCE.parent.parent / "server/migrations/058_lecture_quiz_exhibits.sql").read_text())
            conn.execute("INSERT INTO users VALUES ('student')")
            conn.execute("INSERT INTO courses VALUES ('TEST')")
            conn.execute(
                "INSERT INTO shared_lecture_transcripts VALUES (3,'TEST',1,'fixture:shared',?)",
                (json.dumps(self.cues),),
            )
            conn.execute(
                "INSERT INTO lecture_transcripts VALUES (8,'student','TEST',2,'fixture:private',?)",
                (json.dumps(self.cues),),
            )
        self.sources = quiz.read_sources(database=self.db)
        self.banks = []
        for source in self.sources:
            questions = []
            for slot in range(1, 26):
                # Unique synthetic texts keep these fixtures independent of real course material.
                uid = hashlib.sha256(f"{quiz.name(source)}-{slot}".encode()).hexdigest()
                questions.append(
                    quiz.make_question(
                        {
                            "stem": f"ตรวจรายการตัวอย่าง {uid} แล้วจำนวนวัตถุเป็นอย่างไร",
                            "concept": "การนับ",
                            "correct": "เท่ากับจำนวนเดิม",
                            "distractors": ["เหลือหนึ่งชิ้น", "เพิ่มหนึ่งชิ้น", "ลดลงหนึ่งชิ้น"],
                            "explanation": "การย้ายภาชนะไม่ได้เพิ่มหรือลดจำนวนวัตถุ",
                            "cue": 0,
                            "quote": "จำนวนรวมจะเท่าเดิม",
                        },
                        source,
                        slot,
                    )
                )
            bank = {k: v for k, v in source.items() if k != "cues"}
            bank.update(
                model=quiz.MODEL,
                prompt_version=quiz.VERSION,
                calls=[{"model": quiz.MODEL, "response_id": "fixture"}],
                questions=questions,
            )
            self.banks.append(bank)
            self.save(source, bank)

    def save(self, source, bank):
        quiz.write_json(self.folder / (quiz.name(source) + ".json"), bank)

    def install(self, dry=False):
        return quiz.import_banks(self.db, self.folder, self.sources, dry)

    def test_exact_complete_quote_beats_nearby_partial_match(self):
        common = "กรณีที่กำลังพิจารณานี้มีผลต่อจำนวนเงิน"
        cues = [
            {"text": common + " โดยไม่มีข้อยกเว้น", "startMs": 0},
            {"text": common + " เมื่อมีเงื่อนไขเพิ่มเติม", "startMs": 12},
        ]
        self.assertEqual(
            quiz.source_quote(cues, 0, cues[1]["text"]), (12, cues[1]["text"])
        )
        with self.assertRaisesRegex(ValueError, "quote not in"):
            quiz.source_quote(cues, 0, common + " ข้อความที่แต่งขึ้น")

    def test_requires_model_evidence_valid_key_and_current_prompt(self):
        source, bank = self.sources[0], self.banks[0]
        for field, value in (
            ("calls", [{"model": "wrong", "response_id": "fixture"}]),
            ("prompt_version", "old"),
        ):
            with self.subTest(field=field), self.assertRaises(ValueError):
                quiz.validate({**bank, field: value}, source)
        for field, value in (
            ("correct_index", 4),
            ("evidence_quote", "ข้อความที่แต่งขึ้น"),
            ("options", ["A", "B", "A", "C"]),
        ):
            change = copy.deepcopy(bank)
            change["questions"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                quiz.validate(change, source)
        with self.assertRaisesRegex(ValueError, "owner mismatch"):
            quiz.validate({**self.banks[1], "user_id": "other"}, self.sources[1])

    def test_dry_run_and_repeated_import_preserve_results(self):
        self.assertEqual(self.install(True), (2, 0))
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(
                conn.execute("SELECT count(*) FROM lecture_quiz_banks").fetchone()[0], 0
            )
        self.assertEqual(self.install(), (2, 0))
        with sqlite3.connect(self.db) as conn:
            qid = conn.execute("SELECT min(id) FROM lecture_quiz_questions").fetchone()[
                0
            ]
            conn.execute(
                "INSERT INTO lecture_quiz_attempts(id,user_id,course_code,session_no,slot,initial,score) VALUES(1,'student','TEST',1,1,1,1)"
            )
            conn.execute(
                "INSERT INTO lecture_quiz_items VALUES (1,?,0,'[0,1,2,3]',0)", (qid,)
            )
        self.assertEqual(self.install(), (0, 2))
        self.banks[0]["questions"][0]["explanation"] += " จากเงื่อนไขที่กำหนดไว้"
        self.save(self.sources[0], self.banks[0])
        with self.assertRaisesRegex(ValueError, "student attempts"):
            self.install()
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(
                conn.execute("SELECT question_id FROM lecture_quiz_items").fetchone(),
                (qid,),
            )

    def test_reviewed_revision_preserves_ids_and_rejects_stale_baseline(self):
        self.install()
        original = self.folder / "prior"
        original.mkdir()
        for src, bank in zip(self.sources, self.banks):
            quiz.write_json(original / (quiz.name(src) + ".json"), bank)
        q = self.banks[0]["questions"][0]
        q["stimulus"] = {"kind": "table", "title": "Counts", "text": "", "columns": ["Side", "Count"],
                         "rows": [["Left", "2"], ["Right", "3"]]}
        self.save(self.sources[0], self.banks[0])
        def revise(dry=False):
            return quiz.import_banks(self.db, self.folder, self.sources, dry, original)
        with sqlite3.connect(self.db) as db:
            old_ids = db.execute("SELECT id FROM lecture_quiz_questions ORDER BY id").fetchall()
            qid = old_ids[0][0]
            db.execute("INSERT INTO lecture_quiz_attempts(id,user_id,course_code,session_no,slot,initial) VALUES(1,'student','TEST',1,1,1)")
            db.execute("INSERT INTO lecture_quiz_items VALUES(1,?,0,'[0,1,2,3]',NULL)", (qid,))
        self.assertEqual(revise(True), (1, 1))
        self.assertEqual(revise(), (1, 1))
        self.assertEqual(revise(), (0, 2))
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute("SELECT id FROM lecture_quiz_questions ORDER BY id").fetchall(), old_ids)
            self.assertEqual(db.execute("SELECT stimulus FROM lecture_quiz_item_snapshots WHERE question_id=?", (qid,)).fetchone(), (None,))
            db.execute("UPDATE lecture_quiz_questions SET explanation='Another published edit' WHERE id=?", (qid,))
        with self.assertRaisesRegex(ValueError, "reviewed baseline"):
            revise()

    def test_concurrent_source_change_rolls_back_batch(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("UPDATE lecture_transcripts SET cues='[]' WHERE id=8")
        with self.assertRaisesRegex(ValueError, "Transcript changed"):
            self.install()
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(
                conn.execute("SELECT count(*) FROM lecture_quiz_banks").fetchone()[0], 0
            )

    def test_detects_number_substitution_across_lectures(self):
        source = {**self.sources[0], "source_url": "fixture:second", "session_no": 3}
        partner = {
            **self.banks[0],
            "session_no": 3,
            "source_url": "fixture:second",
            "questions": copy.deepcopy(self.banks[1]["questions"]),
        }
        stem = "หากร้านหนึ่งได้รับเงิน 2400 บาท จากนั้นยังเหลือลูกหนี้อย่างไร"
        self.banks[0]["questions"][0]["stem"] = stem
        partner["questions"][0]["stem"] = stem.replace("2400", "5800")
        self.save(self.sources[0], self.banks[0])
        self.save(source, partner)
        with self.assertRaisesRegex(ValueError, "Repeated question"):
            quiz.checked_banks(self.folder, [self.sources[0], source])


if __name__ == "__main__":
    unittest.main()
