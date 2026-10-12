# Recordist circuit: presentation option packs

October 12, 2026. **Quiet Threshold was selected and implemented.** Field Monitor remains an unimplemented alternative. The comparison below records the approved presentation contract; the prototype scene picker is a design-review control and is not part of the game. The controlling design is [the recordist circuit blueprint](/Users/seb/chunk-surfer/docs/plans/recordist-circuit-follow-up.md).

Both preserve voluntary entry followed by commitment, four distinct worlds and the changed hall, deterministic doors, backtracking without reset, exact final road return and saved local poses. Pacing remains hall 2–3 minutes, tape 3–4, broadcast 2–3, ash 3–4, returning hall 2–3: a 12–18-minute play target, never mandatory waiting. Neither adds a task, puzzle, reward, dialogue choice or witness requirement.

Neither pack takes camera control or blocks walking during listening and handover. The returning hall keeps its exact geometry, recognizable machine wear and permanent safe exit.

## Shared control and information contract

The existing defaults are verified in [bindings.js](/Users/seb/chunk-surfer/src/game/bindings.js:13): **E** interacts, **R** operates the recorder, **ESC** pauses. Controller equivalents are the south face button, right trigger and menu button at [line 89](/Users/seb/chunk-surfer/src/game/bindings.js:89). Every displayed binding must come through [inputPrompt()](/Users/seb/chunk-surfer/src/game/bindings.js:456), reflecting remapping, active device and controller family. The examples below use keyboard defaults only. Movement and look retain the game’s existing controls.

R toggles the machine up or down near the working recordist. One press starts listening; movement remains available; no button is held. A partially heard visit offers resume rather than restarting the take. The recording has one fixed fourteen-second master; nine audible seconds earn the saved evidence. The later archive resolves the same PCM. Pause and hidden-window time cannot advance listening or choreography. Resuming a paused or reloaded visit must not start sound without the player’s recorder action.

Meters show actual left/right audio level from the monitored signal. They never fill with elapsed listening, indicate remaining seconds or become a completion bar. Neither pack shows world numbers, visited-world counts, route arrows, waypoints, objective lists, escape countdowns or a handover progress display. UI remains clean and legible above the game’s material rendering.

## What differs

| Presentation | Quiet Threshold — recommended | Field Monitor |
| --- | --- | --- |
| Normal view | Almost clear. One contextual object label/action appears near the focus region. | A stable, compact bottom action rail retains the same position; available actions update in place. |
| Raised recorder | A narrow live-level strip, two channel marks and a short state label. | A compact DA1000 panel at lower left: separate L/R levels, source label and plain listening/recorded state. |
| Captions | Lower center, event-led and brief, with generous reading time. | A consistent caption lane with optional stronger source labels and longer persistence. |
| Navigation | Architecture, cable, footfall material, sound and door identity carry direction. | The same environmental navigation; the rail clarifies available controls without naming destinations. |
| Visual weight | Fine rules, restrained amber, little background coverage. | An opaque charcoal instrument plate, clear pale type, restrained amber and the existing monitor accent. |

## Exact proposed copy and state behavior

The copy below is functional interface text, not new spoken exposition. Object names appear only when that object is genuinely focused. Door actions follow their actual state: inspect when inspection is available, open when closed and operable, and no false open action once the passage is already open. Walking through a threshold performs the passage; neither pack adds an interaction that teleports the body.

