# Chapel service recordings

This bank supports the existing chapel's continued service. It contains human
Latin prayer, one actual priest/congregation response, occupied church silence,
cloth and wood. It adds no answer, new dialogue or authored theological claim.
The Ear Room audio bank and runtime are separate and are not processed here.

The original Freesound recording pages and their licence links were inspected
on **2026-10-21**. HTML snapshots, bounded HQ preview downloads and source hashes
are preserved in `artifacts/chapel-service/sources/`. All six sources are CC0 or
CC BY. No share-alike, noncommercial, unclear historical recording or scraped
commercial choir is included. The HQ MP3 previews are the available licensed
recordings used here; they are not claimed to be raw lossless masters.

| Source | Author | Recording licence | Original source page | SHA-256 of the downloaded audio |
|---|---|---|---|---|
| De_Communione.wav | cormi | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [Freesound 121883](https://freesound.org/people/cormi/sounds/121883/) | `853ba2dc14f26e9a64e74724c6e9b0737496c004d38767dd09d0209fd36cb3e1` |
| Pater_Noster.wav | cormi | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [Freesound 113654](https://freesound.org/people/cormi/sounds/113654/) | `9746a38a7bbe267153b2bb40d3bf00696d7539f4fa50966760007d3427a023d1` |
| amen.wav | ERH | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Freesound 29933](https://freesound.org/people/ERH/sounds/29933/) | `87bfac2c74019cc3d6481057ad78a896e916b0d24e2f8ab31160f28cd7babc5e` |
| 1800's Church Silent Prayer During Communion | composingatnight | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [Freesound 697580](https://freesound.org/people/composingatnight/sounds/697580/) | `36e95259757245830b68985ef1d270d92738ffdf3d11fab1eb3aaf901148327e` |
| Blanket Movement 2 | OwlStorm / Ashe Kirk | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [Freesound 320138](https://freesound.org/people/OwlStorm/sounds/320138/) | `f8cd975c25318e5c0cf4a96c8c1ee39e1f71ab5a5935fbf6436b129e406c9fa3` |
| Bench Creak 2.wav | tbhicba | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [Freesound 148335](https://freesound.org/people/tbhicba/sounds/148335/) | `8600c348a070a712f3f91492d1cd7dd6178ebd2026655287038d0438215ffb28` |

## Recording rights and spoken material

The CC grants above apply to the sound recordings. The source authors identify
their own performances or field recordings. Cormi's two 2011 uploads are human
recitations, with the text attributed to the **1847 Rituale Romanum**. They are
not a claimed 1847 recording or proof that the speaker is an ordained priest.
The Latin prayers are traditional texts, separate from the recording rights;
no copyrighted modern English translation or musical arrangement is used.

The [1847 edition's digitized bibliographic record](https://books.google.com/books?id=Bo2QshS95OoC)
identifies the Catholic Church's ritual and its publication. The
[Vatican's Latin account of the Lord's Prayer](https://www.vatican.va/content/dam/wss/archive/catechism_lt/p4s2_lt.htm)
independently identifies its traditional text and use. These are references;
no modern commentary, page layout, photograph or new musical setting from them
is used as an asset. The familiar single-word Amen is used as spoken prayer,
not a composition.

ERH identifies the recording as a priest and congregation saying Amen. It is
kept as **one coherent recorded group** with the original room decay, not
split into invented individuals or multiplied into pitch-shifted choir voices.
The silence source is a contemporary church recording: “1800's” describes the
building in its title, not the recording's age. Specific breaths and pew
movements within it have not been independently identified. The cloth is
documented down-duvet foley and the wood is an old bench; their use as clothes
and pew movement is an adaptation, not a claim about the original location.

## Attribution and changes

Required credits for the two attribution recordings:

- **“amen.wav” by ERH, Freesound.org, CC BY 4.0.**
  [Source](https://freesound.org/people/ERH/sounds/29933/),
  [licence](https://creativecommons.org/licenses/by/4.0/).
  Adapted by Chunk Surfer: downmixed, gently filtered, levelled and edge faded;
  original group timing and recorded decay retained.
- **“Bench Creak 2.wav” by tbhicba, Freesound.org, CC BY 3.0.**
  [Source](https://freesound.org/people/tbhicba/sounds/148335/),
  [licence](https://creativecommons.org/licenses/by/3.0/).
  Adapted by Chunk Surfer: downmixed, gently filtered, levelled and edge faded.

The four CC0 authors are credited in the same source manifest despite not
requiring attribution. None of the authors endorse the game. All six source
recordings are also credited in `src/data/credits.js`; this licence file and
the shipped manifest retain the source and licence links independently.

## Processing and evidence

Editable source/cut definitions: `src/data/chapel-service-audio.js`.
Builder: `tools/chunk_surfer/build-chapel-service-audio.mjs`.
Shipped bank: `public/audio/chapel-service/`.

The two prayer takes are divided only at long pauses between complete clause
groups, yielding five priest cues of approximately **7.8–16.1 seconds**. There
is one complete **5.7-second Amen**, two short material movements, and two
consecutive occupied-silence sections. Each manifest entry records its source,
cut range, duration, runtime gain, encoded hash and decoded measurements.

Mono 44.1 kHz processing, a gentle 65 Hz high-pass (55 Hz for movement) and
9 kHz low-pass (7 kHz for room tone), conservative level matching under a
−6 dBFS pre-encoding peak ceiling, 12 ms entrance and 80 ms exit fades
(200 ms for room tone). Encoded as mono 44.1 kHz MP3 at 96 kbps. No bitcrush,
pitch/time shift, reversal, artificial choir, clone ensemble, denoise or added
baked reverb. The response and room tone retain their existing field-recorded
acoustics. The priest's acoustic provenance is unspecified by its recorder;
runtime reverb should be restrained and evaluated in the actual chapel.

`artifacts/chapel-service/audio-build.json` measures every decoded output.
`source-bank-audition.wav` is a 90-second ordered authoring preview with whole
phrases and their original tails; it is **not** the gameplay score or a native
capture. The tool environment cannot accept audio input, so auditory author
review and player validation remain explicitly pending. Waveform pauses and
the source transcripts informed cuts; that does not establish audible quality.

## Rejected sources and scope

- JoaoMSantos, “church during mass,” Freesound 316652: **CC BY-NC 4.0**, rejected.
- The 519 MB Vienna Mass source: unnecessary download and prominent organ/music.
- A public-domain German parish Agnus Dei: usable recording rights but language
  and rite mismatch with this coherent Latin treatment.
- Baptism, absolution and graveside recitations: would introduce a different
  service or imply extra story meanings.
- Scored horror choir, synthetic liturgical voices and historic recordings with
  unresolved neighbouring rights: unnecessary and excluded.
