import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {busDoorAttemptHands,BUS_DOOR_ATTEMPT_HANDS as C} from '../src/render/bus-door-attempt-hands.js';
import {WHEEL_HAND_GEOMETRY} from '../src/game/source-drive/geometry/wheel-hands-pose.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
const bytes=fs.readFileSync(new URL('../public/assets/source-drive/geometry/wheel-hands.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),hand=asset.entries.find(e=>e.name==='drive_right_hand');
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),mul=(a,n)=>a.map(v=>v*n),len=a=>Math.hypot(...a),unit=a=>mul(a,1/(len(a)||1));
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]);
const close=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function fixture({yaw=Math.PI/2,angle=0,elapsed=.78,front=false,translation=[.25,15.2,-767.805]}={}){
 const c=Math.cos(yaw),s=Math.sin(yaw),world=p=>[translation[0]+p[0]*c+p[2]*s,translation[1]+p[1],translation[2]-p[0]*s+p[2]*c];
 const localHandle=front?[-1.175,1.53,-3.15]:[1.175,1.53,4.16],hinge=front?[-1.245,.25,-3.70]:[1.245,.25,3.30],d=sub(localHandle,hinge),a=Math.cos(angle),b=Math.sin(angle);
 const handle=world([hinge[0]+d[0]*a+d[2]*b,localHandle[1],hinge[2]-d[0]*b+d[2]*a]);
 const eye=world(front?[-.75,2.12,-2.95]:[.75,2.12,3.85]);
 const input={attempt:{kind:front?'entry':'exit',elapsed,handle,angle},player:{eye,yaw:(front?-Math.PI/2:Math.PI/2)-yaw},busYaw:yaw};
 return{input,result:busDoorAttemptHands(input),world,localHandle};
}
function posedVertex(p,v,pose){const out=[0,0,0];for(let k=0;k<4;k++){const at=v*4+k,w=p.weights[at],j=p.joints[at]*16;if(!w)continue;for(let a=0;a<3;a++)out[a]+=w*(pose.bones[j+a]*p.positions[v*3]+pose.bones[j+4+a]*p.positions[v*3+1]+pose.bones[j+8+a]*p.positions[v*3+2]+pose.bones[j+12+a]);}return out;}

test('the door animation uses only the approved actual right anatomical meshes with a deterministic retained clock',()=>{
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),WHEEL_HAND_GEOMETRY.sha256);
 assert.equal(C.asset,WHEEL_HAND_GEOMETRY.url);
 const {input,result}=fixture();assert.deepEqual(result.props.map(p=>p.mesh),C.meshes);assert.deepEqual(busDoorAttemptHands(structuredClone(input)),result);
 assert.ok(result.props.every(p=>!p.mesh.includes('left')));assert.equal(result.diagnostics.phase,'grip');assert.equal(result.diagnostics.atContact,true);
 assert.equal(busDoorAttemptHands().diagnostics.phase,'idle');assert.deepEqual(fixture({elapsed:1.85}).result.props,[]);
});

test('the complete reach, three loaded pulls and withdrawal preserve anchored arm lengths and a sane wrist',()=>{
 let maxBend=0;const pulls=[];
 for(let i=0;i<111;i++){
  const elapsed=i/60,angle=.045*Math.sin(elapsed*22),{result}=fixture({elapsed,angle});
  assert.equal(result.diagnostics.rejected,false);if(!result.props.length)continue;const d=result.diagnostics;
  close(d.upperLengthM,.34);close(d.forearmLengthM,.32);assert.ok(d.reachM<.66);assert.ok(d.wristBendDegrees<30);maxBend=Math.max(maxBend,d.wristBendDegrees);
  for(const p of result.props)assert.ok(p.matrix.every(Number.isFinite));
  if(elapsed>=.34&&elapsed<=1.25)close(d.contactErrorM,0,1e-9);
 }
 for(const elapsed of[.48,.78,1.08])pulls.push(fixture({elapsed}).result.diagnostics.pull);
 assert.ok(pulls.every(p=>p>.8));assert.ok(fixture({elapsed:.65}).result.diagnostics.pull<.01);
 assert.ok(maxBend>10,'the test did not exercise the actual reach');
});

