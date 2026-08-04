// Fixed objects in the conservatory. Coordinates are authored metres, not
// runtime cells. A prop's sound belongs to the object, never to whichever zone
// or corridor happens to contain it.

const P = (id, mesh, x, y, yaw = 0, extra = {}) => ({ id, mesh, x, y, yaw, scale:1, ...extra });
const inspect = (first, again) => ({ first, again });
const play = (family, first, again) => ({ interaction:'play', sampleFamily:family, inspect:inspect(first,again) });
const provenance = (cohort, assetTag, state, extra = {}) => ({ cohort, assetTag, state, ...extra });

// Procurement is authored as institutional history, not as unrelated
// collectibles. Exact dates stop at the established 1908 chapel commission;
// later cohorts remain relative so the building never invents a contractor or
// a location that the narrative deliberately withholds.
export const PROCUREMENT_COHORTS = Object.freeze({
  practice_room_contract:Object.freeze({kind:'contract',era:'later service life',markPrefix:'P/CH',summary:'Eight matching chairs bought for the double-loaded practice suite.'}),
  foyer_suite:Object.freeze({kind:'contract',era:'formal public-room refit',markPrefix:'FOH/F',summary:'A sofa, two armchairs and two console tables supplied as one waiting-room suite.'}),
  curatorial_accessions:Object.freeze({kind:'accession',era:'accumulated collection',markPrefix:'ACC',summary:'Individually catalogued objects displayed in the public rooms and corridors.'}),
  hall_lighting_refit:Object.freeze({kind:'contract',era:'major hall refit',markPrefix:'H/L',summary:'A matched pair of chandeliers above the stalls.'}),
  hall_lounge_replacement:Object.freeze({kind:'contract',era:'later public-room refit',markPrefix:'H/S',summary:'Two replacement Chesterfields at the rear cross aisle.'}),
  chapel_foundation_1908:Object.freeze({kind:'commission',era:'1908',markPrefix:'EC/C',summary:'Purpose-made chapel fixtures, score cabinets and the presider chair.'}),
  services_rewire:Object.freeze({kind:'contract',era:'late services refit',markPrefix:'S/P',summary:'Matching distribution panels installed across three service zones.'}),
  maintenance_purchase:Object.freeze({kind:'contract',era:'final maintenance period',markPrefix:'M/L',summary:'A paired purchase of portable inspection lamps.'}),
});

// Authored player stems (public/audio/marimba/player, public/audio/violin/player),
// resolved from the '<instr>_player' worldId to preloaded buffers (see PROP_STEMS
// / propChunk in main.js). They replace the old website-playground chunks so the
// marimba and strings you hold-to-play — and the HUSH plays back — are the
// authored takes, same path the piano took.
const MARIMBA = [
  {worldId:'marimba_player',fileLabel:'01'},
];
// Authored player-piano stems (public/audio/piano/player). These replace the old
// main_b3 website-playground chunks; the runtime resolves the 'piano_player'
// worldId to preloaded buffers (see propChunk in main.js), so both the player's
// audition and the HUSH playing the piano back at you sound the authored takes.
const PIANO = [
  {worldId:'piano_player',fileLabel:'01'},
  {worldId:'piano_player',fileLabel:'02'},
  {worldId:'piano_player',fileLabel:'03'},
  {worldId:'piano_player',fileLabel:'04'},
  {worldId:'piano_player',fileLabel:'05'},
];
const STRINGS = [
  {worldId:'violin_player',fileLabel:'01'},
  {worldId:'violin_player',fileLabel:'02'},
];
const PERCUSSION = [
  {worldId:'amplifications',fileLabel:'amp-008'},
  {worldId:'amplifications',fileLabel:'amp-024'},
  {worldId:'amplifications',fileLabel:'amp-040'},
];
const CHAPEL = [
  {worldId:'lux_nova',fileLabel:'lux-001'},
  {worldId:'lux_nova',fileLabel:'lux-017'},
  {worldId:'lux_nova',fileLabel:'lux-033'},
  {worldId:'lux_nova',fileLabel:'lux-049'},
];

// Short mechanical sounds already shipped with the game, assigned to dock
// objects as fixed source families. They are intentionally mundane: a case
// latch, a reel ratchet, and a shutter bar. Once the player has made one, the
// existing prop memory lets the HUSH reproduce that exact family later.
const DOCK_CASE = [{worldId:'dock_case',fileLabel:'01'}];
const DOCK_REEL = [{worldId:'dock_reel',fileLabel:'01'}];
const DOCK_SHUTTER = [{worldId:'dock_shutter',fileLabel:'01'}];

export const PROP_MESH = Object.freeze({
  school_desk:{w:.72,d:.78,blocks:true}, pew:{w:2.8,d:.72,blocks:true},
  chair:{w:.52,d:.56,blocks:false}, music_stand:{w:.45,d:.45,blocks:false},
  instrument_case:{w:1.25,d:.5,blocks:false}, equipment_cart:{w:1.2,d:.72,blocks:true},
  piano_bench:{w:.78,d:.36,blocks:false}, open_score:{w:.62,d:.36,blocks:false},
  loose_pages:{w:.78,d:.62,blocks:false}, metronome:{w:.22,d:.18,blocks:false},
  wastebasket:{w:.34,d:.34,blocks:false}, soft_bag:{w:.68,d:.32,blocks:false},
  draped_coat:{w:.62,d:.5,blocks:false}, mallet_pair:{w:.58,d:.12,blocks:false},
  cable_coil:{w:.58,d:.58,blocks:false}, open_instrument_case:{w:1.35,d:.72,blocks:false},
  upright_piano:{w:1.55,d:.72,blocks:true}, grand_piano:{w:1.75,d:2.45,blocks:true},
  marimba:{w:2.8,d:1.05,blocks:true}, timpani:{w:.92,d:.92,blocks:true},
  cello:{w:.46,d:.32,blocks:false}, speaker_cabinet:{w:.64,d:.58,blocks:true},
  organ_console:{w:1.65,d:.88,blocks:true}, organ_pipes:{w:2.2,d:.36,blocks:true},
  equipment_rack:{w:.72,d:.7,blocks:true},
  // The violin lies on its back with the scroll along +z, so its footprint is
  // narrow and long rather than the old placeholder square.
  violin:{w:.24,d:.64,blocks:false},
  portrait_frame:{w:.76,d:.12,blocks:false},
  hall_seating:{w:25.6,d:18.6,blocks:false},
  hall_structure:{w:29,d:37,blocks:false},
  chapel_vault:{w:12.5,d:34.5,blocks:false},
  ticket_counter:{w:2.8,d:.75,blocks:true}, key_cabinet:{w:.9,d:.24,blocks:true},
  box_office_desk:{w:1.15,d:.62,blocks:true}, program_stack:{w:.42,d:.32,blocks:false},
  cash_terminal:{w:.36,d:.28,blocks:false}, queue_stanchion:{w:.32,d:.32,blocks:false},
  notice_board:{w:1.2,d:.12,blocks:false}, pool_start_block:{w:.62,d:.72,blocks:true},
  pool_lane_markings:{w:10.2,d:15.5,blocks:false},
  natatorium_roof_structure:{w:23.2,d:20.5,blocks:false},
  natatorium_perimeter_relief:{w:25.2,d:22.2,blocks:false},
  natatorium_cubicle_bank:{w:14.7,d:.35,blocks:false},
  natatorium_end_window:{w:10.5,d:.24,blocks:false}, natatorium_clock:{w:1.1,d:.12,blocks:false},
  changing_bench:{w:2.2,d:.48,blocks:true}, pool_lane_ropes:{w:8.0,d:15.2,blocks:false},
  pool_backstroke_flags:{w:12.2,d:.08,blocks:false}, pool_ladder:{w:.85,d:.95,blocks:false},
  pool_lifebuoy:{w:1.0,d:.14,blocks:false},
  loose_note:{w:.32,d:.42,blocks:false},
  tuning_fork:{w:.22,d:.82,blocks:false},
  calibration_pin:{w:.12,d:.12,blocks:false},
  lifeguard_chair:{w:.78,d:.78,blocks:true}, lane_reel:{w:1.05,d:.62,blocks:true},
  drain_grille:{w:1.2,d:.18,blocks:false}, altar_table:{w:1.8,d:.78,blocks:true},
  lectern:{w:.62,d:.62,blocks:true}, hymn_board:{w:.8,d:.12,blocks:false},
  plant_pipe_straight:{w:2.4,d:.16,blocks:false}, plant_pipe_bank:{w:2.8,d:.34,blocks:false},
  plant_pipe_elbow:{w:.92,d:.92,blocks:false}, plant_pipe_valve:{w:.62,d:.32,blocks:false},
  tower_frame:{w:9,d:4.6,blocks:false}, tower_rope:{w:.18,d:.18,blocks:false},
  tower_clock_hammer:{w:.9,d:.5,blocks:false}, tower_winch:{w:1.2,d:.8,blocks:false},
  tower_shutters:{w:3.4,d:.2,blocks:false}, chapel_inner_screen:{w:6,d:.2,blocks:false},
  tower_plaque:{w:1.35,d:.12,h:.76,blocks:false,mount:'wall'}, tower_rope_mat:{w:1.05,d:1.05,blocks:false},
  tower_catwalk:{w:11.8,d:8.2,blocks:false}, tower_louvres:{w:6,d:.25,blocks:false},
  tower_peal_board:{w:1.8,d:.12,blocks:false}, tower_organ_case:{w:5.8,d:1.2,blocks:true},
  tower_loft_rail:{w:10,d:.16,blocks:false}, tower_bulkhead:{w:.3,d:.26,h:.30,blocks:false,mount:'wall'},
  tower_stair_rail_low_up:{w:9,d:4,blocks:false}, tower_stair_rail_high_up:{w:10,d:4,blocks:false},
  tower_stair_rail_high_down:{w:10,d:4,blocks:false}, tower_stair_rail_low_down:{w:9,d:4,blocks:false},
  upper_stair_dressing:{w:3,d:11.5,blocks:false}, basement_stair_dressing:{w:3,d:10.5,blocks:false},
  academic_stair_dressing:{w:3,d:10.5,blocks:false},
  stair_smoke_door_open:{w:3.1,d:2.1,blocks:false},
  stair_smoke_door_closed:{w:3.1,d:.2,blocks:false},
  stair_sconce_pair_opal:{w:3,d:.55,blocks:false}, stair_bulkhead_pair:{w:3,d:.5,blocks:false},
  stair_pendant_opal:{w:.6,d:.6,h:1.4,blocks:false,mount:'ceiling'}, stair_shadow_figure:{w:.65,d:.3,blocks:false},
  player_shadow_figure:{w:.62,d:.28,h:1.78,blocks:false,mount:'floor'},
  legacy_tape_rack:{w:1.08,d:.42,h:2.08,blocks:true,mount:'floor'},
  legacy_patchbay:{w:1.28,d:.36,h:1.74,blocks:true,mount:'floor'},
  legacy_transfer_deck:{w:1.48,d:.78,h:1.24,blocks:true,mount:'floor'},
  academic_atrium_structure:{w:24,d:27,blocks:false}, front_atrium_perimeter_relief:{w:22.2,d:23.2,blocks:false},
  academic_skylight:{w:23,d:26,blocks:false},
  academic_frieze:{w:5.2,d:.12,blocks:false}, academic_bust_plinth:{w:.62,d:.62,blocks:false},
  academic_bust_fragment:{w:.72,d:.58,blocks:false}, academic_planter:{w:4,d:2,blocks:true},
  academic_dead_tree:{w:2.8,d:1.2,blocks:false}, academic_dry_basin:{w:2.7,d:2.7,blocks:true},
  academic_leaf_litter:{w:3,d:1.8,blocks:false}, academic_blackboard:{w:2.6,d:.12,blocks:false},
  academic_filing_bank:{w:2.1,d:.5,blocks:true}, academic_breach:{w:3,d:1.1,blocks:false},
  green_chair_01:{w:.673,d:.665,h:1.059,blocks:false,mount:'floor'},
  arm_chair_01:{w:.850,d:.765,h:1.065,blocks:false,mount:'floor'},
  sofa_01:{w:1.573,d:.659,h:.797,blocks:true,mount:'floor'},
  classic_console_01:{w:1.539,d:.590,h:.949,blocks:true,mount:'floor'},
  marble_bust_01:{w:.272,d:.300,h:.515,blocks:false,mount:'surface'},
  horse_head:{w:.215,d:.334,h:.419,blocks:false,mount:'surface'},
  chandelier_03:{w:.781,d:.785,h:1.041,blocks:false,mount:'ceiling'},
  sofa_02:{w:1.806,d:.817,h:.709,blocks:true,mount:'floor'},
  lantern_chandelier_01:{w:.579,d:.575,h:.878,blocks:false,mount:'ceiling'},
  gothic_cabinet_01:{w:1.719,d:1.117,h:2.361,blocks:true,mount:'floor'},
  wooden_chair_01:{w:.688,d:.658,h:2.274,blocks:false,mount:'floor'},
  power_box_01:{w:.665,d:.418,h:.822,blocks:false,mount:'wall'},
  portable_searchlight:{w:.165,d:.253,h:.185,blocks:false,mount:'floor'},
});

