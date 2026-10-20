# Ear room recordings

The ear room (`src/data/stop-listening.js`) is voiced entirely by real
recordings: digestion, a stomach, and wet foley. Every source is CC0 or public
domain released by its author. Nothing here is share-alike and nothing here is
public domain in the EU only.

Each licence was read off the file's own page on 2026-10-18: Freesound's sound
page (licence block, filtered search confirmed CC0), and Commons through the API
(`prop=imageinfo&iiprop=extmetadata` plus the page wikitext), never a badge.
Freesound sources were taken as the site's HQ preview (128 kbps MP3); the
licence attaches to the sound, not the encoding.

| # | Title | Author | Licence | Source | sha256 of the file used |
|---|---|---|---|---|---|
| 1 | gurgles3 | borygmi | CC0 1.0 | [Freesound 409857](https://freesound.org/people/borygmi/sounds/409857/) | `6146d1b296432540e70d6c699315161764a606822406dcdb8c555b20b1c5ef90` |
| 2 | gurgles2 | borygmi | CC0 1.0 | [Freesound 409858](https://freesound.org/people/borygmi/sounds/409858/) | `e81e2a9df5e1a10aaa1a5c54236dadf8c8616302578bdf23314920c743129551` |
| 3 | gurgle1 | borygmi | CC0 1.0 | [Freesound 409860](https://freesound.org/people/borygmi/sounds/409860/) | `c02d8e1e90a8fe22a62314b7fbe5f6a28c342cef0076209291951aa0ddbcf58f` |
| 4 | percolating1 | borygmi | CC0 1.0 | [Freesound 414974](https://freesound.org/people/borygmi/sounds/414974/) | `6aff6cd6b02dde5fc0f9e7d17d881fabb87de23a3dde6e71de4c53cf1db743a3` |
| 5 | groaning1 | borygmi | CC0 1.0 | [Freesound 414975](https://freesound.org/people/borygmi/sounds/414975/) | `c1196d0d17b3ba34764fa6b500c60647702b640ceca3fa2f8a36a3164f983d18` |
| 6 | bubbling1 | borygmi | CC0 1.0 | [Freesound 409859](https://freesound.org/people/borygmi/sounds/409859/) | `1458a63d6c96579a1524bcb52b169ac1229e6b6fbcde1a04a1c0a2f7162051c6` |
| 7 | Squishing.wav | christo13 | CC0 1.0 | [Freesound 485484](https://freesound.org/people/christo13/sounds/485484/) | `eed5a35ad2a86f329b6900004b5a6c04f2605e229accb83a2aebf9adf6c02252` |
| 8 | Gooey Squish | editor_adp | CC0 1.0 | [Freesound 269482](https://freesound.org/people/editor_adp/sounds/269482/) | `9791e09aaaadc35bec351d249bb796d37b2b78b7a6482791228e00ad279dd6e7` |
| 9 | Squeezing a big, wet sponge | cabled_mess | CC0 1.0 | [Freesound 571471](https://freesound.org/people/cabled_mess/sounds/571471/) | `69d584900d04628f4f411e2924a32e5449d1d8a562280ef73f41bf1be0049049` |
| 10 | Tummy Grumble | starlite (pdsounds.org, record 605, 2008) | Public domain (`{{PD-author}}`, Copyrighted False) | [Commons](https://commons.wikimedia.org/wiki/File:Tummy_grumble.ogg) | `edd0cde0a6acbe0db426f6afb6d80c8e396c909800c230f8072337235c488f1b` |
| 11 | slime wet smacking | stephan (pdsounds.org, record 169, 2007) | Public domain (`{{PD-author}}`, Copyrighted False) | [Commons](https://commons.wikimedia.org/wiki/File:Slime_wet_smacking.ogg) | `85e19cf8b8eafcf413992412d09b1661939bbaf305df0bcaf44c33765580546d` |

borygmi's recordings are real digestion, recorded on a phone's bottom
microphone with no noise reduction; gurgles3 carries faint mechanical-keyboard
noise in places (the author's own note), which the gate, the crush and the room
tail mostly bury. None of the authors endorse this game.

All eleven need no attribution and are credited anyway: the game's credits
build their "Sound Effect Recordings" section from `STOP_LISTENING_SOURCES`
(`src/data/credits.js`), and `test/stop-listening.spec.mjs` fails if a source is
missing from it or carries a share-alike licence.

## Rejected

- Every borborygmus recording on Commons found by search (`Borborigmos.wav`,
  `Borborigmos por hambre.wav`, `Hambre.wav`): **CC BY-SA 4.0**.
- `SBOOgg.ogg` and its louder derivative (stethoscope bowel sounds, small bowel
  obstruction): **CC BY-SA 3.0**.
- `Slimy gurgling and retc.ogg` (pdsounds, PD): licence fine, but it is a
  person retching; this room is a gut, not a mouth.

## Processing (`tools/chunk_surfer/build-stop-listening-audio.mjs`)

Decoded to mono 44.1 kHz, 60 Hz one-pole high-pass. Events are cut where the
energy over 20 ms frames clears a gate set from each recording's own floor
(max of 2.8 × the 20th percentile and 8 % of the 99.5th), merged across gaps
under 180 ms, kept between 0.25 and 3.5 s, 40 ms lead and 140 ms tail, cosine
edges, levelled to −20 dBFS RMS under a −3 dBFS peak ceiling. Two 22 s beds are
taken from the steadiest windows of gurgles2 and Tummy Grumble, levelled to
−27 dBFS, tail crossfaded into head.

Light bitcrush, baked: a parallel branch that repeats every third sample (14.7 kHz)
and quantised to 8 bits, mixed in at 32 %, so 68 % of every file is the
original waveform. Encoded 32 kHz mono MP3, 80 kbps. Reverb (a synthetic tail
per room) and placement are applied at runtime by
`src/audio/stop-listening-gut.js`; no measured impulse response is used.

Original files, with their sha256, are kept under
`artifacts/stop-listening/sources/` (not committed).
