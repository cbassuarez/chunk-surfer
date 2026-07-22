# Chunk Surfer Narrative Studio

Narrative Studio is the local-first authoring environment for dialogue graphs,
endings, audio cue recipes, and gameplay-acoustic behavior. It is development
tooling and is not included in the shipped game UI.

## Start

```sh
npm install
npm run studio
```

The command opens a loopback-only browser app. The terminal owns the local file
service; stop it with `Ctrl-C`. The service uses a per-launch token, restricts
writes to `content/narrative`, `content/audio`, and `content/layout`, validates
before writing, and rejects saves when a file changed externally.

Useful checks:

```sh
npm run studio:validate
npm run studio:build
node test/narrative-studio.spec.mjs
```

## Story Graph

- Pick a document from the left index. Endings, battles, radio trees, room
  listens, playback scenes, and legacy material are all searchable.
- Drag nodes or use **Auto-layout**. Layout changes are stored separately from
  prose so visual organization does not create dialogue merge conflicts.
- Connect a choice handle to another node to change its `goto` target.
- The inspector edits lines, conditions, cues, choices, mutations, and regions.
- **Trace ending** highlights every upstream node that can reach an ending.
- **Runtime preview** uses the same pure narrative executor as runtime adapters.
  Edit the JSON context to exercise flags and variants deterministically.
- `Cmd/Ctrl-S` saves, `Cmd/Ctrl-Z` undoes, `Cmd/Ctrl-Shift-Z` redoes, and
  `Cmd/Ctrl-P` toggles preview.

## Audio Timeline

- Cue recipes and the complete asset bank share one searchable index.
- Double-click an asset to add it to the selected cue.
- Select a timeline layer to edit its source, trim, delay, fades, gain, pan,
  playback rate, loop state, bus, and automation points.
- Double-click the waveform to play/pause it; drag the amber region to change
  non-destructive trim bounds.
- **Audition cue** uses the shared data-driven Web Audio renderer.
- Battle bed, lead, and paired entry gains live in the canonical cue registry;
  runtime timing and eight-bar lead gates remain owned by the battle director.
- The trigger index shows every story or gameplay event that fires the cue.
- `acoustic` metadata is authoritative for what the HUSH hears and remains
  independent from player output volume.

Audio masters under `public/audio` are immutable from the studio. Only cue
recipes are written.

## Content and Git workflow

- `content/narrative/*.story.json` is semantic story source.
- `content/audio/*.audio.json` is the asset/cue/trigger source.
- `content/layout/*.layout.json` contains editor-only geometry.
- Stable IDs are permanent review and save-game identifiers. Rename them only
  through the node inspector so references move atomically.
- Use one branch per story/audio change and review the semantic JSON diff. The
  studio does not commit, merge, or push on anyone's behalf.

`npm run studio:import` is a protected, one-time migration command and refuses
to overwrite an existing canonical project. `npm run studio:reimport` is the
explicit destructive re-import from legacy JS; use it only when intentionally
discarding studio edits.

## Runtime boundary

The game consumes canonical studio documents for the cold open, core
conservatory trees, radio, room-listen, playback, every battle including the
chapel confrontation, authored ending sequences/epilogues, and the audio cue
registry. Only the final ending-choice builder remains on a compatibility
adapter because it assembles prose from live combat proof, pressure, and Source
outcome state; its four route captures remain visible and editable as reference
variants.
