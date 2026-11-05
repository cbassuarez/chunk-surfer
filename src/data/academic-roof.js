// Academic roof, authored metres. Logical addresses are a separate save/map
// page; physical coordinates remain over the existing atrium and gallery.
import { F, MATERIAL, ZONE } from './floorplan/legend.js';
import {ELLERY_COURTYARD_SKY} from './ellery-courtyard-architecture.js';

const point=(x,y)=>Object.freeze({x,y});
export const ROOF_CITY_SEAT=Object.freeze({
  // The approach sits beside the bench, on the stone strip east of the court's
  // glass, so the seat is still reached across the roof rather than off the pane.
  id:'roof-city-seat',at:point(212,290),approach:point(211.5,291),
  // Prop +Z faces east with -PI/2; camera forward uses the opposite yaw
  // convention. A slight northward rake avoids the existing guard upright.
  yaw:1.50,pitch:-.21,eyeDrop:.46,propYaw:-Math.PI/2,
});
export const ACADEMIC_ROOF=Object.freeze({
  revision:1,base:17,width:24,depth:27,renderGroup:'academicRoof',
  origin:point(190,270),physicalOrigin:point(73,2),
  entry:point(205,272),ren:point(210,273),seal:point(210,275),
  // Both anchors stay on supported glass. Their initial views look across
  // the pane; the east anchor faces northwest toward the fixed city landmarks.
  sitWest:point(200,280),sitEast:point(205,280),
  gate:point(44,242),gateInspect:point(44,242.25),
  stairFoot:point(174,285),stairTurn:point(159,283),stairHead:point(188,282),
  northBridge:point(188,285),
  ladderBottom:point(45,266),ladderTop:point(212,294),
  // The seats' pane, north of the courts. The skylight runs on over the courts
  // (courtGlass, physical metres), so the deck has no gap and they keep their sky.
  glass:Object.freeze({x0:196,x1:206,y0:276,y1:283}),
  courtGlass:ELLERY_COURTYARD_SKY,
});
// The skylight's bays continued across the courts, in the glazing mesh's own
// metres (its anchor is physical 84,14.5). The original 10 x 13 m pane keeps its
// own panes, ribs and surviving end frames; these only fill what lies outside
// it, on the same 2 x 2.1667 m grid, ending at a stone kerb on the court's edge.
export function roofCourtGlazingLayout(){
  const b=ELLERY_COURTYARD_SKY,ax=84,az=14.5,x0=b.x0-ax,x1=b.x1-ax,z0=b.z0-az,z1=b.z1-az,pane={x:5,z:6.5},bayZ=13/6;
  const xs=[x0];for(let x=-5;x<x1;x+=2)if(x>x0)xs.push(x);xs.push(x1);
  const zs=[z0];for(let z=-6.5+bayZ;z<z1-1e-6;z+=bayZ)if(z>z0+1e-6)zs.push(z);zs.push(z1);
  const inPane=(x,z)=>Math.abs(x)<pane.x&&z<pane.z,panes=[],ribs=[],kerbs=[],repairs=[],beams=[];
  for(let i=0;i+1<xs.length;i++)for(let j=0;j+1<zs.length;j++){
    const cx=(xs[i]+xs[i+1])/2,cz=(zs[j]+zs[j+1])/2;
    if(!inPane(cx,cz))panes.push({c:[cx,-.022,cz],s:[xs[i+1]-xs[i]-.10,.04,zs[j+1]-zs[j]-.10]});
  }
  const along=(list,x,za,zb)=>list.push({c:[x,.055,(za+zb)/2],s:[.10,.11,zb-za]}),across=(list,z,xa,xb)=>list.push({c:[(xa+xb)/2,.055,z],s:[xb-xa,.11,.10]});
  for(const x of xs)along(ribs,x,Math.abs(x)<=pane.x?pane.z:z0,z1);
  for(const z of zs){
    if(z>pane.z)across(ribs,z,x0,x1);
    else{across(ribs,z,x0,-pane.x);across(ribs,z,pane.x,x1);}
  }
  const kerb=(c,s)=>kerbs.push({c,s});
  kerb([x0,.06,(z0+z1)/2],[.24,.12,z1-z0+.24]);kerb([x1,.06,(z0+z1)/2],[.24,.12,z1-z0+.24]);kerb([(x0+x1)/2,.06,z1],[x1-x0+.24,.12,.24]);
  kerb([(x0-pane.x)/2,.06,z0],[-pane.x-x0,.12,.24]);kerb([(pane.x+x1)/2,.06,z0],[x1-pane.x,.12,.24]);
  // Replacement panes, as on the original: a pale rake survives VFD reduction.
  for(const[x,z]of[[6,3.25],[-2,9.75],[8,9.75]])repairs.push({c:[x-.83,.004,z],s:[.035,.009,1.73]});
  // The pane's under-glass primary beams run on to the court's far edge, so they
  // no longer stop in mid-air, and new ones carry the wings either side of them.
  const beam=(c,s)=>beams.push({c,s}),beamY=-.31,beamSize=.19;
  for(const x of[-5,-1,3,5])beam([x,beamY,(pane.z+z1)/2],[beamSize,beamSize,z1-pane.z]);
  for(const x of[x0,7,x1])beam([x,beamY,(z0+z1)/2],[beamSize,beamSize,z1-z0]);
  beam([(x0+x1)/2,beamY,z1],[x1-x0,beamSize,beamSize]);
  beam([(x0-pane.x)/2,beamY,z0],[-pane.x-x0,beamSize,beamSize]);beam([(pane.x+x1)/2,beamY,z0],[x1-pane.x,beamSize,beamSize]);
  return{panes,ribs,kerbs,repairs,beams};
}
export const roofPointToPhysical=({x,y})=>({
  x:ACADEMIC_ROOF.physicalOrigin.x+x-ACADEMIC_ROOF.origin.x,
  y:ACADEMIC_ROOF.physicalOrigin.y+y-ACADEMIC_ROOF.origin.y,
});

