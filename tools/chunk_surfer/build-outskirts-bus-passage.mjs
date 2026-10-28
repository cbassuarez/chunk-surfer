// Encounter-only coach: retain the production bus factory and its physical
// destination/registration print, while giving its circulation real geometry.
// This builder never writes the shared conservatory prop pack.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../../src/data/outskirts-bus-passage.js';
import {parseGlb,encodeGlb,meshFingerprint} from './rebuild-tree-crowns.mjs';
import {bakeLetteringAtlases,printedSurfaceMetadata} from './lettering/physical-lettering.mjs';
import {printedFaceGeometry} from './lettering/face-geometry.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const close=(a,b)=>Math.abs(a-b)<1e-6;
const roleNames={enamel:'outskirts municipal enamel',enamelEdge:'outskirts worn enamel edge',cream:'outskirts ivory coachwork',iron:'outskirts black iron',rust:'outskirts joint oxidation',rubber:'outskirts tyre and gasket',seat:'outskirts green moquette',seatEdge:'outskirts worn seat piping',ink:'outskirts printed carbon',paper:'outskirts rain stained paper',glassEdge:'outskirts glass edge reflection',lamp:'outskirts opal strip'};

export function readBusAccessor(pack,index){
  const a=pack.json.accessors[index],v=pack.json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
  const base=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size,out=[];
  for(let i=0;i<a.count;i++)for(let k=0;k<n;k++){const at=base+i*stride+k*size;out.push(a.componentType===5126?pack.bin.readFloatLE(at):size===4?pack.bin.readUInt32LE(at):size===2?pack.bin.readUInt16LE(at):pack.bin.readUInt8(at));}
  return out;
}

function declaration(source,name){
  const start=source.indexOf(`function ${name}(`);if(start<0)throw Error(`Production helper missing: ${name}`);
  let at=source.indexOf('{',start),depth=1;for(at++;depth&&at<source.length;at++){if(source[at]==='{')depth++;else if(source[at]==='}')depth--;}
  return source.slice(start,at);
}
function subtractRect(rect,hole){
  const a={x0:Math.max(rect.x0,hole.x0),x1:Math.min(rect.x1,hole.x1),z0:Math.max(rect.z0,hole.z0),z1:Math.min(rect.z1,hole.z1)};
  if(a.x0>=a.x1||a.z0>=a.z1)return[rect];
  return[{...rect,x1:a.x0},{...rect,x0:a.x1},{x0:a.x0,x1:a.x1,z0:rect.z0,z1:a.z0},{x0:a.x0,x1:a.x1,z0:a.z1,z1:rect.z1}].filter(r=>r.x1-r.x0>1e-6&&r.z1-r.z0>1e-6);
}
function splitRange(a,b,holes){let ranges=[[a,b]];for(const[h0,h1]of holes)ranges=ranges.flatMap(([l,r])=>h1<=l||h0>=r?[[l,r]]:[[l,Math.max(l,h0)],[Math.min(r,h1),r]].filter(([x,y])=>y-x>1e-7));return ranges;}

