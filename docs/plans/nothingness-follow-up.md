# Nothingness walk follow up design

October 11, 2026. This pass develops the non-bust route after the tape: the black approach, the station, six realms, the optional childhood window and the chapel arrival. The ordinary worlds let him walk just far enough to become interested, then decohere him back into the station. The home is the dangerous exception: it lets him stay.

## Implementation pass

The non-bust crossings now use supported local ground and obstacles shared by collision and the depth renderer. Each visit saves its position, gaze, completed footsteps, partial stride, entry slab and automatic return stage. Ordinary visits have no elapsed-time expiry before their steps are spent. The initial allowances are 36 steps for burning, inverted and whiteout; 38 for flood; 40 for ash dunes; and 42 for glass. A completed stride is 0.68 metres. These are tuning values, not objectives shown to the player.

Each realm has its own material failure and sound envelope. Return leaves its object in the case and begins the door's slower take-back. Station weather, nearby doors and pressure no longer intrude into an occupied realm. Duplicate doors share a destination; old timed crossings and virtual home saves migrate into the physical sessions.

The eligible whiteout keeps its ground beyond the ordinary allowance. Its snow surrounds the moving camera, and a gust covers the last approach to the fixed wall. Broad arrival restores composure once. Physical approach deepens the local quiet; turning toward the snow restores the outside. Deliberate departure awards the jumper after reassembly, with no ongoing hold or cost.

The childhood-home revision replaces the earlier kitchen with **The Last Clear Pane**: an ordinary bedroom, visibly grown up in and left for college, seen from outside a deeply recessed, offset window. Shared architecture and sound anchors live in [childhood-bedroom.js](/Users/seb/chunk-surfer/src/data/childhood-bedroom.js). Authored LOOK now recognizes the bedroom and Lyle's own jumper; the payphone memory agrees about ownership. A standalone `home.stay` supplies the optional STAY observation. The local action rail exposes repeatable LOOK, STAY and TURN AWAY independently; one held interaction cannot chain them.

The design below records the intended experience. Current automated and browser evidence is tracked in [the audit](/Users/seb/chunk-surfer/docs/nothingness-walk-audit.md). The October 12 bedroom and exterior revisions pass 79 focused tests. The exterior production fixture checks the clear house, supported side hollows, buried openings, glazing collision and harmless look-away through the game's actual renderer. The complete errand check covers earned relics, real reload, close/lateral home views, repeatable LOOK, separate STAY and deliberate outward departure. Exact bundles, input/fixture scope and production captures are recorded in the audit. Real WebAudio offline rendering from the bedroom pass confirms the mechanism loop repeats exactly. Final small-detail legibility, uninterrupted pacing, headphone listening, dedicated surface recordings and native/controller hands-on acceptance remain open.

## Chosen direction

Seb selected an indifferent, maintained station; small walkable realms; remaining outside the childhood window and deliberately turning away; and warmth that should be distrusted. The danger lives at the window: choosing to leave breaks its hold. For ordinary visits, Seb specified “walking just long enough to be interested and then being zapped out of the world, decohered.” A step count triggers decoherence. Objects return as residue of crossing; there are no collection tasks or puzzle gates.

The station operates without acknowledging him. Its doors have been used and maintained, but no travellers, attendants, silhouettes or fresh passenger traces appear. The six existing worlds retain their identities. Lyle remains someone he met years after leaving the childhood house; the jumper's presence on this radiator is impossible.

The home is outside the calendar. Familiar construction, accumulated use and the space left by books taken to college identify it; period electronics, dated posters and a preserved child's-room display do not. The room is a little messy as he left it. It contains no occupant, apparition or suggestion of a body in the bed. Lyle's green jumper is his own, not one borrowed from the protagonist.

## The approach and station

Keep the beginning black. Footfalls and the muffled side rain establish movement before a destination becomes visible. The lamps, phone boxes and Ellery elevation approach between looks, then stop at their invisible boundary. Facing them changes their audibility; they never supply a new objective.

During the final part of the approach, a threshold seam and the chapel's distant lanterns establish a direction. The stone path resolves underfoot before the nearest door becomes legible. Tune the existing length after a normal walking test; compare the current approach with a shorter version before choosing a distance.

At ordinary viewing distance, every door needs four readable parts: its material, its handle, its contact with the ground and its world's seepage. Tune torch exposure so the wear and ironwork survive illumination. Keep space to pass, inspect and watch a take-back. The chapel arch remains the strongest crafted object, visible beyond the field so continuing is an intelligible choice.

## Small walkable realms

Each ordinary realm is a compact authored place, provisionally 12–30 metres across, with a foreground that supports real movement and one memorable spatial law. The existing distant landscapes supply scale beyond the playable ground. The player can stop, look sideways, retrace steps and approach a real change in the view. These are actual places with position, support and collision.

