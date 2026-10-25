// Original west elevations for the existing four service ranges. All windows
// have split masonry, real reveals and furnished recessed bays. The two later
// skins remain solid backing behind genuinely closed external assemblies.
import {YARD_RANGE_FRONTAGE_CONTRACT as C,yardRangeFrontage} from '../../src/data/yard-range-frontages.js';
const material=(name,rgb,metallic=0,roughness=.94,extra={})=>({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:metallic,roughnessFactor:roughness},...extra});
export const YARD_RANGE_MATERIALS={
  brick:material('ellery red brick',[.25,.095,.052]),glazed:material('yard retained blue-green glazed brick',[.10,.18,.17],.02,.64),
  stone:material('yard worn limestone dressings',[.29,.275,.235]),mortar:material('yard old lime infill',[.245,.225,.18]),
  iron:material('yard charcoal iron',[.030,.039,.036]),steel:material('yard dull service steel',[.115,.135,.123],.08,.86),
  green:material('yard old deep green joinery',[.045,.085,.067]),wood:material('yard oiled timber',[.105,.068,.038]),
  cream:material('yard weathered putty joinery',[.31,.285,.215]),blue:material('yard laundry ceramic blue',[.052,.105,.115],.02,.7),
  recess:material('yard room shadow plaster',[.105,.105,.080]),cloth:material('yard stored linen',[.255,.235,.175]),
  brass:material('yard handled tarnished brass',[.20,.145,.055],.12,.82),
  batteryLens:material('yard caretaker battery lamp diffuser',[.31,.22,.105],0,.84,{emissiveFactor:[.16,.085,.025]}),
};
function context(api,m,range,kind){
  const spec=yardRangeFrontage(kind);if(!spec||spec.id!==range.id||m.name!==spec.mesh)throw Error('Service facade requires its original range/mesh');
  for(const name of['addBox','addBeam','addCylinder','addQuad'])if(typeof api[name]!=='function')throw Error(`Service facade needs ${name}`);
  const ids={};for(const[key,value]of Object.entries(YARD_RANGE_MATERIALS)){let i=api.materials.findIndex(p=>p.name===value.name);if(i<0){i=api.materials.length;api.materials.push(structuredClone(value));}ids[key]=i;}
  const face=-range.w/2,report={revision:C.revision,id:spec.id,mesh:spec.mesh,kind,origin:range.physical,faceX:face,
    bodyCollisionPad:C.existingBodyCollisionPad,maximumBodyProjection:C.maximumBodyProjection,maximumCanopyProjection:C.maximumCanopyProjection,
    backing:spec.backing||null,openings:spec.openings.map(o=>({...o})),parts:[],triangles:0,portableLamp:!!spec.portableLamp,
    preserved:{anchor:true,roof:true,longElevations:true,drainage:true,interactive:false,mainsPower:false}};
  const point=([u,y,z])=>[face+u,y,z];
  const box=(id,c,size,key,role='detail')=>{api.addBox(m,point(c),size,ids[key]);report.parts.push({id,kind:'box',center:point(c),size,material:key,role});report.triangles+=12;};
  const beam=(id,a,b,w,key,role='detail')=>{api.addBeam(m,point(a),point(b),w,ids[key]);report.parts.push({id,kind:'beam',a:point(a),b:point(b),width:w,material:key,role});report.triangles+=12;};
  const quad=(id,a,b,c,d,key,role='detail')=>{const points=[a,b,c,d].map(point);api.addQuad(m,...points,ids[key]);report.parts.push({id,kind:'quad',points,material:key,role});report.triangles+=2;};
  const cylinder=(id,c,radius,height,key,sides=8,role='detail')=>{api.addCylinder(m,point(c),radius,height,ids[key],sides);report.parts.push({id,kind:'cylinder',center:point(c),radius,height,material:key,role});report.triangles+=sides*4;};
  return{spec,face,report,box,beam,quad,cylinder};
}
export function buildYardRangeBody(api,m,{range,kind}){
  const b=context(api,m,range,kind),{spec,box,report}=b,w=range.w,d=range.d,h=range.height;
  const substrate=kind==='stores'?'steel':kind==='baths'?'glazed':'brick',depth=C.roomDepth;
  // Preserve the full original occupied mass behind the shallow west bays.
  box('occupied-back-volume',[(w+depth)/2,h/2,0],[w-depth,h,d],substrate,'body');
  const ys=[...new Set([0,h,...spec.openings.flatMap(o=>[o.y0,o.y1])])].sort((a,b)=>a-b);
  for(let row=1;row<ys.length;row++){
    const y0=ys[row-1],y1=ys[row],y=(y0+y1)/2,holes=spec.openings.filter(o=>y>o.y0&&y<o.y1).sort((a,b)=>a.z-b.z);let from=-d/2;
    for(const[index,o]of [...holes.map(o=>({z0:o.z-o.width/2,z1:o.z+o.width/2})),{z0:d/2,z1:d/2}].entries()){
      if(o.z0>from)box(`west-masonry-${row}-${index}`,[depth/2,y,(from+o.z0)/2],[depth,y1-y0,o.z0-from],substrate,'masonry');from=o.z1;
    }
  }
  return report;
}
function arch(b,{id,z,width,spring,rise,baseY=0,material='stone',front=-.08,depth=.09,section=.16}){
  const {quad,box}=b,r=width/2;
  for(const side of[-1,1])box(id+`-jamb-${side}`,[front,(spring+baseY)/2,z+side*(r+section/2)],[depth,spring-baseY,section],material);
  for(let i=0;i<14;i++){
    const a=i/14*Math.PI+.007,c=(i+1)/14*Math.PI-.007;
    const p=(angle,extra,u)=>[u,spring+Math.sin(angle)*(rise+extra),z+Math.cos(angle)*(r+extra)];
    const near=front-depth/2,far=front+depth/2;
    quad(`${id}-voussoir-${i}`,p(a,section,near),p(c,section,near),p(c,0,near),p(a,0,near),material);
    quad(`${id}-soffit-${i}`,p(a,0,far),p(c,0,far),p(c,0,near),p(a,0,near),'mortar');
    quad(`${id}-cap-${i}`,p(a,section,near),p(c,section,near),p(c,section,far),p(a,section,far),material);
  }
}
function closedDoor(b,{id,z,width,height,front=.10,paint='green',metal=false}){
  const{box,beam}=b;
  box(id+'-closed-leaf',[front,.04+height/2,z],[.055,height,width],paint,'closed-door');
  for(const side of[-1,1])box(id+`-jamb-${side}`,[-.11,(height+.12)/2,z+side*(width/2+.065)],[.12,height+.12,.13],metal?'steel':'stone');
  box(id+'-head',[-.10,height+.10,z],[.14,.15,width+.28],metal?'steel':'stone');
  box(id+'-threshold',[-.065,.05,z],[.20,.10,width+.22],'stone');
  for(const y of[.42,1.08,1.87])box(id+`-recess-panel-${y}`,[front-.025,y,z],[.025,.44,width-.22],metal?'steel':'wood');
  for(const y of[.31,1.20,2.09])box(id+`-hinge-${y}`,[Math.max(-.16,Math.min(front-.045,-.14)),y,z-width/2+.09],[.025,.15,.13],'iron');
  beam(id+'-pull',[-.155,.99,z+width*.29],[-.155,1.25,z+width*.29],.026,'brass');
  box(id+'-keyplate',[-.15,.88,z+width*.29],[.024,.09,.07],'brass');
}
function furnishedWindow(b,o,{laundry=false}={}){
  const{box,beam,cylinder,report}=b,z=o.z,y=(o.y0+o.y1)/2,h=o.y1-o.y0,w=o.width,id=o.id;
  // The opening is empty through the full 1.05m shell strip. Side/top reveals
  // and a genuine room back provide parallax, not an emissive window card.
  box(id+'-room-back',[C.roomDepth-.035,y,z],[.07,h,w],'recess','room-back');
  for(const side of[-1,1]){
    box(id+`-room-cheek-${side}`,[C.roomDepth/2,y,z+side*(w/2-.025)],[C.roomDepth,h,.05],'recess','reveal');
    box(id+`-outer-jamb-${side}`,[-.075,y,z+side*(w/2+.06)],[.11,h+.20,.12],laundry?'steel':'stone');
    box(id+`-frame-${side}`,[-.035,y,z+side*(w/2-.045)],[.07,h,.09],laundry?'steel':'cream');
  }
  box(id+'-room-ceiling',[C.roomDepth/2,o.y1-.025,z],[C.roomDepth,.05,w],'recess','reveal');
  box(id+'-room-floor',[C.roomDepth/2,o.y0+.025,z],[C.roomDepth,.05,w],'wood','reveal');
  box(id+'-mullion',[-.045,y,z],[.08,h,.055],laundry?'steel':'cream');
  box(id+'-meeting-rail',[-.045,y+.13,z],[.08,.06,w],laundry?'steel':'cream');
  box(id+'-sill',[-.075,o.y0-.065,z],[.19,.13,w+.30],laundry?'glazed':'stone');
  box(id+'-lintel',[-.065,o.y1+.105,z],[.16,.15,w+.28],'stone');
  box(id+'-inside-worktop',[.62,o.y0+.25,z],[.45,.065,w-.15],'wood','furniture');
  if(laundry){
    for(let stack=0;stack<3;stack++)for(let fold=0;fold<3;fold++)box(`${id}-folded-linen-${stack}-${fold}`,[.68,o.y0+.33+fold*.07,z-.57+stack*.48],[.35,.065,.38],'cloth','furniture');
    cylinder(id+'-bucket',[.63,o.y0+.20,z+.54],.14,.32,'blue',10,'furniture');
  }else{
    box(id+'-ledger',[.58,o.y0+.31,z-.33],[.24,.055,.30],'cloth','furniture');
    box(id+'-key-cabinet',[.94,o.y1-.28,z-.38],[.10,.33,.50],'wood','furniture');
    for(const key of[-.15,0,.15])beam(id+'-key-'+key,[.865,o.y1-.22,z-.38+key],[.865,o.y1-.37,z-.38+key],.020,'brass','furniture');
    const lampZ=z+.43,baseY=o.y0+.30;
    box('caretaker-battery-lamp-case',[.64,baseY+.12,lampZ],[.20,.24,.20],'iron','portable-lamp');
    box('caretaker-battery-lamp-cell-compartment',[.71,baseY+.12,lampZ],[.065,.16,.16],'steel','portable-lamp');
    box('caretaker-battery-lamp-small-diffuser',[.531,baseY+.15,lampZ],[.018,.12,.13],'batteryLens','portable-lamp');
    beam('caretaker-battery-lamp-handle-left',[.64,baseY+.25,lampZ-.07],[.64,baseY+.34,lampZ-.07],.019,'iron','portable-lamp');
    beam('caretaker-battery-lamp-handle-right',[.64,baseY+.25,lampZ+.07],[.64,baseY+.34,lampZ+.07],.019,'iron','portable-lamp');
    beam('caretaker-battery-lamp-handle-top',[.64,baseY+.34,lampZ-.07],[.64,baseY+.34,lampZ+.07],.019,'iron','portable-lamp');
  }
  report.openings.find(a=>a.id===id).roomDepth=C.roomDepth;
}
function louvre(b,{id,z,y,width,height,front=-.11}){
  const{box,quad}=b;box(id+'-back',[front+.075,y,z],[.03,height,width],'iron');
  for(const side of[-1,1])box(id+`-edge-${side}`,[front,y,z+side*(width/2+.045)],[.10,height+.11,.09],'steel');
  for(let i=0;i<6;i++){
    const yy=y-height/2+.075+i*(height-.15)/5;
    quad(id+'-baffle-'+i,[front-.06,yy-.035,z-width/2],[front-.06,yy-.035,z+width/2],[front+.05,yy+.04,z+width/2],[front+.05,yy+.04,z-width/2],'steel');
  }
}
export function addYardRangeWestFrontage(api,m,{range,kind,bodyReport=null}){
  const b=context(api,m,range,kind),{spec,box,beam,cylinder,report}=b,h=range.height,d=range.d;
  if(bodyReport){report.parts.push(...bodyReport.parts);report.triangles+=bodyReport.triangles;}
  for(const side of[-1,1]){
    box('west-corner-base-'+side,[-.07,.35,side*(d/2-.18)],[.14,.70,.32],'stone');
    box('west-corner-pier-'+side,[-.06,h/2,side*(d/2-.16)],[.12,h,.24],kind==='stores'?'steel':'brick');
  }
  box('west-eaves-bed',[-.055,h-.24,0],[.11,.18,d+.10],kind==='stores'?'steel':'stone');
  for(const opening of spec.openings){
    if(opening.type==='window')furnishedWindow(b,opening,{laundry:kind==='baths'});
    else closedDoor(b,{id:opening.id,z:opening.z,width:opening.width,height:opening.y1-.04,paint:kind==='baths'?'blue':'green'});
  }
  if(kind==='stable'){
    const a=spec.blockedHayDoor;
    box('blocked-hay-door-infill',[-.025,(a.y0+a.spring)/2,a.z],[.045,a.spring-a.y0,a.width],'mortar');
    for(let row=0;row<5;row++)for(let course=0;course<5;course++)box(`hay-infill-brick-${row}-${course}`,[-.055,a.y0+.13+row*.29,a.z-.91+course*.45+(row%2)*.055],[.025,.24,.40],row%3?'brick':'mortar');
    arch(b,{id:'former-hay-arch',z:a.z,width:a.width,spring:a.spring,rise:a.rise,baseY:a.y0,section:.17});
    box('hay-opening-sill',[-.07,a.y0-.08,a.z],[.18,.16,a.width+.38],'stone');
    beam('retained-hoist-stub',[-.09,a.spring+.43,a.z],[-.16,a.spring+.43,a.z],.045,'iron');
    for(const side of[-1,1])box('retained-hay-hinge-'+side,[-.12,a.y0+.54,a.z+side*(a.width/2-.07)],[.055,.09,.34],'iron');
    for(const side of[-1,1])for(let course=0;course<6;course++)box(`stable-quoin-${side}-${course}`,[-.09,.85+course*.68,side*(d/2-.19)],[.17,.20,.38],'stone');
  }else if(kind==='rehearsal'){
    const a=spec.oldOpening;arch(b,{id:'retained-old-door-order',z:a.z,width:a.width,spring:a.spring,rise:a.rise,section:.13,front:-.115,depth:.08});
    // Closed joinery sits outside the existing corrugated skin at u=-.12m.
    closedDoor(b,{id:'rehearsal-acoustic-door',...spec.acousticDoor,front:-.137,paint:'green'});
    for(const side of[-1,1])box('acoustic-gasket-'+side,[-.153,1.23,spec.acousticDoor.z+side*(spec.acousticDoor.width/2+.005)],[.025,2.42,.034],'iron');
    louvre(b,{id:'acoustic-labyrinth-vent',z:2.15,y:1.86,width:1.55,height:.72});
    box('old-opening-infill-head',[-.13,2.91,a.z],[.022,.35,a.width-.12],'mortar');
    for(const y of[4.8,5.2])box('rehearsal-repair-seam-'+y,[-.135,y,2.1],[.028,.07,1.8],'steel');
  }else if(kind==='baths'){
    for(let row=0;row<3;row++)for(let i=0;i<Math.floor(d/.44);i++){
      const z=-d/2+.25+i*.44;
      if(Math.abs(z-2.3)<.75)continue;
      box(`retained-ceramic-dado-${row}-${i}`,[-.035,.25+row*.31,z],[.065,.275,.41],row===2?'blue':'glazed');
    }
    louvre(b,{id:'plant-louvre',z:.35,y:3.47,width:1.25,height:.86,front:-.10});
    const pipeZ=.40;
    cylinder('plant-riser',[-.10,1.47,pipeZ],.055,2.6,'steel',10);
    for(const y of[.29,1.02,2.17,2.70])box('riser-collar-'+y,[-.105,y,pipeZ],[.12,.055,.15],'iron');
    beam('plant-elbow',[-.10,2.77,pipeZ],[-.10,2.77,pipeZ+.55],.085,'steel');
    box('plant-gauge-case',[-.12,1.68,pipeZ+.31],[.085,.25,.25],'iron');
    box('plant-gauge-dark-face',[-.166,1.68,pipeZ+.31],[.012,.18,.18],'cream');
    beam('plant-gauge-needle',[-.169,1.63,pipeZ+.28],[-.169,1.73,pipeZ+.34],.012,'iron');
  }else{
    const g=spec.goodsDoor;
    for(const side of[-1,1]){
      const z=g.z+side*g.width/4;
      box('stores-goods-leaf-'+side,[-.137,g.height/2,z],[.045,g.height,g.width/2-.025],'steel','closed-door');
      for(let rib=0;rib<7;rib++)box(`stores-leaf-rib-${side}-${rib}`,[-.165,g.height/2,z-g.width/4+.13+rib*.25],[.025,g.height-.20,.05],'iron');
      box('stores-goods-jamb-'+side,[-.135,(g.height+.15)/2,g.z+side*(g.width/2+.075)],[.08,g.height+.15,.15],'steel');
      for(const y of[.42,1.68,2.95])box(`stores-strap-${side}-${y}`,[-.165,y,z],[.025,.075,g.width/2-.17],'iron');
    }
    box('stores-door-head',[-.13,g.height+.13,g.z],[.09,.22,g.width+.35],'steel');
    beam('stores-locking-bar',[-.16,1.25,g.z-.33],[-.16,1.25,g.z+.33],.025,'iron');
    const a=spec.canopy;
    box('stores-canopy',[-a.projection/2,a.y,a.z],[a.projection,.085,a.width],'steel','canopy');
    box('stores-canopy-drip',[-a.projection+.025,a.y-.06,a.z],[.05,.14,a.width+.05],'iron','canopy');
    for(const side of[-1,1])beam('stores-canopy-brace-'+side,[-.025,3.12,a.z+side*(a.width/2-.16)],[-.335,a.y-.10,a.z+side*(a.width/2-.16)],.045,'steel','canopy');
    louvre(b,{id:'stores-high-vent',z:3.65,y:4.78,width:1.3,height:.65});
  }
  if(report.triangles>C.maximumAddedTriangles/2)throw Error('One service facade exceeded its share of geometry budget');
  m.extras={...m.extras,yardRangeFrontage:report};
  return report;
}
