# Physical door sound palette

The new files in `public/audio/doors/` are adapted from the eight recordings
below. Their per-item primary pages explicitly identify CC0 1.0 or CC BY 4.0.
The bank does **not** infer licensing from the Freesound platform or from a
recording being free to preview.

Seven delivered inputs are **public Freesound HQ MP3 previews**, not the
original WAV/M4A uploads. Original-upload specifications for those seven in the
manifest are metadata and must not be attributed to delivered previews or our
exports. The eighth input is Joseph SARDIN's publicly downloadable original
48 kHz/24-bit mono BWF WAV from BigSoundBank, also carrying embedded CC0/public
domain copyright metadata. No gated originals, API credentials or login
sessions were used. Input bytes and saved per-item licence pages are SHA-256
recorded in `public/audio/doors/manifest.json`.

## Attribution and adaptations

| Recording | Creator | Primary source | Licence | Adaptation |
| --- | --- | --- | --- | --- |
| Shop door bell.wav | 775noise | <https://freesound.org/people/775noise/sounds/494565/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Four separated real activations from one recording; same −1 dB export headroom for all four, small edge fades. Relative recorded levels retained. |
| small wooden creaking attic door opening slow 2.wav | Kranhytt | <https://freesound.org/people/Kranhytt/sounds/674791/> | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Mono opening excerpt with edge fades. |
| small wooden creaking attic door closing 1.wav | Kranhytt | <https://freesound.org/people/Kranhytt/sounds/674784/> | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Contact excerpt beginning about 30 ms before its main attack; original settling tail retained, mono downmix and edge fades. |
| small wooden creaking attic door closing 5.wav | Kranhytt | <https://freesound.org/people/Kranhytt/sounds/674788/> | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | A second same-door performed contact and retained tail; mono downmix and edge fades. |
| DOORMetl_Squeaky metal door open and close, different speeds, garden door.wav | a-sounds | <https://freesound.org/people/a-sounds/sounds/587337/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Two actual metal-hinge movement excerpts with edge fades. Garden-door source; not an institutional hydraulic closer or freight-door weight measurement. |
| Push-bar fire door opening | wlabarron | <https://freesound.org/people/wlabarron/sounds/475312/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Real push-bar/opening excerpt, mono downmix and edge fades. The original upload is also lossy M4A. |
| Glass Door Closing 1_1 | Joao_Janz | <https://freesound.org/people/Joao_Janz/sounds/485111/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Glazed seating/contact excerpt, mono downmix, −3 dB export headroom and edge fades. Source author already gain-staged, filtered and de-noised this recording. |
| Old glass door (#1270) | Joseph SARDIN | <https://bigsoundbank.com/old-glass-door-s1270.html> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) / [publisher terms](https://bigsoundbank.com/licenses.html) | Public original BWF divided into opening, closing travel and seating excerpts. Original 48 kHz retained; mono PCM24 converted to PCM16. Uniform −3 dB export headroom and 2 ms edge fades on all three. No normalization or invented variation. |

Kranhytt's three performances are attributed above with title, creator, source,
licence link and changes. The original session was a small attic door; it is
not represented as a recording of Ellery's heavy acoustic leaves. These sources
are also exported as `DOOR_AUDIO_SOURCES` for the game's credits.

## Processing and runtime meaning

Exports are mono PCM16 WAV: 44.1 kHz for preview-derived files; the original
BigSoundBank heritage-glass session retains its 48 kHz sample rate. Processing
is limited to excerpts, mono
mixing, uniform source headroom where specified, and small edge fades. There is
no normalization, EQ, denoising, pitch or time transformation, generated
variation, or baked additional reverb in this producer. Source MP3 artifacts
and captured room tails remain; wrapping a preview in WAV does not make it a
lossless master.

`processingGainDb` is baked into the asset. `gainDb` is separate runtime playback
attenuation; it must not be applied a second time during export. The four bell
performances retain their relative levels and are not labelled as calibrated
soft/medium/hard strikes. No source supplies a measured mechanical-force scale.

The two timber contacts start near their seating attacks and retain their
recorded tails. The timber opening and metal movement sounds must be gated to
actual leaf movement. They should not continue to creak after a reversal,
blocked sweep, completed movement, pause or scene change.

The `heritage-glazed` family uses one coherent original old-glass performance
for the mahogany/glass public pair only. Opening is 0.12–2.45 s of the source;
closing travel is 3.90–4.86 s; seating is 4.86–5.85 s. Opening/travel playback
is attenuated by 16 dB and seating by 7 dB, separately from baked headroom, to
leave room for the entry bell. The publisher describes opening followed by
closing; independent/native listening has not confirmed timbre or direction.
This is one performance, not force-calibrated variants. The original has 35
exact full-scale samples and short flat peaks, with near-full-scale runs up to
8 samples (0.167 ms). Uniform attenuation prevents new export clipping but
cannot repair the original flat peaks. These limits remain explicit.

## Explicit inherited fallbacks and remaining coverage

The bank references the existing `audio/game/door_close.mp3` for opening/closing
contact roles where a convincing replacement was not established, and
`audio/game/the_key_turns.mp3` for the existing key action. This task neither
introduced those recordings nor re-established their external provenance; they
are marked `inherited-project-fallback`, **not** falsely re-licensed CC0.

Metal opening/seating, ordinary glazed opening and push-bar closure retain those
fallbacks. The inspected new fire-door slam was rejected: its public MP3
preview decodes with about 4.46% of mono samples at or above full scale. Decoder
overshoot alone is not proof of audible clipping, but this was an unsuitable
quality substitution. Numbered mixed-door contact packs were not blanket
assigned timber/metal identities without per-file evidence.

A coherent quiet hydraulic-closer and heavy acoustic-gasket/seal recording family,
original Freesound master acquisition, and independent/native timbre acceptance
remain open. The current palette is a selective improvement, not a claim that
every mechanism has been newly recorded or fully replaced.
