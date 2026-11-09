// Dedicated B3-only assets. No shared prop, floorplan or world pack is rebuilt.
// CC0 source chassis are adapted rather than importing their inaccurate knobs,
// luminous-looking screens or baked channel caps into the playable puzzle.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dequantize} from '@gltf-transform/functions';
import {BoxGeometry,CylinderGeometry,Euler,Matrix4,Vector3,Quaternion} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {importPropMesh} from './lib/glb-import.mjs';
import {B3_STUDIO_PROPS_ASSET,B3_STUDIO_PROPS_MESHES} from '../../src/data/b3-studio-props.js';
import {B3_CONSOLE_REFERENCE,B3_CONSOLE_LAYOUT as DESK,b3ConsoleChannelX,b3ConsoleUpperSurfaceY} from '../../src/data/b3-console-layout.js';
import {vfdGlyph} from '../../src/render/vfd-font.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const minmax=positions=>{const min=[Infinity,Infinity,Infinity],max=min.map(()=>-Infinity);for(let i=0;i<positions.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],positions[i+k]);max[k]=Math.max(max[k],positions[i+k]);}return{min,max};};
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const STOCK={
  chassis:{color:'#52585c',rough:.74,metal:.28},
  nickel:{color:'#92958b',rough:.56,metal:.62},
  vinyl:{color:'#1a2220',rough:.93,metal:0},
  ivory:{color:'#c8c5a6',rough:.85,metal:0},
  wood:{color:'#62503a',rough:.9,metal:0},
  black:{color:'#080f0d',rough:.92,metal:0},
  red:{color:'#9a4a37',rough:.85,metal:0},
  blue:{color:'#527d91',rough:.83,metal:.08},
  green:{color:'#79928a',rough:.83,metal:.04},
};

