# Photo notes plan: camera and gallery photos → ordered notes (tested 2026-11-16, not built)

Owner's request: in the note feature's camera mode the student can take photos, or pick one or several
from the gallery; the app transcribes them **in order** (time taken, else the file names' sequence) and
**removes content repeated across overlapping photos**; the notes go into a particular lecture's notes.

## What was tested

Six photos of ACC1103 slides (owner's examples, saved through LINE). LINE kept an EXIF block but **no
DateTimeOriginal**; the files' dates were the download time; EXIF Orientation was 6 (rotate 90°). Each
photo shows the same slide twice (a large screen and a small one).

| Approach | Result |
|---|---|
| DeepSeek V4 Flash reads all 6 photos at once | Invented a slide title ("ส่วนประกอบของงบการเงิน" for "หมวดหมู่บัญชี") and a lecturer's name; paraphrased a definition. **Not acceptable.** |
| DeepSeek reads each photo alone, max effort | Worse: wrong titles and names on most slides. |
| **Apple Vision text recognition** (`VNRecognizeTextRequest`, accurate, `th-TH` + `en-US`) | Every slide read correctly (one English slip, "LTABILITIES"). The small second screen comes out garbled, which helps spot the duplicate. |
| **Apple Vision text + one DeepSeek call** (text with positions + the photos; words only from the recognised text, photos for layout) | **Correct notes in ~21 s:** one section per slide, lists, definitions, a formula, the ASSETS tree as a diagram, ⭐ จำ kept, `(รูป N)` source per section, duplicates and toolbar text dropped, English slips fixed. One useful question: photo 6 (the definition slide) probably belongs before photos 4–5. |

Rule from this: **text from a dedicated recogniser, structure from DeepSeek.** DeepSeek never supplies the words.

## How to build it

1. **Picking.** Camera (several shots in a row) and gallery single or multi-select (`<input type="file" multiple accept="image/*">`; in the iOS app a native picker so the capture date survives).
2. **Order.** EXIF DateTimeOriginal, read on the device before upload → the number in the file name (e.g. `S__4587587`) → `File.lastModified` → the order picked. Show an order strip with which signal was used ("เรียงตามชื่อไฟล์ (รูปไม่มีเวลาถ่าย)"); she drags to fix it before anything is read. Respect EXIF orientation everywhere.
3. **Text.** Apple Vision: on the device in the iOS app (a small Capacitor plugin, like `AppInk`), or on the server, since the Mac mini runs macOS: `scripts/photo-ocr/ocr.swift` (build with `swiftc -O scripts/photo-ocr/ocr.swift -o ocr`; prints one JSON line per image with each text line's string, confidence and position, honouring EXIF orientation).
4. **Notes.** One DeepSeek V4 Flash call (`reasoning_effort: "high"`, JSON mode, **streamed**): per photo, the recognised lines with positions plus the photo. Instructions: take every word from the recognised text; use the image only for layout (boxes, arrows, lists, emphasis); fix only obvious English letter slips; keep the large copy when a photo shows the same text twice; merge content repeated across consecutive photos and say which photos each section came from; at most 3 yes/no questions (unreadable text, an order that looks wrong). The tested prompt and outputs are in the private shared notes folder under `photo-notes/`.
5. **Show and save.** The order strip (with a suggested move when the model thinks the order is wrong), the AI banner, then each section with **its source photo(s) next to the notes** (owner 2026-11-16: next to the notes, not at the bottom): a column of about 240 px beside the section on an iPad or computer (sticky while the section scrolls), a small thumbnail at the right of the section on a phone. Tapping a photo (or a `รูป N` chip) opens a full-screen gallery (←/→). Saved to the chosen course and lecture.

## Putting photo notes into the lecture summary (owner 2026-11-16, prototyped)

"let the user select the notes and allow them to insert them inline to the summary by drawing an arrow to the spot they want it inserted, or select content from multiple pictures and merge them into one card. then merged cards can be inserted into summaries as well."

Prototype (private notes folder, `photo-notes/view/insert.html`, on the ACC1101 lecture 2 summary + the six ACC1103 photo cards; checked with simulated pen gestures at iPad landscape size):
- The lecture summary on the left, her photo-note cards (each with its photo) on the right; on a phone they stack.
- **Tap** a card to select it (several can be selected). **Merge** joins the selected cards into one card: title "A + B", every part kept under its own heading, sources = all their photos; the originals are dimmed as used. In the app the merge should be one text-only DeepSeek call that removes repeated lines and orders the parts (the prototype only joins them).
- **Draw an arrow** (pen, or a finger/mouse drag) from a card to a point in the summary: while drawing, the summary line it will land next to is outlined; on release the card is inserted after that line (before it when released on its upper half). With several cards selected, dragging one inserts all of them in order.
- An inserted card is marked "📷 จากรูปของคุณ · รูป N" in the accent colour with its photo(s) and a remove button, so her material never looks like AI text.
- To build: store insertions as (summary id, the anchor line's text/position, card id) per student, since the shared summary itself never changes; a non-pen way to place (select a card, then tap "+ แทรกตรงนี้" between lines) for keyboard and screen-reader users; an inserted card's photos open the gallery; merged cards are saved cards she can reuse.

Not yet tested: overlap between DIFFERENT photos (this set had a different slide in each photo). A cheap perceptual-hash pre-check for near-identical shots is still worth adding.
