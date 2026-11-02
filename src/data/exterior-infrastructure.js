// Building-owned services that were absent from the existing street kit.
// Physical metres; the yard has its own stable logical page.
import {EXTERIOR_PUB,pubLogicalAt} from './exterior-pub.js';
import {ELLERY_MASSING} from './exterior-district.js';
import {yardTurnPoint,YARD_TURN_YAW} from './yard-turn.js';
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const yard=(x,z)=>({x:50+x,y:200+z});
const pub=EXTERIOR_PUB.building.bounds;
export const EXTERIOR_INFRASTRUCTURE=freeze({
  revision:'ellery-connected-services-1',pack:'/assets/exterior-infrastructure.glb',maximumTriangles:6500,maximumBytes:1800000,
  camera:{id:'lyric-service-camera',mesh:'lyric_service_camera',origin:{x:35.5,z:EXTERIOR_PUB.frontWorldZ-.20},
    eye:[35.5,3.47,EXTERIOR_PUB.frontWorldZ-.60],target:[31.7,.8,27.7],fieldOfViewDegrees:92,wallZ:EXTERIOR_PUB.frontWorldZ-.20,
    purpose:'Fixed view across the Lyric service apron, away from the lodge and Ellery entrance.'},
  extract:{id:'lyric-extract-stack',mesh:'lyric_extract_stack',origin:{x:pub.x0,z:35.8},roofHeight:EXTERIOR_PUB.building.roofHeight,
    purpose:'Supported kitchen extract from the occupied pub to above its existing roof.'},
  bins:{id:'lyric-service-bins',mesh:'lyric_service_bins',origin:{x:34.5,z:27.1},width:.74,depth:1.66,height:1.18,
    protectedRoute:{x0:29.75,x1:30.5,z0:27.5,z1:39},purpose:'The expensive bin mentioned by the driver, inside the fixed camera view.'},
  // Flat masonry gaps between the retained projecting phase fronts; the old
  // loading-mouth pipes are retained rather than duplicated beside them.
  rainwater:[['academic',29.1],['school',62.3],['baths',79.1]].map(([band,z])=>({
    id:`ellery-${band}-rainwater`,mesh:`ellery_${band}_rainwater`,origin:{x:48.82,z},
    height:ELLERY_MASSING.find(b=>b.id===band).height,
    purpose:'Parapet outlet, open hopper, bracketed iron pipe, access shoe and receiving yard gully.'})),
});
const C=EXTERIOR_INFRASTRUCTURE;
export const EXTERIOR_INFRASTRUCTURE_MESHES=freeze({
  [C.camera.mesh]:{w:.75,d:.70,h:3.8,blocks:false},
  [C.extract.mesh]:{w:1.60,d:1.3,h:C.extract.roofHeight+1.25,blocks:false},
  [C.bins.mesh]:{w:C.bins.width,d:C.bins.depth,h:C.bins.height,blocks:true},
  ...Object.fromEntries(C.rainwater.map(p=>[p.mesh,{w:.94,d:.66,h:p.height+.1,blocks:false}])),
});
export const EXTERIOR_INFRASTRUCTURE_PROPS=freeze([C.camera,C.extract,C.bins,...C.rainwater].map(p=>({
  id:p.id,mesh:p.mesh,...(p===C.camera?pubLogicalAt(p.origin.x,p.origin.z):yard(p.origin.x,p.origin.z)),yaw:0,scale:1,
  // Preserve centimetre mounting positions through the navigation projection.
  renderOffsetX:p.origin.x-Math.round(p.origin.x*2)/2,renderOffsetZ:p.origin.z-Math.round(p.origin.z*2)/2,
  floorOverride:0,interactive:false,structural:true,blocks:p===C.bins,colliderGroup:p===C.bins?'exterior-infrastructure':undefined,renderGroups:['ground'],skyExposed:true,worldAligned:true,
  ...([C.camera,C.extract,C.bins].includes(p)?{physicalPlacement:{...yardTurnPoint('lyric',p.origin),yaw:YARD_TURN_YAW}}:{}),
})));
