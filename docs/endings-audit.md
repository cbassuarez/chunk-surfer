ENDINGS audit:
## Endings audit

The game currently has five valid, reachable terminal endings. Structurally, the routes work and the focused tests pass. Creatively, they are still short stubs: most endings consist of 4–8 dialogue beats, one shared gate-booth still, shared credits, and a run report. The current beta notice accurately calls them “pretty bare.” [beta-notice.js](/Users/seb/chunk-surfer/src/data/beta-notice.js:73)

### Route map

| Finale action | No coffee | Coffee consumed |
|---|---|---|
| Accept the chapel’s agreement | **The Seal** | **He Tried to Help** |
| Lose the chapel battle | **The Seal** | **He Tried to Help** |
| Begin inversion but miss either deadline | **The Seal** | **He Tried to Help** |
| Complete inversion escape | **The Other Door** | **Cold, Bitter, Gone** |
| Extract the recordist | **The Other Recordist** | **The Other Recordist** |

“Refuse to author another line” is not an ending. It briefly resists, then returns the player to the available terminal choices. [conservatory-script.js](/Users/seb/chunk-surfer/src/data/conservatory-script.js:1551)

---

## 1. The Seal

Classification: **Containment**  
Terminal ID: `sacrifice`

### How it happens

The player is sober and either:

- accepts the chapel’s agreement;
- loses the chapel battle; or
- attempts inversion but fails its timed escape.

The choice does not immediately end the game. The player is sent back to the inner chapel screen and must physically place their hand on it. [main.js](/Users/seb/chunk-surfer/src/main.js:10409)

### What currently happens

- The player completes the sentence the entity has been trying to extract.
- If the player specifically confessed Sarah’s name, they repeat that loss.
- Otherwise, they offer a generic lost person.
- The Surfer thanks them.
- The recorder clicks off.
- The “seal” is revealed not to be the five recordings, but the scheduled demolition closing over a recordist.
- Injury count changes one line: either it identifies which catch the player was, or notes that it never needed to catch them.
- The clock approaches 06:00 and the building closes.

There are twelve generated variants: Sarah/not-Sarah across injury counts 0–5. Each is only six lines. [conservatory-script.js](/Users/seb/chunk-surfer/src/data/conservatory-script.js:1581)

### Gate epilogue

- If the player disclosed nothing, the scene cuts to the guard alone. The player never returns; the right-hand `RETURNED` column stays empty.
- If the player made any disclosure, a client in a good coat closes the account and books the demolition machinery.

### Main authoring problems

- Only the exact confession `Sarah` counts as named. Every other name, reason, feeling, or personal disclosure largely disappears.
- The player’s five takes, Source outcome, HUSH encounters, missing equipment, and room choices have no ending payoff.
- The building’s final occupation of the player has no authored visual or acoustic event.
- There is no final HUSH manifestation, demolition premonition, recorder playback, or embodied transformation.
- The client epilogue is potentially the institutional heart of the ending, but it is five lines long.

---

## 2. He Tried to Help

Classification: **Intervention**  
Terminal ID: `helped`

### How it happens

This is the coffee version of staying:

- accept the agreement;
- lose the chapel battle; or
- time out during inversion.

Coffee does not itself produce the drugged ending. It changes the interpretation of the route the player ultimately completes.

### What currently happens

- The player agrees to stay.
- The coffee remains perceptible behind their teeth.
- They conclude that the guard added a stimulant to protect them.
- The guard understood enough to try, but his intervention was insufficient.
- If Sarah was confessed, the player recognizes that the night was real and that they still surrendered her name.
- Otherwise, the seal closes at 06:00 with the player inside.

The main ending is only four lines. [conservatory-script.js](/Users/seb/chunk-surfer/src/data/conservatory-script.js:1631)

### Gate epilogue

- The guard is no longer bored.
- He has watched the entrance all night.
- He says the player lasted longer than the previous recordist.
- The narration confirms that the coffee was his attempted protection.
- He apologizes.

### Main authoring problems

