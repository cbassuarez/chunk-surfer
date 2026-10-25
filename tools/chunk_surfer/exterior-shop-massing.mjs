// Six existing south-row shop houses, in the existing frontage-local frame:
// +X faces the pavement, -X enters the 5.4m lot, Z follows the eight-metre deeds.
// Owns each complete deed; caller must omit its old mass, windows and roof.
import {PLAZA_SHOPFRONTS,PLAZA_SHOP_CLOSURE} from '../../src/data/plaza-shopfronts.js';
import {addShopDisplay} from './shop-display-geometry.mjs';
import {addShopLettering} from './plaza-shop-lettering.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const SOUTH_SHOP_MASSING=freeze({
  deeds:[2,3,4,5,6,7],width:8,depth:5.4,frontProjection:.46,
  maximumTrianglesPerDeed:4400,maximumTriangles:22000,
  protectedPub:{z0:-32,z1:-16},
  upperWindowCentres:[5.30,8.40,11.50],upperWindowOffsets:[-1.72,1.72],
  wallDepth:.34,displayDepth:.95,occupiedFrontDepth:1.05,closedDoorWidth:1.10,
  roofs:['front-gable','long-ridge','long-ridge','front-gable','long-ridge','long-ridge'],
  roofRise:[1.75,1.85,1.45,1.80,1.60,1.35],
});
const palette={
  brick:['ellery red brick',[.25,.095,.052],0,.94],darkBrick:['ellery dark brick',[.13,.075,.058],0,.96],
  terracotta:['dull terracotta',[.42,.17,.08],0,.86],stone:['chapel stone',[.43,.44,.41],0,.86],
  slate:['wet slate',[.075,.09,.105],.03,.52],black:['black lacquer',[.025,.028,.03],.15,.28],
  white:['aged white paint',[.69,.72,.66],.03,.68],steel:['painted steel',[.22,.24,.23],.7,.46],
  wood:['dark wood',[.16,.095,.052],0,.72],green:['pub green paint',[.075,.18,.12],0,.66],
  brass:['brass',[.49,.31,.08],.8,.25],warm:['occupied warm glass',[.38,.25,.10],.02,.28,[.86,.53,.20]],
  paper:['shop ivory stock',[.74,.70,.59],0,.88],
  litPaper:['shop lit ivory stock',[.74,.70,.59],0,.88,[.16,.125,.078]],
  litWood:['shop lit dark wood',[.16,.095,.052],0,.72,[.045,.027,.012]],
  litSteel:['shop lit painted steel',[.22,.24,.23],.7,.46,[.055,.05,.037]],
  litGreen:['shop lit green stock',[.075,.18,.12],0,.66,[.018,.04,.024]],
  litTerracotta:['shop lit terracotta stock',[.42,.17,.08],0,.86,[.08,.038,.018]],
  interior:['shop reflected warm plaster',[.28,.25,.19],0,.94,[.025,.018,.008]],
};
const midpoint=(a,b)=>a.map((n,i)=>(n+b[i])/2);

