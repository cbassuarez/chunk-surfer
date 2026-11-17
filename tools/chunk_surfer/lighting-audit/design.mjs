// The written half of the lighting audit: intent, proposals, budget and proof.
// Numbers that come from the captures are computed from metrics.json here, so
// a rerun cannot leave stale figures in the prose.
const pct = v => v == null ? '–' : `${Math.round(v * 100)}%`;
const num = (v, d = 1) => v == null || !Number.isFinite(v) ? '–' : (+v).toFixed(d);
const median = list => { const s = list.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const span = list => { const s = list.filter(Number.isFinite); return s.length ? [Math.min(...s), Math.max(...s)] : [null, null]; };
const preview = (s, id) => s.previews?.find(p => p.id === id) || null;

export const DESIGN = {
  lede: `The renderer works out a lot of light: twelve lamps, a torch cone, wall shadows, bounce onto ceilings. Very little of it reaches the player. In the building, 0–4% of the lit scene lands on a screen value anyone can see; the rest is mapped to black by the dither. What does survive is mostly light with no direction: the ambient fill, and in most rooms a large share of light that no lamp controls and that survives with every light switched off. That is the flatness. This page shows the measurements, live previews and an exposure sweep, what real night light does differently, an intent for each space, and two groups of changes with their costs, ending with an order of work. After the first review the plan leads with exposure: in every view, one stop more on every light looked better than moving ambient into the lamps.`,

  findings(stations, refs) {
    const building = stations.filter(s => s.space === 'conservatoire' && s.id !== 'concert-hall');
    const [visLo, visHi] = span(building.map(s => s.transfer.visibleShare));
    const [toneLo, toneHi] = span(building.map(s => s.dither.tones));
    const [refLo, refHi] = span(refs.map(r => r.screen.tones));
    const ambientKey = stations.filter(s => s.key?.label === 'Ambient + bounce').length;
    const flatMedian = median(stations.map(s => s.clay.flatShare));
    const residualHigh = stations.filter(s => s.residualShare >= .4);
    const walls = stations.map(s => s.cost.frameWallMs).filter(Number.isFinite);
    const over = walls.filter(v => v > 16.7).length;
    return [
      {figure: `${pct(visLo)}–${pct(visHi)}`, title: 'of the lit scene reaches the screen', body: `In ${building.length} of the 6 building stations, only this share of the lit scene lands above L* 8 after the dither. Light becomes visible 2.5–4 stops above the frame's median, so the gradients the renderer computes sit below the dither's first step. The concert hall is the exception at ${pct(stations.find(s => s.id === 'concert-hall')?.transfer.visibleShare)}: its emergency red is bright.`},
      {figure: `${toneLo}–${toneHi}`, title: `tones in the building, against ${refLo}–${refHi} in photographs`, body: `Measured the same way, eight night photographs keep ${refLo}–${refHi} separable tones. The darkest of them, a room lit by two windows, is 64% black and still keeps 14. The building stations keep ${toneLo}–${toneHi}, with 79–96% of the frame in the darkest bin.`},
      {figure: `${ambientKey} of ${stations.length}`, title: 'stations are keyed by ambient light', body: `The largest single source of light at these stations is the ambient-plus-bounce fill, which has no direction. In clay, a median ${pct(flatMedian)} of lit surfaces sit within half a stop of each other: walls, floors and ceilings read as one value.`},
      {figure: `${residualHigh.length}`, title: 'stations are mostly lit by nothing the rig controls', body: `With ambient, bounce, torch and every lamp at zero, ${residualHigh.map(s => s.title.replace(/\s*\(.*\)$/, '')).join(', ')} keep 40% or more of their light. ${DESIGN.skySentence(stations)} On the drive and in Source the rest is sky, the void and emissive props. Two other source-less shader terms (the rim pattern and chunk glows, <code>r3d.js:2601–2602</code>) were also measured at 0–1%, so what this light is remains open; see A3.`},
      {figure: `${over} of ${walls.length}`, title: 'stations already miss 60 fps here', body: `Median frame time to finish is ${num(span(walls)[0])}–${num(span(walls)[1])} ms on this Intel GPU at 1120 × 700. The world pass alone is about 13 ms before any lamp. Lamps are cheap in the world pass (0.1–2.6 ms in the building and yard) and expensive in the mesh pass (up to 18 ms on the opening drive). New lighting has to be paid for.`},
      {figure: 'Source', title: 'is flat in three different ways', body: `First-lift is drawn without the light model: clay changes 1% of its pixels. Last reception takes 74% of its light from ambient. Hall entry has a real falloff down the corridor in the scene buffer, but only ${pct(stations.find(s => s.id === 'source-hall-entry')?.transfer.visibleShare)} of it shows on screen; moving ambient into its lamp takes that to ${pct(preview(stations.find(s => s.id === 'source-hall-entry') || {}, 'key-over-fill')?.visibleShare)}.`},
    ];
  },

  skySentence(stations) {
    const measured = stations.filter(s => s.skyTerm);
    if (!measured.length) return '';
    const values = measured.map(s => s.skyTerm.share).filter(Number.isFinite);
    return `It is not the fixed sky term either (<code>r3d.js:2631–2633</code>), measured at ${pct(Math.max(0, Math.min(...values)))}–${pct(Math.max(...values))} at ${measured.length} stations.`;
  },
  stationNotes: {
    'get-in': 'Torch off. The scene buffer holds a lit loading bay; the screen shows its edges. 80% of the frame\'s light survives with every rig light at zero: the glazed roof, the light strips, and a grey veil over every surface.',
    'get-in-torch': 'Torch on. The torch is the key, but the room around the pool falls straight to black: 4% of the lit scene shows.',
    'practice-corridor': 'Torch on, no lamps. One tone survives: the beam\'s hot spot.',
    'chapel': 'One lamp, and it gives 2% of the frame\'s light. Nothing reaches a visible value, and neither preview changes that: the room is lit by ambient and leftover light, both well under the dither\'s first step.',
    'concert-hall': 'Six emergency fittings. The one station where most of the scene reaches the screen, because the red is bright. Also the one where the mesh pass pays most for lamps (+7.4 ms).',
    'front-atrium': 'Eight lamps, but five are emergency fittings switched off and the three working ones each add about 6% (the same as the off fittings, so that is noise). Ambient is the largest source and the scene range is only 2.1 stops. Neither preview moves it.',
    'yard-road': 'Twelve sodium lamps, the most light of any station, and the slowest frame (54 ms). Surface reflectance is 0.09, realistic for wet tarmac.',
    'drive': 'The best-read station in the game: 19 tones. Its light is mostly sky and dashboard, with the headlamps second.',
    'drive-teaser': 'The opening drive. 23 tones, the most of any station. The mesh pass spends 18 ms on its eleven lamps.',
    'source-first-lift': 'The white sea. Clay changes 1% of the pixels: this view is not lit by the light model at all, so no light change can shape it.',
    'source-first-contact': 'The blue void and the figure. Flat by construction; the figure is the only lit object.',
    'source-landscape': 'Four lamps and a lit door. 72% of the light is sky and void; the lamps reach 7% of the screen.',
    'source-hall-entry': 'The best-lit Source room: the lamp at the end is the key and the corridor falls off toward the camera, but on screen most of that falloff is black. It responds most to the rig previews of any station: 9 → 21 tones and 16% → 59% visible with ambient moved into the lamp.',
    'source-last-reception': 'The surrounding wall is a flat fill; the doorway shows a lit room. 74% of the light is ambient.',
  },

  stationsIntro: 'Each station shows the frame as the player sees it, the same frame with every lit surface set to 18% grey (so only light is left), and the scene\'s own light in false colour. The table gives what the renderer was holding and what was measured; "each light on its own" opens one frame per light at a fixed exposure. Timing is the median of 50 frames, second round (the first round after the captures ran up to three times slower and is not used); Source stations ran one shorter round because longer runs exhausted memory there, so treat their timings as rough.',

  previewSummary(stations) {
    const rows = stations.filter(s => s.previews?.length);
    const moved = rows.filter(s => { const b = preview(s, 'base'), k = preview(s, 'key-over-fill'); return b && k && k.tones - b.tones >= 3; });
    const stuck = rows.filter(s => !moved.includes(s));
    const line = s => { const b = preview(s, 'base'), p = preview(s, 'plus-one-stop'), k = preview(s, 'key-over-fill'); return `${s.title.replace(/\s*\(.*\)$/, '')}: ${b.tones} → ${p.tones} → ${k.tones} tones, ${pct(b.visibleShare)} → ${pct(p.visibleShare)} → ${pct(k.visibleShare)} visible`; };
    return `<p><b>By the numbers, where a real source reaches the view, both changes move the frame.</b> ${moved.map(line).join('; ')} (as now → +1 stop → ambient to lamps).</p>
<p><b>Where the light comes from ambient or the leftover, neither moves it much.</b> ${stuck.map(line).join('; ')}. In these views the lamps barely touch what the camera sees: the chapel's one lamp gives 2% of the frame's light, each atrium fitting about 6% (also the frame-to-frame noise there), Source landscape is 72% void and sky, last reception 74% ambient on a flat fill. The building rooms also sit 2.5 stops or more under the first visible step, so one stop of exposure is not enough. These views need a lamp where the eye should land (the intent) and the tone curve change (B1), not a gain.</p>`;
  },
  verdict: '<b>Reviewed 2026-11-17: "Every light +1 stop" looked better than "Ambient −1 stop, lamps and torch +2 stops" in every view.</b> The rebalance scores more tones after dither at most stations, so tone count is not the right judge here. Visible share and the darkest-bin share side with +1 stop more often (the drive: 58% against 37% visible; the yard: 39% against 26%). The plan below leads with exposure, and the rebalance (A2) is dropped.',
  sweepIntro: 'Every light scaled together, as exposure would, at ½-stop steps up to +2. Same live method as the previews: the uploaded light values are multiplied, nothing is edited. The question is where it stops looking better; the numbers under each frame are the ones that agreed with the review.',
  sweepSummary(stations) {
    const rows = stations.filter(s => s.sweep?.length && s.previews?.length);
    if (!rows.length) return '<p class="muted">Sweep not captured yet.</p>';
    const ladder = s => { const b = preview(s, 'base'), one = preview(s, 'plus-one-stop'), f = id => s.sweep.find(p => p.id === id);
      return [b, f('plus-half'), one, f('plus-one-and-half'), f('plus-two')].map(p => p ? pct(p.visibleShare) : '–').join(' → '); };
    return `<p>Visible share from as now to +2 stops: ${rows.map(s => `${s.title.replace(/\s*\(.*\)$/, '')} ${ladder(s)}`).join('; ')}.</p><p class="muted">Pick the step by eye, per zone; the numbers only show where more light stops reaching the screen.</p>`;
  },
  previewsIntro: 'These are the game, live, with two changes applied to the light values the renderer uploads. No shader or data file was edited. "Every light +1 stop" doubles ambient, lamps and torch, which is what more exposure does to lit surfaces. "Ambient −1 stop, lamps and torch +2 stops" moves light from the fill to the sources, which is what a directional rig does. In the building the white point is derived from ambient (<code>conservatory-lights.js:163</code>) and was held fixed here; a real change has to separate the two, or cutting ambient will also raise exposure.',

  referenceIntro: 'Eight photographs from Wikimedia Commons, chosen for the kinds of space the game has, and measured with the same screen metric as the stations. Each note says what the photograph does that our frames do not.',
  refNotes: {
    'ref-00.jpg': {title: 'M62 at night, sodium columns', note: 'Each column throws a pool on the carriageway and the road between pools goes dark. The lamps themselves are the brightest things in frame. Our drive has the headlamps but no pools on the road ahead.'},
    'ref-01.jpg': {title: 'The M62 across Scammonden at night', note: 'A line of sodium lamps across an otherwise black moor, and the sky glow of the towns behind. The land is a silhouette against the sky, not a lit surface. Source landscape lights its ground evenly instead.'},
    'ref-03.jpg': {title: 'Sodium lamps over ice', note: 'Light falls off from each lamp across a few metres, and wet ground doubles each pool with a reflection. Our yard has twelve sodium lamps but its ground reads as one level.'},
    'ref-05.jpg': {title: 'Dockside, lamps in pools', note: 'A few high lamps, hard pools under each, structures between them in silhouette. Close to the loading bay at night; our get-in shows edges and black.'},
    'ref-04.jpg': {title: 'Warehouse corridor under strip lights', note: 'Rows of overhead fittings give a clear direction from above, and the floor carries their reflection into the distance. The far end stays readable because each fitting relights it. Our practice corridor and atrium have lamps, but the ambient fill outweighs them.'},
    'ref-08.jpg': {title: 'Church nave at night, Marmoutier', note: 'Small warm fittings low on each pier light the stone around them and leave the vault dark. Shadow sits on the far side of every column. Our chapel has one lamp and a frame that never reaches a visible value.'},
    'ref-12.jpg': {title: 'Church lit red, Fulda', note: 'A single colour, but bright pools near the fittings and darker floor between them keep 15 tones. The concert hall\'s emergency red is the closest thing we have, and it is also the station that reads best.'},
    'ref-10.jpg': {title: 'A room lit by two windows', note: 'Two emitters and nothing else, 64% black, yet the floor reflects both and a faint edge line survives. Darkness is placed, not total. This is the register Source wants: darkness with a few lit things that carry the whole frame.'},
  },

  intentIntro: 'One paragraph per space, written as targets the measurements can check later. These are proposals for you to edit: the horror depends on where darkness is kept, and that is an authorial choice.',
  intents: [
    {space: 'conservatoire', title: 'The conservatoire', key: 'The fittings that are on, and the torch. Each lit fitting should own a pool about 3–5 m across; the torch is the key wherever the player points it. Ambient stays a floor under them.', shadows: 'Unlit rooms stay black except for their edges. Between fittings, surfaces drop 3–4 stops below the pool and keep 2–3 visible tones of falloff before black. The far side of furniture, piers and door reveals is the darkest part of a lit room.', eye: 'The lit fitting and what it lights: a door, a desk, a stair. In a torch-only room, the torch pool and its edge.', target: 'Targets: at least 25% of the lit scene visible and under 70% of the frame in the darkest bin where a fitting is on or the torch is up; torch-off rooms may stay dark.'},
    {space: 'exterior', title: 'The yard and streets', key: 'Sodium columns. Each makes a pool on the ground with a hard falloff and a reflection where it is wet. Sky glow lights roofs and silhouettes, not the ground.', shadows: 'Between pools the ground goes to 3 stops under the pool. Building faces away from the lamps stay near black.', eye: 'The pools and the next lamp along the route; the lit door you are meant to reach.', target: 'Targets: at least 35% of the lit scene visible; frame under 33 ms here (it is 54 ms now).'},
    {space: 'drive', title: 'The drive', key: 'The headlamps on the road ahead, then the motorway lamps when they come. The dashboard is a small emitter, not a fill on the cab.', shadows: 'The cab interior sits 3–4 stops under the road ahead. Verges outside the beam fall to black within a few metres.', eye: 'The road in the beam and the next lamp or sign.', target: 'Targets: at least 50% of the lit scene visible (58% at +1 stop); keep the 19–23 tones; recover 10 ms in the mesh pass.'},
    {space: 'source', title: 'Source', key: 'What exists there: a leaking door, the motorway lamp, the lit room past a threshold. One nearby source per view, with real falloff, not a lamp 100 m overhead that reaches everything through walls.', shadows: 'Most of the frame. Darkness is the ground of Source, but it is placed: surfaces near the key keep 3–4 tones of falloff before black, the way the two-window photograph does.', eye: 'The source itself and the doorway or figure it reveals.', target: 'Targets: no flat fills in a lit view (clay must change the view); at least 30% of the lit scene visible where a source is in view.'},
  ],

  groupAIntro: 'These use machinery the renderer already has. Most are data or uniform changes; the previews and the exposure sweep show A1 at the stations.',
  rig: [
    {id: 'A1', title: 'Raise exposure, per zone (leads the plan after review)', where: 'r3d.js:6576 r3dPhysicalAcquisitionExposure; conservatory-lights.js:163 and 611–613', effect: 'Preferred in review over every other preview. +1 stop takes the torch-lit get-in from 4% to 18% visible, the drive from 32% to 58% and the yard from 23% to 39%; the exposure sweep shows how much further each zone can go. The chapel and atrium need more than a stop, or B1. Moves the falloff around each fitting above the dither\'s first step instead of below it. Unlit rooms stay black, because exposure multiplies light and zero stays zero.', cost: '0 ms (a uniform)', costKind: 'measured', risk: 'Raises the hatch density everywhere, including the leftover light no lamp controls. Separate the white point from ambient first (conservatory-lights.js:163), or the exposure moves again whenever ambient is retuned.', access: 'Exposure scales the emergency and lightning flashes too: cap flash peaks after exposure, and re-check the concert hall pulse under reduced flash.'},
    {id: 'A3', title: 'Find the leftover light and give it a source', where: 'candidates: haze mix toward a fixed blue-grey (r3d.js:2939–2940), rain air light with a fixed base (r3d.js:2952), emissive fittings and screens in the mesh pass', effect: (stations) => `40–100% of the light at eight stations survives with ambient, bounce, torch and every lamp at zero. Measured and ruled out: the rim pattern, chunk glows and the fixed sky term (0–1% each). In the rig-off frames it looks like a grey veil over every surface plus the emitters. Switch the three candidates off one at a time with the same harness, then make each one follow a source: haze lit by the lamps it sits near, emitters added as local lights so they light their surroundings.`, cost: 'Measurement: none. The change: ≈0 ms for haze and air light; emitters use existing light slots', costKind: 'estimated', risk: 'Rooms that read only through this veil today (the get-in with the torch off) go darker. That may be right for a night interior; the intent decides.', access: 'Haze and rain air light both scale with the optical-effects setting; check that turning effects off still leaves the room readable.'},
    {id: 'A4', title: 'Source: a near key with walls that block it', where: 'r3d.js:5742–5760 (void lights: 260 m radius, 80 m up, penetration 1)', effect: 'Replace the distant fill-lamp with the nearest real emitter (door leak, motorway lamp, room light) at a 10–20 m radius, penetration 0. Expected: key share above 50% in Source views that have a source, real falloff on walls near it.', cost: '0 ms (same light count)', costKind: 'estimated', risk: 'Source navigation relied on even light. Views with no emitter would go dark; give each authored view one.', access: 'None.'},
    {id: 'A5', title: 'Let one light cast prop shadows in Source', where: 'r3d.js:5811 and 5828 force localShadowIndex to −1 in the void; source-landing.js and source-hall.js already author castsShadow', effect: 'Figures, furniture and the door frame throw shadows from the key. Shadow on the far side of objects is what reads as form in the reference photographs.', cost: '1–3 ms (shadow map of the mesh pass)', costKind: 'estimated', risk: 'Shadow-map aliasing will show through the hatch at 512 px maps (render scale below 0.75).', access: 'None.'},
    {id: 'A6', title: 'Source: light the flat fills', where: 'first-lift white sea; last-reception surround', effect: 'These views do not pass through the light model at all (clay changes 1% of first-lift). Route them through it, or give them an authored gradient from the room\'s source. Without this no light change can reach them.', cost: '<0.5 ms', costKind: 'estimated', risk: 'These are deliberate looks; changing them is a design decision, not a fix.', access: 'None.'},
  ],

  groupBIntro: 'New shader or pipeline work, in order of how much they would change the frames per millisecond spent.',
  rendering: [
    {id: 'B1', title: 'A toe in the dither\'s tone curve', where: 'pixel-mesh/shader.js:1121–1123 (black floor, linear exposure, density gamma)', effect: 'Today the dither maps light linearly above a black floor of 0.002–0.008, so the bottom 3 stops of a room land in 0–5% ink. A toe (a lift of the low end that still sends exact zero to zero) spreads those stops over the first few hatch densities. Expected: the 2–4 stops of falloff in the building scene buffers become 3–5 visible tones.', cost: '<0.1 ms (a few operations per pixel in an existing pass)', costKind: 'estimated', risk: 'This changes the look of every scene at once, including Source and the title. Ship it behind the look profile so each profile opts in.', access: 'None; it is a static curve.'},
    {id: 'B2', title: 'Light-loop culling in the mesh pass', where: 'props3d.js:574–600 loops all 12 lights per pixel', effect: 'Lamps cost the mesh pass +7.4 ms in the concert hall, +6 ms in the yard, +11 ms on the drive and +18 ms on the opening drive. Skip lights whose radius does not reach the draw\'s bounds. This is the budget for everything else on this list.', cost: 'Saves 30–60% of that lamp cost', costKind: 'estimated', risk: 'None to the look if the culling is conservative.', access: 'None.'},
    {id: 'B3', title: 'Contact and corner occlusion from the cell grid', where: 'world march; plan texture already bound', effect: 'Darken where floor meets wall and under props, using the grid the march already walks, in place of uniform ambient. Gives the clay frames their missing creases, which is most of what makes a lit room read as built.', cost: '0.3–0.8 ms (grid lookups); screen-space occlusion on the mesh pass would be 1.5–3 ms', costKind: 'estimated', risk: 'Corner darkening reads as a vignette through the hatch if it is too wide. Keep it under half a metre.', access: 'None.'},
    {id: 'B4', title: 'A second prop-shadow caster in the building', where: 'uLocalShadowIndex is a single index; heroShadow in both passes', effect: 'Only one lamp per frame can cast prop shadows. A second caster for the torch or the nearest fitting would let furniture shadow in the rooms where the player stands.', cost: '1.5–3 ms (second shadow map and lookups)', costKind: 'estimated', risk: 'Two overlapping hard shadows look wrong if both lamps are similar strength; pick the second only when it is clearly weaker.', access: 'None.'},
  ],
  considered: 'Considered and not proposed: moving ambient into the lamps (previewed as "Ambient −1 stop, lamps and torch +2 stops" and dropped after review: +1 stop on every light looked better everywhere), automatic exposure (it would lift the darkness the horror depends on; authored exposure per zone does the same job without that risk), a second bounce (the existing bounce term is not what is missing), and per-vertex tricks like Racing Lagoon\'s tessellated road (lighting here is already per pixel, so tessellation would add nothing).',

  budget(stations) {
    const walls = stations.map(s => s.cost.frameWallMs).filter(Number.isFinite);
    return `<p>Set the ceiling by what the slowest common station can afford. On this machine's Intel GPU at 1120 × 700, the building stations finish a frame in 12–31 ms, the yard in 54 ms and the drive in 21–25 ms. Most of the game is already below 60 fps here, so the honest budget is not "16.7 ms minus what we use"; it is <b>no net increase</b>. Any lighting addition must be paid for in the same frame.</p>
<p>Proposed ceiling: <b>the lighting work in a frame may cost at most 2 ms more than today, and only after B2 has recovered at least that much</b>. Group A is free (uniforms and data). B1 fits trivially. B3's grid version fits. A5 and B4 fit only where B2 has paid for them (the drive and the hall recover the most). Screen-space occlusion does not fit.</p>
<p class="muted">On a discrete GPU the numbers will be several times smaller; this ceiling is for the machine the game was profiled on. The timing method has noise: the same configuration measured twice differed by up to 3× in the first round, so only second-round medians are used and differences under 1 ms are not meaningful.</p>`;
  },
  budgetTable(stations) {
    const rows = [
      ['A1, A3, A4, A6', '≈0 ms', 'Yes, everywhere', 'estimated (uniform and data changes)'],
      ['B1 tone toe', '<0.1 ms', 'Yes, everywhere', 'estimated'],
      ['B2 light culling', '−3 to −11 ms where lamps are many', 'Pays for the rest', 'estimated from measured lamp cost'],
      ['B3 grid occlusion', '0.3–0.8 ms', 'Yes, with B2', 'estimated'],
      ['A5 Source prop shadows', '1–3 ms', 'Yes in Source (mesh pass is light there)', 'estimated'],
      ['B4 second shadow caster', '1.5–3 ms', 'Only where B2 recovered ≥3 ms', 'estimated'],
      ['Screen-space occlusion', '1.5–3 ms', 'No', 'estimated'],
    ];
    return `<div class="table-wrap"><table><thead><tr><th>Proposal</th><th>Cost at 1120 × 700</th><th>Fits the 2 ms ceiling</th><th>Basis</th></tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  },

  proofIntro: 'Agree on these before any change is made; then the same harness decides whether it worked. Each check is something neither of us has to judge by eye.',
  checks: [
    {name: 'Ratios', text: 'Rerun the 14 stations and record key to fill and key share as descriptions, not pass/fail: the first review preferred more overall light to more contrast.'},
    {name: 'Visible light', text: 'The primary check: each station meets its intent\'s visible share and darkest-bin targets. Tone count is reported but does not decide; in the first review it favoured the option that looked worse.'},
    {name: 'Clay', text: 'In the clay frames, under 35% of lit surfaces within half a stop of each other (it is a median 56% today), and corners and contact points visibly darker than open wall.'},
    {name: 'Frame time', text: 'Second-round median frame time at every station no more than today\'s + 2 ms on this machine, and the mesh-pass lamp cost down by at least the amount added elsewhere.'},
    {name: 'Tests', text: 'The existing suite passes at the same count as before the change (the suite currently has many failures unrelated to light; record the baseline first). The lighting-rig and local-light-cone specs in particular.'},
    {name: 'Settings', text: 'Reduce flash: emergency and lightning peaks no brighter after the change than before, measured at the concert hall. Reduce motion: unchanged, since nothing here animates.'},
    {name: 'Other eyes', text: 'First review done (2026-11-17, by the game\'s author): +1 stop preferred over the ambient-to-lamps rebalance at every station shown. Next, the paired before/after set (the station frames on this page, retaken after) shown side by side to people who have not seen either, asked only which reads the room better and which is scarier. Run it on the darkest three stations as well as the brightest.'},
  ],

  order: [
    '<b>Record the test baseline.</b> The full suite has many failing files today (100+ in the last run, mostly Source and exterior). Without a baseline, "existing tests pass" cannot be checked.',
    '<b>A3: name the leftover light.</b> Switch the three candidates off one at a time at the get-in and chapel with this harness (an hour\'s work). Every later step depends on knowing what the 40–80% is.',
    '<b>A1, exposure, in one zone.</b> Separate the white point from ambient, then raise exposure at the get-in or the practice corridor by the step the sweep and your eye pick. Rerun the station against the visible-share target. This costs nothing.',
    '<b>B1, the tone toe, behind one look profile.</b> For the chapel and atrium, where a stop of exposure is not enough. Compare the same station with and without it, by eye first.',
    '<b>B2, light culling in the mesh pass.</b> This buys the budget for everything after it. Measure it at the opening drive and the concert hall.',
    '<b>A4–A6 in Source</b>, one view at a time, starting with hall entry: it already has a key and responds most to more light (16% → 39% visible at +1 stop).',
    '<b>B3 grid occlusion</b>, then <b>A5/B4 shadows</b> only where B2 has paid for them.',
    '<b>The paired set to other people</b> after the first zone, not at the end, so the intent can still change.',
  ],

  honesty: [
    {title: 'Measured', items: [
      'Every station frame, clay frame and per-light frame, from the running dev build on this machine.',
      'Light shares, key-to-fill ratios, clay flatness, scene range, visible share and tones after dither: computed from those captures.',
      'The same screen metrics on the eight photographs.',
      'Frame time to finish and per-pass GPU time with lights on, local lights off and all lights off (second-round medians; Source one shorter round).',
      'The two live previews (exposure and ambient-to-lamps), and the exposure sweep from +½ to +2 stops.',
      'One review of the previews by the game\'s author: +1 stop preferred everywhere.',
      'How much of each frame the rim pattern, chunk glows and fixed sky term provide (switched off one at a time): 0–1% each.',
    ]},
    {title: 'Estimated', items: [
      'The cost of every proposal not previewed (A3–A6, B1–B4): from the shape of the shader work, not from running it.',
      'The savings from light culling: from the measured lamp cost, not from an implementation.',
      'How A1 will look once the white point is decoupled from ambient; the previews held it fixed.',
      'What the leftover light is. Haze, rain air light and emitters are candidates from reading the shader and looking at the rig-off frames; none was measured on its own.',
      'That a toe curve gives 3–5 more tones: from where the scene\'s falloff sits relative to the black floor.',
    ]},
    {title: 'Not covered', items: [
      'macOS and Windows, and the Tauri webview (this was headless Chrome on the same GPU; WebKitGTK may differ).',
      'Discrete GPUs: the frame-time ceiling is for this Intel GPU only.',
      'Stations outside these fourteen, weather, and lightning.',
      'Whether the darker, more directional result is scarier: only other people can answer that.',
    ]},
  ],
};