export const ACADEMIC_ROOF_SEAT_LOOK=Object.freeze({
  'roof-sit-west':Object.freeze({yaw:0,pitch:-.08}),
  'roof-sit-east':Object.freeze({yaw:-1.08,pitch:-.15}),
});
export const academicRoofYawDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

export function academicRoofRows(){
  return Array.from({length:ACADEMIC_ROOF.depth},()=>'Q'.repeat(ACADEMIC_ROOF.width));
}
export function academicRoofProfile(x,y,cell){
  if(cell.solid)return null;
  const rim=x===0||y===0||x===ACADEMIC_ROOF.width-1||y===ACADEMIC_ROOF.depth-1;
  // The north edge opens only where the guarded fire-escape bridge arrives.
  if(rim&&!(y===0&&x>=15&&x<=17))return{floor:17,ceil:18.1,flags:F.SKY|F.WALLED,zone:ZONE.academicRoof,
    material:MATERIAL.metalPlant,collisionOnly:true};
  const px=ACADEMIC_ROOF.physicalOrigin.x+x,pz=ACADEMIC_ROOF.physicalOrigin.y+y,b=ACADEMIC_ROOF.courtGlass;
  const glass=x>=6&&x<=15&&y>=6&&y<=12||px>=b.x0&&px<b.x1&&pz>=b.z0&&pz<b.z1;
  return{floor:ACADEMIC_ROOF.base,ceil:24,
    flags:F.SKY|F.WALLED,zone:ZONE.academicRoof,
    material:glass?MATERIAL.roofGlass:MATERIAL.metalPlant};
}

