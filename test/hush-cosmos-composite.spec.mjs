import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {props3dDebugShaders} from '../src/render/props3d.js';
import {PRESSURE_FINISH_FRAG,PRESSURE_INK_GLSL} from '../src/render/pressure-composite.js';
import {PIXEL_MESH_FRAG} from '../src/render/pixel-mesh/shader.js';
import {pressureInstances} from '../src/render/pressure-volume.js';
import {finishSourceDesktopPressure} from '../src/render/source-desktop-view.js';
import {hushCosmosWorldField,hushCosmosSignalMaterial,hushCosmosRecordedInk} from '../src/render/hush-cosmos.js';

const p3=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8'),
  r3d=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8'),{pressureFragment:frag}=props3dDebugShaders();
const mod=(a,b)=>a-b*Math.floor(a/b),floor=Math.floor,
  encode=Function('material','uPressure','floor',`return ${frag.match(/float flags=([^;]+);/)[1]};`),
  cosmos=Function('bits','mod','floor',`return ${PRESSURE_FINISH_FRAG.match(/float cosmos=([^;]+);/)[1]};`),
  core=Function('bits','mod','floor',`return ${PRESSURE_FINISH_FRAG.match(/float bits=[^;]+?,core=([^;]+);/)[1]};`);

test('the actual byte writer roundtrips every five-bit payload and cosmic/core/glow combination',()=>{
  const seen=new Set();
  for(let signal=0;signal<32;signal++)for(const cosmic of[0,1])for(const c of[0,1])for(const g of[0,1]){
    const packed=encode(signal/31,{w:cosmic,y:c,z:g},floor),normalized=packed/255,bits=floor(normalized*255+.5);
    assert.equal(bits,packed);assert.equal(mod(bits,32),signal);
    assert.equal(cosmos(bits,mod,floor),cosmic);assert.equal(core(bits,mod,floor),c);
    assert.equal(floor(bits/128),g);seen.add(bits);
  }
  assert.equal(seen.size,256,'no payload or flag may overlap another');
  assert.match(frag,/hushCosmosWorldField\(normalize\(vWorld-uEye\)\).a/);
  assert.doesNotMatch(frag,/hushCosmosField\(gl_FragCoord|hushCosmosWorldField\(vUv/);
});

test('old human frames remain noncosmic regardless of captured seed while actual Hush is selected by mesh kind',()=>{
  const bind=p3.slice(p3.indexOf('export function renderPressurePass('),p3.indexOf('export function pressureTargets('));
  assert.match(bind,/cosmos=instance.mesh==='hush_density_core'\|\|instance.mesh==='hush_density_volume'/);
  assert.match(bind,/uniform4f\(HU\('uPressure'\),p.strength,core,glow,cosmos\?1:0\)/);
  for(const seed of[0,31,255,1048576])for(const role of['tenant','live-pressure','source-front','source-rear']){
    const [draw]=pressureInstances({id:'old-frame',x:3,y:5,floorH:0,strength:1,
      performance:{version:1,role,seed,heading:0,clip:'pressure_hold',time:0,manifestation:1,motion:'idle'}});
    const flag=draw.mesh==='hush_density_core'||draw.mesh==='hush_density_volume';
    assert.equal(flag,role!=='tenant');
    const bits=encode(.5,{w:flag?1:0,y:1,z:0},floor);
    assert.equal(cosmos(bits,mod,floor),flag?1:0);
  }
});

test('the composed production route replaces only covered cosmic triangles before acquisition',()=>{
  assert.match(PRESSURE_FINISH_FRAG,/cosmosMask=coreMask\*cosmos/);
  assert.match(PRESSURE_FINISH_FRAG,/cosmicSignal=mod\(bits,32.0\)\/31.0/);
  assert.match(PRESSURE_FINISH_FRAG,/hushCosmosSignalMaterial\(cosmicSignal\)/);
  assert.doesNotMatch(PRESSURE_FINISH_FRAG,/hushCosmosField\(gl_FragCoord/);
  assert.match(PRESSURE_FINISH_FRAG,/c\*=1\.0-coreMask;[\s\S]*c\+=cosmic.rgb\*cosmosMask\/exposure/);
  assert.match(PRESSURE_FINISH_FRAG,/oIdentity=vec4\(coreMask,step\(\.000001,glowLight\),cosmicSignal,cosmosMask\)/);
  const consume='pressureRecordedCosmosInk(finalColor,texture(uRecordedPressureInk,fullUv))';
  assert.ok(PIXEL_MESH_FRAG.includes(consume));
  assert.ok(PIXEL_MESH_FRAG.indexOf(consume)>PIXEL_MESH_FRAG.indexOf('vec3 oneBitScene = mix(captureDark, captureLight, captureBit)'));
  assert.ok(r3d.includes('pressurePreserveRecordedCosmos(c,texture(uSrc,uv).rgb,texture(uPressureInk,uv))'));
  assert.match(PRESSURE_INK_GLSL,/pressureRecordedCosmosInk\(mix\(presented,acquired,cosmic\),identity\)/,
    'world negative/grade must not invert the acquired cosmic marks');
  assert.match(PRESSURE_INK_GLSL,/if\(identity.a>\.5&&identity.r>\.5\)return hushCosmosRecordedInk\(recorded,identity.b\)/);
  assert.match(PRESSURE_INK_GLSL,/return pressureRecordedInk\(recorded,identity.rg\)/,'human endpoints keep their old material');
  assert.match(PRESSURE_FINISH_FRAG,/g\.a\*step\(meshDepth\(g\),front\+\.022\)/,'world and prop occlusion remain authoritative');
});

test('transported world signals retain acquisition marks without sampling another field at POST',()=>{
  for(const direction of[[0,0,-1],[.055,.025,-1],[1,.4,.6],[-.75,.34,-.56]]){
    const sample=hushCosmosWorldField(direction),packed=encode(sample.signal,{w:1,y:1,z:0},floor),signal=mod(packed,32)/31,
      material=hushCosmosSignalMaterial(signal);
    assert.ok(material.color.every(Number.isFinite));
    for(const chosen of[0,1]){
      const acquired=chosen?[.95,.94,.86]:[.0015,.005,.0045],ink=hushCosmosRecordedInk(acquired,signal);
      assert.deepEqual(hushCosmosRecordedInk(ink,signal),ink);
      assert.deepEqual(hushCosmosRecordedInk(acquired,signal,[900,10],[1920,1080]),ink,'viewport changes cannot slide the recorded pigment');
      assert.equal(Math.max(...ink)>.08,chosen===1);
    }
  }
});

test('the real secondary Hush material uses the same world field while the retained human remains black',()=>{
  for(const name of['hush_density_core','pressure_body']){
    const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial());
    mesh.name=name;root.add(mesh);const finish=finishSourceDesktopPressure(THREE,root);
    assert.ok(finish.cores.includes(mesh.material));
    if(name==='hush_density_core')assert.equal(mesh.material.userData.hushCosmos.space,'world-direction');
    else {assert.equal(mesh.material.userData.hushCosmos,undefined);assert.deepEqual(mesh.material.color.toArray(),[0,0,0]);}
    for(const child of root.children){child.geometry?.dispose();child.material?.dispose();}
  }
});
