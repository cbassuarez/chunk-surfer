// Eight original, independent inspection/workbench assets. No source-pack
// extraction, no whole-item manifest rewrite, no shared composite kit model.
import {mkdir} from 'node:fs/promises';
import {Document,NodeIO} from '@gltf-transform/core';
import {KHRMaterialsTransmission,KHRMaterialsIOR,KHRMaterialsVolume} from '@gltf-transform/extensions';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {mergeVertices,mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {vanKitModel} from '../src/data/van-kit-models.js';
import {witnessModelInternals,witnessReplacementPlate} from './witness-model-details.mjs';
import {benchAmplifier,benchFlashlight,benchFaceplate} from './bench-model-details.mjs';

const out='public/assets/items',io=new NodeIO().registerExtensions([KHRMaterialsTransmission,KHRMaterialsIOR,KHRMaterialsVolume]);await mkdir(out,{recursive:true});
const selected=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
if(selected?.some(id=>!vanKitModel(id)))throw new Error('Unknown van-kit target');
const colors={
  shell:['#4e5846',.72,.18],enamel:['#25332c',.53,.3],olive:['#77815b',.7,.12],
  graphite:['#29312c',.64,.2],rubber:['#0e140f',.98,0],leather:['#151b16',.9,0],
  foam:['#080c09',1,0],foamEdge:['#171d17',1,0],steel:['#afb3a8',.32,.85],
  machined:['#d0d2c0',.26,.78],brass:['#a99155',.45,.7],mesh:['#8f9c8c',.44,.7],
  ink:['#cfceaf',.86,0],darkInk:['#28312b',.92,0],red:['#ad624c',.6,.04],
  amber:['#c6a25c',.65,.06],blue:['#6e929d',.65,.05],cable:['#313a30',.9,0],
  'recorder-faceplate':['#bfc2b5',.48,.68],glass:['#14251c',.20,.13],
  'recorder-button-rec':['#bc6b57',.50,.01],'recorder-button-stop':['#bcbda9',.57,.01],'recorder-button-takes':['#c9a151',.54,.01],
  'recorder-ink':['#28312b',.94,0],'vfd-passive':['#243c2c',1,0],
  'vfd-label':['#8fcd87',.85,0],'vfd-counter':['#b4f4e6',.7,0],'vfd-cursor':['#f39864',.75,0],
  'recorder-cover-glass':['#547660',.14,.05],
  'witness-polymer':['#f5efe0',.035,0],'witness-pcb':['#193e32',.64,.12],
  'witness-copper':['#b68751',.35,.72],'witness-capacitor':['#bdc1b6',.26,.83],
  'witness-cream':['#d7cbb1',.58,0],'witness-oxblood':['#814a43',.53,0],
  'witness-amber':['#be8750',.4,0],'witness-ink':['#e6ddc5',.8,0],
  'witness-sleeve':['#6a7365',.55,0],'witness-service-paper':['#bfb69a',1,0],
  'amp-faceplate':['#b9beb4',.46,.7],'amp-low-draw':['#69785c',.57,.28],
  'amp-headroom':['#303a36',.49,.48],'flashlight-housing':['#48534b',.48,.46],
  'flashlight-reflector':['#dbe0d5',.12,.95],'flashlight-lens':['#e4eee5',.1,0],
  'flashlight-emitter':['#d9c995',.6,0],
  'faceplate-aluminum':['#bfc2b5',.48,.68],'faceplate-black':['#303731',.52,.64],
  'faceplate-olive':['#77815b',.59,.25],
};
const glyphs={
 A:[[[0,0],[.3,1],[.6,0]],[[.12,.4],[.48,.4]]],B:[[[0,0],[0,1],[.4,1],[.6,.85],[.6,.65],[.4,.5],[0,.5]],[[.4,.5],[.6,.35],[.6,.15],[.4,0],[0,0]]],
 C:[[[.6,.85],[.45,1],[.15,1],[0,.85],[0,.15],[.15,0],[.45,0],[.6,.15]]],D:[[[0,0],[0,1],[.35,1],[.6,.75],[.6,.25],[.35,0],[0,0]]],
 E:[[[.6,1],[0,1],[0,0],[.6,0]],[[0,.5],[.46,.5]]],F:[[[0,0],[0,1],[.6,1]],[[0,.5],[.46,.5]]],
 G:[[[.6,.8],[.45,1],[.15,1],[0,.85],[0,.15],[.15,0],[.6,0],[.6,.48],[.3,.48]]],H:[[[0,0],[0,1]],[[.6,0],[.6,1]],[[0,.5],[.6,.5]]],
 I:[[[.3,0],[.3,1]]],J:[[[.6,1],[.6,.15],[.45,0],[.15,0],[0,.15]]],K:[[[0,0],[0,1]],[[.6,1],[0,.5],[.6,0]]],
 L:[[[0,1],[0,0],[.6,0]]],M:[[[0,0],[0,1],[.3,.45],[.6,1],[.6,0]]],N:[[[0,0],[0,1],[.6,0],[.6,1]]],
 O:[[[.15,0],[0,.15],[0,.85],[.15,1],[.45,1],[.6,.85],[.6,.15],[.45,0],[.15,0]]],P:[[[0,0],[0,1],[.45,1],[.6,.85],[.6,.65],[.45,.5],[0,.5]]],
 Q:[[[.15,0],[0,.15],[0,.85],[.15,1],[.45,1],[.6,.85],[.6,.15],[.45,0],[.15,0]],[[.35,.2],[.7,-.1]]],
 R:[[[0,0],[0,1],[.45,1],[.6,.85],[.6,.65],[.45,.5],[0,.5]],[[.29,.5],[.6,0]]],
 S:[[[.6,.85],[.45,1],[.15,1],[0,.85],[0,.65],[.15,.5],[.45,.5],[.6,.35],[.6,.15],[.45,0],[.15,0],[0,.15]]],
 T:[[[0,1],[.6,1]],[[.3,1],[.3,0]]],U:[[[0,1],[0,.15],[.15,0],[.45,0],[.6,.15],[.6,1]]],V:[[[0,1],[.3,0],[.6,1]]],
 W:[[[0,1],[.12,0],[.3,.55],[.48,0],[.6,1]]],X:[[[0,1],[.6,0]],[[0,0],[.6,1]]],Y:[[[0,1],[.3,.5],[.6,1]],[[.3,.5],[.3,0]]],Z:[[[0,1],[.6,1],[0,0],[.6,0]]],
 0:[[[.15,0],[0,.15],[0,.85],[.15,1],[.45,1],[.6,.85],[.6,.15],[.45,0],[.15,0]],[[.1,.15],[.5,.85]]],1:[[[.1,.8],[.3,1],[.3,0]],[[.08,0],[.52,0]]],
 2:[[[0,.8],[.15,1],[.45,1],[.6,.8],[.6,.65],[0,0],[.6,0]]],3:[[[0,1],[.45,1],[.6,.8],[.6,.65],[.3,.5],[.6,.35],[.6,.2],[.45,0],[0,0]]],
 4:[[[.5,0],[.5,1],[0,.35],[.6,.35]]],5:[[[.6,1],[0,1],[0,.5],[.45,.5],[.6,.35],[.6,.15],[.45,0],[0,0]]],
 6:[[[.6,1],[.2,1],[0,.7],[0,.15],[.15,0],[.45,0],[.6,.15],[.6,.4],[.45,.55],[0,.55]]],7:[[[0,1],[.6,1],[.15,0]]],
 8:[[[.15,.5],[0,.65],[0,.85],[.15,1],[.45,1],[.6,.85],[.6,.65],[.15,.5],[0,.35],[0,.15],[.15,0],[.45,0],[.6,.15],[.6,.35],[.45,.5],[.15,.5]]],
 9:[[[.6,.45],[.15,.45],[0,.6],[0,.85],[.15,1],[.45,1],[.6,.85],[.6,.15],[.45,0],[0,0]]],'-':[[[.06,.5],[.54,.5]]],
};
function roundedRect(w,h,r=.05){
 const s=new THREE.Shape(),x=-w/2,y=-h/2;r=Math.min(r,w/2,h/2);
 s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
 s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
function holeRect(x,y,w,h,r=.04){const p=new THREE.Path();p.setFromPoints(roundedRect(w,h,r).getPoints(5).map(p=>new THREE.Vector2(p.x+x,p.y+y)));return p;}
function ellipse(rx,ry){const s=new THREE.Shape();s.absellipse(0,0,rx,ry,0,Math.PI*2,false);return s;}
function ovalHole(rx,ry){const h=new THREE.Path();h.absellipse(0,0,rx,ry,0,Math.PI*2,true);return h;}

async function build(id,make){
 if(selected&&!selected.includes(id))return;
 const spec=vanKitModel(id),doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene(id),root=doc.createNode(id);scene.addChild(root);
 const materials=Object.fromEntries(Object.entries(colors).map(([name,[hex,roughness,metalness]])=>{
  const c=new THREE.Color(hex),mat=doc.createMaterial(name).setBaseColorFactor([c.r,c.g,c.b,1]).setRoughnessFactor(roughness).setMetallicFactor(metalness);
  if(['vfd-label','vfd-counter','vfd-cursor'].includes(name))mat.setEmissiveFactor([c.r*.42,c.g*.42,c.b*.42]);
  if(name==='recorder-cover-glass')mat.setBaseColorFactor([c.r,c.g,c.b,.09]).setAlphaMode('BLEND');
  if(name==='witness-polymer'){
    mat.setExtension('KHR_materials_transmission',doc.createExtension(KHRMaterialsTransmission).createTransmission().setTransmissionFactor(.98));
    mat.setExtension('KHR_materials_ior',doc.createExtension(KHRMaterialsIOR).createIOR().setIOR(1.49));
    mat.setExtension('KHR_materials_volume',doc.createExtension(KHRMaterialsVolume).createVolume().setThicknessFactor(.025).setAttenuationColor([.98,.965,.91]).setAttenuationDistance(1.5));
  }
  if(name==='flashlight-lens'){
    mat.setExtension('KHR_materials_transmission',doc.createExtension(KHRMaterialsTransmission).createTransmission().setTransmissionFactor(.91));
    mat.setExtension('KHR_materials_ior',doc.createExtension(KHRMaterialsIOR).createIOR().setIOR(1.49));
  }
  return[name,mat];
 }));
 const cache=new Map(),geos=new Map(),bounds=new THREE.Box3();let parent=root,world=new THREE.Matrix4(),pieces=0,triangles=0;
 const geometry=(key,create)=>{if(!geos.has(key))geos.set(key,create());return geos.get(key);};
 function add(g,material,p=[0,0,0],rotation=[0,0,0],name='part'){
  let primitive=cache.get(g);if(!primitive){
   const packed=g.index?g:mergeVertices(g,1e-6);
   primitive=doc.createPrimitive();
   for(const [attribute,semantic,type]of[['position','POSITION','VEC3'],['normal','NORMAL','VEC3'],...(name==='recorder-display-substrate'?[['uv','TEXCOORD_0','VEC2']]:[])]){const a=packed.getAttribute(attribute);if(a)primitive.setAttribute(semantic,doc.createAccessor().setType(type).setArray(new Float32Array(a.array)).setBuffer(buffer));}
   if(packed.index)primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(packed.attributes.position.count<65536?new Uint16Array(packed.index.array):new Uint32Array(packed.index.array)).setBuffer(buffer));
   cache.set(g,primitive);
  }
  const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),mesh=doc.createMesh(name).addPrimitive(primitive.clone().setMaterial(materials[material]));
  const node=doc.createNode(name).setMesh(mesh).setTranslation(p).setRotation(quaternion.toArray());parent.addChild(node);
  const transform=world.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...p),quaternion,new THREE.Vector3(1,1,1))),positions=g.attributes.position;
  for(let i=0;i<positions.count;i++)bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(transform));
  pieces++;triangles+=(g.index?.count||g.attributes.position.count)/3;return node;
 }
 function group(p,rotation,name,fn){
  const oldParent=parent,oldWorld=world,q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  const node=doc.createNode(name).setTranslation(p).setRotation(q.toArray());parent=node;oldParent.addChild(parent);
  world=world.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...p),q,new THREE.Vector3(1,1,1)));fn();parent=oldParent;world=oldWorld;
  return node;
 }
 const box=(p,s,m='shell',r=[0,0,0],bevel=.02,name='formed-shell')=>add(geometry(`box:${s}:${bevel}`,()=>bevel?new RoundedBoxGeometry(...s,1,Math.min(bevel,...s.map(v=>v*.3))):new THREE.BoxGeometry(...s)),m,p,r,name);
 const cylinder=(p,r,h,m='steel',rot=[0,0,0],n=32,r2=r,name='machined-barrel')=>add(geometry(`cyl:${r}:${r2}:${h}:${n}`,()=>new THREE.CylinderGeometry(r,r2,h,n)),m,p,rot,name);
 const ring=(p,r,t,m='steel',rot=[Math.PI/2,0,0],n=48,name='rolled-ring')=>add(geometry(`torus:${r}:${t}:${n}`,()=>new THREE.TorusGeometry(r,t,5,n)),m,p,rot,name);
 const tube=(points,r=.018,m='cable',name='cable',segments=32)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v))),segments,r,5,false),m,undefined,undefined,name);
 const plate=(s,depth,p,m='steel',r=[0,0,0],bevel=.008,name='formed-plate')=>{
  const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:s.curves.some(c=>c.type==='EllipseCurve')?24:12,steps:1});g.translate(0,0,-depth/2);return add(g,m,p,r,name);
 };
 function ovalRing(p,rx,ry,t,m='leather',name='ear-cushion'){
  // True open elliptical cushion, with rounded leather section and a seam.
  const g=new THREE.TorusGeometry(1,t,8,64),a=g.attributes.position;
  for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),angle=Math.atan2(y,x),radial=Math.hypot(x,y)-1;a.setXYZ(i,Math.cos(angle)*(rx+radial),Math.sin(angle)*(ry+radial),a.getZ(i));}
  g.computeVertexNormals();return add(g,m,p,undefined,name);
 }
 function screw(p,r=.025,rot=[0,0,0]){group(p,rot,'slotted-fastener',()=>{
  cylinder([0,0,0],r*1.18,.008,'rubber',[Math.PI/2,0,0],20);cylinder([0,0,.006],r,.012,'steel',[Math.PI/2,0,0],20);
  box([0,0,.013],[r*1.45,r*.2,.003],'darkInk',[0,0,.54],.002,'screw-slot');
 });}
 function label(value,p,size=.035,m='ink',r=[0,0,0]){
  group(p,r,`etched-legend:${value}`,()=>{
   const strokes=[];
   for(const [i,char]of[...value].entries())for(const line of glyphs[char]||[]){
    const points=line.map(([x,y])=>new THREE.Vector2((i*.84+x)*size,y*size));
    const geom=SVGLoader.pointsToStroke(points,SVGLoader.getStrokeStyle(size*.075,'#fff','round','round'),2);
    if(geom)strokes.push(geom);
   }
   if(strokes.length)add(mergeGeometries(strokes),m,undefined,undefined,'continuous-etched-lettering');
  });
 }
 function jack(p,r=.055,rot=[0,0,0]){group(p,rot,'open-cable-receptacle',()=>{
  const s=ellipse(r,r);s.holes.push(ovalHole(r*.55,r*.55));plate(s,.025,[0,0,0],'steel',undefined,.004,'jack-mouth-aperture');
  cylinder([0,0,-.023],r*.54,.009,'rubber',[Math.PI/2,0,0],24,undefined,'jack-recessed-throat');
 });}
 function plug(p,rotation=[0,0,0]){group(p,rotation,'quarter-inch-plug',()=>{
  cylinder([0,0,0],.043,.20,'graphite',undefined,24);for(let i=0;i<5;i++)ring([0,-.065+i*.028,0],.044,.005,'rubber',undefined,24);
  cylinder([0,.14,0],.024,.12,'steel',undefined,24);for(const y of[.115,.153])ring([0,y,0],.024,.0035,'rubber',undefined,24);
  cylinder([0,.213,0],.02,.025,'steel',undefined,20,.011);label('AC',[-.024,-.025,.044],.027,'ink');
 });}
 const tools={add,group,box,cylinder,ring,tube,plate,ovalRing,screw,label,jack,plug,roundedRect,holeRect};
 make(tools);
 root.setTranslation([-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2]);
 root.setExtras({name:spec.name,authorship:'Original AUDIOCORP field-kit geometry',source:'scripts/build-van-kit-models.mjs',origin:'floor-center',up:'Y',pieces,triangles:Math.round(triangles),bounds:bounds.getSize(new THREE.Vector3()).toArray()});
 await io.write(`${out}/${id}.glb`,doc);console.log(`${id}: ${pieces} parts / ${Math.round(triangles)} triangles / extents ${bounds.getSize(new THREE.Vector3()).toArray().map(v=>v.toFixed(2)).join(' × ')}`);
}

