import fs from 'node:fs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL,F} from '../src/data/floorplan/legend.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {ACADEMIC_SOCIETY_ACTORS as ACTORS} from '../src/data/academic-society.js';
import {ACADEMIC_FLOOR_POPULATION} from '../src/data/academic-floor-population.js';
import {ACADEMIC_BOUNCER_ACTORS} from '../src/data/academic-bouncers.js';
import {ACADEMIC_HELD_GEOMETRY as G,ACADEMIC_ADVERSARY_TIMING as T,
  academicHeldFrame,academicHeldCue,academicHeldContact,academicHeldContactTime,
  academicHeldStrikeWindow,academicHeldStrikeHeight,academicHeldSegmentHits,academicHeldCrossing,
} from '../src/data/academic-adversaries.js';
import {createAcademicAdversaries} from '../src/game/academic-adversaries.js';
import {academicAdversaryParts,academicAdversaryCueLayout} from '../src/render/academic-adversaries.js';
import {adversaryWorldMatrix} from '../src/render/conservatory-adversary-performance.js';
import {machinePanelAperture} from '../src/render/presentation.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);
for(const id of ['academic-chamber-vestibule','academic-gallery-lobby'])FP.setDoorOpen(id,true);
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const rendererSource=fs.readFileSync(new URL('../src/render/academic-adversaries.js',import.meta.url),'utf8');
function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name+' exists');
  let i=source.indexOf('{',start),depth=1;
  for(i++;i<source.length&&depth;i++){if(source[i]==='{')depth++;if(source[i]==='}')depth--;}
  return source.slice(start,i);
}
// Execute the actual main projection boundary, rather than assuming authored
// positions can be rounded independently on every frame.
const project=Function('FP',functionSource(main,'conservatoryAdversaryPoint')+';return conservatoryAdversaryPoint;')(FP);
const worldPart=part=>{const p=project(part),w=FP.logicalToPhysical(p.x,p.y);assert.ok(w&&w.renderGroup==='academic');
  return{point:{x:w.x*CELL,y:w.y+part.height,z:w.z*CELL},matrix:adversaryWorldMatrix(w.x*CELL,w.y+part.height,w.z*CELL,part.yaw,part.pitch,part.scale||1)};};
