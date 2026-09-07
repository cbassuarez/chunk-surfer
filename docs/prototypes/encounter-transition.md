# Encounter transition study

Playable entry: `/encounter-lab.html`. This is an isolated presentation prototype. It does not change production encounter routing, player saves, microphone input, external windows, or authored battle balance.

The proposed order is **fight called → impact / versus splash → battle interface → recordist and adversary wipes → optional dialogue → equipment and skills module → READY → first turn**. The adversary remains on the battle stage during preparation. A separate review toolbar can hold the splash or jump to either module page and the playable battle.

## Research and design decisions

Thomas Grip's [9 Years, 9 Lessons on Horror](https://frictionalgames.com/2019-10-9-years-9-lessons-on-horror/) describes reducing and spacing Amnesia's scares, the role of anticipation, and how a clearly exposed creature can lose its threat. Applied here: cut the room's continuity, intrude once at an uncomfortable scale, then hold a partially obscured identity frame. The player gets the creature before any equipment decision. The scare is a punctuation mark, not an effect that loops while they read.

Dino Ignacio's [Crafting Destruction: The Evolution of the Dead Space User Interface](https://www.gdcvault.com/play/1017723/Crafting-Destruction-The-Evolution-of) describes a diegetic and immersive UI design process. Vidhi Shah's [Cutting Apart the Diegetic Interface of Hardspace: Shipbreaker](https://www.gdcvault.com/play/1027158/Cutting-Apart-The-Diegetic-Interface) addresses cohesion between interface, gameplay, and world while retaining usability. These two references were researched through their published GDC session descriptions; the full video talks were not reviewed. Applied here: one physical rack, printed labels, VFD status, recessed contacts, sockets and leads, and the existing material-rendered caps. The module has a legible primary action and clear cost/status feedback.

These are design inferences from the sources. The timing, composition, controls and Natatorium material treatment below are proposals for this game, not timings taken from those games.

## Timing and ownership

| Beat | Prototype timing | Player-facing behavior |
| --- | --- | --- |
| Fight called | 480 ms | The room drops nearly to black; a single tape cut. |
| Intrusion | 200 ms | The enemy's hollow shell occupies and exceeds the frame; one low impact. |
| Identity / versus | 940 ms | THE RECORDIST / VS / THE FOURTH RETURN. An asymmetrical, cropped adversary dominates the image. |
| Battle interface | 380 ms | Gauges and inactive combat controls arrive. |
| Character reveal | 1,160 ms | The hands wipe in from the left; the adversary wipes in from the right, slightly later. |
| Optional dialogue | Player controlled | Short placeholder exchange, staged over the revealed battle. |
| Preparation | Player controlled | Equipment and skills share one field-control housing. TURNS PAUSED stays visible. |
| READY | 680 ms | The module closes, the player gets a clear YOUR TURN cue, then controls become available. |

The full uninterrupted entrance takes about 3.2 seconds before dialogue or preparation. READY has its own 680 ms handoff. Repeated Enter input cannot advance through dialogue or preparation. Escape pauses the prototype; hidden tabs suspend it. A long browser frame cannot skip the impact or an entire wipe.

Reduced motion removes the enlarged impact view, splice bars, moving wipes and CSS travel. It retains the same identity frame and sequence. There is no repeating white flash. Sound is independently switchable and starts only after a user gesture. The three oscillator impact is a temporary sound sketch; it still needs audition against the game's actual mix.

## Equipment and skills

Four numbered quick-access slots make the battle loadout concrete. Select a slot, then fit an item from the case; its former occupant goes back into storage. The inspector explains what the tool does and what move it enables. All seven current battle gear entries are represented, including the deliberately inert badge.

The Skills tab uses the current six branches, technique definitions, prerequisite rules, spare-lead budget and cascading unpatch reducer. All skills are present in a scrollable rack. Selecting a socket describes the effect and enables PATCH LEAD or PULL LEAD. A blocked patch names the cause. The prototype starts with four earned leads, two already patched. Readiness and spare leads share the same status strip across both tabs.

The module uses `assignCombatGearSlot`, `normalizeCombatBuild`, `techniqueAvailability`, `connectSkillPatch` and `pullCombatTechnique`. READY creates a fresh `createCombatState` from the selected gear and techniques. The final battle runs `reduceCombat` and `advanceEnemy` with the authored Natatorium profile. This proves the preparation choices reach real combat rules; it is not a complete replacement for the production combat scene's reaction timing, music, environmental effects or input system.

The background pool and dithered shell surface are prototype material studies. The live adversary signal and first-person hands use `combat-view.js`. The pre-fight dialogue and the title THE FOURTH RETURN are presentation copy for this study, pending placement against the authored encounter dialogue.

## Production integration seam

`main.js` currently opens `makeEncounterStartScene` and only pushes combat after its equipment confirmation. That order would change: the encounter coordinator owns the scare and turn gate; the battle scene is staged before opening preparation.

1. Finish any required fullscreen-to-windowed advisory before beginning the scare. Hold the world, input and encounter clocks together while the handoff is pending.
2. Capture the interrupted world view and run the short impact/identity sequence. Never let an opening key repeat dismiss subsequent gates.
3. Mount the battle presentation with its turns, enemy timers and reaction windows held. Wipe in the real hero and adversary before optional authored dialogue.
4. Open the combined field module over that held battle. Use the existing bag/progression mutation paths for the accepted build and preserve current save behavior. A preview state may drive readouts; it must never advance a turn.
5. READY commits the selected build, closes the module, arms input after release, and starts the combat clock/music once. Fight-specific external rebus and NVMe windows keep their existing separate ownership.
6. Preserve story continuation, cancel/resume, failure cleanup and result handling through the existing combat scene. Use a shorter return transition on retries so a fixed scare does not become friction.

## Review and verification

Run the existing Vite development server and open `/encounter-lab.html`. The toolbar exposes the complete sequence, a held identity frame, equipment, skills and playable battle. The Dialogue option affects the next replay. The prototype stores its state only in the current page.

```sh
node --test test/encounter-sequence-prototype.spec.mjs
node tools/chunk_surfer/verify-encounter-lab.mjs
npx vite build --config tools/chunk_surfer/encounter-lab.vite.config.mjs
```

Browser verification covers the ordered live sequence, held input, no pre-READY combat state, slot replacement, skill patch/refund, changed build carried into a real turn, optional dialogue, pause, reduced motion, and module layout at 1440, 1024, 800 and 480 px. It writes screenshots and a report to `artifacts/encounter-lab/`. This does not establish native desktop window behavior or final audio perception.