function headphones(variant,g){
 const {group,box,cylinder,ring,tube,plate,ovalRing,screw,label,jack,plug}=g;
 const closed=variant==='closed',open=variant==='open',rx=open?.285:closed?.272:.238,ry=open?.365:closed?.343:.295;
 group([0,0,0],[0,.32,0],`headphones-${variant}-assembly`,()=>{
  // Laminar sprung band, not a round hose. A broad stitched suspension pad
  // sits below two visible steel edges; the opening remains completely clear.
  const strap=(radX,radY,width,thickness,material,z=0,name='sprung-headband')=>{
   const outer=[],inner=[];for(let i=0;i<=44;i++){const a=.03+i/44*(Math.PI-.06);outer.push(new THREE.Vector2(Math.cos(a)*radX,Math.sin(a)*radY));inner.push(new THREE.Vector2(Math.cos(a)*(radX-thickness),Math.sin(a)*(radY-thickness)));}
   const s=new THREE.Shape([...outer,...inner.reverse()]);plate(s,width,[0,-.15,z],material,undefined,.004,name);
  };
  strap(.765,.985,.176,.048,'steel',0,'spring-steel-headband');
  strap(.741,.957,.19,.054,'leather',0,'padded-headband');
  for(const z of[-.077,.077]){
   const stitch=[];for(let i=0;i<=40;i++){const a=.15+i/40*(Math.PI-.3);stitch.push([Math.cos(a)*.75,Math.sin(a)*.971-.15,z]);}
   tube(stitch,.0025,'ink','headband-stitched-edge',40);
  }
  for(const side of[-1,1]){
   box([side*.737,-.10,0],[.105,.31,.12],'graphite',[0,0,side*.10],.022,'height-adjustment-block');
   box([side*.737,-.24,.012],[.037,.34,.043],'steel',[0,0,side*.10],.007,'exposed-height-slide');
   for(let i=0;i<4;i++)box([side*.758,-.10-i*.031,.070],[.030,.003,.003],'ink',undefined,0,'height-index');
   screw([side*.73,-.20,.073],.023);
   group([side*.655,-.405,0],[0,side*Math.PI/2,side*.075],`${side<0?'left':'right'}-earcup`,()=>{
    const body=ellipse(rx+.020,ry+.020);body.holes.push(ovalHole(rx-.052,ry-.052));
    plate(body,closed?.20:.125,[0,0,0],open?'olive':closed?'graphite':'steel',undefined,.012,'hollow-earcup-shell');
    ovalRing([0,0,-.115],rx-.022,ry-.018,closed?.070:.052,'leather','open-ear-cushion');
    ovalRing([0,0,-.151],rx-.023,ry-.017,.005,'rubber','cushion-stitched-seam');
    const membrane=ellipse(rx-.063,ry-.063);plate(membrane,.004,[0,0,-.055],'rubber',undefined,0,'recessed-driver-diaphragm');
    for(let i=-4;i<=4;i++){
     const yy=i*(ry-.07)/5,half=(rx-.07)*Math.sqrt(1-(yy/(ry-.063))**2);
     box([0,yy,-.059],[half*2,.006,.003],'foamEdge',undefined,0,'inner-driver-grille');
    }
    if(open){
     // Open-back lattice has actual air between wires and a visible driver.
     const back=ellipse(rx,ry);back.holes.push(ovalHole(rx-.028,ry-.028));
     plate(back,.025,[0,0,.09],'steel',undefined,.004,'open-back-grille-rim');
     for(let i=-8;i<=8;i++){
      const yy=i*ry/9,half=(rx-.029)*Math.sqrt(Math.max(0,1-(yy/(ry-.025))**2));
      if(half>.02)tube([[-half,yy,.112],[0,yy,.132],[half,yy,.112]],.0033,'mesh','open-back-mesh-horizontal',10);
      const xx=i*rx/9,high=(ry-.029)*Math.sqrt(Math.max(0,1-(xx/(rx-.025))**2));
      if(high>.02)tube([[xx,-high,.112],[xx,0,.132],[xx,high,.112]],.0033,'mesh','open-back-mesh-vertical',10);
     }
     cylinder([0,0,.035],.09,.03,'brass',[Math.PI/2,0,0],32,undefined,'visible-motor-cap');
    }else{
     const back=ellipse(rx-.010,ry-.010);plate(back,closed?.063:.025,[0,0,closed?.128:.078],closed?'enamel':'machined',undefined,.012,'sealed-cup-back');
     const disk=ellipse(rx*.62,ry*.63);plate(disk,.007,[0,0,closed?.173:.106],closed?'graphite':'graphite',undefined,.008,'manufacturer-medallion');
     label('AUDIOCORP',[-rx*.49,.015,closed?.187:.12],.034,'ink');
     label(closed?'HM-2':'HM-1',[-.072,-.06,closed?.187:.12],.030,'ink');
     box([0,-.112,closed?.19:.124],[.08,.007,.003],closed?'red':'blue',undefined,.002,'variant-inlay');
    }
    // Flat-sided U yoke is visibly clear of the floating earcup.
    tube([[-rx-.035,-.07,.015],[-rx-.077,.09,.015],[-rx-.055,ry+.056,.015],[0,ry+.098,.015],[rx+.055,ry+.056,.015],[rx+.077,.09,.015],[rx+.035,-.07,.015]],.016,'steel','floating-fork-yoke',30);
    for(const x of[-rx-.03,rx+.03])screw([x,-.07,.036],.025);
    label(side<0?'L':'R',[-.009,ry+.019,.032],.026,'darkInk');
    if(side<0)jack([0,-ry-.02,.05],.042,[Math.PI/2,0,0]);
   });
  }
  // The lead is its own continuous physical cable with a strain relief,
  // loose service coil and metal TRS tip; it is not a line drawn on the item.
  const cord=[[-.67,-.75,.06],[-.78,-.87,.12],[-.80,-.93,.21]];
  for(let i=0;i<=180;i++){const t=i/180,a=t*Math.PI*18;cord.push([-.74+t*.87, -1.025+Math.cos(a)*.052, .20+Math.sin(a)*.052]);}
  cord.push([.23,-1.04,.18],[.44,-1.08,.18],[.52,-.99,.18]);tube(cord,.010,'cable','continuous-coiled-lead',220);
  plug([.53,-.88,.18],[0,0,-.24]);
 });
}