// Visible structure has matching height-aware collision. Coordinates are
// authored logical metres; elevation is absolute world height.
export const STRUCTURAL_COLLIDERS = Object.freeze([
  {id:'hall-proscenium-left',kind:'obb',x:102.7,y:12.2,width:3.2,depth:.9,yaw:0,minElevation:-2.5,maxElevation:9,spaceId:'hall'},
  {id:'hall-proscenium-right',kind:'obb',x:123.3,y:12.2,width:3.2,depth:.9,yaw:0,minElevation:-2.5,maxElevation:9,spaceId:'hall'},
  {id:'hall-lower-left-rail',kind:'obb',x:4.7,y:61,width:.18,depth:27,yaw:0,minElevation:4,maxElevation:5.3,spaceId:'hall'},
  {id:'hall-lower-right-rail',kind:'obb',x:25.3,y:61,width:.18,depth:27,yaw:0,minElevation:4,maxElevation:5.3,spaceId:'hall'},
  {id:'hall-upper-left-rail',kind:'obb',x:4.7,y:103,width:.18,depth:27,yaw:0,minElevation:7.5,maxElevation:8.8,spaceId:'hall'},
  {id:'hall-upper-right-rail',kind:'obb',x:25.3,y:103,width:.18,depth:27,yaw:0,minElevation:7.5,maxElevation:8.8,spaceId:'hall'},
  {id:'chapel-chancel-rail-left',kind:'obb',x:89.5,y:88,width:3.2,depth:.16,yaw:0,minElevation:5.1,maxElevation:6.2,spaceId:'chapel'},
  {id:'chapel-chancel-rail-right',kind:'obb',x:95.5,y:88,width:3.2,depth:.16,yaw:0,minElevation:5.1,maxElevation:6.2,spaceId:'chapel'},
  ...[57.9,59.9,61.9,63.9].flatMap((x,i)=>[
    {id:`tower-frame-post-n-${i+1}`,kind:'obb',x,y:155.9,width:.28,depth:.28,yaw:0,minElevation:13.2,maxElevation:16.4,spaceId:'bell_chamber'},
    {id:`tower-frame-post-s-${i+1}`,kind:'obb',x,y:160.1,width:.28,depth:.28,yaw:0,minElevation:13.2,maxElevation:16.4,spaceId:'bell_chamber'},
  ]),
  ...[56.9,65].flatMap((x,side)=>[
    {id:`tower-frame-${side?'east':'west'}-tie-n`,kind:'obb',x,y:156.6,width:.22,depth:1.7,yaw:0,minElevation:13.2,maxElevation:15.9,spaceId:'bell_chamber'},
    {id:`tower-frame-${side?'east':'west'}-tie-s`,kind:'obb',x,y:159.4,width:.22,depth:1.7,yaw:0,minElevation:13.2,maxElevation:15.9,spaceId:'bell_chamber'},
  ]),
  {id:'tower-loft-rail',kind:'obb',x:94,y:156.7,width:10,depth:.16,yaw:0,minElevation:8.6,maxElevation:9.75,spaceId:'organ_loft'},
]);

