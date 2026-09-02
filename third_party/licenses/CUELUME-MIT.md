# cuelume

The interface cues — moving a selection, committing to a row, backing out, and
a refusal — are played by [cuelume](https://www.npmjs.com/package/cuelume),
MIT-licensed, by Daniel Belyi. Seventeen sounds synthesised live with the Web
Audio API; no audio files ship with it.

Used through `src/audio/ui-cues.js`, which maps four of them:

| verb | cue |
|---|---|
| `menuMove` | `tick` |
| `menuConfirm` | `toggle` |
| `menuBack` | `press` |
| `menuDenied` | `error` |

Its other thirteen — `chime`, `sparkle`, `droplet`, `bloom`, `whisper`,
`success`, `page`, `loading`, `ready`, `pulse`, `scan`, `arrival` — are
deliberately unused. The doctrine in `src/audio/story-audio.js` is that these
menus are "a tape machine at idle … rather than arcade bleeps", and the warmer
half of cuelume's palette is the opposite of that.

`bind()` is never called: it wires `data-cuelume-*` DOM attributes, and this
interface is a canvas.

The licence text ships in `node_modules/cuelume/LICENSE`.
