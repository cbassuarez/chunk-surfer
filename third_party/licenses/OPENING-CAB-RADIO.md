# Opening cab radio

Active temporary programmes are listed in
`src/data/opening-cab-radio-source.js:OPENING_CAB_RADIO_STATIONS` and
`public/audio/opening-cab/credits.json`. They are three piano-four-hand presets
from two performances, plus a separate historical speech station:

- Franz Schubert, *Fantasia in F minor, D. 940*, performed by Awadagin Pratt and
  Lucy Hattemer at the White House Classical Music Student Workshop on
  4 November 2009. The opening (source 1.8–86.8 s) and later (90–412 s) excerpts
  are explicitly two parts of the **same performance**, not different works or
  asserted complete movements. The primary government workshop page labels its
  recording Public Domain. The Commons extract separately specifies CC BY 3.0
  for the performance; that conservative attribution is retained.
  - Primary: https://obamawhitehouse.archives.gov/photos-and-video/video/white-house-workshop-classical-music
  - Extract: https://commons.wikimedia.org/wiki/File:20091104_Awadagin_Pratt_and_student_pianist_Lucy_Hattemer_-_Franz_Schubert_Fantasia_in_F_minor,_1st_and_4th_movements.ogg
  - Licence: https://creativecommons.org/licenses/by/3.0/
  - Original SHA-1: `a175b1b9d944cf6b3d347b668c16bc70e62b1758`, matching the extract record.
- Anton Diabelli, *Melodious Exercises, Op. 149 No. 26, Allegro*, credited to
  PianoMelodyNotes Gabry. The recording-specific Commons page grants CC BY 3.0
  and identifies the original YouTube channel. The original YouTube page could
  not be retrieved in this pass; the explicit Commons licence is the available
  reuse statement. The first 79.2 s of the 80.089 s source retain the piece with
  a short end fade; this is not described as a different performer's recording.
  - Source: https://commons.wikimedia.org/wiki/File:Piano-Diabelli_4_mani_op.149_N.26_Allegro.webm
  - Original channel: https://www.youtube.com/watch?v=xstjmi9r0W4
  - Licence: https://creativecommons.org/licenses/by/3.0/
- NASA, *Apollo 8 Christmas Eve broadcast*, 24 December 1968. William Anders,
  Jim Lovell and Frank Borman; NASA audio courtesy Kipp Teague. The entire
  115.56 s primary MP3 is retained, with level reduction and short edge fades.
  NASA identifies its historical audio as generally not copyright-protected
  in the United States. The source publication and NASA's independent
  transcript identify this as the crew's Genesis reading and closing message.
  No agency marks, BBC identity, current local news or endorsement are implied.
  - Primary source and direct audio: https://www.nasa.gov/missions/apollo/part-3-apollo-8-the-far-side/
  - Direct MP3: https://www.nasa.gov/wp-content/uploads/2018/12/ap8_christmas_eve.mp3
  - Transcript: https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo8_xmas.html
  - Media guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/

All active derivatives are 44.1 kHz stereo 128 kbps MP3. Diabelli is reduced
10.5 dB and Apollo 8 7.4 dB to approximate the Schubert programme level without
compressing the original piano phrasing. The runtime projects the programmes
through one mono dashboard speaker. Excerpts have short edge fades; no pitch
or timing change is applied. Human listening and the native mix are separate
validation from successful decoding, level checks and source attribution.

The earlier unused candidate remains attributed below for provenance. Its
derivative is excluded from the bundled audio.

Earlier candidate: Joseph Haydn, String Quartet in D major,
Op. 64 No. 5, “The Lark”, II. Adagio cantabile, performed by the Musopen String
Quartet. The recording is marked as released into the public domain by the
rights holder, under Public Domain Mark 1.0.

- Source and recording-specific licence: https://commons.wikimedia.org/wiki/File:Haydn_StringQuartetInDMajorOp.64_JosephHaydn-StringQuartetInDOp.645H363Lark-02-AdagioCantabile.ogg
- Original recording: https://upload.wikimedia.org/wikipedia/commons/f/f0/Haydn_StringQuartetInDMajorOp.64_JosephHaydn-StringQuartetInDOp.645H363Lark-02-AdagioCantabile.ogg
- Licence marker: https://creativecommons.org/publicdomain/mark/1.0/
- Verified original SHA-1: `84c5d019d774ee6dd5935d7ca7bd7d0fc9b98a2c`
- The unused derivative is not bundled. The original is retained only in task research.
- Changes: Ogg-to-MP3 conversion, 48 kHz to 44.1 kHz; no pitch or timing change.
  The receiver applies mono speaker filtering and short cabin reflections at runtime.

`public/audio/opening-cab/credits.json` retains the complete source and derivative
hashes. In-game credits derive from `src/data/opening-cab-radio-source.js`.

The brief station link currently reuses the existing anonymous editorial
`public/assets/source-drive/radio/music-link.wav`. Its existing
`scratch-manifest.json` identifies it as local stock-system speech, not a final
recorded presenter. It is not described here as a newly cleared or public-domain
voice performance.

The proposed Stravinsky and Sibelius piano-duet performances have not yet been
cleared for bundling. The user approved cleared temporary alternatives. Their
names must not be displayed while substitute audio is playing. A Mozart K. 521
candidate was excluded because the original performer's upload specified
NonCommercial rights despite a mirror's abbreviated licence description.
