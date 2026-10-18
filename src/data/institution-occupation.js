// Occupation of the existing Ellery rooms. Nothing here changes the plan.
// New small objects supplement the existing furniture, instruments and ticket
// stock; source evidence and invented placement are separated in references.json.
import { YARD_SERVICE_RANGES } from './exterior-district.js';

const mesh=(w,d,h,blocks=false,extra={})=>Object.freeze({w,d,h,blocks,...extra});
export const INSTITUTION_OCCUPATION_MESHES=Object.freeze({
  occupation_cleaning_cupboard:mesh(.92,.60,1.82,true),
  occupation_maintenance_shelf:mesh(1.08,.44,1.48,true),
  occupation_cloak_rail:mesh(1.36,.46,1.62,true),
  occupation_arrival_book:mesh(.62,.32,.20),
  occupation_umbrella_contents:mesh(.29,.29,1.08),
  occupation_entry_mat:mesh(2.1,1.0,.018,false,{softFloor:.65}),
  occupation_desk_phone:mesh(.30,.24,.15),
  occupation_pigeonholes:mesh(1.08,.18,.56,false,{mount:'wall',frontAxis:'+z'}),
  occupation_key_hooks:mesh(.64,.09,.28,false,{mount:'wall',frontAxis:'+z'}),
  occupation_wall_clock:mesh(.34,.065,.34,false,{mount:'wall',frontAxis:'+z'}),
  occupation_instrument_dolly:mesh(.86,.62,.69,true),
  occupation_case_cradle:mesh(1.12,.44,1.22,true),
  occupation_corner_guard:mesh(.12,.060,1.12,false,{mount:'wall',frontAxis:'+z'}),
  occupation_vocal_mirror:mesh(.54,.045,1.34,false,{mount:'wall',frontAxis:'+z'}),
  occupation_water_shelf:mesh(.40,.18,.24,false,{mount:'wall',frontAxis:'+z'}),
  occupation_theory_tools:mesh(.32,.20,.052),
  occupation_string_tools:mesh(.24,.16,.048),
  occupation_reed_tools:mesh(.26,.18,.042),
  occupation_caster_wear:mesh(1.60,.54,.008),
  occupation_refit_patch:mesh(.64,.022,1.02,false,{mount:'wall',frontAxis:'+z'}),
  occupation_service_glands:mesh(.58,.14,1.12,false,{mount:'wall',frontAxis:'+z'}),
  occupation_baths_rainwater_completion:mesh(2.10,.92,7.24),
});

const prop=(id,mesh,x,y,yaw=0,extra={})=>Object.freeze({
  id:`occupation-${id}`,mesh,x,y,yaw,scale:1,interactive:false,
  renderOffsetX:x-Math.round(x*2)/2,renderOffsetZ:y-Math.round(y*2)/2,
  occupation:true,...extra,
});
const wall=(id,mesh,x,y,nx,ny,elevation,extra={})=>prop(id,mesh,x,y,0,{
  mount:'wall',mountNormal:{nx,ny},elevation,...extra,
});
const baths=YARD_SERVICE_RANGES.find(r=>r.id==='yard-baths-plant');
// The range builder already supplies the downpipe and its shoe here. This
// completion adds the missing eaves catchment, collars and receiving gully,
// precisely at its existing north-east pipe, rather than doubling the pipe.
const rainwaterPhysical={x:baths.physical.x+baths.w/2-.35,y:baths.physical.y-baths.d/2-.17};
// The service yard has its own logical drawing, translated by (50,200),
// distinct from the surrounding street district's logical drawing.
const yardLogicalAt=(x,y)=>({x:50+x,y:200+y});
const rainwaterAnchor=yardLogicalAt(rainwaterPhysical.x,rainwaterPhysical.y-.35);

// These are the two locked faculty rooms, not the open reception/stripped
// suite farther east. The existing low staff-desk geometry is scaled to a
// .7285m writing surface; its papers, phone and disconnected task light share
// that measured surface. Keep the door-to-chair route around the east end.
export const FACULTY_OFFICE_WORKSTATIONS=Object.freeze([
  Object.freeze({id:'west',roomId:'space:faculty-office-west',x:3,y:273,doorId:'academic-office-locked-1'}),
  Object.freeze({id:'east',roomId:'space:faculty-office-east',x:9,y:273,doorId:'academic-office-locked-2'}),
]);