export const CONSERVATORY_PROPS = [
  // ── Loading dock: LAST LOAD-OUT ──────────────────────────────────────────
  // The room has a three-metre freight spine at x64–66. Everything lives at
  // the perimeter so the setup is dense without becoming a prop maze.
  P('dock-level-check-box','tower_rope_mat',65.0,10.0,0,{interactive:false,blocks:false,scale:1.45,elevation:.018}),
  P('dock-desk-1','school_desk',60.0,6.0,.15,{
    label:'signing desk',inspectAt:{x:59.6,y:7.0},dockInvestigation:true,
    inspect:inspect('A school desk doing the job of a dispatch station. Somebody meant to come back to it.','The little desk is still waiting for the rest of its shift.'),
  }),
  P('dock-work-order-clipboard','loose_note',60.2,6.05,.12,{
    label:'unfinished clipboard',elevation:.83,blocks:false,inspectAt:{x:60.55,y:7.0},dockInvestigation:true,
    inspect:inspect('Your job is clipped over somebody else’s unfinished leaving.','The last line is still waiting to be crossed out.'),
  }),
  P('dock-crew-board','notice_board',58.15,8.0,Math.PI/2,{
    label:'erased route board',elevation:1.15,blocks:false,inspectAt:{x:59.1,y:8.0},dockInvestigation:true,
    inspect:inspect('The route remains. The names beside it have been rubbed away.','Three places and nobody assigned to walk between them.'),
  }),
  P('acq-maintenance-searchlight-dock','portable_searchlight',61.0,6.0,.35,{
    label:'dead portable searchlight',
    scale:1.8,dockInvestigation:true,
    provenance:provenance('maintenance_purchase','M/L-02','loading-dock unit; battery removed'),
    inspect:inspect('A work lamp with its back open and its battery gone. An honestly dead thing.','Click. Nothing. Good.'),
    aftermathInspect:{
      first:'The work lamp is still dead. It is the only light in the room that behaved.',
      again:'Click. Nothing. Somehow that is comforting now.',
    },
  }),
  P('dock-hand-truck','equipment_cart',72.6,5.35,Math.PI/2,{
    label:'strapped hand truck',scale:.72,inspectAt:{x:71.7,y:5.5},dockInvestigation:true,
    inspect:inspect('A hand truck tied up neatly before it ever carried the load.','FRAME FIRST, still chalked across its foot.'),
  }),
  P('dock-freight-crates','equipment_rack',72.1,7.45,0,{
    label:'empty freight crates',scale:1.15,inspectAt:{x:71.0,y:7.5},dockInvestigation:true,
    inspect:inspect('Three empty crates. Everything in the room had somewhere to go except the chandelier.','The empty boxes still smell of rain and hot dust.'),
  }),
  P('dock-freight-crate-low','instrument_case',71.5,8.55,Math.PI/2,{interactive:false,blocks:false,scale:1.15}),
  P('dock-road-case','instrument_case',60.1,12.45,Math.PI/2,{
    label:'previous recordist’s case',dockInvestigation:true,
    ...play(DOCK_CASE,'An open road case with a recorder-shaped absence inside it.','Four tally marks under the handle. Space for one more.'),
    acousticKind:'handling_noise',hushPlayback:{mode:'interval',minMs:5200,maxMs:7600},
    aftermathInspect:{
      unheard:{first:'The case is not quite where you remember it. You never touched it, so memory gets the last word.',again:'A small distance. A large uncertainty.'},
      heard:{first:'The case stayed here. Its little metal cough came from across the room.',again:'One sound. Two places. Keep them separate.'},
    },
  }),
  P('dock-cable-reel','lane_reel',71.8,10.7,0,{
    label:'empty cable reel',scale:.82,blocks:true,dockInvestigation:true,
    ...play(DOCK_REEL,'An empty reel, wound clean and left with nothing to carry.','The handle rests one tooth past certainty.'),
    acousticKind:'mechanical_click',hushPlayback:{mode:'interval',minMs:5600,maxMs:8200},
    aftermathInspect:{
      unheard:{first:'The handle seems to have moved. You never marked it, so “seems” is all you own.',again:'One tooth past certainty.'},
      heard:{first:'The handle did not turn. The click still came from behind the desk.',again:'You know what you heard. You do not know what heard you.'},
    },
  }),
  P('dock-shutter-bar','plant_pipe_straight',72.4,12.45,0,{
    label:'singing shutter bar',scale:.88,blocks:false,inspectAt:{x:71.4,y:12.45},dockInvestigation:true,
    ...play(DOCK_SHUTTER,'A steel bar carrying the whole shutter’s held breath.','Put a hand on it and the room goes quiet.'),
    acousticKind:'structure_impact',hushPlayback:{mode:'interval',minMs:6100,maxMs:9000},
    aftermathInspect:{
      unheard:{first:'The bar hums under your hand. You never knocked it before.',again:'The shutter is still. Something in it is not.'},
      heard:{first:'Your knock returned from above the chandelier, where there is no steel to carry it.',again:'The room knew the sound well enough to put it somewhere else.'},
    },
  }),
  P('dock-chandelier-frame','tower_frame',69.0,6.25,0,{
    label:'caged chandelier',scale:.34,blocks:false,inspectAt:{x:67.45,y:7.1},dockInvestigation:true,
    inspect:inspect('A chandelier locked inside a wheeled cage. Its wire ends in open air.','Too carefully held for rubbish. Too dead to be a lamp.'),
    aftermathInspect:{
      first:'Black bulbs. Bright glass. Every wheel still locked.',
      again:'The cage never moved. The thing inside it changed anyway.',
    },
  }),
  P('dock-chandelier-intact','chandelier_03',69.0,6.25,0,{label:'chandelier lamps',interactive:false,blocks:false,scale:1.48,elevation:1.05}),
  P('dock-chandelier-spent','chandelier_03',69.05,6.3,.48,{label:'ruptured chandelier lamps',interactive:false,blocks:false,scale:1.18,scaleY:.48,elevation:.48}),
  P('dock-chandelier-tag','loose_note',67.85,6.55,-.2,{interactive:false,blocks:false,scale:.8,elevation:1.0}),

  // Loading dock / foyer: work furniture, not a showroom.
  P('foyer-pew-1','pew',82.0,7.0,Math.PI/2,{inspect:inspect('One chapel pew never made it upstairs. A paper removal tag is still tied to it.','The tag says RETURN TO CHAPEL.')}),
  P('foyer-cart-1','equipment_cart',91.5,14.0,0,{inspect:inspect('A percussion cart with one wheel wired straight.','It will only travel in a circle.')}),
  P('foyer-portrait-titian','portrait_frame',80.5,4.0,0,{elevation:1.35,portraitIndex:0,inspect:inspect('Titian. Portrait of a Man. A Met Open Access reproduction in an inexpensive gilt frame.','The sitter keeps looking past the entrance.')}),
  P('foyer-portrait-greco','portrait_frame',84.0,4.0,0,{elevation:1.35,portraitIndex:1,inspect:inspect('El Greco. Portrait of an Old Man. Someone has polished the glass more often than the frame.','His eyes catch the corridor light first.')}),
  P('atrium-sign-main-exit','tower_plaque',77.5,4.0,0,{
    elevation:.7,renderOffsetZ:-.25,
    inspect:inspect('PUBLIC EXIT. The glazed entrance pair opens outward to the loading court.','PUBLIC EXIT.'),
  }),
  P('atrium-light-main-exit','tower_bulkhead',77.5,4.0,0,{
    elevation:1.62,renderOffsetZ:-.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.64,.34],
  }),
  P('box-office-counter','ticket_counter',90.55,18.85,Math.PI/2,{scale:.75,inspect:inspect('The ticket counter was built to keep a queue outside and cash inside. The grille is still locked down.','Nothing has been sold here for years.')}),
  P('box-office-desk','box_office_desk',94.05,19.1,0,{inspect:inspect('The staff desk is squared to the ticket window. A blotter has been pressed flat by damp.','Front of house, stopped mid-week.')}),
  P('box-office-chair','chair',93.25,19.15,Math.PI/2,{inspect:inspect('A staff chair tucked under the ticket desk, not abandoned in the queue path.','Its casters have made a small grey ring.')}),
  P('box-office-program-stack','program_stack',91.05,18.15,Math.PI/2,{elevation:1.05,inspect:inspect('A stack of folded programmes for a season that never opened.','The top programme has curled at both corners.')}),
  P('box-office-cash-terminal','cash_terminal',90.95,19.45,Math.PI/2,{elevation:1.05,inspect:inspect('A dead card terminal beside a cash drawer. The receipt paper is still threaded.','No signal. No float.')}),
  P('box-office-ledger','notice_board',94.8,18.05,Math.PI,{elevation:1.1,interaction:'action',action:'rekey-ledger',inspect:inspect('A rekey ledger: REPLACEMENT LOCK CORE — CHAPEL — CABINET C-17.','CHAPEL. REPLACEMENT LOCK CORE. C-17.')}),
  P('box-office-key-cabinet','key_cabinet',96.25,21.55,Math.PI/2,{elevation:1.0,blocks:false,interaction:'action',action:'chapel-key-cabinet',inspect:inspect('A shallow steel cabinet of tagged keys.','One hook is empty.')}),
  P('box-office-shelf','equipment_rack',95.25,21.75,0,{scale:.82,inspect:inspect('Programmes, float envelopes, and ticket stock boxed by week.','The labels are more orderly than the room.')}),
  P('box-office-notice-board','notice_board',96.2,19.0,Math.PI/2,{elevation:1.15,inspect:inspect('A notice board with staffing rotas, emergency contacts, and one hand-written refund policy.','The refund policy is underlined twice.')}),
  ...[[87.15,17.35],[87.15,19.05],[88.25,17.35],[88.25,19.05]].map(([x,y],i)=>
    P(`box-office-queue-${i+1}`,'queue_stanchion',x,y,0,{inspect:inspect('A brass queue post with its rope still clipped in.','The rope sags towards the ticket window.')})),

  // The formal waiting-room order survives as a coherent set. Its stamped
  // numbers make the purchase legible even where the upholstery was repaired
  // at different times.
  P('acq-foyer-sofa-01','sofa_01',75.5,19.0,-Math.PI/2,{
    scale:1.55,
    provenance:provenance('foyer_suite','FOH/F-01','reupholstered once'),
    inspectAt:{x:76.1,y:19.0},
    inspect:inspect('A pale foyer sofa from the formal front-of-house suite. FOH/F-01 is stamped beneath the centre rail; one cushion was rebuilt in a slightly firmer foam.','FOH/F-01. The replacement cushion still sits higher than the others.'),
  }),
  P('acq-foyer-armchair-01','arm_chair_01',75.5,17.7,-Math.PI/2,{
    provenance:provenance('foyer_suite','FOH/F-02','original upholstery, repaired arm'),
    inspect:inspect('The first armchair of the foyer suite. FOH/F-02 remains on the rear rail, beside a hand-stitched repair where the public-facing arm wore through.','FOH/F-02. The repaired arm has gone smooth again.'),
  }),
  P('acq-foyer-armchair-02','arm_chair_01',75.5,20.3,-Math.PI/2,{
    provenance:provenance('foyer_suite','FOH/F-03','replacement castor blocks'),
    inspect:inspect('The matching armchair, FOH/F-03. Two dark blocks under the front feet are later than the chair and exactly the right height.','FOH/F-03. A matched chair on unmatched blocks.'),
  }),
  // ── the ground-floor dead end ───────────────────────────────────────────────
  // The service spine runs east past the natatorium and dock spurs and simply
  // stops, sharing a half-metre wall with the atrium. That wall is why the room
  // is identifiable: the atrium's own perimeter relief bleeds through it, so the
  // dead end has pilasters and a picture rail it was never given.
  //
  // So it is furnished as what it plainly became — the overflow of the public
  // waiting room on the other side of that wall. Same cohort, same stamps: the
  // suite that would not fit out front, pushed round the back and left. The
  // painting hangs on the rail that is already there, which is the one thing
  // this room has that no other dead end does.
  //
  // Ids are `deadend-` and not `corridor-`/`ground-spine-`: tools/.../props.mjs
  // fails any decorative prop whose id marks it as circulation, and it is right
  // to — a stair approach with furniture in it is a hazard, not a room.
  P('deadend-ground-armchair','arm_chair_01',72.4,22.4,Math.PI/2,{
    provenance:provenance('foyer_suite','FOH/F-06','withdrawn from the front room'),
    inspect:inspect('An armchair from the front-of-house suite, FOH/F-06, faced into the corner. The stamp matches the two still out in the atrium through this wall.','FOH/F-06. It has been sat in since it was put here.'),
  }),
  P('deadend-ground-chair','wooden_chair_01',72.4,24.6,Math.PI/2,{
    provenance:provenance('foyer_suite','FOH/F-07','odd chair, never matched'),
    inspect:inspect('A tall-backed chair that belongs to no set. It is older than the suite and half a head higher, and somebody put it here facing the same way as the armchair, as though the two of them were waiting together.','FOH/F-07. Two chairs, one conversation, nobody in either.'),
  }),
  P('deadend-ground-credenza','classic_console_01',73.6,23.5,-Math.PI/2,{
    provenance:provenance('foyer_suite','FOH/F-08','east table, drawer swollen'),
    inspectAt:{x:72.8,y:23.5},
    inspect:inspect('The last console of the suite, FOH/F-08, pushed against the atrium wall. The drawer is swollen shut and has been forced before — the lip is bright where somebody worked at it.','FOH/F-08. The drawer is open now.'),
  }),
  // Hung on the picture rail the atrium relief puts through this wall, which is
  // the only reason a painting can touch a wall in a service corridor and look
  // like it was always meant to. props.mjs checks a solid cell sits behind every
  // portrait_frame: at authored x74.0 the wall is runtime x149.
  P('deadend-ground-painting','portrait_frame',74.0,23.5,-Math.PI/2,{
    elevation:1.55,scale:2.2,portraitIndex:1,renderOffsetX:.25,
    inspect:inspect('A large canvas, hung high on a picture rail that has no business being in a service corridor. It is the atrium\'s rail — the panelling comes through the wall here, half a metre of plaster between this room and the public one. The painting has been given the better half.','Too big for the room and hung too high, on somebody else\'s rail.'),
  }),
  P('deadend-ground-chandelier','chandelier_03',73.0,23.5,0,{
    scale:1.6,elevation:3.35,
    lightColor:[.78,.74,.62],lightCircuit:'sp03',
    inspectAt:{x:73.0,y:24.6},
    inspect:inspect('A chandelier, in a corridor, over two chairs and a table. Nothing about this room was planned; all of it was moved here. Somebody went to the trouble of wiring it.','It is still on the front-of-house circuit.'),
  }),
  P('acq-foyer-console-01','classic_console_01',88.5,4.25,Math.PI,{
    provenance:provenance('foyer_suite','FOH/F-04','west table, water-marked'),
    inspectAt:{x:87.75,y:5.15},
    inspect:inspect('The west console of the foyer suite, FOH/F-04. A long pale tide mark follows the wall side; the inventory stamp is dry beneath it.','FOH/F-04. Water above, old ink below.'),
  }),
  P('acq-foyer-console-02','classic_console_01',93.5,4.25,Math.PI,{
    provenance:provenance('foyer_suite','FOH/F-05','east table, refinished top'),
    inspectAt:{x:92.75,y:5.15},
    inspect:inspect('The matching east console, FOH/F-05. Its top was refinished without touching the carved apron, leaving two different ages of varnish.','FOH/F-05. The new varnish ends at the carving.'),
  }),
  P('acq-foyer-horse-head','horse_head',88.82,4.32,Math.PI,{
    elevation:.955,
    provenance:provenance('curatorial_accessions','ACC-41','bronze study; catalogue history incomplete'),
    inspectAt:{x:89.25,y:5.15},
    inspect:inspect('A small bronze horse study, accession ACC-41. The older paper label names no maker and records only that it arrived before the card catalogue.','ACC-41. An object with a number and no useful beginning.'),
  }),
  P('acq-foyer-marble-bust','marble_bust_01',93.82,4.32,Math.PI,{
    elevation:.955,
    provenance:provenance('curatorial_accessions','ACC-73','marble bust; base re-pinned'),
    inspectAt:{x:94.25,y:5.15},
    inspect:inspect('A marble bust, accession ACC-73. A clean steel pin through the old base says more about its history here than the blank sitter line.','ACC-73. The sitter is still blank; the repair is fully documented.'),
  }),

  // The old front atrium is now a ruined interior garden. All pieces are
  // deliberately mute: they block, shade and silhouette like ordinary fabric
  // of the building, but expose no action, sample, inscription or collectible.
  P('academic-atrium-structure','academic_atrium_structure',27,254,0,{
    renderOffsetX:8,renderOffsetZ:1,renderGroups:['ground','academic'],interactive:false,structural:true,
  }),
  P('academic-skylight','academic_skylight',27,254,0,{
    renderOffsetX:8,renderOffsetZ:1,renderGroups:['ground','academic'],interactive:false,structural:true,
  }),
  P('atrium-perimeter-relief','front_atrium_perimeter_relief',85.5,15,0,{
    renderGroups:['ground','academic'],interactive:false,structural:true,
  }),
  // The one piece of the ruined garden you may put a hand in. Everything else
  // here is deliberately mute; this planter is where a calibration pin has been
  // sitting in the soil since somebody serviced a head out here (see PIN_HOSTS).
  P('academic-garden-planter-west','academic_planter',80.5,11.0,.08,{renderGroups:['ground','academic'],
    inspect:inspect('Dry soil in a stone planter, packed hard and full of old leaf. Something brass is half down in it.','The soil keeps the shape your hand left in it.')}),
  P('academic-garden-planter-east','academic_planter',86.7,17.6,-.08,{renderGroups:['ground','academic'],interactive:false}),
  P('academic-garden-basin','academic_dry_basin',83.6,14.6,0,{renderGroups:['ground','academic'],interactive:false}),
  P('academic-garden-tree-west','academic_dead_tree',80.4,11.0,-.18,{renderGroups:['ground','academic'],interactive:false,elevation:.66}),
  P('academic-garden-tree-east','academic_dead_tree',86.8,17.6,.28,{renderGroups:['ground','academic'],interactive:false,elevation:.66,scale:.82}),
  P('academic-garden-leaves-north','academic_leaf_litter',83.0,9.0,.22,{renderGroups:['ground','academic'],interactive:false}),
  P('academic-garden-leaves-south','academic_leaf_litter',84.8,19.1,-.18,{renderGroups:['ground','academic'],interactive:false}),
  P('academic-light-emergency-west','tower_bulkhead',28.5,248.0,Math.PI/2,{
    elevation:1.62,renderOffsetX:.25,renderGroups:['ground','academic'],interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.62,.32],
  }),
  P('academic-light-emergency-east-failing','tower_bulkhead',46.5,263.0,Math.PI/2,{
    elevation:1.62,renderOffsetX:.25,renderGroups:['ground','academic'],interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.57,.28],
  }),

  // Six anonymous bust stations establish the gallery cadence. Four retain a
  // generic head; two have collapsed into unidentifiable fragments. Still no
  // plaques and no accession marks — nobody wrote down who these were.
  //
  // The four intact heads are the ONE thing on this floor you may address, and
  // what you get is your own voice (see BUST_TALK). They expose no sample, no
  // collectible and no inscription: talking to them changes nothing except what
  // you have said out loud, which is the point of them.
  ...[[27,250,0],[27,254,.18],[27,258,-.12],[41,250,Math.PI],[41,254,Math.PI+.15],[41,258,Math.PI-.12]].flatMap(([x,y,yaw],i)=>{
    const common={renderGroups:['ground','academic'],interactive:false};
    // All six stations are addressable, the two broken ones included — talking to
    // a head that is not there any more is worse than talking to one that is.
    return i===2||i===5
      ?[P(`academic-bust-plinth-${i+1}`,'academic_bust_plinth',x,y,yaw,common),
        P(`academic-bust-fragment-${i+1}`,'academic_bust_fragment',x+.18,y+.22,yaw+.45,{renderGroups:['ground','academic'],talkable:true,elevation:1.08})]
      :[P(`academic-bust-plinth-${i+1}`,'academic_bust_plinth',x,y,yaw,common),
        P(`academic-bust-${i+1}`,'marble_bust_01',x,y,yaw,{renderGroups:['ground','academic'],talkable:true,elevation:1.10,scale:i===4?.88:1})];
  }),
  ...[248,253,258,263].flatMap((y,i)=>[
    P(`academic-frieze-west-${i+1}`,'academic_frieze',24.2,y,Math.PI/2,{renderGroups:['ground','academic'],interactive:false,elevation:3.05}),
    P(`academic-frieze-east-${i+1}`,'academic_frieze',45.8,y,-Math.PI/2,{renderGroups:['ground','academic'],interactive:false,elevation:3.05}),
  ]),
  ...[30,35,40].flatMap((x,i)=>[
    P(`academic-frieze-north-${i+1}`,'academic_frieze',x,243.0,0,{renderGroups:['ground','academic'],interactive:false,elevation:3.05}),
    P(`academic-frieze-south-${i+1}`,'academic_frieze',x,267.0,Math.PI,{renderGroups:['ground','academic'],interactive:false,elevation:3.05}),
  ]),

  // Eight classrooms are visually distinct only through mundane arrangements:
  // desk orientation, an inactive piano or a cabinet. Nothing here can be
  // auditioned, read, acquired or promoted into a work-order target.
  ...[
    [1,241,0],[14,241,Math.PI],[1,248,0],[14,248,Math.PI],
    [1,255,0],[14,255,Math.PI],[1,262,0],[14,262,Math.PI],
  ].flatMap(([x0,y0,yaw],room)=>{
    const east=x0>10;
    const desks=[0,1,2].flatMap((row)=>[0,1].map((col)=>P(`academic-class-${room+1}-desk-${row*2+col+1}`,'school_desk',x0+2.2+col*2.1,y0+1.7+row*1.35,yaw,{interactive:false})));
    const fixtures=[
      P(`academic-class-${room+1}-board`,'academic_blackboard',east?20.7:1.3,y0+2.7,east?-Math.PI/2:Math.PI/2,{interactive:false,elevation:1.0}),
      P(`academic-class-${room+1}-teacher-table`,'school_desk',x0+(east?4.8:6.1),y0+4.0,yaw,{interactive:false,scale:1.15}),
    ];
    if(room%2===0)fixtures.push(P(`academic-class-${room+1}-piano`,'upright_piano',x0+(east?5.7:1.2),y0+4.0,yaw,{interactive:false}));
    else fixtures.push(P(`academic-class-${room+1}-cabinet`,'academic_filing_bank',x0+(east?5.8:1.2),y0+4.0,yaw,{interactive:false}));
    return[...desks,...fixtures];
  }),
  P('academic-reception-files','academic_filing_bank',12.0,273.0,Math.PI/2,{interactive:false}),
  P('academic-stripped-office-desk','school_desk',16.0,273.0,Math.PI/2,{interactive:false,scale:1.2}),
  P('academic-stripped-office-cabinet','academic_filing_bank',18.2,276.0,0,{interactive:false}),
  P('academic-breach','academic_breach',17.5,267.7,0,{interactive:false,structural:true}),

  // Studio B3: equipment, teaching overflow, and stacked desks against walls.
  P('b3-desk-1','school_desk',8.0,8.0,Math.PI/2,{inspect:inspect('A desk pushed into the dead corner, its writing surface stippled with old tape marks.','Nothing is written on it now.')}),
  P('b3-desk-2','school_desk',8.0,9.0,Math.PI/2,{inspect:inspect('Another desk nested behind the first. Surplus becomes acoustic treatment if nobody moves it.','Two desks, making one bad absorber.')}),
  P('b3-rack-1','equipment_rack',23.0,16.5,Math.PI/2,{inspect:inspect('The rack is powered down. Three channels are still labelled in pencil.','No mains. No pilot lights.')}),
  P('b3-speaker-1','speaker_cabinet',22.7,8.0,Math.PI/2,{...play(PIANO,'A nearfield monitor with its cone pushed in and pulled back out.','The cone remembers a thumb.')}),

  // Concert hall and its overflow. The grand is not an upright substitute.
  P('hall-structure','hall_structure',113.0,23.0,0,{interactive:false,structural:true}),
  // The mesh is authored front-low at -Z and back-high at +Z. The stage is
  // north (-Z), so yaw zero is the only transform that puts the low stalls at
  // the apron and lets the bowl rise toward the rear cross aisle.
  P('hall-seating','hall_seating',113.0,23.0,0,{interactive:false,structural:true,elevation:-2.5,collisionMask:'hall-seating'}),
  P('hall-grand-1','grand_piano',113.0,8.0,Math.PI,{...play(PIANO,'A grand piano under a black cover, except the keyboard is exposed.','The keys are colder than the room.')}),
  P('hall-marimba-1','marimba',103.0,9.0,Math.PI/2,{...play(MARIMBA,'The concert marimba, brakes on, one resonator tube dented flat.','The dent has a pitch of its own.')}),
  P('hall-marimba-overflow','marimba',125.0,12.0,0,{...play(MARIMBA,'A second marimba parked where the hall narrows. It did not fit wherever it was meant to go.','It is still in everybody’s way.')}),
  P('hall-timpani-1','timpani',121.0,8.0,0,{...play(PERCUSSION,'A timpano with the pedal tied down for transport.','The head gives under one finger.')}),
  P('hall-timpani-2','timpani',122.2,9.0,0,{...play(PERCUSSION,'The larger drum. Dust has settled evenly except where a mallet once lay.','The clean line is mallet-shaped.')}),
  P('hall-portrait-bronzino','portrait_frame',99.0,5.0,0,{elevation:1.45,portraitIndex:2,inspect:inspect('A Bronzino study, silverpoint and chalk. It looks unfinished because it is.','The paper is paler than the wall.')}),
  P('hall-portrait-florentine','portrait_frame',104.0,5.0,0,{elevation:1.45,portraitIndex:3,inspect:inspect('Portrait of a Woman, Florentine, mid-sixteenth century. The brass plate gives no donor.','No donor, only accession numbers.')}),
  P('acq-hall-chandelier-west','chandelier_03',108.5,23.0,0,{
    scale:3,elevation:7.4,
    provenance:provenance('hall_lighting_refit','H/L-01','west fitting; lower chain replaced'),
    inspectAt:{x:108.5,y:24.2},
    inspect:inspect('The west hall chandelier, H/L-01, dark with the rest of the building. Its bottom chain links are newer than the matched fitting across the stalls.','H/L-01. New chain, old fitting, no supply.'),
  }),
  P('acq-hall-chandelier-east','chandelier_03',117.5,23.0,0,{
    scale:3,elevation:7.4,
    provenance:provenance('hall_lighting_refit','H/L-02','east fitting; untouched suspension'),
    inspectAt:{x:117.5,y:24.2},
    inspect:inspect('The matching east chandelier, H/L-02. Dust keeps the original suspension legible all the way to the ceiling rose.','H/L-02. The pair was maintained separately and bought together.'),
  }),
  P('acq-hall-chesterfield-west','sofa_02',104.0,37.0,0,{
    scale:1.35,
    provenance:provenance('hall_lounge_replacement','H/S-01','west rear-cross-aisle sofa'),
    inspect:inspect('A black Chesterfield at the rear cross aisle, H/S-01. Its machine-stamped plate is much later than the hand-marked foyer furniture.','H/S-01. Newer stock, already worn at the aisle end.'),
  }),
  P('acq-hall-chesterfield-east','sofa_02',122.0,37.0,0,{
    scale:1.35,
    provenance:provenance('hall_lounge_replacement','H/S-02','east rear-cross-aisle sofa'),
    inspect:inspect('The matching rear-aisle sofa, H/S-02. A square of unfaded leather marks where an information folder sat for years.','H/S-02. The missing folder left its own label.'),
  }),
  ...[0,1,2,3,4,5].flatMap((i)=>[
    P(`hall-chair-l-${i}`,'chair',107.0+i*1.2,10.0,0,{inspect:inspect('A stacking chair, set out and never stacked.','Still facing the stage.')}),
    P(`hall-stand-${i}`,'music_stand',107.0+i*1.2,11.0,0,{inspect:inspect('A music stand at sitting height.','No part on it.')}),
  ]),

  // Stair flights, landings, and their approach corridors intentionally stay
  // bare. The architecture and torch define the route; rails, paintings,
  // furniture, frames, and hanging fixtures made the safe throat ambiguous.

  // Practice suite. Every threshold remains visibly wedged open, but each room
  // now records a different interruption. The wall-backed uprights are the
  // repeated institutional datum; everything in front of them has drifted with
  // use. Small paper and clothing props are visual evidence, never collision.
  ...[
    {x:52.30,y:58.25,yaw:1.51,history:'exam-preparation',first:'Open scales and a marked examination piece cover the upright. The metronome stopped one click before the bar line.',again:'The examination piece is still open at the bad bar.'},
    {x:74.65,y:60.35,yaw:-1.47,history:'cello-lesson',first:'An upright turned slightly towards two offset chairs. The lesson stopped before anybody put the cello away.',again:'The piano is still angled towards the absent student.'},
    {x:52.35,y:67.20,yaw:1.62,history:'piano-maintenance',first:'The fallboard is off and the action has been interrupted halfway out. A service lead trails under the bench.',again:'The action remains halfway out.'},
    {x:74.55,y:65.45,yaw:-1.55,history:'coat-and-bag-drop',first:'A plain teaching piano with somebody’s coat and bag occupying the useful half of the room.',again:'The coat and bag make the room feel briefly claimed.'},
    {x:52.28,y:72.35,yaw:1.45,history:'chamber-spillover',first:'The upright has been pulled into a small rehearsal arc. Three parts disagree about where the first repeat begins.',again:'The rehearsal arc still points at the piano.'},
    {x:74.62,y:74.00,yaw:-1.64,history:'copied-parts',first:'Copied parts have spread from the upright to the stand, chair, floor, and wastebasket.',again:'Every copy has a different pencil correction.'},
    {x:52.22,y:81.45,yaw:1.69,history:'hurried-departure',first:'The upright is square to the wall. Everything else is skewed towards the door, as if the room left in a hurry.',again:'Only the piano kept its place.'},
  ].map((entry,i)=>P(`practice-piano-${i+1}`,'upright_piano',entry.x,entry.y,entry.yaw,{
    roomHistory:entry.history,...play(PIANO,entry.first,entry.again),
  })),
  ...[
    {x:55.05,y:60.45,yaw:-1.36,history:'exam-preparation'},
    {x:71.75,y:58.10,yaw:1.42,history:'cello-lesson'},
    {x:55.25,y:64.65,yaw:-1.92,history:'piano-maintenance'},
    {x:71.40,y:67.45,yaw:1.28,history:'coat-and-bag-drop'},
    {x:55.15,y:74.55,yaw:-1.24,history:'chamber-spillover'},
    {x:71.85,y:72.15,yaw:1.77,history:'copied-parts'},
    {x:55.35,y:79.00,yaw:-1.08,history:'hurried-departure'},
    {x:69.25,y:80.85,yaw:.84,history:'ensemble-rehearsal'},
  ].map((entry,i)=>P(`practice-stand-${i+1}`,'music_stand',entry.x,entry.y,entry.yaw,{
    roomHistory:entry.history,interactive:false,blocks:false,
  })),
  ...[
    {x:56.05,y:61.00,yaw:-1.34,state:'pencil room number beneath the seat',history:'exam-preparation'},
    {x:70.45,y:60.65,yaw:1.84,state:'new rubber foot on the piano-side leg',history:'cello-lesson'},
    {x:56.05,y:68.15,yaw:-1.72,state:'back rail polished by a coat hook',history:'piano-maintenance'},
    {x:70.85,y:66.20,yaw:1.24,state:'two upholstery tacks replaced',history:'coat-and-bag-drop'},
    {x:56.10,y:72.85,yaw:-1.11,state:'old rosin ground into the front edge',history:'chamber-spillover'},
    {x:70.55,y:74.65,yaw:1.88,state:'seat foam compressed towards the piano',history:'copied-parts'},
    {x:55.85,y:81.15,yaw:-.88,state:'varnish worn where a case struck it',history:'hurried-departure'},
    {x:69.25,y:82.05,yaw:1.16,state:'violin resting across the seat',history:'ensemble-rehearsal',inspectAt:{x:68.25,y:82.05}},
  ].map((entry,i)=>{
    const assetTag=`P/CH-${String(i+1).padStart(2,'0')}`;
    return P(`acq-practice-chair-${i+1}`,'green_chair_01',entry.x,entry.y,entry.yaw,{
      roomHistory:entry.history,
      provenance:provenance('practice_room_contract',assetTag,entry.state),
      ...(entry.inspectAt?{inspectAt:entry.inspectAt}:{}),
      inspect:inspect(`A green practice-room chair from the eight-chair order. ${assetTag} is stamped underneath; ${entry.state}.`,`${assetTag}. One of eight, altered by this room.`),
    });
  }),
  // Exam preparation.
  P('practice-bench-exam','piano_bench',53.55,58.35,1.43,{interactive:false,blocks:false,roomHistory:'exam-preparation'}),
  P('practice-score-exam','open_score',52.80,58.15,1.51,{interactive:false,blocks:false,elevation:.94,roomHistory:'exam-preparation'}),
  P('practice-metronome-exam','metronome',52.30,59.85,1.51,{interactive:false,blocks:false,elevation:.94,roomHistory:'exam-preparation'}),
  P('practice-pages-exam','loose_pages',54.45,61.15,-.16,{interactive:false,blocks:false,elevation:.012,roomHistory:'exam-preparation'}),

  // Cello lesson, stopped mid-correction.
  P('practice-bench-cello','piano_bench',73.45,60.30,-1.55,{interactive:false,blocks:false,roomHistory:'cello-lesson'}),
  P('practice-lesson-cello','cello',72.55,61.55,-.32,{roomHistory:'cello-lesson',...play(STRINGS,'The student cello is still extended on its endpin between two chairs.','The endpin has marked the floor twice.')}),
  P('practice-case-cello','open_instrument_case',69.25,57.65,.12,{interactive:false,blocks:false,roomHistory:'cello-lesson'}),
  P('practice-score-cello','open_score',71.78,58.08,1.42,{interactive:false,blocks:false,elevation:1.20,roomHistory:'cello-lesson'}),

  // Piano maintenance interrupted with the action exposed.
  P('practice-bench-maintenance','piano_bench',54.10,67.55,1.08,{interactive:false,blocks:false,roomHistory:'piano-maintenance'}),
  P('practice-cable-maintenance','cable_coil',54.65,65.85,.36,{interactive:false,blocks:false,roomHistory:'piano-maintenance'}),
  P('practice-pages-maintenance','loose_pages',55.15,67.25,.28,{interactive:false,blocks:false,elevation:.015,roomHistory:'piano-maintenance'}),
  P('practice-waste-maintenance','wastebasket',53.25,68.55,.12,{interactive:false,blocks:false,roomHistory:'piano-maintenance'}),

  // Coat and bag drop.
  P('practice-bench-coat','piano_bench',73.35,65.55,-1.47,{interactive:false,blocks:false,roomHistory:'coat-and-bag-drop'}),
  P('practice-coat-drop','draped_coat',70.83,66.20,1.24,{interactive:false,blocks:false,elevation:.43,roomHistory:'coat-and-bag-drop'}),
  P('practice-bag-drop','soft_bag',69.55,68.20,-.22,{interactive:false,blocks:false,roomHistory:'coat-and-bag-drop'}),

  // Chamber rehearsal spillover.
  P('practice-bench-chamber','piano_bench',53.62,72.55,1.32,{interactive:false,blocks:false,roomHistory:'chamber-spillover'}),
  P('practice-chair-chamber-a','chair',54.62,75.20,-.72,{interactive:false,blocks:false,roomHistory:'chamber-spillover'}),
  P('practice-chair-chamber-b','chair',56.35,74.10,-1.94,{interactive:false,blocks:false,roomHistory:'chamber-spillover'}),
  P('practice-score-chamber','open_score',55.15,74.55,-1.24,{interactive:false,blocks:false,elevation:1.20,roomHistory:'chamber-spillover'}),
  P('practice-pages-chamber','loose_pages',53.85,75.45,.19,{interactive:false,blocks:false,elevation:.014,roomHistory:'chamber-spillover'}),

  // Copied parts and paper-heavy teaching.
  P('practice-bench-parts','piano_bench',73.38,73.85,-1.72,{interactive:false,blocks:false,roomHistory:'copied-parts'}),
  P('practice-score-parts','open_score',71.85,72.15,1.77,{interactive:false,blocks:false,elevation:1.20,roomHistory:'copied-parts'}),
  P('practice-pages-parts-a','loose_pages',69.40,75.45,-.35,{interactive:false,blocks:false,elevation:.012,roomHistory:'copied-parts'}),
  P('practice-pages-parts-b','loose_pages',72.65,75.55,.28,{interactive:false,blocks:false,elevation:.014,roomHistory:'copied-parts'}),
  P('practice-waste-parts','wastebasket',73.75,75.70,.18,{interactive:false,blocks:false,roomHistory:'copied-parts'}),

  // Hurried departure.
  P('practice-bench-departure','piano_bench',53.78,81.22,1.12,{interactive:false,blocks:false,roomHistory:'hurried-departure'}),
  P('practice-open-case-departure','open_instrument_case',54.35,82.15,-.34,{interactive:false,blocks:false,roomHistory:'hurried-departure'}),
  P('practice-bag-departure','soft_bag',56.55,82.55,.74,{interactive:false,blocks:false,roomHistory:'hurried-departure'}),
  P('practice-pages-departure','loose_pages',54.30,79.20,.61,{interactive:false,blocks:false,elevation:.012,roomHistory:'hurried-departure'}),

  // Ensemble room: a rehearsal abandoned mid-use. Blocking mass stays on the
  // far side so the door-to-instrument route and a full loop around the group
  // remain readable.
  P('practice-ensemble-marimba','marimba',71.65,79.15,.04,{roomHistory:'ensemble-rehearsal',...play(MARIMBA,'A rehearsal marimba with four bars pencilled and both mallets abandoned across the naturals.','Four bars, two mallets, no player.')}),
  P('practice-ensemble-mallets','mallet_pair',71.65,79.12,.18,{interactive:false,blocks:false,elevation:1.15,roomHistory:'ensemble-rehearsal'}),
  P('practice-ensemble-cello','cello',74.15,81.70,-1.18,{roomHistory:'ensemble-rehearsal',...play(STRINGS,'A cello left extended beside its open case.','The bow is still on the chair.')}),
  P('practice-ensemble-violin','violin',69.25,82.05,1.16,{
    elevation:.48,inspectAt:{x:68.25,y:82.05},roomHistory:'ensemble-rehearsal',
    ...play(STRINGS,'A violin left on a chair, chin rest to the door.','Someone put it down mid-phrase.'),
  }),
  P('practice-case-1','open_instrument_case',68.05,82.25,-.10,{interactive:false,blocks:false,roomHistory:'ensemble-rehearsal'}),
  P('practice-case-2','instrument_case',72.25,82.65,.07,{interactive:false,blocks:false,roomHistory:'ensemble-rehearsal'}),
  P('practice-ensemble-chair-a','chair',68.55,79.10,.62,{interactive:false,blocks:false,roomHistory:'ensemble-rehearsal'}),
  P('practice-ensemble-chair-b','chair',73.65,78.25,-.42,{interactive:false,blocks:false,roomHistory:'ensemble-rehearsal'}),
  P('practice-ensemble-score-a','open_score',69.25,80.85,.84,{interactive:false,blocks:false,elevation:1.20,roomHistory:'ensemble-rehearsal'}),
  P('practice-ensemble-pages','loose_pages',74.00,79.65,-.12,{interactive:false,blocks:false,elevation:.012,roomHistory:'ensemble-rehearsal'}),
  P('practice-desk-stack-1','school_desk',53.0,54.2,0,{inspect:inspect('A teaching desk waiting at the stair landing for somebody to claim it.','Still waiting, safely out of the route.')}),
  P('practice-desk-stack-2','school_desk',54.0,54.2,0,{inspect:inspect('The matching desk has been pushed alongside it, drawers to the wall.','Two desks parked for collection.')}),

  // Chapel: two banks leave a central aisle and side circulation clear.
  ...[62.0,65.0,68.0,71.0,74.0,77.0,80.0,83.0,86.0].flatMap((y,i)=>[
    P(`chapel-pew-l-${i}`,'pew',89.0,y,0,{inspect:inspect('A short pew, polished at the aisle end by hands.','The aisle end is darker.')}),
    P(`chapel-pew-r-${i}`,'pew',96.0,y,0,{inspect:inspect('A matching pew, one kneeler missing.','The empty brackets remain.')}),
  ]),
  P('chapel-organ-console','organ_console',92.5,90.0,Math.PI,{...play(CHAPEL,'The chapel console. Every stop is in and the blower supply is isolated.','No wind. No power.')}),
  P('chapel-organ-pipes','organ_pipes',92.5,91.5,0,{...play(CHAPEL,'A rank of display pipes. The sounding pipes are somewhere behind the wall.','These may never have sounded.')}),
  ...[0,1,2,3].map((i)=>P(`chapel-speaker-${i}`,'speaker_cabinet',97.0,60.0+i*.95,Math.PI/2,{...play(CHAPEL,'A flown-system cabinet brought down onto the floor.','Four cabinets, no amplifier.')})),
  P('chapel-rack-1','equipment_rack',97.0,66.0,Math.PI/2,{inspect:inspect('An electronics rack with the patch leads removed but every label left behind.','The labels name feeds that are not here.')}),
  P('chapel-altar','altar_table',92.5,88.8,0,{inspect:inspect('A plain altar table. The linen was removed; four pale rectangles show where its feet stood before it was shifted.','Shifted, not deconsecrated.')}),
  P('chapel-lectern','lectern',88.2,88.5,.15,{inspect:inspect('A lectern with the service book removed and the ribbon left behind.','The ribbon marks nothing.')}),
  P('chapel-hymn-board','hymn_board',97.4,87.8,0,{elevation:1.4,inspect:inspect('The hymn board still reads 17 · 44 · 91. Nobody cleared the last service.','17 · 44 · 91.')}),
  P('chapel-portrait-pollaiuolo','portrait_frame',88.0,59.0,0,{elevation:1.55,portraitIndex:4,inspect:inspect('Piero del Pollaiuolo. Portrait of a Woman. Profile, tempera, gold held quietly at the edge.','Her profile is exact and unreachable.')}),
  P('chapel-portrait-netherlandish','portrait_frame',96.0,59.0,0,{elevation:1.55,portraitIndex:5,inspect:inspect('Portrait of a Woman, Netherlandish or French. The old label cannot decide.','The frame can decide nothing either.')}),
  P('acq-chapel-lantern-narthex-north','lantern_chandelier_01',92.5,61.0,0,{
    scale:1.15,elevation:3.15,
    provenance:provenance('chapel_foundation_1908','EC/C-01','north narthex lantern; glass replaced in one face'),
    inspectAt:{x:92.5,y:60.25},
    inspect:inspect('The first chapel lantern, EC/C-01, hangs dark. One pane is flatter and clearer than the rest, but the 1908 frame has never left its hook.','EC/C-01. One new pane in an old, unpowered fitting.'),
  }),
  P('acq-chapel-lantern-narthex-south','lantern_chandelier_01',92.5,65.0,0,{
    scale:1.15,elevation:3.15,
    provenance:provenance('chapel_foundation_1908','EC/C-02','south narthex lantern; original glazing'),
    inspectAt:{x:92.5,y:64.3},
    inspect:inspect('The second lantern, EC/C-02. Its original rippled glass makes the torch break into narrow, unmoving lines.','EC/C-02. Original glass, dead cable.'),
  }),
  P('acq-chapel-lantern-nave','lantern_chandelier_01',92.5,72.5,0,{
    scale:1.15,elevation:3.4,
    provenance:provenance('chapel_foundation_1908','EC/C-03','nave lantern; lowered during ceiling works'),
    inspectAt:{x:92.5,y:71.7},
    inspect:inspect('The third lantern, EC/C-03, was lowered by two chain links when the ceiling above the back pews was altered. The old links remain wired to the rose.','EC/C-03. The alteration was retained instead of concealed.'),
  }),
  P('acq-chapel-presider-chair','wooden_chair_01',97.0,90.0,-Math.PI/2,{
    provenance:provenance('chapel_foundation_1908','EC/C-06','singular commissioned presider chair'),
    inspect:inspect('The presider chair, EC/C-06: the one deliberate singleton in the 1908 chapel order. Wear reaches the finials but not the high centre panel.','EC/C-06. Commissioned as one, recorded as one.'),
  }),
  P('chapel-vault','chapel_vault',92.5,75.5,0,{interactive:false,structural:true}),
  P('chapel-inner-screen','chapel_inner_screen',92.5,67.5,0,{interactive:false,structural:true}),
  P('tower-history-plaque','tower_plaque',87.0,62.0,-Math.PI/2,{
    elevation:1.0,renderOffsetX:-.25,
    inspect:inspect('J. VALE & SONS — CAST FOR ELLERY COLLEGIATE CHAPEL — 1908. Eight bells. Tenor: 2,200 kg.','Ellery Collegiate Chapel. 1908. No county is given.'),
  }),

  // The ringing chamber contains people and ropes, never bell machinery. Pitch
  // order proceeds clockwise from the treble at the north of the circle.
  ...Array.from({length:8},(_,i)=>{
    const a=-Math.PI/2+i*Math.PI/4,x=25+Math.cos(a)*4,y=158+Math.sin(a)*4;
    return[
      P(`tower-rope-${i+1}`,'tower_rope',x,y,a+Math.PI/2,{inspect:inspect('A full-circle rope, tied off above the sally. The bell above is down.','Still tied. Still down.')}),
      P(`tower-rope-mat-${i+1}`,'tower_rope_mat',x,y,a,{interactive:false,structural:true}),
    ];
  }).flat(),
  P('tower-ringing-bench-west','pew',18.2,162.5,Math.PI/2,{scale:.72,inspect:inspect('A ringing bench polished by coats and waiting hands.','Eight places. No ringers.')}),
  P('tower-ringing-bench-east','pew',31.5,162.5,Math.PI/2,{scale:.72,inspect:inspect('The second bench leaves the rope circle entirely clear.','Nothing is stored inside the circle.')}),
  P('tower-peal-board','tower_peal_board',18.0,151.1,0,{elevation:1.25,inspect:inspect('ELLERY COLLEGIATE CHAPEL — STEDMAN TRIPLES — 1908. A touch, not a peal.','The gilt names have gone brown.')}),
  P('tower-tenor-clock-hammer','tower_clock_hammer',31.0,153.0,0,{elevation:.4,...play(CHAPEL,'The clock hammer lifts and strikes the tenor while the bell is down. The stone keeps it for nine seconds.','One stationary hammer. One bell down.'),acousticKind:'bell_tenor_toll',hushPlayback:{mode:'interval',minMs:4200,maxMs:6800}}),
  P('tower-hammer-isolator','equipment_rack',18.0,153.0,0,{interaction:'action',action:'tower-hammer-isolator',inspect:inspect('CLOCK HAMMER ISOLATOR. A red lever, mechanically linked.','ISOLATE / SERVICE.')}),
  P('tower-sign-ringing','tower_plaque',32.5,158.5,Math.PI/2,{
    elevation:1.05,renderOffsetX:.25,
    inspect:inspect('RINGING ROOM. The enamel letters are older than the electrical conduit.','RINGING ROOM.'),
  }),
  P('tower-light-lower','tower_bulkhead',1.0,151.0,0,{
    elevation:1.67,renderOffsetZ:-.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.68,.38],
  }),
  P('tower-light-upper','tower_bulkhead',43.0,155.0,Math.PI,{
    elevation:1.67,renderOffsetZ:.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.70,.42],
  }),
  // This is the only pendant in the tower rig. Its origin is the ceiling rose;
  // the generated mesh extends downward to the light at y - 1.25.
  P('tower-light-ringing','stair_pendant_opal',25.0,158.0,0,{
    elevation:4.2,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.72,.46],
  }),

  // Above: a low two-row H frame and perimeter catwalk in a monumental English
  // belfry. The temporary French recording affects audio only, never form.
  P('tower-bell-frame','tower_frame',61.0,158.0,0,{interactive:false,structural:true}),
  P('tower-catwalk','tower_catwalk',61.0,158.0,0,{interactive:false,structural:true}),
  P('tower-louvres-east','tower_louvres',68.3,158.0,Math.PI/2,{interactive:false,structural:true,elevation:2.5}),
  P('tower-sign-belfry','tower_plaque',68.5,157.5,Math.PI/2,{
    elevation:1.1,renderOffsetX:.25,
    inspect:inspect('BELLS — AUTHORISED ACCESS. The final word has been underlined by hand.','BELLS — AUTHORISED ACCESS.'),
  }),
  P('tower-light-entry','tower_bulkhead',68.5,157.5,Math.PI/2,{
    elevation:2.27,renderOffsetX:.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[.92,.80,.61],
  }),
  P('tower-shutters','tower_shutters',68.0,158.0,Math.PI/2,{interactive:false,structural:true,elevation:.1}),
  P('tower-shutter-winch','tower_winch',68.0,163.0,0,{interaction:'action',action:'tower-shutter-winch',inspect:inspect('The shutter winch is taking the whole frame through its pawl.','Under load.')}),
  P('tower-light-winch','tower_bulkhead',68.5,162.5,Math.PI/2,{
    elevation:1.87,renderOffsetX:.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.74,.43],
  }),

  P('tower-organ-case','tower_organ_case',94.0,152.0,0,{interactive:false,structural:true}),
  P('tower-organ-console','organ_console',94.0,154.5,Math.PI,{...play(CHAPEL,'The loft console faces east over the nave. The blower remains isolated.','No wind. The descent door is beside it.')}),
  P('acq-chapel-score-cabinet-west','gothic_cabinet_01',89.5,153.5,Math.PI/2,{
    provenance:provenance('chapel_foundation_1908','EC/C-04','west score cabinet; replacement lock'),
    inspectAt:{x:90.35,y:154.15},
    inspect:inspect('The west score cabinet, EC/C-04. Its replacement lock is square and recent against the 1908 ironwork; the key number is C-17.','EC/C-04. New lock, old cabinet, C-17.'),
  }),
  P('acq-chapel-score-cabinet-east','gothic_cabinet_01',98.5,153.5,-Math.PI/2,{
    provenance:provenance('chapel_foundation_1908','EC/C-05','east score cabinet; original lock seized'),
    inspectAt:{x:97.65,y:154.15},
    inspect:inspect('The matching east score cabinet, EC/C-05. Its original lock has seized open, exposing pencilled shelf letters and no scores.','EC/C-05. The older lock failed in the safer direction.'),
  }),
  P('tower-loft-rail','tower_loft_rail',94.0,156.7,0,{interactive:false,structural:true}),
  P('tower-sign-organ-exit','tower_plaque',104.5,151.0,0,{
    elevation:.7,renderOffsetZ:-.25,
    inspect:inspect('ORGAN LOFT / NAVE. An arrow follows the service stair down.','ORGAN LOFT / NAVE.'),
  }),
  P('tower-light-service','tower_bulkhead',79.0,152.0,Math.PI,{
    elevation:1.67,renderOffsetZ:.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.69,.40],
  }),
  P('tower-light-organ-exit','tower_bulkhead',104.5,151.0,0,{
    elevation:1.47,renderOffsetZ:-.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.72,.42],
  }),
  P('tower-sign-nave-exit','tower_plaque',105.5,154.0,0,{
    elevation:.7,renderOffsetZ:-.25,
    inspect:inspect('NAVE / CHAPEL EXIT. The route continues through the narthex to the public doors.','NAVE / CHAPEL EXIT.'),
  }),
  P('tower-light-nave-exit','tower_bulkhead',105.5,154.0,0,{
    elevation:1.47,renderOffsetZ:-.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.73,.42],
  }),

  // ── Natatorium: an Edwardian municipal bath under a later steel refit ───
  // The roof, cubicles and end-window dressing all sit on the ONE authored
  // room envelope. Nothing below the roof spans the hall, and both cubicle
  // banks are shallow wall furniture, so this cannot regress into the former
  // room-inside-a-room failure.
  P('natatorium-roof-structure','natatorium_roof_structure',83.0,38.5,0,{interactive:false,structural:true}),
  P('natatorium-perimeter-relief','natatorium_perimeter_relief',83.0,38.5,0,{interactive:false,structural:true}),
  P('natatorium-cubicles-west','natatorium_cubicle_bank',71.4,40.5,-Math.PI/2,{interactive:false,structural:true}),
  P('natatorium-cubicles-east','natatorium_cubicle_bank',94.6,40.5,Math.PI/2,{interactive:false,structural:true}),
  P('natatorium-end-window','natatorium_end_window',84.0,49.25,0,{interactive:false,structural:true,elevation:.55}),
  P('natatorium-clock','natatorium_clock',92.0,49.25,0,{
    elevation:5.25,inspectAt:{x:92,y:48.2},
    inspect:inspect('The pool clock stopped at twenty-seven past. Chlorine has greened the screws but not moved the hands.','Still twenty-seven past.'),
  }),

  P('pool-lane-markings','pool_lane_markings',84,40.5,0,{interactive:false,structural:true,elevation:.05}),
  P('pool-lane-ropes','pool_lane_ropes',84,40.5,0,{interactive:false,structural:true,elevation:.015}),
  P('pool-flags-near','pool_backstroke_flags',84,36.0,0,{interactive:false,structural:true}),
  P('pool-flags-far','pool_backstroke_flags',84,45.5,0,{interactive:false,structural:true}),
  P('pool-ladder-west','pool_ladder',77.7,40.0,-Math.PI/2,{interactive:false,structural:true}),
  P('pool-ladder-east','pool_ladder',90.3,44.0,Math.PI/2,{interactive:false,structural:true}),
  P('pool-lifebuoy-west','pool_lifebuoy',71.4,42.0,-Math.PI/2,{
    elevation:1.55,inspectAt:{x:72.3,y:42.0},
    inspect:inspect('A cork lifebuoy repainted until its name has disappeared. The rope is stiff with old pool water.','Layers of municipal red. No readable name.'),
  }),
  P('pool-bench-1','changing_bench',73.3,36.0,Math.PI/2,{inspect:inspect('A slatted changing bench, grey from chlorine.','The grain has lifted around every brass screw.')}),
  P('pool-bench-2','changing_bench',73.3,44.0,Math.PI/2,{inspect:inspect('A second bench set below the cubicles, close enough for bare feet and folded towels.','No towel ever dried here.')}),
  P('pool-cart-1','equipment_cart',94.0,47.0,Math.PI/2,{
    action:'take-pool-cells',interaction:'action',interactionPriority:1,
    inspect:inspect('A pool-maintenance cart parked by the service corner, not beside the basin. A sealed battery sleeve is clipped under the handle.','The warning labels have run; the empty sleeve remains under the handle.'),
  }),
  P('acq-maintenance-searchlight-pool','portable_searchlight',94.0,46.55,-Math.PI/2,{
    scale:1.5,elevation:.68,
    provenance:provenance('maintenance_purchase','M/L-01','natatorium unit; lens clamp replaced'),
    inspectAt:{x:93.25,y:46.85},
    inspect:inspect('The pool cart carries M/L-01, one of two portable inspection lamps. Its replacement lens clamp is bright, but the disconnected lead ends at the cart.','M/L-01. A repaired lamp with nowhere to draw power.'),
  }),
  P('pool-lifeguard-chair','lifeguard_chair',92.5,40.5,-Math.PI/2,{inspect:inspect('A lifeguard chair on the east deck, facing across the pool.','The rescue tube is gone.')}),
  P('pool-lane-reel','lane_reel',92.7,34.2,0,{inspect:inspect('A lane-line reel staged beside the starting end, one cracked float still wound onto it.','The handle turns half a revolution.')}),
  ...[79.2,81.6,84.0,86.4,88.8].map((x,i)=>P(`pool-start-${i+1}`,'pool_start_block',x,32.4,Math.PI,{inspect:inspect('A starting block, its number plate removed.','Four bolt heads and a paler rectangle.')})),
  ...[80.4,82.8,85.2,87.6].map((x,i)=>P(`pool-drain-${i+1}`,'drain_grille',x,46.0,0,{elevation:.06,inspect:inspect('A basin drain furred white with old pool salts.','The salts trace every slot.')})),
  P('acq-services-panel-pool','power_box_01',95.5,44.8,Math.PI/2,{
    scaleX:1.76,scaleY:1.63,elevation:1.45,renderOffsetX:.25,
    provenance:provenance('services_rewire','S/P-02','natatorium panel; chlorine bloom under the lip'),
    inspectAt:{x:94.7,y:44.8},
    interaction:'action',action:'power-panel-sp02',interactionPriority:2,
    inspect:inspect('The natatorium distribution panel, S/P-02, matches the plant-room and front-of-house boxes. Chlorine has lifted the paint beneath its lower lip; every breaker is open.','S/P-02. Same installation, different air, no live circuit.'),
  }),
  // The foyer threshold is self-evident and intentionally unplaque'd. A tower
  // plaque used to be mounted on the door plane here, which made the tower
  // object visibly clip through the natatorium leaf.
  P('natatorium-light-emergency-entry','tower_bulkhead',84.5,27.5,Math.PI/2,{
    elevation:1.62,renderOffsetX:.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.65,.36],
  }),
  P('natatorium-light-emergency-west','tower_bulkhead',71.0,38.5,-Math.PI/2,{
    elevation:1.62,renderOffsetX:-.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.62,.32],
  }),
  P('natatorium-light-emergency-east','tower_bulkhead',95.5,38.5,Math.PI/2,{
    elevation:1.62,renderOffsetX:.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.62,.32],
  }),
  P('natatorium-light-emergency-far','tower_bulkhead',84.0,49.5,Math.PI,{
    elevation:1.62,renderOffsetZ:.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.60,.30],
  }),
  P('acq-services-panel-foh','power_box_01',96.5,16.0,Math.PI/2,{
    scaleX:1.76,scaleY:1.63,elevation:1.45,renderOffsetX:.25,
    provenance:provenance('services_rewire','S/P-03','front-of-house panel; typed circuit card'),
    inspectAt:{x:95.25,y:16.0},
    interaction:'action',action:'power-panel-sp03',interactionPriority:2,
    inspect:inspect('The front-of-house panel, S/P-03. Its typed circuit card lists foyer, box office and hall lounge; the main isolator is down.','S/P-03. A neat card for three dead circuits.'),
  }),
  P('plant-rack-1','equipment_rack',38.5,28,Math.PI/2,{inspect:inspect('A controls rack beside equipment too old to report to it.','The indicators are mechanical.')}),
  P('acq-services-panel-plant','power_box_01',39.5,30,Math.PI/2,{
    scaleX:1.76,scaleY:1.63,elevation:1.45,renderOffsetX:.25,
    provenance:provenance('services_rewire','S/P-01','plant-room panel; hand-corrected labels'),
    inspectAt:{x:38.75,y:30.0},
    interaction:'action',action:'power-panel-sp01',interactionPriority:2,
    inspect:inspect('The plant-room distribution panel, S/P-01. It begins the same numbered installation as the later boxes upstairs; two typed labels have been corrected in pencil.','S/P-01. The oldest corrections are still the clearest instructions.'),
  }),
  // Every authored electric practical has a visible body. The light table
  // anchors to these casings, so a fitting cannot drift away from the thing
  // that appears to emit it. `lightCircuit` is presentation metadata only;
  // the breaker state itself remains in the power runtime.
  P('light-dance-stair-casing','tower_bulkhead',45,20.5,Math.PI,{elevation:2.5,renderOffsetZ:.25,interactive:false,structural:true,lightMaintained:true,lightColor:[1,.48,.22]}),
  P('light-plant-service-casing','tower_bulkhead',35,26,0,{elevation:2.45,renderOffsetZ:-.25,interactive:false,structural:true,lightCircuit:'sp01',lightColor:[.69,.83,.70]}),
  P('light-dance-work-casing','tower_bulkhead',18,6,0,{elevation:2.45,renderOffsetZ:-.25,interactive:false,structural:true,lightCircuit:'sp01',lightColor:[.78,.78,.65]}),
  P('light-foh-west-casing','tower_bulkhead',75,12.5,-Math.PI/2,{elevation:3.25,renderOffsetX:-.25,interactive:false,structural:true,lightCircuit:'sp03',lightColor:[.74,.82,.78]}),
  P('light-foh-east-casing','tower_bulkhead',92,16.5,Math.PI,{elevation:3.25,renderOffsetZ:.25,interactive:false,structural:true,lightCircuit:'sp03',lightColor:[.74,.82,.78]}),
  P('light-pool-service-a-casing','tower_bulkhead',95.5,43,Math.PI/2,{elevation:3.3,renderOffsetX:.25,interactive:false,structural:true,lightCircuit:'sp02',lightColor:[.69,.83,.78]}),
  P('light-pool-service-b-casing','tower_bulkhead',71,43,-Math.PI/2,{elevation:3.3,renderOffsetX:-.25,interactive:false,structural:true,lightCircuit:'sp02',lightColor:[.67,.81,.76]}),
  P('light-hall-stage-door-casing','tower_bulkhead',99,8,-Math.PI/2,{elevation:5.15,renderOffsetX:-.25,interactive:false,structural:true,lightMaintained:true,lightColor:[1,.40,.22]}),
  P('light-hall-lounge-casing','tower_bulkhead',99,27,-Math.PI/2,{elevation:3.1,renderOffsetX:-.25,interactive:false,structural:true,lightCircuit:'sp03',lightColor:[.78,.74,.62]}),
  P('light-practice-north-casing','tower_bulkhead',59.5,55.5,Math.PI,{elevation:2.5,renderOffsetZ:.25,interactive:false,structural:true,lightMaintained:true,lightColor:[1,.52,.25]}),
  P('light-practice-south-casing','tower_bulkhead',60,81,-Math.PI/2,{elevation:2.5,renderOffsetX:-.25,interactive:false,structural:true,lightMaintained:true,lightColor:[1,.50,.24]}),
  // The sealed spur-substation is audible from the story route but has no
  // ordinary door. These objects are permanent building history; only the
  // separate HUSH navigation policy can cross the service seam to see them.
  P('legacy-tape-rack-west-a','legacy_tape_rack',22.15,34.65,Math.PI/2,{interactive:false}),
  P('legacy-tape-rack-west-b','legacy_tape_rack',22.15,36.15,Math.PI/2,{interactive:false}),
  P('legacy-patchbay-north','legacy_patchbay',24.15,34.45,0,{interactive:false}),
  P('legacy-transfer-console','legacy_transfer_deck',22.95,37.15,Math.PI,{interactive:false}),
  // Two authored wall systems replace the loose pipe cloud. All origins are
  // in plant-room air, one half-cell from solid masonry, and yaw points the
  // service faces into the room. The lower north run joins edge-to-edge.
  P('plant-pipe-north-lower-1','plant_pipe_straight',31.9,26.15,0,{elevation:1.18,mount:'wall',inspect:inspect('The west length of the lower wall run. Its clips share a chalk line with the valve.','The run stays level into the valve body.')}),
  P('plant-pipe-north-lower-valve','plant_pipe_valve',33.39,26.15,0,{elevation:1.14,mount:'wall',inspect:inspect('A red handwheel valve fitted inline on the lower north run. It has been wired open.','The tag says DO NOT ISOLATE.')}),
  P('plant-pipe-north-lower-2','plant_pipe_straight',34.89,26.15,0,{elevation:1.18,mount:'wall',inspect:inspect('The lower run continues east without changing level.','Old flux marks the joint beside the valve.')}),
  P('plant-pipe-north-lower-elbow','plant_pipe_elbow',36.51,26.15,0,{elevation:1.08,mount:'wall',inspect:inspect('The lower run finishes in a wall-plane riser elbow.','The bend was fitted in a hurry.')}),
  P('plant-pipe-north-bank-west','plant_pipe_bank',34.0,26.15,0,{elevation:1.62,mount:'wall',inspect:inspect('Three insulated runs clipped to the north wall on a common datum.','The paint has bubbled under old heat.')}),
  P('plant-pipe-north-bank-east','plant_pipe_bank',36.7,26.15,0,{elevation:1.62,mount:'wall',inspect:inspect('The three-line bank continues through matching sleeves.','One clamp is newer than the others.')}),
  P('plant-pipe-north-bank-elbow','plant_pipe_elbow',38.47,26.15,0,{elevation:1.62,mount:'wall',inspect:inspect('The upper bank terminates at a short riser beside the east wall.','Cold to the touch from below.')}),
  P('plant-pipe-east-bank-north','plant_pipe_bank',39.5,29,-Math.PI/2,{elevation:1.55,mount:'wall',inspect:inspect('A three-line service bank fixed to the east wall.','All three lines share the same bracket centres.')}),
  P('plant-pipe-east-bank-south','plant_pipe_bank',39.5,31.7,-Math.PI/2,{elevation:1.55,mount:'wall',inspect:inspect('The east-wall bank continues south through matching couplings.','The insulation changes colour at one coupling.')}),
  P('plant-pipe-east-valve','plant_pipe_valve',39.5,31.7,-Math.PI/2,{elevation:1.51,mount:'wall',inspect:inspect('A drain valve projects into the room from the east-wall bank.','Green crust at the threads.')}),
];
