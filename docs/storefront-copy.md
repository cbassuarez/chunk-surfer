# Chunk Surfer storefront copy — v2.3 instrument-interface proposal

**Review status: unapproved revision.** The user rejected the earlier visual and copy proposals. The latest explicit direction is: **“copy the game look exactly. annunciators. faceplates. vfd. lcd. etc. better screenshots. imperitive copy”**. This revision follows that instruction; it is not evidence of acceptance or publication.

Prepared November 1, 2026 for the assumed **v0.3.0 public beta release**. This is prepared copy, not evidence that this version is published. Public release wording and actual build uploads remain separate.

After review, upload the six gameplay images to itch and replace both their `src` and enclosing `href` URLs in [storefront-copy-itch.html](storefront-copy-itch.html) with the hosted HTTPS image URLs. The relative URLs in this file support local review only. Then paste it into itch's **Description**, [storefront-install-itch.html](storefront-install-itch.html) into **Install instructions**, and [storefront-itch.css](storefront-itch.css) into **Theme → Custom CSS**. Set **Screenshots → Hidden** in the native theme editor and remove the old banner to expose itch's native game title. This preserves the existing gallery uploads while using inline images in reading order. [storefront-itch-preview.html](storefront-itch-preview.html) is a local review preview, not a live itch page or packaged gameplay evidence.

## Corrections carried forward

The first pass turned the five-room assignment and a missing contractor into the identity of the whole game. Its source audit gave too much authority to old `conservatory-script.js` comments and existing marketing. The claim that the player had no meaningful personal history was wrong: active payphone and Outskirts dialogue contains missed commitments, Sarah and Lyle, damaged relationships, creative pressure, and compulsive retakes. Keep that authored material; do not invent a dead-relative or generic grief plot.

The second pass found the broader experience but wrote a genre/thematic essay and proposed another visual interpretation. The user rejected that too. Do not reuse the broad poetic lead or substitute a newly invented equipment aesthetic for the game's actual surfaces.

The deeper audits followed current authored dialogue and wiring across arrival, social spaces, kit progression, Outskirts, Source II/III, driving, endings, and replay. Use that whole-game evidence to choose tangible instructions and representative media. Keep interpretation and ending evidence internal.

## Current copy direction

**TAKE THE JOB.**

Write in imperative verbs and the game's concrete vocabulary: **ARRIVE. UNPACK. LISTEN. RECORD. ANSWER THE SIGNAL. TALK. READ. CALL. KEEP GOING. SIT DOWN. LISTEN. CHOOSE WHAT TO CARRY OUT.**

Establish role and assignment immediately: enter condemned Ellery as the field recordist and capture five clean room tones before demolition. Then instruct actions across the actual adventure: prepare equipment and patch techniques, record and play back, talk to people, follow documents and calls, handle tactical encounters, cross impossible musical construction, drive through the storm, stop for performances, and decide when to leave.

Use exact control labels where relevant: **REC / STOP / TAKES**, **EXPOSE / MONITOR / PLAYBACK / HOLD**, **SETTINGS**, and **ARCHIVE / 100%**. These are explanatory text, not fake website buttons. Leave actual download actions to itch.

Keep genre/platform/version facts as compact instrument readouts. Keep privacy, content, and installation facts precise even where neutral declarative prose is necessary. Do not explain themes, describe renderer implementation, promise a fixed short duration, or reveal later identities or ending mechanisms. Qualify the alternate replay unlock without naming its role.

## Live page findings

The November 1, 2026 editor inspection found:

- The summary is **“a haunting at Ellory Conservatory”**. Correct **Ellory** to **Ellery** and replace the vague summary once the new framing is accepted.
- Visibility is **Restricted**, with a password enabled. Release status is **in development**. A new beta does not by itself require changing either setting. Keep access restrictions until the intended visibility decision is made; retain the development status while the game remains in development.
- The AI disclosure is **Yes / Code only**. Removing an experimental image-rendering feature does not justify changing this to No. Preserve the truthful disclosure and independently audit shipped creative assets before changing any category.
- Tags are `3d`, `atmospheric`, `audio`, `experimental`, `exploration`, `first-person`, `horror`, `itchfunding`, `psychological-horror`, and `singleplayer`. Keep relevant genre and play tags; reassess `itchfunding` against whether there is an actual funding campaign. Do not imply microphone-required play or a conventional rhythm game.
- All four uploads display **0.3.0**. Displayed sizes are Windows **488 MB**, macOS **494 MB**, Debian **489 MB**, and AppImage **562 MB**. These are a page snapshot, not proof that the uploaded bytes match the newest local working tree. Keep these values out of evergreen copy.
- The gallery has nine older screenshots, no trailer, and two title treatments. Replace the duplicate title treatment and legacy combat imagery with a new set covering the whole experience.
- Average session metadata says **“A few hours”**, while the old description calls the game short. Remove the unsupported short-game claim. Revisit session metadata after timed playthroughs of the actual release.