Give each pocket a short stretch to walk and a reveal that makes its larger landscape newly interesting. Boundaries come from terrain: deep water, a fissure, an unsupported edge or dense glass. Keep the entrance locatable for someone who immediately retraces their steps. Movement controls stay consistent across worlds; the inverted city can overturn gravity's evidence without overturning the player's controls.

Each ordinary visit has a configurable budget of actual walking steps. Spending that budget triggers decoherence, wherever the player happens to be. Forward, backward and sideways steps all count; standing still, looking around and pushing against a blocked surface do not. Count completed footsteps from actual ground travel, independently of whether footstep audio is enabled. Key presses and movement-update calls are not steps.

Stage the landscape to become interesting during the expected walk, but neither reaching a vantage nor seeing an object or event controls the return. Tune the step counts through normal play. The player can stop and look without spending the remaining steps. Once the budget is exhausted, decoherence completes automatically even if movement stops; the footfall imagery below does not require another step. Save the count and partial stride with the visit so a reload neither replenishes the budget nor skips the remaining walk. Pausing or hiding the app freezes the visit and any decoherence already in progress.

| Realm | Walk and first revelation | Decoherence and residue | Sound |
| --- | --- | --- | --- |
| Burning plain | A cool basalt shelf bends around a glowing fissure. Beyond the bend, the toppled pylons and red sun align; embers begin travelling into the fracture against the wind. | The near ground loses registration through heat while the distant plain stays briefly sharp. He is back with a cinder that stays warm. | Wind above a low structural fire sound; a close dry crack continues across the return. |
| Still sea | A broken causeway reaches drowned steps. At their end the half-sunk wheel and spires resolve beneath perfectly flat black water, suggesting a route below. | His next footfall sounds submerged while he is still on stone; the waterline passes through the view and the station resolves. A wet shell remains. | Hollow water beneath the slab, immense quiet beyond, then one impossible submerged step. |
| Inverted city | A supported ledge hangs over open sky. Around its hooked end, the city overhead suddenly reads as somewhere that could be walked; loose grit falls toward it. | Near and far cease agreeing about up. The ground separates from its contact shadow, then he is standing on the station slab. An upward-falling pebble remains. | Dry close steps and grit pattering overhead; one step's resonance arrives from the wrong direction. |
| Ash dunes | A buried road passes between leaning lamps. Crossing a dune crest reveals the road continuing under the banded planet; in the windless hollow, sand keeps creeping uphill. | Successive depths shear sideways at different speeds until the next step lands in the station. A heavy matchbox of fine sand remains. | Granular hiss falls away in the hollow, then returns from a direction the wind never occupied. |
| Glass storm | An obsidian channel opens onto the stopped tornado. Beyond a low fin, moving reflections reveal a further passage inside apparently solid glass. | Reflections lose agreement with their surfaces; the view separates along those fractures and the station fits between them. Black glass remains with lightning moving inside it. | Fine resonances and distant thunder, with a close fracture at return. Preserve the night's shared lightning timing and reduced-flash behavior. |

Each ejection cuts off an emerging possibility. Make it a spatial and acoustic failure to remain coherent, with a short abrupt final return. It is nonlethal. Preserve control until reassembly; do not add a white flash, explosion, injury response or a DEATH presentation. The five signatures express one shared law through different materials.

After returning, let the case register a new weight or contact sound. The object is simply there. Its full inspection supplies the existing authored description when the player chooses to look. Keep the landscape and the ejection free of collection prompts and modal reward paragraphs.

Duplicate station doors lead to the same pocket for that world during the run. Each world leaves one object. Small differences in the entrance's framing may give another view without creating another level or duplicate reward.

### Return and take back

Keep the established rule: an ordinary crossing leaves its world's object, then its door is taken back. Decoherence or an immediate retreat returns the player to the entry slab and begins the irreversible 12 second take-back, followed by the existing three second outline. Receipt and entry remain atomic, so an interrupted crossing cannot consume the only door without leaving its object.

Frame the return so the player can watch the door disappear. Nothing forces the camera toward it or blocks walking away. Let the player's abrupt loss of coherence and the world's slow reclamation of its door feel related but have different rhythms.

## Whiteout and the cold side

Before the five objects are assembled, the whiteout follows the ordinary step-budget rule. Passing power-line poles gives movement a readable scale; the lit window remains something worth reaching, but implausibly distant. Once the walking steps are spent, snow and depth decohere and return him to the station. That door is taken back and can reawaken later as already established.

With all five objects, their cold side corresponds to frost gathering at a whiteout threshold or scar. This time the usual step allowance passes without an ejection. The route continues. Let the player connect the bag's cold side and the threshold's frost without a quest panel or another task. The exception should feel perceptible before its danger becomes clear.