| Moment | Quiet Threshold | Field Monitor |
| --- | --- | --- |
| Outside the invitation | `SERVICE DOOR` with `[E] INSPECT` or `[E] OPEN`. Before crossing, one short notice: `The way back changes after crossing.` | The same notice. Rail: `[E] INSPECT` or `[E] OPEN` · `[R] RECORDER` · `[ESC] PAUSE`. |
| First hall | Focus may name `CONCERT CHAIR` or `LOOSE LEAD`; show `[E] INSPECT` only when authored inspection exists. No scene title stays onscreen. | The rail retains its position and updates the interaction verb. No hall checklist or stage counter. |
| Any world door | `SERVICE DOOR` and its available action, retaining its physical identity across passages. | Same label/action in the fixed rail’s interaction slot. No destination preview, compass or route number. |
| Tape/broadcast walking | No navigation overlay. Caption examples: `[Tape draws against a reel.]`, `[A relay clicks by the mast.]` | Same events; optional source treatment: `BY THE REEL — Tape draws against a reel.` or `BY THE MAST — A relay clicks.` No arrows accompany these labels. |
| Near the ash recordist | `[R] RAISE RECORDER`. After partial listening: `[R] RESUME LISTENING`. | The same recorder verb replaces `RECORDER` in the rail. The instrument panel remains absent until raised. |
| Listening starts | Thin strip: `MONITOR` with live L/R levels; contextual action becomes `[R] LOWER RECORDER`. | Panel: `DA1000`, `SOURCE: OTHER MACHINE`, `LISTENING`, live L/R levels. Rail: `[R] LOWER RECORDER` · `[ESC] PAUSE`. |
| Partial listening resumes | Brief state text: `LISTENING RESUMED`, then `MONITOR`; actual audio resumes at the saved offset. | Panel briefly reads `LISTENING RESUMED`, then `LISTENING`. No fraction, elapsed counter or reset animation. |
| Evidence receipt | Brief `RECORDING KEPT`, then return to the live strip while raised. | Panel state becomes `RECORDED` while the actual audio and levels continue. Lowering removes the panel. |
| Changed-hall handover | No instruction to watch or press. Caption actual sounds, for example `[The recorder settles against wood.]` | The action rail stays unobtrusive. The instrument panel appears only if the player has actually raised the recorder; it cannot cover the transfer. No `HANDOVER COMPLETE` notice. |
| Cleared floor and exit | Focus label `EXIT DOOR`; `[E] OPEN` only if necessary. The lit physical passage remains usable indefinitely. | Same exit label/action in the rail. No `ESCAPE`, flashing warning or shrinking timer. |

## Layout and accessibility

Quiet Threshold places its two-line contextual label in a restrained focus region, clamped inside a safe screen margin. It must not sit on hands, recorder wear or the door handle. The raised strip is narrow enough to preserve the player’s view of the working machine. Captions occupy a separate lower-center lane; label and caption collisions resolve by moving the label, never by dropping essential text.

Field Monitor reserves a shallow bottom rail and a compact lower-left panel only while raised. Keep the panel footprint stable across listening, resume and receipt. Captions sit above the rail with enough width for two readable lines. Stronger source captions are an optional accessibility preference, not an advantage exclusive to this pack. Both packs support the same caption content, contrast, scaling and reading time. No essential sound relationship relies on pitch recognition or color alone.

Controller prompts use the active family and remaps immediately. Rail actions are direct buttons, not a new Tab/Q carousel. Pause retains the game’s menu and saves the circuit state; neither pack adds another pause interaction. Reduced motion removes unnecessary meter peak animation and UI fades while preserving genuine level information, readable transfer staging and a safe exit. World collapse uses the same authoritative visibility/collision/focus phase in both packs.

## Implementation priorities and selection

Build one presentation state model from real focus, recorder state, audio level, caption events and durable listening receipts, then implement the selected pack. This proposal does not add an in-game pack selector or require shipping both renderers. Implement remapped prompts and caption-safe layout first. In the changed hall, the interface reflects existing recorder state only; it introduces no additional interaction or handover requirement. Preserve the existing tape, ring response and Cathedral opening exactly once.

Quiet Threshold was selected so spaces, hands and sound carry the scene. Field Monitor remains an alternative for persistent control placement and a larger machine face. Field Monitor’s main risk is becoming an objective dashboard; Quiet Threshold’s is hiding a usable recorder action. Validate the selected presentation with an unfamiliar player reaching the ash interaction, resuming partial listening, noticing the handover and finding the final physical exit without coaching. An attractive mockup alone does not establish that acceptance.
