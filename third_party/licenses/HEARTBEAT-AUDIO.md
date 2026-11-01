# Bodily pulse recordings

The production bank uses two original lossless recordings published by Joseph SARDIN through BigSoundBank. Both per-item source pages explicitly release the recording under **CC0 1.0**, including commercial editing and redistribution. Credit is retained voluntarily.

| Source | Author | Licence | Original delivered file |
|---|---|---|---|
| [Heart Beat #4](https://bigsoundbank.com/heart-beat-4-s1929.html) | Joseph SARDIN | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Original BWF PCM24, 48 kHz, mono, 46.028333 s |
| [Heart Beat #5](https://bigsoundbank.com/heart-beat-5-s1930.html) | Joseph SARDIN | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Original BWF PCM24, 48 kHz, mono, 39.5765 s |

The publisher identifies both as **studio Foley**, recorded with a Neumann KM184 into a SoundDevices MixPre-3. These are not biological recordings and are not represented as medical or physiological evidence. Their high-resolution delivery establishes source integrity, not superiority in human listening.

Original downloads:

- `https://bigsoundbank.com/UPLOAD/bwf-en/1929.wav`
- `https://bigsoundbank.com/UPLOAD/bwf-en/1930.wav`

The unchanged masters, per-item pages and publisher licence page are retained in `tools/chunk_surfer/heartbeat-sources/`. Exact SHA-256 hashes appear in the producer, production manifest and generated data module. The original hashes are:

- #4: `2ac30b170e6d34460b740f057f1a4e2ad35ca287550e0ecb38f5faa790691cac`
- #5: `f5361873c550ee108e7b338e45b444a6f1d985f14b5da79daf8c6bfba3c4aa56`

## Derivatives

`tools/chunk_surfer/prepare-heartbeat-audio.py` selects **six independently performed whole pairs per family** from inspected continuous source windows. Every excerpt retains both contacts and their real settling tail. It applies a 28 Hz high-pass for subsonic/DC headroom, the **same −6 dB gain across both sources and all variants**, and 5 ms boundary fades. Export remains mono PCM24 at 48 kHz.

There is no per-variant normalization, compressor, synthetic replacement beat, pitch shift or time stretching. Relative recorded articulation and levels survive the edit. The sound engine applies the existing Standing Tear signed-PCM amplitude quantizer at **10 bits**, with separate steady **28 kHz sample holding**, once after decoding. This processing is not a low-bitrate MP3 encode and is not baked a second time into the delivered WAVs.

Measured 1 ms RMS contact landmarks and a 5 ms RMS envelope from the actual exported PCM are included for the shared audio/visual timing owner. These are production landmarks, not clinical S1/S2 identifications. Six fast clips occupy 0.48–0.50 seconds; the owner must retain a suitable quiet margin and never truncate a pair merely to increase pressure.

## Build and verification

```sh
python3 tools/chunk_surfer/prepare-heartbeat-audio.py
python3 tools/chunk_surfer/prepare-heartbeat-audio.py --verify
node --test test/heartbeat-assets.spec.mjs test/credits-data.test.mjs
```

Both build and verification are offline. The producer does not depend on research artifacts, a logged-in source site or any Freesound MP3 preview. The game's credits derive directly from `HEARTBEAT_AUDIO_SOURCES` in the same generated module used by playback.
