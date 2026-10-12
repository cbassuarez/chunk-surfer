import {readFileSync,writeFileSync} from 'node:fs';
import {Vector3,Quaternion,Euler} from 'three';
import {createBattleHandRig,parseBattleHandTemplate} from '../../../src/render/battle-hand-rig.js';
const b=readFileSync('public/assets/battle-hands/right.glb'),template=await parseBattleHandTemplate(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const h=createBattleHandRig(template); const q=new Quaternion().setFromEuler(new Euler(-1.35,0,-.14));
const pose={index:[.08,.1,.065],middle:[.06,.10,.065],ring:[.06,.1,.065],pinky:[.07,.1,.065],spread:{index:0,middle:0,ring:0,pinky:0},thumb:{opposition:.25,abduction:.2,mcp:.15,ip:.08}};
h.setRootPose({quaternion:q,position:[.03,-.143,.141]}); h.setFingerPose(pose);
const contacts={};for(const f of ['index','middle','ring','pinky']){const p=h.getPad(f).position;p.y=-.079;contacts[f]={position:p.toArray(),normal:[0,-1,0]};}
h.solveGrip(contacts,{iterations:100,tolerance:.0002,normalWeight:.002});
const result={wrist:{position:h.root.position.toArray(),quaternion:q.toArray()},pose:h.getPose(),...contacts};console.log(JSON.stringify({cradle:result,diagnostics:h.measureGrip(contacts)},null,2));
// Left operating hand: pad presses the plate, nails face the player. A modest
// diagonal approach continues the wrist line into the player's lower left.
const l=createBattleHandRig(template,{side:'left'});const cp={index:[.08,.20,.13],middle:[.62,.85,.52],ring:[.69,.91,.55],pinky:[.74,.99,.6],spread:{index:0,middle:0,ring:0,pinky:0},thumb:{opposition:.36,abduction:.12,mcp:.24,ip:.18}};l.setFingerPose(cp);
const pad=l.getPad('index');let cq=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI);cq.premultiply(new Quaternion().setFromUnitVectors(pad.normal.clone().applyQuaternion(cq),new Vector3(0,0,-1)));cq.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-.55));
const offset=pad.position.clone().applyQuaternion(cq).negate();
const controls={offset:offset.toArray(),quaternion:cq.toArray(),pose:cp};
writeFileSync('artifacts/battle-hands/rigging/box-grips.json',JSON.stringify({cradle:result,controls},null,2)+'\n');
