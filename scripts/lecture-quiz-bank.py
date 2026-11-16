"""Generate and install transcript-grounded Thai quiz banks. Keep all generated files outside git."""

import argparse
import fcntl
import hashlib
import json
import os
import random
import re
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from difflib import SequenceMatcher
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError
from urllib.parse import quote as encode_component
from urllib.request import Request, urlopen

MODEL = "deepseek-v4-pro"
VERSION = "lecture-quiz-v1"
SIZE = 25
PROMPT = Path(__file__).with_name("lecture-quiz-prompt.txt")


class UnconfirmedModelError(Exception):
    """A response without the required provider/model identity must never be used."""


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def canonical_cues(raw):
    # Match the existing saved-lecture importer's filter, sort order and JSON fields.
    return sorted(
        (
            {key: cue[key] for key in ("startMs", "endMs", "text")}
            for cue in raw
            if cue["text"].strip()
        ),
        key=lambda cue: cue["startMs"],
    )


def source_hash(cues):
    return hashlib.sha256(compact(cues).encode()).hexdigest()


def open_readonly(database):
    uri = Path(database).resolve().as_uri()
    for mode in ("ro", "rw"):
        db = sqlite3.connect(uri + "?mode=" + mode, uri=True, timeout=30)
        try:
            db.execute("PRAGMA query_only=ON")
            db.execute("PRAGMA schema_version").fetchone()
            return db
        except sqlite3.OperationalError as err:
            db.close()
            # A cleanly closed WAL database may need its shared-memory lock file initialized.
            if mode == "rw" or "unable to open database file" not in str(err):
                raise


def read_sources(notes=None, database=None):
    if database:
        connection = open_readonly(database)
        try:
            rows = connection.execute(
                "SELECT id,course_code,session_no,source_url,cues FROM shared_lecture_transcripts"
            )
            result = [
                {
                    **source_row(code, num, url, json.loads(cues)),
                    "shared_transcript_id": tid,
                }
                for tid, code, num, url, cues in rows
            ]
            rows = connection.execute(
                "SELECT id,user_id,course_code,session_no,source_url,cues FROM lecture_transcripts"
            )
            result += [
                {
                    **source_row(code, num, url, json.loads(cues)),
                    "private_transcript_id": tid,
                    "user_id": owner,
                }
                for tid, owner, code, num, url, cues in rows
            ]
            return result
        finally:
            connection.close()
    released = json.loads(
        (notes / "lecture-summary/summaries/manifest.json").read_text()
    )
    wanted = {meta["source_url"]: meta for meta in released.values()}
    result = []
    for file in sorted((notes / "transcripts/raw").glob("*.json")):
        bundle = json.loads(file.read_text())
        for session in bundle["sessions"]:
            meta = wanted.get(session["url"])
            if meta is None:
                continue
            if (
                meta["session_no"] != session["no"]
                or meta["course_codes"] != bundle["course_codes"]
            ):
                raise ValueError(
                    f"Manifest mismatch in {file.name}, lecture {session['no']}"
                )
            result.append(
                source_row(
                    bundle["course_codes"][0],
                    session["no"],
                    session["url"],
                    session["cues"],
                )
            )
    if len(result) != len(wanted) or len({row["source_url"] for row in result}) != len(
        wanted
    ):
        raise ValueError(
            "The published lecture manifest did not match the transcript collection"
        )
    return result


def source_row(code, num, url, raw):
    cues = canonical_cues(raw)
    if not cues:
        raise ValueError(f"{code} {num} has no transcript text")
    return {
        "course_code": code,
        "session_no": num,
        "source_url": url,
        "source_hash": source_hash(cues),
        "cues": cues,
    }


def name(row):
    prefix = (
        f"private_{row['private_transcript_id']}_"
        if "private_transcript_id" in row
        else ""
    )
    code = encode_component(row["course_code"], safe="")
    return prefix + f"{code}_L{row['session_no']:02d}"


