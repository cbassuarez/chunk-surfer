# Conversation patch contract

## Evidence and vocabulary

Read `src/data/script-schema.md`, `src/data/opening-prologue.js`, the authored
`content/narrative` documents, `src/game/conversation.js`, `coldopen.js`,
`thoughts.js`, and `src/narrative/runtime-content.js` together. The schema notes
describe intent; the controller determines execution. The generated runtime
exports are an index of source material, not an independent script.

The controller has an ordered line cursor and an ordered choice bank. In node
mode, `who: me` with `say !== false` asks permission to speak before uttering
the line. `prompt` is its picker caption, not another branch. A line condition
filters that line; a choice condition filters that answer. A return to a hub
uses `revisitLines`, or skips the original greeting and opens the question
bank. `hideWhenAsked` hides a spent answer. `goto` changes the cursor's node;
there is no return stack, concurrent execution, or synchronization barrier.

`onLine`, `onChoice`, and `onDone` belong to callers. Choice mutations and exit
events are dispatched by those callers, not magically by the graph. Node
conditions/effects, dynamic builders, choice checks and callback properties
must retain that distinction. The patch inspector exposes those properties;
the conversation probe logs callback boundaries and does not simulate world
actions. A generic executor preview alone cannot prove game behavior.

## Objects and ports

| Object / port | Meaning, ordering and limits | Disconnected behavior |
| --- | --- | --- |
| Beat / dialogue input | Any number of incoming jumps; each arrival executes one visit. A join is a shared destination. | Preserved, marked disconnected from declared starts. |
| Beat / continue | At most one `goto` or exit, after lines when no question bank is active. | Completes this branch / returns control to the caller. |
| Beat / choices | Ownership of an ordered bank; many answers, one owner per answer. Reparenting preserves the answer and its route. | A removed answer's response beat stays in the document. |
| Choice / response | One destination or exit; evaluated only after a visible, enabled answer is chosen. | Ends the branch after the answer callback. |
| Choice / availability | Inline expression plus spent/disabled state. Not a false/true execution fork. | Empty expression means available. |
| Line / next line | Exactly one ordered slot in `lines` or `revisitLines`; connection moves the target immediately after the source, preserving other lines. | Lines cannot float outside an owner; remove or move collection explicitly. |
| Line / first | Collection head. Connecting here moves a line to index zero. | Empty collection proceeds to the bank or continuation. |
| Speech decision | A `me` line's permission and prompt, inline on the line object. | `say: false` utters directly. |
| Return prose | Separate ordered collection of the same beat, used on a revisit. It is not a normal successor. | A hub reopens its bank without repeating the greeting; other beats repeat normal lines. |
| Exit terminal | Named callback event or plain completion; accepts many routes. | Unused terminals are editor-only patch points. |
| Conditions, effects, cues | Inline on their owning line / choice / beat, with timing and source context. | Absence has no effect. No invented dataflow cables. |

Source-derived collections have literal word writeback but no structural
writeback. Their structural controls are explicitly unavailable, with the
module named. Computed words remain locked. No editable-looking structural
objects are offered when saving them would be refused.

## Editing operations

Every command returns a new document and layout together; App records one
history frame. Cancel never sends a command. Line order changes rewrite only
the owning array. IDs and all non-edited properties travel with the object.
Creating and inserting beats uses the existing schema; no second execution
graph is saved. Positions for beats, choices and internal lines remain in the
layout file. Duplication allocates fresh content IDs and retains outgoing
references. Deletion asks whether incoming routes should end or bypass to a
single continuation; branching beats cannot be bypassed implicitly.

The scene canvas supports contextual creation, route successor / insertion,
endpoint reconnection, explicit destination selection, multi-selection,
duplication and removal. The beat patch exposes each normal / return line as
an editable object, its sequence connections, speech decision, conditions and
cue properties. The two views retain their own viewport. The form editor is
still available for the full source property set.

## Representative corpus

| Source | Topology / current obstacle | Required evidence |
| --- | --- | --- |
| Dead Radio, 2 beats | Linear; inserting an intermediate beat used to require unrelated form edits. | Insert a beat on its cable; preserve old destination; remove with bypass. |
| First Take, 13 beats | Branches, joins and loops; choices were buried in a master card. | Rewire individual answers, reparent one, preserve the rest. |
| Cold Open, 72 beats | Large question hubs, speech prompts, spent answers and return prose. | Complete graph and editable internal sequences; real return probe. |
| Opening prologue JS | Source table, inherited `...back`, empty terminal, `who` node. | Original table agrees with extracted graph; no inferred source-order links. |
| Door Field, 101 beats | Many separate entries and source-controlled physical actions. | All material visible without invented chronology; meaningful working zoom. |

Correctness comes from source comparison, production controller traces,
command invariants, save/reload and exact undo/redo. Browser task completion
demonstrates operability. Uncoached use by another author is still needed to
establish speed, discoverability and comfort.
