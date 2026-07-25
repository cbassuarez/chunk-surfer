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

export const PROP_MESH = Object.freeze({
  school_desk:{w:.72,d:.78,blocks:true}, pew:{w:2.8,d:.72,blocks:true},
  chair:{w:.52,d:.56,blocks:false}, music_stand:{w:.45,d:.45,blocks:false},
  instrument_case:{w:1.25,d:.5,blocks:false}, equipment_cart:{w:1.2,d:.72,blocks:true},
  upright_piano:{w:1.55,d:.72,blocks:true}, grand_piano:{w:1.75,d:2.45,blocks:true},
  marimba:{w:2.8,d:1.05,blocks:true}, timpani:{w:.92,d:.92,blocks:true},
  cello:{w:.62,d:.42,blocks:false}, speaker_cabinet:{w:.64,d:.58,blocks:true},
  organ_console:{w:1.65,d:.88,blocks:true}, organ_pipes:{w:2.2,d:.36,blocks:true},
  equipment_rack:{w:.72,d:.7,blocks:true},
  violin:{w:.4,d:.3,blocks:false},
  portrait_frame:{w:.76,d:.12,blocks:false},
  hall_seating:{w:25.6,d:18.6,blocks:false},
  hall_structure:{w:29,d:37,blocks:false},
  chapel_vault:{w:12.5,d:34.5,blocks:false},
  ticket_counter:{w:2.8,d:.75,blocks:true}, key_cabinet:{w:.9,d:.24,blocks:true},
  box_office_desk:{w:1.15,d:.62,blocks:true}, program_stack:{w:.42,d:.32,blocks:false},
  cash_terminal:{w:.36,d:.28,blocks:false}, queue_stanchion:{w:.32,d:.32,blocks:false},
  notice_board:{w:1.2,d:.12,blocks:false}, pool_start_block:{w:.62,d:.72,blocks:true},
  pool_lane_markings:{w:14.2,d:19.5,blocks:false},
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
  tower_plaque:{w:1.35,d:.12,blocks:false}, tower_rope_mat:{w:1.05,d:1.05,blocks:false},
  tower_catwalk:{w:11.8,d:8.2,blocks:false}, tower_louvres:{w:6,d:.25,blocks:false},
  tower_peal_board:{w:1.8,d:.12,blocks:false}, tower_organ_case:{w:5.8,d:1.2,blocks:true},
  tower_loft_rail:{w:10,d:.16,blocks:false}, tower_bulkhead:{w:.3,d:.18,blocks:false},
  tower_stair_rail_low_up:{w:9,d:4,blocks:false}, tower_stair_rail_high_up:{w:10,d:4,blocks:false},
  tower_stair_rail_high_down:{w:10,d:4,blocks:false}, tower_stair_rail_low_down:{w:9,d:4,blocks:false},
  upper_stair_dressing:{w:3,d:11.5,blocks:false}, basement_stair_dressing:{w:3,d:10.5,blocks:false},
  academic_stair_dressing:{w:3,d:10.5,blocks:false},
  stair_smoke_door_open:{w:3.1,d:2.1,blocks:false},
  stair_smoke_door_closed:{w:3.1,d:.2,blocks:false},
  stair_sconce_pair_opal:{w:3,d:.55,blocks:false}, stair_bulkhead_pair:{w:3,d:.5,blocks:false},
  stair_pendant_opal:{w:.6,d:.6,blocks:false}, stair_shadow_figure:{w:.65,d:.3,blocks:false},
  academic_atrium_structure:{w:24,d:27,blocks:false}, academic_skylight:{w:23,d:26,blocks:false},
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
  // Loading dock / foyer: work furniture, not a showroom.
  P('dock-desk-1','school_desk',60.0,6.0,.15,{inspect:inspect('A school desk used as a signing table. The basket underneath is full of cable ties.','The cable ties are older than the desk.')}),
  P('acq-maintenance-searchlight-dock','portable_searchlight',61.0,6.0,.35,{
    scale:1.8,
    provenance:provenance('maintenance_purchase','M/L-02','loading-dock unit; battery removed'),
    inspect:inspect('A portable inspection lamp from the paired maintenance purchase, M/L-02. The battery bay is open and empty; it cannot light the room.','M/L-02. Lamp, cable and no battery.'),
  }),
  P('foyer-pew-1','pew',82.0,7.0,Math.PI/2,{inspect:inspect('One chapel pew never made it upstairs. A paper removal tag is still tied to it.','The tag says RETURN TO CHAPEL.')}),
  P('foyer-cart-1','equipment_cart',91.5,14.0,0,{inspect:inspect('A percussion cart with one wheel wired straight.','It will only travel in a circle.')}),
  P('foyer-portrait-titian','portrait_frame',80.5,4.0,0,{elevation:1.35,portraitIndex:0,inspect:inspect('Titian. Portrait of a Man. A Met Open Access reproduction in an inexpensive gilt frame.','The sitter keeps looking past the entrance.')}),
  P('foyer-portrait-greco','portrait_frame',84.0,4.0,0,{elevation:1.35,portraitIndex:1,inspect:inspect('El Greco. Portrait of an Old Man. Someone has polished the glass more often than the frame.','His eyes catch the corridor light first.')}),
  P('box-office-counter','ticket_counter',90.55,18.85,Math.PI/2,{scale:.75,inspect:inspect('The ticket counter was built to keep a queue outside and cash inside. The grille is still locked down.','Nothing has been sold here for years.')}),
  P('box-office-desk','box_office_desk',94.05,19.1,0,{inspect:inspect('The staff desk is squared to the ticket window. A blotter has been pressed flat by damp.','Front of house, stopped mid-week.')}),
  P('box-office-chair','chair',93.25,19.15,Math.PI/2,{inspect:inspect('A staff chair tucked under the ticket desk, not abandoned in the queue path.','Its casters have made a small grey ring.')}),
  P('box-office-program-stack','program_stack',91.05,18.15,Math.PI/2,{elevation:1.05,inspect:inspect('A stack of folded programmes for a season that never opened.','The top programme has curled at both corners.')}),
  P('box-office-cash-terminal','cash_terminal',90.95,19.45,Math.PI/2,{elevation:1.05,inspect:inspect('A dead card terminal beside a cash drawer. The receipt paper is still threaded.','No signal. No float.')}),
  P('box-office-ledger','notice_board',94.8,18.05,Math.PI,{elevation:1.1,interaction:'action',action:'rekey-ledger',inspect:inspect('A rekey ledger: REPLACEMENT CORE — CHAPEL — CABINET C-17.','CHAPEL. REPLACEMENT CORE. C-17.')}),
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
  P('hall-seating','hall_seating',113.0,23.0,Math.PI,{interactive:false,structural:true,elevation:-2.5,collisionMask:'hall-seating'}),
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

  // Practice suite. Mixed rooms, mixed equipment, and corridor surplus.
  P('practice-ensemble-marimba','marimba',67,78,0,{...play(MARIMBA,'A rehearsal marimba with masking tape on four bars.','Four bars, four old pencil numbers.')}),
  P('practice-ensemble-cello','cello',55,78,.18,{...play(STRINGS,'A cello left upright in a corner that is not safe for it.','No bow. No case open.')}),
  P('practice-ensemble-violin','violin',56,79,-.3,{elevation:.48,inspectAt:{x:61.35,y:78.55},...play(STRINGS,'A violin left on a chair, chin rest to the door.','Someone put it down mid-phrase.')}),
  ...[[60.0,57.0],[72.0,57.0],[60.0,64.0],[72.0,64.0],[60.0,71.0],[72.0,71.0]].map(([x,y],i)=>
    P(`practice-piano-${i+1}`,'upright_piano',x,y,i%2?Math.PI:0,{...play(PIANO,'An upright piano, lid up, institutional number under the fallboard.','The number has been changed twice.')})),
  ...[[61.0,59.0],[71.0,59.0],[61.0,66.0],[71.0,66.0],[71.0,80.0]].map(([x,y],i)=>
    P(`practice-stand-${i+1}`,'music_stand',x,y,.1*i,{inspect:inspect('A stand left open at playing height.','Nothing on it.')})),
  ...[
    {x:62.5,y:59.0,yaw:0,state:'pencil room number beneath the seat'},
    {x:73.5,y:59.0,yaw:Math.PI,state:'new rubber foot on the corridor-side leg'},
    {x:62.5,y:66.0,yaw:0,state:'back rail polished by a coat hook'},
    {x:73.5,y:66.0,yaw:Math.PI,state:'two upholstery tacks replaced'},
    {x:62.5,y:73.0,yaw:0,state:'old rosin ground into the front edge'},
    {x:73.5,y:73.0,yaw:Math.PI,state:'seat foam compressed towards the piano'},
    {x:61.0,y:79.0,yaw:0,state:'violin resting across the seat',inspectAt:{x:60.55,y:79.45}},
    {x:73.5,y:80.0,yaw:Math.PI,state:'paper transfer label from the ensemble room'},
  ].map((entry,i)=>{
    const assetTag=`P/CH-${String(i+1).padStart(2,'0')}`;
    return P(`acq-practice-chair-${i+1}`,'green_chair_01',entry.x,entry.y,entry.yaw,{
      provenance:provenance('practice_room_contract',assetTag,entry.state),
      ...(entry.inspectAt?{inspectAt:entry.inspectAt}:{}),
      inspect:inspect(`A green practice-room chair from the eight-chair order. ${assetTag} is stamped underneath; ${entry.state}.`,`${assetTag}. One of eight, altered by this room.`),
    });
  }),
  P('practice-case-1','instrument_case',60.5,60.5,Math.PI/2,{inspect:inspect('A hard case with no instrument name, only a room number.','The room number no longer exists.')}),
  P('practice-case-2','instrument_case',61.5,67.5,Math.PI/2,{inspect:inspect('Another case in the corridor. Locked, light, probably empty.','Probably empty.')}),
  P('practice-desk-stack-1','school_desk',52.5,80,Math.PI/2,{inspect:inspect('Two teaching desks shoved together at the wall.','Surplus stored in circulation, as usual.')}),
  P('practice-desk-stack-2','school_desk',53.3,80,Math.PI/2,{inspect:inspect('The second desk makes the obstruction official.','Nobody filed a fire plan for this.')}),

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
  P('tower-history-plaque','tower_plaque',88.0,62.0,Math.PI/2,{elevation:1.0,inspect:inspect('J. VALE & SONS — CAST FOR ELLERY COLLEGIATE CHAPEL — 1908. Eight bells. Tenor: 2,200 kg.','Ellery Collegiate Chapel. 1908. No county is given.')}),

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
  P('tower-sign-ringing','tower_plaque',32.0,159.0,Math.PI/2,{elevation:1.05,inspect:inspect('RINGING ROOM. The enamel letters are older than the electrical conduit.','RINGING ROOM.')}),
  P('tower-light-lower','tower_bulkhead',1.0,151.0,Math.PI/2,{elevation:1.85,interactive:false,structural:true}),
  P('tower-light-upper','tower_bulkhead',37.0,151.0,Math.PI/2,{elevation:1.85,interactive:false,structural:true}),
  P('tower-light-ringing','tower_bulkhead',25.0,152.0,0,{elevation:2.7,interactive:false,structural:true}),

  // Above: a low two-row H frame and perimeter catwalk in a monumental English
  // belfry. The temporary French recording affects audio only, never form.
  P('tower-bell-frame','tower_frame',61.0,158.0,0,{interactive:false,structural:true}),
  P('tower-catwalk','tower_catwalk',61.0,158.0,0,{interactive:false,structural:true}),
  P('tower-louvres-east','tower_louvres',68.3,158.0,Math.PI/2,{interactive:false,structural:true,elevation:2.5}),
  P('tower-sign-belfry','tower_plaque',67.8,158.0,Math.PI/2,{elevation:1.1,inspect:inspect('BELLS — AUTHORISED ACCESS. The final word has been underlined by hand.','BELLS — AUTHORISED ACCESS.')}),
  P('tower-light-entry','tower_bulkhead',67.0,158.0,Math.PI/2,{elevation:1.9,interactive:false,structural:true}),
  P('tower-shutters','tower_shutters',68.0,158.0,Math.PI/2,{interactive:false,structural:true,elevation:.1}),
  P('tower-shutter-winch','tower_winch',68.0,163.0,0,{interaction:'action',action:'tower-shutter-winch',inspect:inspect('The shutter winch is taking the whole frame through its pawl.','Under load.')}),
  P('tower-light-winch','tower_bulkhead',67.5,163.0,Math.PI/2,{elevation:1.8,interactive:false,structural:true}),

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
  P('tower-sign-organ-exit','tower_plaque',100.0,156.0,Math.PI/2,{elevation:1.0,inspect:inspect('ORGAN LOFT / NAVE. An arrow follows the service stair down.','ORGAN LOFT / NAVE.')}),
  P('tower-light-service','tower_bulkhead',73.0,151.0,Math.PI/2,{elevation:1.85,interactive:false,structural:true}),
  P('tower-light-organ-exit','tower_bulkhead',100.0,156.0,Math.PI/2,{elevation:1.85,interactive:false,structural:true}),

  // Utility spaces remain believable but are not playable instruments.
  P('pool-lane-markings','pool_lane_markings',84,38.75,0,{interactive:false,structural:true,elevation:.05}),
  P('pool-bench-1','pew',74.7,34.2,Math.PI/2,{mesh:'pew',scale:.62,inspect:inspect('A timber changing bench, grey from chlorine.','The grain has lifted.')}),
  P('pool-bench-2','pew',74.7,42.2,Math.PI/2,{mesh:'pew',scale:.62,inspect:inspect('A second changing bench set against the dry deck wall.','No towel ever dried here.')}),
  P('pool-cart-1','equipment_cart',94.2,46.7,Math.PI/2,{inspect:inspect('A pool-maintenance cart parked by the service corner, not beside the basin.','The warning labels have run.')}),
  P('acq-maintenance-searchlight-pool','portable_searchlight',94.2,46.25,-Math.PI/2,{
    scale:1.5,elevation:.68,
    provenance:provenance('maintenance_purchase','M/L-01','natatorium unit; lens clamp replaced'),
    inspectAt:{x:93.45,y:46.55},
    inspect:inspect('The pool cart carries M/L-01, one of two portable inspection lamps. Its replacement lens clamp is bright, but the disconnected lead ends at the cart.','M/L-01. A repaired lamp with nowhere to draw power.'),
  }),
  P('pool-lifeguard-chair','lifeguard_chair',94.2,38.8,-Math.PI/2,{inspect:inspect('A lifeguard chair facing the length of the pool.','The rescue tube is gone.')}),
  P('pool-lane-reel','lane_reel',94.2,31.5,Math.PI/2,{inspect:inspect('A lane-line reel at the storage edge with one cracked float still wound onto it.','The handle turns half a revolution.')}),
  ...[77.5,80.1,82.7,85.3,87.9,90.5].map((x,i)=>P(`pool-start-${i+1}`,'pool_start_block',x,49.0,0,{inspect:inspect('A starting block, its number plate removed.','Four bolt heads and a paler rectangle.')})),
  ...[80.1,82.7,85.3,87.9].map((x,i)=>P(`pool-drain-${i+1}`,'drain_grille',x,44.8,0,{elevation:.06,inspect:inspect('A basin drain furred white with old pool salts.','The salts trace every slot.')})),
  P('acq-services-panel-pool','power_box_01',95.45,44.8,-Math.PI/2,{
    scaleX:1.76,scaleY:1.63,elevation:1.45,
    provenance:provenance('services_rewire','S/P-02','natatorium panel; chlorine bloom under the lip'),
    inspectAt:{x:94.7,y:44.8},
    inspect:inspect('The natatorium distribution panel, S/P-02, matches the plant-room and front-of-house boxes. Chlorine has lifted the paint beneath its lower lip; every breaker is open.','S/P-02. Same installation, different air, no live circuit.'),
  }),
  P('acq-services-panel-foh','power_box_01',96.0,16.0,-Math.PI/2,{
    scaleX:1.76,scaleY:1.63,elevation:1.45,
    provenance:provenance('services_rewire','S/P-03','front-of-house panel; typed circuit card'),
    inspectAt:{x:95.25,y:16.0},
    inspect:inspect('The front-of-house panel, S/P-03. Its typed circuit card lists foyer, box office and hall lounge; the main isolator is down.','S/P-03. A neat card for three dead circuits.'),
  }),
  P('plant-rack-1','equipment_rack',38.5,28,Math.PI/2,{inspect:inspect('A controls rack beside equipment too old to report to it.','The indicators are mechanical.')}),
  P('acq-services-panel-plant','power_box_01',38.0,30,-Math.PI/2,{
    scaleX:1.76,scaleY:1.63,elevation:1.45,
    provenance:provenance('services_rewire','S/P-01','plant-room panel; hand-corrected labels'),
    inspectAt:{x:37.25,y:10.0},
    inspect:inspect('The plant-room distribution panel, S/P-01. It begins the same numbered installation as the later boxes upstairs; two typed labels have been corrected in pencil.','S/P-01. The oldest corrections are still the clearest instructions.'),
  }),
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
