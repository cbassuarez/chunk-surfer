import test from 'node:test';
import assert from 'node:assert/strict';
import {portalClipPlanes,portalTransformPoint,portalMultiply,portalInverse,transformPortalPlanes,portalBatchKey,portalClipArray,portalExcludeArray} from '../src/render/source-mesh-portals.js';
const inside=(planes,p)=>planes.every(v=>v[0]*p[0]+v[1]*p[1]+v[2]*p[2]+v[3]>=-.00002);
const aperture={x:0,y:1.6,z:0,right:[1,0,0],up:[0,1,0],normal:[0,0,1],halfWidth:1.6,halfHeight:1.6};
const near=(a,b)=>a.forEach((v,k)=>assert.ok(Math.abs(v-b[k])<1e-7,`${a} != ${b}`));
test('actual aperture cone clips sides and the source half-space at varying head positions',()=>{
 for(const eye of[[0,1.6,4],[.7,2.1,3],[-.9,.9,1]]){
  const planes=portalClipPlanes(aperture,eye);assert.equal(planes.length,5);
  assert.equal(inside(planes,[0,1.6,-2]),true);assert.equal(inside(planes,[0,1.6,1]),false);
  assert.equal(inside(planes,[20,1.6,-2]),false);assert.equal(inside(planes,[0,20,-2]),false);
 }
});
test('roll and vertical gates preserve all five planes under one rigid presentation transform',()=>{
 const m=[1,0,0,0,0,0,1,0,0,-1,0,0,11,4,-7,1],p=portalClipPlanes(aperture,[0,1.6,4]),q=transformPortalPlanes(p,m);
 for(const v of[[0,1.6,-2],[2,1.6,-5],[20,1.6,-2],[0,1.6,1]])assert.equal(inside(q,portalTransformPoint(m,v)),inside(p,v));
 const inverse=portalInverse(m);near(portalTransformPoint(inverse,portalTransformPoint(m,[2,3,4])),[2,3,4]);near(portalMultiply(m,inverse),[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
});
test('head parallax changes aperture rays and per-aperture batching cannot leak clip state',()=>{
 const a=portalClipPlanes(aperture,[0,1.6,4]),b=portalClipPlanes(aperture,[.6,1.6,4]);
 assert.notDeepEqual(a,b);assert.notEqual(portalBatchKey({portalClipPlanes:a}),portalBatchKey({portalClipPlanes:b}));
 assert.notEqual(portalBatchKey({portalClipPlanes:a,portalClipId:'one'}),portalBatchKey({portalClipPlanes:a,portalClipId:'two'}));
 assert.equal(portalBatchKey({}), '');assert.equal(portalClipArray([[NaN]]),null);assert.equal(portalClipArray(a).length,20);
});
test('the exact observer crossing plane has a finite half-space instead of a collapsed cone',()=>{
 const p=portalClipPlanes(aperture,[.4,1.8,0]);assert.ok(p.flat().every(Number.isFinite));
 assert.equal(inside(p,[0,1.6,-2]),true);assert.equal(inside(p,[0,1.6,1]),false);
});
test('passing beside an aperture in its plane cannot expose or cut the whole destination half-world',()=>{
 const p=portalClipPlanes(aperture,[2.1,1.6,0]);
 for(const v of[[0,1.6,-2],[20,1.6,-2],[2.1,1.6,-.01]])assert.equal(inside(p,v),false);
 const rotated={x:-63,y:10,z:-32,right:[0,0,-1],up:[0,1,0],normal:[1,0,0],halfWidth:1.6,halfHeight:1.6};
 assert.equal(inside(portalClipPlanes(rotated,[-63,10,-34.1]),[-80,10,-54]),false);
});
test('source-world exclusion cones remain separate from the destination view batch',()=>{
 const p=portalClipPlanes(aperture,[0,1.6,4]),q=portalClipPlanes({...aperture,x:5},[0,1.6,4]);
 assert.equal(portalExcludeArray([p,q]).length,40);assert.equal(portalExcludeArray([p,q,p]).length,60);
 assert.equal(portalExcludeArray([p,q,p,q]),null,'two Journey views plus one fixed dimensional aperture is the complete bounded budget');
 assert.notEqual(portalBatchKey({portalClipPlanes:p}),portalBatchKey({portalExcludePlanes:[p]}));
 // The source floor behind the aperture must be removed; the same floor
 // outside the window remains ordinary foreground/architecture.
 assert.equal(inside(p,[0,0,-.5]),true);assert.equal(inside(p,[6,0,-.5]),false);
});
