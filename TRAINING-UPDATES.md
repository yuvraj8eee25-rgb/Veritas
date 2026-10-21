# Training and assignment updates

This update package contains the training and speech improvements. The live website and hosted Supabase project have not been changed. Activate the backend migration and updated functions before publishing the frontend.

## What changed

### Drill performance and XP

- XP, ranks, streaks and previous practice history are preserved.
- Old accumulated skill points are archived as `legacySkills`; they are not presented as mastery.
- New bars estimate performance on distinct drill questions. Incorrect answers earn no mastery.
- Easy, medium and hard questions contribute at most 25, 35 and 40 points respectively. Four distinct questions at a level are needed for full coverage of that level.
- The same question cannot increase mastery again within seven days. A later reassessment replaces its previous result, so performance can fall as well as rise.
- Older evidence is discounted after 30 days, reaching a 50% freshness weighting at 90 days.
- Unseen questions are offered before due reviews and immediate repeats. Multiple-choice answer positions are shuffled while retaining their original scoring identities.
- Unmeasured skills show “Unassessed”. Coach reports separate submitted drill accuracy, difficulty and dates from participation and completion counts.

These are conservative drill performance estimates, not validated measures of general debating ability. The existing question bank is small; its coverage limits prevent a 100% estimate from a handful of familiar questions. Expanding the bank requires updating both the client questions and the server scoring bank. Practice answers are visible in the client, so this is not a proctored examination.

### Assigned practice

- Coaches choose the drill, difficulty, debate motion, written/speech mode, speech length and turns per side.
- Assigned drills launch the actual drill engine and automatically send answers and results to the coach.
- The server recalculates assigned drill accuracy from the answer bank and rejects duplicate questions or incomplete runs.
- Assigned private debates launch a private-room flow and report `private_debate` on completion.
- A private assignment room is tied to its assignment; both partners must open the same assignment and have access to its cohort. The public matchmaking button is hidden for that activity.
- Completed live assignments must match their assigned motion and practice settings.
- Results use an idempotent submission request. A failed automatic submission remains in the browser tab, with a Retry submission button, including after a reload. A saved result is protected from being overwritten by another launch.
- Private room codes are restored in the same tab after a reload. General private-room rematches create another private room.

Pending results are kept in session storage, which is cleared when the browser tab/session is closed. Submit or retry before closing it. An unfinished AI debate or drill restarts after a reload; completed results remain retryable. Ongoing private rooms can be rejoined with their code.

### Written and recorded speech practice

- Written multiplayer turns now allow three minutes and 4,000 characters, with three or five turns per participant.
- Solo written practice defaults to three minutes; optional unlimited and quick practice timers remain available.
- Recorded speech works for solo AI debates, public multiplayer and private rooms. Choose 60, 90 or 180 seconds of speech, plus three minutes per turn for preparation, transcription and transcript review.
- The browser records the microphone, provides playback/download, transcribes through the authenticated AI endpoint, and lets the student edit the transcript before sending.
- A speech turn requires a saved recording. If transcription fails, the student can type the transcript of that recording.
- Audio is stored in a private bucket with a 10 MB limit per recording. Access is limited to its author, live debate participants and the relevant coach after submission. Playback uses short-lived signed URLs.
- Microphone tracks stop on completion, cancellation, timeout and navigation. Late transcription results cannot overwrite a new recording.
- Speech and written matchmaking use separate queues by practice configuration.
- Private practice does not change global Elo. Turn deadlines are enforced on the server; an opponent can advance an expired turn without prematurely skipping it. Conceding records the participant who conceded.

AI judging evaluates argument content from the reviewed transcript. It does not assess pronunciation, pacing, confidence or vocal delivery. Coaches can listen to submitted recordings and grade delivery themselves. This is recorded-turn practice, not a live audio call or a complete tournament/MUN simulation.

## Activate the update

For an existing project with migrations 0001–0014 already applied (including the local rubric validation migration):

1. Apply `supabase/migrations/0015_training_and_speech.sql` to the intended Supabase project. It adds training settings, private rooms, the answer bank, recording storage policies and checked submission/turn functions. It preserves existing assignments, submissions, profiles and ratings. Run it once as a migration.
2. Deploy the updated `ai-debate` and `ai-referee` functions, including their shared modules. Keep the existing `GEMINI_API_KEY`, allowed-origin configuration and `AI_REFEREE_SECRET`. The referee is a protected database webhook; retain its established deployment configuration and the configured `notify_ai_referee()` URL/secret. The migration does not overwrite those values.
3. Build and publish the frontend using the existing public Supabase environment variables in `.env.example`. No new browser secret is required. Microphone recording requires HTTPS or localhost and the student's permission.
4. Review existing debate assignments in the coach editor and save their motion and practice settings. Existing assignments without settings use written practice, three turns, and the assignment title as the motion; existing drills default to mixed fallacy practice.

Example deployment commands, after selecting the correct project and supplying its existing environment configuration:

```sh
npm ci
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy ai-debate --project-ref YOUR_PROJECT_REF
supabase functions deploy ai-referee --no-verify-jwt --project-ref YOUR_PROJECT_REF
npm run build
```

Use the migration history of the existing project. Do not rerun old migrations manually over a live database. The retired `submit_classroom_assignment` write endpoint is no longer available to browser clients; the application submits through the checked `classroom_command` endpoint.

## Checks reported by the source archive

- JavaScript syntax, Edge Function TypeScript syntax, frontend type checking, production build and asset size checks were reported as passing in the source archive; they have not been rerun against this merged folder.
- The focused suite was reported as passing in the source archive; those checks have not been rerun against this merged folder.
- The source archive reports that a local PostgreSQL-compatible database applied migrations 0001–0014 and exercised cohort/assignment room restrictions, automatic submission binding, server scoring, turn replay/deadline protection, matchmaking compatibility and recording read permissions. Auth, storage and network services were simulated locally.
- Actual microphone capture across browsers, live Gemini transcription, hosted Supabase storage and a two-account deployed session have not been exercised. There was no deployment or production database change reported in the source archive. This folder merge has not applied a database migration or deployed functions.

Gemini audio format reference used for the transcription integration: [Google's audio documentation](https://ai.google.dev/gemini-api/docs/audio). Browser MP4 recordings are sent to Gemini using its M4A audio MIME type.
