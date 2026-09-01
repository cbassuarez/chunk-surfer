# Sheet music recordings

The five sheet-music pieces in `src/data/sheet-music.js` play a real recorded
performance when the player looks at them (`src/audio/sheet-voice.js`). Every
one is an 11-second excerpt, downmixed to mono at 32 kHz, from a recording that
is public domain, CC0, or CC BY. Nothing here is share-alike and nothing here is
public domain in the EU only.

Sources were verified against the Wikimedia Commons API (licence, author and
date) before download, not assumed from a page badge.

| # | Piece | Performer | Licence | Source |
|---|---|---|---|---|
| 1 | J. S. Bach — Goldberg Variations BWV 988, Aria | Kimiko Ishizaka | Public domain (CC0, Open Goldberg Variations) | [Commons](https://commons.wikimedia.org/wiki/File:Goldberg_Variations_01_Aria.ogg) |
| 2 | C. Monteverdi — Lamento della Ninfa | Trisdee (Commons) | CC BY 2.5 | [Commons](https://commons.wikimedia.org/wiki/File:Monteverdi_-_Lamento_della_Ninfa.ogg) |
| 3 | J. Dowland — Flow, my tears | uncredited soprano and lute, 2004 | CC BY 2.5 | [Commons](https://commons.wikimedia.org/wiki/File:Flow,_my_tears.ogg) |
| 4 | F. Couperin — L'Art de toucher le clavecin (1716) | David Joseph | CC0 | [Commons](https://commons.wikimedia.org/wiki/File:L%27Art_de_toucher_le_Clavecin_Fran%C3%A7ois_Couperin.ogg) |
| 5 | E. Satie — Gymnopédie No. 1 (arr. guitar) | Michael Laucke, 2001 | Public domain (author's own dedication) | [Commons](https://commons.wikimedia.org/wiki/File:Satie_Gymnopedie_No_1_performed_by_Michael_Laucke.flac) |

## Attribution required

Items 2 and 3 are CC BY 2.5 and **must be credited in the game's credits**. The
required text is carried on each entry in `src/data/sheet-music.js` as
`attribution`, and `test/composure-pool.spec.mjs` fails if a CC-BY piece is
missing one. The credits roll reads them from there, so adding a sixth sheet
cannot silently drop a required credit.

Items 1, 4 and 5 need no attribution, and are credited anyway.

## What was rejected, and why

Recorded here so the same ground is not covered twice:

- **B. Strozzi — Dialogo in Partenza** (Commons, tagged Public domain). Rejected:
  the description states it was produced with a virtual synthesiser and
  soundfonts. It is not a performance. Monteverdi's *Lamento della Ninfa* took
  its place — the same descending-tetrachord lament, sung by a real person.
- **L. Couperin — Tombeau de M. de Blancrocher** and **Froberger's** tombeau for
  the same man (Joan Benson, clavichord). Rejected: CC BY-**SA** 2.0. Share-alike
  on an asset inside a commercial game is a licensing question worth avoiding
  rather than answering.
- **F. Couperin played by Marcelle Meyer** (Paris, 1953–54), tagged Public domain
  on Commons. Rejected: that tag reflects the pre-2013 EU 50-year neighbouring
  right. Under the US Music Modernization Act a 1953 recording does not enter the
  public domain until 2067. EU-only PD is not PD.
- **Wanda Landowska's Couperin 78s** (1934–36, Internet Archive). Rejected: same
  reason. Recordings published 1923–1946 enter the US public domain 100 years
  after publication, so these are 2035 at the earliest.
- **E. Satie — Vexations.** No recording exists on Commons under any licence.
  Gymnopédie No. 1 took its place and keeps Satie in the set.

## Regenerating the excerpts

```sh
ffmpeg -ss <offset> -t 11 -i <source> -ac 1 -ar 32000 \
  -af "afade=t=in:d=0.5,afade=t=out:st=10:d=1,loudnorm=I=-18:TP=-2" \
  -c:a libmp3lame -b:a 64k public/audio/sheet-music/<id>.mp3
```

Offsets: goldberg 0.6s · ninfa 95s (past the tenor's introduction, on the
nymph's lament itself) · flow-my-tears 1.0s · couperin 1.5s · gymnopedie 2.0s.

64 kbps mono is not a compromise here. Every one of these is played back through
a 900 Hz lowpass (`SHEET_CUTOFF_HZ`) because he is hearing it through a wall, so
there is nothing above the filter for a higher bitrate to preserve.
