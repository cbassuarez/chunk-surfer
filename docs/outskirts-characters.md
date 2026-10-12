# Outskirts characters

The Wrong Fold guard and Overprint body are deforming GLB characters submitted
through the game's prop material, torch shadow, Source world compositor, VFD
encode and final post shaders. The review page at
`/artifacts/outskirts-characters/review.html` exposes those production paths
without advancing the story or changing a save.

## Performances

- **Wrong Fold:** seated beside the seventh lodge, facing the road and the
  approaching player. His torso folds diagonally over his right thigh; his
  strained, sideways face stays outside the lap and turns outward beneath the
  shoulder arch. The force remains
  `smoothstep((t - 1.1) / 1.45)`. Independent pelvis, rib, shoulder, head and jaw
  effort follows the forced twist. The 12-second opening continues into a
  24-second pain performance without returning to the neutral pose. The chair
  supports his pelvis, both boots remain planted, his left palm braces on the
  low side ledge, and his right hand clutches his upper back. Reduced motion
  holds the forced endpoint.
- **Overprint:** three poses from the player's recorded path, visible through
  the wet road. Detours, heading, pauses and gait come from recorded simulation
  time. Moving the replay observer does not change that performance.

HUSH remains bodiless. The Woman and Last Light characters retain their existing
identities and presentation.

## Review

In the review page, inspect the Fold at **1.10 s**, **2.55 s**, then play the
remaining `fold` performance and the separate `writhe` clip. **Reference front
view** frames the seated silhouette from the original study; **Reset camera**
returns to standing eye height. Orbit to inspect the face, garment seams and
hand contact against the actual encounter supports. `Raw physical material pass` checks the
underlying asset; `Finished physical view` checks the actual game finish.
`Torch shadow map` exposes the same deformed pose used for the torch shadow.

For Overprint, inspect `walk`, `idle` and `turn`. The physical view uses the
production puddle compositor; the mirrored pass exposes its three submitted
body poses. This isolated page does not validate story progression, collision,
or the pixels of a saved video export.

The in-game God menu includes **OUT — WRONG FOLD APPROACH** for review with the
actual lodge geometry, traversal and encounter state.

## Sources and rebuilding

The source scene is `assets/source/outskirts-characters.blend`. Regenerate with
Blender 4.5 LTS using `tools/chunk_surfer/characters/build-outskirts-characters.py`.
The anatomy, original UV textures, garments and skin envelopes use credited
MakeHuman CC0 sources; the compact rig mapping and performances are adapted for
this game. See `public/assets/outskirts-characters/CREDITS.md` and the source
manifests under `tools/chunk_surfer/character-sources/`.

Finite human effort and cloth recordings are rebuilt with
`python3 tools/chunk_surfer/build-character-audio.py`; attribution, processing
and hashes are in `public/assets/audio/outskirts/fold-credits.json`.

## Validation

`test/character-production.spec.mjs` checks the real exported geometry, weighted
contacts, clip seams, animated bounds and excessive triangle-edge stretch.
`character-asset` and `character-renderer` cover parsing, independent palettes,
submission parity, device limits and resource cleanup. The `outskirts-*` checks
cover traversal, encounter state, sound, bounded recording history, saved causal
tape round trips and replay independence. Rendered appearance and actual device
frame rate require visual review in addition to these checks.