def write_json(path, obj):
    with NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False
    ) as f:
        temporary = Path(f.name)
        try:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


@contextmanager
def bank_lock(folder, label):
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / (label + ".lock")).open("a") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        yield


def normalize(text):
    return "".join(
        char
        for char in text.casefold()
        if char.isalnum() or "\u0e00" <= char <= "\u0e7f"
    )


def similar(left, right):
    a, b = normalize(left), normalize(right)
    if a == b:
        return True
    if min(len(a), len(b)) < 0.74 * max(len(a), len(b)):
        return False
    return SequenceMatcher(None, a, b, autojunk=False).ratio() > 0.855


def source_quote(cues, index, quote):
    if type(index) is not int or not isinstance(quote, str):
        raise ValueError("missing original source cue or quote")
    quote = quote.strip()
    target = "".join(quote.split())
    if not (8 <= len(target) <= 320):
        raise ValueError("source quote length")
    # Preserve the original words, including qualifiers and negation. An exact phrase
    # from a neighboring cue takes precedence over text that sounds like the phrase.
    nearby = sorted(
        range(max(index - 4, 0), min(index + 5, len(cues))),
        key=lambda i: abs(index - i),
    )

    def locate(cue):
        text = cue["text"]
        positions = [i for i, char in enumerate(text) if not char.isspace()]
        start = "".join(text[i] for i in positions).find(target)
        if start >= 0:
            end = start + len(target) - 1
            return cue["startMs"], text[positions[start] : positions[end] + 1]
        return None

    for i in nearby:
        if hit := locate(cues[i]):
            return hit
    # A unique full-lecture match can resolve a transposed cue number.
    if len(target) >= 18:
        hits = [hit for cue in cues if (hit := locate(cue))]
        if len(hits) == 1:
            return hits[0]
    raise ValueError(
        "quote not in the cited transcript passage; copy one continuous phrase exactly"
    )


def plain(value, low, high):
    if not isinstance(value, str) or not low <= len(value.strip()) <= high:
        raise ValueError("missing or invalid question text")
    return value.strip()


def options_ok(options):
    if not isinstance(options, list) or len(options) != 4:
        raise ValueError("need four distinct answer options")
    if len({re.sub(r"\s+", " ", plain(o, 1, 600)).casefold() for o in options}) != 4:
        raise ValueError("need four distinct answer options")
    for option in options:
        plain(option, 1, 600)
        if re.match(r"^(?:[กขคง][.)]|[A-D][.)]|[1-4][.)]\s)", option) or re.search(
            r"^(?:ถูกทุกข้อ|ไม่มีข้อใดถูก|ถูกทั้งข้อ|all of the above|none of the above)$",
            option,
            re.IGNORECASE,
        ):
            raise ValueError("option label or giveaway answer")


def make_question(candidate, source, slot):
    stem = plain(candidate.get("stem"), 15, 1250)
    concept = plain(candidate.get("concept"), 2, 180)
    explanation = plain(candidate.get("explanation"), 15, 1100)
    if not re.search("[ก-๙]", stem) or not re.search("[ก-๙]", explanation):
        raise ValueError("question and explanation must be in Thai")
    if not isinstance(candidate.get("distractors"), list):
        raise ValueError("missing distractors")
    correct = plain(candidate.get("correct"), 1, 600)
    options = [correct] + [plain(o, 1, 600) for o in candidate["distractors"]]
    options_ok(options)
    cue_ms, quote = source_quote(
        source["cues"], candidate.get("cue"), candidate.get("quote")
    )
    # Balanced answer positions even for clients using the stored order.
    positions = list(range(4)) * 6 + [0]
    rnd = random.Random(source["source_hash"])
    rnd.shuffle(positions)
    position = positions[slot - 1]
    options = options[1:]
    random.Random(source["source_hash"] + stem).shuffle(options)
    options.insert(position, correct)
    return {
        "slot": slot,
        "concept": concept,
        "stem": stem,
        "options": options,
        "correct_index": position,
        "explanation": explanation,
        "evidence_ms": cue_ms,
        "evidence_quote": quote,
    }


