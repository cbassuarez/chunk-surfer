# Bell tower asset register

## Development ringing bed

- Runtime route: `/__dev/change-ringing-peal.wav`
- Local source: `/Users/paul/Desktop/change-ringing-peal.wav`
- Override: `CHUNK_SURFER_CHANGE_RINGING_WAV`
- SHA-256: `3c919418ae4e23a02751e87bcf0366c0046d2fd8450f58a37f17c28ea348e639`
- Format: stereo, 48 kHz, 32-bit float WAV
- Duration: 815.306708 seconds
- Status: local development reference supplied by the project owner; not copied into `public`, `dist`, the prop pack, or a release bundle.

The Vite development server streams this file with byte-range support. It is now
only a fallback while the one-shot bank is absent or still loading. Once a
complete manifest decodes, the runtime pauses the bed and uses the synchronized
one-shots. Per-bell strike records remain the authority for animation, collision,
audio and acoustic semantics.

## Full-circle assembly model

Selected intake/reference candidate:

- **Church Bell with frame**, by `leadinglights`.
- Primary listing: <https://www.printables.com/model/160174-church-bell-with-frame>
- Original Thingiverse listing: <https://www.thingiverse.com/thing:281323>
- Verified listing license: Creative Commons Attribution 4.0 International;
  remixing and commercial use are permitted with attribution.
- The listing contains 13 files. Relevant separated parts include `NewBel.stl`,
  `Newheadstock.stl`, `BellWheelSolid`, wheel cheeks and representative frame
  pieces. The author describes it as an English church bell for full-circle
  ringing and explicitly notes that the supplied frame is representative.

This is the best mechanical match found because it was authored specifically as
an English full-circle ringing assembly rather than as a decorative hanging
bell. Before shipping an adaptation, retain the downloaded license and source
archive, add `leadinglights` attribution to the in-game credits, retopologize the
print meshes for realtime use, preserve separate pivots, and pass the imported
parts through the project GLB provenance and triangle-budget checks.

The current `conservatory-props.glb` therefore uses project-native articulated
placeholder meshes for the bell, wheel, clapper, headstock bearings, frame,
stays, sliders, ropes, shutters and winch. They preserve the final independent-pivot runtime
contract and can be replaced mesh-for-mesh after the licensed intake is ready.

The active placeholder frame now has five posts forming four bays in each of two
rows. All eight gudgeon axes are at 15.3 m, centred at physical `(92.5, 62.5)`,
with four bells on each side of the frame. Bell, wheel, clapper and stay share an
authoritative moving pivot; sliders remain fixed in the frame.

## Production change-ringing stems

The runtime consumes contact-aligned one-shots, not a pre-performed touch. The
score owns the timing and schedules each buffer 200 ms ahead; animation reaches
the authored `strikePhase` at the same timestamp. The present long WAV remains
an intentionally unsynchronised development bed.

### Current shippable prototype bank

`public/assets/audio/bell-tower/manifest.json` now activates 16 bundled mono
48 kHz/24-bit one-shots. They are derived from two pinned CC0 recordings of one
real tower bell at La Loupe, France, recorded by Joseph SARDIN and Axeline T. The
source hashes, URLs, transformations and limitation are shipped beside them in
`public/assets/audio/bell-tower/credits.json`.

This bank is deliberately labelled a prototype: the source is a stationary
clock-hammer bell, not a moving English full-circle bell. Its clean single blow
and alternate attack were contact-aligned, tuned as a coherent temporary ring,
and assigned one common physical gain taper rather than normalized bell by bell.
It is legally shippable and synchronized, but should still be replaced by the
commissioned handstroke/backstroke session described below.

Regenerate the checked-in bank with `npm run assets:bell-stems`. The script pins
both source SHA-256 values and stops if either upstream file changes.

### Minimum delivery: 16 tonal files

- Eight bells × handstroke and backstroke.
- Names: `bell-01-hand-01.wav` through `bell-08-back-01.wav`.
- Mono Broadcast WAV, 48 kHz, 24-bit PCM or 32-bit float.
- One consistent close-mic perspective, without baked limiting or denoising.
- At least 12 seconds of unobstructed decay; 18–20 seconds is preferable for
  the tenor.
- Conservative common gain, with no clipped attacks. Do not loudness-normalize
  the treble and tenor into equal apparent weight.
- Either trim sample zero to the clapper/casting contact or provide the exact
  zero-based `contactOffsetSamples` in the manifest.
- Record isolated test blows with the bell moving through genuine handstroke
  and backstroke. A stationary clock-hammer strike is a separate instrument and
  cannot substitute for either.

Preferred delivery is two to four round robins per bell/stroke: 32 or 64 tonal
files. Keep every take at the same sample rate, bit depth, polarity and mic
placement. The runtime selects round robins deterministically from row/place, so
reloading never rerolls the sound.

### Separate mechanical and acoustic material

These do not replace the 16 tonal files, but they prevent the bell buffers from
having to carry every perspective:

- handstroke/backstroke rope and sally pulls;
- wheel and bearing motion;
- stay/slider contacts and frame impulses, with several variations;
- shutter/winch open, strain, pawl and settle sounds;
- optional swept sine/impulse responses for bell chamber, ringing room, nave
  and exterior.

Prefer dry or close tonal recordings. A single baked tower reverb in every bell
file makes the runtime's chamber, nave and exterior shutter transmission
impossible to mix independently.

### Manifest contract

The implemented schema and validator live in
`src/audio/bell-stem-manifest.js`. A complete ready-to-fill template is
`docs/bell-stem-manifest.example.json`. Each entry records bell, stroke,
variation, bundled asset URL, contact offset, calibration gain and license ID.

When final moving-bell files arrive:

1. Put them under `public/assets/audio/bell-tower/` during intake.
2. Fill the manifest offsets, gains and license IDs.
3. Replace the colocated `manifest.json`; the runtime discovers it through
   `src/audio/bell-stem-assets.js` and resolves stem URLs relative to it.
4. Verify the asset license files are shipped beside the production credits.
5. Remove the development-bed URL only after all 16 required slots validate and
   decode as mono 48 kHz files of at least 12 seconds.

### Acquisition order

1. **Best:** commission an isolated recording session at one real English ring
   of eight. Start with a local association/tower captain via the
   [CCCBR affiliated-societies network](https://cccbr.org.uk/about/affiliated-societies/).
   Ask for explicit perpetual interactive-game rights, raw isolated strikes and
   the associated mechanical layers.
2. **Specialist introduction/access:** ask
   [John Taylor & Co.](https://taylorbells.co.uk/filming-and-photography/). Their
   site says filming/photography access is assessed case by case; an enquiry is
   the right route for a supervised technical recording or a referral to an
   appropriate tower. Their [bell-sounds page](https://taylorbells.co.uk/bell-sounds/)
   is reference material only unless Taylor grants a separate reuse license.
3. **Supplemental library material:**
   [Sound Ideas Church Bells](https://sound-ideas.com/products/church-bells-series-sound-effects)
   supplies 200 royalty-free British church/tower recordings in BWF up to
   24/96, useful for exteriors, mechanisms and comparison; verify the file list
   before purchase because it does not promise a matched eight-bell stem set.
   [Articulated Sounds: Church Bells from 30 Countries](https://articulatedsounds.com/audio-royalty-free-library/sfx/artbits-church-bells-from-30-countries)
   supplies 34 clean isolated royalty-free recordings, useful for additional
   dry layers, but likewise is not a substitute for a coherent English ring.