function productionGeometry(source,materials){
  const meshes=new Map(),mesh=name=>{const m={name,groups:new Map(),extras:{}};meshes.set(name,m);return m;};
  const group=(m,mat)=>{if(!m.groups.has(mat))m.groups.set(mat,{positions:[],normals:[],uvs:[],indices:[]});return m.groups.get(mat);};
  const O=Object.fromEntries(Object.entries(roleNames).map(([role,name])=>[role,materials.findIndex(m=>m.name===name)]));
  const MAT={steel:materials.findIndex(m=>m.name==='painted steel'),ivory:materials.findIndex(m=>m.name==='ivory')};
  if([...Object.values(O),...Object.values(MAT)].some(i=>i<0))throw Error('Production bus material missing');
  const helpers=['addBox','addCylinder','addCylinderX','addBeam','addQuad','addPlateBeamXY','addRingBeam'].map(n=>declaration(source,n)).join('\n');
  const context={group,mesh,O,MAT,C,Math,signAssemblies:{isCarrier:()=>false},BUILDING_WINDOW_HOST_ORIGINS:{},print:()=>{}};
  vm.createContext(context);vm.runInContext(helpers,context);
  const raw={...Object.fromEntries(['addBox','addCylinder','addCylinderX','addBeam','addQuad','addRingBeam'].map(n=>[n,context[n]]))};
  const bus=mesh(C.mesh),front=mesh(C.frontLampMesh),rear=mesh(C.rearLampMesh);
  const strips=Array.from({length:4},(_,i)=>mesh(`outskirts_bus_strip_${i}`));
  const commands=[];
  for(const name of Object.keys(raw))context[name]=(_m,...args)=>commands.push({type:name,args});
  context.mesh=()=>bus;
  const start=source.indexOf("const m=mesh('outskirts_bus');"),end=source.indexOf('  }\n  {\n    // Place at bus-local',start);
  if(start<0||end<start)throw Error('Production bus factory boundary changed');
  let body=source.slice(start,end);
  // Whole slabs and old treads are deliberately removed, never covered by a
  // second skin. The new supports below consume the runtime's exact contract.
  body=body.slice(0,body.indexOf('\n')+1)+body.slice(body.indexOf('    // Side skins'));
  const seatStart=body.indexOf('    for(const side of[-1,1])for(let row=0;row<7;row++){'),seatEnd=body.indexOf('    for(const side of[-1,1]){',seatStart+10);
  if(seatStart<0||seatEnd<0)throw Error('Production seat factory boundary changed');
  body=body.slice(0,seatStart)+`
    for(const side of[-1,1])for(const z of C.seatRows){
      const x=side*C.aisle.seatCentreX,w=C.aisle.seatWidth;
      for(const dx of[-.12,.12])for(const dz of[-.20,.20])addBox(m,[x+dx,.75,z+dz],[.026,.50,.026],O.iron);
      addBox(m,[x,1.03,z],[w,.16,.67],O.seat);
      addBox(m,[x,1.37,z+.29],[w,.67,.13],O.seat,0,-.075);
      addBox(m,[x,1.71,z+.26],[w-.03,.035,.14],O.seatEdge);
      for(const dx of[-w/2+.035,w/2-.035])addBeam(m,[x+dx,1.07,z-.25],[x+dx,1.44,z+.27],.022,MAT.steel);
    }
`+body.slice(seatEnd);
  body=body.replaceAll('side*.36','side*C.aisle.stanchionX').replaceAll('[-2.6,.1,2.8]',' C.aisle.stanchionZ').replace('1.69,z],.019,2.08','1.615,z],C.aisle.stanchionRadius,2.23');
  vm.runInContext(body,context);
  // Restore the production primitive implementations for actual construction.
  Object.assign(context,raw);
  const box=(m,c,s,mat,yaw=0,pitch=0)=>raw.addBox(m,c,s,mat,yaw,pitch);
  const doorHole=side=>side<0?[C.entry.fromZ,C.entry.toZ]:[C.exit.fromZ,C.exit.toZ];
  const frontLampMaterial=materials.push({name:'bus passage warm headlamp lens',pbrMetallicRoughness:{baseColorFactor:[.80,.73,.56,1],metallicFactor:0,roughnessFactor:.27},emissiveFactor:[1,.82,.52]})-1;
  const rearLampMaterial=materials.push({name:'bus passage red tail lamp lens',pbrMetallicRoughness:{baseColorFactor:[.29,.018,.009,1],metallicFactor:0,roughnessFactor:.28},emissiveFactor:[.34,.012,.005]})-1;
  const faceLampMaterial=materials.push({name:'bus passage rear bay opal bulkhead lens',pbrMetallicRoughness:{baseColorFactor:[.61,.48,.30,1],metallicFactor:0,roughnessFactor:.36},emissiveFactor:C.facePractical.colour.map(v=>v*.42),extras:{practicalFixtureRole:'rear-bay-face-light'}})-1;
  for(const command of commands){
    let args=structuredClone(command.args),target=bus;
    if(command.type==='addCylinderX'&&args[0][2]<-2.4)args[0][2]+=C.axle.frontZ+2.85;
    if(command.type==='addBox'){
      let[c,s,mat,yaw=0,pitch=0]=args;
      // These are the actual cabin fluorescent diffusers. Their front/rear
      // halves must share the runtime's independently powered practical
      // meshes; leaving them in the body makes the authored dim inaudible to
      // the eye while only the external headlamps respond.
      if(mat===O.lamp&&close(c[1],2.80)){
        const from=c[2]-s[2]/2,to=c[2]+s[2]/2;
        const side=c[0]>0?1:0;
        for(const[target,a,b]of[[strips[side],from,Math.min(0,to)],[strips[2+side],Math.max(0,from),to]])if(b>a)box(target,[c[0],c[1],(a+b)/2],[s[0],s[1],b-a],mat);
        continue;
      }
      if(Math.abs(c[0])>1.3&&c[1]<.65&&c[2]<-2.4)c[2]+=C.axle.frontZ+2.85;
      // These skins are reconstructed around proper semicircular wheel arches.
      if(close(Math.abs(c[0]),1.19)&&close(c[1],1.03)&&mat===O.enamel)continue;
      if(close(c[2],-4.62)&&close(c[1],.97)&&mat===MAT.ivory)target=front;
      if(close(c[2],-4.675)&&close(c[1],.97)){target=front;mat=frontLampMaterial;}
      if(close(c[2],4.63)&&close(c[1],.91)){target=rear;mat=rearLampMaterial;}
      // Rails, streaks, skirts and gaskets obey the same aperture as the wall;
      // a tiny decorative bar must not remain stretched across the doorway.
      if(!yaw&&!pitch&&Math.abs(c[0])>=1.12&&s[0]<.20&&c[1]-s[1]/2<2.505&&c[1]+s[1]/2>.125){
        const hole=doorHole(Math.sign(c[0]));
        for(const[a,b]of splitRange(c[2]-s[2]/2,c[2]+s[2]/2,[hole]))box(target,[c[0],c[1],(a+b)/2],[s[0],s[1],b-a],mat);
        const za=Math.max(c[2]-s[2]/2,hole[0]),zb=Math.min(c[2]+s[2]/2,hole[1]),top=c[1]+s[1]/2;
        if(zb>za&&top>2.505)box(target,[c[0],(2.505+top)/2,(za+zb)/2],[s[0],top-2.505,zb-za],mat);
        continue;
      }
      args=[c,s,mat,yaw,pitch];
    }
    raw[command.type](target,...args);
  }
  // Capped, opaque coachwork panels follow the wheel opening rather than
  // leaving a tyre poking through rectangular enamel skins.
  const panel=(side,a,b,lowA,lowB)=>{
    const x0=side*1.13,x1=side*1.25,top=1.51;
    for(const x of[x0,x1]){
      const points=[[x,lowA,a],[x,top,a],[x,top,b],[x,lowB,b]];
      raw.addQuad(bus,...(x===Math.max(x0,x1)?points:points.reverse()),O.enamel);
    }
    raw.addQuad(bus,[x0,lowA,a],[x1,lowA,a],[x1,lowB,b],[x0,lowB,b],O.enamelEdge);
    raw.addQuad(bus,[x0,top,a],[x1,top,a],[x1,top,b],[x0,top,b],O.enamel);
  };
  for(const side of[-1,1]){
    const hole=doorHole(side),axles=[C.axle.frontZ,C.axle.rearZ],r=C.axle.tyreRadius+.05;
    for(const[a,b]of splitRange(-4.48,4.48,[hole])){
      const cuts=[a,b,...axles.flatMap(z=>Array.from({length:17},(_,i)=>z-r+2*r*i/16)).filter(z=>z>a&&z<b)].sort((x,y)=>x-y);
      const low=z=>Math.max(.55,...axles.map(centre=>Math.abs(z-centre)<r?.45+Math.sqrt(Math.max(0,r*r-(z-centre)**2)):.55));
      for(let i=0;i<cuts.length-1;i++)panel(side,cuts[i],cuts[i+1],low(cuts[i]),low(cuts[i+1]));
    }
    // A steel inner wheel box closes every arch inside, below the seat cushion.
    for(const z of axles){
      const inner=side*.995,outer=side*1.25,r=.49;
      for(let i=0;i<20;i++){
        const a=Math.PI*i/20,b=Math.PI*(i+1)/20,p=(x,t)=>[x,.45+r*Math.sin(t),z+r*Math.cos(t)];
        const cap=[p(inner,a),p(outer,a),p(outer,b),p(inner,b)],end=[[inner,.45,z],p(inner,b),p(inner,a),[inner,.45,z]];
        raw.addQuad(bus,...(side>0?cap:cap.reverse()),O.iron);
        raw.addQuad(bus,...(side>0?end:end.reverse()),O.iron);
      }
    }
  }
  const deck={x0:-1.17,x1:1.17,z0:-4.42,z1:4.43};
  let deckPieces=[deck];for(const hole of C.floorWells)deckPieces=deckPieces.flatMap(rect=>subtractRect(rect,hole));
  for(const p of deckPieces){
    box(bus,[(p.x0+p.x1)/2,.42,(p.z0+p.z1)/2],[p.x1-p.x0,.14,p.z1-p.z0],O.iron);
    box(bus,[(p.x0+p.x1)/2,C.floor-.005,(p.z0+p.z1)/2],[p.x1-p.x0,.010,p.z1-p.z0],O.rubber);
  }
  for(const step of C.treads){
    const x=(step.x0+step.x1)/2,z=(step.z0+step.z1)/2,h=.065;
    box(bus,[x,step.top-h/2,z],[step.x1-step.x0,h,step.z1-step.z0],O.iron);
    box(bus,[x,step.top-.005,z],[step.x1-step.x0,.010,step.z1-step.z0],O.rubber);
    const leading=step.id.startsWith('entry')?step.x0:step.x1;
    box(bus,[leading+(step.id.startsWith('entry')?.018:-.018),step.top-.006,z],[.036,.012,step.z1-step.z0],O.cream);
    // Substantial riser, down to the preceding physical tread, not a floating
    // horizontal card. Every top remains exactly the support height above.
    const previous=step.id.endsWith('lower')?0:step.id.endsWith('middle')?.125:.25;
    box(bus,[leading+(step.id.startsWith('entry')?.012:-.012),(previous+step.top)/2,z],[.024,step.top-previous,step.z1-step.z0],O.iron);
  }
  // Stair cheeks are below shin height. Vertical handrails sit at the two
  // jambs, outside the useful width, and lead the eye along the real stair.
  for(const door of[C.entry,C.exit]){
    const inside=door.innerGrabX;
    for(const z of[door.fromZ-.025,door.toZ+.025]){
      box(bus,[door.side*1.24,1.5,z],[.09,2.02,.045],O.cream);
      raw.addBeam(bus,[door.side*(inside-.01),.80,z],[door.side*1.58,.35,z],.030,MAT.steel);
      raw.addBeam(bus,[door.side*inside,.80,z],[door.side*inside,1.23,z],.030,MAT.steel);
      box(bus,[door.side*1.06,.22,z],[1.19,.44,.035],O.enamel);
    }
    box(bus,[door.side*1.20,2.53,(door.fromZ+door.toZ)/2],[.12,.08,door.toZ-door.fromZ+.10],O.cream);
  }
  for(const side of[-1,1])for(const z of C.aisle.stanchionZ)box(bus,[side*C.aisle.stanchionX,.51,z],[.030,.020,.045],MAT.steel);
  // A hooded opal bulkhead on the fixed offside wall, before the emergency
  // jamb. Its low oblique light reaches the occupant's face under her cap;
  // the hood and side cheeks keep the source out of the approach sightline.
  // The body stays opaque and static. Only the actual glass belongs to the
  // rear powered mesh, so scene illumination and the diffuser share a switch.
  const [fx,fy,fz]=C.facePractical.lens;
  const facePractical={...C.facePractical,mount:[fx+.10,fy,fz],cutoff:'folded upper hood and side cheeks',poweredBy:'rear-lamps'};
  // This portion of the side is glazed. A real mounting stile bridges the
  // waist panel to the upper coachwork rather than hanging a lamp in glass.
  box(bus,[fx+.134,2.02,fz],[.055,1.06,.060],O.cream);
  box(bus,facePractical.mount,[.024,.23,.25],O.iron);
  raw.addCylinderX(bus,[fx+.049,fy,fz],.096,.080,O.enamel,24);
  raw.addCylinderX(rear,facePractical.lens,.071,.025,faceLampMaterial,24);
  box(bus,[fx+.044,fy+.115,fz],[.16,.022,.29],O.iron);
  for(const z of[fz-.145,fz+.145])box(bus,[fx+.044,fy+.03,z],[.16,.17,.018],O.iron);
  box(bus,[fx-.035,fy+.116,fz],[.003,.003,.27],O.enamelEdge);
  for(const y of[fy-.105,fy+.105]){
    raw.addCylinderX(bus,[fx+.083,y,fz],.008,.008,MAT.steel,8);
    box(bus,[fx+.0785,y,fz],[.001,.002,.009],O.ink);
  }
  box(bus,[fx+.086,fy-.113,fz],[.003,.012,.016],O.rust);
  rear.extras.facePractical=facePractical;
  const leaves=[mesh(C.entryMesh),mesh(C.exitMesh)];
  for(const[which,m]of leaves.entries()){
    const door=which?C.exit:C.entry,bottom=C.treads.find(t=>t.id===(which?'exit-lower':'entry-lower')).top-door.hinge[1],top=2.5-door.hinge[1];
    for(const z of[.025,1.075])box(m,[0,(top+bottom)/2,z],[.065,top-bottom,.05],O.cream);
    for(const y of[bottom+.025,.70,top-.025])box(m,[0,y,.55],[.065,.05,1.10],O.cream);
    box(m,[0,(bottom+.05+.675)/2,.55],[.045,.675-bottom-.05,1.00],O.enamel);
    for(const z of[.075,1.025])box(m,[0,1.46,z],[.047,1.47,.014],O.rubber);
    for(const y of[.22,2.00])box(m,[.045,y,.025],[.06,.16,.09],MAT.steel);
    for(const face of[-1,1]){
      raw.addBeam(m,[face*.065,.93,.91],[face*.065,1.17,.91],.032,MAT.steel);
      if(which)raw.addBeam(m,[face*.07,1.28,.78],[face*.07,1.28,.94],.040,O.rust);
    }
    m.extras={hingeLocal:true,closedSpan:[0,1.1],leafBottom:bottom,leafTop:top,leafHeight:top-bottom,operation:which?'manual outward emergency exit':'outward entry leaf'};
  }
  bus.extras={circulation:'front nearside entrance to rear offside emergency exit',floor:C.floor,treads:C.treads,aisleClearWidth:2*(C.aisle.stanchionX-C.aisle.stanchionRadius),stanchionZ:C.aisle.stanchionZ,seatRows:C.seatRows,axles:C.axle,facePractical,sourceFactory:'tools/chunk_surfer/build-props.mjs:outskirts_bus',ordinaryBusUnchanged:true};
  return{meshes,group,O,MAT,leaves,bus};
}

