# Footstep and Source footing audio

Generated from the retained source manifest by `tools/chunk_surfer/prepare-footstep-audio.py`.

All twelve acquired inputs are published Freesound HQ MP3 previews of individually identified CC0-1.0 files. Original WAV masters were not acquired. Writing PCM WAV derivatives does not restore lossless master quality. The exact preview bytes, URLs, SHA-256 hashes and author descriptions are retained in `tools/chunk_surfer/footstep-sources/sources.json`; the input previews are retained beside it for offline rebuilding.

## Sources

| ID | Recording | Creator | Licence | Retained preview SHA-256 |
|---|---|---|---|---|
| 170503 | [Footsteps, Tile, Male Sneakers, Medium Pace.wav](https://freesound.org/people/SpliceSound/sounds/170503/) | SpliceSound | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `1f70b5e493ad5456fd0c6ccf941bf937ec346b8f0a16c66d8327b3d8f7efe98a` |
| 170506 | [Footsteps, Tile, Male Sneakers, Slow Pace.wav](https://freesound.org/people/SpliceSound/sounds/170506/) | SpliceSound | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `9e48387265b254793e09f8c24fcbb11191b16a0d554ca9cff40c5afb1dd396a2` |
| 170502 | [Footsteps, Tile, Male Sneakers, Scuffs.wav](https://freesound.org/people/SpliceSound/sounds/170502/) | SpliceSound | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `e04218c8997ba016abfeb8371f99c016d0e2631a05f98b6d1ff8b6aa8a2dec82` |
| 543685 | [Footsteps_Wood_Walk_Mono.wav](https://freesound.org/people/Nox_Sound/sounds/543685/) | Nox_Sound | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `d3800efe4ac23aa265f48e3aea63d0b3b3edec54969142aeedf1fb1035b6dbfd` |
| 556002 | [Footsteps_Mountain_Boots_Gravel_Mono.wav](https://freesound.org/people/Nox_Sound/sounds/556002/) | Nox_Sound | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `0510a7626e5e4c7c87283c4cfb879530ac960af3767b0c3df947fe86eb715c64` |
| 556042 | [Footsteps_Mountain_Boots_Grass_Mono.wav](https://freesound.org/people/Nox_Sound/sounds/556042/) | Nox_Sound | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `7d4be74dac83b41f25ef1fc22065f6a2611bf730a07265b5c6db26941b2bbcef` |
| 272259 | [concrete_11a_sneakers_walk.wav](https://freesound.org/people/sturmankin/sounds/272259/) | sturmankin | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `f2ab6bc26d1fa2c1c8b993821021425f97da258893367759078976c88ffa1bdd` |
| 271925 | [carpet_11a_sneakers_walk.wav](https://freesound.org/people/sturmankin/sounds/271925/) | sturmankin | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `cd47a91bf82a47cf93ad7ec02304d507920a8922cc65b13da25e3dd19b6896ea` |
| 273375 | [wood_11a_sneakers_walk.wav](https://freesound.org/people/sturmankin/sounds/273375/) | sturmankin | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `7c8e3924bf56e0819139dada9c145fc28cfcc886aa1136d30034fee1aa3373c2` |
| 272506 | [lino_11a_sneakers_walk.wav](https://freesound.org/people/sturmankin/sounds/272506/) | sturmankin | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `8a681c19d56e26da55794b44cd2e8109044e7c4db18d0c2beed55b4c337e7907` |
| 745014 | [Glass Ping](https://freesound.org/people/tix99/sounds/745014/) | tix99 | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `9594c564c73a2a89948af002d1fe7dac4721c126537af2c1620b74a2b787a26e` |
| 711891 | [Wine Glass Resonances by Violin Bow - 03](https://freesound.org/people/robin.kaf/sounds/711891/) | robin.kaf | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `b06118b685346d5d408fd924bf6b0e879b6887dd65bc2d98003286eb07b85041` |

## Adaptation and material claims

The player core is an ordinary sneaker/low-shoe contact: SpliceSound tile walk/slow/scuff, sturmankin sneakers11 concrete/carpet/wood/linoleum, and the first three Nox wood trainer contacts as an optional alternate. No boot recording is used as the player's dry sole. Uploader labels establish broad footwear families, not one proven identical shoe across creators or performer foot side.

Cleaner whole contact performances are selected from the continuous originals, downmixed to mono, filtered at65Hz/14.5kHz, and aligned to a20ms editorial primary-load landmark. Leading preparation/room sound is trimmed, a20ms lead is retained or padded, natural nearby heel/toe and material decay remain, and edges are faded. Strong ambiguous late clicks/releases and source-level outliers are replaced with cleaner performances rather than normalized individually. The manifest records adjusted source windows, requested inspection windows, leading trim/pad, measured onset/peak attack and one shared gain per source family. Strength differences between real takes are preserved; individual recorded steps are not normalized, pitch-randomized or time-compressed. Only tile has a separate real slow performance. Other slow banks explicitly reuse walk takes with lower gain; no running gait is invented.

Nox mountain-boot grass and gravel are highpassed into separate granular substrate derivatives under the independent ordinary-shoe core. They are not claimed as the same shoe. Metal, wet, paper, body, snow, ash and glass contact layers are bounded authored DSP, not documentary floor recordings. Tarmac, paving and setts use honestly marked concrete-contact fallbacks. Soil uses the separate grass-derived texture. The sturmankin wooden support was a large table over carpet/concrete, not an architectural floor.

Source uses separate finite response stems excited by a real tile contact, never a prerecorded walk sequence. Glazed Infinity combines seeded late diffusion, a bounded octave-derived bloom and quiet plucked-bottle colour. Erased footing uses a bowed-wine-glass residue only after stopping; it is not a live spectral freeze. Compiled Ground sounds one note per accepted footfall, selected randomly without an adjacent repeat from fixed close microtonal pools: field four notes, path six, fault eight. The notes appear across successive steps, never as a simultaneous chord. Weak inharmonic partials colour a single material resonance. Each note is one aligned finite excitation scaled by the source plant's energy, not a convolution of the whole shoe waveform: later release lobes cannot re-trigger its tonal attack. Every finite response also records its measured channel-energy onset, early100ms attack and full-file loudest peak separately, so a diffuse bloom does not masquerade as a new footfall timing anchor. There is no independent clock, melody, twelve-tone scale or pitch-shifted sole. The exact frequencies, gains, cuts and processing are in the generated manifest.

## Rebuild and verification

```sh
python3 tools/chunk_surfer/prepare-footstep-audio.py
python3 tools/chunk_surfer/prepare-footstep-audio.py --verify
```

Python 3, NumPy and FFmpeg are required. Rebuilding is offline with the retained inputs. `--fetch` restores a missing preview and requires its recorded hash. Verification checks every output hash, duration, PCM format, clip edge, peak, bank reference, finite response limit and one-note pool structure. The runtime bounds decoded residency and active voices separately. These checks establish asset integrity, not independent listening or native final-mix acceptance.
