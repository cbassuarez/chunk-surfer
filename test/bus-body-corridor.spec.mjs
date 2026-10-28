import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BUS_BODY_CORRIDOR as C,busBodyCorridorCentre as centre,busBodyCorridorContains as contains,busBodyCorridorCanStep as canStep,busBodyCorridorFloorAt as floorAt,busBodyCorridorProps as propsAt,busBodyCorridorLights as lightsAt} from '../src/game/bus-body-corridor.js';
import {parseCharacterAsset} from '../src/render/character-asset.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readBusAccessor} from '../tools/chunk_surfer/build-outskirts-bus-passage.mjs';

const load=name=>{const b=fs.readFileSync(new URL(`../public/assets/source-drive/cut/${name}.glb`,import.meta.url));return parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const landscape=load('cut-landscape'),living=load('cut-living'),entries=new Map([...landscape.entries,...living.entries].map(e=>[e.name,e]));
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const close=(a,b,e=1e-5)=>Math.abs(a-b)<=e;
function bfs(xPhase,zPhase){
  const x0=xPhase+.5*Math.round(-xPhase/.5),z0=zPhase+.5*Math.ceil((.35-zPhase)/.5),start={x:x0,z:z0},key=p=>`${Math.round((p.x-xPhase)*2)},${Math.round((p.z-zPhase)*2)}`;
  const queue=[start],previous=new Map([[key(start),null]]),byKey=new Map([[key(start),start]]);let end;
  for(let i=0;i<queue.length;i++){
    const p=queue[i];if(p.z>=72){end=p;break;}
    for(const[dx,dz]of[[0,.5],[.5,0],[-.5,0],[0,-.5],[.5,.5],[-.5,.5]]){
      const q={x:p.x+dx,z:p.z+dz},k=key(q);if(previous.has(k)||!canStep(p,q))continue;
      if(dx&&dz&&(!canStep(p,{x:q.x,z:p.z})||!canStep(p,{x:p.x,z:q.z})))continue;
      previous.set(k,key(p));byKey.set(k,q);queue.push(q);
    }
  }
  assert.ok(end,`ordinary grid phase ${xPhase},${zPhase} cannot cross the curved corridor`);
  const path=[];for(let k=key(end);k;k=previous.get(k))path.push(byKey.get(k));return path.reverse();
}

test('the finite72m two-bend route supports ordinary phased controls and retreat without cutting through its walls',()=>{
  assert.equal(C.length,72);assert.equal(C.entryAlong,0);assert.equal(C.exitAlong,72);assert.equal(centre(0).x,0);assert.equal(centre(72).x,-1.25);
  assert.ok(centre(20).slope>0&&centre(48).slope<0);assert.ok(!canStep({x:0,z:0},{x:-1.25,z:72}),'long chord bypasses the physical bends');
  for(const xp of[0,.055,.125,.25,.375,.445])for(const zp of[0,.125,.25,.375]){const path=bfs(xp,zp);for(let i=1;i<path.length;i++){assert.ok(canStep(path[i],path[i-1]));assert.ok(close(floorAt(path[i]),C.floor));}}
  assert.ok(contains({x:0,z:-.5},.25));assert.ok(contains({x:-1.25,z:72.5},.25));assert.ok(!contains({x:0,z:-.51}));assert.ok(!canStep(null,{x:0,z:0}));
});

test('real Cut assets, fixed roots and saved physiology provide bounded reusable instances and actual practicals',()=>{
  for(const z of[0,18,36,54,72]){
    const options={origin:{x:4096,y:15.7,z:-700,yaw:Math.PI/2},clock:17.25,progress:z},a=propsAt(options),b=propsAt(options);
    assert.deepEqual(a,b);assert.ok(a.length<110);assert.ok(a.every(p=>p.matrix.length===16&&Array.from(p.matrix).every(Number.isFinite)&&p.skyExposed===false));
    assert.ok(a.some(p=>p.corridorPart==='floor'&&p.mesh==='cut_fascia'));assert.ok(a.some(p=>p.corridorPart==='cage'&&p.mesh==='cut_thoracic_bone'));
    for(const p of a.filter(p=>p.character))assert.ok(Object.values(p.character.morphs).every(v=>v>=0&&v<=1));
    for(const light of lightsAt(options))assert.ok(a.some(p=>p.id===light.id&&p.mesh===light.fixtureMesh),'a light has no actual rendered fixture');
  }
  const a=propsAt({clock:1,progress:36}),b=propsAt({clock:9,progress:36});
  const fixed=p=>!['gland','secretion'].includes(p.corridorPart);
  assert.deepEqual(a.filter(fixed).map(p=>Array.from(p.matrix)),b.filter(fixed).map(p=>Array.from(p.matrix)),'breathing translates the whole tunnel');
  assert.notDeepEqual(a.filter(p=>p.corridorPart==='cage').map(p=>p.character.morphs),b.filter(p=>p.corridorPart==='cage').map(p=>p.character.morphs));
  assert.deepEqual(propsAt({clock:1,progress:36,reducedMotion:true}).map(p=>p.character?.morphs),propsAt({clock:9,progress:36,reducedMotion:true}).map(p=>p.character?.morphs));
});

function clip(poly,axis,value,above){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=above?a[axis]>=value:a[axis]<=value,ib=above?b[axis]>=value:b[axis]<=value;if(ia)out.push(a);if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);out.push(a.map((v,k)=>v+t*(b[k]-v)));}}return out;}
function intersectsWalkBand(triangle){
  let p=clip(triangle,1,C.floor+.10,true);if(p.length<3)return false;p=clip(p,1,C.floor+1.85,false);if(p.length<3)return false;
  const lo=Math.max(-.5,Math.min(...p.map(v=>v[2]))),hi=Math.min(72.5,Math.max(...p.map(v=>v[2])));if(lo>hi)return false;
  for(let z=Math.floor(lo*4)/4;z<=hi;z+=.25){let q=clip(p,2,z,true);if(q.length<3)continue;q=clip(q,2,z+.25,false);if(q.length<3)continue;
    const signed=q.map(v=>v[0]-centre(v[2]).x),min=Math.min(...signed),max=Math.max(...signed);
    // The analytic centreline's second derivative is below .05/m. This
    // 1mm expansion conservatively covers curvature inside each .25m slab.
    if(min<=C.halfWidth+.001&&max>=-C.halfWidth-.001)return true;
  }
  return false;
}