function capsule(g,{radius=.16,length=.41,material='mesh',name='woven-capsule'}={}){
 const {cylinder,ring,tube}=g;
 cylinder([0,-length*.025,0],radius*.73,length*.73,'rubber',undefined,28,undefined,'recessed-capsule-interior');
 cylinder([0,.015,0],radius*.53,length*.46,'brass',undefined,28,undefined,'polarized-diaphragm');
 // Convex silver wire lattice, not a opaque cylinder with a mesh texture.
 const rAt=y=>radius*(.86+.14*Math.cos(y/(length*.53)*Math.PI/2));
 for(let i=0;i<40;i++){
  const angle=i/40*Math.PI*2,points=[];
  for(let j=0;j<=14;j++){const y=-length*.5+j/14*length,r=rAt(y);points.push([Math.cos(angle)*r,y,Math.sin(angle)*r]);}
  tube(points,.00135,material,`${name}-vertical-wire`,14);
 }
 for(let i=0;i<=24;i++){const y=-length*.5+i/24*length;ring([0,y,0],rAt(y),.00135,material,undefined,40,`${name}-cross-wire`);}
 ring([0,-length*.51,0],radius*.86,.012,'steel',undefined,40,'rolled-grille-bottom');
 ring([0,length*.51,0],radius*.86,.008,'steel',undefined,40,'rolled-grille-top');
 // A domed end screen closes only the wire, leaving visible interstices.
 for(let i=-7;i<=7;i++){
  const x=i*radius*.105,z=Math.sqrt(Math.max(0,(radius*.85)**2-x*x));
  tube([[x,length*.515,-z],[x,length*.56,0],[x,length*.515,z]],.00135,material,'capsule-end-screen',8);
  tube([[-z,length*.515,x],[0,length*.56,x],[z,length*.515,x]],.00135,material,'capsule-end-cross-screen',8);
 }
}
function microphone(variant,g){
 const {group,box,cylinder,ring,tube,plate,screw,label,jack}=g;
 const reference=variant==='reference',directional=variant==='directional';
 group([0,0,0],[0,-.25,0],`microphone-${variant}-assembly`,()=>{
  const stemR=reference?.115:directional?.072:.091,stemH=reference?.54:.50;
  cylinder([0,-.24,0],stemR,stemH,'enamel',undefined,40,stemR*.86,'tapered-microphone-body');
  ring([0,-.24-stemH/2,0],stemR*.86,.014,'steel',undefined,40,'connector-lock-ring');
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;box([Math.cos(a)*(stemR*.88),-.24-stemH/2+.02,Math.sin(a)*(stemR*.88)],[.007,.038,.007],'graphite',[0,-a,0],.002,'connector-knurl');}
  group([0,-.24-stemH/2-.018,0],[Math.PI/2,0,0],'recessed-XLR-base',()=>{
   jack([0,0,0],stemR*.67);for(const[x,y]of[[-.020,.012],[.020,.012],[0,-.022]])cylinder([x,y,.003],.006,.028,'brass',[Math.PI/2,0,0],12,undefined,'XLR-contact-pin');
  });
  label('AUDIOCORP',[-stemR*.74,-.29,stemR*.94],reference?.023:.016,'ink');
  label(reference?'CM-1':directional?'CM-2':'CM-3',[-stemR*.40,-.35,stemR*.974],reference?.022:.017,'ink');
  box([0,-.39,stemR*.97],[stemR*.55,.008,.004],reference?'blue':directional?'amber':'red',undefined,.002,'pattern-color-index');
  if(reference){
   cylinder([0,.12,0],.166,.13,'steel',undefined,40,.118,'formed-capsule-shoulder');
   group([0,.38,0],[0,0,0],'large-diaphragm-capsule',()=>capsule(g,{radius:.172,length:.40}));
   // Open spider with crossed elastic, resilient suspension, and real mounting
   // socket; the center/body does not fill its outer ring.
   for(const y of[-.04,-.23])ring([0,y,0],.236,.012,'graphite',undefined,48,'shockmount-outer-ring');
   for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2,b=a+.46;
    tube([[Math.cos(a)*.232,-.23,Math.sin(a)*.232],[Math.cos(b)*.133,-.135,Math.sin(b)*.133],[Math.cos(a)*.232,-.04,Math.sin(a)*.232]],.006,'rubber','crossed-suspension-elastic',10);
   }
   box([0,-.16,-.245],[.11,.22,.08],'graphite',undefined,.024,'shockmount-hinge');
   cylinder([0,-.27,-.274],.038,.15,'steel',[0,0,0],24,undefined,'stand-thread-socket');
  }else if(directional){
   cylinder([0,.055,0],.082,.10,'steel',undefined,32,.073,'interference-tube-collar');
   // The interference tube is assembled from longitudinal shell webs and
   // spaced annular bands: all the side slots are genuine apertures.
   cylinder([0,.39,0],.034,.61,'rubber',undefined,24,undefined,'recessed-interference-core');
   for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2;
    box([Math.cos(a)*.076,.39,Math.sin(a)*.076],[.014,.64,.010],'graphite',[0,-a,0],.004,'interference-tube-web');
   }
   for(let i=0;i<10;i++)ring([0,.075+i*.070,0],.076,.009,'steel',undefined,40,'interference-slot-band');
   group([0,.79,0],[0,0,0],'shotgun-front-capsule',()=>capsule(g,{radius:.075,length:.13}));
   box([0,-.05,.078],[.030,.049,.014],'rubber',undefined,.006,'low-cut-slide-switch');
   label('80',[-.017,-.105,.079],.016,'ink');
  }else{
   cylinder([0,.045,0],.112,.10,'steel',undefined,36,.09,'stereo-head-collar');
   for(const side of[-1,1])group([side*.045,.15,side*.025],[0,side*.20,side*-.61],`${side<0?'left':'right'}-XY-capsule`,()=>{
    cylinder([0,.055,0],.076,.23,'steel',undefined,32,.058,'angled-capsule-body');
    ring([0,.11,0],.078,.010,side<0?'red':'blue',undefined,32,'stereo-channel-ring');
    group([0,.252,0],[0,0,0],'small-diaphragm-capsule',()=>capsule(g,{radius:.084,length:.175}));
    label(side<0?'L':'R',[-.010,.011,.078],.025,'darkInk');
   });
   const s=roundedRect(.29,.13,.035);plate(s,.045,[0,.075,0],'graphite',[Math.PI/2,0,0],.012,'stereo-junction-yoke');
   for(const side of[-1,1])screw([side*.10,.078,.070],.019);
  }
 });
}

