# Bus woman: character research and three directions

Research pass: 12 October 2026. These are design proposals, not three new identities. Production appearance remains the user's choice.

## What the current game actually establishes

The ordinary woman is a local with judgement, memory and a dry sense of humour. She knows the removed route 48, remembers the municipal baths where her daughter swam, lives three streets away, and chooses the shelter because she can see the baths windows. Her dialogue does not make her helpless, confused, ancient, or supernatural. Give her the physical confidence and attentive face that this voice deserves. Source: `src/data/exterior-lore.js`, `yard-bus-waiter` tree.

The starting asset already establishes a useful recognition set: 1.70 m, deep brown skin, black hair, navy coat, mustard scarf, black wool hat, denim trousers, brown bag. Its shape is assembled from hard primitive stock; its builder explicitly omits a modelled face. Source: `tools/chunk_surfer/build-props.mjs`, `buildExteriorLocal('exterior_bus_woman', ...)`, and its preceding tailoring block. The yard placement is a standing figure beside the shelter, not its bench occupant: `src/data/conservatory-props.js`, `yard-bus-waiter`.

The Outskirts model is separately generated: similar height and a bag, but an enamel coat, different hair/head/skin construction, no explicit hat or scarf. That reads as accidental replacement rather than a stable recurrence. It appears at the shelter, aboard the bus, in the close bus encounter and as four roadside copies. Those situations need one visual master with pose and context variants, not separately authored bodies. Sources: `tools/chunk_surfer/build-props.mjs`, `person('outskirts_bus_woman', ...)`; `src/data/source-outskirts-arrival.js`.

The Outskirts text already contains the best design detail: the same coat is buttoned wrong in exactly the same way. She searches her pockets, starting with the right; she takes the return half without examining it and puts it in that right pocket; later she holds the ticket up. These are physical actions with surfaces and contacts, not generic idle gestures. Source: `content/narrative/source-space.outskirts.story.json`, nodes `woman`, `woman-lost`, `woman-again`, `woman-given`, `woman-after`.

The Outskirts planning document explicitly says the woman is nobody, a figure retained by the road, and does not point to Sarah. Using a recognisable model across the game should not add a declaration that the Outskirts woman is Sarah or explain what the recurrence means. Source: `docs/plans/outskirts-losing-himself.md`, “Sarah” section. Preserve that ambiguity; do not introduce a character name or new family history.

## Shared 3D direction

- Keep an ordinary, particular human face in all options. No faceless carryover from the boy, glowing eyes, hollow head, or mask. Use eyelids, shallow eye sockets, cheek/jaw transitions, lips, ears and a continuous hairline. Mature adult is a proposal; the game does not supply an exact age.
- Preserve the skin/clothing recognition set. Dark skin must retain cheek and hand volume under sodium light, torch falloff and dither; do not lift it to grey to make it readable.
- Model anatomy beneath clothing, then a separate fitted coat with real thickness at collar, cuffs, hem and pocket mouths. Folds come from shoulder seams, elbow compression, bag contact, closures and gravity. Avoid detail made solely from lines on a box.
- Hands need separate fingers and a distinct thumb, with knuckle/palm proportions that survive a near ticket exchange. The hand must grasp the bag handle rather than sit nearby. Right-pocket access needs a true opening or a carefully occluded contact pose, not a hand passing through an uninterrupted coat front.
- Preserve one face, body proportions, height, bag wear, scarf knot and hat in every appearance. Selectable directions vary silhouette and performance, not ethnicity or lore.
- Bag mass should pull its strap and the carrying shoulder. Its bottom should settle against thigh or coat. Do not animate it as a rigid child of a distant wrist that swings through her knees.
- No independent oscillators on head, chest and hands. Idle should be a sequence of decisions: attend to road; relax weight; glance at baths; respond to player; return attention. Most time is still.
- Outskirts escalation should preserve the body and alter when a familiar action occurs. Her recognisability is what makes the relocation, repeated wrong button and four copies disturbing.

## 1. The Familiar Wait

**Best for:** making her a credible, memorable local first, and allowing the later recurrence to carry the unease.

**Shape:** softly tailored, knee-length navy wool coat; modest lapels; gentle waist suppression; low diagonal pockets; denim visible below. The mustard scarf has one short end outside the coat and one tucked end. Black wool hat follows the skull with a real turned ribbed edge. Brown bag hangs at the outside thigh, supported with an easy bent wrist. The coat has an open lower split so the legs read individually. Nothing is fashionably distressed.

**Close work:** a particular warm, alert face rather than a stock “sad old woman”; a subtly uneven mouth corner, small under-eye volumes and a soft jaw transition. The bag has a flattened handle at the grip, softened lower corners, a pressed side against the coat, and one repeated repair seam. The wool nap and scarf knit stay low contrast so facial planes remain legible under dither.

**Ordinary performance:** weight mostly over the bag-side leg. A small heel release precedes a weight transfer; the bag responds after the pelvis. Her head turns only partway toward the road, then eyes finish the look. During conversation she gives the player her attention without squaring both feet like an NPC awaiting orders. A brief lift at one side of the mouth suits the local-government line, with no constant smile or exaggerated lip flap.