export async function buildB3StudioProps({root=ROOT,write=true}={}){
 const rows=[],credits=JSON.parse(fs.readFileSync(path.join(root,'assets/third-party/b3-studio/sources.json'),'utf8')),sourceCache=new Map();
 function mesh(name){const row={name,groups:new Map(),sources:[]};rows.push(row);return row;}
 function group(row,role){if(role==='black')role='vinyl';if(!row.groups.has(role))row.groups.set(role,{positions:[],normals:[],indices:[],role});return row.groups.get(role);}
 function append(row,role,p,n,i){const g=group(row,role),offset=g.positions.length/3;g.positions.push(...p);g.normals.push(...n);g.indices.push(...i.map(v=>v+offset));}
 function shape(row,geometry,at,role,rotation=[0,0,0]){
  const transform=new Matrix4().makeRotationFromEuler(new Euler(...rotation,'XYZ')).setPosition(...at);
  geometry.applyMatrix4(transform);const p=Array.from(geometry.getAttribute('position').array),n=Array.from(geometry.getAttribute('normal').array),i=geometry.index?Array.from(geometry.index.array):Array.from({length:p.length/3},(_,i)=>i);append(row,role,p,n,i);geometry.dispose();
 }
 const box=(row,at,size,role='chassis',rotation)=>shape(row,new BoxGeometry(...size),at,role,rotation);
 const rounded=(row,at,size,role='chassis',radius=.008,rotation)=>shape(row,new RoundedBoxGeometry(...size,1,radius),at,role,rotation);
 const cylinder=(row,at,radius,height,role='nickel',segments=10,rotation)=>shape(row,new CylinderGeometry(radius*.95,radius,height,segments),at,role,rotation);
 const beam=(row,a,b,width,role='nickel')=>{
  const from=new Vector3(...a),to=new Vector3(...b),delta=to.clone().sub(from),geometry=new CylinderGeometry(width*.5,width*.5,delta.length(),6),rotation=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize());
  geometry.applyQuaternion(rotation);shape(row,geometry,from.add(to).multiplyScalar(.5).toArray(),role);
 };
 // Real annular jack mouth: the dark centre is a well, not a plugged knob.
 const jack=(row,x,y,z,r=.006)=>{
  const p=[],n=[],idx=[],inner=r*.52,depth=.003,segments=8;
  for(let ring=0;ring<4;ring++)for(let s=0;s<segments;s++){const a=s*Math.PI/4,rr=ring===0?r:inner,zz=z-(ring===3?depth:0);p.push(x+Math.cos(a)*rr,y+Math.sin(a)*rr,zz);n.push(...(ring<2?[0,0,1]:[-Math.cos(a),-Math.sin(a),0]));}
  for(const[a,b]of[[0,1],[2,3]])for(let s=0;s<segments;s++){const t=(s+1)%segments;idx.push(a*segments+s,a*segments+t,b*segments+s,a*segments+t,b*segments+t,b*segments+s);}
  append(row,'nickel',p,n,idx);
  const back=[x,y,z-depth-.001],normal=[0,0,1],ix=[];
  for(let s=0;s<segments;s++){const a=s*Math.PI/4;back.push(x+Math.cos(a)*inner,y+Math.sin(a)*inner,z-depth-.001);normal.push(0,0,1);ix.push(0,s+1,(s+1)%segments+1);}
  append(row,'black',back,normal,ix);
 };
 const tick=(row,x,y,z,width=.014,role='ivory')=>box(row,[x,y,z],[width,.0015,.0025],role);
 const ink=(row,text,x,y,z,width=.067)=>{
  const dot=Math.min(.0018,width/Math.max(1,text.length*6-1)),left=x-(text.length*6-1)*dot/2;
  for(const[ci,ch]of [...text].entries())for(const[ry,bits]of vfdGlyph(ch).entries())for(let cx=0;cx<5;cx++)if(bits&(1<<(4-cx))){
   const u=left+(ci*6+cx)*dot,v=z+ry*dot,s=dot*.85;
   append(row,'black',[u,y,v,u+s,y,v,u+s,y,v+s,u,y,v+s],[0,1,0,0,1,0,0,1,0,0,1,0],[0,2,1,0,3,2]);
  }
 };
 const eqSurface=b3ConsoleUpperSurfaceY;
 const knob=(row,x,y,z,role='vinyl',r=.015)=>{
  const sides=r>.018?10:6;
  cylinder(row,[x,y-.008,z],r*1.12,.008,'nickel',sides);cylinder(row,[x,y+.005,z],r,.021,role,sides);
  box(row,[x,y+.016,z-r*.35],[.0026,.0018,r*.72],'ivory');
 };
 async function source(row,id,{roles,dimensions,filter}={}){
  const record=credits.sources.find(s=>s.id===id),file=path.join(root,record.file);
  if(sha(fs.readFileSync(file))!==record.sha256)throw Error('Source hash mismatch '+id);
  // The source uses normalised SHORT positions. Canonicalise to float BEFORE
  // applying the source hierarchy, otherwise a raw-array importer crushes node
  // translations and produces displaced seats, chair spikes and broken panels.
  if(!sourceCache.has(id)){
   const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(file);await doc.transform(dequantize());
   const folder=fs.mkdtempSync(path.join(os.tmpdir(),'b3-studio-import-')),canonical=path.join(folder,'float.glb');
   try{fs.writeFileSync(canonical,Buffer.from(await io.writeBinary(doc)));sourceCache.set(id,await importPropMesh(canonical,{targetH:1,triBudget:20000}));}
   finally{fs.rmSync(folder,{recursive:true,force:true});}
  }
  const input=sourceCache.get(id);
  const b=input.bounds,size=b.max.map((v,k)=>v-b.min[k]),scale=dimensions?dimensions.map((v,k)=>v/size[k]):[1,1,1];
  for(const g of input.groups){const role=roles?.[g.material.name];if(!role)continue;const p=Array.from(g.positions),n=Array.from(g.normals),indices=[];
   for(let i=0;i<p.length;i+=3){p[i]*=scale[0];p[i+1]*=scale[1];p[i+2]*=scale[2];const v=new Vector3(n[i]/scale[0],n[i+1]/scale[1],n[i+2]/scale[2]).normalize();n.splice(i,3,...v.toArray());}
   for(let i=0;i<g.indices.length;i+=3){const tri=Array.from(g.indices.slice(i,i+3));if(!filter||filter(tri.map(v=>p.slice(v*3,v*3+3)),g.material.name))indices.push(...tri);}
   if(indices.length)append(row,role,p,n,indices);
  }
  row.sources.push({...record,sourceTriangles:input.sourceTriangles,adaptation:'Normalised source attributes dequantised to float before hierarchy baking; physically scaled; selected structural groups retained; materials adapted to unpowered B3.'});
 }
 {
  const m=mesh('b3_mixing_console');
  // Soundcraft Series 600 (1985): a split 16-track desk. This B3 adaptation
  // retains the installed furniture span; it is not a factory-scale replica.
  // Every visible panel/knob/meter here is authored geometry, not a source scan.
  for(const x of[-1.112,1.112]){
   rounded(m,[x,.83,-.005],[.076,.20,.95],'wood',.010);
   box(m,[x,.46,-.025],[.064,.79,.060],'nickel');
   rounded(m,[x*.985,.0325,-.015],[.105,.065,.70],'vinyl',.008);
  }
  box(m,[0,.77,-.015],[2.15,.13,.88],'vinyl');
  rounded(m,[0,.846,.28],[2.15,.10,.34],'chassis',.010);
  box(m,[0,.95,-.10],[2.15,.10,.56],'chassis',[.28,0,0]);
  rounded(m,[0,.897,.438],[2.18,.076,.068],'vinyl',.020);
  box(m,[0,.16,-.01],[1.98,.035,.65],'wood');
  for(const x of[-.98,.98])box(m,[x,.44,-.02],[.04,.77,.04],'nickel');
  box(m,[0,.77,-.445],[2.09,.11,.036],'nickel');
  box(m,[0,.898,.18],[2.10,.012,.060],'chassis');
  // Modular input strips. Narrow repeated controls make the split master bank
  // perceptibly different; the old desk made sixteen channels and BUS labels
  // look like interchangeable wide toy strips.
  for(let i=0;i<DESK.channels;i++){
   const x=b3ConsoleChannelX(i),edge=x+DESK.channelPitch*.48;
   box(m,[edge,.903,.284],[.0018,.003,.31],'nickel');
   box(m,[edge,eqSurface(-.1)+.001,-.1],[.0018,.003,.56],'nickel',[.28,0,0]);
   box(m,[x,DESK.trackSurfaceY,DESK.trackCentreZ],[.006,.006,DESK.faderTrack],'black');
   for(let k=0;k<=5;k++)tick(m,x+.017,.904,.22+k*.02,k===1?.014:.007);
   box(m,[x,.904,.378],[.052,.003,.024],'ivory');ink(m,DESK.channelNames[i].replace(' ',''),x,.906,.373,.046);
   ink(m,String(i+1),x,.906,.345,.022);
   if(i===2)box(m,[x,.907,.381],[.045,.0012,.0015],'red');
   knob(m,x,eqSurface(DESK.gainZ)+.012,DESK.gainZ,'red',.009);
   for(const [j,z]of DESK.eqRows.entries())knob(m,x,eqSurface(z)+.012,z,j%2?'green':'blue',.010);
   for(const z of DESK.auxRows)knob(m,x,eqSurface(z)+.012,z,'ivory',.0085);
   knob(m,x,eqSurface(DESK.panZ)+.012,DESK.panZ,'blue',.010);
   // The actual 500/600 input module has four pair-routing switches plus
   // MIX, ON and PFL. These dark mechanical caps are not illuminated keys.
   for(let j=0;j<4;j++)box(m,[x-.015+(j%2)*.03,.910,.171+Math.floor(j/2)*.012],[.014,.012,.011],'ivory');
   for(let j=0;j<2;j++)box(m,[x-.015+j*.03,.910,.194],[.014,.012,.010],j?'red':'ivory');
   for(const z of[-.35,.397])cylinder(m,[x-.019,.908,z],.0022,.003,'nickel',6);
  }
  // Eight separate group modules each hold two tape-monitor paths (1/9,
  // 2/10 ... 8/16). Their rotary controls form a different rhythm from inputs.
  for(let i=0;i<DESK.groupCount;i++){
   const x=DESK.groupStartX+i*DESK.groupPitch;
   box(m,[x,.904,.379],[.060,.003,.024],'ivory');ink(m,'G'+(i+1),x,.906,.373,.044);
   for(const [j,z]of [-.29,-.22,-.14,-.07,.01,.08].entries())knob(m,x,eqSurface(z)+.012,z,j<2?'green':j<4?'blue':'ivory',.010);
   for(const [j,z]of[-.33,-.19].entries())ink(m,String(i+1+j*8),x,eqSurface(z)+.002,z,.035);
   box(m,[x,.901,.27],[.006,.006,.10],'black');
   rounded(m,[x,.918,.252+(i%3)*.012],[.045,.026,.032],DESK.groupCapColors[i],.004);
   for(let k=0;k<=5;k++)tick(m,x+.023,.904,.22+k*.02,.008);
   box(m,[x+.035,.903,.28],[.002,.003,.31],'nickel');
  }
  // Two conventional VUs over the monitoring/master section, sixteen dark
  // bargraph scales over the inputs. No fake LED emission with the rack dead.
  rounded(m,[0,1.175,-.405],[2.17,.252,.14],'vinyl',.010);
  for(let i=0;i<16;i++){
   const x=-.995+i*.071;
   box(m,[x,1.181,-.330],[.052,.188,.014],'nickel');box(m,[x,1.181,-.320],[.043,.174,.010],'black');
   for(let j=0;j<12;j++)box(m,[x,1.111+j*.012,-.3135],[.021,.006,.0015],j>=10?'red':j>=8?'ivory':'green');
   for(let j=0;j<4;j++)box(m,[x+.018,1.118+j*.041,-.312],[.003,.0018,.0015],'ivory');
  }
  for(const x of[.49,.88]){
   rounded(m,[x,1.178,-.326],[.335,.172,.022],'nickel',.008);
   box(m,[x,1.178,-.311],[.309,.145,.012],'black');box(m,[x,1.187,-.302],[.279,.095,.003],'ivory');
   for(let j=0;j<9;j++)box(m,[x-.117+j*.029,1.192+(j%2)*.003,-.299],[.002,.012,.002],j>=7?'red':'black');
   beam(m,[x,1.137,-.296],[x-.079,1.203,-.296],.0025,'black');
  }
  // Master/monitor section: two-track selection, solo level and independent
  // studio/control-room feeds. The traceable return is mechanically separate.
  for(const [i,x]of DESK.masterXs.entries()){
   for(const[j,z]of[-.27,-.17,-.07,.04,.14].entries())knob(m,x,eqSurface(z)+.012,z,j===0?'green':j===3?'blue':'vinyl',j===4?.024:.014);
   box(m,[x,.901,.27],[.008,.006,.10],'black');rounded(m,[x,.918,.26+i*.017],[.055,.026,.036],'ivory',.004);
   box(m,[x,.904,.379],[.08,.003,.025],'ivory');ink(m,i?'RIGHT':'LEFT',x,.906,.373,.067);
  }
  for(let i=0;i<3;i++)rounded(m,[.755+i*.055,eqSurface(-.34)+.009,-.34],[.036,.012,.021],i===2?'red':'ivory',.003);
  ink(m,'B3 / 600-16',.89,.908,.416,.28);
  // The 600 uses an external rack PSU: the desk has a low-voltage multipin
  // inlet, not an IEC mains rocker. The operator's unplug test belongs upstream.
  cylinder(m,[.94,.842,-.468],.025,.018,'nickel',10,[Math.PI/2,0,0]);
  cylinder(m,[.94,.842,-.477],.018,.003,'vinyl',10,[Math.PI/2,0,0]);
  for(const [x,y]of[[.932,.837],[.948,.837],[.94,.850]])cylinder(m,[x,y,-.479],.002,.002,'nickel',6,[Math.PI/2,0,0]);
  for(let i=0;i<16;i++)jack(m,-.96+i*.061,.817,-.473,.007);
  for(let i=0;i<10;i++)box(m,[-.78+i*.15,.754,-.478],[.072,.008,.004],'black');
  // Fingertip polish and missing legend tape are localized material geometry,
  // rather than damage repeated uniformly on every channel.
  for(const i of[2,5,11]){const x=b3ConsoleChannelX(i);box(m,[x+.021,.905,.272],[.003,.001,.066],'nickel');}
 }
 {
  const m=mesh('b3_fader_cap');rounded(m,[0,0,0],[.055,.026,.036],'ivory',.005);box(m,[0,.0135,0],[.0026,.0012,.029],'black');
 }
 {
  const m=mesh('b3_engineer_chair');
  await source(m,'engineer-chair',{roles:{metal:'nickel',dark:'vinyl'},dimensions:[.66,1.16,.68],
   // Retain the sound five-caster public base. Its pedestal incorrectly pokes
   // through its seat; upholstery, supports and column are rebuilt coherently.
   filter:p=>p.every(v=>v[1]<.25)});
  cylinder(m,[0,.30,0],.028,.39,'nickel',12);cylinder(m,[0,.18,0],.042,.16,'vinyl',12);
  rounded(m,[0,.458,0],[.48,.034,.40],'chassis',.009);
  rounded(m,[0,.49,-.015],[.51,.085,.46],'vinyl',.030);
  beam(m,[0,.45,-.16],[0,1.035,-.275],.032,'nickel');
  rounded(m,[0,.752,-.237],[.47,.20,.082],'vinyl',.027,[-.09,0,0]);
  rounded(m,[0,1.00,-.265],[.49,.32,.088],'vinyl',.030,[-.09,0,0]);
  for(const x of[-.275,.275]){
   beam(m,[x*.78,.46,-.08],[x,.67,-.04],.022,'nickel');rounded(m,[x,.70,-.035],[.066,.042,.26],'vinyl',.018);
  }
  for(const x of[-.205,.205])box(m,[x,.533,-.015],[.0018,.0014,.32],'wood');
  for(const x of[-.205,.205])box(m,[x,.969,-.213],[.0018,.23,.0018],'wood');
  // The pitch-adjustment lever lives under the pan, where a hand can reach it.
  beam(m,[.18,.445,.02],[.28,.42,.02],.012,'nickel');rounded(m,[.287,.42,.02],[.063,.021,.029],'vinyl',.006);
 }
 {
  const m=mesh('b3_outboard_rack');
  await source(m,'outboard-frame',{roles:{metal:'nickel',dark:'vinyl',timber:'wood'},dimensions:[.64,1.60,.62],
   // Preserve the public rolling frame/casters/top; replace AI panel details.
   filter:(p,material)=>material!=='metal'||p.every(v=>Math.abs(v[0])>.24||v[1]<.26||v[2]<.24)});
  for(const y of[.45,.71,.98,1.22]){
   const role=y===.71?'nickel':'chassis';rounded(m,[0,y,.292],[.49,.19,.022],role,.003);
   for(const x of[-.222,.222])for(const dy of[-.067,.067])cylinder(m,[x,y+dy,.309],.006,.008,'nickel',6,[Math.PI/2,0,0]);
   // A panel variation: twin-needle compressor, equaliser, preamp and blanks.
   if(y===.98){
    for(const x of[-.12,.12]){box(m,[x,y+.014,.309],[.132,.073,.009],'ivory');box(m,[x-.032,y+.014,.315],[.002,.045,.002],'black',[0,0,-.4]);}
   }else for(let i=0;i<5;i++){
    const x=-.16+i*.08;cylinder(m,[x,y,.318],.017,.024,'vinyl',10,[Math.PI/2,0,0]);box(m,[x,y+.011,.332],[.002,.011,.002],'ivory');
   }
   box(m,[-.14,y-.061,.309],[.15,.011,.003],'ivory');
  }
  box(m,[0,1.425,.29],[.49,.09,.02],'vinyl');for(let i=0;i<12;i++)box(m,[-.20+i*.036,1.425,.303],[.017,.035,.003],'black');
 }
 {
  const m=mesh('b3_patchbay');
  // A supported 19-inch jackfield cabinet; every socket is empty.
  rounded(m,[0,.87,-.02],[1.18,1.74,.32],'wood',.015);
  box(m,[0,1.10,.151],[1.08,1.03,.016],'black');
  for(const x of[-.257,.257])for(const y of[1.13,1.48]){
   // Reuse the CC0 48-point panel's chassis/ivory strips, not its solid knobs.
   const temporary={name:'patch-panel-part',groups:new Map(),sources:[]};
   await source(temporary,'patch-panel',{roles:{dark:'chassis',cream:'ivory'},dimensions:[.483,.089,.044]});
   for(const[role,g]of temporary.groups){for(let k=0;k<g.positions.length;k+=3){g.positions[k]+=x;g.positions[k+1]+=y-.0445;g.positions[k+2]+=.166;}append(m,role,g.positions,g.normals,g.indices);}
   if(!m.sources.length)m.sources.push(...temporary.sources);
   for(let row=0;row<2;row++)for(let i=0;i<24;i++)jack(m,x-.215+i*.0187,y-.019+row*.037,.202,.006);
  }
  box(m,[0,.477,.164],[1.04,.13,.025],'chassis');for(const x of[-.44,.44])rounded(m,[x,.472,.192],[.045,.08,.03],'vinyl',.006);
  for(let i=0;i<7;i++)box(m,[-.45+i*.15,.30,.16],[.07,.009,.008],'black');
 }
 for(const[name,half]of[['b3_window_surround',2.5],['b3_window_south_surround',1.5]]){
  const m=mesh(name);
  // Actual optical aperture remains x=0, z ±2.5, y 1.05..3.05. Structure
  // occupies the wall thickness and outer jambs, never an invisible body gate.
  for(const side of[-1,1]){
   const x=side*.43;
   for(const z of[-half-.07,half+.07])rounded(m,[x,2.05,z],[.15,2.20,.14],'wood',.014);
   for(const y of[.982,3.118])rounded(m,[x,y,0],[.15,.135,half*2+.28],'wood',.014);
   // The dark double rebates reveal an acoustic separation without a mirror.
   for(const z of[-half+.004,half-.004])box(m,[side*.32,2.05,z],[.038,2.0,.018],'black');
   for(const y of[1.058,3.042])box(m,[side*.32,y,0],[.038,.018,half*2],'black');
  }
  for(const z of[-half-.07,half+.07])box(m,[0,2.05,z],[.78,2.18,.13],'vinyl');
  for(const y of[.99,3.11])box(m,[0,y,0],[.78,.13,half*2+.14],'vinyl');
  // Separate splayed lower reveals catch torch edge light; no extra pane.
  box(m,[-.18,1.021,0],[.49,.038,half*2-.02],'wood',[0,0,-.055]);
  box(m,[.18,1.025,0],[.49,.038,half*2-.02],'wood',[0,0,.075]);
  for(const x of[-.37,.37])for(const z of[-half-.04,half+.04])for(const y of[1.22,2.88])cylinder(m,[x,y,z],.008,.008,'nickel',8,[0,0,Math.PI/2]);
 }

 // Existing school-chair/equipment-rack fronts are local -Z. Their CC0 source
 // models face +Z, so bake the correction instead of turning placed props.
 for(const row of rows.filter(row=>['b3_engineer_chair','b3_outboard_rack'].includes(row.name)))for(const g of row.groups.values())for(let i=0;i<g.positions.length;i+=3){g.positions[i]*=-1;g.positions[i+2]*=-1;g.normals[i]*=-1;g.normals[i+2]*=-1;}
 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('B3 — The Last Session'),materials=new Map(),records=[];
 const accessor=(name,values,type)=>doc.createAccessor(name).setType(type).setArray(type==='SCALAR'?Uint32Array.from(values):Float32Array.from(values)).setBuffer(buffer);
 for(const row of rows){const out=doc.createMesh(row.name);let triangles=0;
  for(const[role,g]of row.groups){if(!g.indices.length)continue;let mat=materials.get(role);const stock=STOCK[role];if(!mat){mat=doc.createMaterial('B3 / '+role).setBaseColorFactor([...rgb(stock.color),1]).setMetallicFactor(stock.metal).setRoughnessFactor(stock.rough).setExtras({materialFactors:'gltf',role,emissive:false});materials.set(role,mat);}
   out.addPrimitive(doc.createPrimitive().setAttribute('POSITION',accessor(row.name+' / '+role+' positions',g.positions,'VEC3')).setAttribute('NORMAL',accessor(row.name+' / '+role+' normals',g.normals,'VEC3')).setIndices(accessor(row.name+' / '+role+' indices',g.indices,'SCALAR')).setMaterial(mat));triangles+=g.indices.length/3;
  }
  const bounds=minmax([...row.groups.values()].flatMap(g=>g.positions));out.setExtras({asset:'B3 studio upgrade',separateFaderCaps:row.name==='b3_mixing_console',unpowered:true});scene.addChild(doc.createNode(row.name).setMesh(out));records.push({name:row.name,bounds,triangles,primitives:out.listPrimitives().length,sources:row.sources.map(s=>s.id)});
 }
 const bytes=Buffer.from(await new NodeIO().writeBinary(doc)),stats={schema:1,revision:'b3-series-600-reference-v3',asset:B3_STUDIO_PROPS_ASSET,bytes:bytes.length,sha256:sha(bytes),triangles:records.reduce((n,m)=>n+m.triangles,0),primitives:records.reduce((n,m)=>n+m.primitives,0),materials:materials.size,meshes:records,reference:B3_CONSOLE_REFERENCE,contract:{faders:DESK.channels,groupModules:DESK.groupCount,monitorPaths:DESK.monitorCount,barMeters:16,stereoVuMeters:2,channelX:'-.985 + channelIndex*.061',capNominalY:DESK.faderHeight,capNominalZ:DESK.workingFaderZ,travelMetres:DESK.faderTrack,workingValue:DESK.workingValue,window:'No glass model; unchanged B3 aperture/optical pass.',collision:'Existing console, chair and route owners retained.'},limits:{bytes:4000000,triangles:56000,primitives:34}};
 if(stats.bytes>stats.limits.bytes||stats.triangles>stats.limits.triangles||stats.primitives>stats.limits.primitives)throw Error('B3-only budget exceeded '+JSON.stringify({bytes:stats.bytes,triangles:stats.triangles,primitives:stats.primitives}));
 if(records.some(m=>!B3_STUDIO_PROPS_MESHES[m.name]))throw Error('Unregistered studio mesh');
 if(write){
  fs.writeFileSync(path.join(root,'public',B3_STUDIO_PROPS_ASSET),bytes);fs.writeFileSync(path.join(root,'public/assets/b3-studio-props.stats.json'),JSON.stringify(stats,null,2)+'\n');
  fs.writeFileSync(path.join(root,'public/assets/b3-studio-props.credits.json'),JSON.stringify({schema:1,asset:B3_STUDIO_PROPS_ASSET,sha256:stats.sha256,sources:credits.sources.filter(source=>records.some(mesh=>mesh.sources.includes(source.id))),reference:B3_CONSOLE_REFERENCE,modifications:'Console wholly project-authored after the documented 1985 Soundcraft Series 600 topology and controls, adapted to existing game furniture dimensions. Other furniture retains selected CC0 structural groups. B3 channel strips, moving caps, master section, mechanical meter bridge, empty jack mouths, outboard equipment, chair cleanup and double-rebate window surround are project-authored adaptations. No source textures or emissive displays retained.',provenance:'Public creator labels sources CC0 and AI-assisted; native material/scene acceptance remains separate.'},null,2)+'\n');
 }
 return{bytes,stats};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const{stats}=await buildB3StudioProps();console.log(JSON.stringify(stats,null,2));}