function fieldCase(g){
 const {group,box,cylinder,ring,tube,plate,screw,label}=g;
 // Molded suitcase with separate lid, base pan, extrusion, hinges and foam.
 // Every cutout is a hole through the foam slab, above a recessed fabric floor.
 group([0,0,0],[0,-.18,0],'open-field-case-assembly',()=>{
  const outer=roundedRect(2.40,1.55,.16),inside=holeRect(0,0,2.19,1.34,.11);outer.holes.push(inside);
  plate(outer,.45,[0,.27,0],'shell',[Math.PI/2,0,0],.025,'open-base-pan');
  box([0,.042,0],[2.29,.075,1.45],'graphite',undefined,.08,'base-pan-floor');
  const lip=roundedRect(2.405,1.555,.16);lip.holes.push(holeRect(0,0,2.275,1.425,.12));
  plate(lip,.035,[0,.51,0],'steel',[Math.PI/2,0,0],.006,'anodized-base-lip');
  const gasket=roundedRect(2.31,1.46,.13);gasket.holes.push(holeRect(0,0,2.26,1.41,.11));
  plate(gasket,.022,[0,.492,0],'rubber',[Math.PI/2,0,0],.003,'continuous-base-gasket');
  box([0,.19,0],[2.15,.06,1.29],'rubber',undefined,.04,'recessed-fabric-floor');
  const foam=roundedRect(2.16,1.31,.09);
  const cutouts=[
   {x:-.65,z:-.22,w:.68,h:.53,id:'recorder'},{x:.14,z:-.22,w:.68,h:.53,id:'survey-indicator'},
   {x:.75,z:-.22,w:.23,h:.67,id:'radio'},{x:-.48,z:.39,w:.93,h:.24,id:'microphone'},
   {x:.47,z:.40,w:.78,h:.25,id:'headphone-lead'},
  ];
  for(const hole of cutouts)foam.holes.push(holeRect(hole.x,hole.z,hole.w,hole.h,.055));
  plate(foam,.195,[0,.349,0],'foam',[Math.PI/2,0,0],.005,'fitted-foam-with-five-real-cutouts');
  // Upper cut edges catch light, while the aperture walls continue down to
  // the fabric floor. Labels live on little paper strip pockets beside bays.
  for(const hole of cutouts){
   const edge=roundedRect(hole.w+.030,hole.h+.030,.062);edge.holes.push(holeRect(0,0,hole.w,hole.h,.053));
   plate(edge,.004,[hole.x,.452,hole.z],'foamEdge',[Math.PI/2,0,0],0,`foam-cut-edge:${hole.id}`);
  }
  for(const[x,text]of[[-.96,'DA-1000'],[-.15,'SI-1'],[.70,'RADIO']]){
   box([x+.14,.456,.58],[.29,.008,.066],'ink',undefined,.006,'bay-label-tape');
   label(text,[x+.022,.462,.603],.025,'darkInk',[-Math.PI/2,0,0]);
  }
  // Separate rear hinges and lid, opened 108 degrees. Its inner foam is a
  // real molded relief, with a raised perimeter seal and restrained branding.
  for(const x of[-.75,.75]){
   for(const z of[-.745,-.795])box([x,.42,z],[.28,.13,.035],'steel',undefined,.015,'hinge-leaf');
   cylinder([x,.51,-.765],.042,.30,'steel',[0,0,Math.PI/2],24,undefined,'hinge-pin');
  }
  const lid=group([0,.50,-.77],[-.31,0,0],'open-lid-hinge',()=>{
   // The hinge closes at +PI/2. Its complete footprint reaches the front
   // gasket; this solid outside shell hides every interior when closed.
   box([0,.775,-.059],[2.42,1.56,.115],'shell',undefined,.095,'formed-lid-shell');
   box([0,.775,.005],[2.27,1.40,.04],'rubber',undefined,.08,'lid-gasket-bed');
   const lip=roundedRect(2.43,1.585,.135);lip.holes.push(holeRect(0,0,2.29,1.445,.095));
   plate(lip,.027,[0,.775,.041],'steel',undefined,.005,'anodized-lid-lip');
   const bays=[
    {id:'headphones',x:0,y:.82,w:.88,h:1.08,d:.18},
    {id:'amp',x:-.81,y:.72,w:.47,h:.66,d:.18},
    {id:'flashlight',x:.81,y:.72,w:.25,h:1.0,d:.17},
   ];
   const lidFoam=roundedRect(2.15,1.32,.07);
   for(const bay of bays)lidFoam.holes.push(holeRect(bay.x,bay.y-.775,bay.w,bay.h,.048));
   plate(lidFoam,.095,[0,.775,.055],'foam',undefined,.004,'lid-acoustic-foam');
   for(const bay of bays){
    const edge=roundedRect(bay.w+.034,bay.h+.034,.058);edge.holes.push(holeRect(0,0,bay.w,bay.h,.048));
    plate(edge,.009,[bay.x,bay.y,.107],'foamEdge',undefined,.002,`lid-cradle-edge:${bay.id}`);
    group([bay.x,bay.y,.14],[0,0,0],`packing-bay:${bay.id}`,()=>{}).setExtras({plane:'XY',front:'+Z',maxWidth:bay.w,maxHeight:bay.h,maxDepth:bay.d});
   }
   // Short compression ribs remain only between the actual storage cutouts.
   for(const x of[-.555,.555])box([x,.77,.107],[.084,1.13,.052],'foamEdge',undefined,.019,'molded-lid-foam-rib');
   box([0,1.454,.084],[.77,.085,.012],'graphite',undefined,.01,'manufacturer-plate');
   label('AUDIOCORP FC-7',[-.332,1.433,.093],.034,'ink');
   for(const x of[-1.08,1.08])for(const y of[.16,1.39])screw([x,y,.071],.021);
   for(const x of[-.77,.77]){
    box([x,1.543,-.023],[.17,.036,.11],'steel',undefined,.010,'lid-latch-catch');
    cylinder([x,1.553,.018],.016,.17,'steel',[0,0,Math.PI/2],20,undefined,'lid-latch-catch-pin');
   }
   // Outside has back panels and contact feet; rotation never reveals an
   // unmodeled blank plane behind a front-only illustration.
   for(const x of[-.86,.86])for(const y of[.27,1.28])box([x,y,-.139],[.30,.20,.08],'rubber',undefined,.034,'lid-protective-foot');
   group([0,.82,-.121],[Math.PI,0,0],'case-outer-branding',()=>{
    box([0,0,0],[.94,.27,.014],'graphite',undefined,.018,'case-outer-brand-plate');
    label('AUDIOCORP',[-.344,.035,.012],.059,'ink');
    label('FC-7 FIELD CASE',[-.290,-.067,.012],.033,'ink');
   });
  });
  lid.setExtras({openAngle:-.31,closedAngle:Math.PI/2,rotationAxis:'X'});
  for(const side of[-1,1]){
   // Nylon lid-retention straps, open space under them.
   tube([[side*1.02,.43,-.27],[side*1.04,.79,-.43],[side*1.015,1.02,-.59]],.017,'rubber','lid-retaining-strap',16);
   for(const z of[-.57,.57])box([side*1.155,.22,z],[.105,.38,.30],'rubber',undefined,.047,'molded-corner-bumper');
  }
  // Front draw latches have pivots and actual latch-loop openings.
  for(const x of[-.77,.77]){
   box([x,.315,.79],[.20,.25,.037],'steel',undefined,.028,'latch-base');
   box([x,.348,.820],[.13,.17,.032],'graphite',undefined,.018,'over-center-latch');
   const loop=roundedRect(.12,.15,.025);loop.holes.push(holeRect(0,0,.075,.105,.015));
   plate(loop,.013,[x,.46,.829],'steel',undefined,.003,'open-latch-loop');
   screw([x,.258,.815],.024);
  }
  for(const x of[-.29,.29])box([x,.285,.82],[.13,.15,.065],'graphite',undefined,.025,'carry-handle-pivot');
  tube([[-.29,.29,.85],[-.26,.19,.96],[-.15,.165,1.00],[.15,.165,1.00],[.26,.19,.96],[.29,.29,.85]],.045,'rubber','formed-carry-handle',28);
  for(const x of[-.83,.83])for(const z of[-.51,.51])box([x,-.012,z],[.31,.075,.24],'rubber',undefined,.029,'case-bottom-foot');
 });
}

