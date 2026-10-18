# Physical lettering

`bakeLetteringAtlases(jobs, {outputDir})` rasterizes exact authored copy from
pinned font files or authored broad-nib trajectories. It returns embedded-PNG
buffers, top-left atlas UV rectangles, glyph metrics, and per-entry fabrication
metadata. Missing glyphs fail generation. No host font substitution is allowed.

RGB and pigment coverage are authored independently. The PNG alpha channel is
**pigment coverage**, including antialiased edges. RGB at zero coverage remains
the physical substrate color. Every printed face uses `alphaMode: 'OPAQUE'` and
the canonical `extras.printedSurface` contract; coverage never cuts depth away.
The production loader must preserve unpremultiplied RGB when decoding the PNG.

Compatible printing shares atlas storage across manufacturing processes.
Materials remain process-specific: call `printedSurfaceMetadata(entry)` on an
entry, and reference that entry's shared page textures. Identical factory labels
share a tile; volunteer brush signs retain separate deterministic variations.
Only actual opal telephone panes use `emission: 'substrate'`; ordinary ink does
not emit light.

The board's reader-right and reader-up axes are explicit in
`printedFaceGeometry`. UV origin is top-left, U increases to the reader's right,
and V increases down. The helper supports rectangular, circular and gently
draped physical faces. It never changes world lighting or bypasses the final
dither compositor.

Build the production pack with the usual `node tools/chunk_surfer/build-props.mjs`.
For an isolated candidate, set `CHUNK_SURFER_PROPS_OUT_DIR=/absolute/task/directory`;
the generated geometry module then stays in that directory too. Generation
records source hashes and rejects inputs edited during the build. The default
Python is the bundled workspace runtime when available; another Python with
Pillow and NumPy can be selected with `CHUNK_SURFER_LETTERING_PYTHON`.

`WORLD_INSCRIPTIONS` declares existing per-placement copy in canonical host-local
metres. Imported direct stamps reproject that host's actual UVs, albedo factors,
normal basis and ORM into the print face. At zero pigment, imported word-sized patches retain their sampled host stock
exactly; authored complete carriers receive process-specific substrate finish.
No word-sized patch gains an invented distressed border. Normal
and ORM atlases are deliberately lower frequency than the pigment atlas.
`reliefM` is normal-map relief. The manufacturing registry in
`finish-profiles.mjs` is authoritative: cut mineral uses bounded negative relief
(−0.35 to −0.8 mm), while ordinary deposited pigment uses thin positive relief.
It does not change silhouettes or shadows. `sign-assemblies.mjs` owns real
carrier shape, edges, fixing depth and cloth drape.

Small record faces use up to 512 texels across / 32 texels per requested cap;
new attached signs use 32 cap texels and small direct stamps 24. Existing hero
board and brush resolutions are retained. This is an allocation policy, not
a claim that every inscription is readable at every world distance.

For a concurrent dirty workspace, `merge-production.mjs CANDIDATE OUTPUT`
merges only declared lettering, corrected paper UVs and removed proxy bars into
the currently installed pack. It verifies every non-task primitive rather than
shipping unrelated builder differences. Recheck its recorded base SHA before
installing; update generated geometry, stats, credits and sidecar together.
`build-review-control.mjs` prunes exact archived meshes, retaining separately
loaded original acquisition hosts for overlay comparisons. Source Hall 17 has
no one-to-one archived mesh and is explicitly an acquisition-only comparison.

Checks:

- `node test/physical-lettering-bake.spec.mjs`: determinism, coverage, font
  pinning, tile sharing and explicit missing-glyph failure.
- `node test/sign-lettering.spec.mjs`: actual built copy, masks, opacity,
  forward UVs, normals, winding, source freshness and residency budget. A dry
  candidate can be selected with `CHUNK_SURFER_PROPS_TEST_DIR`.
- `node tools/chunk_surfer/lettering/report.mjs`: current static inventory,
  exact comparison with the archived pre-rollout source, and ranked asset cost.
- `node test/world-inscription-substrates.spec.mjs`: independent UV orientation,
  linear color factors, normal tangent bases, PBR factors and actual host support.
- `node tools/chunk_surfer/lettering/capture-review.mjs`: hash-gated native final
  and raw P3 images of every face, plus Source/Vigil reconstructions and real
  runtime paper atlas samples. Chrome launch may require local process access.

These are carrier tests. Human reading, movement stability and actual final
shader appearance require the separate scene evidence. Stock font outlines are
not claimed as bespoke historically exact signwriter alphabets. Both font
registries retain their upstream sources, hashes and license texts.
