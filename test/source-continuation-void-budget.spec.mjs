import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceContinuationVoidVisibility,sourceContinuationVoidCopies} from '../src/render/source-continuation-void.js';

const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
test('the prepared camera cone agrees with an independent eight-corner half-space check',()=>{
 for(const yaw of[0,.7,Math.PI])for(const aspect of[.5,16/9,2.4])for(const eye of[[0,0,0],[3,2,-8]]){
  const basis={forward:[Math.sin(yaw),0,-Math.cos(yaw)],right:[Math.cos(yaw),0,Math.sin(yaw)],up:[0,1,0]},visible=sourceContinuationVoidVisibility({eye,basis,aspect});
  const planes=[];
  for(const[axis,width]of[[basis.right,.95*aspect],[basis.up,.95]])for(const side of[-1,1]){
   const n=basis.forward.map((v,k)=>v*width+axis[k]*side);planes.push([...n,-dot(n,eye)]);
  }
  planes.push([...basis.forward,-dot(basis.forward,eye)-.005]);
  for(const x of[-9,-1,0,1,9])for(const y of[-3,0,3])for(const z of[-12,-.005,0,12]){
   const b={min:[x-.4,y-.7,z-.4],max:[x+.4,y+.7,z+.4]},corners=[];
   for(const a of[0,1])for(const c of[0,1])for(const d of[0,1])corners.push([a?b.max[0]:b.min[0],c?b.max[1]:b.min[1],d?b.max[2]:b.min[2]]);
   const expected=planes.every(plane=>corners.some(p=>dot(plane.slice(0,3),p)+plane[3]>=-.0001));
   assert.equal(visible({physicalBounds:b}),expected,JSON.stringify({yaw,aspect,eye,x,y,z}));
  }
 }
});

test('unknown and moving geometry stays conservative, and a new frame has a new camera',()=>{
 const p={physicalBounds:{min:[-.2,-.2,5],max:[.2,.2,6]}},basis={forward:[0,0,-1],right:[1,0,0],up:[0,1,0]},first=sourceContinuationVoidVisibility({eye:[0,0,0],basis});
 assert.equal(first(p),false);assert.equal(first({}),true);
 for(const flag of['restAffliction','restDrift','restDetached','restFracture','restPainRattle','restRebuilt'])assert.equal(first({...p,[flag]:true}),true);
 assert.equal(sourceContinuationVoidVisibility({eye:[0,0,10],basis})(p),true,'no camera result is cached across frames');
});

test('one view shares read-only aperture planes while preserving order, matrices and finite budgets',()=>{
 const m=identity();m[12]=4;m[13]=-8;m[14]=2;
 const view={id:'same-aperture',kind:'lower',domainId:'test',toCurrent:m,planes:[[1,0,0,1000],[0,1,0,1000],[0,0,1,1000],[-1,0,0,1000],[0,-1,0,1000]],eye:[0,0,0]},
  views={domain:{chartId:0,surfaceId:'owner'},lower:[view],upper:[]},
  prop=(id,x)=>{const matrix=identity();matrix[12]=x;return{id,mesh:'box',x,y:0,z:0,matrix,chartId:0,physicalBounds:{min:[x-.5,-.5,-.5],max:[x+.5,.5,.5]}};},
  canonical=[prop('first-tie',0),prop('second-tie',0),{...prop('support',20),descriptorId:'owner'}],saved=JSON.stringify(canonical),
  a=sourceContinuationVoidCopies({views,canonicalProps:canonical,origin:{x:3,y:2,z:5},remaining:3});
 assert.deepEqual(a.props.map(p=>p.canonicalId),['support','first-tie','second-tie']);
 assert.equal(a.props[0].portalClipPlanes,a.props[1].portalClipPlanes,'aperture preparation is per view, rather than per copied prop');
 assert.notEqual(a.props[0].matrix,a.props[1].matrix,'individual mutable transforms remain separate');
 assert.deepEqual(a.props[0].portalClipPlanes[0],[1,0,0,997]);
 assert.deepEqual(a.props.map(p=>[p.x,p.y,p.z]),[[24,-8,2],[4,-8,2],[4,-8,2]]);
 assert.equal(JSON.stringify(canonical),saved,'preparing images cannot alter canonical instances');
 const b=sourceContinuationVoidCopies({views,canonicalProps:canonical,origin:{x:7,y:2,z:5},remaining:2});
 assert.equal(b.props.length,2);assert.equal(b.diagnostics.omittedVisible,1);
 assert.deepEqual(b.props[0].portalClipPlanes[0],[1,0,0,993],'origin preparation is not retained across frames');
});