function fieldRecorder(g,{witness=false}={}){
 const {group,box,cylinder,ring,tube,plate,screw,label,jack,add}=g;
 const unit=1/300,point=(x,y,z=.273)=>[(x-368)*unit,(202.5-y)*unit,z];
 // Exact 736:405 design proportions and the same three bottom key positions
 // as recorder-instrument.js. This is a single recorder, never a kit composite.
 if(witness){
  box([0,0,-.275],[2.45,1.35,.030],'graphite',undefined,.017,'witness-rear-chassis-floor');
  for(const x of[-1.2,1.2])box([x,0,-.02],[.05,1.35,.50],'graphite',undefined,.013,'witness-open-chassis-side');
  for(const y of[-.65,.65])box([0,y,-.02],[2.36,.05,.50],'graphite',undefined,.013,'witness-open-chassis-crossmember');
  witnessModelInternals(g);
 }else box([0,0,-.04],[2.45,1.35,.50],'graphite',undefined,.057,'recorder-diecast-body');
 box([0,0,-.299],[2.36,1.25,.037],'rubber',undefined,.044,'rear-case-seal');
 const face=roundedRect(712*unit,370*unit,.022);
 const aperture=holeRect(0,(202.5-195.5)*unit,666*unit,239*unit,.013);face.holes.push(aperture);
 if(witness)for(const x of[459.5,558.5,657.5])face.holes.push(holeRect((x-368)*unit,(200-350.5)*unit,91*unit,35*unit,.01));
 plate(face,witness?.025:.032,point(368,200,.232),witness?'witness-polymer':'recorder-faceplate',undefined,.007,'recorder-faceplate-with-optical-aperture');
 const bezel=roundedRect(680*unit,253*unit,.018);bezel.holes.push(holeRect(0,0,670*unit,243*unit,.013));
 plate(bezel,.025,point(368,195.5,.246),'graphite',undefined,.004,'recorder-aperture-cut-edge');
 box(point(368,195.5,.205),[666*unit,239*unit,.050],'rubber',undefined,.012,'recorder-dark-optical-well');
 // A single continuous planar substrate has real UVs for the live stage to
 // supply its actual idle display. No fabricated glowing time/meter readings.
  add(new THREE.PlaneGeometry(651*unit,224*unit),'glass',point(368,195.5,.236),undefined,'recorder-display-substrate');
 group([0,0,0],[0,0,0],'recorder-idle-electrodes',()=>{
  // Powered, empty instrument: zero time, cursor at START, no invented sound
  // level. Live workbench content hides this group before supplying its texture.
  label('TIME COUNTER',point(55,107,.241),10*unit,'vfd-label');
  label('LOCATION INDICATOR',point(360,107,.241),10*unit,'vfd-label');
  const segments=[[[10,1],[37,1],[42,6],[36,11],[11,11],[6,6]],[[40,8],[44,11],[42,33],[37,37],[33,32],[35,14]],[[37,39],[41,43],[39,65],[33,70],[29,65],[32,45]],[[10,65],[28,65],[34,71],[28,76],[7,76],[2,70]],[[3,39],[8,44],[6,63],[1,68],[-2,63],[0,44]],[[7,9],[11,13],[9,31],[4,36],[0,31],[2,13]],[[9,33],[32,33],[37,38],[31,43],[9,43],[4,38]]];
  for(const dx of[56,112,184,240])segments.forEach((polygon,index)=>{
   const s=new THREE.Shape(polygon.map(([x,y])=>new THREE.Vector2((dx+x*1.08-368)*unit,(202.5-124-y*1.08)*unit)));
   add(new THREE.ShapeGeometry(s),index===6?'vfd-passive':'vfd-counter',[0,0,.242],undefined,'zero-counter-electrode');
  });
  for(const y of[153,175])box(point(173,y,.243),[3*unit,3*unit,.001],'vfd-counter',undefined,0,'counter-colon');
  label('MIN',point(88,226,.242),10*unit,'vfd-label');label('SEC',point(208,226,.242),10*unit,'vfd-label');
  for(let i=0;i<=18;i++){
   const x=360+i*17;
   box(point(x,151,.242),[.8*unit,54*unit,.001],'vfd-passive',undefined,0,'location-scale-division');
   if(i%2===0)label(String(i*2.5),point(x-3,199,.242),9*unit,'vfd-label');
  }
  box(point(513,175,.242),[306*unit,.8*unit,.001],'vfd-label',undefined,0,'location-horizontal-guide');
  box(point(360,161,.243),[3*unit,31*unit,.001],'vfd-cursor',undefined,0,'location-start-cursor');
  label('START',point(360,216,.242),9*unit,'vfd-label');label('END',point(644,216,.242),9*unit,'vfd-label');
  label('OUTPUT LEVEL',point(55,254,.242),10*unit,'vfd-label');
  const meterPlates=[];
  for(let i=0;i<68;i++){const p=point(58+i*9.15,268,0);meterPlates.push(new THREE.PlaneGeometry(6*unit,9*unit).translate(...p));}
  add(mergeGeometries(meterPlates),'vfd-passive',[0,0,.242],undefined,'unenergized-output-electrodes');
  for(const[i,mark]of['-48','-36','-24','-12','0'].entries())label(mark,point(55+i*155,294,.242),9*unit,'vfd-label');
 });
 add(new THREE.PlaneGeometry(656*unit,229*unit),'recorder-cover-glass',point(368,195.5,.251),undefined,'recorder-front-cover-glass');
 box(point(368,80,.248),[649*unit,.003,.003],'steel',undefined,.001,'recorder-glass-upper-return');
 box(point(696,195.5,.248),[.002,222*unit,.003],'steel',undefined,.001,'recorder-glass-side-return');
 label('AUDIOCORP',point(35,witness?31:49,witness?.216:.26),(witness?10:14)*unit,witness?'witness-ink':'recorder-ink');
 label(witness?'WITNESS EDITION':'DA-1000',point(witness?295:329,witness?31:49,witness?.216:.26),(witness?8:11)*unit,witness?'witness-ink':'recorder-ink');
 label('FIELD RECORDER',point(586,witness?31:49,witness?.216:.26),(witness?7:9.5)*unit,witness?'witness-ink':'recorder-ink');
 if(!witness){label('RECORD / MONITOR',point(35,350,.26),8.7*unit,'recorder-ink');
 label('VACUUM FLUORESCENT',point(35,366,.26),8.7*unit,'recorder-ink');}
 for(const[x,name,material]of[[459.5,'REC','recorder-button-rec'],[558.5,'STOP','recorder-button-stop'],[657.5,'TAKES','recorder-button-takes']]){
  box(point(x,350.5,.264),[91*unit,35*unit,.019],'graphite',undefined,.010,`transport-${name}-socket`);
  box(point(x,350.5,.278),[89*unit,33*unit,.031],'steel',undefined,.008,`transport-${name}-bezel`);
  group([0,0,0],[0,0,0],`transport-${name}-actuator`,()=>{
   box(point(x,349.7,.302),[81*unit,25*unit,.044],material,undefined,.008,`transport-${name}-cap`);
   label(name,point(x-name.length*4.3,353,.326),9*unit,'darkInk');
   cylinder(point(x+33,350.5,.326),2.4*unit,.002,'amber',[Math.PI/2,0,0],20,undefined,`transport-${name}-lamp`);
  });
 }
 for(const x of[25,711])for(const y of[28,372])screw(point(x,y,.264),6*unit);
 // Deep side-panel audio sockets: the sleeve openings, recessed three-pin
 // microphone input and protected trim shaft are physical interior hardware.
 for(const side of[-1,1])group([side*1.231,0,-.027],[0,side*Math.PI/2,0],`recorder-${side<0?'input':'output'}-side`,()=>{
  box([0,0,0],[.41,1.07,.016],'enamel',undefined,.019,'side-service-panel');
  for(const y of[-.37,.37])screw([0,y,.014],.023);
  if(side<0){
   for(const y of[-.18,.13]){
    jack([0,y,.022],.091);for(const[x,yy]of[[-.035,.017],[.035,.017],[0,-.035]])cylinder([x,y+yy,.010],.007,.019,'brass',[Math.PI/2,0,0],12,undefined,'recessed-XLR-pin');
   }
   label('MIC',[-.047,.261,.022],.030,'ink');
  }else{
   jack([0,.19,.022],.059);label('PHONES',[-.078,.281,.023],.025,'ink');
   cylinder([0,-.17,.041],.075,.046,'rubber',[Math.PI/2,0,0],36,undefined,'monitor-level-knob');
   for(let i=0;i<24;i++){const a=i/24*Math.PI*2;box([Math.cos(a)*.072,-.17+Math.sin(a)*.072,.056],[.009,.018,.023],'graphite',[0,0,a],.002,'monitor-knurl');}
   box([0,-.122,.070],[.006,.027,.003],'ink',undefined,.001,'monitor-level-index');
  }
 });
 group([0,0,-.326],[0,Math.PI,0],'recorder-service-back',()=>{
  box([0,0,0],[2.22,1.13,.033],'enamel',undefined,.026,'rear-service-panel');
  box([.56,-.045,.023],[.87,.84,.020],'graphite',undefined,.022,'removable-field-cell-cover');
  for(const x of[.21,.90])screw([x,-.05,.038],.032);
  label('FIELD CELL', [.25,.269,.037],.038,'ink');
  label('DA-1000',[-.87,.34,.025],.048,'ink');
  label('AUDIOCORP',[-.90,.21,.025],.040,'ink');
  const vent=roundedRect(.90,.34,.023);
  for(let i=0;i<10;i++)vent.holes.push(holeRect(-.377+i*.084,0,.038,.237,.018));
  plate(vent,.016,[-.51,-.225,.031],'steel',undefined,.002,'rear-vent-with-ten-open-slots');
  for(const x of[-.98,.98])for(const y of[-.44,.44])screw([x,y,.025],.025);
 });
 for(const x of[-.95,.95])for(const y of[-.49,.49])box([x,y,-.371],[.26,.15,.066],'rubber',undefined,.023,'recorder-protective-foot');
 for(const side of[-1,1]){
  box([side*1.199,.48,-.052],[.084,.15,.20],'steel',undefined,.022,'strap-lug-body');
  ring([side*1.262,.48,-.052],.054,.010,'steel',[0,Math.PI/2,0],32,'open-strap-bail');
 }
}

await build('field-case',fieldCase);
await build('field-recorder',fieldRecorder);
await build('field-recorder-witness',g=>fieldRecorder(g,{witness:true}));
await build('witness-faceplate',witnessReplacementPlate);
for(const variant of['reference','closed','open'])await build(`headphones-${variant}`,g=>headphones(variant,g));
for(const variant of['reference','directional','wide'])await build(`microphone-${variant}`,g=>microphone(variant,g));
for(const variant of['reference','low-draw','headroom'])await build(`amp-${variant}`,g=>benchAmplifier(variant,g));
for(const variant of['reference','throw','flood'])await build(`flashlight-${variant}`,g=>benchFlashlight(variant,g));
for(const finish of['aluminum','black','olive'])await build(`faceplate-${finish}`,g=>benchFaceplate(finish,g));