During the home walk, footsteps, passing poles and snow provide local movement. Distance haze withholds the house silhouette, and a gust across the final approach conceals its resolution. The gust uses the authored interval from 58 to 66.7 metres; clearing near the broad window radius reveals the house close at hand. House, support and player remain in fixed physical coordinates throughout. There is no teleport or hidden change in walking speed. Compare a roughly 25–35 second approach with the existing longer version in normal play.

Snow must remain present around the moving camera and when looking sideways or backward. Retreat before reaching the window leaves the home visit available; entering home does not itself resolve the errand.

## The snowbound house

The exterior is an ordinary two-storey house in worn roughcast, with a brick base and a simple slate roof. The bedroom is one bay in a larger, asymmetrical volume. The roof, eaves, chimney, closed secondary windows, gutters and drainpipe belong to that volume; the chimney stack follows the bedroom's side breast. Only the bedroom carries warm light. Weathering follows construction and exposure, with subdued repairs and snow caught on horizontal edges.

Seb chose a placement between a lower storey buried in deep snow and the impossible height of an upstairs window meeting the ground. The central approach stays exactly level with the upstairs floor. Asymmetrical wind-scoured hollows beside the house expose a lower window and the head of a lower door, enough to establish the missing storey without neatly explaining how he arrived at this height. It is not a hillside path or a climb to a viewing platform.

The shared house definition owns its footprint and the scour shapes. The same finite snow height supplies body support and the render surface; the eye follows actual ground and walking distance includes the grade. Both front corners can be rounded, and the closed house stops the body on every face. Visible snowbanks bound the local walk. The window's viewing region lies on the front side of its facade, so walking beside or behind the house cannot recognize the bedroom through a wall. Its accepted room and deep reveal keep their existing coordinates.

## The childhood window

Keep the camera in the world and the player outside the closed glass. The room has a full architectural volume, not furniture against a shallow backdrop: 3.6 metres wide, 4.25 deep and 2.55 high. Its front wall is 0.28 metres thick. The window is 1.78 metres wide, offset left of centre, with its sill at 0.78 and head at 2.20 metres. Deep side returns and a substantial sill make the pane a physical boundary.

A shallow chimney breast on the right side wall creates unequal alcoves. The old single bed occupies the left rear; the later study desk sits at the rear centre. A real door at the rear of the right side wall opens clear of the desk, and a dresser fits the rear right alcove with one drawer left ajar. Keep a plausible route from that door past the chair and bedfoot. The radiator sits on the left near-window return, so the green jumper reads in three-quarter view through the left pane rather than disappearing below the sill. Use the shared definition for exact positions.

Retain ordinary unevenness: bedding pushed back, a few books left where they were used, a broad shelf gap where the useful books went to college, the dresser not quite shut. These marks should read together from normal viewing distance. They are not separate inspection targets. Avoid a carefully curated nostalgia collection, packed departure luggage or a pristine room kept as a shrine.

Lateral movement changes the overlap of the reveal, jumper, furniture and back wall. The window remains where it is when the player turns away. Facing along the facade near the pane is inspection, not a turn toward the snow. Breath, cold air and clothing can establish the outside body; no visible hands are required. Nothing opens the glazing or lets the camera enter the bedroom.

Stage recognition in three beats:

1. **Familiarity.** The bed, study space and unfinished tidying read as the same room used through childhood and left by a young adult. It is empty. Wind drops near the wall; warm light reaches the snow. Reaching this viewing space restores composure once, independently of LOOK or STAY. Optional LOOK gives the plain recognition that he took the middle shelf's books when he left for college.
2. **The impossible thing.** Long green cuffs and the darned elbow make Lyle's own jumper recognizable on the radiator. Broad recognition does not require a precise click on cloth. LOOK establishes the chronology in a short observation: he did not know Lyle until years after he left this room.
3. **The invitation to stay.** Breathing settles. Physical approach or optional STAY makes the outside less present. The room's clock and radiator return to the same comfort sequence, sharing the 12.8 second phase in the bedroom definition; the pattern is available to notice without a paragraph explaining it. His movement outside becomes hard to hear while the room's small sounds become the centre of attention. The exterior fades perceptually, without losing its real position or route. Looking aside restores it immediately; turning toward the snow makes departure understandable.

The danger should make departure feel emotionally wrong while leaving it physically available. Let the player deepen the quiet by moving closer or choosing STAY. Repeated attention sustains the effect without identifying its cause or giving it a voice. STAY changes attention, not camera position or control. Do not animate an occupant into the bed, give the jumper a torso or breathing shape, or manufacture speech from Lyle. There is no concealed countdown, unexplained damage or forced camera movement.

