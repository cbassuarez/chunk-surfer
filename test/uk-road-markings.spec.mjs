import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UK_ROAD_MARKINGS as M,UK_ROAD_LINE_CHANGES as CHANGES,ukRoadLineAt,ukRoadMarkingMeshAt,ukRoadStudsBetween} from '../src/data/uk-road-markings.js';
import {openingRoadAt} from '../src/game/source-drive/opening-road.js';
import {roadAt} from '../src/game/source-drive/road.js';
import {DIPPED_BEAM,DIPPED_BEAM_GLSL,dippedBeamWeight} from '../src/render/dipped-beam.js';

const radiusAt=d=>{const r=d<-32?openingRoadAt(d):roadAt(d),k=Math.abs(r.curvature||0);return k>1e-9?1/k:Infinity;};
const tightest=(from,to)=>{let min=Infinity;for(let d=from;d<to;d+=1)min=Math.min(min,radiusAt(d));return min;};
const unmarked=d=>{if(d<-32)return false;const t=roadAt(d).treatment;return t.pinch>.35||t.expanse>.12||t.snowCover>.45;};

test('double white lines go only where the bends are tight, and every one is approached on a warning line',()=>{
  const sorted=[...CHANGES].sort((a,b)=>a.from-b.from);
  for(let k=1;k<sorted.length;k++)assert.ok(sorted[k].from>=sorted[k-1].to,'changes never overlap');
  for(const row of CHANGES.filter(r=>r.kind==='double')){
    assert.ok(tightest(row.from,row.to)<135,`${row.from}..${row.to} has a bend under 135 m (${tightest(row.from,row.to).toFixed(0)})`);
    const before=CHANGES.find(r=>r.to===row.from);
    assert.ok(before?.kind==='warning'||unmarked(row.from-1),`${row.from}: the line warns before it forbids`);
    if(before)assert.ok(before.to-before.from>=M.warning.periodM*Math.min(M.warning.minimumMarks,6)||CHANGES.some(r=>r.to===before.from&&r.kind==='double'),`${row.from}: enough warning marks on the way in`);
  }
  for(const row of CHANGES.filter(r=>r.kind==='warning'))assert.ok(tightest(row.from,row.to+40)<455,`${row.from}: a warning line leads to a bend`);
});

test('the Source switchbacks stay unmarked, as the route authored them',()=>{
  for(const row of CHANGES)for(let d=row.from;d<row.to;d+=2)assert.equal(unmarked(d),false,`${d} is painted only where paving is marked`);
});

test('studs sit in the gaps of the line they belong to, at that line\'s spacing',()=>{
  const studs=ukRoadStudsBetween(-716,1244,d=>!unmarked(d));
  assert.ok(studs.length>150);
  for(const d of studs){
    const kind=ukRoadLineAt(d);
    if(kind!=='double')assert.equal(ukRoadMarkingMeshAt(d),'drive_uk_edge_markings',`${d} (${kind}) is in a gap`);
  }
  const spacing=kind=>{const run=studs.filter(d=>ukRoadLineAt(d)===kind);return Math.min(...run.slice(1).map((d,i)=>d-run[i]));};
  assert.equal(spacing('centre'),M.studs.centre);assert.equal(spacing('warning'),M.studs.warning);assert.equal(spacing('double'),M.studs.double);
  assert.ok(M.studs.double>=3&&M.studs.double<=4.5,'section 3.3.1: between 3 and 4.5 m');
  for(const d of[200,250,300,1050])assert.ok(!studs.includes(d)&&!studs.some(s=>Math.abs(s-d)<2),`no studs on unmarked paving near ${d}`);
});

test('a warning line is twice the paint of a centre line on the same 6 m module',()=>{
  const share=(from,to)=>{let paint=0,n=0;for(let d=from;d<to;d+=2){n++;if(ukRoadMarkingMeshAt(d)==='drive_uk_centre_and_edges')paint++;}return paint/n;};
  assert.ok(Math.abs(share(-20,100)-1/3)<.02,'1008: 2 m in 6');
  assert.ok(Math.abs(share(-282,-38)-2/3)<.02,'1004: 4 m in 6');
  for(let d=-596;d<-386;d+=2)assert.equal(ukRoadMarkingMeshAt(d),'drive_uk_double_white');
});

test('the double white tile is two continuous 100 mm lines 100 mm apart, with the edges',()=>{
  const bytes=fs.readFileSync(new URL('../public/assets/source-drive/cut/cut-roadside.glb',import.meta.url)),size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size)),bin=bytes.subarray(28+size);
  const mesh=doc.meshes.find(m=>m.name==='drive_uk_double_white');assert.ok(mesh,'built into the roadside pack');
  const a=doc.accessors[mesh.primitives[0].attributes.POSITION],v=doc.bufferViews[a.bufferView],xs=[];
  for(let i=0;i<a.count;i++)xs.push(bin.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+i*12));
  const centre=[...new Set(xs.filter(x=>Math.abs(x)<1).map(x=>x.toFixed(3)))].map(Number).sort((p,q)=>p-q);
  assert.deepEqual(centre,[-.15,-.05,.05,.15],'lines span ±0.05..0.15 m');
  assert.ok(fs.readFileSync(new URL('../src/game/source-drive-renderer.js',import.meta.url),'utf8').includes("'drive_uk_double_white'"),'the renderer loads it');
});

test('the dipped beam is flat on the offside, kicks up on the nearside, and reaches down the road',()=>{
  const lamp=.8,at=(along,across,up)=>dippedBeamWeight([across,up,-along],0,.02);
  // Ten metres up a wall at 40 m ahead: the nearside is lit higher than the offside.
  const lift=side=>{let y=-lamp;while(y<3&&at(40,side*4,y)>.05)y+=.01;return y;};
  assert.ok(lift(-1)>lift(1)+.4,`nearside lit to ${lift(-1).toFixed(2)} m, offside to ${lift(1).toFixed(2)} m`);
  // Road illuminance, with the renderer's own reach and grazing angle: a tongue, not a pool.
  const road=d=>at(d,0,-lamp)*(1-d/95)**2*lamp/d,old=d=>Math.min(2,(18/(10+d))**2)*(1-d/95)**2*lamp/d;
  assert.ok(road(30)/road(6)>old(30)/old(6)*6,`the road at 30 m against 6 m: ${(road(30)/road(6)).toFixed(3)} (was ${(old(30)/old(6)).toFixed(3)})`);
  assert.ok(road(6)<old(6),'the pool at the bumper is gone');
  assert.equal(at(-5,0,-lamp),0,'nothing behind the lamps');
  for(const key of['rise','maxRise','hotAxis','hot','hotDepth'])assert.ok(DIPPED_BEAM_GLSL.includes(String(DIPPED_BEAM[key]).replace(/^0\./,'.').replace(/^-0\./,'-.'))||DIPPED_BEAM_GLSL.includes(String(DIPPED_BEAM[key])),`the shader carries ${key}`);
});
