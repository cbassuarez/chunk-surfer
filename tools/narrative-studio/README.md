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
before writing, and rejects saves when a file changed externally. The one
exception is dialogue written in game modules, whose words are saved back into
the module itself (see below).

Useful checks:

```sh
npm run studio:validate
npm run studio:build
node test/narrative-studio.spec.mjs
```

## Conversation patching

**Dialog Select** searches authored conversations and source collections.
**Story** opens the whole-document graph, with declared starts, disconnected
material, joins, return jumps, exits, and unresolved destinations. Progression
is a graph relation, not elapsed time. Generated source entry lists and source
order are not treated as runtime starts or chronology.

- Select a beat, choice, or cable to open **Patch selection**. Choice words,
  availability, spent-answer behavior, flags, cues, owner, and destination are
  editable there. A choice is an independent object with an ownership cable
  and a separate route. Moving it preserves its condition and effects.
- **Patch beat** (or double-click a beat) opens individual line objects and
  their sequence cables. Edit text, speaker, visibility, speech permission and
  prompt, or cues in place. Switch between **First visit** and **On return**.
  Connecting a line output to another line moves the target immediately after
  the source. The collection head moves a line to the beginning. These are
  ordered sequences, not parallel dataflow.
- Right-click the canvas, click **＋ Object**, or press **N** to create.
  Drag an output into empty canvas to create a connected object. A choice
  outlet creates an answer and response; an exit outlet creates an exit
  terminal. Creating from a connected route preserves its old destination.
- Select a progression cable and choose **Insert beat in cable**; in a beat
  patch use **Insert line in cable**. Drag either cable endpoint to reconnect.
  Ownership moves by its source end. Caller check failures move by their
  destination end and cannot be silently unplugged.
- Shift-click to select several objects. **Duplicate** / **Cmd/Ctrl-D** gives
  copied objects fresh identities and preserves internal selected routes.
  **Remove…** / **Delete** asks whether incoming routes should end or bypass
  a linear beat. Removing an answer keeps its response. **Escape** cancels
  creation, removal, or an uncommitted text draft.
- Text commits on blur, Enter for a short field, or Cmd/Ctrl-Enter for prose.
  Each field edit or structural command is one undo step. Cmd/Ctrl-S commits
  the focused field before saving. Invalid condition drafts block Save.
- **Fit scene**, **Focus selected**, **Fit beat**, and the minimap connect the
  whole-scene overview to working zoom. Each beat patch retains its view, and
  **← Scene overview** returns to the same scene position. **Edit form** and
  **Full inspector** retain access to the existing full property editors.
- **Save flow layout** stores an arrangement explicitly. Dragging objects
  stores their positions independently of prose. Unplaced objects receive
  fallback positions; opening a scene does not rewrite its layout.

**Conversation probe** runs the production conversation cursor under supplied
flags: line visibility, speech permission, choice banks, revisit prose, and
spent answers use the actual controller. Choice flag callbacks are supplied by
the probe. World actions, custom checks, beat effects, and caller exit handlers
remain explicitly named boundaries. This is not a simulation of the world.

Dialogue still authored in JS has literal word writeback through **Edit form**.
Its structural patch controls are disabled: order, routes, conditions and new
objects must be changed in the named module. Computed strings remain locked;
code-built placeholders must survive word edits. Saves compare each literal
with the current source and refuse conflicts. Source refresh preserves dirty
Studio documents. Canonical document structure uses the existing narrative
schema and runtime adapters, with no second execution graph to keep in sync.

The chassis, controls, sockets and cable curves reuse the actual game's
field-case and patchbay painters. See [PATCH-EDITOR.md](PATCH-EDITOR.md) for
object/port semantics and source findings, and
[VERIFICATION.md](VERIFICATION.md) for concrete checks and usability limits.

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