// The north academic wall is an actual exterior above the street. The first
// run follows its lower windows west; the second returns east in open air.
// Both flights and the grated bridge have ordinary collision all the way to
// the roof's north parapet opening, with no hidden teleport in the ascent.
export const ACADEMIC_ROOF_STAIR=Object.freeze({
  id:'academic-roof-service',zone:'academicRoof',material:'metalPlant',head:2.6,
  physicalReplace:true,physicalStack:true,
  flights:[
    {id:'lower',from:point(174,283),to:point(160,283),
      physicalFrom:{x:94,z:-2},physicalTo:{x:80,z:-2},physicalWidthSign:-1,
      fromH:10,toH:13.5,width:2,rises:18,groupFrom:'academicRoof',groupTo:'academicRoof'},
    // The upper return uses its own logical strip. It shares real physical
    // space with the lower run at another height, so one logical strip would
    // let the roof bridge overwrite mid-flight lower treads at 17m.
    {id:'upper',from:point(180,281),to:point(188,281),
      physicalFrom:{x:80,z:-4},physicalTo:{x:88,z:-4},
      fromH:13.5,toH:17,width:2,rises:18,groupFrom:'academicRoof',groupTo:'academicRoof'},
  ],
  landings:[
    {id:'foot',at:point(173,283),physicalAt:{x:93,z:-2},size:{x:2.5,y:4},height:10,renderGroup:'academicRoof'},
    // The turn projects two metres beyond the crossing flight. This is still
    // an open fire-escape landing, but it gives a standing view to street grade
    // without looking through the upper run's treads.
    {id:'turn',at:point(158,279),physicalAt:{x:78,z:-6},size:{x:2,y:6},height:13.5,renderGroup:'academicRoof'},
    {id:'head',at:point(188,281),physicalAt:{x:88,z:-4},size:{x:2,y:2},height:17,renderGroup:'academicRoof'},
    {id:'bridge',at:point(188,283),physicalAt:{x:88,z:-2},size:{x:2,y:4},height:17,renderGroup:'academicRoof'},
  ],
});
export const ACADEMIC_ROOF_LEVELS=Object.freeze([
  {id:'academic_roof',layer:'academicRoof',space:'academic_roof',renderGroup:'academicRoof',
    origin:ACADEMIC_ROOF.origin,physicalOrigin:ACADEMIC_ROOF.physicalOrigin,base:17,
    rows:academicRoofRows(),profile:academicRoofProfile,physicalStack:true},
  {id:'academic_roof_service_stair',layer:'academicRoofStair',space:'academic_roof_stair',renderGroup:'academicRoof',
    origin:point(158,279),physicalOrigin:point(78,-4),base:10,rows:[''],stairs:[ACADEMIC_ROOF_STAIR]},
]);
export const ACADEMIC_ROOF_PORTALS=Object.freeze([
  {id:'academic-loggia-to-roof-service',width:1.5,
    from:{at:point(43.5,242),along:point(1,0),exit:point(0,-1)},
    to:{at:point(173.5,286.5),along:point(1,0),exit:point(0,1)},tolerance:2.1},
  {id:'academic-roof-service-switchback',width:1.5,
    from:{at:point(159.5,281),along:point(0,1),exit:point(1,0)},
    to:{at:point(180,281),along:point(0,1),exit:point(-1,0)},tolerance:1.1},
  {id:'academic-roof-service-to-loop',width:1.5,
    from:{at:point(188,286.5),along:point(1,0),exit:point(0,1)},
    to:{at:point(205,270),along:point(1,0),exit:point(0,-1)},tolerance:1.1},
]);

const roofProp=(id,mesh,at,extra={})=>({id,mesh,...at,yaw:0,scale:1,
  renderGroups:['academicRoof'],structural:true,blocks:false,...extra});
