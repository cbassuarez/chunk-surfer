import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ZONE } from '../src/data/floorplan/legend.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {
  CONSERVATORY_LIGHTS, LOCAL_LIGHT_SLOTS, LIGHT_KIND, LIGHT_POWER_MODE,
  lightRigFor, resolveLocalLights, resolveLightingContext,
} from '../src/data/conservatory-lights.js';
const id='academic-gallery-console-north';
const room={group:'academic',zone:ZONE.academic};
const source=()=>CONSERVATORY_LIGHTS.find(light=>light.id===id);
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.loadPropState({}); PROPS.propsInit(FP);
const anchorPosition=propId=>{
  const p=PROPS.propById(propId);if(!p)return null;
  const at=FP.logicalToPhysical(p.rx,p.ry);
  return{x:at.x*.5+(p.renderOffsetX||0),y:p.floor+(p.elevation||0)+(p.renderOffsetY||0),
    z:at.z*.5+(p.renderOffsetZ||0),floorY:p.floor,yaw:p.yaw};
};
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-5,`${message}: ${a} vs ${b}`);
const bytes=fs.readFileSync(new URL('../public/assets/academic-gallery.glb',import.meta.url));
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());
const binaryOffset=28+bytes.readUInt32LE(12);
function vertices(meshName){
  const mesh=json.meshes.find(mesh=>mesh.name===meshName);
  return mesh.primitives.flatMap(primitive=>{
    const accessor=json.accessors[primitive.attributes.POSITION],view=json.bufferViews[accessor.bufferView];
    const stride=view.byteStride||12,start=binaryOffset+(view.byteOffset||0)+(accessor.byteOffset||0);
    assert.equal(accessor.componentType,5126);
    return Array.from({length:accessor.count},(_,n)=>[0,1,2].map(k=>bytes.readFloatLE(start+n*stride+k*4)));
  });
}

test('one real shaded north-console lamp supplies a restrained maintained gallery practical',()=>{
  const light=source();assert.ok(light,'the gallery has a real maintained practical with dead mains');
  assert.equal(light.kind,LIGHT_KIND.FITTING);assert.equal(light.powerMode,LIGHT_POWER_MODE.MAINTAINED);
  assert.equal(light.circuit,null);assert.equal(light.maintained,true);
  assert.deepEqual(light.groups,['academic']);assert.deepEqual(light.zones,[ZONE.academic]);
  assert.equal(light.penetration,0,'the practical respects architecture');
  assert.equal(light.castsShadow,false,'the capped opaque shade cannot steal the single hero shadow map');
  assert.ok(light.intensity>=1&&light.intensity<=1.2);assert.ok(light.radius>=8&&light.radius<=9.5);
  assert.ok(light.color[0]>light.color[1]&&light.color[1]>light.color[2]&&light.color[2]>=.5);
  assert.equal(light.anchorPropId,'gallery-treatment-console-north');
  assert.equal(CONSERVATORY_LIGHTS.filter(light=>/^academic-gallery-console-/.test(light.id)).length,1,
    'the south console has a case and vessel, no invented luminous fitting');
  const north=JSON.parse(json.nodes.find(node=>node.name==='gallery_console_north').extras.galleryContract);
  const south=JSON.parse(json.nodes.find(node=>node.name==='gallery_console_south').extras.galleryContract);
  assert.match(north.contents,/shadedlamp/);assert.doesNotMatch(south.contents,/lamp/);
});

test('the source follows the actual lower shade rim, clears its solid stem, and retains the +10m floor',()=>{
  const light=source();assert.ok(light);
  const host=anchorPosition(light.anchorPropId),offset=light.anchorOffset;
  const c=Math.cos(host.yaw),s=Math.sin(host.yaw);
  const local={x:c*offset[0]+s*offset[2],y:offset[1],z:-s*offset[0]+c*offset[2]};
  const shade=vertices('gallery_console_north').filter(([x,y,z])=>
    Math.abs(y-1.20)<.001&&Math.abs(Math.hypot(x-.09,z)-.14)<.002);
  assert.ok(shade.length>=12,'the measured 28cm lower shade rim exists in final GLB');
  close(local.x,.09,'lamp centre matches the final console transform');
  assert.ok(local.y>=1.18&&local.y<1.20,'source exits immediately below the real shade hem');
  assert.ok(Math.hypot(local.x-.09,local.z)>.035,'source clears the opaque bronze stem');
  assert.ok(Math.hypot(local.x-.09,local.z)<.12,'source remains beneath the real shade footprint');
  const resolved=resolveLocalLights(room,{anchorPosition,liveCircuits:[],origin:host}).find(light=>light.id===id);
  assert.ok(resolved);
  close(resolved.x,host.x+offset[0],'source x');close(resolved.y,host.y+offset[1],'source height');
  close(resolved.z,host.z+offset[2],'source z');assert.equal(resolved.floorY,10);
  close(resolved.x,light.x,'fallback x');close(resolved.y,light.y,'fallback height');close(resolved.z,light.z,'fallback z');
  const moved=resolveLocalLights(room,{anchorPosition:()=>({...host,x:host.x+2,z:host.z-1,y:host.y+.5}),liveCircuits:[]}).find(light=>light.id===id);
  close(moved.x,resolved.x+2,'moving the practical moves its source x');
  close(moved.y,resolved.y+.5,'moving the practical moves its source height');
  close(moved.z,resolved.z-1,'moving the practical moves its source z');
  assert.equal(resolved.castsShadow,light.castsShadow,'the shadow owner uses this same resolved position');
});

