import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OUTSKIRTS_BUS_PASSAGE as C,busPassageCollisionBoxes} from '../src/data/outskirts-bus-passage.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {busWomanInstances} from '../src/game/bus-woman-presentation.js';
import {BUS_WOMAN_CLIPS} from '../src/render/bus-woman-performance.js';

const load=name=>{const b=fs.readFileSync(new URL(`../public/assets/${name}.glb`,import.meta.url));return parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const canonical=load('bus-woman-character'),altered=load('outskirts-bus-woman-wrong-origin');
const entries=new Map([...canonical.entries.map(entry=>[entry.name,{asset:canonical,entry}]),...altered.entries.map(entry=>[entry.name,{asset:altered,entry}])]);
const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
let captured;
function envelopeCloud(){
  if(captured)return captured;
  const samples=[],projections=new Map();let vertices=0;
  for(const woman of[C.woman,{x:-.72,y:.5,z:2.95,yaw:0}]){
    const key=JSON.stringify(woman);if(!projections.has(key))projections.set(key,{woman,c:Math.cos(woman.yaw),s:Math.sin(woman.yaw),min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],forwardmost:null});
  }
  for(const[mode,duration]of Object.entries(BUS_WOMAN_CLIPS)){
    // The mandatory interior encounter keeps her planted. Its footsteps are
    // neither a clearance substitute nor an independently moving root.
    if(mode.startsWith('step'))continue;
    for(const acknowledgeYaw of mode.startsWith('acknowledge')?[-.6,0,.6]:[0])for(let i=0;i<=Math.round(duration*30);i++){
      const seconds=Math.min(duration,i/30),parts=busWomanInstances({id:'r7-bus-woman',mesh:'outskirts_bus_woman',matrix:identity},{mode,seconds,stretch:7,acknowledgeYaw});
      const sample={mode,seconds,acknowledgeYaw,parts:parts.map(p=>p.mesh)};samples.push(sample);
      for(const part of parts){
        const {asset,entry}=entries.get(part.mesh),pose=sampleCharacterPose(asset,entry,part.character);
        for(const primitive of entry.primitives)for(let v=0;v<primitive.vertexCount;v++){
          const position=[primitive.positions[v*3],primitive.positions[v*3+1],primitive.positions[v*3+2]];
          for(let m=0;m<primitive.targets.length;m++)for(let k=0;k<3;k++)position[k]+=primitive.targets[m].positions[v*3+k]*pose.morphs[m];
          const p=[0,0,0];for(let slot=0;slot<4;slot++){
            const at=v*4+slot,w=primitive.weights[at];if(!w)continue;const j=primitive.joints[at]*16;
            for(let k=0;k<3;k++)p[k]+=w*(pose.bones[j+k]*position[0]+pose.bones[j+4+k]*position[1]+pose.bones[j+8+k]*position[2]+pose.bones[j+12+k]);
          }
          for(const b of projections.values()){
            const q=[b.woman.x+p[0]*b.c+p[2]*b.s,b.woman.y+p[1],b.woman.z-p[0]*b.s+p[2]*b.c];
            if(q[2]<b.min[2])b.forwardmost={mode,seconds,mesh:part.mesh,point:q};
            for(let k=0;k<3;k++){b.min[k]=Math.min(b.min[k],q[k]);b.max[k]=Math.max(b.max[k],q[k]);}
          }
          vertices++;
        }
      }
    }
  }
  return captured={projections,samples,vertices};
}
function envelope(woman){const b=envelopeCloud().projections.get(JSON.stringify(woman));assert.ok(b,'add this exact authored placement to the bounded envelope projections');return{min:b.min,max:b.max,forwardmost:b.forwardmost};}
const boxDistance=(x,z,b)=>Math.hypot(Math.max(b.min[0]-x,0,x-b.max[0]),Math.max(b.min[2]-z,0,z-b.max[2]));
function route(phase,zPhase=0){const chosen=phase<0?phase+.5:phase,turn=2+zPhase+(zPhase===0?.5:0),exit=3.5+zPhase+(3.5+zPhase<3.64?.5:0);return[[phase,-2.5],[phase,turn],[chosen,turn],[chosen,exit],[2+phase,exit]];}
function walk(points,bounds){let minimum=Infinity;for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.025));for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n;minimum=Math.min(minimum,boxDistance(x,z,bounds));}}return minimum;}

