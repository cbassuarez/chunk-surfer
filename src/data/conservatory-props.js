// Fixed objects in the conservatory. Coordinates are authored metres, not
// runtime cells. A prop's sound belongs to the object, never to whichever zone
// or corridor happens to contain it.

import {
  EXTERIOR_INSPECTABLES,
  YARD_SERVICE_RANGES,
  districtLogicalAt,
} from './exterior-district.js';
import { OPENING_STREET_MESHES, OPENING_STREET_PROPS } from './opening-street.js';
import { VIGIL_MESHES, VIGIL_PART_MESHES, vigilFigures, vigilParts } from './exterior-vigil.js';
import { YARD_PARK_MESHES, YARD_PARK_PROPS } from './yard-park.js';
import { BASEBOARDS } from './generated/prop-geometry.js';
import { CHURCH_COLLIDERS } from './st-brendans.js';
import { VEGETATION_FALLBACKS, VEGETATION_MESHES } from './vegetation.js';

const P = (id, mesh, x, y, yaw = 0, extra = {}) => ({ id, mesh, x, y, yaw, scale:1, ...extra });

// The swimmable centre of the natatorium, and the five lane centres on it.
// Every lane fixture — markings, ropes, backstroke flags, starting blocks —
// hangs off these two so they can never drift apart again. 1.95m pitch puts the
// outer lanes at 80.1 and 87.9, clear of the west access stair (x77..79) and
// inside the east coping (x89.25).
const POOL_LANE_CENTRE_X = 84.0;
const POOL_LANE_PITCH = 1.95;
const POOL_LANE_X = [-2,-1,0,1,2].map((n) => POOL_LANE_CENTRE_X + n * POOL_LANE_PITCH);
const CPG = (x,y) => ({x:112+x,y:125+y});
const CPL = (x,y) => ({x:140+x,y:183+y});
const CPB = (x,y) => ({x:170+x,y:169+y});
const DP = (id,mesh,physicalX,physicalY,yaw=0,extra={}) => {
  const point=districtLogicalAt(physicalX,physicalY);
  return P(id,mesh,point.x,point.y,yaw,extra);
};
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
  services_rewire:Object.freeze({kind:'contract',era:'late services refit',markPrefix:'S/P',summary:'Matching distribution panels installed across five occupied service zones.'}),
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
  ...OPENING_STREET_MESHES,
  ...YARD_PARK_MESHES,
  ...VEGETATION_MESHES,
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
  hall_entrance_portal:{w:3.8,d:4.2,h:4.8,blocks:false},
  hall_entrance_sign:{w:2.75,d:.12,h:.48,blocks:false},
  hall_entry_sconce:{w:.34,d:.24,h:.52,blocks:false,mount:'portal'},
  atrium_public_fittings:{w:22,d:23,h:4.6,blocks:false},
  atrium_entry_closure:{w:2.35,d:1.10,h:1.72,blocks:false},
  atrium_formal_banner:{w:2.05,d:.14,h:3.95,blocks:false,mount:'wall'},
  atrium_suspended_lantern:{w:1.55,d:1.55,h:16.75,blocks:false,mount:'floor'},
  atrium_waiting_rug:{w:3.80,d:4.50,h:.04,blocks:false,mount:'floor'},
  chapel_vault:{w:12.5,d:34.5,blocks:false},
  // One project-native mesh owns all four flights and both half-landings. The
  // floorplan remains the collision authority; this is the construction layer
  // whose 58 real treads, slab edges and open-well rails must never be reduced
  // to the half-metre navigation raster.
  main_open_well_stair:{w:6.5,d:6.2,h:14.9,blocks:false},
  ticket_counter:{w:2.8,d:.75,blocks:true}, key_cabinet:{w:.9,d:.24,blocks:true},
  rekey_ledger:{w:1.22,d:.12,blocks:false}, chapel_key_cabinet:{w:1,d:.36,h:1.24,blocks:false},
  chapel_key_ring_ch04:{w:.18,d:.37,h:.28,blocks:false},
  chapel_key_ring_c17:{w:.18,d:.37,h:.28,blocks:false},
  chapel_key_ring_fohm:{w:.18,d:.37,h:.28,blocks:false},
  box_office_desk:{w:1.15,d:.62,blocks:true}, program_stack:{w:.42,d:.32,blocks:false},
  cash_terminal:{w:.36,d:.28,blocks:false}, queue_stanchion:{w:.32,d:.32,blocks:false},
  notice_board:{w:1.2,d:.12,blocks:false}, pool_start_block:{w:.62,d:.72,blocks:true},
  pool_access_handrail:{w:1.9,d:5.2,h:3.05,blocks:false},
  // The dance wing. The barre, the mirror and the stencil are wall furniture and
  // must face away from masonry; the rail and the lino rolls stand on the floor.
  dance_barre:{w:2.9,d:.22,h:1.14,blocks:false,mount:'wall'},
  dance_mirror:{w:3.96,d:.10,h:2.60,blocks:false,mount:'wall'},
  door_stencil:{w:.46,d:.04,h:.34,blocks:false,mount:'wall'},
  costume_rail:{w:1.6,d:.55,h:1.62,blocks:true},
  rolled_lino:{w:.62,d:.42,h:1.78,blocks:true},
  pool_lane_markings:{w:10.2,d:15.5,blocks:false},
  bay_canopy:{w:8.2,d:9.2,h:5.7,blocks:false},
  getin_sightline_shell:{w:16.6,d:12.5,h:5.7,blocks:false},
  scene_dock_roof_structure:{w:16.6,d:12.5,h:5.7,blocks:false},
  scene_dock_sign_foh:{w:2.3,d:.10,h:.58,blocks:false,mount:'wall'},
  scene_dock_sign_services:{w:2.7,d:.10,h:.86,blocks:false,mount:'wall'},
  yard_dock_access:{w:4.4,d:9.2,h:2.0,blocks:false},
  yard_booth:{w:3.4,d:3.0,blocks:false}, yard_booth_glazing:{w:3.1,d:2.7,blocks:false},
  yard_booth_interior:{w:2.7,d:2.4,blocks:false}, yard_booth_practicals:{w:2,d:2,blocks:false},
  yard_booth_guard_idle:{w:.7,d:.7,blocks:false}, yard_booth_guard_ledger:{w:.8,d:.8,blocks:false},
  yard_booth_guard_handoff:{w:1.2,d:1,blocks:false}, yard_booth_handoff:{w:.7,d:.4,blocks:false},
  yard_fence_run:{w:.7,d:24.4,blocks:false},
  yard_lamp_column:{w:2.4,d:.6,blocks:false}, yard_skip:{w:3.7,d:1.9,blocks:false},
  yard_clutter:{w:6.0,d:3.2,blocks:false}, yard_markings:{w:16.0,d:13.0,blocks:false},
  yard_sign:{w:1.9,d:.2,blocks:false}, yard_road:{w:34.4,d:11.0,blocks:false},
  demolition_scaffold_run:{w:7.8,d:1.4,h:7.2,blocks:true},
  demolition_excavator:{w:2.4,d:6.0,h:3.4,blocks:true},
  demolition_heras_fence:{w:4.1,d:.7,h:2.15,blocks:true},
  demolition_light_tower:{w:1.5,d:1.4,h:4.8,blocks:true},
  demolition_generator:{w:2.5,d:3.6,h:1.55,blocks:true},
  yard_gate_piers:{w:1.0,d:14.0,blocks:false}, yard_hedge_run:{w:2.0,d:11.6,blocks:false},
  // The full depth of the yard now, not the 46.5 the yard used to be. The mesh
  // is authored in absolute local z (-7.5..84.5) and is deliberately NOT centred
  // on its anchor, so this footprint is nominal — nothing collides with it or
  // picks it (blocks and interactive are both off).
  // One hero pack now owns the whole connected civic mass, not merely the thin
  // service face its stable runtime name predates.
  conservatory_west_elevation:{w:82.0,d:92.0,h:32.0,blocks:false},
  conservatory_stair_window:{w:.5,d:1.5,blocks:false},
  // The near city. Same convention as the elevation: authored in absolute local
  // coordinates off a yard anchor, so these footprints are nominal. None of them
  // block, and nothing on the far side of the boundary is reachable.
  city_frontage:{w:70.0,d:80.0,blocks:false},
  city_bus_shelter:{w:2.9,d:5.0,blocks:false},
  yard_look_bench:{w:.78,d:3.4,h:1.12,blocks:false},
  city_parked_car:{w:1.8,d:4.3,blocks:false},
  city_moving_car:{w:1.9,d:4.5,h:1.5,blocks:false},
  district_terrace_frontage:{w:5.5,d:64.0,blocks:false},
  district_civic_frontage:{w:6.5,d:64.0,blocks:false},
  district_workshop_frontage:{w:7.0,d:64.0,blocks:false},
  district_passage_frontage:{w:5.5,d:64.0,blocks:false},
  district_court_walls:{w:9.2,d:16.5,h:9.5,blocks:false},
  district_outer_sprawl:{w:320,d:270,h:18,blocks:false},
  district_post_box:{w:.8,d:.8,h:1.4,blocks:false},
  district_bench:{w:2.2,d:.8,h:1.3,blocks:false},
  district_bin_cluster:{w:1.7,d:1.0,h:1.2,blocks:false},
  district_bollard_pair:{w:2.8,d:.5,h:1.1,blocks:false},
  exterior_story_plaque:{w:1.35,d:.28,h:1.0,blocks:false},
  yard_stable_range:{w:12,d:8,h:7.4,blocks:true},
  // ST BRENDAN'S. blocks:false is not an oversight — the church's walls are real
  // raymarched cells (ZONE.church) and already collide. A blocking prop box here
  // would be a solid twenty-five by thirty-six metre slab over the whole
  // footprint, sealing the inside of the building off from its own doors.
  st_brendan_church:{w:18.8,d:31.9,h:17.35,blocks:false},
  cathedral_font:{w:1.0,d:1.0,h:1.18,blocks:true},
  cathedral_pulpitum:{w:8.0,d:.55,h:2.65,blocks:false},
  cathedral_tomb:{w:2.1,d:.85,h:1.05,blocks:true},
  cathedral_monument:{w:1.25,d:.42,h:2.5,blocks:false},
  yard_rehearsal_range:{w:14,d:10,h:8.8,blocks:true},
  yard_baths_plant:{w:13,d:12,h:7.2,blocks:true},
  yard_covered_stores:{w:12,d:13,h:6.4,blocks:true},
  ambient_late_bus:{w:2.5,d:9.5,h:3.1,blocks:false},
  ambient_cyclist:{w:.7,d:1.8,h:1.75,blocks:false},
  ambient_dog_walker:{w:1.8,d:1.5,h:1.8,blocks:false},
  ambient_awning_figure:{w:.65,d:.45,h:1.78,blocks:false},
  // The overnight vigil. These BLOCK — a crowd you can walk through is not a
  // crowd — so the boxes are the real footprints, kit included, and the
  // clearances in data/exterior-vigil.js are what keeps them out of the route.
  ...VIGIL_MESHES,
  ...VIGIL_PART_MESHES,
  exterior_bus_woman:{w:.85,d:.62,h:1.76,blocks:false},
  exterior_mews_neighbor:{w:.82,d:.60,h:1.82,blocks:false},
  exterior_pub_driver:{w:.88,d:.66,h:1.84,blocks:false},
  yard_van:{w:2.9,d:6.6,h:2.6,blocks:true},
  yard_van_lamp:{w:.4,d:.25,blocks:false},
  natatorium_roof_structure:{w:23.2,d:20.5,blocks:false},
  natatorium_perimeter_relief:{w:25.2,d:22.2,blocks:false},
  natatorium_entrance_fixtures:{w:19.2,d:4.8,h:4.2,blocks:false},
  natatorium_cubicle_bank:{w:14.7,d:.35,blocks:false},
  natatorium_end_window:{w:10.5,d:.24,blocks:false}, natatorium_clock:{w:1.1,d:.12,blocks:false},
  changing_bench:{w:2.2,d:.48,blocks:true}, pool_lane_ropes:{w:8.0,d:15.2,blocks:false},
  pool_backstroke_flags:{w:12.2,d:.08,blocks:false}, pool_ladder:{w:.85,d:.95,blocks:false},
  pool_lifebuoy:{w:1.0,d:.14,blocks:false},
  loose_note:{w:.32,d:.42,blocks:false}, loose_note_page6:{w:.45,d:.55,blocks:false},
  story_waypoint_beacon:{w:1.3,d:1.3,h:.75,blocks:false},
  tuning_fork:{w:.22,d:.82,blocks:false},
  calibration_pin:{w:.12,d:.12,blocks:false},
  lifeguard_chair:{w:.78,d:.78,blocks:true}, lane_reel:{w:1.05,d:.62,blocks:true},
  drain_grille:{w:1.2,d:.18,blocks:false}, altar_table:{w:1.8,d:.78,blocks:true},
  lectern:{w:.62,d:.62,blocks:true}, hymn_board:{w:.8,d:.12,blocks:false},
  plant_pipe_straight:{w:2.4,d:.16,blocks:false}, plant_pipe_bank:{w:2.8,d:.34,blocks:false},
  plant_pipe_elbow:{w:.92,d:.92,blocks:false}, plant_pipe_valve:{w:.62,d:.32,blocks:false},
  plant_calorifier:{w:1.45,d:1.45,h:2.65,blocks:true}, plant_pump_skid:{w:1.8,d:.88,h:.92,blocks:true},
  plant_mcc_bank:{w:2.7,d:.42,h:2.18,blocks:false,mount:'wall'}, plant_idf_frame:{w:2.25,d:.24,h:1.76,blocks:false,mount:'wall'},
  plant_header_manifold:{w:4.7,d:.68,h:2.35,blocks:false,mount:'wall'}, plant_overhead_header:{w:7.6,d:2.0,h:3.15,blocks:false},
  plant_grated_steps:{w:3.0,d:1.5,h:.42,blocks:false}, plant_steam:{w:1.0,d:.55,h:2.2,blocks:false},
  plant_gauge_needle_0:{w:.3,d:.05,h:2.3,blocks:false},plant_gauge_needle_1:{w:.3,d:.05,h:2.3,blocks:false},plant_gauge_needle_2:{w:.3,d:.05,h:2.3,blocks:false},
  adjustable_spanner:{w:.38,d:.10,h:.04,blocks:false}, stillson_wrench:{w:1.82,d:.24,h:.12,blocks:false},
  walkie_radio:{w:.22,d:.12,h:.46,blocks:false}, radio_carrier_led:{w:.06,d:.03,h:.03,blocks:false},
  tower_frame:{w:9,d:4.6,blocks:false}, tower_rope:{w:.18,d:.18,blocks:false}, tower_rope_tenor:{w:.20,d:.20,blocks:false},
  tower_clock_hammer:{w:.9,d:.5,blocks:false}, tower_winch:{w:1.2,d:.8,blocks:false},
  tower_shutters:{w:3.4,d:.2,blocks:false}, chapel_inner_screen:{w:6,d:.2,blocks:false},
  chapel_screen_signal:{w:3,d:.2,h:3.4,blocks:false}, tower_exit_indicator:{w:1.7,d:.12,h:.5,blocks:false},
  tower_plaque:{w:1.35,d:.12,h:.76,blocks:false,mount:'wall'}, tower_rope_mat:{w:1.05,d:1.05,blocks:false}, tower_rope_mat_tenor:{w:1.3,d:1.3,blocks:false},
  public_exit_sign:{w:2.3,d:.12,h:.62,blocks:false,mount:'wall'},
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
  apparition_pose_neutral:{w:.72,d:.32,h:1.78,blocks:false,mount:'floor'},
  apparition_pose_side:{w:.48,d:.38,h:1.78,blocks:false,mount:'floor'},
  apparition_pose_stoop:{w:.78,d:.48,h:1.74,blocks:false,mount:'floor'},
  apparition_pose_head_turn:{w:.76,d:.34,h:1.78,blocks:false,mount:'floor'},
  apparition_pose_arm_out:{w:1.12,d:.36,h:1.78,blocks:false,mount:'floor'},
  apparition_pose_weight_shift:{w:.82,d:.36,h:1.78,blocks:false,mount:'floor'},
  apparition_pose_symmetric:{w:.66,d:.30,h:1.78,blocks:false,mount:'floor'},
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
  // Generated skirting meshes are real prop-pack members too. Their extents
  // come from the generated geometry table at render time; these non-blocking
  // registry entries make the placement contract truthful for every group,
  // including the cathedral's new skirting pass.
  ...Object.fromEntries(Object.values(BASEBOARDS).map(({mesh})=>[mesh,{w:1,d:1,blocks:false}])),
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
  ...CHURCH_COLLIDERS.map((collider)=>{
    const point=collider.floor>=10?CPB(collider.x,collider.y)
      :collider.floor>=4.5?CPL(collider.x,collider.y):CPG(collider.x,collider.y);
    const diameter=(collider.radius||0)*2;
    return{id:collider.id,kind:'obb',x:point.x,y:point.y,
      width:collider.w||diameter,depth:collider.d||diameter,yaw:0,
      minElevation:collider.floor,maxElevation:collider.ceil,
      spaceId:collider.floor>=10?'cathedral_belfry':collider.floor>=4.5?'cathedral_loft':'cathedral_ground'};
  }),
  // Exterior players remain on the yard component. Mirror the projections
  // that extend beyond the masonry mask there, otherwise a buttress can be
  // visible and solid from inside while remaining intangible from the yard.
  ...CHURCH_COLLIDERS.filter((collider)=>collider.floor===0&&collider.id.startsWith('cathedral-buttress-')).map((collider)=>({
    id:`${collider.id}-yard`,kind:'obb',x:50+collider.x,y:200+collider.y,
    width:collider.w,depth:collider.d,yaw:0,
    minElevation:collider.floor,maxElevation:collider.ceil,spaceId:'loading_bay',
  })),
]);

