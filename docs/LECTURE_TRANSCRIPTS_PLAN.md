# Saved lectures and transcript imports

The owner approved preloading recordings for the four catalogue subjects on 16 November 2026. In the sidebar, **Study → Lecture notes** opens the lecture list, with access to documents and personal notes. Expand a course under **Recorded lectures** and tap **Notes** beside a session. The Notes tab opens the student's own notes and any prebuilt AI summary for that lecture. **Transcript** includes a preview and link to the full summary. **Watch** opens the source video on RU's site with the student's e-service login. A direct summary link returns to the requested lecture after sign-in. [Open MGT3204 lecture 1](https://termtrail.com/api/open/lectures?view=lectures&summary=MGT3204-1)

The reader displays **My Notes** below the summary or transcript. A student can add, edit and delete entries. Images from those notes share a gallery at the bottom. The half-screen editor leaves the lecture readable and can expand to full screen. Saving a note or its clarifying answers updates the combined notes automatically.

## Shared material

ACC1101 and ACC1103 use the same ten recordings. MGT3204, RAM1103 and RAM1132 have their own recordings. The other six subjects on RU's lecture site were added on 18 November 2026 (migration 059): CDM1101 (12 recordings), CDM2103/MCS1151 (10), LAW1101/LAW1001 (12), LAW1102/LAW1002 (13), POL1101 (13) and POL2106 (10). They are outside the Business Administration curriculum, so they are not in any programme: they carry lecture links only and appear only through shared lecture access. In all, 112 transcript/summary pairs serve 157 lecture links. Where a recording serves a former code (LAW1001, LAW1002, MCS1151), the current code holds the original and is the one listed. LAW1003, LAW2002 and LAW3001 had no recordings when collected.

RU transcripts, derived summaries, and the private notes directory stay out of git. Copy the ten bundles and the summaries directory to the host, preserving subdirectories and file timestamps. With the app migrations installed, run this from the repository root on the host:

```sh
node_modules/.bin/tsx server/src/importSavedLectures.ts "/path/to/private-notes" "/path/to/existing-database.sqlite"
```

The importer checks the manifest against each course, session, URL and cue count. It replaces shared originals in one transaction, preserves student edits and links both accounting codes to the same original. The SQLite database and its daily backups contain the resulting transcripts and summaries.

In production, set `SHARED_LECTURE_USERS` to a comma-separated list of the trial students' account IDs. An empty list grants no shared access. Wider release is an owner decision after asking RU. An explicit `*` enables all eligible signed-in students. The designated RU trial accounts see the full ten-subject collection, their own programme's courses mixed in code order with the rest. The student's programme supplies the preferred accounting code and filters lectures without shared material. Degree planning keeps its usual programme catalogue.

Timestamps in a summary open the matching transcript line. Return chips link the line to every point that cites it. Manual edits and restoration affect only the signed-in student's copy. Choosing a lecture on a new or existing course note adds its photos to that student's lecture gallery.

## Student imports

The existing collector works in the student's signed-in RU tab. It reads the session list at `subject.php?subject_id=N`, visits each recording at `watch.php?session_id=N` with a pause, and saves the `CUES` as a bundle for import. StudyOS never handles RU credentials. A missing transcript is skipped and reported. Source links and the collector may need updating if RU moves its pilot site.

Privately imported bundles remain account-scoped. The viewer prefers a shared transcript where the account has access and otherwise reads that account's own copy. Deleting a private copy never removes a shared original. Native in-app collection remains a possible convenience for courses without shared material.