test('the literal stage-three body and its supported accessories produce a finite sampled clearance envelope',t=>{
  const cloud=envelopeCloud();assert.equal(cloud.samples.length,1043);assert.ok(cloud.vertices>39000000);
  assert.ok(cloud.samples.every(s=>s.parts.includes('outskirts_bus_woman_wrong_origin_3')&&s.parts.includes('bus_woman_bag')));
  assert.ok(cloud.samples.some(s=>s.parts.includes('bus_woman_ticket')));
  const old=envelope({x:-.72,y:.5,z:2.95,yaw:0});
  assert.ok(old.min[0]<-1.13,'counterfactual no longer reproduces the original wall clipping');
  assert.ok(boxDistance(-.25,2.95,old)<C.bodyRadius,'counterfactual no longer reproduces the left-phase aisle obstruction');
  t.diagnostic(JSON.stringify({samples:cloud.samples.length,posedVertices:cloud.vertices,oldBounds:old,currentBounds:envelope(C.woman)}));
});

test('her unit-scale animated envelope stays inside the empty rear bay and covers the explicit collider',()=>{
  const b=envelope(C.woman);
  assert.ok(b.min[0]>=-1.13+.02,`body/bag enters inner side wall at ${b.min[0]}`);
  assert.ok(b.max[0]<=-.25,`body/hand enters the ordinary centre lane at ${b.max[0]}`);
  assert.ok(b.min[2]>=2.975,`body/bag exceeds the authored rear bay envelope at ${b.min[2]}`);
  assert.ok(b.max[2]<3.845,`body exceeds the authored rear bay envelope at ${b.max[2]}`);
  assert.ok(b.min[1]>=C.floor&&b.max[1]<2.5);
  const collider=busPassageCollisionBoxes().at(-1);
  assert.ok(collider.minX<=b.min[0]&&collider.maxX>=b.max[0]&&collider.minZ<=b.min[2]&&collider.maxZ>=b.max[2],`body collider ${JSON.stringify(collider)} does not cover ${JSON.stringify(b)}`);
});

test('both half-metre aisle phases can yield right in the rear vestibule and clear every sampled pose',t=>{
  const b=envelope(C.woman);let minimum=Infinity;
  const phases=[-.249,-.1945,-.125,-.055,-.001,0,.055,.125,.1945,.249];
  for(const phase of phases)for(const zPhase of[0,.125,.14,.15,.25,.375])minimum=Math.min(minimum,walk(route(phase,zPhase),b),walk(route(phase,zPhase).reverse(),b));
  assert.ok(minimum>=C.bodyRadius+.015,`sampled animated envelope leaves only ${minimum-C.bodyRadius} m body clearance`);
  const boxes=busPassageCollisionBoxes(),margin=C.bodyRadius;
  for(const phase of phases)for(const zPhase of[0,.125,.14,.15,.25,.375]){
    const points=route(phase,zPhase);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.025));for(let k=0;k<=n;k++){
      const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n;
      assert.ok(!boxes.some(b=>x>=b.minX-margin&&x<=b.maxX+margin&&z>=b.minZ-margin&&z<=b.maxZ+margin),`authored grid route ${x},${z} is blocked`);
    }}
  }
  const actor=boxes.at(-1),lastSeat=C.seatRows.at(-1)+.365;
  assert.ok(actor.minZ-margin-(lastSeat+margin)>.5,'rear vestibule does not permit a full grid step before the actor');
  t.diagnostic(JSON.stringify({bounds:b,minimumSurfaceClearance:minimum-C.bodyRadius,route:'keep own half-metre phase; yield to closest nonnegative centre in the rear seat/pole gap; exit within the real doorway'}));
});
