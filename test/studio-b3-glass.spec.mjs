import test from 'node:test';
import assert from 'node:assert/strict';
import {B3_GLASS,createB3GlassMoment,B3_GLASS_GLSL,b3FigurePanePoint,b3ClearRay,b3PaneIllumination} from '../src/render/studio-b3-glass.js';

const look={active:true,eye:[14,-2.38,10.5],yaw:Math.PI/2,pitch:0,dt:.1,visible:true,lit:true};
const away={...look,yaw:-Math.PI/2};
function advance(m,frame,n){let value=0;for(let i=0;i<n;i++)value=m.step(frame);return value;}
test('the ordinary window precedes a slow figure on a later look',()=>{
 const m=createB3GlassMoment();
 assert.equal(advance(m,look,12),0);
 assert.equal(advance(m,away,5),0);
 assert.equal(m.step(look),0);
 assert.ok(advance(m,look,8)>.9);
 assert.equal(advance(m,look,40),0);
 assert.equal(advance(m,look,20),0);
});
test('the figure never triggers in the booth or another floor',()=>{
 const m=createB3GlassMoment();
 const booth={...look,eye:[21,-2.38,10.5]};
 assert.equal(advance(m,booth,20),0);
 assert.equal(advance(m,{...booth,yaw:-Math.PI/2},5),0);
 assert.equal(advance(m,booth,20),0);
 assert.equal(advance(m,{...look,active:false},20),0);
});
test('the optical effect is pane-bounded and depth-tested, with no reflection texture pass',()=>{
 assert.deepEqual([B3_GLASS.x,B3_GLASS.z0,B3_GLASS.z1],[18.5,8,13]);
 assert.match(B3_GLASS_GLSL,/sceneDepth/);
 assert.match(B3_GLASS_GLSL,/eye\.x>=18\.5/);
 assert.doesNotMatch(B3_GLASS_GLSL,/sampler2D/);
});

const plan={w:60,h:40,originX:0,originY:0,solid:new Uint8Array(2400),flags:new Uint8Array(2400),floor:new Float32Array(2400).fill(-4),ceil:new Float32Array(2400).fill(-.8)};
test('the virtual head projection respects the window and solid geometry',()=>{
 const eye=[14.75,-2.38,11.25],point=b3FigurePanePoint(eye);assert.ok(point);assert.ok(b3ClearRay(plan,eye,point));
 const blocked={...plan,solid:plan.solid.slice()};blocked.solid[22*60+32]=1;assert.equal(b3ClearRay(blocked,eye,point),false);
 assert.equal(b3ClearRay(plan,eye,point,{propBlocks:()=>true}),false);
 assert.equal(b3FigurePanePoint([21,-2.38,10.5]),null);
});
test('dark, blocked and interrupted returns wait rather than spending the glimpse',()=>{
 const m=createB3GlassMoment();advance(m,look,12);advance(m,away,5);
 assert.equal(advance(m,{...look,visible:false},50),0);
 assert.equal(advance(m,{...look,lit:false},50),0);
 m.step(look);assert.ok(advance(m,look,8)>.9);
 assert.equal(advance(m,{...look,lit:false},80),0);
 assert.equal(advance(m,{...look,suspended:true},80),0);
 assert.ok(m.step(look)>.9);
});
test('torch and a real unobstructed lamp supply illumination; darkness does not',()=>{
 const eye=[14.75,-2.38,11.25],point=b3FigurePanePoint(eye);
 assert.equal(b3PaneIllumination({point,eye,plan}),0);
 const dir=point.map((v,i)=>v-eye[i]),len=Math.hypot(...dir);
 const torch={origin:eye,forward:dir.map(x=>x/len),power:1,reach:1,coneInner:.88,coneOuter:.94,spill:.05};
 assert.ok(b3PaneIllumination({point,eye,torch,plan})>.12);
 const lights=[{x:16,y:-2.4,z:10.5,radius:8,intensity:1}];
 assert.ok(b3PaneIllumination({point,eye,lights,plan})>.12);
 const blocked={...plan,solid:plan.solid.slice()};blocked.solid[21*60+33]=1;
 assert.equal(b3PaneIllumination({point,eye,lights,plan:blocked}),0);
});