// THE BAKED SKIRTING, one mesh per render group.
//
// Generated from the compiled floorplan by build-props.mjs, so it is a function
// of the walls rather than a transcription of them — which is the whole reason
// the previous base course floated. The anchor is a real cell in the group, so
// the ordinary prop transform resolves it; nothing here is a typed coordinate.
// If the floorplan moves and the pack is not rebuilt,
// test/baseboard-freshness.spec.mjs fails.
const BASEBOARD_PROPS = Object.entries(BASEBOARDS).map(([group, b]) =>
  P(`baseboard-${group}`, b.mesh, b.anchor.x / 2, b.anchor.y / 2, 0, {
    interactive: false, structural: true, blocks: false, renderGroups: [group],
  }));

export const CONSERVATORY_PROPS = [
  ...OPENING_STREET_PROPS,
  ...YARD_PARK_PROPS,

  // ── behind the plant-services door ────────────────────────────────────────
  // The substation has been drawn into the sub-basement plan since the spur was
  // authored, and sealed behind a key nothing in the building issued. It is
  // worth walking into now — the bust upstairs says where the key went — so it
  // is dressed rather than left as an empty box.
  //
  // Only this room. `spur-tank` has the same lock on it but it is a SECOND door
  // into the plant annex, which the wide annex opening already reaches and which
  // holds the heating header the Stillson has to get to. Dressing that side put
  // blocking geometry across a route the plant incident depends on.
  P('spur-substation-mcc','plant_mcc_bank',21.4,35.0,Math.PI/2,{interactive:false,structural:true,blocks:true,
    inspect:inspect('Switchgear, dead, with the isolator handles all thrown the same way and a strip of tape across them somebody wrote on in 1994.','Dead switchgear. Tape, and a date, and a hand that is not yours.')}),
  P('spur-substation-idf','plant_idf_frame',23.4,36.4,0,{interactive:false,structural:true,blocks:true}),
  P('spur-substation-steps','plant_grated_steps',22.2,34.3,0,{interactive:false,structural:true,blocks:false}),

  ...BASEBOARD_PROPS,
  // The centre of the new logical ground hall maps to physical (63m, 37m),
  // which is also the deterministic asset's local origin. It is visible from
  // every level because the open well is one piece of construction.
  P('main-open-well-stair','main_open_well_stair',139,29,0,{
    renderOffsetX:1,renderOffsetZ:2,
    interactive:false,structural:true,renderGroups:['ground','upper','academic'],
  }),

  // ── The loading bay: the canopy, and the building over it ──
  // Both are architecture, not dressing: they are what you look at when you
  // turn round from the grey door, and what stops the conservatory's own mass
  // rendering as a black slab against the yard's sky.
  P('bay-canopy','bay_canopy',53.0,7.5,0,{interactive:false,structural:true}),
  // Exterior observers do not receive the ray-marched interior plan. This
  // aligned, non-colliding room shell is therefore the view through the open
  // goods doors; prop-visibility hides it again as soon as the real Get-In
  // becomes the active envelope.
  P('bay-getin-sightline','getin_sightline_shell',53.0,7.5,0,{interactive:false,structural:true}),
  // One roof, seen from both sides of the goods threshold. Unlike the exterior
  // sightline shell this is never visibility-switched, so entering the room
  // cannot replace rafters and ceiling panels with a flat black plane.
  P('dock-scene-roof','scene_dock_roof_structure',53.0,7.5,0,{
    interactive:false,structural:true,blocks:false,
  }),
  // The apron is a working loading throat, not four anonymous planes. These
  // shallow fixtures stay on the real floorplan walls (mount:'wall') and use
  // bay ids so the exterior visibility pass retains them on the walk in.
  P('bay-apron-route-board','notice_board',51.4,4.0,0,{
    mount:'wall',elevation:1.18,interactive:false,structural:true,blocks:false,
  }),
  P('bay-apron-conduit-north','plant_pipe_bank',54.3,4.0,0,{
    mount:'wall',elevation:2.08,interactive:false,structural:true,blocks:false,
  }),
  P('bay-apron-bulkhead-north','tower_bulkhead',55.7,4.0,0,{
    mount:'wall',elevation:2.78,interactive:false,structural:true,blocks:false,
    lightMaintained:true,lightColor:[1,.64,.34],
  }),
  P('bay-apron-loading-notice','notice_board',51.4,11.0,Math.PI,{
    mount:'wall',elevation:1.18,interactive:false,structural:true,blocks:false,
  }),
  P('bay-apron-conduit-south','plant_pipe_bank',54.3,11.0,Math.PI,{
    mount:'wall',elevation:2.08,interactive:false,structural:true,blocks:false,
  }),
  P('bay-apron-bulkhead-south','tower_bulkhead',55.7,11.0,Math.PI,{
    mount:'wall',elevation:2.78,interactive:false,structural:true,blocks:false,
    lightMaintained:true,lightColor:[1,.58,.28],
  }),
  P('bay-apron-bay-number','door_stencil',56.0,7.8,-Math.PI/2,{
    mount:'wall',elevation:1.72,interactive:false,structural:true,blocks:false,
  }),
  P('bay-apron-isolator','power_box_01',56.0,6.2,-Math.PI/2,{
    mount:'wall',elevation:1.08,interactive:false,structural:true,blocks:false,
  }),

  // ── The yard, in layers ──
  //
  // Logical, not physical. The yard is parked at logical y200 with a physical
  // origin out west (see loading_bay_yard), so a prop at physical (22,14) is
  // authored here at (72,214).
  //
  // THE ARRANGEMENT IS THE POINT, AND IT IS DEPTH. Everything below used to sit
  // five to fifteen metres off the dock, which put a booth, a skip, two bins and
  // a lamp column across the one view in the game and turned a landscape into a
  // yard sale. It reads as a tableau or it reads as clutter, and the difference
  // is entirely how far away things are:
  //
  //   the dock and its markings   0-12m    the only things in the near field
  //   the gate, booth and fence   28-32m   the boundary, and the last lit window
  //   the road and its columns    36-55m   the middle distance
  //   hills, town, horizon        beyond   drawn in the sky, not placed here
  //
  // Nothing goes in the first twenty-five metres except paint. Empty wet tarmac
  // is what makes the rest of it look far away.
  // BLOCKS MATTERS OUT HERE NOW. Every one of these was blocks:false on the
  // stated grounds that "nothing out here is reachable, and collision on the far
  // side of a kerb is just a trap waiting". That was true while the yard was a
  // view. The dock steps and the seam at the head of them make it a place, so
  // anything with a body gets one — otherwise the first thing the player learns
  // about the outside is that they can walk through a skip.
  //
  // yard-gate-piers is the deliberate exception: it is ONE prop spanning the
  // whole gate line, and pointInProp is a single box, so blocking it would seal
  // the opening the gate exists to be. The hedges and fences either side are
  // what actually bound the boundary.
  P('yard-markings','yard_markings',94.0,207.5,0,{interactive:false,structural:true}),
  // The floorplan owns both pedestrian flights; this is their visible steel,
  // paint and handrail construction. Anchor at physical (47.5,7.5), lifted
  // from the -0.85m yard floor to apron datum so its authored negative tread
  // heights sit exactly on the four collision risers.
  P('yard-dock-access','yard_dock_access',97.0,207.0,0,{
    elevation:.85,interactive:false,structural:true,blocks:false,
  }),
  P('yard-fence-west','yard_fence_run',70.0,210.0,0,{interactive:false,structural:true,blocks:true}),
  P('yard-fence-north','yard_fence_run',83.0,201.5,Math.PI/2,{interactive:false,structural:true,blocks:true}),
  // THE LODGE, which is the only thing in the game you talk to a person through.
  // `inspectAt` is the window rather than the middle of the building, so the
  // reticle and the walk-up both land where his face is.
  P('yard-booth','yard_booth',74.0,214.0,-Math.PI/2,{
    structural:true,blocks:true,action:'gate-lodge',label:'the lodge window',
    inspectAt:{x:75.7,y:214.0},
  }),
  P('yard-booth-interior','yard_booth_interior',74.0,214.0,-Math.PI/2,{interactive:false,structural:true}),
  P('yard-booth-practicals','yard_booth_practicals',74.0,214.0,-Math.PI/2,{interactive:false,structural:true,lightColor:[1,.76,.48],lightMaintained:true}),
  P('yard-booth-glazing','yard_booth_glazing',74.0,214.0,-Math.PI/2,{interactive:false,structural:true}),
  P('yard-booth-guard-idle','yard_booth_guard_idle',74.0,214.0,-Math.PI/2,{interactive:false,structural:true}),
  P('yard-booth-guard-ledger','yard_booth_guard_ledger',74.0,214.0,-Math.PI/2,{interactive:false,structural:true}),
  P('yard-booth-guard-handoff','yard_booth_guard_handoff',74.0,214.0,-Math.PI/2,{interactive:false,structural:true}),
  P('yard-booth-handoff','yard_booth_handoff',74.0,214.0,-Math.PI/2,{interactive:false,structural:true}),
  // ── THINGS TO READ ON THE WAY IN ────────────────────────────────────────
  //
  // The walk from the road to the grey door was sixty metres with exactly one
  // interaction in it, and everything the player could have learned about this
  // place before going in was in the guard's mouth. These are one line each and
  // none of them are on the route: they are what the outside knows.
  //
  // Every one of them is a thing that only exists out here. Nothing inside the
  // building tells you the pool has been dry for years, or that the demolition
  // date is a fortnight away, or that the site notice has the wrong company on it.
  P('yard-sign','yard_sign',70.5,213.5,Math.PI/2,{
    structural:true,label:'the site notice',inspectAt:{x:71.4,y:213.5},
    // IT USED TO SAY FOURTEEN DAYS, AND NOTHING ELSE IN THE GAME AGREED.
    //
    // The window slate, the closed work order and the vigil's own organiser all
    // give the same time — 06:00 on Thursday — and this sign was the only thing
    // on site still counting in fortnights. Ruth Mallory now says out loud that
    // the number stopped being changed in March, which turns the disagreement
    // from an error into the ordinary municipal fact it always was.
    inspect:inspect(
      'DEMOLITION NOTICE. Works commence 06:00 Thursday. The contractor is a name you have never heard of and the client is W. ELLERY HOLDINGS, which is the name on your work order.',
      'Six on Thursday. The board beside it still counts down in fourteens, and stopped being changed some time in March.',
    ),
  }),
  P('yard-lamp-column','yard_lamp_column',72.0,204.0,Math.PI,{interactive:false,structural:true,blocks:true}),
  P('yard-skip','yard_skip',81.0,226.0,.18,{
    structural:true,blocks:true,label:'the skip',inspectAt:{x:81.0,y:224.6},
    inspect:inspect(
      'A piano lid, snapped across the hinge. Hymn books, swollen to twice their thickness. A lane rope from a pool that has been dry longer than you have been doing this.',
      'The building, in the order somebody decided it could be thrown away.',
    ),
  }),
  P('yard-clutter','yard_clutter',86.0,203.0,-.34,{
    structural:true,blocks:true,label:'stacked chairs',inspectAt:{x:86.0,y:204.4},
    inspect:inspect(
      'Forty stacking chairs under a tarpaulin, banded and labelled for collection. Somebody catalogued these. Nobody came.',
      'Still banded. Still labelled. Still here.',
    ),
  }),

  // ── DEMOLITION PLANT ───────────────────────────────────────────────────
  //
  // The notice and the skip establish intent; the plant establishes scale.
  // All positions below are on the yard's physical plan, expressed through its
  // stable logical island (physical + 50,+200). Nothing enters the protected
  // van-to-grey-door sightline, and every scaffold stays tight to an actual
  // facade instead of becoming a freestanding obstacle course.
  ...[
    ['academic',48.0,22.0],
    ['school',48.0,61.0],
    ['baths',48.0,81.5],
  ].map(([name,x,y])=>P(`conservatoire-construction-scaffold-${name}`,'demolition_scaffold_run',50+x,200+y,Math.PI/2,{
    interactive:false,structural:true,blocks:true,
  })),
  P('conservatoire-construction-generator','demolition_generator',94.5,226.0,Math.PI/2,{
    interactive:false,structural:true,blocks:true,
  }),
  P('conservatoire-construction-light-tower','demolition_light_tower',94.4,212.8,0,{
    interactive:false,structural:true,blocks:true,
  }),
  P('conservatoire-construction-barrier','demolition_heras_fence',97.2,215.4,Math.PI/2,{
    interactive:false,structural:true,blocks:true,
  }),

  // St Brendan's remains usable from the inside, so the temporary fence is
  // interrupted at the west door and the south porch rather than simply drawn
  // around the footprint. Two scaffold lifts hug the north aisle; a third sits
  // beyond the east wall. The excavator works in the strip between cathedral
  // and conservatoire, never across either exit's landing.
  ...[
    ['nave-west',7.0,64.0,Math.PI/2],
    ['nave-east',7.0,78.0,Math.PI/2],
    ['east-end',16.0,86.2,0],
  ].map(([name,x,y,yaw])=>P(`cathedral-construction-scaffold-${name}`,'demolition_scaffold_run',50+x,200+y,yaw,{
    interactive:false,structural:true,blocks:true,
  })),
  ...[
    ['west-north',11.3,53.4,0],
    ['west-south',20.7,53.4,0],
    ['porch-west',26.0,67.0,Math.PI/2],
    ['porch-east',26.0,80.5,Math.PI/2],
  ].map(([name,x,y,yaw])=>P(`cathedral-construction-barrier-${name}`,'demolition_heras_fence',50+x,200+y,yaw,{
    interactive:false,structural:true,blocks:true,
  })),
  P('cathedral-construction-light-tower','demolition_light_tower',55.5,254.0,-.25,{
    interactive:false,structural:true,blocks:true,
  }),
  P('demolition-excavator-between-buildings','demolition_excavator',78.5,263.0,.08,{
    interactive:false,structural:true,blocks:true,
  }),
  P('yard-road','yard_road',58.0,207.5,0,{interactive:false,structural:true}),

  // ── THE VAN, WHICH IS WHERE HE STARTS ───────────────────────────────────
  //
  // He drove here. Everything in the bag came out of the back of this, and until
  // now the bag simply existed on his shoulder from the first frame. The doors
  // are open, the lamp is on, and the first [E] of the run is picking it up —
  // an interaction with nothing at stake, taught before anything is at stake.
  //
  // Parked at the near kerb a few metres UP the road, with its back doors
  // toward him — so the fade comes up on the road he walks and the open doors
  // are the first thing in it, rather than on the back of a man facing his own
  // bumper. Local +z is out of the doors, and the prop matrix takes local +z to
  // world (-sin yaw, cos yaw), so PI/2 points them due west, back down the road.
  P('yard-van','yard_van',66.0,208.0,Math.PI/2,{
    structural:true,blocks:true,action:'yard-van',label:'the back of the van',
    inspectAt:{x:63.6,y:208.0},
  }),
  P('yard-van-lamp','yard_van_lamp',65.6,208.0,0,{
    interactive:false,structural:true,elevation:2.30,
    lightMaintained:true,lightColor:[1,.86,.60],
  }),

  // A SECOND SHELTER, ON THE ROAD HE ARRIVES ON.
  //
  // The other one (city-bus-shelter) is a hundred and fifty metres away in the
  // district, which is the right place for it and no use here. This one exists
  // because of the long stare: standing still for three quarters of a minute is
  // the one thing the arrival was rebuilt to make possible, and there was
  // NOTHING out here telling anybody the yard was a place to stop. A shelter
  // says stand here and wait without a prompt, a notice or a line — which
  // matters, because the vigil's whole doctrine is that the reward is the
  // noticing (see game/yard-vigil.js).
  //
  // It does not gate anything. vigilEligible is still the whole of ZONE.dock
  // south of y=400; a player who stops three metres short of it is not punished
  // for standing in the wrong square. It only invites.
  //
  // Open side east, onto the road: yaw maps local +x to (cos yaw, sin yaw), so 0
  // faces the way he walks in from. Runtime cell (107,410) — clear for its
  // 2.9x5.0 footprint with sky over all of it.
  P('yard-bus-shelter','city_bus_shelter',53.5,205.0,0,{
    interactive:false,structural:true,blocks:true,label:'the shelter',
  }),
  // The shelter seat is its own addressable object. The first arrival guide
  // lights the bench itself after the kit is shouldered; interacting with it
  // holds the body still while leaving first-person look free for the vigil.
  P('yard-look-bench','yard_look_bench',52.5,205.0,0,{
    structural:true,blocks:false,action:'yard-vigil-bench',label:'the shelter bench',
    inspectAt:{x:53.25,y:205.0},interactionPriority:2,
    // The seated eye clears the van and composes the gate piers, lodge and the
    // accumulated Ellery roofline rather than staring squarely into a vehicle.
    seatYaw:Math.PI/2+.12,seatPitch:-.055,seatEyeDrop:.72,
  }),
  P('yard-bus-waiter','exterior_bus_woman',54.15,206.55,0,{
    structural:true,blocks:false,action:'exterior-lore',loreId:'yard-bus-waiter',
    label:'the woman at the shelter',inspectAt:{x:54.15,y:206.15},interactionPriority:3,
  }),

  // ── THE CIVIC BLOCK ─────────────────────────────────────────────────────
  //
  // These are not cards beyond the plan. Their anchors stand on the four real
  // pavements authored by exterior_civic_block; the solid lots behind the
  // facades are collision, and the player can walk the complete wet perimeter.
  // Repeating three distinct sixty-four-metre rows gives every side independent
  // roof heights and uses without pretending every closed door is an interior.
  DP('district-west-row-a','district_passage_frontage',-14,20,0,{interactive:false,structural:true,renderOffsetX:-1.05}),
  DP('district-west-row-b','district_workshop_frontage',-14,82,0,{interactive:false,structural:true,renderOffsetX:-1.05}),
  DP('district-east-row-a','district_passage_frontage',142,20,Math.PI,{interactive:false,structural:true,renderOffsetX:1.05}),
  DP('district-east-row-b','district_workshop_frontage',142,82,Math.PI,{interactive:false,structural:true,renderOffsetX:1.05}),
  DP('district-north-row-a','district_terrace_frontage',18,-14,Math.PI/2,{interactive:false,structural:true,renderOffsetZ:-1.05}),
  DP('district-north-row-b','district_passage_frontage',82,-14,Math.PI/2,{interactive:false,structural:true,renderOffsetZ:-1.05}),
  DP('district-north-row-c','district_terrace_frontage',138,-14,Math.PI/2,{interactive:false,structural:true,renderOffsetZ:-1.05}),
  DP('district-south-row-a','district_civic_frontage',18,106,-Math.PI/2,{interactive:false,structural:true,renderOffsetZ:1.05}),
  DP('district-south-row-b','district_passage_frontage',82,106,-Math.PI/2,{interactive:false,structural:true,renderOffsetZ:1.05}),
  DP('district-south-row-c','district_workshop_frontage',138,106,-Math.PI/2,{interactive:false,structural:true,renderOffsetZ:1.05}),
  // The playable courts end at real closed thresholds, while the roofscape and
  // streets keep travelling beyond every side as depth-tested scenery.
  DP('district-north-court-walls','district_court_walls',78,-15,Math.PI,{interactive:false,structural:true,scaleZ:13/16}),
  DP('district-south-court-walls','district_court_walls',86,107,0,{interactive:false,structural:true,scaleZ:16/16}),
  DP('district-west-court-walls','district_court_walls',-15,24,Math.PI/2,{interactive:false,structural:true,scaleZ:15/16}),
  DP('district-east-court-walls','district_court_walls',143,16,-Math.PI/2,{interactive:false,structural:true,scaleZ:20/16}),
  DP('district-outer-sprawl','district_outer_sprawl',-7,-7,0,{interactive:false,structural:true}),
  DP('district-south-post-box','district_post_box',8,105,0,{interactive:false,structural:true}),
  DP('district-north-bench','district_bench',56,-13,Math.PI/2,{interactive:false,structural:true}),
  DP('district-west-bench','district_bench',-13,66,0,{interactive:false,structural:true}),
  DP('district-west-mews-bins','district_bin_cluster',-27,22,Math.PI/2,{interactive:false,structural:true}),
  DP('district-east-workshop-bins','district_bin_cluster',159,14,-Math.PI/2,{interactive:false,structural:true}),
  DP('district-south-yard-bins','district_bin_cluster',88,120,Math.PI,{interactive:false,structural:true}),
  DP('district-west-court-bollards','district_bollard_pair',-16,24,Math.PI/2,{interactive:false,structural:true}),
  DP('district-east-court-bollards','district_bollard_pair',144,16,Math.PI/2,{interactive:false,structural:true}),
  DP('district-north-court-bollards','district_bollard_pair',78,-16,0,{interactive:false,structural:true}),
  DP('district-south-court-bollards','district_bollard_pair',86,108,0,{interactive:false,structural:true}),
  DP('city-bus-shelter','city_bus_shelter',-11,16,0,{structural:true,blocks:true,label:'the bus shelter'}),
  DP('city-bus-shelter-bench','yard_look_bench',-12,16,0,{interactive:false,structural:true,blocks:false}),
  // Ordinary locals stay put so they remain genuinely talkable. Moving traffic
  // and passers-by remain presentation-only ambient instances.
  DP('district-mews-neighbor','exterior_mews_neighbor',-13,26,Math.PI/2,{
    structural:true,blocks:false,action:'exterior-lore',loreId:'district-mews-neighbor',
    label:'the man under the awning',interactionPriority:3,
  }),
  DP('district-pub-driver','exterior_pub_driver',18,105,Math.PI,{
    structural:true,blocks:false,action:'exterior-lore',loreId:'district-pub-driver',
    label:'the driver by the pub yard',interactionPriority:3,
  }),
  ...[
    ['north-car-west',15,-5,Math.PI/2],['north-car-mid',42,-5,Math.PI/2],['north-car-east',110,-5,Math.PI/2],
    ['south-car-west',42,97,Math.PI/2],['south-car-east',116,97,Math.PI/2],
    ['west-car-north',-5,43,0],['west-car-south',-5,75,0],
    ['east-car-north',132,46,0],['east-car-south',132,84,0],
  ].map(([id,x,y,yaw])=>DP(`district-${id}`,'city_parked_car',x,y,yaw,{interactive:false,structural:true,blocks:true})),

  // Four short readings make the lineage physically inspectable. They do not
  // explain the plot; each is a date and the construction standing around it.
  ...EXTERIOR_INSPECTABLES.map((entry)=>DP(entry.id,'exterior_story_plaque',entry.physical.x,entry.physical.y,0,{
    structural:true,blocks:false,label:entry.label,elevation:.52,
    inspect:inspect(entry.text,entry.text),
  })),

  // The yard is no longer a single runway. Low dependent buildings occupy its
  // north side and divide the walk into lodge, rehearsal and dock courts while
  // leaving the original east-west arrival spine completely clear.
  ...YARD_SERVICE_RANGES.map((range)=>P(range.id,{
    'yard-former-stables':'yard_stable_range',
    'yard-rehearsal-annex':'yard_rehearsal_range',
    'yard-baths-plant':'yard_baths_plant',
    'yard-covered-stores':'yard_covered_stores',
  }[range.id],50+range.physical.x,200+range.physical.y,0,{
    structural:true,blocks:true,label:range.use,
    inspect:inspect(
      `${range.use.replace(/^./,(c)=>c.toUpperCase())}. The ${range.year} work is still legible under every later patch.`,
      `The ${range.year} range still gives the larger building its scale.`,
    ),
  })),

  // ST BRENDAN'S, on the tarmac past the park. Its logical anchor belongs to
  // the cathedral component; CPG(16,70.5) still resolves to the same physical
  // centre the mesh was authored around. Keeping the hero off the sealed yard
  // underlay prevents prop initialisation from discarding it as embedded.
  P('brendan-church','st_brendan_church',CPG(16,70.5).x,CPG(16,70.5).y,0,{
    structural:true,blocks:false,label:'St Brendan\u2019s Cathedral',renderGroups:['ground','cathedral'],
    inspect:inspect(
      'St Brendan\u2019s Cathedral. Rubble stone, slate, a crossing tower and a west door with no exterior handle. Older than the conservatoire and outliving it.',
      'St Brendan\u2019s Cathedral. Intact, disused, and shut from this side.',
    ),
  }),
  ...[62.3,65.2,68.1].flatMap((y,i)=>[
    P(`brendan-pew-n-${i+1}`,'pew',CPG(13.6,y).x,CPG(13.6,y).y,0,{renderGroups:['ground'],inspect:inspect('A short oak pew. The aisle end is dark with old hands; the rest has gone grey with dust.','Dust in the mouldings. No service sheet.')}),
    P(`brendan-pew-s-${i+1}`,'pew',CPG(18.4,y).x,CPG(18.4,y).y,0,{renderGroups:['ground'],inspect:inspect('The matching pew has a warped kneeler and a numbered brass plate.','A number for a congregation that is not here.')}),
  ]),
  ...[78.0,80.3].flatMap((y,i)=>[
    P(`brendan-choir-stall-n-${i+1}`,'pew',CPG(13.0,y).x,CPG(13.0,y).y,Math.PI/2,{scale:.72,renderGroups:['ground'],inspect:inspect('Choir stalls under misericords blackened by age.','The seat lifts. The carving underneath is worn smooth.')}),
    P(`brendan-choir-stall-s-${i+1}`,'pew',CPG(19.0,y).x,CPG(19.0,y).y,Math.PI/2,{scale:.72,renderGroups:['ground'],inspect:inspect('Choir stalls facing the empty centre line.','No books. No cushions. No recent dust broken.')}),
  ]),
  P('brendan-pulpitum','cathedral_pulpitum',CPG(16,76.05).x,CPG(16,76.05).y,0,{structural:true,blocks:false,renderGroups:['ground'],inspect:inspect('An open stone pulpitum. Two flights of pierced tracery leave the centre passage clear.','A screen that divides without sealing.')}),
  P('brendan-font','cathedral_font',CPG(16,59.2).x,CPG(16,59.2).y,0,{renderGroups:['ground'],inspect:inspect('A battered octagonal font. The bowl is dry except for plaster grit.','Stone dust in the bowl.')}),
  P('brendan-lectern','lectern',CPG(14.5,77.2).x,CPG(14.5,77.2).y,.12,{renderGroups:['ground'],inspect:inspect('A brass lectern gone green at the joints. The service book is gone.','The ribbon remains, marking air.')}),
  P('brendan-altar','altar_table',CPG(16,82.5).x,CPG(16,82.5).y,0,{elevation:.25,renderGroups:['ground'],inspect:inspect('The altar stands one step above the choir. Linen and vessels were removed carefully.','Bare stone and four pale footmarks.')}),
  P('brendan-side-monument','cathedral_monument',CPG(9.7,79).x,CPG(9.7,79).y,Math.PI/2,{structural:true,blocks:false,renderGroups:['ground'],inspect:inspect('A wall monument with its face and dates abraded before the cathedral closed.','The name was removed deliberately.')}),
  P('brendan-sacristy-tomb','cathedral_tomb',CPG(22,79).x,CPG(22,79).y,0,{renderGroups:['ground'],inspect:inspect('A chest tomb pressed into the sacristy wall. Bird lime has found it even here.','A stone sleeper under dust and feathers.')}),
  P('brendan-organ-case','tower_organ_case',CPL(16,58.2).x,CPL(16,58.2).y,Math.PI,{structural:true,blocks:true,renderGroups:['cathedral']}),
  P('brendan-organ-console','organ_console',CPL(16,60).x,CPL(16,60).y,0,{renderGroups:['cathedral'],...play('lux_nova','A small loft organ. The blower cable has been cut back to the wall and every stop is in.','No power. No wind.')}),
  P('brendan-visitor-desk','box_office_desk',CPG(21.45,72).x,CPG(21.45,72).y,Math.PI/2,{renderGroups:['ground'],inspect:inspect('A visitor desk abandoned under dust. Its shallow drawers contain rubber bands, a pencil worn to the ferrule, and no money.','The visitor desk keeps the shape of its last closing.')}),
  P('brendan-visitor-guidebooks','program_stack',CPG(21.45,72).x,CPG(21.45,72).y,Math.PI/2,{on:'brendan-visitor-desk',renderGroups:['ground'],inspect:inspect("Guidebooks to St Brendan's, their tower diagram printed before the bell frame acquired this much dust.",'The same crossing, reduced to a clean black plan.')}),
  P('brendan-visitor-till','cash_terminal',CPG(21.45,72.35).x,CPG(21.45,72.35).y,Math.PI/2,{on:'brendan-visitor-desk',renderGroups:['ground'],inspect:inspect('A dead donation till. The paper roll reads THANK YOU FOR HELPING US KEEP THE BELLS SOUNDING.','No power. The last receipt remains uncut.')}),
  P('brendan-visitor-postcards','notice_board',CPG(22.45,74.35).x,CPG(22.45,74.35).y,Math.PI,{mount:'wall',elevation:1.15,renderGroups:['ground'],inspect:inspect('Postcards fade in a wire display: west front, crossing tower, six bells, cold glass.','Every card shows an entrance. None shows this way out.')}),

  // ── The boundary, which stands BETWEEN you and the man in the booth ──
  //
  // The booth is at logical x74, about twenty-two metres off the dock face, and
  // until now there was nothing at all between it and the apron — you looked
  // straight across empty tarmac at a lit window. The gate line goes in front of
  // it at x77.5, so the read from the bay is: twenty metres of wet nothing, then
  // a boundary, then the last lit window in the building behind it.
  //
  // It is deliberately not more chain-link. This is the back gate of a British
  // conservatory of music: brick piers, stone caps, iron gates standing open,
  // railings running out to meet the yard's fencing, and a laurel hedge nobody
  // has cut in thirty years. The near field stays empty — that is still what
  // makes the distance read (see the depth bands above).
  // THE OPENING GOES ON THE ROAD'S CENTRELINE, NOT THE BOOTH'S. The bay mouth
  // looks west along physical y7.5, which is also where yard-road runs — so the
  // drive, the gate and the one sightline out of the building are the same line.
  // Putting the gate on the booth's axis instead (y14) walled the mouth off with
  // hedge, which is the only genuinely unforgivable thing you can do out here.
  // The booth stays north of the opening, so you see it PAST the ironwork.
  P('yard-gate-piers','yard_gate_piers',77.5,207.5,0,{interactive:false,structural:true}),
  P('yard-hedge-near','yard_hedge_run',78.4,216.0,0,{interactive:false,structural:true,blocks:true}),
  P('yard-hedge-far','yard_hedge_corner',78.4,227.0,0,{fallbackMesh:VEGETATION_FALLBACKS.yard_hedge_corner,interactive:false,structural:true,blocks:true}),
  P('yard-hedge-near-nettles','vegetation_nettle_cluster',77.75,219.4,.18,{interactive:false,structural:true,blocks:false}),
  P('yard-hedge-far-weeds','vegetation_weed_cluster',79.05,224.4,-.52,{interactive:false,structural:true,blocks:false}),
  P('yard-hedge-fall','vegetation_leaf_scatter',78.0,230.2,.08,{interactive:false,structural:true,blocks:false}),

  // THE SECOND YARD USED TO BE HERE, AND IT WAS STILL BEING DRAWN.
  //
  // The block above replaced an earlier arrangement that stood everything five
  // to fifteen metres off the dock — but the earlier one was never deleted, and
  // propsInit maps placements straight to instances with no dedup. So the yard
  // had TWO booths, two lamp columns, two skips, two signs, two fence runs and
  // two clutter piles, at two different distances, plus a second bay canopy
  // drawn exactly on top of the first. propById() returned the far one and the
  // renderer drew both, which is a very quiet way to be wrong.
  //
  // The near copy is why the gate read as being right on top of the yard: its
  // booth sat at physical x40, about six metres off the dock face, in front of
  // the far one it was supposed to have replaced. Removed 2026-08-05.

  P('bay-west-elevation','conservatory_west_elevation',50.0,7.5,0,{interactive:false,structural:true}),
  // THE OTHER LIT WINDOW.
  //
  // Its own prop rather than a pane inside the elevation, because emissive is a
  // per-INSTANCE attribute in the mesh pass (see propEmissive in main.js) — a
  // single lit opening cannot be authored inside a mesh that is otherwise dark.
  //
  // It is on the academic stair, four floors up, and it is the second light on
  // the site after the lodge. There is no mains in this building; the guard says
  // as much. Whatever that is, it is not on the schedule, and a player who
  // notices it before going in has been told something.
  //
  // Anchored on the elevation's own cell and pushed north with renderOffsetZ,
  // because a prop's centre has to land in open floorplan space (see
  // test/conservatory-space-layout) and the wall it is set into is rock. Same
  // dodge the elevation mesh itself uses to be ninety metres long from a
  // one-metre anchor.
  P('bay-stair-window','conservatory_stair_window',50.0,7.5,0,{
    interactive:false,structural:true,elevation:11.30,
    renderOffsetX:-0.10,renderOffsetZ:17.5,
    lightMaintained:true,lightColor:[.86,.80,.62],
  }),

  // ── Loading dock: LAST LOAD-OUT ──────────────────────────────────────────
  // The room has a three-metre freight spine at x64–66. Everything lives at
  // the perimeter so the setup is dense without becoming a prop maze.
  P('dock-level-check-box','tower_rope_mat',65.0,10.0,0,{interactive:false,blocks:false,scale:1.45,elevation:.018}),
  P('dock-sign-studios-plant','scene_dock_sign_services',62.4,14.55,0,{
    mount:'wall',elevation:2.42,interactive:false,structural:true,blocks:false,
  }),
  P('dock-desk-1','school_desk',60.0,6.0,.15,{
    label:'signing desk',inspectAt:{x:59.6,y:7.0},dockInvestigation:true,
    inspect:inspect('A school desk doing the job of a dispatch station. Somebody meant to come back to it.','The little desk is still waiting for the rest of its shift.'),
  }),
  // Measured rather than typed: it was at .83 against a school desk whose work
  // surface is .72, so the clipboard was sunk a hand's width INTO the desk.
  P('dock-work-order-clipboard','loose_note',60.2,6.05,.12,{
    label:'unfinished clipboard',on:'dock-desk-1',blocks:false,inspectAt:{x:60.55,y:7.0},dockInvestigation:true,
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
  P('dock-hand-truck','equipment_cart',70.8,5.35,Math.PI/2,{
    label:'strapped hand truck',scale:.72,inspectAt:{x:70.1,y:5.5},dockInvestigation:true,
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
    ...play(DOCK_SHUTTER,'A steel bar runs shoulder-high across the loading shutter. Put a knuckle to it and the whole wall rings.','Put a hand on it and the room goes quiet.'),
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
  P('foyer-pew-1','pew',83.0,5.5,0,{inspect:inspect('One chapel pew never made it upstairs. A paper removal tag is still tied to it.','The tag says RETURN TO CHAPEL.')}),
  P('foyer-cart-1','equipment_cart',95.2,15.4,Math.PI/2,{inspect:inspect('A percussion cart with one wheel wired straight.','It will only travel in a circle.')}),
  P('foyer-portrait-titian','portrait_frame',80.5,4.0,0,{elevation:1.35,portraitIndex:0,inspect:inspect('Titian. Portrait of a Man. A Met Open Access reproduction in an inexpensive gilt frame.','The sitter keeps looking past the entrance.')}),
  P('foyer-portrait-greco','portrait_frame',84.0,4.0,0,{elevation:1.35,portraitIndex:1,inspect:inspect('El Greco. Portrait of an Old Man. Someone has polished the glass more often than the frame.','His eyes catch the corridor light first.')}),
  P('atrium-sign-main-exit','public_exit_sign',77.5,4.0,0,{
    elevation:.7,renderOffsetZ:-.25,
    inspect:inspect('PUBLIC ENTRANCE. The glazed pair is chained under the closure order; the service entrance is around the block.','PUBLIC ENTRANCE — CLOSED.'),
  }),
  P('atrium-light-main-exit','tower_bulkhead',77.5,4.0,0,{
    elevation:1.62,renderOffsetZ:-.25,interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.64,.34],
  }),
  // The public pair is architecture, not a route. Its closure has to be visible
  // before the player is close enough to receive a locked-door prompt: chains,
  // crossed paper bands and the mat inside the glass all occupy one silent,
  // non-blocking assembly centred on the complete two-leaf threshold.
  P('atrium-entry-closure','atrium_entry_closure',78.75,3.25,0,{
    renderOffsetX:-.25,renderOffsetZ:-.25,interactive:false,blocks:false,structural:true,
  }),
  P('box-office-counter','ticket_counter',90.55,9.35,Math.PI/2,{scale:.75,inspect:inspect('The ticket counter was built to keep a queue outside and cash inside. The grille is still locked down.','Nothing has been sold here for years.')}),
  P('box-office-desk','box_office_desk',93.55,9.2,0,{inspect:inspect('The staff desk is squared to the ticket window. A blotter has been pressed flat by damp.','Front of house, stopped mid-week.')}),
  P('box-office-chair','chair',93.55,10.05,0,{inspect:inspect('A staff chair tucked under the ticket desk, not abandoned in the queue path.','Its casters have made a small grey ring.')}),
  P('box-office-program-stack','program_stack',90.55,8.92,Math.PI/2,{on:'box-office-counter',inspect:inspect('A stack of folded programmes for a season that never opened.','The top programme has curled at both corners.')}),
  P('box-office-cash-terminal','cash_terminal',90.55,9.72,Math.PI/2,{on:'box-office-counter',inspect:inspect('A dead card terminal beside a cash drawer. The receipt paper is still threaded.','No signal. No float.')}),
  P('box-office-ledger','rekey_ledger',92.25,12.25,Math.PI,{mount:'wall',elevation:1.1,interaction:'action',action:'rekey-ledger',inspect:inspect('A rekey ledger: REPLACEMENT LOCK — CHAPEL — CABINET C-17.','CHAPEL. REPLACEMENT LOCK. C-17.')}),
  P('box-office-key-cabinet','chapel_key_cabinet',96.25,9.45,Math.PI/2,{
    mount:'wall',elevation:1.0,blocks:false,interactive:false,structural:true,
  }),
  P('box-office-key-ring-ch04','chapel_key_ring_ch04',96.25,9.45,Math.PI/2,{
    mount:'wall',renderOffsetZ:-.24,elevation:1.62,blocks:false,interaction:'action',action:'chapel-key-ring',keyTag:'CH-04',label:'CH-04 key ring',
  }),
  P('box-office-key-ring-c17','chapel_key_ring_c17',96.25,9.45,Math.PI/2,{
    mount:'wall',renderOffsetZ:.24,elevation:1.62,blocks:false,interaction:'action',action:'chapel-key-ring',keyTag:'C-17',label:'C-17 key ring',
  }),
  P('box-office-key-ring-fohm','chapel_key_ring_fohm',96.25,9.45,Math.PI/2,{
    mount:'wall',renderOffsetZ:-.24,elevation:1.15,blocks:false,interaction:'action',action:'chapel-key-ring',keyTag:'FOH-M',label:'FOH-M key ring',
  }),
  P('box-office-shelf','equipment_rack',95.1,11.3,0,{scale:.82,inspect:inspect('Programmes, float envelopes, and ticket stock boxed by week.','The labels are more orderly than the room.')}),
  P('box-office-notice-board','notice_board',96.2,7.65,Math.PI/2,{mount:'wall',elevation:1.15,inspect:inspect('A notice board with staffing rotas, emergency contacts, and one hand-written refund policy.','The refund policy is underlined twice.')}),
  ...[[88.9,8.25],[88.9,10.45],[89.9,8.25],[89.9,10.45]].map(([x,y],i)=>
    P(`box-office-queue-${i+1}`,'queue_stanchion',x,y,0,{inspect:inspect('A brass queue post with its rope still clipped in.','The rope sags towards the ticket window.')})),

  // Public-room fabric stays on the perimeter. It gives the atrium a civic use
  // and a closing-day history without filling the ruined garden or narrowing
  // the broad route from public entrance to concert-hall portal.
  P('atrium-public-bench-west','pew',75.8,9.7,Math.PI/2,{
    inspect:inspect('A municipal waiting bench beneath the directory. Its varnish is worn at regular shoulder-width intervals.','People waited here facing the ticket window.'),
  }),
  P('atrium-public-directory','notice_board',74.75,8.1,-Math.PI/2,{mount:'wall',elevation:1.3,
    inspect:inspect('PUBLIC ROOMS: HALL, BATHS, CHAPEL, PRACTICE WING. Several arrows have been amended in three different hands.','The building kept changing after the sign was made.'),
  }),
  P('atrium-closing-notice','notice_board',96.25,18.0,Math.PI/2,{mount:'wall',elevation:1.25,
    inspect:inspect('A glazed closure notice lists refunds, archive access, and a final public meeting that was cancelled.','The cancellation is the newest paper in the case.'),
  }),
  P('atrium-umbrella-bin','wastebasket',80.3,4.45,0,{interactive:false}),

  // Formal decay occupies the volume, not the promenade. The paired banners
  // hang above the two public-room ensembles; the long-drop lanterns give the
  // seventeen-metre garden void a middle register without claiming one floor
  // cell; and the rug makes the surviving waiting suite read as one purchase.
  P('atrium-banner-west','atrium_formal_banner',74.75,18.8,-Math.PI/2,{
    mount:'wall',elevation:4.25,interactive:false,blocks:false,structural:true,
  }),
  P('atrium-banner-east','atrium_formal_banner',96.25,18.3,Math.PI/2,{
    mount:'wall',elevation:4.35,scaleY:.90,interactive:false,blocks:false,structural:true,
  }),
  P('atrium-lantern-north','atrium_suspended_lantern',83.6,10.2,.08,{
    interactive:false,blocks:false,structural:true,
  }),
  P('atrium-lantern-south','atrium_suspended_lantern',83.6,18.7,-.12,{
    interactive:false,blocks:false,structural:true,
  }),
  P('atrium-waiting-rug','atrium_waiting_rug',77.2,19.0,0,{
    interactive:false,blocks:false,structural:true,
  }),

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
  P('atrium-public-fittings','atrium_public_fittings',85.5,15,0,{
    renderGroups:['ground','academic'],interactive:false,structural:true,
  }),
  // The hall begins before its leaves. A deep oak-and-stone portal, a worn
  // runner, programme cases and two maintained lamps make the destination read
  // from the atrium instead of materialising at arm's length. It is shared by
  // both render groups because the threshold is literally where they meet.
  P('hall-entrance-portal','hall_entrance_portal',98.5,25.5,Math.PI/2,{
    renderGroups:['ground','hall'],interactive:false,structural:true,
  }),
  P('hall-entrance-sign','hall_entrance_sign',98.5,25.5,Math.PI/2,{
    mount:'portal',elevation:3.08,renderOffsetX:-.22,renderGroups:['ground','hall'],inspectAt:{x:96.4,y:25.5},
    lightMaintained:true,lightColor:[1,.58,.22],
    inspect:inspect('CONCERT HALL — STALLS / GALLERIES. The gilt house lettering survives above the acoustic pair.','CONCERT HALL.'),
  }),
  P('hall-entrance-program-north','notice_board',98.5,25.5,Math.PI/2,{
    mount:'portal',elevation:1.22,renderOffsetX:-.20,renderOffsetZ:-1.55,renderGroups:['ground','hall'],inspectAt:{x:96.5,y:24.0},
    inspect:inspect('A glazed programme case: winter concerts, municipal orchestras, school prize nights. The last season is crossed through in red pencil.','The last season never opened.'),
  }),
  P('hall-entrance-program-south','notice_board',98.5,25.5,Math.PI/2,{
    mount:'portal',elevation:1.22,renderOffsetX:-.20,renderOffsetZ:1.55,renderGroups:['ground','hall'],interactive:false,
  }),
  ...[-1.42,1.42].map((offset,index)=>P(`hall-entrance-light-${index+1}`,'hall_entry_sconce',98.5,25.5,Math.PI/2,{
    mount:'portal',elevation:2.18,renderOffsetX:-.26,renderOffsetZ:offset,renderGroups:['ground','hall'],interactive:false,structural:true,
    lightMaintained:true,lightColor:[1,.018,.008],
  })),
  // The one piece of the ruined garden you may put a hand in. Everything else
  // here is deliberately mute; this planter is where a patch lead has been
  // sitting in the soil since somebody worked on a head out here (see PIN_HOSTS).
  P('academic-garden-planter-west','academic_planter',80.5,11.0,.08,{renderGroups:['ground','academic'],
    inspect:inspect('Dry soil in a stone planter, packed hard and full of old leaf. Something black is coiled half down in it.','The soil keeps the shape your hand left in it.')}),
  P('academic-garden-planter-east','academic_planter',86.7,17.6,-.08,{renderGroups:['ground','academic'],interactive:false}),
  P('academic-garden-basin','academic_dry_basin',83.6,14.6,0,{renderGroups:['ground','academic'],interactive:false}),
  P('academic-garden-tree-west','academic_dead_tree',80.4,11.0,-.18,{renderGroups:['ground','academic'],interactive:false,elevation:.66}),
  P('academic-garden-tree-east','academic_dead_tree_b',86.8,17.6,.28,{fallbackMesh:VEGETATION_FALLBACKS.academic_dead_tree_b,renderGroups:['ground','academic'],interactive:false,elevation:.66,scale:.82}),
  P('academic-garden-leaves-north','academic_leaf_litter',83.0,9.0,.22,{renderGroups:['ground','academic'],interactive:false}),
  P('academic-garden-leaves-south','academic_leaf_litter',84.8,19.1,-.18,{renderGroups:['ground','academic'],interactive:false}),
  P('academic-light-emergency-west','tower_bulkhead',28.5,248.0,Math.PI/2,{
    elevation:1.62,renderOffsetX:.25,renderGroups:['ground','academic'],interactive:false,structural:true,
    lightCircuit:'sp05',lightColor:[1,.018,.008],
  }),
  P('academic-light-emergency-east-failing','tower_bulkhead',46.5,263.0,Math.PI/2,{
    elevation:1.62,renderOffsetX:.25,renderGroups:['ground','academic'],interactive:false,structural:true,
    lightCircuit:'sp05',lightColor:[1,.018,.008],
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

  // ── THE VOCAL FLOOR ───────────────────────────────────────────────────────
  //
  // This was one flatMap over eight identical rooms: seven desks in a 3x2 grid,
  // a board 1.3m off a wall, and `room%2` deciding piano or cabinet. The
  // comment above it admitted the problem — "visually distinct only through
  // mundane arrangements" — and through wired glass, at torchlight, they were
  // not distinct at all.
  //
  // Now each room is dressed as the thing it is. The four uprights were always
  // here; they are studio pianos and they get studios.

  // FOUR VOCAL STUDIOS, west side. A studio is a piano, a bench, and room for
  // two people to stand. Nothing is arranged for an audience because there
  // isn't one.
  ...[
    ['1',250.5],['2',255.5],['3',260.5],['4',264.5],
  ].flatMap(([n,y],i)=>[
    P(`academic-studio-${n}-piano`,'upright_piano',1.9,y+.6,Math.PI/2,{interactive:false}),
    P(`academic-studio-${n}-bench`,'piano_bench',3.1,y+.6,Math.PI/2,{interactive:false}),
    // The singer stands; the chair is for whoever is listening. One of the four
    // has two, because somebody brought a second one in and left it.
    P(`academic-studio-${n}-chair-1`,'chair',4.6,y+1.4,-Math.PI/2+.12*(i-1),{interactive:false}),
    ...(i===2?[P(`academic-studio-${n}-chair-2`,'chair',3.4,y+1.0,-Math.PI/2+.4,{interactive:false})]:[]),
  ]),

  // THE THEORY ROOM. Every desk on the floor is in here, in rows, facing one
  // board — which is what a theory room is and what eight rooms of seven desks
  // never was. It bends around the service chase, so no two of its walls are
  // the same length.
  ...[0,1,2,3].flatMap((row)=>[0,1,2,3].map((col)=>
    P(`academic-theory-desk-${row*4+col+1}`,'school_desk',14.4+col*2.0,253.6+row*1.1,Math.PI,{interactive:false}))),
  P('academic-theory-board','academic_blackboard',20.7,255.0,-Math.PI/2,{interactive:false,mount:'wall',elevation:1.0}),
  P('academic-theory-table','school_desk',20.2,252.4,Math.PI,{interactive:false,scale:1.15}),
  P('academic-theory-piano','upright_piano',15.2,250.9,-Math.PI/2,{interactive:false}),

  // THE STORE. Three metres deep and full — the filing that used to be spread
  // one cabinet per classroom, which is where filing actually lives.
  ...[0,1,2,3].map((i)=>
    P(`academic-store-files-${i+1}`,'academic_filing_bank',13.2+i*2.4,259.7,0,{interactive:false})),
  P('academic-store-desk-1','school_desk',19.4,260.9,.28,{interactive:false}),
  P('academic-store-desk-2','school_desk',19.7,260.6,-.19,{interactive:false,scale:.98}),

  // THE ROOM THE BREACH OPENS INTO. You can walk in here, and what is in it is
  // the furniture that came out of everywhere else — stacked against a wall by
  // somebody who was clearing the floor and stopped.
  ...[0,1,2,3,4].map((i)=>
    P(`academic-cleared-desk-${i+1}`,'school_desk',13.4+i*1.9,264.4,Math.PI/2+.06*(i%3-1),{interactive:false})),
  P('academic-cleared-chair-1','chair',19.6,265.4,-.6,{interactive:false}),
  P('academic-cleared-files','academic_filing_bank',20.4,263.9,Math.PI/2,{interactive:false}),

  // THE CHAMBER ROOM. The corridor's head, and the one room up here you stand
  // in. Chairs in a shallow curve toward the piano, the way a room is left after
  // a chamber recital and before anybody comes to stack them.
  P('academic-chamber-piano','upright_piano',3.0,244.4,Math.PI/2,{interactive:false}),
  P('academic-chamber-bench','piano_bench',4.3,244.4,Math.PI/2,{interactive:false}),
  ...[0,1,2,3,4,5,6,7].map((i)=>{
    const arc=(i-3.5)*.34;
    // The room is eight metres deep, so the curve has to stay inside it — a
    // wider arc puts the end chairs through the north and south walls.
    return P(`academic-chamber-chair-${i+1}`,'chair',8.2+Math.abs(arc)*1.7,244.4+arc*1.8,-Math.PI/2+arc*.5,
      {interactive:false});
  }),
  // FRESCOS. The gallery's frieze panels, at vault height, in the only other
  // room with the height to carry them — see academicProfile.
  ...[4.5,9.7,14.9].map((x,i)=>
    P(`academic-chamber-fresco-north-${i+1}`,'academic_frieze',x,241.2,0,{interactive:false,mount:'wall',elevation:3.4})),
  // The south wall carries two, not three: the corridor's mouth is three metres
  // of missing wall in the middle of it, so the panels flank the opening rather
  // than spanning a hole. The run being interrupted is the point — it is where
  // you came in.
  ...[4.0,14.5].map((x,i)=>
    P(`academic-chamber-fresco-south-${i+1}`,'academic_frieze',x,248.0,Math.PI,{interactive:false,mount:'wall',elevation:3.4})),

  P('academic-reception-files','academic_filing_bank',12.0,273.0,Math.PI/2,{interactive:false}),
  P('academic-stripped-office-desk','school_desk',16.0,273.0,Math.PI/2,{interactive:false,scale:1.2}),
  P('academic-stripped-office-cabinet','academic_filing_bank',18.2,276.0,0,{interactive:false}),
  P('academic-breach','academic_breach',17.5,267.7,0,{interactive:false,structural:true}),

  // ── THE SUB-BASEMENT DANCE WING ───────────────────────────────────────────
  //
  // Four studios off one low corridor, numbered from the stair inward: B1, B2,
  // B3, and B5 across the passage. There is no B4 — the plant room is standing
  // in it, which is also why the B3/B2 connecting door leads nowhere useful now.
  //
  // Wall furniture (barres, mirrors, stencils) is authored ON the interior cell
  // that touches its wall, with yaw pointing INTO the room, so the masonry sits
  // behind it: yaw 0 backs onto -y, PI onto +y, PI/2 onto -x, -PI/2 onto +x.
  //
  // MIND THE CONVERTER. Props resolve with round(metres * PLAN_SCALE) — NOT the
  // metres*2+1 that FP.toRuntimePoint uses — so an authored metre lands on the
  // FIRST half of an authored cell and a half-metre lands on the second. Against
  // a wall that means: north/west furniture sits on (edge row + 1), south/east on
  // (edge row + 1.5). Get it the wrong way round and the prop is inside the wall,
  // where propsInit silently drops it and the room is simply empty.
  //
  // Studio B3: a dance studio with a take on it. The kit is the intrusion here,
  // not the barre — somebody moved a rack into a room that still has its rail up.
  P('b3-desk-1','school_desk',8.0,8.0,Math.PI/2,{inspect:inspect('A desk pushed into the dead corner, its writing surface stippled with old tape marks.','Nothing is written on it now.')}),
  P('b3-desk-2','school_desk',8.0,9.0,Math.PI/2,{inspect:inspect('Another desk nested behind the first. Surplus becomes acoustic treatment if nobody moves it.','Two desks, making one bad absorber.')}),
  P('b3-rack-1','equipment_rack',23.0,16.5,Math.PI/2,{inspect:inspect('The rack is powered down. Three channels are still labelled in pencil.','No mains. No pilot lights.')}),
  P('b3-speaker-1','speaker_cabinet',22.7,8.0,Math.PI/2,{...play(PIANO,'A nearfield monitor with its cone pushed in and pulled back out.','The cone remembers a thumb.')}),
  P('b3-mirror-north-a','dance_mirror',10.0,6.0,0,{inspect:inspect('Mirror glass in four-foot sections, floor to head height, held in an aluminium channel. Your torch comes back at you off it, twice as far away as it should be.','The room behind you in it is the room behind you.')}),
  P('b3-mirror-north-b','dance_mirror',14.0,6.0,0,{interactive:false}),
  P('b3-barre-east','dance_barre',24.5,11.0,-Math.PI/2,{inspect:inspect('A double barre, high rail and low, the varnish worn through to pale wood in a dozen places where hands went.','Thirty years of the same six inches.')}),

  // Studio B2: the largest, and the only one still on a live circuit.
  P('b2-mirror-north-a','dance_mirror',28.0,6.0,0,{inspect:inspect('The mirrored wall, and the room in it is not quite the room. The sections are out of plane by a degree or so, so the far corner arrives twice.','Two corners. One of them is the real one.')}),
  P('b2-mirror-north-b','dance_mirror',32.0,6.0,0,{interactive:false}),
  P('b2-mirror-north-c','dance_mirror',36.0,6.0,0,{interactive:false}),
  P('b2-barre-south','dance_barre',34.0,16.5,Math.PI,{inspect:inspect('The long barre. Somebody has wound gaffer round a cracked bracket rather than replace it.','The tape is older than the crack.')}),
  P('b2-barre-east','dance_barre',38.5,11.0,-Math.PI/2,{interactive:false}),
  P('b2-piano','upright_piano',26.0,14.0,Math.PI/2,{...play(PIANO,'The rehearsal upright, lid down, castors sunk into the sprung floor where it has stood long enough to leave four dents.','It has not been tuned to anything in this building for a long time.')}),
  P('b2-piano-stool','piano_bench',27.2,14.0,Math.PI/2,{inspect:inspect('A stool at the height somebody left it.','Still at their height.')}),
  // mount + elevation per-prop, as box-office-notice-board does: the mesh itself
  // cannot carry them, because box-office-ledger is the same mesh lying flat on a
  // counter and would be dragged up a wall with it.
  P('b2-notice','notice_board',26.0,9.0,Math.PI/2,{mount:'wall',elevation:1.15,inspect:inspect('A timetable in a wall frame, gone the colour of weak tea. Grades one to six, Tuesday and Thursday, and a note about outdoor shoes.','Tuesday and Thursday, and nobody at all.')}),
  P('b2-chairs','chair',29.0,18.0,0,{inspect:inspect('Chairs stacked four high in the short leg of the room, where they are out of the way of a class.','Out of the way of a class.')}),

  // Studio B1: nearest the stair, and the first room the wing shows you.
  P('b1-mirror-east','dance_mirror',48.5,16.0,-Math.PI/2,{inspect:inspect('A mirrored wall with a long diagonal crack across two sections, taped on the back so it holds together.','Taped, and holding.')}),
  P('b1-barre-south','dance_barre',44.0,20.5,Math.PI,{inspect:inspect('The barre here has been taken down at one end and left hanging, so it runs at an angle no dancer could use.','Somebody started taking this room apart and stopped.')}),
  P('b1-lino','rolled_lino',41.0,13.0,0,{inspect:inspect('Rolls of sprung-floor vinyl stood on end in the corner, taller than you, taped at the top and furred with dust.','Enough floor for a room nobody is going to lay it in.')}),

  // Studio B5, across the corridor. There is no B4.
  P('b5-barre-north','dance_barre',13.0,26.0,0,{inspect:inspect('A barre along the whole north wall, and the wall behind it is scuffed to shoulder height in one continuous band.','The band is exactly where a hand steadies itself.')}),
  P('b5-mirror-south','dance_mirror',15.0,32.5,Math.PI,{inspect:inspect('The mirror in here has been taken off the wall and stood facing it, so what is hung on the room is four feet of grey backing board.','Somebody turned the mirror around. That is a decision, and it was made in here.')}),
  P('b5-chairs','chair',21.0,30.0,0,{inspect:inspect('Chairs, stacked, in a room with the mirror facing the wall.','Stacked, and waiting on a room that has been turned off.')}),

  // The prop store: the dead end opposite the stair.
  P('store-rail-a','costume_rail',3.0,11.0,0,{inspect:inspect('A costume rail under dust sheets. Whatever is on it has kept its shape, which after this long means it was hung properly by somebody who cared.','Hung properly, and left.')}),
  P('store-rail-b','costume_rail',3.0,15.0,0,{interactive:false}),
  P('store-lino','rolled_lino',2.0,19.0,0,{interactive:false}),

  // Stencilled door numbers, corridor side. The wing has no plaques and no signs
  // — the numbers are painted straight onto the blockwork beside each opening.
  P('b1-stencil','door_stencil',43.0,21.0,Math.PI/2,{interactive:false}),
  P('b2-stencil','door_stencil',28.0,21.0,Math.PI/2,{interactive:false}),
  P('b3-stencil','door_stencil',15.0,19.0,Math.PI/2,{inspect:inspect('B3, stencilled on the blockwork beside the opening. The work order in your pocket says the same thing.','B3. The one they picked.')}),
  P('b5-stencil','door_stencil',12.0,25.0,Math.PI/2,{interactive:false}),
  P('store-stencil','door_stencil',2.0,21.0,Math.PI/2,{interactive:false}),

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
  // Measured at 1.6m off the nearest wall before `mount` did anything.
  P('chapel-hymn-board','hymn_board',97.4,87.8,0,{mount:'wall',elevation:1.4,inspect:inspect('The hymn board still reads 17 · 44 · 91. Nobody cleared the last service.','17 · 44 · 91.')}),
  P('chapel-portrait-pollaiuolo','portrait_frame',88.0,59.0,0,{elevation:1.55,portraitIndex:4,inspect:inspect('Piero del Pollaiuolo. Portrait of a Woman. Profile in tempera; gold remains along the edge.','Her profile is exact and unreachable.')}),
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
      P(`tower-rope-${i+1}`,i===7?'tower_rope_tenor':'tower_rope',x,y,a+Math.PI/2,{
        ...(i===7?{interaction:'action',action:'tower-tenor-rope'}:{}),
        inspect:i===7
          ?inspect('The tenor sally hangs at the covering position. Seven bells are changing above it; this one is waiting for a hand.','TENOR — 2,200 kg. Cover every row.')
          :inspect('A full-circle rope, tied off above the sally. The bell above is down.','Still tied. Still down.'),
      }),
      P(`tower-rope-mat-${i+1}`,i===7?'tower_rope_mat_tenor':'tower_rope_mat',x,y,a,{interactive:false,structural:true}),
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
  P('natatorium-roof-structure','natatorium_roof_structure',83.0,38.5,0,{interactive:false,structural:true,floorOverride:0}),
  P('natatorium-perimeter-relief','natatorium_perimeter_relief',83.0,38.5,0,{interactive:false,structural:true,floorOverride:0}),
  // A real baths entrance: the dry lobby has an admission point, wet/dry
  // drains, glazed control screens and a clear accessible lane before the pool
  // reveals itself. It is dressing, not a second collision envelope.
  P('natatorium-entrance-fixtures','natatorium_entrance_fixtures',84.0,30.0,0,{interactive:false,structural:true}),
  P('pool-entry-rules','notice_board',75.0,28.0,Math.PI,{
    mount:'wall',elevation:1.28,inspectAt:{x:75,y:28.4},
    inspect:inspect('Municipal baths rules under wired glass: shower first, no outdoor shoes beyond the blue line, children accompanied. Closing time has been pasted over three times.','Shower first. Outdoor shoes stop at the blue line.'),
  }),
  P('pool-entry-first-aid','key_cabinet',93.0,28.0,Math.PI,{
    mount:'wall',scale:.68,elevation:1.08,inspectAt:{x:93,y:28.4},
    inspect:inspect('A green first-aid cabinet beside the entrance. The inventory card still lists eye wash, foil blankets and a resuscitation mask; the seal is broken.','First aid. Seal broken, card still signed.'),
  }),
  P('natatorium-cubicles-west','natatorium_cubicle_bank',71.4,40.5,-Math.PI/2,{interactive:false,structural:true}),
  P('natatorium-cubicles-east','natatorium_cubicle_bank',94.6,40.5,Math.PI/2,{interactive:false,structural:true}),
  P('natatorium-end-window','natatorium_end_window',84.0,49.25,0,{interactive:false,structural:true,elevation:.55}),
  P('natatorium-clock','natatorium_clock',92.0,49.25,0,{
    elevation:5.25,inspectAt:{x:92,y:48.2},
    inspect:inspect('The pool clock stopped at twenty-seven past. Chlorine has greened the screws but not moved the hands.','Still twenty-seven past.'),
  }),

  // ONE CENTRE FOR EVERY LANE FIXTURE, and it is the swimmable water rather than
  // the basin box. The -2m basin runs x77.5..89.25, but the west access stair
  // eats x77..79 down its shallow end, so what you can actually swim is x79..89
  // and its centre is 84.0 — which is what the space-layout contract asserts.
  //
  // These were authored at 85.075 (the box centre plus a nudge), which pushed
  // lane five and its starting block through the east coping: the markings ran
  // to x89.5 against a wall at x89.25, and the outermost block stood on it.
  P('pool-lane-markings','pool_lane_markings',POOL_LANE_CENTRE_X,40.5,0,{interactive:false,structural:true,elevation:.05}),
  P('pool-lane-ropes','pool_lane_ropes',POOL_LANE_CENTRE_X,40.5,0,{interactive:false,structural:true,elevation:.015,waterlineBody:'natatorium'}),
  P('pool-flags-near','pool_backstroke_flags',POOL_LANE_CENTRE_X,36.0,0,{interactive:false,structural:true,floorOverride:0}),
  P('pool-flags-far','pool_backstroke_flags',POOL_LANE_CENTRE_X,45.5,0,{interactive:false,structural:true,floorOverride:0}),
  P('pool-access-handrail','pool_access_handrail',79,35.5,0,{interactive:false,structural:true,floorOverride:-2}),
  P('pool-ladder-west','pool_ladder',77.7,40.0,-Math.PI/2,{interactive:false,structural:true,floorOverride:0}),
  P('pool-ladder-east','pool_ladder',90.3,44.0,Math.PI/2,{interactive:false,structural:true,floorOverride:0}),
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
  ...POOL_LANE_X.map((x,i)=>P(`pool-start-${i+1}`,'pool_start_block',x,32.4,Math.PI,{floorOverride:0,inspect:inspect('A starting block, its number plate removed.','Four bolt heads and a paler rectangle.')})),
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
    lightCircuit:'sp02',lightColor:[1,.018,.008],
  }),
  P('natatorium-light-emergency-west','tower_bulkhead',71.0,38.5,-Math.PI/2,{
    elevation:1.62,renderOffsetX:-.25,interactive:false,structural:true,
    lightCircuit:'sp02',lightColor:[1,.018,.008],
  }),
  P('natatorium-light-emergency-east','tower_bulkhead',95.5,38.5,Math.PI/2,{
    elevation:1.62,renderOffsetX:.25,interactive:false,structural:true,
    lightCircuit:'sp02',lightColor:[1,.018,.008],
  }),
  P('natatorium-light-emergency-far','tower_bulkhead',84.0,49.5,Math.PI,{
    elevation:1.62,renderOffsetZ:.25,interactive:false,structural:true,
    lightCircuit:'sp02',lightColor:[1,.018,.008],
  }),
  P('acq-services-panel-foh','power_box_01',96.5,16.0,Math.PI/2,{
    scaleX:1.76,scaleY:1.63,elevation:1.45,renderOffsetX:.25,
    provenance:provenance('services_rewire','S/P-03','front-of-house panel; typed circuit card'),
    inspectAt:{x:95.25,y:16.0},
    interaction:'action',action:'power-panel-sp03',interactionPriority:2,
    inspect:inspect('The front-of-house panel, S/P-03. Its typed circuit card lists the Scene Dock, foyer and box office; the main isolator is down.','S/P-03. A neat card for three dead circuits.'),
  }),
  P('acq-services-panel-practice','power_box_01',56.0,53.0,0,{
    scaleX:1.76,scaleY:1.63,elevation:1.45,mount:'wall',
    provenance:provenance('services_rewire','S/P-04','practice landing panel; pencil room numbers over typed labels'),
    inspectAt:{x:56.0,y:54.0},
    interaction:'action',action:'power-panel-sp04',interactionPriority:2,
    inspect:inspect('The practice-floor panel, S/P-04. Room numbers have been pencilled over a typed teaching-wing schedule; every breaker is open.','S/P-04. The pencil is newer than the dead ballast.'),
  }),
  P('acq-services-panel-academic','power_box_01',9.5,279.5,Math.PI,{
    scaleX:1.76,scaleY:1.63,elevation:1.45,mount:'wall',
    provenance:provenance('services_rewire','S/P-05','academic loggia panel; gallery and classroom schedule'),
    inspectAt:{x:9.5,y:278.75},
    interaction:'action',action:'power-panel-sp05',interactionPriority:2,
    inspect:inspect('The academic-floor panel, S/P-05, is fixed to the loggia wall where the stair arrives. Gallery and classroom banks are listed separately; every breaker is open.','S/P-05. Last in the numbered run, nearest the way down.'),
  }),
  P('plant-rack-1','equipment_rack',38.5,28,Math.PI/2,{interactive:false,structural:true}),
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
  P('light-dance-stair-casing','tower_bulkhead',45,20.5,Math.PI,{elevation:2.5,renderOffsetZ:.25,interactive:false,structural:true,lightCircuit:'sp01',lightColor:[1,.018,.008]}),
  P('light-plant-service-casing','tower_bulkhead',35,26,0,{elevation:2.45,renderOffsetZ:-.25,interactive:false,structural:true,lightCircuit:'sp01',lightColor:[.69,.83,.70]}),
  P('light-plant-entry-casing','tower_bulkhead',30.1,30.5,-Math.PI/2,{elevation:2.25,mount:'wall',interactive:false,structural:true,lightCircuit:'sp01',lightColor:[1,.018,.008]}),
  P('light-plant-switchgear-casing','tower_bulkhead',38.8,28.7,Math.PI/2,{elevation:2.55,mount:'wall',interactive:false,structural:true,lightCircuit:'sp01',lightColor:[.66,.82,.72]}),
  P('light-plant-manifold-casing','tower_bulkhead',33,38.35,Math.PI,{elevation:2.35,mount:'wall',interactive:false,structural:true,lightCircuit:'sp01',lightColor:[.70,.84,.74]}),
  // One work light per lit studio, on the north wall, facing the room. B3's is
  // the take room's only practical: it was authored zoned to the dance wing and
  // therefore resolved for nobody standing in it.
  P('light-b3-work-casing','tower_bulkhead',18,6,0,{elevation:2.45,renderOffsetZ:-.25,interactive:false,structural:true,lightCircuit:'sp01',lightColor:[.78,.78,.65]}),
  // 20.75, not 20.5. `tower_bulkhead` is a wall asset and snapToWall backs it
  // into the masonry behind it — but propsInit drops any prop whose own cell is
  // solid BEFORE resolveContacts gets to snap it, and 20.5 rounds onto the wall
  // itself. B3's emergency casing was silently never placed: the fitting was
  // invisible and its light fell through to the authored fallback (b3-emergency
  // is at 20.75, which is this cell). A wall-mounted prop is authored on the
  // FLOOR beside its wall.
  P('light-b3-emergency-casing','tower_bulkhead',23.5,20.75,Math.PI,{elevation:2.15,renderOffsetZ:.25,interactive:false,structural:true,lightCircuit:'sp01',lightColor:[1,.018,.008]}),
  P('light-dance-work-casing','tower_bulkhead',32,6,0,{elevation:2.45,renderOffsetZ:-.25,interactive:false,structural:true,lightCircuit:'sp01',lightColor:[.78,.78,.65]}),
  P('light-foh-west-casing','tower_bulkhead',75,18.5,-Math.PI/2,{elevation:3.25,renderOffsetX:-.25,interactive:false,structural:true,lightCircuit:'sp03',lightColor:[.74,.82,.78]}),
  P('light-foh-east-casing','tower_bulkhead',92,10.5,Math.PI,{elevation:3.25,renderOffsetZ:.25,interactive:false,structural:true,lightCircuit:'sp03',lightColor:[.74,.82,.78]}),
  P('light-foh-emergency-casing','tower_bulkhead',96.5,18.5,Math.PI/2,{elevation:2.15,renderOffsetX:.25,interactive:false,structural:true,lightCircuit:'sp03',lightColor:[1,.018,.008]}),
  P('light-pool-service-a-casing','tower_bulkhead',95.5,43,Math.PI/2,{elevation:3.3,renderOffsetX:.25,interactive:false,structural:true,lightCircuit:'sp02',lightColor:[.69,.83,.78]}),
  P('light-pool-service-b-casing','tower_bulkhead',71,43,-Math.PI/2,{elevation:3.3,renderOffsetX:-.25,interactive:false,structural:true,lightCircuit:'sp02',lightColor:[.67,.81,.76]}),
  P('light-hall-stage-door-casing','tower_bulkhead',99,8,-Math.PI/2,{elevation:5.15,renderOffsetX:-.25,interactive:false,structural:true,lightMaintained:true,lightColor:[1,.018,.008]}),
  P('light-hall-lounge-casing','tower_bulkhead',99,27,-Math.PI/2,{elevation:3.1,renderOffsetX:-.25,interactive:false,structural:true,lightMaintained:true,lightColor:[.78,.74,.62]}),
  // At the foot of each galleria flight, on the hall's own side wall. Elevation
  // is absolute world height, so each sits ~1.4m above the tread it stands over:
  // the west foot is at -0.74 and the east at 4.00.
  P('light-hall-galleria-west-casing','tower_bulkhead',99,20.5,-Math.PI/2,{elevation:.62,renderOffsetX:-.25,interactive:false,structural:true,lightMaintained:true,lightColor:[1,.018,.008]}),
  P('light-hall-galleria-east-casing','tower_bulkhead',126.5,31.5,-Math.PI/2,{elevation:5.36,renderOffsetX:.25,interactive:false,structural:true,lightMaintained:true,lightColor:[1,.018,.008]}),
  P('light-practice-north-casing','tower_bulkhead',59.5,55.5,Math.PI,{elevation:2.5,renderOffsetZ:.25,interactive:false,structural:true,lightCircuit:'sp04',lightColor:[1,.018,.008]}),
  P('light-practice-south-casing','tower_bulkhead',60,81,-Math.PI/2,{elevation:2.5,renderOffsetX:-.25,interactive:false,structural:true,lightCircuit:'sp04',lightColor:[1,.018,.008]}),
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
  P('plant-pipe-north-lower-1','plant_pipe_straight',31.9,26.15,0,{elevation:1.18,mount:'wall',interactive:false,structural:true}),
  P('plant-pipe-north-lower-valve','plant_pipe_valve',33.39,26.15,0,{elevation:1.14,mount:'wall',interactive:false,structural:true}),
  P('plant-pipe-north-lower-2','plant_pipe_straight',34.89,26.15,0,{elevation:1.18,mount:'wall',interactive:false,structural:true}),
  P('plant-pipe-north-lower-elbow','plant_pipe_elbow',36.51,26.15,0,{elevation:1.08,mount:'wall',interactive:false,structural:true}),
  P('plant-pipe-north-bank-west','plant_pipe_bank',34.0,26.15,0,{elevation:1.62,mount:'wall',interactive:false,structural:true}),
  P('plant-pipe-north-bank-east','plant_pipe_bank',36.7,26.15,0,{elevation:1.62,mount:'wall',interactive:false,structural:true}),
  P('plant-pipe-north-bank-elbow','plant_pipe_elbow',38.47,26.15,0,{elevation:1.62,mount:'wall',interactive:false,structural:true}),
  P('plant-pipe-east-bank-north','plant_pipe_bank',39.5,29,-Math.PI/2,{elevation:1.55,mount:'wall',interactive:false,structural:true}),
  P('plant-pipe-east-bank-south','plant_pipe_bank',39.5,31.7,-Math.PI/2,{elevation:1.55,mount:'wall',interactive:false,structural:true}),
  P('plant-pipe-east-valve','plant_pipe_valve',39.5,31.7,-Math.PI/2,{elevation:1.51,mount:'wall',interactive:false,structural:true}),
  // Plant machinery reads as four large systems. Only the pressure header is a
  // verb; the rest is noninteractive construction with honest collision.
  P('plant-calorifier-north','plant_calorifier',34.0,28.0,0,{interactive:false,structural:true}),
  P('plant-calorifier-south','plant_calorifier',34.0,33.0,0,{interactive:false,structural:true}),
  P('plant-pump-north','plant_pump_skid',36.3,28.2,Math.PI/2,{interactive:false,structural:true}),
  P('plant-pump-south','plant_pump_skid',36.3,32.8,Math.PI/2,{interactive:false,structural:true}),
  P('plant-mcc-east','plant_mcc_bank',39.45,28.5,-Math.PI/2,{mount:'wall',interactive:false,structural:true}),
  P('plant-idf-west','plant_idf_frame',30.15,27.9,Math.PI/2,{mount:'wall',interactive:false,structural:true}),
  P('plant-overhead-header','plant_overhead_header',35.0,30.5,0,{elevation:.05,interactive:false,structural:true}),
  P('plant-annex-steps','plant_grated_steps',33.0,35.35,0,{interactive:false,structural:true}),
  // THE PIPE. The id stays `plant-heating-header` because renaming it churns
  // props and saves for nothing, but nothing the player ever reads calls it a
  // header — it is a pipe, it is hissing, and that is the whole of what he
  // needs to know about it.
  P('plant-heating-header','plant_header_manifold',33.0,38.35,Math.PI,{mount:'wall',action:'plant-header-valve',label:'the hissing pipe',interactionPriority:3,inspectAt:{x:33,y:37.45},
    inspect:inspect('A heating pipe running the length of the wall, and one isolation valve on it shivering under the load. Steam is getting out somewhere behind the wheel, in a thin continuous note.','Still hissing. The gauge needle is hard against its stop.')}),
  // Optional quiet buff in the open van; guaranteed noisy fallback in the
  // Get-In. Runtime replaces/removes these same ids as they are collected.
  // ON THE SHELF, AND NOT ITS OWN INTERACTION. You can see it from outside the
  // van, which is the point of it being lit — but taking it happens inside the
  // one van beat, along with the case, the order and the badge. Two [E] targets
  // a foot apart made the opening a hunt for the second one.
  P('van-adjustable-spanner','adjustable_spanner',64.6,208.0,.18,{elevation:1.14,interactive:false,structural:true,label:'blue-handled adjustable spanner'}),
  P('getin-heavy-stillson','stillson_wrench',70.5,6.25,.08,{action:'plant-heavy-wrench',label:'oversized Stillson wrench',interactionPriority:4,inspect:inspect('A Stillson nearly two metres long, left across the maintenance rack.','Too large for the field case. It will have to travel on the floor.')}),

  // ── THE VIGIL ────────────────────────────────────────────────────────────
  //
  // Twenty-four people who decided to be outside the building until six on
  // Thursday. Six of them talk; the other eighteen are background with real
  // collision and no interaction, which is what stops the crowd reading as six
  // hotspots standing in a photograph.
  //
  // Placement, kit and every line they say are authored in
  // data/exterior-vigil.js in YARD-PHYSICAL metres; the yard island's logical
  // origin (50, 200) is added here and nowhere else.
  ...vigilFigures().map((figure)=>P(
    figure.id,figure.mesh,50+figure.x,200+figure.y,figure.yaw,
    figure.talkable
      ? {
        structural:true,blocks:true,action:'exterior-vigil',vigilId:figure.voiceId,
        label:figure.label,knownLabel:figure.knownLabel,vigilCluster:figure.cluster,vigilActionSet:figure.actionSet,interactionPriority:3,
        inspectAt:{x:50+figure.facePoint.x,y:200+figure.facePoint.y},
      }
      : {interactive:false,structural:true,blocks:true,vigilCluster:figure.cluster,vigilActionSet:figure.actionSet},
  )),
  ...vigilParts().map((entry)=>P(
    entry.id,entry.mesh,50+entry.x,200+entry.y,entry.yaw,
    {interactive:false,structural:true,blocks:false,vigilActorId:entry.actorId||null,vigilCluster:entry.cluster},
  )),
];