**Outskirts performance:** the same coat carries the same single wrong fastening; the patient waiting sequence is punctuated by the prescribed right-pocket-first search. The return-ticket pose reuses her ordinary economical reach. In the four-copy pass, preserve the face and outfit precisely but distribute the figures across distinct paused moments of that one action. The image reads as one person retained several times, not four unrelated town inhabitants.

**Cost/risk:** the gentlest silhouette of the three. It depends most on convincing head, hands and restrained movement; a weak face would erase its advantage. Do not compensate with bright scarf saturation.

## 2. The Button Out of Place — recommended

**Best for:** turning an existing line into a model-level signature the player can recognise without an explanatory caption.

**Shape:** a slightly roomy, straight navy raincoat with soft raglan shoulders, a plain collar and useful slanted pockets. One fastening sits a buttonhole out: the overlap rises diagonally, the hem lifts on that side and one compressed fold runs from closure to pocket. Make the fastening error mechanically plausible, not an arbitrary zigzag painted on fabric. The mustard scarf is close to the neck, leaving the chin and cheek readable; the black cap and denim retain continuity with today's woman. Bag hangs from the left forearm at hip level, leaving the right hand available to search.

**Close work:** folded collar layers, visible placket overlap, button shank and hole positions, a pocket lining that briefly appears when her thumb opens it, creased but intact hands, realistic short nails. Her face remains ordinary and alert in the yard. A tiny coat repair, scarf knot and bag buckle can serve as continuity landmarks. Do not multiply visual clues into an inventory puzzle.

**Ordinary performance:** she rests the free hand near the right pocket without perpetually rummaging; occasionally resets the bag higher on her forearm and looks toward the baths. Coat motion follows that lift and settles. The wrong button is already physically possible in the yard but is not announced, allowing the player to notice continuity later.

**Outskirts performance:** the search is an authored cycle: right thumb opens pocket; fingers enter while elbow makes room; brief tactile check; withdraw; left pocket check; stillness. The right pocket is always first. The animation should provide a genuine pause in which the player can offer the ticket. Accept between thumb and forefinger, turn wrist inward, deposit into right pocket, hand emerges empty. Later presentation holds the same single ticket at a believable height and distance, with paper attached to actual grip coordinates. Make saved errand state select the correct clip and ticket visibility.

**Surreal escalation:** keep the geometry exactly unchanged. What changes is the delay before she resumes the same search, the location in which that unfinished action continues, and the precision with which all copies repeat the wrong fastening. At the bus, a human head/upper-body turn lands in an unnaturally exact repeat of a familiar pose. Do not rotate the whole person like a turntable.

**Cost/risk:** highest demand on pocket, fingers, coat and ticket contacts. It rewards careful 3D work. Requires separate coat/hand clearance review through the full cycle and from a side camera; do not hide failure behind a fixed player view.

## 3. The Last Passenger

**Best for:** the strongest distance silhouette and the most controlled close encounter aboard the bus.

**Shape:** a longer navy overcoat with a broad but plain folded collar, narrow lower opening and weight through the hem; calf-length rather than an ankle robe. It retains the same one-slot wrong fastening and resulting uneven hem, though the held bag makes that a discovery at an angle rather than the main silhouette. Mustard scarf mostly tucked, visible as a small warm shape below the chin. Same wool cap, face and boots. Bag held close across the abdomen with one hand through the handle and the other laid over it. The overall shape is taller and more vertical than the other two without changing actual body height.

**Close work:** enough coat thickness to sit differently against forearm, hip and calf; a softly compressed bag where her forearm presses it; visible bare hands in a supported rather than clasped/prayer pose. Face is calm, neither vacant nor threatening. Leave real space between jaw and collar so the head can turn without cutting into the coat.

**Ordinary performance:** quiet chest motion; an occasional finger adjustment around the handle; a small neck turn coupled to shoulder rotation. She moves the bag aside before reaching into a pocket. Her feet remain established on the ground; a look is not an unmotivated walk. Conversation is sustained attention, followed by a deliberate return to her earlier road-facing stance.

**Outskirts performance:** the ticket exchange briefly breaks the held posture; she stores the paper in the same right pocket, then later brings it out to the road. For the close bus encounter, eyes attend, head begins, shoulders follow, then weight releases into the single authorised footstep after the crossing. The game should not spend the turn at a distance; preserve its existing proximity/commitment gating. The long coat must fit the bus floor and doorway without shortening the actor.

**Surreal escalation:** each repeat begins in precisely the same compact held posture, wherever the road has placed her. A fully ordinary person repeatedly occupies an impossible arrangement. The strongest image is her face still entirely human behind the windscreen, rather than a facial mutation.

**Cost/risk:** long hem needs careful knee clearance and contact-aware deformation for a seated pose if one is actually required. Current Outskirts “aboard” placement is raised standing placement, not evidence of a seated performance; do not invent a sitting scene just to use an animation. Too much stillness could read as frozen; occasional intentional shifts must establish life in the yard first.

