import test from 'node:test';
import assert from 'node:assert/strict';
import {horizonCamera} from '../src/render/horizon3d.js';
import {sourceDemolitionMediumUniforms as uniforms,sourceDemolitionMediumRay as ray,
  sourceDemolitionMediumInterval as interval,sourceDemolitionMediumTransmittance as transmission} from '../src/render/source-demolition-medium.js';

const field={min:[-18,-.4,-38],max:[18,40.4,-8],progress:1};
const camera=(extra={})=>uniforms({medium:field,eye:[0,1.7,-12],...extra});
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);

test('rays use the actual shore projection and camera, including oblique forward-depth conversion',()=>{
  const c=camera({yaw:.63,pitch:-.23,aspect:1.9}),h=horizonCamera({yaw:.63,pitch:-.23,aspect:1.9});
  assert.ok(ray(c).every((v,i)=>Math.abs(v-h.forward[i])<1e-12));
  const corner=ray(c,[.97,.13]);
  assert.ok(Math.abs(Math.hypot(...corner)-1)<1e-12);
  const point=c.eye.map((v,i)=>v+corner[i]*17),forwardDepth=17*dot(corner,c.forward);
  assert.ok(Math.abs(forwardDepth/dot(corner,c.forward)-17)<1e-10);
  assert.ok(point.every(Number.isFinite));
  assert.ok(Math.abs(c.inverseFocal[0]-1/h.projection[0])<1e-12);
});

test('a fixed world box leaves missed rays and real foreground props untouched',()=>{
  assert.equal(interval([25,1,0],[0,0,-1],field.min,field.max),null);
  assert.deepEqual(interval([0,1,0],[0,0,-1],field.min,field.max),[8,38]);
  const outside=camera({eye:[0,1.7,0]});
  assert.equal(transmission({camera:outside,linearDepth:6}),1,'prop before the field cannot be darkened');
  assert.equal(transmission({camera:camera({eye:[25,1.7,0]})}),1);
  assert.equal(transmission({camera:camera({eye:[0,1.7,0],yaw:Math.PI})}),1);
});

test('inactive/invalid medium is exactly transparent, including reused composite draws',()=>{
  for(const medium of [null,{...field,progress:0},{...field,progress:NaN},{...field,max:[-20,40,-8]}]){
    assert.equal(uniforms({medium}),null);
  }
  assert.equal(transmission({camera:null}),1);
});

test('absorption grows continuously and reaches black before the opaque handoff',()=>{
  let previous=1,maxStep=0;
  for(let i=0;i<=1000;i++){
    const current=transmission({camera:camera({medium:{...field,progress:i/1000}})});
    assert.ok(current<=previous+1e-12);
    maxStep=Math.max(maxStep,previous-current);previous=current;
  }
  assert.ok(maxStep<.014,'no one-sample luminance cut in the progress function');
  for(const uv of [[.5,.5],[0,0],[1,0],[0,1],[1,1]]){
    const t=transmission({camera:camera({medium:{...field,progress:.98}}),uv});
    assert.ok(t<.001,`inside-box sky/ground ray ${uv} must already be black: ${t}`);
  }
});

test('turning and foreground depth change the actual spatial path',()=>{
  const c=camera({medium:{...field,progress:.2}});
  const forward=transmission({camera:c}),back=transmission({camera:camera({yaw:Math.PI,medium:{...field,progress:.2}})});
  assert.ok(back>forward,'short back-to-threshold ray passes through less medium');
  assert.ok(transmission({camera:c,linearDepth:1})>forward,'near surface receives less absorption');
  assert.ok(transmission({camera:c,uv:[.95,.5]})!==forward,'peripheral path is reconstructed in world space');
});

test('captured terminal camera and opaque floor cannot leave a bright lower wedge',()=>{
  const c=uniforms({medium:{min:[-14.4,-.4,-172.4],max:[22.4,40.4,-141.6],progress:.9822966441212682},
    eye:[4.25,1.6,-158.25],yaw:0,pitch:.02,aspect:1.6});
  for(const uv of [[.5,.08],[.5,.2],[.2,.08],[.8,.08]]){
    const direction=ray(c,uv),floorDistance=-c.eye[1]/direction[1];
    assert.ok(floorDistance>0);
    const linearDepth=floorDistance*dot(direction,c.forward);
    assert.ok(transmission({camera:c,uv,linearDepth})<1e-4,
      'physical floor remains well inside the box and must be below acquisition black floor');
  }
});

test('already-eased consumption closes the measured short lower ray for multiple actual frame intervals',()=>{
  const field={min:[-14.4,-.4,-172.4],max:[22.4,40.4,-141.6]};
  let belowFloor=0,deepBlack=0,previousOpticalDepth=0,maxOpticalStep=0;
  // The live capture was 30 Hz; do not mistake tiny progress steps for time.
  for(let frame=0;frame<20;frame++){
    const clock=Math.min(1,frame/30/.65),progress=clock*clock*(3-2*clock);
    const c=uniforms({medium:{...field,progress},eye:[4.25,1.62,-156.84184292088239],yaw:0,pitch:.02,aspect:1.6});
    const t=transmission({camera:c,uv:[.5,.08]});
    belowFloor+=t<1e-4;deepBlack+=t<1e-6;
    const opticalDepth=-Math.log(Math.max(1e-100,t));
    maxOpticalStep=Math.max(maxOpticalStep,opticalDepth-previousOpticalDepth);previousOpticalDepth=opticalDepth;
  }
  assert.ok(belowFloor>=4,`only ${belowFloor} short-path frames below sensor floor`);
  assert.ok(deepBlack>=2,`only ${deepBlack} short-path frames near zero before the opaque unit`);
  assert.ok(maxOpticalStep<3,`short-path optical depth jumps by ${maxOpticalStep} in one captured-frame interval`);
});