test('west heads receive meaningful shader falloff at their actual elevation while distant east heads retain contrast',()=>{
  const light=resolveLocalLights(room,{anchorPosition,liveCircuits:[]}).find(light=>light.id===id);
  assert.ok(light);
  // Production shader: squared radial falloff times Lambert; this is incident
  // energy on the west cheek before material response and real occlusion.
  const incident=propId=>{
    const p=anchorPosition(propId),point={x:p.x,y:p.y+.65,z:p.z};
    const delta={x:light.x-point.x,y:light.y-point.y,z:light.z-point.z};
    const distance=Math.hypot(delta.x,delta.y,delta.z);
    return light.intensity*Math.max(0,1-distance/light.radius)**2*Math.max(0,-delta.x/distance);
  };
  assert.ok(incident('academic-bust-1')>.30,'head 1 gains a lit cheek, rather than merely a floor pool');
  assert.ok(incident('academic-bust-2')>.15,'head 2 receives useful side light');
  assert.equal(incident('academic-bust-4'),0,'the source does not wash the far side of the atrium');
});

test('power, flash cadence and slot selection preserve the practical without changing original gallery sources',()=>{
  const expected={
    'academic-skylight-spill':{anchor:'academic-skylight',kind:LIGHT_KIND.SKY,intensity:1.12,radius:24,groups:['ground','academic'],zones:[ZONE.foyer,ZONE.academic]},
    'academic-emergency-west':{anchor:'academic-light-emergency-west',kind:LIGHT_KIND.EMERGENCY,intensity:.54,radius:30,groups:['academic'],zones:[ZONE.academic]},
    'academic-emergency-east-failing':{anchor:'academic-light-emergency-east-failing',kind:LIGHT_KIND.EMERGENCY,intensity:.22,radius:30,groups:['academic'],zones:[ZONE.academic]},
  };
  for(const [original,contract]of Object.entries(expected)){
    const light=CONSERVATORY_LIGHTS.find(light=>light.id===original);
    assert.deepEqual({anchor:light.anchorPropId,kind:light.kind,intensity:light.intensity,radius:light.radius,groups:light.groups,zones:light.zones},contract);
  }
  for(const liveCircuits of [[],['sp05']])for(const effectsMode of ['full','reduced','off'])for(const timeSec of [0,2,5.4]){
    const lights=resolveLocalLights(room,{anchorPosition,origin:{x:77,z:14},liveCircuits,effectsMode,timeSec});
    assert.ok(lights.length<=LOCAL_LIGHT_SLOTS);assert.ok(lightRigFor('academic').length<=LOCAL_LIGHT_SLOTS);
    const light=lights.find(light=>light.id===id);assert.ok(light);
    assert.equal(light.intensity,source().intensity);assert.equal(light.radius,source().radius);
    assert.equal(light.emissiveScale,1);assert.equal(light.emergencyPulse,null);
  }
  const context=resolveLightingContext(room);
  assert.equal(context.ambientIntensity,.036);assert.deepEqual(context.ambientColor,[.62,.69,.70]);
  assert.equal(context.captureExposure,undefined,'no global acquisition exposure change');
});

test('ground, roof, other floors and nonacademic zones never acquire the gallery practical',()=>{
  for(const group of ['ground','academicRoof','basement','upper','hall','tower','sourceSpace']){
    const lights=resolveLocalLights({group,zone:ZONE.academic},{anchorPosition,liveCircuits:['sp01','sp02','sp03','sp04','sp05'],slots:Infinity});
    assert.ok(!lights.some(light=>light.id===id),group);
  }
  for(const zone of [ZONE.foyer,ZONE.stair,ZONE.academicRoof,ZONE.church,ZONE.pub]){
    assert.ok(!resolveLocalLights({group:'academic',zone},{anchorPosition,liveCircuits:['sp05'],slots:Infinity}).some(light=>light.id===id),`zone ${zone}`);
  }
});
