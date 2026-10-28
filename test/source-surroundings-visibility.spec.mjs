import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_SOURCE_SURROUNDINGS_GATE as G,normalizeSourceSurroundingsGate,sourceSurroundingsVisible as visible,SOURCE_SURROUNDINGS_VISIBILITY_GLSL as glsl} from '../src/render/source-surroundings-visibility.js';
import {setSourceSurroundingsGate} from '../src/render/props3d.js';

const eye={x:0,y:10.02,z:-12},centre={x:-142,y:10.02,z:-12},fall={x:160,y:10.02,z:-12};
const translate=(p,offset)=>({x:p.x+offset.x,y:p.y+offset.y,z:p.z+offset.z});

test('only the opposite distant world is restricted to the existing door aperture',()=>{
  assert.equal(visible(1,eye,{x:160,y:180,z:150}),true,'own-world sky is unrestricted');
  assert.equal(visible(2,eye,centre),true,'the centre world is visible through the real open doorway');
  assert.equal(visible(2,eye,{...centre,y:100}),false,'no centre sky above the doorway');
  assert.equal(visible(2,eye,{...centre,z:100}),false,'no centre sky around the jamb');
  const west={x:-38,y:10.02,z:-12};
  assert.equal(visible(2,west,{x:-142,y:100,z:180}),true);assert.equal(visible(1,west,fall),true);
  assert.equal(visible(1,west,{...fall,y:100}),false);assert.equal(visible(1,west,{...fall,z:100}),false);
});

test('the original case bank and all side0 construction remain visible across the cut plane',()=>{
  const caseBank={x:-22,y:-2,z:-3};assert.equal(visible(0,{x:0,y:1.62,z:-3},caseBank),true);
  assert.equal(visible(undefined,eye,centre),true);assert.equal(visible(9,null,null),true);
  assert.equal(visible(0,eye,{x:-57,y:3.5,z:-12}),true,'existing inverted chapel is not a new field fragment');
});

test('aperture visibility is continuous on approach, inside the threshold and after crossing',()=>{
  for(const x of[-17,-17.99,-18,-18.01,-19])for(const side of[1,2]){
    const point=side===1?fall:centre;assert.equal(visible(side,{x,y:10.02,z:-12},point),true);
  }
  assert.equal(visible(2,eye,{x:-5,y:10.02,z:-12}),false,'a plane intersection beyond the fragment is invalid');
  assert.equal(visible(2,eye,{x:0,y:10.02,z:-12}),false,'parallel rays cannot see the opposite field');
});

test('the exact authored aperture includes its edges and rejects adjacent rays',()=>{
  const pointForCrossing=(y,z)=>({x:-36,y:y*2-eye.y,z:z*2-eye.z});
  assert.equal(visible(2,eye,pointForCrossing(G.y,G.z-G.width/2)),true);
  assert.equal(visible(2,eye,pointForCrossing(G.y+G.height,G.z+G.width/2)),true);
  assert.equal(visible(2,eye,pointForCrossing(G.y-.001,G.z)),false);
  assert.equal(visible(2,eye,pointForCrossing(G.y+G.height+.001,G.z)),false);
  assert.equal(visible(2,eye,pointForCrossing(10,G.z+G.width/2+.001)),false);
});

test('translated borrowed worlds use the same metre-space ray aperture',()=>{
  const offset={x:100,y:20,z:-50},gate={...G,x:G.x+offset.x,y:G.y+offset.y,z:G.z+offset.z};
  for(const point of[centre,{...centre,y:100},{...centre,z:100}]){
    assert.equal(visible(2,translate(eye,offset),translate(point,offset),gate),visible(2,eye,point));
  }
  assert.equal(visible(2,[100,30.02,-62],[-42,30.02,-62],gate),true,'array camera points work as well');
});

test('a ninety-degree transfer rotates both the aperture plane and its tangent width',()=>{
  const rotate=p=>({x:-38-(p.z+12),y:p.y,z:-12+(p.x+38)}),gate={...G,...rotate(G),normalX:0,normalZ:1};
  for(const side of[1,2])for(const e of[eye,{x:-38,y:10.02,z:-12}])for(const point of[centre,fall,{...centre,y:100},{...fall,z:100}]){
    assert.equal(visible(side,rotate(e),rotate(point),gate),visible(side,e,point),'rotated side '+side);
  }
  const scaleNormal={...gate,normalZ:7};assert.deepEqual(normalizeSourceSurroundingsGate(scaleNormal),normalizeSourceSurroundingsGate(gate));
});

test('owner gate reset is explicit and returned values cannot mutate renderer state',()=>{
  const custom=setSourceSurroundingsGate({x:80,y:25,z:-90,width:3,height:4,normalX:0,normalZ:2});
  assert.deepEqual(custom,{x:80,y:25,z:-90,width:3,height:4,normalX:0,normalZ:1});custom.x=999;
  assert.deepEqual(setSourceSurroundingsGate(null),G);assert.deepEqual(normalizeSourceSurroundingsGate({normalX:0,normalZ:0}),G);
  assert.equal(visible(2,eye,{x:NaN,y:10,z:-12}),false);assert.equal(visible(0,eye,{x:NaN}),true);
});

test('the native fragment shader and every primitive bind the scoped visibility contract',()=>{
  const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  assert.match(source,/\$\{SOURCE_SURROUNDINGS_VISIBILITY_GLSL\}/);
  assert.match(source,/if\(!sourceSurroundingsVisible\(uSourceSurroundingsSide,uEye,vWorld,uSourceSurroundingsGate,uSourceSurroundingsGateFrame\)\)discard/);
  assert.match(source,/for\(const p of m\.primitives\)\{gl\.uniform1i\(U\('uSourceSurroundingsSide'\),p\.sourceSurroundingsSide===1\?1:p\.sourceSurroundingsSide===2\?2:0\)/);
  assert.match(source,/gl\.uniform4f\(U\('uSourceSurroundingsGate'\),sourceSurroundingsGate\.x,sourceSurroundingsGate\.y,sourceSurroundingsGate\.z,sourceSurroundingsGate\.width\)/);
  assert.match(source,/gl\.uniform3f\(U\('uSourceSurroundingsGateFrame'\),sourceSurroundingsGate\.height,sourceSurroundingsGate\.normalX,sourceSurroundingsGate\.normalZ\)/);
  const reset="gl.uniform1i(U('uSourceSurroundingsSide'),0)";assert.equal(source.split(reset).length-1,2,'main/reflection entry and exit reset stale side state');
  const shadow=source.slice(source.indexOf('const SHADOW_FRAG='),source.indexOf('const SHADOW_FRAG=')+750);
  assert.ok(!shadow.includes('uSourceSurroundingsSide'),'shadow program cannot inherit a main fragment uniform');
  for(const term of['if(side!=1&&side!=2)return true','dot(eye.xz-gate.xz,normal)','dot(ray.xz,normal)','vec2(-normal.y,normal.x)','t<0.0||t>1.0'])assert.ok(glsl.includes(term),term);
});
