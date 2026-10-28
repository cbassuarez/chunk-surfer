import test from'node:test';
import assert from'node:assert/strict';
import{ELLERY_HYBRID_LIGHTS as lamps,selectW3OutlookLights}from'../src/render/ellery-hybrid-lighting.js';
import{localLightConeDescriptor,localLightConeWeight}from'../src/render/local-light-cone.js';
import{selectExteriorTownLights}from'../src/render/exterior-town-lighting.js';

const byId=id=>lamps.find(l=>l.id===`ellery-hybrid-canopy-${id}`);
const ray=(light,at)=>at.map((v,i)=>v-[light.x,light.y,light.z][i]);
const lamp=(id,x,z=2)=>({id,x,y:2.72,z,intensity:.65,radius:4.5,color:[1,.78,.53]});
const window={id:'W3-foyer-north',physical:{plane:3,from:84,to:88}};

test('three physically bounded sources expose valid, directional cones and no emergency or ambient override',()=>{
 assert.equal(lamps.length,3);assert.equal(new Set(lamps.map(l=>l.id)).size,3);
 for(const light of lamps){
  assert.ok(light.intensity>0&&light.intensity<=1.6);assert.ok(light.radius<=6.4);
  assert.equal(light.powerMode,'external');assert.equal(light.kind,'fitting');
  assert.equal(light.circuit,null);assert.equal(light.penetration,0);assert.equal(light.castsShadow,false);
  assert.ok(localLightConeDescriptor(light).direction.some(Boolean),light.id);
 }
});
test('downlights illuminate their intended threshold while the uplight reaches only the relief direction',()=>{
 const entry=byId('entrance'),window=byId('window'),relief=byId('relief');
 assert.ok(localLightConeWeight(entry,ray(entry,[79,1.7,2.95]))>.9);
 assert.ok(localLightConeWeight(window,ray(window,[86.4,2.25,2.95]))>.9);
 assert.ok(localLightConeWeight(relief,ray(relief,[79,6.55,2.7]))>.9);
 assert.equal(localLightConeWeight(entry,[0,1,0]),0);assert.equal(localLightConeWeight(relief,[0,-1,0]),0);
});
test('actual outdoor admission shares the existing 12-source budget and keeps nearby practicals',()=>{
 const entrance=[lamp('ellery-public-entrance-lamp-76.92',76.92),lamp('ellery-public-entrance-lamp-81.1',81.1),...lamps];
 const road=Array.from({length:20},(_,i)=>lamp('road-'+i,100+i));
 const result=selectExteriorTownLights({entrance,road,origin:{x:82,z:1},maxLights:12});
 assert.equal(result.length,12);for(const l of entrance)assert.ok(result.includes(l),l.id);
 assert.equal(new Set(result.map(l=>l.id)).size,12);
});
test('the genuine W3 outlook admits no more than two real outside fittings after all room and emergency lights',()=>{
 const local=[lamp('room-a',90),{...lamp('emergency-a',91),kind:'emergency'},lamp('room-b',92)];
 const existing=[lamp('ellery-public-entrance-lamp-76.92',76.92),lamp('ellery-public-entrance-lamp-81.1',81.1)];
 const input=[...lamps,...existing,lamp('unrelated',86),lamps[1]];
 const result=selectW3OutlookLights({window,ready:true,local,exterior:input});
 assert.equal(result.length,5);assert.deepEqual(result.slice(0,local.length),local);
 assert.equal(result[1].kind,'emergency');assert.strictEqual(result[3],byId('window'));
 assert.equal(result[4].id,'ellery-public-entrance-lamp-81.1');
 assert.deepEqual(local.map(l=>l.id),['room-a','emergency-a','room-b']);
});
test('full or almost-full interiors keep their active lights and only use truly vacant renderer slots',()=>{
 const full=Array.from({length:12},(_,i)=>({...lamp('existing-'+i,0),kind:i===0?'emergency':'fitting'}));
 assert.strictEqual(selectW3OutlookLights({window,ready:true,local:full,exterior:lamps}),full);
 const eleven=full.slice(0,11),one=selectW3OutlookLights({window,ready:true,local:eleven,exterior:lamps});
 assert.equal(one.length,12);assert.deepEqual(one.slice(0,11),eleven);assert.strictEqual(one[11],byId('window'));
 assert.strictEqual(selectW3OutlookLights({window,ready:true,local:full,exterior:lamps,maxLights:20}),full);
});
test('wrong windows, unloaded pack and unavailable or unpowered fixtures preserve the original room rig',()=>{
 const local=[lamp('existing',0)],external=[...lamps];
 for(const w of[null,{id:'W4-pool-south',physical:window.physical}])
  assert.strictEqual(selectW3OutlookLights({window:w,ready:true,local,exterior:external}),local);
 assert.strictEqual(selectW3OutlookLights({window,ready:false,local,exterior:external}),local);
 assert.strictEqual(selectW3OutlookLights({window,ready:true,local,exterior:external.map(l=>({...l,intensity:0}))}),local);
 assert.strictEqual(selectW3OutlookLights({window:{id:window.id,physical:{}},ready:true,local,exterior:external}),local);
});