test('the native palm faces the actual bar while wrist and forearm stay on the player side, with proper nonmirrored rotations',()=>{
 for(const front of[false,true])for(const yaw of[0,.43,Math.PI/2,-1.1])for(const angle of[-.04,0,.055]){
  const {result,world}=fixture({front,yaw,angle}),d=result.diagnostics;assert.equal(d.rejected,false);
  const m=result.props[0].matrix,det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);close(det,1,1e-6);
  const side=front?-1:1,normal=[side*Math.cos(yaw+angle),0,-side*Math.sin(yaw+angle)];
  assert.ok(dot(sub(d.wrist,d.handle),normal)<-.085,'wrist is outside the door, behind the gripping palm');
  close(len(sub(transform(m,C.gripReference),d.handle)),0,1e-9);
  const expected=[Math.sin(yaw+angle),0,Math.cos(yaw+angle)];close(Math.abs(dot(expected,d.barAxis)),1,1e-6);
  assert.ok(dot(sub(d.shoulder,d.handle),normal)<0,'anchored shoulder passed outside the bus');
 }
});

test('the actual skin encloses the real40mm square release bar without corner penetration or a floating grip',t=>{
 let minimum=Infinity,maximumCornerPenetration=0,skinPoints=0;
 for(const front of[false,true])for(const angle of[-.04,0,.055])for(const elapsed of[.34,.48,.78,1.08,1.25]){
  const {result}=fixture({front,angle,elapsed}),prop=result.props[0],pose=sampleCharacterPose(asset,hand,prop.character),d=result.diagnostics;
  const x=unit(prop.matrix.slice(0,3)),axis=d.barAxis,z=unit(prop.matrix.slice(8,11));
  const distance=p=>{const q=sub(p,d.handle),a=Math.abs(dot(q,x))-.020,b=Math.abs(dot(q,z))-.020,c=Math.abs(dot(q,axis))-.080;return Math.hypot(Math.max(a,0),Math.max(b,0),Math.max(c,0))+Math.min(Math.max(a,b,c),0);};
  for(const primitive of hand.primitives){const vertices=Array.from({length:primitive.vertexCount},(_,v)=>transform(prop.matrix,posedVertex(primitive,v,pose)));
   for(const p of vertices){minimum=Math.min(minimum,distance(p));skinPoints++;}
   for(let i=0;i<primitive.indices.length;i+=3){const a=vertices[primitive.indices[i]],b=vertices[primitive.indices[i+1]],c=vertices[primitive.indices[i+2]];for(const p of[mul(add(a,b),.5),mul(add(b,c),.5),mul(add(c,a),.5),mul(add(add(a,b),c),1/3)])maximumCornerPenetration=Math.max(maximumCornerPenetration,-distance(p));}
  }
 }
 assert.ok(minimum>=-.00001,`skin vertices penetrate squarebar by${-minimum}m`);assert.ok(minimum<.0005,`the hand hovers${minimum}m from its bar`);
 assert.ok(maximumCornerPenetration<.0006,`actual skin triangles cross a bar corner by${maximumCornerPenetration}m`);
 t.diagnostic(JSON.stringify({sampledSkinVertices:skinPoints,minimumSkinGapM:minimum,maximumTriangleCornerPenetrationM:maximumCornerPenetration}));
});

test('out-of-reach or invalid attempts never render an elastic arm or a detached hovering hand',()=>{
 const {input}=fixture();input.player.eye[2]+=2;const far=busDoorAttemptHands(input);assert.equal(far.diagnostics.rejected,true);assert.deepEqual(far.props,[]);
 const invalid=fixture().input;invalid.attempt.handle[1]=NaN;assert.equal(busDoorAttemptHands(invalid).diagnostics.rejected,true);
 const unknown=fixture().input;unknown.attempt.kind='unowned-door';assert.equal(busDoorAttemptHands(unknown).diagnostics.rejected,true);
});