Keep the view available as long as the player chooses. The local action rail offers **LOOK / STAY / TURN AWAY** from broad arrival; LOOK remains repeatable and leaving never depends on reading it first. Looking aside to inspect the frame is harmless and releases the local quiet. A deliberate turn toward the snow followed by at least 0.35 metres of actual outward movement ends the encounter; explicit TURN AWAY offers the same departure without requiring that camera gesture. Every action requires a fresh interaction, so one held input cannot inspect, settle and depart in sequence. Pausing freezes both the encounter and its comfort phase.

The jumper stays visibly behind the closed glass. During the unobserved departure, it is suddenly in the case, warm through. No pickup through glass, flying cloth or explanatory transfer animation. Its authored smell combines Lyle's hall with this bedroom. Composure and the jumper remain genuine gifts even though the invitation is dangerous.

The hold ends at the window. The jumper carries real warmth and the disturbing memory of wanting to stay; it has no continuing compulsion, undisclosed cost or ownership penalty. This gives the optional scene a complete local arc.

## Chapel arrival

After the whiteout, allow enough quiet for the player to notice the warm jumper and the doorway's absence. The station remains indifferent. Its operation supplies no verdict about what happened at the house.

Carry the chapel's leaked building sound into the physical corridor. Let exterior weather and realm beds fall away at the threshold, followed by one ordinary interior sound. Avoid another revelation immediately after the window; reaching the building should settle the journey while leaving the warmth troubling.

## Implementation boundaries and remaining work

1. The shared realm session now supplies real position and facing, floor and collision, walking-step budget and partial stride, decoherence stage, return pose, pause and recovery. Production integration has exercised entry, walking, step-triggered decoherence, automatic return and take-back through one complete errand.
2. All six pockets use their own ground and landscape definitions, with five ordinary decoherence signatures. Remaining acceptance covers the first interesting view, preview consistency, station orientation, door exposure, passing room and take-back sightlines at normal pace.
3. The whiteout's ordinary ejection, eligible home exception, recognition and voluntary retreat replace the old virtual walk and timed departure. The current bedroom revision rebuilds the architecture, adds the independent LOOK / STAY / TURN AWAY rail and unifies the local comfort phase. Keep the danger local to the window.
4. Finish the scene through continuous play and listening: direct chapel route, one complete errand and a return interrupted by pause or reload. Adjust lengths and mix using these traversals.

Use one authored realm definition for visible ground, collision, landscape staging and walking-step allowance. Draw the existing raymarched worlds behind the physical pocket with coherent depth, then apply the game's look to the composed scene. The current crossing layer cannot simply remain on top of the new meshes. A saved visit records its world, layout version, entrance door, station return pose, local player pose, completed steps, partial stride and decoherence progress. Door appearance and realm layout use separate stable seeds so duplicate doors agree about their destination.

Home discovery, recognition, jumper ownership and resolution need separate durable facts. Reaching the window grants composure without a tiny interaction test; departure grants the jumper once. Early retreat preserves a retry. Existing entry receipts must migrate without removing already earned objects.

## Acceptance

- A fresh player can find the station and chapel continuation while the opening remains black.
- Wood, glass, metalwork and realm seepage remain distinguishable with the torch on and off.
- All six realms support actual movement, stopping, looking sideways and retracing steps before the step-triggered ejection or home encounter.
- Ordinary decoherence starts at the configured step count regardless of location, viewing direction or object discovery. All movement directions count; standing, looking and blocked movement do not. Counts survive reload and work with footstep audio muted.
- Each ordinary landscape offers an interesting possibility during that walk. Its ejection feels like decoherence and return rather than death or dismissal.
- Early retreat, duplicate doors, different discovery orders and reloads cannot strand an object or the home visit.
- Five objects survive five different ejections as residue; their authored properties remain available in the case without collection tasks.
- The bedroom's architecture, lived-in use and green jumper remain readable under the game's actual look, from both the approach and lateral angles. Looking away changes the view; the room does not follow the camera.
- The empty room reads as one he grew up in and left for college, without period-prop exposition, a preserved child's-room shrine or a detail hunt.
- LOOK is optional and repeatable; STAY is optional; TURN AWAY is available without either. Keyboard, controller and the explicit action alternative all preserve fresh presses and voluntary departure.
- The clock/radiator comfort sequence repeats coherently while attention deepens the local hold. Looking aside restores the outside without departure; turning toward the snow and actually retreating departs. The loop freezes during pause and resumes without skipping.
- Composure restoration and the jumper happen once. There is no automatic 22 second departure.
- Weather remains continuous through the snow walk and the spatial fold.
- One uninterrupted tape-to-chapel traversal and one complete errand are reviewed at normal pace with actual headphone listening. Browser/build checks alone do not establish this acceptance.
