# Saved lectures and transcript imports

The owner approved preloading the four catalogue recordings on 16 November 2026. A trial student can open the Study section in Notes or Documents & lectures, choose a course, and open its transcript or AI notes. The source video opens on RU's site with the student's own e-service login.

## Shared material

ACC1101 and ACC1103 use the same ten recordings. MGT3204, RAM1103 and RAM1132 have their own recordings. Forty-two transcript/summary pairs serve 52 catalogue lecture links. The 70 other collected lectures belong to courses outside this catalogue.

RU transcripts, derived summaries, and the private notes directory stay out of git. Copy just the four matching bundles and the summaries directory to the host, preserving subdirectories and file timestamps. With the app migrations installed, run this from the repository root on the host:

```sh
node_modules/.bin/tsx server/src/importSavedLectures.ts "/path/to/private-notes" "/path/to/existing-database.sqlite"
```

The importer checks the manifest against each course, session, URL and cue count. It replaces shared originals in one transaction, preserves student edits and links both accounting codes to the same original. The SQLite database and its daily backups contain the resulting transcripts and summaries.

In production, set `SHARED_LECTURE_USERS` to a comma-separated list of the trial students' account IDs. An empty list grants no shared access. Wider release is an owner decision after asking RU. An explicit `*` enables all eligible signed-in students. The designated RU trial accounts see the full four-subject collection. The student's programme supplies the preferred accounting code and filters lectures without shared material. Degree planning keeps its usual programme catalogue.

Timestamps in a summary open the matching transcript line. Return chips link the line to every point that cites it. Manual edits and restoration affect only the signed-in student's copy. Choosing a lecture on a new or existing course note adds its photos to that student's lecture gallery.

## Student imports

The existing collector works in the student's signed-in RU tab. It reads the session list at `subject.php?subject_id=N`, visits each recording at `watch.php?session_id=N` with a pause, and saves the `CUES` as a bundle for import. StudyOS never handles RU credentials. A missing transcript is skipped and reported. Source links and the collector may need updating if RU moves its pilot site.

Privately imported bundles remain account-scoped. The viewer prefers a shared transcript where the account has access and otherwise reads that account's own copy. Deleting a private copy never removes a shared original. Native in-app collection remains a possible convenience for courses without shared material.