export const ACADEMIC_ROOF_MESHES=Object.freeze({
  academic_roof_structure:{w:24,d:27,blocks:false},
  academic_roof_glazing:{w:17,d:19,blocks:false},
  academic_roof_service_stair:{w:40,d:32,blocks:false},
  academic_roof_service_ladder:{w:1.15,d:.9,h:8,blocks:false},
  academic_roof_gate:{w:.3,d:2,blocks:false},
  academic_roof_seat:{w:1.8,d:1.4,blocks:false},
  academic_roof_city_seat:{w:1.92,d:.90,h:1.04,blocks:true},
  academic_roof_ren:{w:1.05,d:.52,h:1.85,blocks:false},
  academic_roof_ren_ritual:{w:1.2,d:1.0,h:1.85,blocks:false},
  academic_roof_seal_imprint:{w:.38,d:.08,h:.48,blocks:false},
  academic_roof_cassette:{w:.12,d:.08,h:.025,blocks:false},
});
export const ACADEMIC_ROOF_PROPS=Object.freeze([
  roofProp('academic-roof-structure','academic_roof_structure',point(202,283.5),{interactive:false}),
  roofProp('academic-roof-glazing','academic_roof_glazing',point(201,282.5),{interactive:false}),
  roofProp('academic-roof-service-stair','academic_roof_service_stair',point(174,285),
    {interactive:false,renderGroups:['academic','academicRoof'],floorOverride:10}),
  roofProp('roof-gate','academic_roof_gate',ACADEMIC_ROOF.gate,
    {action:'roof-gate',yaw:Math.PI/2,renderGroups:['academic','academicRoof'],inspectAt:ACADEMIC_ROOF.gateInspect,
      label:'North academic service gate'}),
  roofProp('roof-ren','academic_roof_ren',ACADEMIC_ROOF.ren,
    {action:'roof-ren',yaw:Math.PI*.88,inspectAt:point(210,274),label:'Ren'}),
  roofProp('roof-sit-west','academic_roof_seat',ACADEMIC_ROOF.sitWest,
    {action:'roof-sit-west',yaw:Math.PI/2,label:'Supported glass bay'}),
  roofProp('roof-sit-east','academic_roof_seat',ACADEMIC_ROOF.sitEast,
    {action:'roof-sit-east',yaw:-Math.PI/2,label:'Supported glass bay'}),
  roofProp(ROOF_CITY_SEAT.id,'academic_roof_city_seat',ROOF_CITY_SEAT.at,
    {action:'roof-city-seat',yaw:ROOF_CITY_SEAT.propYaw,blocks:true,
      inspectAt:point(212,290),label:'Stone city seat'}),
  roofProp('roof-shortcut-bottom','academic_roof_service_ladder',ACADEMIC_ROOF.ladderBottom,
    {action:'roof-shortcut',requiresKey:'ren-service',label:'Caged service ladder',
      renderGroups:['academic','academicRoof'],floorOverride:10,inspectAt:point(44,265)}),
  roofProp('roof-shortcut-top','academic_roof_seat',ACADEMIC_ROOF.ladderTop,
    {action:'roof-shortcut',requiresKey:'ren-service',label:'Service ladder return',inspectAt:point(211,294)}),
  // Ren's effects are tucked among the existing reception and stripped office
  // furniture; their clues should be found in a real room, not a new prop set.
  {id:'academic-roof-effects-index',mesh:'open_score',x:16,y:273,yaw:.1,scale:1,
    on:'academic-stripped-office-desk',action:'roof-effects-index',label:'Effects index',inspectAt:point(16,274),renderGroups:['academic']},
  {id:'academic-roof-pressure-pad',mesh:'open_score',x:12,y:273,yaw:-.12,scale:.82,
    on:'academic-reception-files',action:'roof-effects-trace',label:'Pressure-marked file',inspectAt:point(12,274),renderGroups:['academic']},
  {id:'academic-roof-home-cassette',mesh:'academic_roof_cassette',x:14,y:271,yaw:.2,scale:1,
    on:'academic-stripped-office-cabinet',interactive:false,label:'Home cassette',inspectAt:point(14,272),renderGroups:['academic']},
]);
