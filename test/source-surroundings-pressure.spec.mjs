import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_SURROUNDINGS_PRESSURE_LIMITS as LIMITS,encodeSourceSurroundingsPressure as encode,sampleSourceSurroundingsPressure as sample,SOURCE_SURROUNDINGS_PRESSURE_GLSL as glsl} from '../src/render/source-surroundings-pressure.js';

test('shared vertex and fragment wave counts use explicit matching integer precision',()=>{
  assert.match(glsl,/uniform highp int uSourceSurroundingsPressureCount;/);
});
import {sourceSurroundingsGeometryLibrary,sourceSurroundingsProps,installSourceSurroundingsEmitterAliases} from '../src/render/source-surroundings-geometry.js';
import {DEFAULT_SOURCE_SURROUNDINGS_GATE as G} from '../src/render/source-surroundings-visibility.js';
import {SOURCE_SURROUNDINGS as C} from '../src/data/source-surroundings.js';
import {sourceSurroundingsFrame} from '../src/game/source-surroundings.js';
import {setSourceSurroundingsPressure,props3dDebugShaders} from '../src/render/props3d.js';
import {portalTransformPoint,portalTransformVector,portalMultiply} from '../src/render/source-mesh-portals.js';

const near=(a,b,epsilon=1e-5)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const wave=(extra={})=>({world:'fall',kind:'radial-pressure',origin:{x:160,y:59.3,z:-55},age:2,speed:36,radius:72,width:14,strength:.9,...extra});
const point=(angle,radius)=>[Math.cos(angle)*radius,Math.sin(angle)*radius,0];

test('the emitted finite front loads actual material points in sequence and leaves no permanent wake',()=>{
  const at=encode({waves:[wave()]}),before=sample(at,{side:1,world:[200,59.3,-55]}),front=sample(at,{side:1,world:[232,59.3,-55]}),ahead=sample(at,{side:1,world:[260,59.3,-55]});
  assert.equal(before.stress,0);near(front.stress,.9);assert.equal(ahead.stress,0);
  assert.ok(front.displacement[0]<-2);assert.ok(Math.hypot(...front.displacement)<LIMITS.displacement);
  const later=encode({waves:[wave({age:3,radius:108})]});assert.equal(sample(later,{side:1,world:[232,59.3,-55]}).stress,0);
  near(sample(later,{side:1,world:[268,59.3,-55]}).stress,.9);
});

test('a Missing Centre load travels within each actual local arcade span at finite metres per second',()=>{
  const centre=wave({world:'centre',kind:'centre-pressure',age:1,speed:48,radius:72}),frame=encode({waves:[centre]});
  for(const radius of[60,72,85]){
    const angle=LIMITS.startAngle+48/radius,front=sample(frame,{side:2,arcRadius:radius,local:point(angle,radius)});
    near(front.stress,.9);assert.ok(front.displacement[0]*Math.cos(angle)+front.displacement[1]*Math.sin(angle)<-2.5);
    assert.equal(sample(frame,{side:2,arcRadius:radius,local:point(angle+.6,radius)}).stress,0);
    assert.equal(sample(frame,{side:2,arcRadius:radius,local:point(angle-.6,radius)}).stress,0);
    const advanced=encode({waves:[{...centre,age:1.7}]});assert.equal(sample(advanced,{side:2,arcRadius:radius,local:point(angle,radius)}).stress,0);
  }
  assert.equal(sample(frame,{side:2,arcRadius:72,local:[0,0,0]}).stress,0,'absence cannot acquire a surface or load');
  assert.equal(sample(frame,{side:2,arcRadius:0,local:point(.8,72)}).stress,0);
});

test('borrowed anchors and study rotation transform the II wave origin once through the authored doorway frame',()=>{
  const gate={x:102,y:28.39,z:-62,normalX:0,normalZ:1},frame=encode({waves:[wave()],gate});
  const expected=[gate.x-(wave().origin.z-G.z),gate.y+wave().origin.y-G.y,gate.z+wave().origin.x-G.x];for(let k=0;k<3;k++)near(frame.origins[k],expected[k]);
  const rotatedFront=[expected[0],expected[1],expected[2]+72];near(sample(frame,{side:1,world:rotatedFront}).stress,.9);
  const matrix=[0,0,1,0,0,1,0,0,-1,0,0,0,0,0,0,1],angle=.08+48/72,
    centre=encode({waves:[wave({world:'centre',age:1,speed:48})]}),local=point(angle,72),a=sample(centre,{side:2,arcRadius:72,local}),b=sample(centre,{side:2,arcRadius:72,local,matrix});
  near(b.displacement[0],-a.displacement[2]);near(b.displacement[1],a.displacement[1]);near(b.displacement[2],a.displacement[0]);
});
test('a true portal view preserves material loading and rotates its physical displacement with the actual construction',()=>{
  const presentation=[1,0,0,0,0,0,1,0,0,-1,0,0,13,42,-9,1],at=encode({waves:[wave()]}),world=[232,59.3,-55],a=sample(at,{side:1,world}),b=sample(at,{side:1,world:portalTransformPoint(presentation,world),presentationMatrix:presentation});
  near(a.stress,b.stress);near(a.coordinate,b.coordinate);const expected=portalTransformVector(presentation,a.displacement);expected.forEach((v,k)=>near(b.displacement[k],v));
  const angle=.08+48/72,local=point(angle,72),centre=encode({waves:[wave({world:'centre',age:1,speed:48})]}),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],c=sample(centre,{side:2,arcRadius:72,local,matrix:identity}),d=sample(centre,{side:2,arcRadius:72,local,matrix:portalMultiply(presentation,identity),presentationMatrix:presentation});
  near(c.stress,d.stress);portalTransformVector(presentation,c.displacement).forEach((v,k)=>near(d.displacement[k],v));
});

