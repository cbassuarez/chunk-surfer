# Control audio

Cuelume 0.2.2's mechanical recipes now run through the existing game AudioContext
and menu bus. `src/audio/vendor/cuelume-mechanical.js` is a small, pinned adaptation;
its MIT notice is retained beside the source and in `public/licenses/cuelume.txt`.
There is no automatic DOM binding or second audio context.

The palette has thirteen dry cues: selection, press, release, confirmation, back,
refusal, latch/unlatch, fit/remove, patch/unpatch, and page. Recorder, radio, case,
combat and patch controls have restrained differences in their contact frequency.
Existing recordings of physical mechanisms and the radio carrier remain authored
game sounds with their original noise consequences.

`control-feedback.js` couples input-driven switch travel to press/release audio.
Holding a key does not retrigger contact. Short presses retain the existing
90 ms minimum travel; pending releases are cancelled when their owner disappears.
Rendering never produces sound. Gameplay still commits immediately.
Shortcut hints animate silently: a key printed in several places still produces
just the contact sound of the control that handles it.

Result cues belong to successful actions. Preparation only confirms READY after
the save accepts its draft. Gear fitting, storing, patching and pulling have
distinct results. Invalid actions use a dry refusal. Recorder latches follow its
actual transport state; radio choices retain their required contact holds.

The shared menu exports cover title, settings, pause, combat, the case and records.
Radio conversations also use these exports instead of the former oscillator
clicks. Archive pages and selection boundaries stay silent when nothing changes.
Physical paper turning keeps its existing foley and world-noise event.
Accepted Source-window entry uses the same confirmation on the main audio bus.
Autonomous window movement and puzzle assembly do not produce control feedback.

The engine owns at most six finite cue voices and four cached noise buffers.
Navigation is rate-limited across input devices, and important results can replace
incidental contacts. Global and SFX gains are applied once, by the real mixer.
Zero volume and focus loss immediately cancel sources; suspended contexts drop
new input instead of queuing clicks for resume. Pause keeps menu sound available.
Browsing is quieter during recording or monitoring. UI cues never emit simulated
world noise or connect to the take recorder; real speaker bleed can still reach a
microphone.

Validation commands:

```
node --test test/control-cue-audio.spec.mjs test/control-*.spec.mjs test/radio-scene.spec.mjs test/recorder-scene.spec.mjs test/battle-preparation.spec.mjs test/van-workbench.spec.mjs
GAME_URL=http://127.0.0.1:5214 node tools/chunk_surfer/verify-control-audio.mjs
```

The browser tool runs against a production preview, uses a disposable God run and
simulated controller, and writes screenshots, a report and an audition WAV under
`artifacts/control-audio`. OfflineAudioContext renders exercise actual Web Audio
nodes. They do not prove native controller handling or acoustic microphone feedback.
