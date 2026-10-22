// Ordinary building fittings. These are dead hardware, not new interactables
// or light sources. The finite schedule retains map entries even when their
// paper anchor no longer lands in the compiled room.
import { BUILDING_MAP } from './building-map.js';

const wall = (w, h, d) => Object.freeze({ w, h, d, blocks:false, mount:'wall', frontAxis:'+z' });
export const ARCHITECTURE_FITTING_MESHES = Object.freeze({
  arch_switch_public:wall(.12,.18,.06),
  arch_switch_staff:wall(.12,.18,.06),
  arch_switch_service:wall(.14,1.10,.065),
  arch_socket_public:wall(.23,.14,.045),
  arch_socket_staff:wall(.23,.14,.045),
  arch_socket_service:wall(.25,.18,.065),
  arch_fire_callpoint:wall(.17,.21,.065),
  arch_alarm_sounder:wall(.24,.26,.10),
  arch_smoke_detector:Object.freeze({w:.25,d:.25,h:.09,blocks:false,mount:'ceiling'}),
  arch_radiator_public:wall(1.24,.82,.18),
  arch_radiator_staff:wall(1.24,.82,.18),
  arch_vent_grille:wall(.72,.34,.075),
  arch_access_hatch:wall(.50,.54,.04),
  arch_dado_public:wall(1,2.14,.06),
  arch_dado_public_fountain_clearance:wall(1,2.14,.06),
  arch_dado_staff:wall(1,1.01,.045),
  arch_rubbing_strip_service:wall(1,.13,.025),
  arch_coving_public:wall(1,.18,.12),
  arch_coving_staff:wall(1,.09,.06),
  arch_wall_wear_public:wall(.68,.54,.008),
  arch_wall_wear_staff:wall(.68,.54,.008),
  arch_wall_repair_service:wall(.68,.54,.012),
  arch_threshold_public:Object.freeze({w:1,d:.18,h:.014,blocks:false}),
  arch_threshold_staff:Object.freeze({w:1,d:.18,h:.014,blocks:false}),
  arch_threshold_service:Object.freeze({w:1,d:.18,h:.014,blocks:false}),
});

// Measured authored hosts whose faces must remain free of new fittings.
// These are resolved logical-metre render poses, including wall/table offsets,
// not a second furniture schedule. Current packed bounds are used when present;
// the measured fallback also makes a first asset rebuild deterministic.
export const ARCHITECTURE_HOST_RESERVATIONS = Object.freeze([
  { propId:'b2-piano', mesh:'upright_piano', group:'basement', position:[26,-4,14], yaw:Math.PI/2,
    bounds:{min:[-.76,0,-.565],max:[.76,1.423,.305]} },
  { propId:'occupation-academic-post', mesh:'occupation_pigeonholes', group:'academic', position:[10.4,11.12,270.09], yaw:0,
    bounds:{min:[-.54,0,-.09],max:[.54,.56,.09]} },
  { propId:'amenity-staff-coat-lockers', mesh:'amenity_staff_coat_lockers', group:'academic', position:[18.5,10,275.2], yaw:Math.PI/2,
    bounds:{min:[-.7,.06,-.5],max:[.7,1.98,-.096]} },
  { propId:'amenity-staff-service-connections', mesh:'amenity_staff_service_connections', group:'academic', position:[18.5,10,271], yaw:0,
    bounds:{min:[-.01,.07,-.328],max:[.52,1.42,.81]} },
  // These three existing panelled bays cover the underlying masonry plane.
  // Keep the routine kit on adjacent unpanelled wall, with no furniture edits.
  // Bounds are measured from the separately loaded academic-gallery pack.
  ...[1,2,3].map(i=>({propId:`gallery-treatment-west-bay-${i}`,mesh:'gallery_wall_bay',group:'academic',
    position:[23.06,10,246+i*4],yaw:-Math.PI/2,
    bounds:{min:[-2,0,-1.4267135766442757e-16],max:[2.3299999237060547,6.985000133514404,.3199999928474426]},
    geometryPack:'academic-gallery.glb'})),
].map(host=>Object.freeze({...host,clearance:.08})));

// The drinking point occupies the narrow real bay between the existing honour
// boards. Interrupt only its crossing chair rail, with80mm side clearance;
// the floor profile and higher picture rails continue through this interval.
export const ARCHITECTURE_TRIM_CLEARANCES = Object.freeze([
  Object.freeze({id:'public-fountain',propId:'amenity-public-drinking-fountain',
    group:'ground',floor:0,axis:'y',plane:97,nx:-1,ny:0,finish:'public',
    from:16.29,to:17.01,mesh:'arch_dado_public_fountain_clearance'}),
]);

const publicIds = new Set(['atrium','academic-gallery','academic-lobby','academic-loggia','chapel-narthex','the_tub','amplifications','lux_nova','classroom-west-1','public-sanitary-core']);
const privilegedIds = new Set(['faculty-office-west','faculty-office-east','academic-reception']);
const serviceIds = new Set(['prop-store','plant-room','services-substation','services-tank','loading-bay','get-in','lift-shaft']);
const specialistIds = new Set(['loading-bay','lift-shaft','main-stair-ground','upper-landing','academic-roof','ringing-room','bell-chamber','organ-loft','public-sanitary-core']);
const circulationIds = new Set(['basement-corridor','ground-spine','practice-corridor','academic-core']);
const suffix = id => id.slice(id.indexOf(':')+1);
const groupFor = id => /^(academic-|classroom-|faculty-|stripped-|vocal-studio-)/.test(id)?'academic'
  :/^(practice-|ensemble-|chapel-)/.test(id)||id==='lux_nova'||id==='soundnoisemusic'?'upper'
  :/^(studio-|services-)/.test(id)||['main_b3','prop-store','plant-room','basement-corridor','lift-shaft'].includes(id)?'basement'
  :id==='amplifications'?'hall'
  :['ringing-room','bell-chamber','organ-loft'].includes(id)?'tower':'ground';

export const ARCHITECTURE_ROOM_SCHEDULE = Object.freeze([
  ...BUILDING_MAP.spaces,...BUILDING_MAP.targets,...BUILDING_MAP.landmarks,
].map(space => {
  const id=suffix(space.id),status=privilegedIds.has(id)?'privileged-staff':publicIds.has(id)?'public':serviceIds.has(id)?'service':'working-staff';
  const treatment=specialistIds.has(id)?'retain-specialist':(space.aliasOf||id==='soundnoisemusic')?'aggregate':circulationIds.has(id)?'circulation':'room';
  return Object.freeze({
    id:space.id,label:space.label||id,logical:space.logical,doorIds:Object.freeze([...(space.doorIds||[])]),
    ...(space.aliasOf?{aliasOf:space.aliasOf}:{}),
    group:id==='academic-roof'?'academicRoof':groupFor(id),status,treatment,
    finish:status==='public'||status==='privileged-staff'?'public':status==='service'?'service':'staff',
    // Wet rooms use high-level air distribution rather than low bare radiators.
    heating:id==='the_tub'?'air':serviceIds.has(id)?'ventilation':'radiator',
    // The pool's paper marker is in the protected dry admission sequence. Its
    // routine services belong on the existing dry east maintenance perimeter.
    ...(id==='the_tub'?{fittingsAnchor:Object.freeze({x:94,y:38}),socketHeight:1.22,electrical:'service'}:{}),
    power:'isolated',
  });
}));