def call_model(user, count, system=None):
    params = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system or PROMPT.read_text()},
            {"role": "user", "content": user},
        ],
        "temperature": 0.65,
        "max_tokens": 21800 if count > 10 else 11000,
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},
        "stream": True,
    }
    req = Request(
        "https://api.deepseek.com/chat/completions",
        data=compact(params).encode(),
        headers={
            "Authorization": "Bearer " + os.environ["DEEPSEEK_API_KEY"],
            "Content-Type": "application/json",
        },
    )
    parts, finish, model, response_id, usage = [], None, None, None, None
    with urlopen(req, timeout=540) as response:
        for line in response:
            line = line.decode().strip()
            if not line.startswith("data:") or line[5:].strip() == "[DONE]":
                continue
            packet = json.loads(line[5:])
            if packet.get("model"):
                if packet["model"] != MODEL:
                    raise UnconfirmedModelError(
                        f"unexpected provider model: {packet['model']}"
                    )
                model = packet["model"]
            response_id = packet.get("id") or response_id
            usage = packet.get("usage") or usage
            if packet.get("error"):
                raise RuntimeError("model stream error")
            for choice in packet.get("choices", []):
                if content := choice.get("delta", {}).get("content"):
                    parts.append(content)
                finish = choice.get("finish_reason") or finish
    if model != MODEL or not response_id:
        raise UnconfirmedModelError("missing provider model confirmation")
    if finish != "stop":
        raise ValueError(f"incomplete model response ({finish})")
    parsed = json.loads("".join(parts))
    if not isinstance(parsed.get("questions"), list):
        raise ValueError("model response has no questions")
    return parsed["questions"], {
        "model": model,
        "response_id": response_id,
        "usage": usage,
    }


def validate(bank, source):
    if (
        bank["source_hash"] != source["source_hash"]
        or bank["source_url"] != source["source_url"]
        or bank["course_code"] != source["course_code"]
        or bank["session_no"] != source["session_no"]
    ):
        raise ValueError("bank does not match transcript")
    if bank.get("private_transcript_id") != source.get(
        "private_transcript_id"
    ) or bank.get("user_id") != source.get("user_id"):
        raise ValueError("bank owner mismatch")
    if bank.get("prompt_version") != VERSION:
        raise ValueError("unexpected generation prompt version")
    if (
        bank.get("model") != MODEL
        or not bank.get("calls")
        or any(
            call.get("model") != MODEL or not call.get("response_id")
            for call in bank["calls"]
        )
    ):
        raise ValueError("bank missing confirmed Pro generation metadata")
    questions = bank["questions"]
    if len(questions) != SIZE or [q["slot"] for q in questions] != list(
        range(1, SIZE + 1)
    ):
        raise ValueError("bank must cover slots 1 through 25")
    cues = {}
    for cue in source["cues"]:
        cues.setdefault(cue["startMs"], []).append(cue["text"])
    for i, q in enumerate(questions):
        options_ok(q["options"])
        if type(q["correct_index"]) is not int or q["correct_index"] not in range(4):
            raise ValueError("invalid answer key")
        plain(q["concept"], 2, 180)
        plain(q["stem"], 15, 1250)
        plain(q["explanation"], 15, 1100)
        quote = plain(q["evidence_quote"], 8, 500)
        if not any(quote in text for text in cues.get(q["evidence_ms"], [])):
            raise ValueError(f"unverified citation in slot {i + 1}")
        if any(similar(q["stem"], other["stem"]) for other in questions[:i]):
            raise ValueError(f"repeated question in slot {i + 1}")


def length_giveaway(question):
    lengths = [len(normalize(option)) for option in question["options"]]
    correct = lengths.pop(question["correct_index"])
    return correct > max(lengths) * 1.4 and correct > max(lengths) + 12