- The main scene says the player is sealed inside, but the next scene is presented at the gate without a clear point-of-view transition. It reads as though the trapped player is witnessing it.
- The guard’s knowledge, history with previous contractors, motive, and moral responsibility need much deeper development.
- The coffee is explained too conclusively as a protective stimulant. That closes off some of the uncertainty established elsewhere.
- The ending should distinguish voluntary surrender, battle defeat, and failed inversion. Those are emotionally different failures, but presently become identical.
- This should probably be the guard’s defining ending; currently he receives four lines.

---

## 3. The Other Door

Classification: **Inversion**  
Terminal ID: `inversion`

### Eligibility

The player needs the bent rig and either:

- an unlocked chapel inversion proof; or
- knowledge earned by investigating the grey door.

The grey-door investigation can independently qualify the route. [main.js](/Users/seb/chunk-surfer/src/main.js:10333)

### What currently happens

1. The player loops the rig’s output into its input.
2. The Surfer calls this cheating; the player calls it engineering.
3. The organ stops and the building begins physically failing.
4. The player runs to the grey door under a timer.
5. The door appears to be the exit, then shifts into a wall.
6. The Surfer states that it is not merely inside the room—it is the room.
7. A second waypoint appears at the public entrance.
8. The player runs there before the remaining deadline.
9. An unidentified backlit figure holds open another door.
10. If Sarah was confessed, the player wonders whether it is her.
11. The player exits into a yard that is absent.
12. A `--:--` clock appears and another grey door waits farther away.
13. The prior recordist laughs, but the Surfer continues sounding after he stops.
14. Somebody saved the player; the prior recordist was not saved.

The route is materially better developed than the other endings because it includes two playable runs and a false-door event. [conservatory-script.js](/Users/seb/chunk-surfer/src/data/conservatory-script.js:1599)

### Gate epilogue

The scene then cuts to an apparently normal gate:

- The guard says the player came back.
- The `RETURNED` column has always been empty.
- The player becomes its first entry.
- The guard introduces a second signature field he has never used.

### Main authoring problems

- The absent yard and recursive grey door abruptly become a normal gate booth without explaining whether this is a later time, another layer, or another deception.
- The unknown helper is ambiguous, but no accumulated evidence changes that ambiguity.
- The rescued-by-somebody premise should pay off the prior recordist, Sarah, Surfer, HUSH, or player history more deliberately.
- There is no authored collapse choreography beyond lens effects and dialogue.
- The recordist ending with the Surfer speaking through him should materially affect what follows. The gate scene currently behaves normally.
- Deadline failure simply converts into The Seal. It deserves at least a distinct failure passage before that handoff.

---

## 4. Cold, Bitter, Gone

Classification: **Contamination**  
Terminal ID: `drugged`

### How it happens

The player must:

- have consumed the coffee;
- qualify for inversion;
- choose inversion; and
- successfully complete both timed escape legs.

It shares the entire supernatural inversion sequence until the final exit.

### What currently happens

- The player emerges into an ordinary car park.
- The building is intact and apparently empty.
- The ending asserts that nothing was ever inside except the player.
- Playback contains their breathing, footsteps, talking, and a spoken name.
- If five takes exist, it says all five files are ruined; otherwise it says every file is ruined.
- The night is reframed as eight hours of intoxicated wandering.
- The player loses the work and expects to be marked unreliable.
- The ending concludes that the lesson was simply not to drink a stranger’s coffee.

[conservatory-script.js](/Users/seb/chunk-surfer/src/data/conservatory-script.js:1644)

### Gate epilogue

- The guard denies knowing what the player means.
- A cup in his bin is not the player’s.
- The player’s empty cup remains in their hand.
- They do not remember finishing it.
- He casually asks them to sign out.

### Main authoring problems

- The main scene gives a definitive mundane explanation immediately after impossible inversion events.
- The gate scene then reopens supernatural uncertainty. The ambiguity could be powerful, but presently the two scenes argue rather than escalate.
- Only completed-versus-incomplete take count changes.
- The actual recordings, HUSH appearances, coffee timing, injuries, hallucinations, and loading-dock haunting never become evidence in the player’s self-diagnosis.
- This ending needs carefully authored competing evidence—not a narrator declaring one answer and then retracting it.
- There is no altered playback presentation, unreliable visual replay, police/client consequence, or breakdown of professional identity.

