// Academic roof, authored metres. Logical addresses are a separate save/map
// page; physical coordinates remain over the existing atrium and gallery.
import { F, MATERIAL, ZONE } from './floorplan/legend.js';

const point=(x,y)=>Object.freeze({x,y});
export const ACADEMIC_ROOF=Object.freeze({
  revision:1,base:17,width:24,depth:27,renderGroup:'academicRoof',
  origin:point(190,270),physicalOrigin:point(73,2),
  entry:point(205,272),ren:point(210,273),seal:point(210,275),
  // Both anchors stay on supported glass. Their initial views look across
  // the pane; the east anchor faces northwest toward the fixed city landmarks.
  sitWest:point(200,287),sitEast:point(205,284),
  gate:point(44,242),gateInspect:point(44,242.25),
  stairFoot:point(174,285),stairTurn:point(159,283),stairHead:point(188,282),
  northBridge:point(188,285),
  ladderBottom:point(45,266),ladderTop:point(212,294),
  glass:Object.freeze({x0:196,x1:206,y0:276,y1:289}),
});
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
  return Array.from({length:ACADEMIC_ROOF.depth},()=> 'Q'.repeat(ACADEMIC_ROOF.width));
}
export function academicRoofProfile(x,y,cell){
  if(cell.solid)return null;
  const rim=x===0||y===0||x===ACADEMIC_ROOF.width-1||y===ACADEMIC_ROOF.depth-1;
  // The north edge opens only where the guarded fire-escape bridge arrives.
  if(rim&&!(y===0&&x>=15&&x<=17))return{floor:17,ceil:18.1,flags:F.SKY|F.WALLED,zone:ZONE.academicRoof,
    material:MATERIAL.metalPlant,collisionOnly:true};
  const glass=x>=6&&x<=15&&y>=6&&y<=18;
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
    from:{at:point(44,242),along:point(1,0),exit:point(0,-1)},
    to:{at:point(174,286.5),along:point(1,0),exit:point(0,1)},tolerance:2.1},
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
  academic_roof_glazing:{w:10,d:13,blocks:false},
  academic_roof_service_stair:{w:40,d:32,blocks:false},
  academic_roof_service_ladder:{w:1.15,d:.9,h:8,blocks:false},
  academic_roof_gate:{w:.3,d:2,blocks:false},
  academic_roof_seat:{w:1.8,d:1.4,blocks:false},
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
