# Standing Tear music

The Standing Tear reuses real repertoire as fixed spatial memories. The ensemble
is **Bach’s Chaconne from Partita No. 2, BWV 1004, arranged for twelve recorders**;
it is not a violin performance or the Allemande. The separate student-practice
voice is procedural canonical material and is not advertised as Bach.

## Bach — Chaconne, BWV 1004

- Arranger, performer and publisher: **Victor Eijkhout**.
- Primary recording and licence listing: [IMSLP, Recordings / For 12 Recorders (Eijkhout), file 359740](https://imslp.org/wiki/Violin_Partita_No.2_in_D_minor,_BWV_1004_(Bach,_Johann_Sebastian)#For_12_Recorders_(Eijkhout)). Uploaded by VictorEijkhout on 4 January 2015; listed as a performance of his arrangement for recorder orchestra.
- [Original file permalink](https://imslp.org/wiki/Special:ImagefromIndex/359740).
- Licence: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Verified against the primary listing on 25 October 2026. Commercial reuse and adaptation are permitted with attribution and identification of changes.
- Original MP3 duration: **752.013075 seconds**; SHA-256 `6eb638dd6c114e2c6232112847bcad954a94062d0c22534886056f776ba65f51`.
- Shipped derivative: `public/audio/standing-tear/bach-bwv1004-chaconne-recorders.mp3`; opening **0–48 seconds**, mono, 32 kHz, 96 kbps MP3, loudness levelled to -20 LUFS / -3 dBTP target; 0.15-second entrance and 1-second ending fade.
- Shipped derivative SHA-256: `402f39f359c624d4022857f5cb99dd710f43601717df0a6c2c0eb9f39fd2c93a`.
- Runtime changes: looping, fixed spatial placement, amplitude quantization, optional separate sample holding, filtering and synthetic convolution reverb. MP3 bitrate is an encoding parameter; it is **not** the runtime bitcrusher.

Required game credit, generated from the same repertoire manifest as playback:

> J. S. Bach — Chaconne, BWV 1004, arranged and performed for 12 recorders by Victor Eijkhout (CC BY 4.0).

The game also prints the primary source URL, licence URL and changes. No endorsement by the performer is implied.

Regeneration from the original licensed file:

```sh
ffmpeg -i source.mp3 -t 48 -ac 1 -ar 32000 \
  -af 'afade=t=in:d=0.15,afade=t=out:st=47:d=1,loudnorm=I=-20:TP=-3:LRA=9' \
  -c:a libmp3lame -b:a 96k -map_metadata -1 bach-bwv1004-chaconne-recorders.mp3
```

## Couperin — L’Art de toucher le clavecin

David Joseph’s **CC0** harpsichord performance reuses the existing
`public/audio/sheet-music/sheet-couperin-clavecin.mp3` excerpt. Primary source,
original excerpt offset and existing credit are documented in
[SHEET-MUSIC-AUDIO.md](SHEET-MUSIC-AUDIO.md). This is not *Les Barricades mystérieuses*.
Shipped file SHA-256: `42a50d9c15169bdea36e403d18d7852f5afadda88c139f79ce33cfac1b5d20ab`.

## Student practice

The four-note 440 Hz performance and six-note 444 Hz retained correction are
the existing original motifs in `src/audio/student-wall.js`. Their bowed
recollection is generated locally; no third-party recording or new narrator is
used.

## Measured visual response

`tools/chunk_surfer/build-standing-tear-memory-envelopes.py` decodes the shipped
recordings and measures 20 Hz RMS envelopes. The renderer reads those envelopes
at the same repertoire clock used by playback. These data are amplitude
measurements, not an invented musical tempo or a transcription of the score.

## Sources rejected during verification

- The downloaded CC0 **Allemande** was superseded before any asset was shipped.
- Ben Goldstein’s Chaconne is **CC BY-SA 3.0**, rather than the required permissive attribution licence.
- Historic Heifetz, Grumiaux and Szeryng leads were not used: European public-domain labels did not establish worldwide rights to those recordings.