---

## 5. The Other Recordist

Classification: **Extraction**  
Terminal ID: `surfaced`

### Eligibility

This is the most demanding route. The player must have entered Source with the eligible bent-rig profile and then:

- carry the fork;
- tune Fork Gate;
- tune Recordist Loop;
- tune Body Return;
- resolve both optional traces;
- record Body Return;
- win the Source encounter with the rescue outcome;
- obtain the chapel’s surfaced proof without its corresponding lock.

[chunk-surf-state.js](/Users/seb/chunk-surfer/src/game/chunk-surf-state.js:194)

Coffee does not prevent this ending.

### What currently happens

- The player physically carries the previous recordist to the public exit.
- The doors open correctly.
- A Source reading remains as an afterimage.
- The recordist explains that he surrendered his body because the entity framed surrender as professional conduct.
- He cannot properly walk but can be carried by something that does not require him to become music.
- Sober: the building cannot locate the file it used as a mouth.
- Coffee: the bitter taste returns, but the road remains physically stable.
- Morning does not arrive; the two characters arrive in it.

[chunk-surf-script.js](/Users/seb/chunk-surfer/src/data/chunk-surf-script.js:160)

### Gate epilogue

- The guard sees two people return.
- The exhausted recordist sits down.
- The player’s name is written in the `RETURNED` column, followed by the recordist’s.
- The guard reveals that he maintained a place for this eventuality.
- What he thought was superstition was actually filing.

### Main authoring problems

- This is the only principal ending hard-coded outside the editable narrative document pipeline.
- Its extraordinary rescue chain resolves in seven lines.
- The previous recordist lacks a name, history, physical condition, or sustained emotional response.
- There is no authored carry animation or spatial performance beyond the walking objective.
- The player cannot question him about the Source, his four takes, surrender, HUSH, or how long he has been missing.
- Neither optional Source trace receives an ending payoff.
- Coffee changes only one line.
- This should be the most expansive ending, but it is currently scarcely longer than the others.

---

## Outcomes that are not endings

Several important results currently collapse into the five terminal IDs:

- Source `rescue`, `contain`, and `submit` are encounter outcomes, not full game endings.
- Only `rescue` can unlock extraction.
- `contain` and `submit` merely remove The Other Recordist from the final choice.
- Chapel defeat immediately becomes the stay route.
- Inversion timeout immediately becomes the stay route.
- Refusal at the choice picker cannot remain a refusal.

These are substantial authoring opportunities. A submitted Source, a contained Source, a voluntary agreement, a combat defeat, and a failed escape should not all feel like interchangeable preconditions.

---

## Shared ending tail

Every terminal ending currently uses the same final structure:

1. Commit the completed return to the profile.
2. Show one of six gate epilogues.
3. Play the shared credits.
4. Display the Samuel Butler closing quotation.
5. Fade to full black and tape hiss.
6. Show the run report.
7. Reveal achievements and newly unlocked options.
8. Offer New Run, Achievements, or Title.

The report records takes, spoiled recordings, contamination, injuries, disclosures, missing equipment, battle results, difficulty, and duration—but most of that information never affects the ending itself. [return-report.js](/Users/seb/chunk-surfer/src/game/return-report.js:31)

---

## Systemic authoring gaps

### 1. Almost no ending-specific presentation

There is currently:

- no ending-specific music;
- no bespoke ending soundscape;
- no ending-specific camera or movement blocking;
- no authored HUSH performance;
- no final flashlight/light-eating event;
- no character staging beyond speech;
- no ending-specific environment state;
- no unique credits treatment.

The gate epilogues all reuse the same guard hero artwork.

### 2. Most run history is discarded narratively

Only a few variables change ending prose:

- exact Sarah confession;
- sacrifice injury count;
- coffee;
- inversion timer;
- drugged take count;
- one Source reading;
- whether the dock haunting occurred.

Everything else survives only as statistics.

### 3. The loading-dock callback is incorrect and non-branching

Every ending receives the same line if the haunting occurred:

> The dock told the player to come closer; they touched it; it let them go.

The function ignores doorway variant, coffee state, and supernatural interpretation. It also conflicts with the established autonomous chandelier performance—the player did not cause or solve it. [loading-dock.js](/Users/seb/chunk-surfer/src/game/loading-dock.js:332)

### 4. Declared ending rewards are mostly placeholders

Each ending declares an archive entry and title-screen detail, but those values are not consumed. Only the inversion and surfaced cosmetics are implemented. [unlocks.js](/Users/seb/chunk-surfer/src/progression/unlocks.js:3)

### 5. Cross-run natatorium consequence has a real lookup defect

The runtime stores return history as summary-ID strings. The natatorium code expects history objects containing `endingId`, then falls back to `endingsSeen`, which is unique discovery order rather than the latest completed ending. Consequently, repeated returns can produce the wrong next-run water state.

The natatorium test passes because its fixtures use `{ endingId }` objects and therefore do not match the real stored shape. [runtime.js](/Users/seb/chunk-surfer/src/progression/runtime.js:217), [natatorium-water.js](/Users/seb/chunk-surfer/src/game/natatorium-water.js:42), [natatorium-water.test.mjs](/Users/seb/chunk-surfer/test/natatorium-water.test.mjs:44)

---

## Best authoring order

Before expanding prose, I would establish one common ending contract containing:

- route of arrival;
- physical player objective;
- HUSH/Surfer state;
- companion state;
- environment and lighting timeline;
- audio timeline;
- dialogue tree;
- evidence-dependent callbacks;
- final image;
- gate transition;
- persistent cross-run residue.

Then author in thematic pairs:

1. **The Seal + He Tried to Help:** the two stay endings, differentiated by agency, defeat, guard responsibility, and coffee.
2. **The Other Door + Cold, Bitter, Gone:** the same physical escape interpreted through supernatural recursion versus contaminated memory.
3. **The Other Recordist:** the full rescue ending, after migrating it into Narrative Studio and giving the recordist an actual character arc.
4. Rewrite all six gate epilogues as proper codas.
5. Add ending-specific persistent artifacts and repair the cross-run consequence lookup.

Focused ending reachability and natatorium tests pass. No files were changed during this audit.
END ENDINGS AUDIT

---

# IMPLEMENTATION · 2026-08-06

The audit above is the brief and is preserved as written. Three of its file
references were already stale when it was filed; see "Three things the audit says
that are no longer true" below. Everything else has been implemented.

## What was built

**The contract.** `src/data/endings.js` declares one entry per terminal id —
arrivals, arrival passage, objective, tree, hush, companion, two timelines, audio,
image, coda, residue — and `src/game/ending-runtime.js` plays it. The three
hand-assembled function bodies in `main.js` are one `playEnding(id, arrival)` call.

**The dossier.** `buildRunSummary` is pure and already computed the whole night;
it was only ever called inside `commitReturn`, after the ending had finished
talking. It is called at the top of the ending now and projected into `ending.*`
save flags, which is the only thing authored `when` conditions can read.

**Any confession pays off.** There are nine disclosures the game can reach and
they are all sentences the player said out loud in a room. Only the exact string
`Sarah` used to change a word of any ending; every one now has its own reply.

**Arrivals.** `agreed | defeated | timed-out | escaped | carried`. Losing the
chapel fight and missing an inversion deadline both called `endSacrifice()` with
no argument; both now carry an arrival and play an authored passage first.

**The five endings are single conditional documents.** Eighteen authored variant
files collapsed to five. Three are trees with hubs: the drugged ending is evidence
the player weighs with nothing adjudicating it, the inversion lets him ask who is
holding the door, and the surfaced ending is a conversation with a man who has a
name (Alan) and eleven weeks to account for.