def polish(source, out):
    """Make plausible alternatives comparable in length without changing the tested skill."""
    path = out / (name(source) + ".json")
    bank = json.loads(path.read_text())
    validate(bank, source)
    by_slot = {q["slot"]: q for q in bank["questions"]}

    def margin(q):
        sizes = [len(o.strip()) for o in q["options"]]
        correct = sizes.pop(q["correct_index"])
        return (correct - max(sizes)) / max(1, max(sizes))

    longest = sorted(
        (q for q in bank["questions"] if margin(q) > 0), key=margin, reverse=True
    )
    flagged = {
        q["slot"]: q
        for i, q in enumerate(longest)
        if length_giveaway(q) or i < len(longest) - 6
    }
    if not flagged:
        return "no length giveaways"

    instruction = """Edit Thai university assessment items using their supplied source. Return JSON
{"questions":[{"slot":12,"correct":"...","distractors":["...","...","..."],"explanation":"..."}]}.
Reproduce the input slot number. All assessment text must be Thai (preserve English when tested).
Keep each stem's intended correct meaning. One old option is visibly longer. Redesign its answer and
three plausible distractors using parallel structure and authentic misconceptions. Write a concise
correct option. For two distractors give a specific, plausible but wrong line of reasoning that is
slightly longer than the correct option. Avoid filler, extreme language and irrelevant alternatives.
For a grammatical or numerical item, preserve grammatical validity and comparable notation.
The explanation must describe the principle, without using answer numbers or letters."""
    items = {}
    for slot, q in flagged.items():
        support = next(
            cue["text"]
            for cue in source["cues"]
            if cue["startMs"] == q["evidence_ms"] and q["evidence_quote"] in cue["text"]
        )
        wrong = list(q["options"])
        right = wrong.pop(q["correct_index"])
        items[slot] = {
            "slot": slot,
            "stem": q["stem"],
            "right": right,
            "wrong": wrong,
            "explanation": q["explanation"],
            "evidence": support,
        }

    # When a batch misses a slot number or keeps the old clue, revise that one item
    # on its own. The single-item target is unambiguous even without a returned slot.
    groups = [list(items)]
    unresolved = set(items)
    for attempt in range(3):
        for slots in groups:
            drafts, meta = call_model(
                compact([items[s] for s in slots]), len(slots), instruction
            )
            bank["calls"].append(meta)
            for draft in drafts:
                slot = (
                    slots[0]
                    if len(slots) == 1 and len(drafts) == 1
                    else draft.get("slot")
                )
                if slot not in slots or slot not in unresolved:
                    continue
                q = by_slot[slot]
                try:
                    options = [plain(o, 1, 600) for o in draft["distractors"]]
                    options.insert(q["correct_index"], plain(draft["correct"], 1, 600))
                    options_ok(options)
                    change = {
                        **q,
                        "options": options,
                        "explanation": plain(draft["explanation"], 15, 1100),
                    }
                except (KeyError, TypeError, ValueError):
                    continue
                if margin(change) < 0:
                    q.update(change)
                    unresolved.remove(slot)
        if not unresolved:
            break
        groups = [[slot] for slot in sorted(unresolved)]
    validate(bank, source)
    write_json(path, bank)
    return f"balanced choices for {len(items) - len(unresolved)} items; unresolved {sorted(unresolved)}"


