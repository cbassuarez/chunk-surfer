import test from'node:test';
import assert from'node:assert/strict';
import{buildingWindowForObserver}from'../src/world/building-window-views.js';
import{ELLERY_PUBLIC_FRONT_LIGHTS}from'../src/data/ellery-public-front.js';
import{resolveLocalLights}from'../src/data/conservatory-lights.js';
import{ZONE}from'../src/data/floorplan/legend.js';
import{ELLERY_HYBRID_LIGHTS,selectW3OutlookLights}from'../src/render/ellery-hybrid-lighting.js';

test('the actual greenhouse observer selects W3 and retains its room rig before admitting outside fittings',()=>{
 const w=buildingWindowForObserver({x:84,z:30,y:0,spaceId:'natatorium',renderGroup:'ground'});
 assert.equal(w.id,'W3-foyer-north');assert.equal(w.physical.plane,3);
 const room=[{id:'growing-light',x:84,y:3.2,z:30,intensity:.86,radius:6.4},
   {id:'emergency-light',x:90,y:3,z:31,intensity:1,radius:5,kind:'emergency'}];
 const external=[...ELLERY_PUBLIC_FRONT_LIGHTS,...ELLERY_HYBRID_LIGHTS];
 const out=selectW3OutlookLights({window:w,ready:true,local:room,exterior:external});
 assert.equal(out.length,4);assert.strictEqual(out[0],room[0]);assert.strictEqual(out[1],room[1]);
 assert.strictEqual(out[2],ELLERY_HYBRID_LIGHTS.find(l=>l.id.endsWith('window')));
 assert.ok(external.includes(out[3]));
 assert.strictEqual(selectW3OutlookLights({window:w,ready:false,local:room,exterior:external}),room);
});

test('the existing pool W4 outlook does not pick up the new public-front lighting',()=>{
 const w=buildingWindowForObserver({x:84,z:40,y:0,spaceId:'natatorium',renderGroup:'ground'});
 assert.ok(w);assert.equal(w.id,'W4-pool-south');
 const room=[{id:'pool-light',x:84,y:3,z:40,intensity:1,radius:5}];
 assert.strictEqual(selectW3OutlookLights({window:w,ready:true,local:room,exterior:ELLERY_HYBRID_LIGHTS}),room);
});

test('the actual live foyer and growing-lamp rigs keep all their lights when W3 is visible',()=>{
 for(const observer of[
  {x:84,z:30,y:0,spaceId:'natatorium',renderGroup:'ground',zone:ZONE.glasshouse},
  {x:85,z:10,y:0,spaceId:'front_atrium',renderGroup:'ground',zone:ZONE.foyer},
 ]){
  const window=buildingWindowForObserver(observer);assert.equal(window.id,'W3-foyer-north');
  const local=resolveLocalLights({group:'ground',zone:observer.zone},{glassCourtReady:true,slots:Infinity,liveCircuits:new Set()});
  assert.ok(local.length>0,'negative control: use a real populated room rig');
  const result=selectW3OutlookLights({window,ready:true,local,exterior:[...ELLERY_PUBLIC_FRONT_LIGHTS,...ELLERY_HYBRID_LIGHTS]});
  assert.equal(result.length,Math.min(12,local.length+2));
  for(let i=0;i<local.length;i++)assert.strictEqual(result[i],local[i],`preserve ${local[i].id}`);
  for(const light of local.filter(l=>l.kind==='emergency'))assert.ok(result.includes(light),'do not evict a room emergency light');
 }
});
