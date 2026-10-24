import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {VAN_REAR_STRUCTURE,VAN_REAR_CARGO_LIGHT} from '../src/data/van-rear-design.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {localLightConeWeight} from '../src/render/local-light-cone.js';
import {vanRearCargoLight} from '../src/render/van-rear-light.js';

const view=()=>({group:'ground',zone:ZONE.street,anchor:{x:15.6,y:2.3,z:8,floorY:0},listener:{x:13.6,z:8},open:1});
test('the cargo fitting contributes incident light at its live physical anchor without becoming an emergency encounter',()=>{
 const options=view(),light=vanRearCargoLight(options);
 assert.ok(light);assert.equal(light.x,options.anchor.x);assert.equal(light.z,options.anchor.z);
 assert.ok(light.y<options.anchor.y&&light.y>options.anchor.y-.15);
 assert.ok(light.intensity>0);assert.ok(light.radius<3.5);assert.equal(light.penetration,0);
 assert.equal(light.kind,'fitting');assert.equal(light.emergencyPulse,null);assert.equal(light.shadowReveal,0);
});
test('closed, removed, remote and indoor van fixtures cannot leave a ghost cargo light after reload',()=>{
 for(const change of[{open:0},{open:-1},{anchor:null},{group:'academic'},{zone:ZONE.foyer},{listener:{x:40,z:8}},
   {anchor:{x:NaN,y:2,z:8}},{open:NaN}])assert.equal(vanRearCargoLight({...view(),...change}),null);
 const closing=vanRearCargoLight({...view(),open:.03});
 assert.ok(closing.intensity>0&&closing.intensity<vanRearCargoLight(view()).intensity);
 for(const zone of [ZONE.street,ZONE.dock,ZONE.serviceYard,ZONE.civicCourt])assert.ok(vanRearCargoLight({...view(),zone}));
});
test('the production host supplies the real door pose and live anchor before ordinary light-slot selection',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const block=main.slice(main.indexOf('  const vanCargoLight='),main.indexOf('  const dockHauntingLightPoint='));
 assert.match(block,/anchor:lightAnchorPosition\('yard-van-lamp'\)/);
 assert.match(block,/open:vanDoorOpenFraction\(\)/);
 assert.match(block,/\[\.\.\.\(vanCargoLight\?\[vanCargoLight\]:\[\]\),\.\.\.ordinaryLights/);
});

test('the physical cargo lamp is above the rear work edge, ahead of the field case',()=>{
 const van=CONSERVATORY_PROPS.find(p=>p.id==='yard-van');
 const lamp=CONSERVATORY_PROPS.find(p=>p.id==='yard-van-lamp');
 const localZ=-(lamp.x-van.x)*Math.sin(van.yaw)+(lamp.y-van.y)*Math.cos(van.yaw);
 assert.ok(localZ>VAN_REAR_STRUCTURE.worktopCenterZ+.3,'light must reach the player-facing case and drawers');
 assert.ok(localZ<VAN_REAR_STRUCTURE.rearPlane,'fitting remains inside the cargo roof');
 assert.ok(lamp.elevation>VAN_REAR_STRUCTURE.worktopY+1);
});

test('the metal-backed cargo diffuser lights the working plane without washing its own roof',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const light=vanRearCargoLight({...view(),anchor:{...view().anchor,yaw}});
  assert.equal(localLightConeWeight(light,[0,1,0]),0,'roof above fitting receives no direct emission');
  assert.equal(localLightConeWeight(light,[0,-1,0]),1,'surface below diffuser stays within full field');
  const inward=[Math.sin(yaw)*.6,-1,-Math.cos(yaw)*.6];
  assert.ok(localLightConeWeight(light,inward)>.95,'worktop remains in the useful beam at every van yaw');
  assert.ok(localLightConeWeight(light,[Math.sin(yaw)*.1,-1.4,-Math.cos(yaw)*.1])>.95,'drawer front remains illuminated');
 }
});

test('world incident emission and the preparation cutaway use the same physical roof-light specification',()=>{
 const van=CONSERVATORY_PROPS.find(p=>p.id==='yard-van'),lamp=CONSERVATORY_PROPS.find(p=>p.id==='yard-van-lamp');
 const dx=lamp.x-van.x,dz=lamp.y-van.y,yaw=van.yaw;
 const local=[Math.cos(yaw)*dx+Math.sin(yaw)*dz,lamp.elevation-.10,-Math.sin(yaw)*dx+Math.cos(yaw)*dz];
 for(let i=0;i<3;i++)assert.ok(Math.abs(local[i]-VAN_REAR_CARGO_LIGHT.position[i])<1e-6);
 const stage=readFileSync(new URL('../src/render/van-workbench-stage.js',import.meta.url),'utf8');
 assert.match(stage,/VAN_REAR_CARGO_LIGHT/);
});