def generate(source, out, repairs):
    out.mkdir(parents=True, exist_ok=True)
    label = name(source)
    path = out / (label + ".json")
    bank = {k: v for k, v in source.items() if k != "cues"}
    bank.update(model=MODEL, prompt_version=VERSION, calls=[])
    current = {}
    if path.exists():
        prior = json.loads(path.read_text())
        if (
            prior["source_hash"] == source["source_hash"]
            and prior.get("model") == MODEL
            and prior.get("prompt_version") == VERSION
        ):
            validate(prior, source)
            if not repairs:
                return "already checked"
            bank["calls"] = list(prior["calls"])
            current = {
                q["slot"]: q for q in prior["questions"] if q["slot"] not in repairs
            }
    todo = [s for s in range(1, SIZE + 1) if s not in current]
    cues = source["cues"]
    transcript = "\n".join(f"[{i}] {cue['text'].strip()}" for i, cue in enumerate(cues))
    guidance = dict(repairs)
    for attempt in range(12):
        request = (
            f"วิชา {source['course_code']} คาบ {source['session_no']}. สร้าง {len(todo)} ข้อ. "
            "ให้คำตอบตามโครง JSON ที่กำหนดตามลำดับ เลือกหลักสำคัญตลอดคาบ กระจายจุดอ้างอิง "
            "โจทย์มีสถานการณ์การใช้จริงที่หลากหลาย กระชับ\n"
        )
        if current:
            request += (
                "ข้อที่มีแล้ว ห้ามสร้างซ้ำหรือถามด้วยทักษะ/สถานการณ์เดียวกัน:\n"
                + "\n".join(q["stem"] for q in current.values())
                + "\n"
            )
        if guidance:
            request += (
                "แก้ตามข้อสังเกตของผู้ตรวจ เรียงตามนี้ (ให้เปลี่ยนโจทย์เสียใหม่ถ้าจำเป็น):\n"
                + "\n".join(str(guidance.get(s, "สร้างข้อใหม่ที่ไม่ซ้ำ")) for s in todo)
                + "\n"
            )
        excerpt = transcript
        if attempt > 0:
            # The full recording was used on the first pass. Shorter numbered excerpts help
            # the model transcribe ASR evidence exactly during a replacement pass.
            width = min(len(cues), max(24, min(110, len(todo) * 7)))
            count = max(1, (len(cues) + width - 1) // width)
            coverage = {
                g: sum(
                    1
                    for q in current.values()
                    if cues[min(g * width, len(cues) - 1)]["startMs"]
                    <= q["evidence_ms"]
                    <= cues[min((g + 1) * width - 1, len(cues) - 1)]["startMs"]
                )
                for g in range(count)
            }
            group = min(
                range(count),
                key=lambda g: (
                    coverage[g] / min(width, len(cues) - g * width),
                    (g - attempt) % count,
                ),
            )
            begin = min(group * width, max(0, len(cues) - width))
            excerpt = "\n".join(
                f"[{i}] {cues[i]['text'].strip()}"
                for i in range(begin, min(len(cues), begin + width))
            )
            request += (
                "ใช้เฉพาะช่วงเสียงด้านล่าง เลือกหลักฐานที่อ่านได้ชัด คัดวลีสั้น ๆ โดยตรงจากช่วงที่เลือก\n"
            )
        request += "คำบรรยายพร้อมหมายเลขอ้างอิง:\n" + excerpt
        try:
            candidates, meta = call_model(request, len(todo))
            bank["calls"].append(meta)
            for s, item in zip(todo, candidates):
                try:
                    q = make_question(item, source, s)
                    if any(
                        similar(q["stem"], other["stem"]) for other in current.values()
                    ):
                        raise ValueError("near duplicate of another stem")
                    current[s] = q
                except (AttributeError, ValueError, TypeError) as error:
                    guidance[s] = " ".join(filter(None, (repairs.get(s), str(error))))
            todo = [s for s in todo if s not in current]
            if not todo:
                bank["questions"] = [current[s] for s in range(1, SIZE + 1)]
                validate(bank, source)
                write_json(path, bank)
                return "wrote 25"
            print(
                label,
                "repairing",
                len(todo),
                "items:",
                ", ".join(sorted({str(guidance.get(s, "missing"))[:80] for s in todo})),
                flush=True,
            )
        except (ValueError, OSError, RuntimeError) as error:
            if isinstance(error, HTTPError) and error.code in (400, 401, 402, 403, 404):
                raise
            print(
                label,
                "retry",
                attempt + 1,
                type(error).__name__,
                str(error)[:150],
                flush=True,
            )
            time.sleep(min(20, 2**attempt))
    raise RuntimeError(f"{label}: remaining slots {todo}")


def checked_banks(folder, sources):
    ready = []
    seen = {}
    for source in sources:
        label = name(source)
        bank = json.loads((folder / (label + ".json")).read_text())
        validate(bank, source)
        # Students can draw questions across lectures in a course. Changing only
        # the numbers in a calculation does not make it a new problem.
        scope = (source.get("user_id"), source["course_code"])
        course_stems = seen.setdefault(scope, [])
        for q in bank["questions"]:
            stem = normalize(re.sub(r"\d+(?:[.,]\d+)*", "0", q["stem"]))
            grams = {stem[i : i + 3] for i in range(len(stem) - 2)}
            for other_label, other_slot, other_stem, other_grams in course_stems:
                if label == other_label:
                    continue
                if min(len(stem), len(other_stem)) < 0.82 * max(
                    len(stem), len(other_stem)
                ):
                    continue
                if len(grams & other_grams) < 0.70 * max(len(grams), len(other_grams)):
                    continue
                if (
                    SequenceMatcher(None, stem, other_stem, autojunk=False).ratio()
                    >= 0.9
                ):
                    raise ValueError(
                        f"Repeated question across {other_label} slot {other_slot} and {label} slot {q['slot']}"
                    )
            course_stems.append((label, q["slot"], stem, grams))
        ready.append((source, bank))
    return ready


def import_banks(database, folder, sources, dry_run):
    """Verify the whole set before one atomic import. Re-runs preserve IDs and history."""
    columns = (
        "slot,stem,options,correct_index,explanation,evidence_ms,evidence_quote,concept"
    )
    ready = checked_banks(folder, sources)
    uri = Path(database).resolve().as_uri() + "?mode=rw"
    db = (
        open_readonly(database)
        if dry_run
        else sqlite3.connect(uri, uri=True, timeout=30)
    )
    new_count = matches = 0
    try:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN" if dry_run else "BEGIN IMMEDIATE")
        for source, bank in ready:
            private = "private_transcript_id" in source
            column = "private_transcript_id" if private else "shared_transcript_id"
            source_id = source[column]
            table = "lecture_transcripts" if private else "shared_lecture_transcripts"
            row = db.execute(
                f"SELECT course_code,session_no,source_url,cues FROM {table} WHERE id=?"
                + (" AND user_id=?" if private else ""),
                (source_id, source["user_id"]) if private else (source_id,),
            ).fetchone()
            if (
                not row
                or [row[0], row[1], row[2]]
                != [bank["course_code"], bank["session_no"], bank["source_url"]]
                or source_hash(canonical_cues(json.loads(row[3])))
                != bank["source_hash"]
            ):
                raise ValueError(f"Transcript changed before import of {name(source)}")
            existing = db.execute(
                f"SELECT id,source_hash,generator_model,prompt_version FROM lecture_quiz_banks WHERE {column}=?",
                (source_id,),
            ).fetchone()
            values = [
                (
                    q["slot"],
                    q["stem"],
                    compact(q["options"]),
                    q["correct_index"],
                    q["explanation"],
                    q["evidence_ms"],
                    q["evidence_quote"],
                    q["concept"],
                )
                for q in bank["questions"]
            ]
            meta = (bank["source_hash"], bank["model"], bank["prompt_version"])
            if existing:
                prior = db.execute(
                    f"SELECT {columns} FROM lecture_quiz_questions WHERE bank_id=? ORDER BY slot",
                    (existing[0],),
                ).fetchall()
                if existing[1:] == meta and prior == values:
                    matches += 1
                    continue
                # Replacing IDs referenced by an attempt would erase scores and missed-question history.
                used = db.execute(
                    "SELECT 1 FROM lecture_quiz_items i JOIN lecture_quiz_questions q ON q.id=i.question_id WHERE q.bank_id=? LIMIT 1",
                    (existing[0],),
                ).fetchone()
                if used:
                    raise ValueError(
                        f"Question bank {name(source)} has student attempts and different published questions"
                    )
                if not dry_run:
                    db.execute(
                        "DELETE FROM lecture_quiz_banks WHERE id=?", (existing[0],)
                    )
            if not dry_run:
                bank_id = db.execute(
                    f"INSERT INTO lecture_quiz_banks({column},source_hash,generator_model,prompt_version) VALUES (?,?,?,?)",
                    (source_id, *meta),
                ).lastrowid
                db.executemany(
                    f"INSERT INTO lecture_quiz_questions(bank_id,{columns}) VALUES (?,?,?,?,?,?,?,?,?)",
                    ((bank_id, *v) for v in values),
                )
            new_count += 1
        if dry_run:
            db.rollback()
        else:
            db.commit()
    finally:
        db.close()
    verb = "would install" if dry_run else "installed"
    print(
        f"{verb} {new_count} banks; {matches} identical; {len(ready) * SIZE} questions verified"
    )
    return new_count, matches


def process_source(action, source, output, repairs):
    with bank_lock(output, name(source)):
        if action == "polish":
            return polish(source, output)
        return generate(source, output, repairs)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("action", choices=["generate", "polish", "check", "import"])
    source = p.add_mutually_exclusive_group(required=True)
    source.add_argument("--notes-folder", type=Path)
    source.add_argument("--database", type=Path)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--workers", type=int, default=6)
    p.add_argument("--only", action="append", help="Name, e.g. MGT3204_L01")
    p.add_argument(
        "--repairs",
        type=Path,
        help='JSON object {bank_name: {"1":"review reason", ...}}; rebuild only listed slots',
    )
    p.add_argument(
        "--dry-run", action="store_true", help="Validate import without writing"
    )
    args = p.parse_args()
    if args.dry_run and args.action != "import":
        p.error("--dry-run applies only to import")
    if args.repairs and args.action != "generate":
        p.error("--repairs applies only to generation")
    sources = read_sources(args.notes_folder, args.database)
    if args.only:
        wanted = set(args.only)
        sources = [s for s in sources if name(s) in wanted]
        if {name(s) for s in sources} != wanted:
            p.error("unknown source in --only")
    if args.action in ("generate", "polish"):
        repairs = json.loads(args.repairs.read_text()) if args.repairs else {}
        if args.repairs:
            if not isinstance(repairs, dict) or any(
                not isinstance(slots, dict)
                or any(
                    str(k) not in {str(n) for n in range(1, SIZE + 1)}
                    or not isinstance(v, str)
                    for k, v in slots.items()
                )
                for slots in repairs.values()
            ):
                p.error("invalid repair list or slot")
            if not set(repairs).issubset({name(s) for s in sources}):
                p.error("unknown repair source")
            sources = [s for s in sources if name(s) in repairs]
        if not os.environ.get("DEEPSEEK_API_KEY"):
            p.error("set DEEPSEEK_API_KEY for generation")
        failures = []
        with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 24))) as pool:
            jobs = {
                pool.submit(
                    process_source,
                    args.action,
                    s,
                    args.output,
                    {int(k): v for k, v in repairs.get(name(s), {}).items()},
                ): name(s)
                for s in sources
            }
            for future in as_completed(jobs):
                try:
                    print(jobs[future], future.result(), flush=True)
                except Exception as err:
                    failures.append(jobs[future])
                    print(jobs[future], type(err).__name__, str(err), flush=True)
        if failures:
            raise SystemExit(f"Failed: {', '.join(failures)}")
    elif args.action == "check":
        checked_banks(args.output, sources)
        print(f"Verified {len(sources)} banks, {len(sources) * SIZE} questions")
    else:
        if not args.database:
            p.error("import requires --database")
        import_banks(args.database, args.output, sources, args.dry_run)


if __name__ == "__main__":
    main()
