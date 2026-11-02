import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NATATORIUM_METRIC_IDENTITY as I,normalizeNatatoriumMetric,natatoriumMetricZ as F,natatoriumMetricInverseZ as inv,natatoriumMetricPoint,natatoriumMetricRayPoint,natatoriumMetricBoundaryTime} from '../src/render/natatorium-metric.js';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {setNatatoriumMetricFrame,setAuthoredPropRange,propTargets} from '../src/render/props3d.js';
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const fields=[-2.1,-.7,-.000002,0,.000002,.5,1.5,2.8].map(k=>({pivotZ:32.8,near:3.5,span:14,k}));
test('the full longitudinal mapping is monotone, invertible and identity around the body',()=>{
  for(const field of fields){
    let prior=-Infinity;
    for(let z=-20;z<110;z+=.031){const image=F(z,field);assert.ok(image>prior);near(inv(image,field),z,1e-8);prior=image;}
    for(let z=-20;z<=36.3;z+=.02)assert.equal(F(z,field),z);
    for(let angle=0;angle<6.28;angle+=.05){const p=[84+3.2*Math.cos(angle),1.62,32.8+3.2*Math.sin(angle)];assert.deepEqual(natatoriumMetricPoint(p,field),p,'all ordinary interaction directions remain coherent');}
  }
  for(const bad of [null,{}, {pivotZ:NaN,k:2},{pivotZ:2,k:NaN}])assert.deepEqual(normalizeNatatoriumMetric(bad),I);
});
test('near and tangent seams preserve slope and lengthening genuinely changes scene geometry',()=>{
  for(const field of fields){
    for(const z of [36.3,50.3]){const e=.00001,left=(F(z,field)-F(z-e,field))/e,right=(F(z+e,field)-F(z,field))/e;near(left,right,.0001);}
  }
  assert.ok(F(50,fields.at(-1))-32.8>70,'the far pool moves to a genuinely longer projected world, without changing its canonical coordinate');
  assert.ok(F(50,fields[0])-32.8<10,'compression follows the same physical long axis');
});
test('actual natatorium interaction fixtures fit inside the untouched neighborhood',()=>{
  const fixtures=CONSERVATORY_PROPS.filter(p=>p.x>=70&&p.x<=96&&p.y>=32&&p.y<=50&&p.interactive!==false);
  assert.ok(fixtures.length>=18);
  for(const fixture of fixtures){const mesh=PROP_MESH[fixture.mesh];assert.ok(mesh,fixture.id);assert.ok(2+Math.max(mesh.w||0,mesh.d||0)/2<3.5,fixture.id);}
});
test('temporary depth range restores the existing owner without acquiring camera or range ownership',()=>{
  assert.equal(propTargets().far,90);const release=setAuthoredPropRange('coffee-test-ordinary-owner',180);
  try{setNatatoriumMetricFrame(fields.at(-1));assert.equal(propTargets().far,320);setNatatoriumMetricFrame(null);assert.equal(propTargets().far,180);}
  finally{setNatatoriumMetricFrame(null);release();}
  assert.equal(propTargets().far,90);
});
test('exact mapped grid traversal matches independent slab intersections, including reverse and oblique rays',()=>{
  // A closed, one-cell-thick room with a freestanding divider. Direct ray/box
  // intersection is independent of the DDA boundary recurrence under test.
  const solid=(x,z)=>x===70||x===96||z===27||z===50||(x===87&&z>=38&&z<=43);
  const boxHit=(o,d,lo,hi)=>{let a=0,b=Infinity;for(let i=0;i<2;i++){if(Math.abs(d[i])<1e-9){if(o[i]<lo[i]||o[i]>hi[i])return Infinity;continue;}const t0=(lo[i]-o[i])/d[i],t1=(hi[i]-o[i])/d[i];a=Math.max(a,Math.min(t0,t1));b=Math.min(b,Math.max(t0,t1));if(a>b)return Infinity;}return a;};
  for(const field of fields)for(const origin of [[84.2,32.8],[83.6,44.2],[92.2,47.2]])for(let angle=.017;angle<6.28;angle+=.117){
    const d=[Math.cos(angle),Math.sin(angle)],imageOrigin=[origin[0],F(origin[1],field)];
    let expected=Infinity;
    for(let x=70;x<=96;x++)for(let z=27;z<=50;z++)if(solid(x,z))expected=Math.min(expected,boxHit(imageOrigin,d,[x,F(z,field)],[x+1,F(z+1,field)]));
    let x=Math.floor(origin[0]),z=Math.floor(origin[1]),time=0;
    const sx=d[0]<0?-1:1,sz=d[1]<0?-1:1;
    for(let step=0;step<120&&!solid(x,z);step++){
      const tx=(x+Math.max(sx,0)-origin[0])/d[0],tz=natatoriumMetricBoundaryTime(z+Math.max(sz,0),origin[1],d[1],field);
      if(tx<tz){time=tx;x+=sx;}else{time=tz;z+=sz;}
    }
    assert.ok(solid(x,z));near(time,expected,1e-7);
    const hit=natatoriumMetricRayPoint([origin[0],1.62,origin[1]],[d[0],0,d[1]],time,field);
    near(natatoriumMetricPoint(hit,field)[2],imageOrigin[1]+d[1]*time,1e-7);
  }
});
test('production architecture, secondary water rays, props, text, depth and acquisition share the metric',()=>{
  const read=name=>readFileSync(new URL(`../src/render/${name}`,import.meta.url),'utf8'),r=read('r3d.js'),p=read('props3d.js'),a=read('pixel-mesh/shader.js');
  assert.equal((r.match(/metricNextZ\(cell,stp,ro,rd\)/g)||[]).length,5,'both initializations plus water, open-skip and primary recurrences recompute the next boundary');
  assert.match(r,/vec3 pos = metricCellRayPoint\(ro,rd,tHit\)/);assert.match(r,/vec3 p=metricCellRayPoint\(ro,rd,h\.t\)/);
  assert.match(r,/uNatatoriumMetric'\),natatoriumMetricUniform\(natatoriumMetric\)/);
  assert.match(p,/gl_Position=uProj\*uView\*vec4\(natatoriumMetricPoint\(w\.xyz\),w\.w\)/);
  assert.match(p,/gl_Position=uProj\*uView\*vec4\(natatoriumMetricPoint\(world\.xyz\),world\.w\)/);
  assert.match(p,/fa=effectivePropFar\(\)/);assert.match(p,/far:effectivePropFar\(\)/);
  assert.match(a,/natatoriumMetricRayPoint\(uCam\*uCellMeters,rd,gridDistance\*uCellMeters\)/);
  assert.match(r,/!pixelMeshSettings\.reduceMotion&&!state\.authoredCamera/);
  assert.match(p,/const groups=natatoriumMetric\.k\s*\?visibleGroups\(eye,maxDistance,\{lodEye:eye,reflection,frustum:null/,'authored bounds cannot silently cull deformed props');
});
