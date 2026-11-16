# How long AI work takes, and a progress bar that survives sessions (2026-11-16)

Owner: "check the timings of how long deepseek took … give the user some sort of expectation on how long the processing will take. ideally a progress bar that is reasonably accurate that survives different sessions."

## Measured today (DeepSeek V4 Flash unless noted; wall-clock, streamed)

| Job | Time | Notes |
|---|---|---|
| Typed note → AI summary (in the app today) | **~8 s** | ~1.4k output tokens. V4 Pro took 40 s for the same note. |
| Lecture transcript → summary (42 runs, effort high) | median **41 s** (18–92 s, p90 60 s) | ~19k tokens in, ~7.4k out. Done once, ahead of time: students never wait for these. |
| Photo notes, 6 photos: Apple text recognition | **~1 s** total | On this Mac, 3600 px photos. |
| Photo notes, 6 photos: DeepSeek ordering/merging (effort high) | **~21 s** | With the recognised text. DeepSeek reading the photos itself: 34 s (and wrong). |
| Drawing page → notes (effort max, whole page + 4 crops) | **80–155 s** | Grows with colour and the full rule set (v4: 107–155 s). |
| Arrowhead check (second pass) | 123–148 s | Did not fix two-way arrows; likely dropped in favour of a question. |
| Locate drawings (boxes) | ~65 s | |
| Refine 19 crops (parallel) | ~69 s | |
| Apply her answers (text only) | ~37 s | |
| Maths restyle (text only) | ~78 s | Fold into the main read instead. |

Speed is steady at about **190 output tokens per second** (thinking included), and the first token arrives in under a second. Over the 42 lecture runs, **time = 2 s + 5.2 s per 1,000 output tokens** is within 3% (median). The input size predicts time badly (median error 23%, worst ~100%), so a timer based on the input would be wrong; counting output as it streams is right.

## The progress bar

1. **Every long AI job runs on the server as a job**, not inside the request: a row in a new `ai_jobs` table (`id`, `user_id`, `kind`, `status` queued/running/done/failed, `phase`, `started_at`, `expected_tokens`, `tokens_done`, `result_ref`, `error`, `updated_at`). The server streams from DeepSeek and updates `tokens_done` as tokens arrive (in memory each second, saved every few seconds).
2. **Survives sessions and devices:** the job belongs to the student, not the screen. Closing the app, locking the phone or switching device does not stop it; wherever she opens the note again, the bar continues from the server's numbers (`GET /api/ai-jobs/:id`, polled each second while visible, or server-sent events). When a job takes longer than ~20 s and she has left, a notification says the notes are ready (web push and its rules already exist, Phase 45: no content in the push).
3. **Estimate before it starts:** "about 20 seconds" / "about 1–2 minutes", from the median and 90th percentile of that job kind's recent runs. The `ai_usage` table already logs output tokens per purpose; add duration and keep a rolling window (e.g. last 30 runs per kind).
4. **While it runs:** progress = `tokens_done / expected_tokens`, where expected = that kind's recent median output, scaled for the amount of input where it helps (e.g. per photo). Time left = remaining tokens ÷ the speed measured on this run. The bar never moves backwards: it stops at 95% until the job really finishes, and if a run outgrows its estimate, the label changes to "almost done…" with a gentle moving stripe instead of a wrong number.
5. **Pipelines with steps** (photos: read text → order and merge; drawings: read page → locate drawings → refine crops → questions) show the step ("ขั้นที่ 2/3 · จัดเรียงโน้ต") and split the bar by each step's historical share of the time.
6. **Failures:** a dropped connection is retried by the server (DeepSeek long answers must be streamed: non-streamed ones dropped with IncompleteRead today); after retries, the job shows a clear error with "ลองใหม่" and nothing she entered is lost.
7. Thai-first labels, the AI banner on results, min-h-11 controls, and nothing under 12 px, as everywhere else.

Short jobs (under ~10 s, such as a typed-note summary) can keep today's spinner, but get the same job row so a closed app still receives the result.