const bytes=fs.readFileSync(new URL('../public/assets/held-note.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const entries=new Map(asset.entries.map(entry=>[entry.name,entry]));
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const window=academicHeldStrikeWindow();
const residents=[...ACTORS,...ACADEMIC_FLOOR_POPULATION,...ACADEMIC_BOUNCER_ACTORS];
const nearbyResidents=residents.filter(actor=>Math.hypot(actor.x-9,actor.y-247)<9);
const evidence={method:'Actual retained GLB vertices deformed by production joint poses and production main anchor projection/world matrix. Compiled physical wall/floor/ceiling cells; conservative furniture boxes and resident columns; contact support is nearest skinned vertex in the 1.10–1.85m chest/head band, not an exact triangle penetration proof.',
  nativeAcceptance:false,assetSha256:sha(bytes),assetBytes:bytes.length,geometry:G,
  samples:[],fieldSamples:[],nearbyResidentColumnIds:nearbyResidents.map(actor=>actor.id),limitations:['Finite temporal samples do not prove every intermediate deformed triangle.','Furniture boxes and 0.32m resident columns are conservative proxies, not exact triangle collision.','The contact proxy intentionally covers the central body; wing tips remain harmless.','Software geometry and panel layout do not prove native visibility, warning comprehension, timing difficulty or control recovery.']};

function skinPoints(part,visit){
  const entry=entries.get(part.mesh);assert.ok(entry,part.mesh+' exists');
  const {matrix:m}=worldPart(part),gpu=sampleCharacterPose(asset,entry,part.character);
  assert.ok([...gpu.bones,...m].every(Number.isFinite));
  let count=0;
  for(const primitive of entry.primitives)for(let index=0;index<primitive.vertexCount;index++){
    const offset=index*3,x=primitive.positions[offset],y=primitive.positions[offset+1],z=primitive.positions[offset+2];
    let lx=0,ly=0,lz=0;
    for(let slot=0;slot<4;slot++){
      const weight=primitive.weights[index*4+slot],j=primitive.joints[index*4+slot]*16;
      lx+=weight*(gpu.bones[j]*x+gpu.bones[j+4]*y+gpu.bones[j+8]*z+gpu.bones[j+12]);
      ly+=weight*(gpu.bones[j+1]*x+gpu.bones[j+5]*y+gpu.bones[j+9]*z+gpu.bones[j+13]);
      lz+=weight*(gpu.bones[j+2]*x+gpu.bones[j+6]*y+gpu.bones[j+10]*z+gpu.bones[j+14]);
    }
    visit(m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]);count++;
  }
  return count;
}
const frame=(phase,elapsed,extra={})=>academicHeldFrame({phase,elapsed,poseTime:8+elapsed,warningComplete:true,...extra});
const bodyParts=(f,reducedMotion=false)=>academicAdversaryParts(f,{reducedMotion}).filter(p=>p.mesh!=='held_note_ceiling_wound');
const shape=f=>{const{phase,threatActive,...body}=f;return body;};

test('retained four faces, wheels and wings use the unchanged real skinned GLB',()=>{
  assert.equal(evidence.assetSha256,'6f03f9611dca96f120d5e0b281aa559db2009dadee3c93d13307077f07a3e0fa');
  assert.deepEqual([...entries.keys()].sort(),['held_note_anatomy','held_note_body','held_note_faces']);
  let vertices=0;
  for(const entry of entries.values())for(const p of entry.primitives){
    vertices+=p.vertexCount;
    for(let i=0;i<p.vertexCount;i++){
      let sum=0;for(let k=0;k<4;k++){const w=p.weights[i*4+k],j=p.joints[i*4+k];assert.ok(Number.isFinite(w)&&w>=0);assert.ok(j<entry.skin.joints.length);sum+=w;}
      assert.ok(Math.abs(sum-1)<1e-5);
    }
  }
  assert.equal(vertices,44995);evidence.verticesPerFrame=vertices;
  const jointNames=asset.nodes.map(node=>node.name);
  for(const name of ['wheel','wing_upper_left','wing_upper_right','jaw'])assert.ok(jointNames.includes(name),name);
});

test('one pure frame controls all three visible parts without hidden clocks or mutation',()=>{
  const input=frame('strike',.3),copy=structuredClone(input),parts=academicAdversaryParts(input);
  assert.equal(parts.length,4);assert.deepEqual(academicAdversaryParts(input),parts);assert.deepEqual(input,copy);
  for(const part of parts.slice(1)){
    for(const key of ['at','anchorAt','height','pitch','yaw','scale'])assert.deepEqual(part[key],input[key]);
    assert.equal(part.academicAdversaryActor,'held-note');assert.equal(part.threatActive,true);assert.equal(part.shadow,true);
    assert.strictEqual(part.character,parts[1].character);
  }
  for(const invalid of [{visible:false},{at:{x:NaN,y:248}},{anchorAt:null},{height:NaN},{scale:0}])
    assert.deepEqual(academicAdversaryParts({...input,...invalid}),[]);
  const settled=academicAdversaryParts(input,{reducedMotion:true});
  for(let i=1;i<parts.length;i++)for(const key of ['at','anchorAt','height','pitch','yaw','scale','threatActive'])assert.deepEqual(settled[i][key],parts[i][key]);
  assert.equal(settled[1].character.time,0);
  assert.notDeepEqual(settled[1].character.joints.wheel,parts[1].character.joints.wheel);
});

test('actual main projection preserves subcell movement and exact shared physical contact coordinates',()=>{
  const f=frame('rest',0),part=bodyParts(f)[0],w=worldPart(part).point;
  assert.ok(Math.abs(w.x-58.85)<1e-8);assert.ok(Math.abs(w.z-8.5)<1e-8);
  assert.ok(Math.abs(w.x-50-G.cueAt.x)<1e-8);assert.ok(Math.abs(w.z+240-G.cueAt.y)<1e-8);
  for(let i=0;i<30;i++){
    const moved={...part,at:{x:part.at.x+i*.02,y:part.at.y-i*.013}},p=worldPart(moved).point;
    assert.ok(Math.abs(p.x-w.x-i*.02)<1e-7);assert.ok(Math.abs(p.z-w.z+i*.013)<1e-7);
  }
  const snapped=FP.toRuntimePoint(part.at);assert.notEqual(snapped.x,project(part).x,'fixture exposes the old independently rounded root');
  evidence.productionRoot={renderAuthored:part.at,anchorAt:part.anchorAt,runtime:project(part),world:w,
    playerCoordinates:{x:w.x-50,y:w.z+240},authoredCenterOffset:FP.toRuntimePoint({x:0,y:0}).x*CELL};
});

test('demonstration, first warning, low contact withdrawal and pause retain continuous body poses',()=>{
  const demo=frame('demonstration',T.demonstration,{poseTime:5.7});
  const warning=frame('warning',0,{poseTime:5.7,warningFrom:demo});assert.deepEqual(shape(warning),shape(demo));
  const settled=frame('warning',G.warningTravel,{poseTime:6.9,warningFrom:demo});
  assert.deepEqual(settled.at,G.at);assert.equal(settled.scale,G.scale);
  const low=frame('strike',window.start,{poseTime:9});
  assert.ok(Math.abs(low.height-G.activeHeight)<1e-8);
  assert.deepEqual(shape(frame('withdraw',0,{poseTime:9,withdrawFrom:low})),shape({...low,threatActive:false}));
  for(const original of [demo,warning,low,frame('rest',1)]){
    const frozen=academicHeldFrame({phase:'suspended',elapsed:50,suspendedFrom:original});
    assert.deepEqual(shape(frozen),shape(original));assert.equal(frozen.threatActive,false);
    const resumed=frame('warning',0,{poseTime:original.clipTime,warningFrom:frozen});
    assert.deepEqual(shape(resumed),shape(original));
    assert.deepEqual(bodyParts(frozen).map(p=>p.character),bodyParts(original).map(p=>p.character));
  }
});

const furniture=PROPS.renderInstances({group:'academic',inscriptions:false}).filter(object=>object.y>=9.8&&object.y<12&&PROP_BOUNDS[object.mesh]&&Math.hypot(object.x-59,object.z-7)<8);
function insideFurniture(x,y,z,object){const b=PROP_BOUNDS[object.mesh],s=object.scale||1,c=Math.cos(object.yaw||0),sn=Math.sin(object.yaw||0),dx=x-object.x,dz=z-object.z;
  const p=[(c*dx+sn*dz)/s,(y-object.y)/s,(-sn*dx+c*dz)/s];return p.every((v,i)=>v>b.min[i]+.005&&v<b.max[i]-.005);}
const cellCache=new Map();
function physicalCell(x,z){const key=`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`;if(!cellCache.has(key)){
  const runtime=FP.logicalAtPhysical(x/CELL,z/CELL,{group:'academic',floor:10});
  cellCache.set(key,runtime?{runtime,cell:FP.cellAt(runtime.x,runtime.y),solid:FP.isSolid(runtime.x,runtime.y)||FP.isCollisionOnly(runtime.x,runtime.y)}:null);
}return cellCache.get(key);}

test('actual deformed demonstration-to-withdrawal path clears compiled walls, floor, ceiling, furniture and residents',()=>{
  const demoEnd=frame('demonstration',T.demonstration,{poseTime:5.7}),hit=frame('strike',.3,{poseTime:9.2});
  const scenarios=[
    ...[0,.7,1.4].map(t=>({label:'reveal',frame:frame('reveal',t,{poseTime:t})})),
    ...[0,1.075,2.15,3.225,4.3].map(t=>({label:'demonstration',frame:frame('demonstration',t,{poseTime:1.4+t})})),
    ...[0,.12,.24,.36,.48,.6,.72,.84,.96,1.08,1.2,3.2].map(t=>({label:'warning',frame:frame('warning',t,{poseTime:5.7+t,warningFrom:demoEnd})})),
    ...[0,.1,window.start,.16,.18,.3,.48,.55,window.end,.7,.8].map(t=>({label:'strike',frame:frame('strike',t,{poseTime:8.9+t})})),
    ...[0,2,4].map(t=>({label:'rest',frame:frame('rest',t,{poseTime:9.7+t})})),
    ...[0,.55,1.1].map(t=>({label:'withdraw',frame:frame('withdraw',t,{poseTime:9.2,withdrawFrom:hit})})),
  ];
  const problems=[];
  for(const reducedMotion of [false,true])for(const scenario of scenarios){
    const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let vertices=0,minFloor=Infinity,minCeiling=Infinity,minResident=Infinity;
    for(const part of bodyParts(scenario.frame,reducedMotion))vertices+=skinPoints(part,(x,y,z)=>{
      if(![x,y,z].every(Number.isFinite)){problems.push({kind:'nonfinite',...scenario});return;}
      [x,y,z].forEach((v,i)=>{bounds.min[i]=Math.min(bounds.min[i],v);bounds.max[i]=Math.max(bounds.max[i],v);});
      const found=physicalCell(x,z);
      if(!found||found.solid||!found.cell){if(problems.length<12)problems.push({kind:'wall/unknown',phase:scenario.label,elapsed:scenario.frame.clipTime,reducedMotion,at:[x,y,z]});}
      else{
        minFloor=Math.min(minFloor,y-found.cell.floor);minCeiling=Math.min(minCeiling,found.cell.ceil-y);
        if(y<found.cell.floor-.005||y>found.cell.ceil+.005)if(problems.length<12)problems.push({kind:'slab',phase:scenario.label,at:[x,y,z],floor:found.cell.floor,ceil:found.cell.ceil});
      }
      for(const actor of nearbyResidents)if(y>=actor.floor&&y<=actor.floor+actor.height){
        const distance=Math.hypot(x-(50+actor.x),z-(actor.y-240))-.32;minResident=Math.min(minResident,distance);
        if(distance<0&&problems.length<12)problems.push({kind:'resident column',actor:actor.id,phase:scenario.label,at:[x,y,z]});
      }
      for(const object of furniture)if(insideFurniture(x,y,z,object)&&problems.length<12)problems.push({kind:'furniture box',id:object.id,phase:scenario.label,at:[x,y,z]});
    });
    evidence.samples.push({phase:scenario.label,elapsed:scenario.frame.clipTime,reducedMotion,vertices,bounds,minFloor,minCeiling,minResident:Number.isFinite(minResident)?minResident:null});
  }
  evidence.pathProblems=problems;
  assert.deepEqual(problems,[],JSON.stringify(problems));
  assert.equal(evidence.samples.length,74);assert.ok(evidence.samples.every(s=>s.vertices===44995));
});

test('active contact proxy stays supported by actual chest/head-band skin in normal and reduced poses',()=>{
  const box=G.damageBounds;assert.deepEqual(box,{x0:8.55,x1:8.9,y0:248.05,y1:248.4});
  for(const reducedMotion of [false,true])for(const elapsed of [window.start,.18,.48,window.end])for(const poseTime of [0,3.3,6.6,9.1,13.2,16.5,20,23.1]){
    const points=[];
    for(const part of bodyParts(frame('strike',elapsed,{poseTime}),reducedMotion))skinPoints(part,(x,y,z)=>{if(y>=11.1&&y<=11.85)points.push([x-50,z+240]);});
    let max=0;
    for(let ix=0;ix<=7;ix++)for(let iy=0;iy<=7;iy++){
      const x=box.x0+(box.x1-box.x0)*ix/7,y=box.y0+(box.y1-box.y0)*iy/7;let nearest=Infinity;
      for(const p of points)nearest=Math.min(nearest,Math.hypot(x-p[0],y-p[1]));max=Math.max(max,nearest);
    }
    evidence.fieldSamples.push({reducedMotion,elapsed,poseTime,headBandVertices:points.length,maxNearestVertexDistance:max});
    assert.ok(max<=.2,`raw body proxy unsupported by ${max}m at ${elapsed}/${poseTime}/${reducedMotion}`);
  }
  evidence.maximumFieldSupportDistance=Math.max(...evidence.fieldSamples.map(s=>s.maxNearestVertexDistance));
});

test('geometry-derived contact interval rejects high sweeps and round-corner false hits',()=>{
  assert.ok(window.start>0&&window.end<T.strike);
  for(const t of [0,.1,window.start,.18,.48,window.end,.7,.8]){
    const f=frame('strike',t);assert.equal(f.threatActive,t>=window.start&&t<=window.end);
    if(f.threatActive)assert.ok(academicHeldStrikeHeight(t)<=G.activeHeight+1e-8);
  }
  const b=G.damageBounds,corner={x:b.x0-.23,y:b.y0-.23},edge={x:b.x0-.20,y:(b.y0+b.y1)/2};
  assert.equal(academicHeldSegmentHits(corner,corner,b,.24),false);
  assert.equal(academicHeldSegmentHits(edge,edge,b,.24),true);
  assert.equal(academicHeldContact({x:9,y:247},{x:9,y:249},0,.1),false);
  assert.equal(academicHeldContact({x:9,y:247},{x:9,y:249},.2,.3),true);
  assert.equal(academicHeldContact({x:9,y:247},{x:9,y:249},.7,.8),false);
  const p={x:9,y:248.5},when=academicHeldContactTime(p,p,.1,.2);
  assert.ok(Math.abs(when-window.start)<1e-9);assert.ok(Math.abs(frame('strike',when).height-G.activeHeight)<1e-8);
});

test('counterplay has clear waiting marks, an ordinary crossing and a real eastern side route',()=>{
  function clearPath(a,b){const steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.08);for(let i=0;i<=steps;i++)for(let angle=0;angle<16;angle++){
    const t=i/steps,r=angle*Math.PI/8,x=(a.x+(b.x-a.x)*t+Math.cos(r)*.24)*2,y=(a.y+(b.y-a.y)*t+Math.sin(r)*.24)*2;
    assert.equal(FP.isSolid(x,y)||FP.isCollisionOnly(x,y)||FP.hasFlag(x,y,F.CLOSED),false,'ordinary route crosses wall/leaf');
    assert.equal(FP.floorAt(x,y),10);assert.equal(PROPS.propCanOccupy(x,y),true);
  }}
  const north={x:9,y:246.4},south={x:9,y:249.4};clearPath(north,south);
  for(const p of [north,south])assert.equal(academicHeldSegmentHits(p,p,G.damageBounds,G.playerRadius),false);
  for(const [a,b] of [[north,south],[south,north]])assert.equal(academicHeldCrossing(a,b,G.crossingGate),true);
  const sideA={x:9.8,y:248.1},sideB={x:9.8,y:249.4};clearPath(sideA,sideB);
  assert.equal(academicHeldSegmentHits(sideA,sideB,G.damageBounds,G.playerRadius),false);
  const c=createAcademicAdversaries({demonstrated:true}),ctx={group:'academic',ready:true,aware:true,player:north};
  c.tick(0,ctx);for(let i=0;i<100&&c.view().phase!=='rest';i++)c.tick(.1,ctx);
  assert.equal(c.view().phase,'rest');const events=c.tick(.1,{...ctx,player:south});
  assert.equal(events.find(e=>e.type==='resolved')?.outcome,'clean');
});