export function addSouthShopDeed(api,m,{deed,z,h,unitW=8,depth=5.4,useIndex=deed}){
  const C=SOUTH_SHOP_MASSING,index=deed-2;
  if(!C.deeds.includes(deed)||![z,h,unitW,depth].every(Number.isFinite)||Math.abs(unitW-8)>1e-8||Math.abs(depth-C.depth)>1e-8||Math.abs(z-(-28+8*deed))>1e-8||h<11||h>15)
    throw Error('Shop massing requires one existing civic deed 2..7, its original centre and 5.4m lot.');
  if(!m||!Array.isArray(api.materials)||['addBox','addBeam','addCylinder','addQuad','addTriangle'].some(k=>typeof api[k]!=='function'))throw Error('Shop massing needs the ordinary opaque frontage builder API, including physical paint triangles.');
  const use=PLAZA_SHOPFRONTS[useIndex];
  if(!use)throw Error('An existing commercial deed must have a declared use.');
  const initial=api.materials.length,ids={};
  for(const[key,[name,rgb,metallicFactor,roughnessFactor,emissive]]of Object.entries(palette)){
    let i=api.materials.findIndex(p=>p.name===name);
    if(i<0){i=api.materials.length;api.materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor,roughnessFactor},...(emissive?{emissiveFactor:emissive}:{})});}ids[key]=i;
  }
  const stats={owner:m.name,deed,useIndex,use:use.id,name:use.name,lit:use.lit,closedForVigil:use.closedForVigil,centreZ:z,height:h,depth,roof:C.roofs[index],triangles:0,newMaterials:api.materials.length-initial,parts:[],apertures:[],lettering:[]};
  const point=([x,y,dz])=>[x,y,z+dz];
  const box=(id,c,size,material)=>{api.addBox(m,point(c),size,ids[material]);stats.parts.push({id,kind:'box',center:point(c),size,material});stats.triangles+=12;};
  const beam=(id,a,b,w,material)=>{api.addBeam(m,point(a),point(b),w,ids[material]);stats.parts.push({id,kind:'beam',a:point(a),b:point(b),width:w,material});stats.triangles+=12;};
  const cylinder=(id,c,r,height,material,sides=8)=>{api.addCylinder(m,point(c),r,height,ids[material],sides);stats.parts.push({id,kind:'cylinder',center:point(c),radius:r,height,sides,material});stats.triangles+=sides*4;};
  const quad=(id,a,b,c,d,material)=>{const points=[a,b,c,d].map(point);api.addQuad(m,...points,ids[material]);stats.parts.push({id,kind:'quad',points,material});stats.triangles+=2;};
  const paintLetters=(id,text,placement,material)=>{
    const label=addShopLettering((a,b,c)=>api.addTriangle(m,point(a),point(b),point(c),ids[material]),text,placement,material);
    // The shared opaque builder emits front and rear faces for a triangle.
    stats.triangles+=label.triangles*2;
    stats.parts.push({id,kind:'lettering',points:label.vertices.map(point),material});
    stats.lettering.push({id,text,width:label.width,capHeight:label.capHeight,normal:label.normal,triangles:label.triangles*2});
  };
  // Three proper quads fill a triangular gable without degenerate triangles.
  const triangle=(id,a,b,c,material)=>{const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a),o=a.map((v,k)=>(v+b[k]+c[k])/3);quad(id+'-a',a,ab,o,ca,material);quad(id+'-b',b,bc,o,ab,material);quad(id+'-c',c,ca,o,bc,material);};
  const brick=index===1||index===4?'terracotta':index===3?'darkBrick':'brick';
  const paint=['green','wood','white','steel','green','wood'][index];
  const doorSide=deed%2?-1:1,doorZ=doorSide*2.70,displayZ=-doorSide*.75,displayW=4.22;
  const aperture=(id,cz,width,y0,y1)=>{const a={id,z0:cz-width/2,z1:cz+width/2,y0,y1};stats.apertures.push(a);return a;};
  aperture('closed-shop-door',doorZ,1.22,.08,2.87);
  aperture('recessed-shop-display',displayZ,displayW,.94,2.98);
  const upperY=C.upperWindowCentres.filter(y=>y+1.03<h-.45);
  for(const[floor,y]of upperY.entries())for(const[bay,dz]of C.upperWindowOffsets.entries())aperture(`upper-${floor}-${bay}`,dz,1.48,y-.90,y+.90);

  // The occupied upper volume has real depth. Only its outer 340mm facade is
  // split around openings; the glazing/display backs sit ahead of the solid
  // interior datum, leaving genuine shallow reveals at every aperture.
  box('occupied-back-volume',[-(depth+C.occupiedFrontDepth)/2,h/2,0],[depth-C.occupiedFrontDepth,h,7.84],brick);
  const ys=[...new Set([0,h,...stats.apertures.flatMap(a=>[a.y0,a.y1])])].sort((a,b)=>a-b);
  for(let row=0;row<ys.length-1;row++){
    const y0=ys[row],y1=ys[row+1],middle=(y0+y1)/2;
    const openings=stats.apertures.filter(a=>a.y0<middle&&a.y1>middle).sort((a,b)=>a.z0-b.z0);
    let left=-3.92;
    for(const[part,a]of [...openings,{z0:3.92,z1:3.92}].entries()){
      if(a.z0>left+1e-8)box(`split-front-${row}-${part}`,[-C.wallDepth/2,middle,(left+a.z0)/2],[C.wallDepth,y1-y0,a.z0-left],brick);
      left=a.z1;
    }
  }
  for(const side of[-1,1]){
    box(`party-return-${side}`,[-depth/2,h/2,side*3.94],[depth,h,.12],brick);
    box(`party-cap-${side}`,[-depth/2,h+.045,side*3.94],[depth,.09,.12],'stone');
    box(`street-end-pier-${side}`,[.075,1.74,side*3.52],[.17,3.36,.24],paint);
  }
  box('shop-stall-riser',[.07,.43,displayZ],[.15,.75,displayW+.12],paint);
  box('continuous-base-course',[.07,.10,0],[.22,.20,7.78],'stone');
  box('shop-frieze',[.11,3.16,0],[.22,.18,7.22],paint);
  box('painted-shop-fascia',[.105,3.45,0],[.20,.40,7.04],paint);
  paintLetters('physical-fascia-name',use.name,{x:.208,y:3.45,z:0,width:6.4,height:.26,capHeight:.25},'paper');
  box('fascia-top-cornice',[.16,3.73,0],[.36,.15,7.34],'stone');
  box('fascia-shadow-bed',[.15,3.83,0],[.31,.07,7.23],'black');

  box('closed-door-leaf',[-.145,1.43,doorZ],[.085,2.68,1.10],paint);
  box('closed-door-upper-light',[-.09,2.14,doorZ],[.03,.79,.83],'black');
  for(const side of[-1,1])box(`door-jamb-${side}`,[.055,1.48,doorZ+side*.67],[.16,2.96,.14],paint);
  box('door-lintel',[.06,2.95,doorZ],[.23,.15,1.50],'stone');
  box('door-threshold',[.08,.075,doorZ],[.40,.08,1.46],'stone');
  for(const y of[.48,1.06])box(`door-raised-panel-${y}`,[-.08,y,doorZ],[.055,.43,.85],paint);
  beam('door-pull',[.045,1.07,doorZ+.36],[.045,1.39,doorZ+.36],.032,'brass');

  for(const side of[-1,1]){
    box(`display-reveal-${side}`,[-C.displayDepth/2,1.96,displayZ+side*(displayW/2-.025)],[C.displayDepth,2.03,.05],paint);
    box(`display-jamb-${side}`,[.055,1.96,displayZ+side*(displayW/2+.045)],[.16,2.10,.12],paint);
  }
  box('display-sill',[.10,.91,displayZ],[.42,.10,displayW+.31],'stone');
  box('display-lintel',[.07,3.015,displayZ],[.23,.12,displayW+.24],paint);
  for(const dz of[-.71,.71])box(`display-mullion-${dz}`,[.065,1.96,displayZ+dz],[.12,1.98,.075],paint);
  box('display-transom',[.065,2.53,displayZ],[.12,.075,displayW+.06],paint);
  addShopDisplay({box,beam,cylinder,quad},use,{z:displayZ,width:displayW});
  for(const[n,dz]of[-1.28,.31,1.43].entries())box(`glazing-reflection-${n}`,[.025,2.18+(n%2)*.12,displayZ+dz],[.009,.47,.013],'white');
  if(use.closedForVigil){
    box('early-closure-paper',[.014,2.12,doorZ],[.012,.35,.68],'paper');
    for(const[n,text]of PLAZA_SHOP_CLOSURE.lines.entries())paintLetters(`early-closure-copy-${n}`,text,{x:.022,y:2.20-n*.13,z:doorZ,width:.60,height:.085,capHeight:.065},'black');
  }

  for(const[floor,y]of upperY.entries())for(const[bay,dz]of C.upperWindowOffsets.entries()){
    const id=`upper-${floor}-${bay}`,lit=(deed+floor*2+bay)%7===0;
    box(id+'-back',[-.245,y,dz],[.035,1.70,1.29],lit?'warm':'black');
    for(const side of[-1,1]){
      box(id+`-reveal-${side}`,[-.14,y,dz+side*.71],[.28,1.84,.06],'stone');
      box(id+`-frame-${side}`,[.04,y,dz+side*.66],[.11,1.79,.08],'white');
    }
    box(id+'-meeting-rail',[.07,y,dz],[.10,.075,1.37],'white');
    box(id+'-mullion',[.07,y,dz],[.10,1.74,.06],'white');
    box(id+'-lintel',[.06,y+.99,dz],[.28,.16,1.72],'stone');
    box(id+'-sill',[.10,y-.97,dz],[.39,.10,1.72],'stone');
  }
  // Broad storey courses and a restrained eaves profile supply the silhouette
  // and shadow rhythm; minute applied ornament does not carry the building.
  for(const y of upperY.slice(0,-1).map(y=>y+1.53))box(`storey-band-${y}`,[.04,y,0],[.16,.11,7.84],'stone');
  box('eaves-bed',[.04,h-.22,0],[.20,.15,7.87],'stone');
  box('eaves-cornice',[.12,h-.075,0],[.34,.14,7.90],'stone');
  const rise=C.roofRise[index],edge=3.91,front=.06,rear=-depth;
  if(stats.roof==='front-gable'){
    quad('roof-slope-left',[front,h,-edge],[rear,h,-edge],[rear,h+rise,0],[front,h+rise,0],'slate');
    quad('roof-slope-right',[front,h+rise,0],[rear,h+rise,0],[rear,h,edge],[front,h,edge],'slate');
    triangle('front-gable',[.015,h,edge],[.015,h,-edge],[.015,h+rise,0],brick);
    triangle('back-gable',[rear,h,-edge],[rear,h,edge],[rear,h+rise,0],brick);
    for(const side of[-1,1])beam(`gable-rake-${side}`,[.055,h+.035,side*3.83],[.055,h+rise-.015,0],.075,'stone');
    beam('roof-ridge',[front,h+rise+.025,0],[rear+.08,h+rise+.025,0],.10,'slate');
  }else{
    const ridge=-depth/2;
    quad('roof-front-slope',[front,h,-edge],[ridge,h+rise,-edge],[ridge,h+rise,edge],[front,h,edge],'slate');
    quad('roof-back-slope',[rear,h,edge],[ridge,h+rise,edge],[ridge,h+rise,-edge],[rear,h,-edge],'slate');
    for(const side of[-1,1])triangle(`party-roof-gable-${side}`,[side<0?front:rear,h,side*edge],[side<0?rear:front,h,side*edge],[ridge,h+rise,side*edge],brick);
    beam('roof-ridge',[ridge,h+rise+.025,-3.83],[ridge,h+rise+.025,3.83],.10,'slate');
  }
  if(deed%2===0){
    const x=-depth*.66,dz=2.10,roofY=h+rise*(stats.roof==='front-gable'?1-Math.abs(dz)/edge:1-Math.abs((x+depth/2)/(depth/2)));
    box('attached-chimney-stack',[x,roofY+.53,dz],[.72,1.22,.94],'darkBrick');
    box('chimney-stone-cap',[x,roofY+1.18,dz],[.86,.12,1.07],'stone');
    for(const side of[-1,1])cylinder(`chimney-pot-${side}`,[x,roofY+1.39,dz+side*.24],.10,.30,'terracotta');
  }
  beam('front-gutter',[.16,h+.025,-3.80],[.16,h+.025,3.80],.065,'steel');
  cylinder('downpipe',[.19,(h-.12)/2,3.58],.043,h-.20,'steel');
  for(const y of[1.0,4.0,7.0,10.0].filter(y=>y<h))box(`downpipe-bracket-${y}`,[.11,y,3.58],[.18,.055,.12],'steel');
  if(stats.triangles>C.maximumTrianglesPerDeed)throw Error(`Shop deed ${deed} exceeded its ${C.maximumTrianglesPerDeed}-triangle budget: ${stats.triangles}`);
  return stats;
}
