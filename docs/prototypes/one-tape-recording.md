# Room files and one-tape recording

The existing SI–1 survey console has a FILE view for all 50 mapped spaces. Each file describes the building period, occupants or use, and a room-specific fact. Attached documents open through the existing sheet reader. Undiscovered spaces remain hidden. Exact dates follow established building history; undated construction and later alterations remain identified as such.

## Recording contract

The reference microphone requests 60 clean seconds and accepts STOP at 45. Reaching the full target stops automatically; stopping at the usable threshold receives the same job credit. Microphones retain their noise and duration tradeoffs:

| Microphone | Usable | Target | Incidental noise |
| --- | ---: | ---: | ---: |
| Reference | 45 s | 60 s | Normal |
| Directional | 49.5 s | 66 s | −15% |
| Wide field | 40.5 s | 54 s | +15% |

These are the standard difficulty values. The recorder shows the effective values for the fitted equipment and current rules.

Every roll receives a new take number and starts at the end of one physical tape. Slating and held recording time consume tape without earning clean seconds. Early and spoiled attempts remain playable. A replacement appends; it does not overwrite the attempt. Listening without rolling consumes no tape.

Choosing a take rewinds or fast-forwards using the existing transport sample. Recording after playback first cues the end. STOP interrupts seeking as well as playback. Saves retain the entire tape, its position, original sound references, event timing, slate and accepted-room projection. Old saves with room IDs or independent takes migrate into that tape.

The player speaks the displayed room, take number and date. Voice activity followed by a quiet pause ends the slate; REC can confirm it manually. No speech recognition is used. Without microphone access or recording support, the recordist speaks the slate. A disconnected or undetected microphone also reaches that fallback. The microphone slate is stored locally in IndexedDB and replayed with its take; it is never uploaded. Pause stops capture, and resume continues it. The automatic voice repeats after pause so its ending is not lost under a muted menu. Clearing user data also clears stored slates.

The tutorial teaches the target, usable threshold, slate, early stop and replacement. The return assessment lists outstanding retakes when an abandoned or spoiled room has no usable replacement. Historical mistakes remain on tape after the work is corrected.

## Verification

- `test/one-tape.spec.mjs`: timing thresholds, microphone tradeoffs, failed attempts, migration/persistence, assessment, recorded presence timing and seek cancellation.
- Existing recorder, map, storage, progression and Source replay tests cover integration contracts.
- `tools/chunk_surfer/verify-one-tape.mjs`: production Chrome flow through normal recorder controls; room files at three sizes; pause/resume; a 12-second early stop; replay/seek; a fresh 45-second accepted take; reload.
- Default browser fixture supplies generated audio to MediaRecorder and decodes the stored blob to verify audible samples. `NO_MIC=1` runs the same flow with permission denied. Fixtures isolate transport from the adversary and radio; they do not validate difficulty balance.
- Reports and screenshots are under `artifacts/one-tape/`, with the denied-microphone run under `no-microphone/`.

Physical microphone acoustics and packaged desktop audio still require a listening pass. Voice blobs are local to this device; cross-device save exports do not carry their audio.