test('actual warning, strike and rest instructions plus phase/timer fit native panel sizes',()=>{
  for(const cols of [64,80,100])for(const rows of [36,40])for(const phase of ['warning','strike','rest','suspended']){
    const view={phase,elapsed:.2,cue:academicHeldCue({phase,elapsed:.2})},layout=academicAdversaryCueLayout(view,{cols,rows});
    assert.ok(layout?.fits);assert.ok(layout.x>=0&&layout.x+layout.width<=cols);assert.ok(layout.y+layout.height<rows);
    const aperture=machinePanelAperture(layout.x,layout.y,layout.width,layout.height);
    assert.ok(layout.body.y+layout.content.length<=aperture.y+aperture.h-.5,'entire last glyph cell clears the actual clipped glass and lower rim by half a row');
    assert.ok(layout.content.every(line=>line.text.length<=layout.body.w));
    assert.ok(layout.content.some(line=>line.text.includes(phase.toUpperCase())));
    if(phase!=='suspended')assert.ok(layout.content.some(line=>/\d\.\d s/.test(line.text)));
    assert.equal(layout.content.filter(line=>line.cls==='ui-amber').map(line=>line.text).join(' '),view.cue.instruction);
  }
  assert.equal(academicAdversaryCueLayout({cue:null},{cols:64,rows:40}),null);
  const paintCalls=[],paint=Function('academicAdversaryCueLayout','uiSize','withMachinePanel','uiText',functionSource(rendererSource,'renderAcademicAdversaryCue')+';return renderAcademicAdversaryCue;')(
    academicAdversaryCueLayout,()=>({cols:64,rows:40}),(x,y,w,h,options,draw)=>{const layout=academicAdversaryCueLayout({phase:'warning',cue:academicHeldCue({phase:'warning'})},{cols:64,rows:40});draw(layout.body);},(...args)=>paintCalls.push(args));
  const painted=paint({phase:'warning',cue:academicHeldCue({phase:'warning'})});assert.equal(painted.fits,true);
  assert.equal(paintCalls.length,painted.content.length,'every measured line is actually submitted for painting');
});

after(()=>{
  if(!process.env.ACADEMIC_ADVERSARY_RECEIPT)return;
  evidence.totalPathVertexChecks=evidence.samples.reduce((sum,s)=>sum+s.vertices,0);
  evidence.modules=Object.fromEntries(['src/render/academic-adversaries.js','src/data/academic-adversaries.js','src/game/academic-adversaries.js','test/academic-adversaries-spatial.spec.mjs'].map(path=>[path,sha(fs.readFileSync(new URL('../'+path,import.meta.url)))]));
  fs.writeFileSync(process.env.ACADEMIC_ADVERSARY_RECEIPT,JSON.stringify(evidence,null,2)+'\n');
});