## Recommended presentation in the canvas

Use three real mesh maquettes at identical 1.70 m height and identical lighting. Let the user rotate front/three-quarter/profile, move between ordinary yard and Outskirts contexts, and pause a small performance loop. Offer a dither preview toggle labelled as an approximation if it is not the actual game shader. Include a face/hands inspection camera; do not make polished clothing hide a rough head. Show the wrong fastening under both coat silhouettes even when it is not their dominant motif.

Keep the comparison focused: 1 is humane familiarity, 2 is remembered physical detail, 3 is a held silhouette and body-led turn. Label unimplemented actions as production intentions, especially pocket entry and ticket transfer if the maquette does not yet support them.

## Continuity acceptance checklist for the selected production model

1. One canonical mesh/skin/material identity feeds yard, ordinary Outskirts shelter, aboard placement, close bus encounter and four-copy pass. All placements retain their authored anchor, eye line and walk clearance.
2. Full ordinary face and both hands remain coherent at 0.5 m, 2 m and shelter distance, with torch on/off and actual production dither. Test deep-skin facial plane readability rather than only silhouette.
3. Coat is misbuttoned the same way every time. The pocket-search sequence starts on her right. Bag and scarf do not swap sides between poses or instances.
4. The return-ticket save flag drives the same physical state after a reload: no extra paper hovering beside the model, no perpetual search once she visibly holds the ticket, no two tickets visible at once. Copy placement does not produce extra reward targets.
5. Close bus turn is foot-planted and driven by the encounter state; distant watching does not consume it. One follow-up footstep remains tied to the crossing.
6. Character animation is in the shared renderer so fog, depth, dither, torch, reflections and eligible recorded visuals do not fall back to the old block figure.
7. All deliberate repeated copies retain the same face and clothes. Shared model continuity is not a new narrative claim that the woman is Sarah or that the road's figure has the yard woman's biography.

## Primary sources and what they actually support

All links checked in this research pass on 12 October 2026. These references inform construction and observation; the proposals above are design judgements, not facts inferred about the fictional woman's identity.

- **London Museum, Bob Collins, _Bus queue_, c.1960, object IN38475.** The museum describes people waiting in rain under low light. Useful environmental grounding for ordinary bodies and clothes in a wet street. It does not establish the game's period, her age, costume, or identity. The image remains copyrighted; do not bundle it as a texture or reference image asset. [Museum record](https://www.londonmuseum.org.uk/collections/v/object-765786/bus-queue/).
- **The National Archives UK, _Number 16 Bus_, c.1963, HLG 131/100.** An archive photograph made for the Ministry of Housing, posted by the archive itself. A useful source for the unheroic scale and proximity of people waiting together; again this is a reference, not a declaration that the game is set in 1963. [Archive's image record](https://www.flickr.com/photos/nationalarchives/5078049145).
- **Mackintosh, Dalston Raintec coat, current manufacturer construction description.** Raglan sleeves, flap pockets, side vents and a lined raincoat give specific seams, volumes and usable openings to model. The proposal removes brand identifiers and does not copy a luxury garment wholesale. This product is menswear: use garment construction evidence, not its model's body or sizing as female anatomy. [Manufacturer page](https://www.mackintosh.com/en-us/products/dalston-raintec%C2%AE-coat-dark-bottle).
- **Burberry, Summerside trench, current manufacturer description.** Confirms separate collar fastening, back storm shield, pocket flaps, lining and set-in sleeve construction as real layered garment features. The design does not require its trademark check, hardware or silhouette. [Manufacturer page](https://us.burberry.com/short-gabardine-summerside-trench-coat-p81262671).
- **CMU Graphics Lab Motion Capture Database, “wait for bus” and waiting entries.** Useful primary motion catalogue for studying support-leg shifts and pauses; this pass identified the clips through the official catalogue's indexed descriptions. The detailed page fetch failed, and no clip was downloaded or visually validated, so the proposed timings and gestures are authored intentions, not claimed mocap measurements. [Official motion catalogue](https://mocap.cs.cmu.edu/search.php).
- **MakeHuman Community, asset license and rigging/posing documentation.** Its core assets are CC0; rig definitions and weight files are separate and fit the skeleton to the body. This supports the same editable anatomical-base workflow used for the recent characters. It does not imply a downloaded community garment has the same license; inspect each asset separately. [Asset license](https://static.makehumancommunity.org/about/license.html), [rigging documentation](https://static.makehumancommunity.org/mpfb/developer/rigging_and_posing.html).
- **Blender Manual, cloth-on-armature workflow.** Models cloth around, rather than through, the body; supports pinned cloth vertices with collision against the character. Use this during authoring, then export a bounded deterministic game deformation. It does not prove that an exported animation is collision-free. The fetched source is the documentation staging site. [Cloth examples](https://docs.staging.blender.org/manual/en/latest/physics/cloth/examples.html).

