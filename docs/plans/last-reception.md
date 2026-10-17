# The Last Reception

Implemented selected spirit-jail direction, October 16, 2026. One optional
occupied foyer sits on the west middle bank of the Braided Divide, x -83..-47,
z -466..-444, floor 9m. The lift, strata entrance, Listening Court, continuous
field bypass and grey-door endpoint retain their existing roles.

## Experience

Both east thresholds remain physically open. The lounge, box office, return
room, service loop, west passage and upper gallery can be explored and left
before revelation. Conversations have no timer or cast quota. A second, newly
informed conversation can disclose the jail; finishing it arms a public cue.
Cancelling the conversation does not finish it or consume the grace beat.

“He can leave” turns the room's attention toward the visitor. The crowd starts
after 2.35 seconds of playable grace. Six distinct residents walk the actual
room routes, including the gallery stair, at 1.55–1.8m/s. The human interior has
the same 2.1m/s walking pace before and after revelation. Residents intercept
junctions and reach; they are never hard collision capsules. Sustained contact
can capture after 1.45 seconds, while directional walking resists and breaks
the hold. Saved movement resistance spans the game's logical cell intervals.

Capture transfers the visitor to the return chair on the same 9m floor. After
the short 3.2-second beat, residents address a retained seated imprint. The
visitor rises beside it and walks the known service route back to the same
bank. Current composure, ceiling, equipment, takes and ending eligibility are
not charged. Ordinary flashlight use continues to consume its ordinary battery.
Crossing either exterior threshold resolves a clean escape. Revisits remain
explorable and unread conversations remain available; neither outcome repeats
the ambush. At the seam, a following resident flattens into source relief.

Pause, modal reading and focus loss stop encounter clocks. Saved local state
retains knowledge, phase, used grace, resident positions, gait, holds and outcome.
The separate HUSH battle remains voluntary. The explicitly requested third-floor
cherubs are retained as three overhead witnesses, separate from the six residents.

## Construction and rendering

- `src/data/source-last-reception.js`: finite shared visual/collision solids,
  native foyer furniture, two exits, gallery stairs, light anchors and navigation.
- `src/game/source-last-reception.js`: serializable encounter and conversations.
- `src/render/source-last-reception-meshes.js`: seven architectural material batches.
- `src/render/source-last-reception-residents.js`: anatomical poses, planted gait,
  seated-to-standing placement, reaching, retained imprint and seam flattening.
- `public/assets/source-last-reception-residents.glb`: six anonymous residents
  plus imprint, with articulated 54-joint human skins.
- `src/render/source-last-reception-celestials.js`: three copies of the third-floor
  Held Note, above the north lounge, west lounge and return room. Each retains
  its body, joined faces, four wings and eye wheel with a shared original pose.

The celestials hold an asynchronous slow breath and eye-wheel movement. Their
clock pauses with reception conversation and reduced motion holds their poses.
They use the ordinary lit, shadowed and dithered character pass. Their actual
posed geometry stays above the walking volume, clear of walls and roof. The
third-floor encounter retains its own choreography and state; the reception
copies introduce no extra attack, damage, dialogue or invisible colliders.

Residents enter the same world prop color, depth, shadow and final pixel-mesh
dither path as other characters. The flashlight clarifies bodies and openings;
it does not increase their pursuit speed. The practicals keep the release route
readable with the flashlight off. Source text appears as laminated physical
material at cut edges, with no terminal interaction.

The upper walls and partition heads are now separate, uneven source courses
with real gaps and projecting cut ends. A thick source binding crosses the
return-room entrance; its braces and `return` strokes are finite extrusions.
The south wall fans out around a body-sized incision holding the return-room
cherub, then continues through an actual missing section of the ceiling.

Above the room, the original foyer sofa becomes an inverted architectural
vault at scales 22/16/22. Both ceiling apertures reveal the same enormous
upholstery above the human sofa below. Native ticket-counter geometry grows
sideways out of the east wall at scales 2.4/6/8, climbing to 28.53m. Physical
source roots join it to the interior grille. These are retained overworld GLBs
in the world pass, including their real pitch/roll, rather than abstract boxes.
Their lowest geometry clears the normal body and gallery walking volumes;
both exits and the continuous field bypass retain their physical routes.

The two displaced west-bank remnants retain their identities beside the foyer.
`tools/chunk_surfer/sync-source-divide-contacts.mjs` refreshes actual contact
triangles and asset hashes after a prop pack rebuild. It never updates a hash
without rebuilding its matching triangles.

## Verification and review

God menu: **SOURCE / THE LAST RECEPTION**. The preset places the body outside
the open main entrance on its actual bank; ordinary movement drives the visit.

Focused layout, runtime, production integration and anatomical deformation
tests cover free exploration, both exits, gallery traversal, conversation sight,
pause/save behavior, ordinary-walk escape, the retained imprint, chair alignment
and the elevated capture/release regression. Existing Source route/contact tests
cover the preserved field boundaries.

`tools/chunk_surfer/verify-source-reception-live.mjs` drives real W/E/Space and
Escape input through exploration, revelation, escape, revisit, capture, pause,
imprint and service release. Captures and its report are under
`artifacts/source-spirit-jail-design/implementation/`.

The character GPU verifier checks all seven final meshes across 19 posed states
through material/depth composition and final dither, with no shader or pose
errors. Its evidence is under `artifacts/source-last-reception/resident-proof/`.
The celestial regression samples their actual animated skin for room and walking
clearance; `tools/chunk_surfer/verify-source-reception-celestials.mjs` checks all
three complete models through world composition and final dither. Its captures
and report are under `artifacts/source-last-reception/celestial-proof/`.
The source-architecture regression traces real native GLB triangles through
both roof apertures and checks all rendered instance centres against their
world matrices, including a nonzero Source origin. This catches furniture
being culled from the wrong position as well as lost inverted transforms.
`tools/chunk_surfer/verify-source-reception-room.mjs` renders three views using
the production prop instances, geometry, lights, room-memory composition and
final dither. It uses a bounded crop of actual geometry cells for inspection;
it does not replace the game plan. Its final views and reports are under
`artifacts/source-last-reception/room-proof/`.
These are browser and automated movement checks, not a native Tauri or subjective
hands-on acceptance claim. Production bundling passes. The full build's paper
validation currently reports an unrelated stale semantic hash for page 8.
