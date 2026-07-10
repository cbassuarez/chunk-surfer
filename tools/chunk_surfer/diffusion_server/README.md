# chunk-surfer diffusion-lens server

GPU half of the M1c streaming layer, **live on Modal**. The browser renders
the raymarched base (`?renderer=3d`), streams 512² JPEG frames here over
WebSocket, and composites the returned img2img restyle on an overlay
(`src/net/diffusion.js`). Everything degrades to the base render if this
server is absent — the lens is optional by construction.

## Current deployment
- URL: `wss://cbassuarez--chunk-surfer-lens-lens.modal.run`
- Token: `.lens-token` (gitignored) → Modal secret `chunk-surfer-lens` / `LENS_TOKEN`
- Play: `/labs/chunk-surfer/index.html?renderer=3d&diffusion=wss%3A%2F%2Fcbassuarez--chunk-surfer-lens-lens.modal.run&dtoken=<token>`
- Measured (A10G): ~25ms/frame server-side (sd-turbo + TAESD tiny VAE,
  1 UNet pass at strength 0.5, fixed seed 7 for temporal coherence);
  ~8.5fps end-to-end (client capture-bound). Cold start ~60–90s; container
  scales to zero 2 min after disconnect (~$1.10/hr only while playing).

## Deploy / iterate
```
.venv/bin/modal deploy modal_app.py     # redeploy (image cached: seconds)
.venv/bin/modal serve modal_app.py      # dev loop with hot reload
.venv/bin/modal app logs chunk-surfer-lens
```
`SERVER_REV` in server.py is echoed in the connect status JSON — bump it on
protocol-visible changes; warm containers can serve one stale session across
a redeploy.

## Tuning the lens (the whole point)

The lens is a **feedback instrument**, not a filter. The client blends the
previous *hallucinated* frame back into the conditioning image (`feedback`,
warped by `drift`), and the server walks the seed every frame. Stability is
not the goal — the texture must never settle.

Measured behaviour of each knob (sweep run 2026-07-09, screenshots in the
session scratchpad):

| knob | low | high |
|---|---|---|
| `strength` | geometry survives, restyle only | **>0.6: corridor dissolves entirely** — the model free-associates a giant face |
| `guidance` | 0 = tidy, obedient interior (sd-turbo's native CFG) | **>2: saturated neon skull posters.** Kitsch, not dread |
| `feedback` | frame-independent boiling | loop self-converges into a *clean* dreamed room |
| `passes` | fast, faithful | slow, departs from geometry |
| seed | `fixed` pins the noise → stable, boring | `walk` (default) → surfaces boil |

**Explore defaults (`strength 0.42, guidance 1.2, passes 1, feedback 0.18,
drift 0.5, seedMode fixed`)** keep the corridor navigable — the model repaints
the walls that are actually there rather than inventing new ones.

Three rules learned the hard way:

1. **Never composite the base render back over the styled frame.** It seems
   like the obvious way to restore geometry ('luminosity' blend: engine
   luminance, lens colour). It is not: once the styled frame has drifted even
   slightly, you are blending two misaligned images and the result is a hard
   double exposure — black wedges stamped across walls that moved. Navigability
   must be bought *upstream*, with low `strength` and low `feedback`.
2. **Pin the seed per zone** (`seedMode: 'fixed'` + `ZONE_SEEDS` in
   zone-prompts.js). Otherwise a world is a different world every time you
   walk into it and the setting never accumulates. Texture crawls; geography
   does not.
3. **No characters, ever, from the sampler.** With an empty negative prompt
   the model stages a standing figure at the end of the hallway on its own
   initiative. Striking — and unusable: a cast introduced by a sampler is not
   a cast. `NO_CHARACTERS` (diffusion.js) is the default negative; only
   `battle` and `rupture` override it, because those are scenes we authored.
   Note negative prompts only apply when `guidance > 0`, so explore/calm keep
   guidance ≥ 0.8 for exactly this reason.

Prompt rules live in `src/net/zone-prompts.js` — the short version: never say
"psychedelic / iridescent / fractal / neon" (sd-turbo hears *acid poster*),
always state darkness explicitly (diffusion brightens), and name materials
that should not be architecture.

Live tuning from the console, no reload:
```js
window.__diffusion.tune({ feedback: 0.7, guidance: 2.0, strength: 0.6 })
window.__diffusion.resetFeedback()   // clear the accumulated dream
```
URL params: `dstrength dguidance dpasses dfeedback ddrift dprompt`.

## Hard-won pins & pitfalls
- diffusers 0.31 requires `transformers==4.46.3` + `huggingface_hub==0.26.5`
  (newer transformers removed `FLAX_WEIGHTS_NAME`).
- sd-turbo img2img: `int(steps × strength) ≥ 1` or the scheduler produces
  zero timesteps (`reshape tensor of 0 elements`). Use `ceil(1/strength)`.
- Worker-task exceptions must be caught and surfaced as status JSON — an
  unawaited task dies silently and the stream just never starts.
- A warm container can serve stale code across a redeploy. `SERVER_REV` is
  echoed in the connect status JSON — check it before concluding a change
  "did nothing". Bump it whenever server behaviour changes.

## Next (with game content, M4+)
- Per-area prompts: client `setPrompt()` already exists; wire to narrative
  registers (straight/ironic/decay/refusal = four looks).
- Optional Cloudflare gatekeeper (budget ledger, queue) if demo links leak.
- `Dockerfile` is a provider-agnostic fallback (RunPod-style pods).