test('overlapping and malformed input remains bounded, side scoped and reduced-motion still',()=>{
  const frame=encode({waves:[...Array.from({length:20},()=>wave({strength:500})),wave({age:NaN})]});
  assert.equal(frame.count,8);assert.equal(frame.origins.length,32);assert.equal(frame.fronts.length,32);
  for(let y=-14;y<=14;y+=.2){const response=sample(frame,{side:1,world:[232,y+59.3,-55]});assert.ok(Math.hypot(...response.displacement)<=3.5+1e-8);assert.ok(response.stress<=1);}
  assert.deepEqual(sample(frame,{side:0,world:[232,59.3,-55]}).displacement,[0,0,0]);
  assert.equal(sample(frame,{side:2,arcRadius:72,local:point(.8,72)}).stress,0,'fall waves cannot load centre stock');
  const held=encode({waves:[wave()],reducedMotion:true});assert.equal(held.count,0);assert.equal(sample(held,{side:1,world:[232,59.3,-55]}).stress,0);
  assert.equal(encode({waves:[wave({origin:{x:NaN,y:0,z:0}}),wave({origin:[1,2]}),wave({age:-1}),wave({world:'other'})]}).count,0);
  assert.equal(encode(null).count,0);assert.equal(encode({waves:Array.from({length:1000},()=>null)}).count,0);
  assert.deepEqual(setSourceSurroundingsPressure({waves:[wave()]}),{count:1,reducedMotion:false,maximumDisplacement:3.5});
  assert.equal(setSourceSurroundingsPressure(null).count,0);
});

test('only the custom remote stock opts in and culling reserves the exact finite displacement margin',()=>{
  for(const piece of sourceSurroundingsGeometryLibrary()){
    assert.equal(piece.sourceSurroundingsPressure,true);
    assert.equal(piece.sourceSurroundingsArcRadius,piece.arcId?Number(piece.arcId.includes('inner')?60:piece.arcId.includes('middle')?72:85):0);
  }
  const catalog=new Map([['tower_bell_04',{primitives:[{}]}],['tower_clapper_04',{primitives:[{}]}]]);installSourceSurroundingsEmitterAliases(null,{catalog});
  for(const name of['source-surroundings-bell','source-surroundings-clapper'])assert.equal(catalog.get(name).primitives[0].sourceSurroundingsPressure,undefined);
  for(const phase of['wrong-return','catch'])for(const elapsed of[0,10.3,28,96]){
    const props=sourceSurroundingsProps(sourceSurroundingsFrame({phase,elapsed}));
    for(const prop of props){assert.ok(prop.noCollision);assert.equal(prop.walkable,false);if(phase==='wrong-return')assert.ok(prop.physicalBounds.min[0]>C.fallMinimumX);else assert.ok(prop.physicalBounds.max[1]<-44,'overhead surroundings stay physically below the route');}
  }
});

test('main, reflected and shadow draws share the displaced world vertex and opaque surface stress',()=>{
  const shaders=props3dDebugShaders(),source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  for(const shader of[shaders.vertex,shaders.shadowVertex]){
    assert.ok(shader.includes(glsl));assert.ok(shader.includes('w.xyz+=sourceSurroundingsPressureDisplacement(local,w.xyz,mat3(m))'));
  }
  assert.ok(shaders.vertex.indexOf('w.xyz+=sourceSurroundingsPressureDisplacement')<shaders.vertex.indexOf('vWorld=w.xyz'));
  assert.ok(shaders.vertex.includes('gl_Position=uProj*uView*w'));assert.ok(shaders.shadowVertex.includes('gl_Position=uShadowMatrix*w'));
  assert.ok(shaders.fragment.includes('sourceSurroundingsPressureSample(vSourceSurroundingsLocal,vSourceSurroundingsRestWorld).stress'));
  assert.ok(shaders.fragment.includes('col+=mix(base,vec3(.75,.79,.69),.35)*surroundingsStress*.62'));
  for(const text of['bindSourceSurroundingsPressure(SU)','bindSourceSurroundingsPressure(U)','bindSourceSurroundingsPressureShape(SU,primitive)','bindSourceSurroundingsPressureShape(U,p)','primitive.sourceSurroundingsPressure===true'])assert.ok(source.includes(text),text);
  assert.ok(!glsl.includes('uTimeSec'),'held presentation time is the only pressure clock');
});
