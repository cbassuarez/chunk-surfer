import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Box3, Euler, Quaternion, Vector3 } from 'three';
import { createBattleHandRig, parseBattleHandTemplate } from '../src/render/battle-hand-rig.js';
import { buildBattleHandTool } from '../src/render/battle-hand-tools.js';
import { buildRadioContactModel } from '../src/render/radio-contact-model.js';
import { battleHandFraming, battleHandPerformance, battleHandReach } from '../src/render/battle-hand-performance.js';

const bytes=readFileSync(new URL('../public/assets/battle-hands/right.glb', import.meta.url));
const template=await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const BATTERY_SOLIDS=[
  {id:'battery shoe',bounds:new Box3(new Vector3(-.048,-.091,-.0445),new Vector3(.048,-.075,.0085))},
  {id:'rear battery shell',bounds:new Box3(new Vector3(-.0435,-.092,-.042),new Vector3(.0435,.044,-.028))},
];
function surfacePoints(hand){
  hand.root.updateMatrixWorld(true);hand.skin.skeleton.update();const points=[];
  for(let i=0;i<hand.skin.geometry.attributes.position.count;i++)points.push(hand.skin.localToWorld(hand.skin.getVertexPosition(i,new Vector3())));
  for(const nail of hand.nails)for(let i=0;i<nail.geometry.attributes.position.count;i++)points.push(nail.localToWorld(new Vector3().fromBufferAttribute(nail.geometry.attributes.position,i)));
  return points;
}
function assertOutsideSolids(points,group,solids,label){
  for(const point of points){const local=group.worldToLocal(point.clone());for(const {id,bounds:b}of solids){
    const depth=Math.min(local.x-b.min.x,b.max.x-local.x,local.y-b.min.y,b.max.y-local.y,local.z-b.min.z,b.max.z-local.z);
    assert.ok(depth<.001,`${label} skin/nail penetrates ${id} by ${depth*1000}mm`);
  }}
}
function blendPose(a,b,t){const p={};for(const digit of ['index','middle','ring','pinky'])p[digit]=a[digit].map((v,i)=>v+(b[digit][i]-v)*t);for(const key of ['thumb','spread'])p[key]=Object.fromEntries(Object.entries(a[key]).map(([name,v])=>[name,v+(b[key][name]-v)*t]));return p;}
function performanceAtReach(move,amount,injury,withdrawing){
  let low=withdrawing?.37:0,high=withdrawing?.86:.28;
  for(let i=0;i<20;i++){const middle=(low+high)/2,p=battleHandPerformance({tool:'radio',move,actionActor:'player',now:0,injury,rawProgress:middle});if(withdrawing?p.operation>amount:p.operation<amount)low=middle;else high=middle;}
  return battleHandPerformance({tool:'radio',move,actionActor:'player',now:0,injury,rawProgress:(low+high)/2});
}

test('combat uses the canonical walkie at full size and contacts its actual top knob and side PTT',()=>{
  const canonical=buildRadioContactModel(),tool=buildBattleHandTool('radio'),chassis=tool.group.getObjectByName('portable short-wave radio');
  assert.ok(chassis,'legacy lookup identifies the canonical walkie chassis');
  const expected=new Box3().setFromObject(canonical.parts.shell).getSize(new Vector3()),actual=new Box3().setFromObject(chassis).getSize(new Vector3());
  assert.ok(actual.distanceTo(expected)<1e-6,'battle radio must not shrink or replace the actual carried housing');
  assert.deepEqual(tool.controls.tune.position,[.030,.101,.014]);assert.deepEqual(tool.controls.transmit.position,[-.058,.027,.001]);
  const left=createBattleHandRig(template,{side:'left'});
  for(const [key,action]of [['tune','tune'],['transmit','radio-decoy']])for(const pressure of [0,.5,1]){
    tool.update({action,side:'player',active:true,progress:.5,controlPressure:pressure});const c=tool.controls[key];left.setRootPose(c.wrist);left.setFingerPose(c.pose);
    const contact=left.measureGrip({index:c}).index;
    assert.ok(contact.error<.0001,`${key} actual pad contact`);assert.ok(contact.normalDot>.75,`${key} palmar rather than nail contact`);
    assert.ok(new Vector3(0,1,0).applyQuaternion(left.root.quaternion).y>.3,`${key} forearm points below its wrist`);
    assert.ok(c.wrist.position[1]<c.position[1],`${key} wrist approaches from below`);
  }
  left.dispose();tool.dispose();canonical.dispose();
});

test('full-size radio hand bakes clear the complete battery during reach and withdrawal, including critical injury',()=>{
  const tool=buildBattleHandTool('radio'),left=createBattleHandRig(template,{side:'left'}),right=createBattleHandRig(template),framing=battleHandFraming({width:1728,height:585});
  tool.group.add(right.root);right.setRootPose(tool.contacts.right.wrist);right.setFingerPose(tool.contacts.right.pose);
  for(const [key,move]of [['tune','tune'],['transmit','radio-decoy']])for(const injury of ['steady','critical'])for(const withdrawing of [false,true])for(const amount of [.25,.5,.75,.9,1]){
    const p=performanceAtReach(move,amount,injury,withdrawing),reach=battleHandReach(p.operation);
    tool.group.position.set(...framing.tool.map((v,i)=>v+p.toolOffset[i]));tool.group.rotation.set(-.045+reach.progress*.025+p.toolRotation[0],-.08+p.toolRotation[1],-.025+p.toolRotation[2]);
    tool.update({action:move,side:'player',active:true,progress:p.rawProgress,controlPressure:reach.progress});tool.group.updateMatrixWorld(true);
    const c=tool.controls[key],wrist=tool.group.localToWorld(new Vector3(...c.wrist.position)),wristQ=tool.group.getWorldQuaternion(new Quaternion()).multiply(new Quaternion(...c.wrist.quaternion));
    const position=new Vector3(...framing.leftWrist.map((v,i)=>v+p.leftOffset[i])).lerp(wrist,reach.progress);position.z+=reach.cameraArc;
    left.setRootPose({position:position.toArray(),quaternion:new Quaternion().setFromEuler(new Euler(...p.leftRotation)).slerp(wristQ,reach.progress)});
    left.setFingerPose(blendPose({...p.leftFingers,thumb:p.thumb,spread:p.spread},c.pose,reach.closure));
    const label=`${key} ${injury} ${withdrawing?'withdrawal':'reach'} ${amount}`;
    assertOutsideSolids(surfacePoints(left),tool.group,BATTERY_SOLIDS,`${label} operating hand`);
    assertOutsideSolids(surfacePoints(right),tool.group,BATTERY_SOLIDS,`${label} supporting hand`);
  }
  right.dispose();left.dispose();tool.dispose();
});