The local preview cannot verify live page state or replace a final logged-out check.

## Source of truth from the deeper audits

| Experience or interpretation | Current source and evidence |
| --- | --- |
| Physical arrival, belongings, radio, and stepping out into the world | `src/data/opening-vehicle.js`, `src/game/opening-vehicle-scene.js`, `src/game/opening-cab-inspection.js`, `src/main.js:11922` |
| The school situated within a social world | `src/data/pub-dialogue.js:24` (Iona's requests), `:59` (vigil), `:129` (refusal, preservation, local work); `src/data/academic-society.js:382` (music and company) |
| Institutional concealment and refusal to perform | `src/data/student-strike-evidence.js:13` (internal recovery / public missing register), `:23` (students will not play over what happened); `src/data/pub-dialogue.js:129` |
| Personal relationships, missed commitments, and compulsive retakes | `content/narrative/source-space.payphone.story.json:1473`, `:1525`, `:1545`, `:1624`; active runtime flurry at `src/main.js:20100` |
| Professional agreement and always being nearly finished | `content/narrative/ending.surfaced.story.json:222`, `:282`; these are internal thematic evidence and contain ending spoilers |
| Recording as one physical practice within the adventure | `src/game/recordist.js`, `src/game/recorder-scene.js`; the contract in `src/data/conservatory-script.js:36` establishes the assignment rather than the whole game's meaning |
| Kit choices, patchable techniques, and preparation | `src/game/field-kit.js:16`, `src/game/combat-progression.js:1`, `src/game/skill-patchbay.js`; leads are reversible preparation decisions |
| Current tactical signal encounters | `src/game/combat-state.js`, `src/game/combat-tutorial.js:6`, `src/game/combat.js`; torch, recorder, holds, parries, and earned actions |
| Giant musical objects, physical joints, folds, stairs, and descents | `src/data/source-continuation.js:6`, `src/data/source-continuation-journey.js`, `src/data/source-rest-route-composition.js:23`; objectives at `src/game/source-continuation.js:450` |
| Beauty, attention, imperfection, and the risk of remaining | `src/data/source-rest-conversation.js:250`, `src/data/source-rest-couperin-conversation.js:102`, `src/data/source-rest-questions.js:50` and `:102`; active integration at `src/main.js:21335` |
| Full performances rather than ornamental music loops | `src/data/source-rest-performance.js:3` (Bach performance), `src/data/source-rest-couperin-source.js:3` (complete Couperin and revoicing); optional music-clocked encounters |
| A playable storm journey that changes its material | `src/game/source-drive/evolution.js:30`; ordinary road, weather, water, anatomy, aftermath; actual controls/host at `src/main.js:21536` |
| Source IV belongs to one ending route | `src/data/source-iv.js:1`, `src/main.js:28652`; do not sell four universal mandatory chapters |
| Return, persistent evidence, and an unlocked causal replay | `src/game/post-run-copy.js:17`, `:91`, `:122`; qualify replay availability and preserve its identity reveal |
| Accurate microphone and local profile disclosure | `src/game/warning.js:23`, `src/audio/take-slate.js`, `src/audio/payphone-line.js`, `src/game/settings-tips.js` |
| Controls, accessibility, and release matrix | `src/game/bindings.js`, `src/game/settings.js`, `scripts/release-matrix.mjs`, `scripts/itch-release.mjs` |

All Source/rest/ending details above are internal evidence. They are not a list of spoilers to transfer to the store page. Branch-specific scenes and optional conversations should not be promised as mandatory events in every run.

## Store summaries

Proposed itch summary, kept brief for the editor's summary field:

> Take the job. Record the rooms. Answer the signal. Find a way through Ellery and the places beyond it.

Steam short description: imperative, plain text, under 300 characters, with no version or availability claim.

<!-- COPY: STEAM SHORT START -->
Take a field-recording job at condemned Ellery Conservatory. Prepare your kit. Record the rooms. Talk to the people who stayed. Answer the signal in tactical encounters. Cross impossible musical spaces and choose what to carry out. Microphone input is optional.
<!-- COPY: STEAM SHORT END -->

## Shared About section

Plain-text counterpart of the proposed description. Retain the tangible action sequence when preparing another store page. The HTML is the itch paste target after review.

<!-- COPY: SHARED ABOUT START -->
**TAKE THE JOB.**

Report to Ellery Conservatory as the field recordist. Capture five clean room tones before demolition at 06:00. Carry your kit through the school, its streets, and the places opening beyond them.

FIRST-PERSON HORROR ADVENTURE · SINGLE PLAYER

### ARRIVE. UNPACK.

Step out of the van. Check in. Read the work order. Choose your field equipment, fit the kit, and keep the map close. Bring a light.

### LISTEN. RECORD.

Bring the room up in your headphones. Check the level. Open the recorder, press **REC**, and hold still. Capture the sound of the room without adding your footsteps, handling, or breath. Watch the machine. Press **STOP** when the take is usable. Open **TAKES** to hear what came back.

Mind the torch battery. Use the light to find your way. Keep the beam and your noise off anything you would rather leave alone.

### ANSWER THE SIGNAL.

Patch your techniques before the encounter. Read the next move. **EXPOSE** what hides. **MONITOR** a broadcast. Capture it, then use **PLAYBACK**. **HOLD** against a blow, or time a parry to turn it back. Earn another action with a good read. Watch the battery and your composure.

### TALK. READ. CALL.

Go across the road. Speak to the people keeping the pub warm. Help with an errand. Meet the people still occupying the school. Ask about a performance. Read the retained records. Follow the letters and phone calls. Hear what has been left out of the account, including your own.

### KEEP GOING.

Climb through instruments large enough to become buildings. Cross remembered rooms joined at impossible angles. Find the next landing before choosing a descent. Take the wheel and drive into the storm. Look for a way through.

### SIT DOWN. LISTEN.

Stay with a performance as it unfolds. Let the conversation run. Hear the room, the hands, the mistakes, and the space after a note. Decide how long to remain. Get up while you still can.

### CHOOSE WHAT TO CARRY OUT.

Keep what you find. Decide what to leave. Reach an ending and check **ARCHIVE / 100%** for discoveries and filed returns. Finish a run; if it qualifies, play through that same night from another side.
<!-- COPY: SHARED ABOUT END -->

## Release-managed copy

These blocks assume the named release will be posted. Verify the release facts before using them. Internal review and verification status should not appear as player-facing release prose.

<!-- COPY: ITCH BETA START -->
## v0.3.0 public beta

Save compatibility, performance, and packaging may change in later updates. Desktop builds are unsigned; first-launch instructions and controls are below the downloads.

- **macOS:** Apple Silicon DMG.
- **Windows:** x64 portable ZIP. Microsoft Edge WebView2 Runtime required.
- **Linux:** x64 AppImage and Debian package.

Headphones recommended. Microphone input and local personalization are optional. Download sizes appear beside each file.
<!-- COPY: ITCH BETA END -->

<!-- COPY: ITCH CONTENT WARNING START -->
## Content warning

Sustained dread, sudden loud sounds, deliberate jumpscares, flashing lights, and high-contrast patterns. Visual effects can be reduced in Settings. Optional desktop effects may move the game window and open additional windows.
<!-- COPY: ITCH CONTENT WARNING END -->

<!-- COPY: ITCH MICROPHONE START -->
## Optional microphone input

Microphone permission is optional. With permission, the game measures room loudness locally so real noise can affect play. You can also choose to record spoken take slates and voicemail. These recordings stay on your device; the game does not recognize speech or automatically upload audio. You can complete the game without a microphone.
<!-- COPY: ITCH MICROPHONE END -->

## Exact game surfaces and buttons

Follow the latest explicit instruction to copy the game look exactly. Use production-rendered faceplate, glass, keycaps, annunciators, LCD, and VFD assets with the game's actual lettering. Read `src/render/presentation.js`, `src/render/hardware-faceplate.js`, `src/render/hardware-material.js`, `src/render/recorder-instrument.js`, and the electronic-text/VFD renderers. The runtime shader and world palette are separate from these instrument surfaces; do not paint the whole world amber because a menu uses amber.

The public fragment supplies `custom-panel > custom-annunciator + custom-glass` composition, `custom-vfd` headings, and `custom-lcd` factual readouts. Annunciators contain static service labels; LCD fields contain actual genre, version, platform, and optional-input facts. They must not fabricate live state, level values, progress, or readiness.

Keep the exported materials and state behavior faithful. Use the actual game wordmark and current screenshots. Preserve itch's real Download, Follow, and Add to collection actions, keyboard focus, readable contrast, mobile wrapping, and reduced-motion behavior. Do not turn explanatory REC / STOP / TAKES text into nonfunctional page controls.

Both deeper audits also establish that the world exceeds the recorder: the opening overture's pub/vigil/school/rooms/tower contexts are in `src/data/opening-overture.js:15`; the printed front end is in `src/render/pixel-mesh/shader.js:40`; the world palette is in `src/render/pixel-mesh/palette.js:1`; familiar construction at impossible scale and source words that need not be instructions are in `src/data/source-rest-questions.js:37`. Use these pointers to select the screenshots, not to replace current runtime images with a description of their style.

## Replacement media brief

**New media is required.** Existing `docs/media/title-screen.png`, `conservatory-lit.png`, `redaction-battle.png`, and the old Source-space clip are historical references until compared with the release. A title screen and dark corridor cannot represent the whole game. Do not use an old redaction board as the image for current tactical encounters.

Capture the exact intended release with its final assets and record its version/hash. Inspect the saved images and clips, including sound. Developer entry points may help compose a shot; they do not establish a normal player route or packaged-native acceptance.

| Order | New capture | What it must communicate |
| --- | --- | --- |
| Cover / banner | Actual title identity with a strong current world image | A recognizable game rather than a fabricated equipment brand; legible at thumbnail size |
| 1 | Arrival, streets, or conservatory frontage | A music school situated in a larger inhabited night |
| 2 | Recorder during a legitimate take | The physical instrument, readable state, room, and vulnerability of the work |
| 3 | A current social encounter | People, company, and conversation; no late identity reveal or tiny unreadable dialogue |
| 4 | A tactical encounter | Current field tools, incoming threat, and the choices the player makes |
| 5 | Impossible musical architecture | Real scale, a traversable route, material and place; avoid presenting it as a code-reading puzzle |
| 6 | A listening place or another distinct later environment | The quiet, beauty, and breadth of the journey without showing an ending |

A compact gameplay trailer should connect ordinary arrival, a person or conversation, recording under pressure, a tactical exchange, the storm drive, and a glimpse of musical architecture/listening. Use actual game sound and captions where useful. Leave space for a sound or action to register. Do not reduce the trailer to title cards, darkness, effects, or an exhaustive feature list. Its length does not establish playtime.

## Default controls

The install fragment contains this table. Do not describe Shift as sprint or claim every keyboard binding is remappable. These are normal on-foot controls; driving and specialized scenes display their own prompts.

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Shift | Quiet movement |
| C | Hide |
| F | Light |
| B | Bag |
| M | Map |
| R | Open recorder |
| V | Radio |
| E | Interact |
| P | Playback |
| Esc | Menu / pause |

R opens the machine. Its physical controls are **REC / STOP / TAKES**. Opening it does not pause the room. Controller bindings can be configured in Settings.

## Publication checks

1. Review the imperative copy and exact production-surface implementation against the latest instruction. Earlier rejected proposals remain superseded drafts; a new local draft is not acceptance or publication.
2. Identify the exact release commit and packages. Recheck architecture, signing, filenames, runtime dependencies, save behavior, and first-launch instructions. Update both public fragments if any facts change.
3. Confirm all four itch channels contain the intended artifacts: `mac-arm64-beta`, `win-beta`, `linux-appimage-beta`, and `linux-deb-beta`. Existing uploads already say 0.3.0; compare provenance or bytes rather than version labels alone. A local build or upload command is not a publication receipt.
4. Replace with measurements from the actual lean release files if sizes are needed for a devlog or another store. Let itch show its own package sizes. Do not invent CPU/RAM/GPU minima, macOS Intel support, Steam Deck/Proton acceptance, Steam availability, or playtime.
5. Capture and inspect the new media from the release. Confirm that it reflects the whole experience, the current visual composition, tools, characters, and encounters. Storefront preview screenshots are not gameplay captures.
6. After acceptance, upload the selected screenshots and substitute their hosted HTTPS URLs in the description before pasting. Apply the fragments and CSS; choose **Screenshots → Hidden**, remove the old banner, and use the native title. Review cover art separately. Review the complete itch page at desktop and phone widths, logged out as well as logged in: real download actions, footer and metadata links, readability, image order, table wrapping, and motion preferences.
7. Keep Restricted/password visibility and in-development status unless the publication decision explicitly changes them. For a public launch, change access deliberately and verify logged out. Never embed the private-page password in public files. Preserve truthful AI disclosure; category changes require a separate asset/code audit.
8. Prepare a release devlog around the exact build's changes, then verify its links and the final page. Record what is live and when it was checked.

## Verification boundaries

This is a revised proposal with six new browser screenshots, not user acceptance, a live update, a build upload, a trailer, or completed runtime validation. Whole-route and platform acceptance require their own evidence.

For this documentation pass, check HTML structure, custom-class compatibility, summary length, COPY markers, factual controls/privacy/install claims, preview consistency, and `git diff --check`. Compare the actual faceplate/glass/annunciator/VFD/LCD exports and improved gameplay captures in the rendered preview. Record unrelated dirty-tree failures separately. Do not change the game to satisfy an obsolete marketing assertion.


## Prepared review package

The November 1 pass now includes six 1440 × 900 current browser captures in `docs/media/storefront/`: arrival, recorder, Source vista, harpsichord construction, a listening scene, and the roof/city view. `capture-manifest.json` records the staging and file hashes. Discarded wall-facing and obstructed review captures are not in the gallery. These images prove the pictured current renderer output; they do not establish native release or normal-route acceptance. The recorder image is its real idle state, not a fabricated rolling take. A polished current combat/social capture and gameplay trailer remain useful launch media additions.

`tools/chunk_surfer/storefront-skin.html` calls the production Canvas painters. Its export feeds `scripts/build-storefront-skin.py`, which packages eleven actual material/state images, the character-ROM VFD/LCD fonts, and the game's vendored Hardware Sans faces. `docs/media/storefront/provenance.json` records sources, geometry limits, and checksums; the font licenses are preserved alongside the assets. `storefront-itch.css` embeds the result and needs no separate font or texture hosting. The HTML composition adapts to itch; it is not a claim of pixel-identical layout at every viewport.

The layout uses one native column: title, download control, compact job instruction, then large gameplay images between the action sections. The last two images form a pair on desktop and stack on phones. Platform downloads, More information, and itch's footer retain their native roles. The preview uses the same public fragments and product CSS; only native itch chrome is approximated locally.

VFD headings follow `src/render/vfd-marquee.js`: short names remain still; overflowing names hold their beginning for 2.6 seconds, move in discrete steps, and hold their ending briefly. The CSS adaptation completes in 4.8 seconds and then exposes the complete wrapped heading. It does not run a perpetual web ticker. Reduced motion, forced colors, and browsers without container units show the complete static text. Content warnings remain static.

The source was checked against itch's [CSS guide](https://itch.io/docs/creators/css-guide), [page design guidance](https://itch.io/docs/creators/design), and [quality guidelines](https://itch.io/docs/creators/quality-guidelines). Custom selectors are scoped to `#wrapper`, authored classes begin with `custom-`, embedded font/material data is allowed, native actions and footer links remain available, and the single-column/inline-image arrangement is officially supported. The page adds no audio, flashing, external tracking, or script. Preserve truthful AI disclosure, tested-platform metadata, and actual release provenance. This is a source and local-browser review, not itch approval or a claim of full accessibility conformance.

Local browser checks: the actual VFD/LCD/Hardware Sans fonts and all six images load; 320, 390, 640, and 1200px widths have no horizontal overflow. Overflowing headings move during the travel phase and expose their complete text after 4.8 seconds. Reduced motion disables animations; forced colors removes the instrument images and glass overlays; keyboard focus visibly reaches Download. The live itch page, uploads, access controls, and devlogs were not changed by this pass. A final live, logged-out check remains necessary after applying the hosted assets and native theme settings.

All 15 focused release-document/channel/version checks pass. A PostCSS parse confirms all 179 custom selector rules are scoped to `#wrapper`; the stylesheet embeds eleven material images and four font faces. Task-local `git diff --check` passes. These checks do not establish acceptance of the packaged game.