export async function buildOutskirtsBusPassage({sourceText=fs.readFileSync(path.join(ROOT,'tools/chunk_surfer/build-props.mjs'),'utf8'),sourceBytes=fs.readFileSync(path.join(ROOT,'public/assets/conservatory-props.glb'))}={}){
  const source=parseGlb(sourceBytes),materials=structuredClone(source.json.materials),built=productionGeometry(sourceText,materials),sourceMesh=source.json.meshes.find(m=>m.name==='outskirts_bus');
  if(!sourceMesh)throw Error('Installed production bus is missing');
  // Original final opaque pigment, normal and ORM pixels and UVs are retained
  // exactly; the lettering is neither recreated as raised geometry nor hollow.
  for(const primitive of sourceMesh.primitives.filter(p=>source.json.materials[p.material].extras?.printedSurface)){
    const g=built.group(built.bus,primitive.material);g.positions.push(...readBusAccessor(source,primitive.attributes.POSITION));g.normals.push(...readBusAccessor(source,primitive.attributes.NORMAL));g.uvs.push(...readBusAccessor(source,primitive.attributes.TEXCOORD_0));g.indices.push(...readBusAccessor(source,primitive.indices));
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outskirts-bus-passage-lettering-'));
  let bake;
  try{bake=await bakeLetteringAtlases([
    {id:'bus-emergency-exit',copy:'EMERGENCY EXIT',widthM:.54,heightM:.09,category:'vehicle',process:'registration enamel screen print',palette:{ground:[.027,.035,.032],ink:[.69,.70,.61]},capHeightM:.030,reliefM:.000007,seed:'bus-emergency-exit',source:'outskirts-bus-passage',emission:'none'},
    {id:'bus-emergency-pull',copy:'PULL TO OPEN',widthM:.32,heightM:.065,category:'vehicle',process:'registration enamel screen print',palette:{ground:[.69,.70,.61],ink:[.027,.035,.032]},capHeightM:.020,reliefM:.000007,seed:'bus-emergency-pull',source:'outskirts-bus-passage',emission:'none'},
  ],{outputDir:dir,pageSize:1024});}finally{fs.rmSync(dir,{recursive:true,force:true});}
  const newTextures=[];
  for(const id of['bus-emergency-exit','bus-emergency-pull']){
    const entry=bake.entries.get(id),page=bake.pages[entry.page],mat=materials.push({name:`physical print: vehicle: bus passage ${id}`,alphaMode:'OPAQUE',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:1,roughnessFactor:1},extras:{printedSurface:printedSurfaceMetadata(entry),materialFactors:'gltf',letteringFinish:{version:1,profile:entry.finish.profile,localSpecular:true}}})-1;
    newTextures.push({mat,page});
    for(const face of[-1,1]){
      const centre=[face*.037,id==='bus-emergency-exit'?2.075:1.42,id==='bus-emergency-exit'?.55:.65],widthM=id==='bus-emergency-exit'?.54:.32,heightM=id==='bus-emergency-exit'?.09:.065;
      const geometry=printedFaceGeometry({center:centre,widthM,heightM,readerRight:[0,0,-face],up:[0,1,0],uvRect:entry.uvRect});
      const g=built.group(built.leaves[1],mat),base=g.positions.length/3;g.positions.push(...geometry.positions);g.normals.push(...geometry.normals);g.uvs.push(...geometry.uvs);g.indices.push(...geometry.indices.map(i=>i+base));
    }
  }
  const json={asset:{version:'2.0',generator:'Chunk Surfer dedicated bus passage'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],textures:[],images:[],samplers:[],accessors:[],bufferViews:[],buffers:[]},chunks=[];let offset=0;
  const append=(bytes,target)=>{const aligned=(offset+3)&~3;if(aligned>offset)chunks.push(Buffer.alloc(aligned-offset));const id=json.bufferViews.length;chunks.push(bytes);json.bufferViews.push({buffer:0,byteOffset:aligned,byteLength:bytes.length,...(target?{target}:{})});offset=aligned+bytes.length;return id;};
  const accessor=(values,n,integer=false)=>{const typed=integer?new Uint32Array(values):new Float32Array(values),bufferView=append(Buffer.from(typed.buffer),integer?34963:34962),a={bufferView,componentType:integer?5125:5126,count:values.length/n,type:n===1?'SCALAR':`VEC${n}`};if(n===3&&!integer){a.min=[0,1,2].map(k=>values.reduce((v,x,i)=>i%3===k?Math.min(v,x):v,Infinity));a.max=[0,1,2].map(k=>values.reduce((v,x,i)=>i%3===k?Math.max(v,x):v,-Infinity));}json.accessors.push(a);return json.accessors.length-1;};
  const materialMap=new Map(),textureMap=new Map(),imageMap=new Map(),samplerMap=new Map(),usedTexturePages=new Map();
  const imageFromBytes=(bytes,mimeType='image/png')=>{const key=sha(bytes);if(imageMap.has(key))return imageMap.get(key);const i=json.images.length;json.images.push({bufferView:append(bytes),mimeType});imageMap.set(key,i);return i;};
  const sourceTexture=old=>{if(textureMap.has(old))return textureMap.get(old);const t=source.json.textures[old],image=source.json.images[t.source],view=source.json.bufferViews[image.bufferView],sourceImage=imageFromBytes(source.bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),image.mimeType);let sampler;if(t.sampler!=null){if(!samplerMap.has(t.sampler)){samplerMap.set(t.sampler,json.samplers.length);json.samplers.push(structuredClone(source.json.samplers[t.sampler]));}sampler=samplerMap.get(t.sampler);}const i=json.textures.length;json.textures.push({source:sourceImage,...(sampler!=null?{sampler}:{})});textureMap.set(old,i);return i;};
  const bakedTexture=(page,role)=>{const key=`${sha(page[role])}:${role}`;if(usedTexturePages.has(key))return usedTexturePages.get(key);if(!json.samplers.length)json.samplers.push({magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071});const i=json.textures.length;json.textures.push({source:imageFromBytes(page[role]),sampler:0});usedTexturePages.set(key,i);return i;};
  const remapMaterial=old=>{if(materialMap.has(old))return materialMap.get(old);const m=structuredClone(materials[old]),newPage=newTextures.find(p=>p.mat===old);if(newPage){m.pbrMetallicRoughness.baseColorTexture={index:bakedTexture(newPage.page,'albedo')};m.pbrMetallicRoughness.metallicRoughnessTexture={index:bakedTexture(newPage.page,'orm')};m.normalTexture={index:bakedTexture(newPage.page,'normal')};}else for(const parent of[m,m.pbrMetallicRoughness])if(parent)for(const[key,value]of Object.entries(parent))if(key.endsWith('Texture')&&value?.index!=null)value.index=sourceTexture(value.index);const i=json.materials.length;json.materials.push(m);materialMap.set(old,i);return i;};
  const meshStats={};
  for(const m of built.meshes.values()){
    const primitives=[];let vertices=0,triangles=0,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const[mat,g]of m.groups){if(!g.positions.length)continue;const attributes={POSITION:accessor(g.positions,3),NORMAL:accessor(g.normals,3)};if(g.uvs.length===g.positions.length/3*2)attributes.TEXCOORD_0=accessor(g.uvs,2);primitives.push({attributes,indices:accessor(g.indices,1,true),material:remapMaterial(mat),mode:4});vertices+=g.positions.length/3;triangles+=g.indices.length/3;for(let i=0;i<g.positions.length;i++){const k=i%3;min[k]=Math.min(min[k],g.positions[i]);max[k]=Math.max(max[k],g.positions[i]);}}
    const index=json.meshes.length;json.meshes.push({name:m.name,primitives,extras:m.extras});json.nodes.push({name:m.name,mesh:index});json.scenes[0].nodes.push(index);meshStats[m.name]={vertices,triangles,primitives:primitives.length,bounds:{min,max},extras:m.extras};
  }
  json.buffers=[{byteLength:offset}];const bytes=encodeGlb(json,Buffer.concat(chunks));
  const stats={version:1,sha256:sha(bytes),bytes:bytes.length,totalTriangles:Object.values(meshStats).reduce((n,m)=>n+m.triangles,0),totalVertices:Object.values(meshStats).reduce((n,m)=>n+m.vertices,0),meshes:meshStats,materialCount:json.materials.length,embeddedImages:json.images.length,sourceBusFingerprint:meshFingerprint(source,sourceMesh),factorySha256:sha(Buffer.from(sourceText)),contractSha256:sha(fs.readFileSync(path.join(ROOT,'src/data/outskirts-bus-passage.js'))),ordinaryBusUnchanged:true};
  return{bytes,stats,credits:{version:1,title:'Outskirts bus passage',author:'Chunk Surfer original procedural geometry',license:'project source',pack:{sha256:stats.sha256,bytes:stats.bytes,triangles:stats.totalTriangles},sources:C.references,productionReuse:{factory:'tools/chunk_surfer/build-props.mjs:outskirts_bus',sourceMeshFingerprint:stats.sourceBusFingerprint,physicalPrint:'Original ELLERY and J 063 albedo/normal/ORM bytes and UVs retained'},validation:'CPU geometry and asset tests; native final-dither inspection remains separate'}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const output=await buildOutskirtsBusPassage(),file=path.join(ROOT,'public',C.pack);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,output.bytes);fs.writeFileSync(file.replace('.glb','.stats.json'),JSON.stringify(output.stats,null,2)+'\n');fs.writeFileSync(file.replace('.glb','.credits.json'),JSON.stringify(output.credits,null,2)+'\n');console.log(JSON.stringify(output.stats,null,2));
}