test('actual rib and membrane triangle interiors never enter the whole player band at any authored breathing/wince corner',t=>{
  const modules=new Map();for(let z=0;z<=72;z+=6)for(const p of propsAt({progress:z}))if(p.corridorPart==='cage')modules.set(p.id,p);
  let checked=0;
  for(const p of modules.values()){
    const e=entries.get(p.mesh);assert.ok(e,`actual living mesh missing: ${p.mesh}`);
    for(let bits=0;bits<8;bits++)for(const primitive of e.primitives){
      const positions=new Float64Array(primitive.positions.length),weights=[bits&1,(bits>>1)&1,1,(bits>>2)&1];
      for(let v=0;v<primitive.vertexCount;v++){const q=[...primitive.positions.subarray(v*3,v*3+3)];for(let k=0;k<4;k++)for(let a=0;a<3;a++)q[a]+=primitive.targets[k].positions[v*3+a]*weights[k];positions.set(point(p.matrix,q),v*3);}
      for(let i=0;i<primitive.indices.length;i+=3){const tri=[0,1,2].map(k=>Array.from(positions.subarray(primitive.indices[i+k]*3,primitive.indices[i+k]*3+3)));assert.ok(!intersectsWalkBand(tri),`${p.id} breath/wince corner${bits} crushes the physical player band`);checked++;}
    }
  }
  t.diagnostic(JSON.stringify({instances:modules.size,checkedTriangleInteriors:checked,playerBand:[-.55,.55],bodyHeight:[.106,1.856],breath:1,tensionShearRecoilCorners:8}));
});