export const INSTITUTION_OCCUPATION_PROPS=Object.freeze([
  // West side of the narrow prop store; the old costume rails remain east.
  prop('store-cleaning','occupation_cleaning_cupboard',1.48,8.85,-Math.PI/2,{roomUse:'maintenance storage'}),
  prop('store-tools','occupation_maintenance_shelf',1.40,15.85,-Math.PI/2,{roomUse:'maintenance storage'}),
  // South-west plant perimeter, away from header, annex steps and pump skids.
  prop('plant-spares','occupation_maintenance_shelf',30.58,33.60,Math.PI/2,{roomUse:'plant maintenance'}),
  // Existing front console: the horse study occupies its opposite end.
  prop('arrival-book','occupation_arrival_book',88.10,4.50,Math.PI,{
    elevation:.949,supportingProp:'acq-foyer-console-01',roomUse:'arrival hospitality',
  }),
  prop('arrival-umbrellas','occupation_umbrella_contents',80.50,4.50,0,{
    containingProp:'atrium-umbrella-bin',roomUse:'arrival hospitality',
  }),
  prop('arrival-mat','occupation_entry_mat',78.85,4.72,0,{roomUse:'arrival hospitality'}),
  prop('arrival-cloak-rail','occupation_cloak_rail',75.75,5.75,Math.PI/2,{roomUse:'arrival hospitality'}),
  // Phones inhabit existing desks. New keys are ordinary service keys; the
  // existing C-17 cabinet, its action and its issued key rings remain singular.
  prop('box-office-phone','occupation_desk_phone',93.90,9.12,.12,{on:'box-office-desk',roomUse:'administration'}),
  wall('box-office-post','occupation_pigeonholes',95.95,11.60,-1,0,1.06,{roomUse:'administration'}),
  wall('box-office-clock','occupation_wall_clock',94.10,6.85,0,1,2.16,{roomUse:'administration'}),
  wall('plant-key-hooks','occupation_key_hooks',30.20,32.15,1,0,1.42,{roomUse:'plant maintenance'}),
  prop('academic-phone','occupation_desk_phone',12.00,273.65,Math.PI/2,{on:'academic-reception-files',roomUse:'administration'}),
  wall('academic-post','occupation_pigeonholes',10.40,270.18,0,1,1.12,{roomUse:'administration'}),
  wall('academic-clock','occupation_wall_clock',18.70,271.60,-1,0,2.10,{roomUse:'administration'}),
  ...FACULTY_OFFICE_WORKSTATIONS.flatMap(office=>{
    const prefix=`faculty-${office.id}`,deskId=`occupation-${prefix}-desk`;
    const work=role=>({facultyOffice:office.id,roomId:office.roomId,facultyWorkRole:role,roomUse:'faculty work'});
    return[
      prop(`${prefix}-desk`,'box_office_desk',office.x,office.y,0,{...work('desk'),scale:1.55}),
      // The chair's back is local+Z; yaw0 faces its user north toward the desk.
      prop(`${prefix}-chair`,'chair',office.x,office.y+1,0,{...work('chair'),blocks:true}),
      prop(`${prefix}-papers`,'loose_note',office.x+.03,office.y+.04,-.08,{...work('papers'),on:deskId}),
      prop(`${prefix}-phone`,'occupation_desk_phone',office.x-.50,office.y+.10,0,{...work('phone'),on:deskId}),
      // Reuse the small existing battery task light. It is disconnected, and
      // adds neither a new maintained circuit nor a self-lit lamp material.
      prop(`${prefix}-lamp`,'portable_searchlight',office.x-.65,office.y-.22,-Math.PI/4,{...work('lamp'),on:deskId,mount:'surface'}),
    ];
  }),
  // Instrument handling stays inside rooms; no furniture occupies the spine.
  prop('practice-case-cradle','occupation_case_cradle',66.15,57.35,0,{roomUse:'instrument handling'}),
  prop('practice-dolly','occupation_instrument_dolly',67.00,62.20,Math.PI/2,{roomUse:'instrument handling'}),
  wall('practice-door-guard','occupation_corner_guard',64.18,60.15,1,0,.08,{roomUse:'instrument handling'}),
  wall('store-door-guard','occupation_corner_guard',1.10,19.80,1,0,.08,{roomUse:'instrument handling'}),
  // Actual teaching aids, selected for the room's existing use.
  wall('vocal-mirror','occupation_vocal_mirror',5.85,250.60,-1,0,.52,{roomUse:'vocal teaching'}),
  wall('vocal-water','occupation_water_shelf',5.85,255.65,-1,0,.96,{roomUse:'vocal teaching'}),
  prop('theory-chalk','occupation_theory_tools',20.20,252.40,Math.PI,{on:'academic-theory-table',roomUse:'theory teaching'}),
  prop('cello-rosin','occupation_string_tools',74.69,60.62,-1.47,{on:'practice-piano-2',roomUse:'cello teaching'}),
  prop('ensemble-reeds','occupation_reed_tools',72.10,79.15,.04,{
    elevation:1.172,supportingProp:'practice-ensemble-marimba',roomUse:'ensemble teaching',
  }),
  prop('piano-caster-wear','occupation_caster_wear',52.35,67.20,1.62,{roomUse:'piano maintenance'}),
  // Local repairs, not new blocked doorways or partitions.
  wall('plant-refit','occupation_refit_patch',30.20,31.65,1,0,.35,{roomUse:'services refit'}),
  wall('academic-refit','occupation_refit_patch',20.70,257.20,-1,0,.30,{roomUse:'services refit'}),
  // Rear service wall of the existing baths plant/laundry range.
  ...(()=>{
    const at=yardLogicalAt(baths.physical.x-1.9,baths.physical.y-baths.d/2-.45);
    // This service range is a rendered closed building, not a navigable
    // floorplan wall. Its measured north facade owns the attachment.
    return [prop('baths-service-entry','occupation_service_glands',at.x,at.y,Math.PI,{
      mount:null,elevation:.55,renderOffsetZ:.43,
      physicalSupport:{x:baths.physical.x-1.9,y:baths.physical.y-baths.d/2},roomUse:'exterior services',
    })];
  })(),
  prop('baths-rainwater','occupation_baths_rainwater_completion',rainwaterAnchor.x,rainwaterAnchor.y,0,{
    renderOffsetZ:rainwaterPhysical.y-(Math.round(rainwaterAnchor.y*2)/2-200),roomUse:'exterior drainage',
    physicalSupport:{...rainwaterPhysical,eaves:baths.height},
  }),
]);