**Six codas rewritten**, and every one has a position on the RETURNED column —
signed, struck out by the client, or ruled again for the next man.

**Two clocks per ending**, authored in seconds: `environment` under the prose and
`objective.timeline` while the player is still walking. `objective.pace` divides
into the move interval, so the carry is a carry.

**Residue.** `ENDING_REPLAY_UNLOCKS` declared an `archiveEntry` per ending and
nothing ever consumed one. `src/data/ending-archive.js` is those documents — what
W. Ellery wrote about a night nobody at W. Ellery attended — shown, paged, in the
archive's RETURN FILES tab.

## Two bugs found on the way

- **Conditional lines in a flat beat list were never filtered.** `createConversation`
  filtered `if` on node lines and not on beats, and nothing noticed because no
  authored beat had ever carried a condition. The first one that did played every
  branch at once. Fixed in `game/conversation.js`.
- **`flagTest` tolerates a hyphen in a flag name and the studio validator does
  not**, so `ending.arrival.timed-out` would work in the game and fail validation.
  Flag keys are folded to camelCase.

## Corrections to the audit

1. The ending prose was already out of `conservatory-script.js` and in
   `content/narrative/`; `main.js` overrode those exports with `endingLines`.
   Every legacy ending function has since been deleted.
2. `src/game/loading-dock.js` does not exist. The dock callback is
   `dockEndingBeat` in `game/get-in.js` and it already branched on variant,
   coffee, reading and ending id.
3. **The natatorium cross-run lookup was correct.** `resolvedReturnHistory` maps
   `returns.history` ids through `returns.records` and the summary carries
   `endingId`. The defect was in the *fixture*: it passed history as objects,
   which `normalizeReturnHistory` discards, so every assertion passed through the
   `endingsSeen` fallback and the real path was never exercised. The fixture is
   rebuilt and now also asserts that the LATEST return decides the water rather
   than the first ending discovered.

## Still outstanding

The nine audio files in `ENDING_AUDIO_TODO` (see the section above this one). All
five endings play the opening title theme until they land.

---

## OUTSTANDING: ending audio (added 2026-08-06)

**Every ending currently plays the opening title theme as its bed.** That is a
deliberate placeholder, not an oversight — it is the only music the player
already associates with this building — and it is the wrong final answer, because
five endings that sound the same are four endings that do not land.

The authoritative list is `ENDING_AUDIO_TODO` in `src/data/endings.js`. It is
printed by `test/ending-contract.spec.mjs` on **every `npm test`**, and the god
menu's ending rows read `[PLAY · TEMP BED]` until it is empty, so it cannot
quietly become permanent.

| id | kind | length | for |
|---|---|---|---|
| `ending.bed.sacrifice` | bed | 60–90s | The Seal — it closes over you, and the last thing to go is your own torch |
| `ending.bed.helped` | bed | 60–90s | He Tried to Help — the same closing, but somebody outside it was kind |
| `ending.bed.inversion` | bed | 60–90s | The Other Door — a building coming down, and a yard that is not there |
| `ending.bed.drugged` | bed | 60–90s | Cold, Bitter, Gone — a car park, and nothing wrong with the light |
| `ending.bed.surfaced` | bed | 60–90s | The Other Recordist — two of them, arriving in the morning |
| `ending.strike.first` | one-shot | 4–8s | the 06:00 first strike, landing on the downbeat |
| `ending.room.silent` | one-shot | 6–12s | a room going properly silent |
| `ending.demolition.bed` | bed | 30–60s | demolition sustained: plant, hydraulics, masonry |
| `ending.demolition.collapse` | one-shot | 8–15s | one span letting go, for the inversion collapse |

**To land one:** drop the file in `public/audio/game/`, point its key in
`STORY_AUDIO` (`src/audio/story-audio.js`) at it instead of
`ENDING_BED_PLACEHOLDER`, and delete its row from `ENDING_AUDIO_TODO`. Nothing
else has to change — `startSoundtrack` falls back to the title track for any key
it does not know, so a bed that has not been written yet is silent-safe.
