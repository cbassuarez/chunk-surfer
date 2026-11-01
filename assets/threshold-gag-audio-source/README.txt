Shared human voice source for Ellery's threshold gags

AUTHORING SELECTION, 2026-10-31: The user auditioned the two Dinoroki human
pronunciations, chose the shorter take, and requested: "use the shorter take,
add our bitcrushing and reverb stack to it". This establishes the source choice
and requested processing, not independent acceptance of the processed game mix.
The user subsequently requested more bitcrushing again. The current derivative
uses a local 6-bit/18 kHz/0.98 crushed mix in place of the previous
9-bit/24 kHz/0.86 derivative; the selected human performance stays unchanged.
The shared ear-room DSP profiles are unchanged.

Original file: En-us-boo.ogg
Author: Dinoroki; original own-work human pronunciation
Primary file/license page:
https://commons.wikimedia.org/wiki/File:En-us-boo.ogg
Original download:
https://upload.wikimedia.org/wikipedia/commons/5/5d/En-us-boo.ogg
License: CC0 1.0 Universal Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/
Source date: 2024-04-13; retrieved 2026-10-31
SHA1 verified against Commons metadata:
8c7b1496e52001ea6841db97fbf51a5f94d37e52
SHA256:
371374c5a5b22e3775dab17c7d7c76745d846f9b6339f3913359c2ebc4acd59e
Original size: 13,908 bytes; stereo 44.1 kHz Ogg Vorbis, 0.464399 seconds.
dinoroki-source-page.html retains the primary license page. File CC0 is
distinct from the website's page-text license. No raw microphone master was
available: public/audio/threshold-gag/boo-human-source.wav is a 24-bit decode
of the original OGG, not a claimed raw recording master.

Rebuild voice only: node tools/chunk_surfer/build-threshold-gag-audio.mjs --boo-only
Rebuild whole local bank: node tools/chunk_surfer/build-threshold-gag-audio.mjs
Requirements: Node, ffmpeg, Python 3 with NumPy. No network or voice generator.

Retained editable/review stages:
- En-us-boo.ogg: unchanged approved human original.
- boo-clean-edit.wav: full-duration 48 kHz mono, small speaker bandwidth/level
  edit (100 Hz high-pass, 8 kHz low-pass, gain 0.63, 2/8 ms edge fades).
- boo-crushed-dry.wav: same timing/pitch, existing stop-listening-dsp.mjs
  algorithm with local boo-heavy profile (6-bit signed quantization,
  18 kHz independent hold clock, mix 0.98),
  RMS-matched to the clean edit at the 48 kHz working rate.
- main-b3-authored-impulse.wav: the existing stopListeningImpulse algorithm,
  main_b3 profile, deterministic xorshift32 seed 0x454c4c59. This is synthesized
  decaying noise and authored early reflections, NOT a measured room response.
- boo-wet-response.wav: isolated final wet response, retained for independent
  dry/wet measurement. It contains no direct voice path.
- processing-recipe.json: exact chain, seed, normalization, convolution sizes.
- public/audio/threshold-gag/boo.wav: mono 24 kHz / 16-bit final game clip.

The short room uses a 0.45 s decay, 6 ms predelay and additive wet send 0.14.
Its normalized stereo response is folded to mono before finite convolution.
The normalized wet response alone has gain 5.984825586826066 (+15.54103 dB)
so that wet RMS is 18 dB below dry RMS over the active 0.02–0.32 s interval.
The interval is derived from 20 ms dry-RMS blocks within 24 dB of the strongest
block; it is an energy window, not a speech-recognition or listening judgment.
Dry gain remains exactly 1.0; the final mixture is not globally turned up or
level-matched. The IR shape/decay/predelay and human performance stay unchanged
while the voice becomes coarser. The response calibration preserves the
established room balance, not an enlarged room or longer tail.
The game supplies location through its existing physical speaker/HRTF.
The entire convolution tail is retained, ending at zero over its final 5 ms.
There is no new runtime effect graph, pitch/formant manipulation, time
stretching, voice layering, speech synthesis or performance replacement.

Optional courtesy credit (CC0 does not require attribution):
"Boo pronunciation by Dinoroki (En-us-boo.ogg), CC0 1.0, Wikimedia Commons."
Mechanical sources retain their separate existing CC0/CC BY 4.0 attribution
in public/audio/threshold-gag/credits.json.

The rejected JeanMyna take-3 source archive and old audition/credits were moved
to artifacts/ellery-threshold-gag/rejected-voice-sources/. They are excluded
from this selected source folder and the game's public audio directory.
The rejected synthetic voice was not retained in the shipping audio directory.

No agent listening, final processed-mix acceptance, participant validation or
measured-room claim is made. Root-owned current actual-game capture supplies
runtime evidence; independent listening judgment is separate.
