# ascii-object prototype — read before adopting

Scratch page only. **Not part of the game build**, not imported by anything in
`src/`. Run it with:

    npx vite --config tools/icon-prototype/vite.config.js     # localhost:5199

It mounts canvasui's real `ascii-object` component (fetched from
`https://canvasui.dev/r/ascii-object-react.json`, one 45KB TSX file, one
dependency) against `public/assets/tuning-fork.glb` — chosen because the fork is
already a game asset AND already one of the eleven hand-rolled bag icons, so it
is a direct comparison rather than a demo.

## What it showed

The component works, and the 3D processing is the real thing: a lit studio
render with characters chosen against edges and contours, not a flat trace.

The finding is about SIZE. `drawBagIcon` draws into **12x7 character cells**, and
at that grid an object does not survive — the fork is four scattered characters.
The ladder on the page walks it up:

| grid | reads as |
|---|---|
| 12x7 — today's icon | nothing. four characters. |
| 18x10 | two prongs, ambiguous |
| **26x15** | **a tuning fork. the threshold.** |
| 40x23 | unmistakable |

So this is not a replacement for the bag icons at their current size. It is a
technique for something roughly 4x their area — an item detail pane, the combat
art slot, an inspect view.

## Two constraints if it is ever adopted

- **It needs Three.js and React in the game runtime.** Neither is there today:
  the game is plain JS on its own canvas, React exists only for the studio tools,
  and Three is installed here as a devDependency for this page alone.
- **The VFD font cannot draw the ramp.** `@` is missing outright, and the caps
  only variant on the page reads as a wall of letters rather than a shape,
  because a 5x7 dot font has no density ramp to shade with. Anything adopted
  would need its own font and would not go through `uiGlyph`.
