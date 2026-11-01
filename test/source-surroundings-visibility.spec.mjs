import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_SOURCE_SURROUNDINGS_GATE as G,normalizeSourceSurroundingsGate,sourceSurroundingsVisible as visible,SOURCE_SURROUNDINGS_VISIBILITY_GLSL as glsl,sourceSurroundingsPrimitiveSide} from '../src/render/source-surroundings-visibility.js';
import {setSourceSurroundingsGate} from '../src/render/props3d.js';

const eye={x:G.x+18,y:G.y+1.63,z:G.z},centre={x:G.x-124,y:G.y+1.63,z:G.z},fall={x:G.x+178,y:G.y+1.63,z:G.z};
const translate=(p,offset)=>({x:p.x+offset.x,y:p.y+offset.y,z:p.z+offset.z});

test('only the opposite distant world is restricted to the existing door aperture',()=>{
  assert.equal(visible(1,eye,{x:160,y:180,z:150}),true,'own-world sky is unrestricted');
  assert.equal(visible(2,eye,centre),true,'the centre world is visible through the real open doorway');
  assert.equal(visible(2,eye,{...centre,y:100}),false,'no centre sky above the doorway');
  assert.equal(visible(2,eye,{...centre,z:100}),false,'no centre sky around the jamb');
  const west={x:G.x-20,y:eye.y,z:G.z};
  assert.equal(visible(2,west,{x:G.x-124,y:100,z:G.z+192}),true);assert.equal(visible(1,west,fall),true);
  assert.equal(visible(1,west,{...fall,y:100}),false);assert.equal(visible(1,west,{...fall,z:100}),false);
});

test('the original case bank and all side0 construction remain visible across the cut plane',()=>{
  const caseBank={x:-22,y:-2,z:-3};assert.equal(visible(0,{x:0,y:1.62,z:-3},caseBank),true);
  assert.equal(visible(undefined,eye,centre),true);assert.equal(visible(9,null,null),true);
  assert.equal(visible(0,eye,{x:-57,y:3.5,z:-12}),true,'existing inverted chapel is not a new field fragment');
});

test('aperture visibility is continuous on approach, inside the threshold and after crossing',()=>{
  for(const x of[1,.01,0,-.01,-1].map(dx=>G.x+dx))for(const side of[1,2]){
    const point=side===1?fall:centre;assert.equal(visible(side,{x,y:eye.y,z:G.z},point),true);
  }
  assert.equal(visible(2,eye,{x:G.x+13,y:eye.y,z:G.z}),false,'a plane intersection beyond the fragment is invalid');
  assert.equal(visible(2,eye,{x:eye.x,y:eye.y,z:G.z}),false,'parallel rays cannot see the opposite field');
});

test('the exact authored aperture includes its edges and rejects adjacent rays',()=>{
  const pointForCrossing=(y,z)=>({x:G.x-18,y:y*2-eye.y,z:z*2-eye.z});
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
  assert.equal(visible(2,[eye.x+offset.x,eye.y+offset.y,eye.z+offset.z],[centre.x+offset.x,centre.y+offset.y,centre.z+offset.z],gate),true,'array camera points work as well');
});

test('a ninety-degree transfer rotates both the aperture plane and its tangent width',()=>{
  const rotate=p=>({x:G.x-(p.z-G.z),y:p.y,z:G.z+(p.x-G.x)}),gate={...G,...rotate(G),normalX:0,normalZ:1};
  for(const side of[1,2])for(const e of[eye,{x:G.x-20,y:eye.y,z:G.z}])for(const point of[centre,fall,{...centre,y:100},{...fall,z:100}]){
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
  assert.match(source,/if\(!sourceSurroundingsVisible\(uSourceSurroundingsSide,sourceSurroundingsWorldPoint\(uEye\),sourceSurroundingsWorldPoint\(vWorld\),uSourceSurroundingsGate,uSourceSurroundingsGateFrame\)\)discard/);
  assert.match(source,/for\(const p of m\.primitives\)\{gl\.uniform1i\(U\('uSourceSurroundingsSide'\),sourceSurroundingsPrimitiveSide\(p,list\[0\]\)\)/);
  assert.match(source,/gl\.uniform4f\(U\('uSourceSurroundingsGate'\),sourceSurroundingsGate\.x,sourceSurroundingsGate\.y,sourceSurroundingsGate\.z,sourceSurroundingsGate\.width\)/);
  assert.match(source,/gl\.uniform3f\(U\('uSourceSurroundingsGateFrame'\),sourceSurroundingsGate\.height,sourceSurroundingsGate\.normalX,sourceSurroundingsGate\.normalZ\)/);
  const reset="gl.uniform1i(U('uSourceSurroundingsSide'),0)";assert.equal(source.split(reset).length-1,2,'main/reflection entry and exit reset stale side state');
  const shadow=source.slice(source.indexOf('const SHADOW_FRAG='),source.indexOf('const SHADOW_FRAG=')+750);
  assert.ok(!shadow.includes('uSourceSurroundingsSide'),'shadow program cannot inherit a main fragment uniform');
  for(const term of['if(side!=1&&side!=2)return true','dot(eye.xz-gate.xz,normal)','dot(ray.xz,normal)','vec2(-normal.y,normal.x)','t<0.0||t>1.0'])assert.ok(glsl.includes(term),term);
});
test('a canonical Fall backdrop can fill a chart while ordinary world materials retain their actual gateway',()=>{
  assert.equal(sourceSurroundingsPrimitiveSide({sourceSurroundingsSide:1}),1);
  assert.equal(sourceSurroundingsPrimitiveSide({sourceSurroundingsSide:2}),2);
  assert.equal(sourceSurroundingsPrimitiveSide({sourceSurroundingsSide:1},{sourceSurroundingsSide:0}),0);
  assert.equal(sourceSurroundingsPrimitiveSide({sourceSurroundingsSide:2},{sourceSurroundingsSide:NaN}),2);
});
