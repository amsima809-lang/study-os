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
5. **Show and save.** The order strip (with a suggested move when the model thinks the order is wrong), the AI banner, sections with `รูป N` chips that open a full-screen gallery (←/→), saved to the chosen course and lecture.

Not yet tested: overlap between DIFFERENT photos (this set had a different slide in each photo). A cheap perceptual-hash pre-check for near-identical shots is still worth adding.
