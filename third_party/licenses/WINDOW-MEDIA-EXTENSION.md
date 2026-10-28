# Pressure performance window media

These two additions preserve the ten existing window-media records. The game
loads local derivatives only; it makes no runtime request to the source sites.
Both additions have silent WebM and MP4 versions plus a local PNG poster.

| Local ID | Original material / credit | Primary rights evidence | Changes |
| --- | --- | --- | --- |
| `mimosa-response` | Brandizzi, *Mimosa pudica leaves folding when touched 1* (2009) | [Creator's own-work file page](https://commons.wikimedia.org/wiki/File:Mimosa_pudica_leaves_folding_when_touched_1.ogv), licensed [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/); the offered GFDL alternative is not used. | Source seconds 8–12; native spatial crop x80/y40/480×320; silent 15fps VP9/H.264; poster from source9.5s. No generated plant motion, interpolation or loop dissolve. |
| `performance-capture` | William Kennedy-Laurie Dickson / William Heise, *Dickson Experimental Sound Film* (1894–95); restoration supplied by Walter Murch and Sean Cullen | [Original archive deposit](https://archive.org/details/dicksonfilmtwo), whose metadata explicitly selects the former [Creative Commons Public Domain Dedication](https://creativecommons.org/licenses/publicdomain/). [Commons delivery description](https://commons.wikimedia.org/wiki/File:DicksonFilm_High.ogv) independently records the restorers' public-domain release. | Source seconds66–78 of original `DicksonFilm_High.mov`; crop x68/y0/480×360 removes delivery side borders; silent15fps VP9/H.264; poster from source69s. Excludes introductory explanations, credits, later repetition and the entire audio stream. |

The historical film is identified by the [Library of Congress item
00694117](https://www.loc.gov/item/00694117/), but **our delivery is the original
archive depositor's restored MOV**, not the LOC silent master. LOC's direct
delivery was unavailable behind a browser challenge; no challenge bypass was
attempted. The original archive deposit is 70,122,829 bytes, not a claimed
camera original or lossless master. Its restoration and soundtrack are
explicitly covered by the deposit's dedication; the soundtrack is nevertheless
removed entirely from these assets.

The Mimosa input is the creator's 640×480 Ogg Theora/Vorbis upload. Its public
source requests initially returned an explicit instruction to identify the
client. Acquisition succeeded with an honest descriptive User-Agent following
[Wikimedia's robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy),
without authentication or browser impersonation.

Original source files, primary evidence snapshots, acquisition hashes and
contact sheets are retained under `artifacts/window-media-revisit/`. Per-input
and per-derivative SHA-256 hashes are recorded in
`content/media/window-media.media.json`. Rebuild with:

```sh
node scripts/build-window-media-extension.mjs
```

The script uses the retained sources in
`artifacts/window-media-revisit/source-media/`; it performs no downloading and
rejects source hash or licence-evidence changes. It only replaces its two owned
IDs, preserving every other manifest record. A source-directory argument can
be supplied when rebuilding from separately retained copies of the same files.

The Mimosa excerpt shows touch followed by folding; it is not evidence of
sound causing that movement. The performance excerpt shows a horn receiving a
violin performance; it does not depict an operating tape transport. Native
window choreography, human understanding and final motion acceptance remain
separate from these source and transcode checks.