test('staggered actual wet fascia triangles cover the supported floor through both bends and retain original PBR textures',t=>{
  const e=entries.get('cut_fascia'),p=e.primitives[0],v=p.positions,ix=p.indices;
  assert.ok(living.json.materials[p.material].normalTexture&&living.json.materials[p.material].pbrMetallicRoughness.metallicRoughnessTexture);
  assert.equal(living.json.materials[p.material].extras.cutTissue,true);
  function topAt(x,z,instances){let top=-Infinity;for(const instance of instances){const m=instance.matrix,dx=x-m[12],dz=z-m[14],y=(dx*m[4]+dz*m[6])/(m[4]*m[4]+m[6]*m[6]),along=(dx*m[8]+dz*m[10])/(m[8]*m[8]+m[10]*m[10]);if(Math.abs(along)>12.1)continue;
    for(let i=0;i<ix.length;i+=3){const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3,den=(v[b+2]-v[c+2])*(v[a+1]-v[c+1])+(v[c+1]-v[b+1])*(v[a+2]-v[c+2]);if(Math.abs(den)<1e-10)continue;
      const u=((v[b+2]-v[c+2])*(y-v[c+1])+(v[c+1]-v[b+1])*(along-v[c+2]))/den,w=((v[c+2]-v[a+2])*(y-v[c+1])+(v[a+1]-v[c+1])*(along-v[c+2]))/den;
      if(u>=-1e-6&&w>=-1e-6&&u+w<=1+1e-6)top=Math.max(top,m[13]+m[1]*(u*v[a]+w*v[b]+(1-u-w)*v[c]));
    }}return top;}
  let samples=0,error=0;
  for(let z=0;z<=72;z+=1.2){const floors=propsAt({progress:z}).filter(p=>p.corridorPart==='floor');for(const across of[-.50,0,.50]){const x=centre(z).x+across,top=topAt(x,z,floors);assert.ok(Number.isFinite(top),`real fascia leaves an uncovered floor hole at ${x},${z}`);error=Math.max(error,Math.abs(top-floorAt({x,z})));samples++;}}
  assert.ok(error<C.surfaceTolerance,`supported foot hovers ${error}m above the real wet sheets`);
  t.diagnostic(JSON.stringify({floorSamples:samples,maximumSoftLayerDeviationMetres:error,texturePixelsReused:true}));
});

test('actual glands, extended secretion and inspection fixtures also remain outside the swept player band',t=>{
  const pack=parseGlb(fs.readFileSync(new URL('../public/assets/source-drive/cut/cut-roadside.glb',import.meta.url))),lamp=pack.json.meshes.find(m=>m.name==='cut_inspection_lamp');
  const staticGeometry=lamp.primitives.map(p=>({positions:readBusAccessor(pack,p.attributes.POSITION),indices:readBusAccessor(pack,p.indices)}));let checked=0;
  for(const clock of[0,3.1,4.2,7.2,10.7,13.6,19,27.2]){
    const instances=new Map();for(let progress=0;progress<=72;progress+=12)for(const p of propsAt({clock,progress}))if(['gland','secretion','practical'].includes(p.corridorPart))instances.set(p.id,p);
    for(const p of instances.values()){
      const primitives=p.corridorPart==='practical'?staticGeometry:entries.get(p.mesh).primitives;
      for(const primitive of primitives){const positions=primitive.positions,world=new Float64Array(positions.length),weights=p.character?.morphs||{};
        for(let v=0;v<positions.length/3;v++){const q=Array.from(positions.slice(v*3,v*3+3));for(const[k,name]of['tension','shear','breath','recoil'].entries())if(primitive.targets)for(let axis=0;axis<3;axis++)q[axis]+=primitive.targets[k].positions[v*3+axis]*(weights[name]||0);world.set(point(p.matrix,q),v*3);}
        for(let i=0;i<primitive.indices.length;i+=3){const tri=[0,1,2].map(k=>Array.from(world.subarray(primitive.indices[i+k]*3,primitive.indices[i+k]*3+3)));assert.ok(!intersectsWalkBand(tri),`${p.id} at clock${clock} blocks the physical passage`);checked++;}
      }
    }
  }
  t.diagnostic(JSON.stringify({checkedTriangleInteriors:checked,clockSamples:8,realFixture:'cut_inspection_lamp'}));
});
