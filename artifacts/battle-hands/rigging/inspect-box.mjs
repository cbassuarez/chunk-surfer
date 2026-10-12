import {readFileSync} from 'node:fs';
import {Vector3,Quaternion,Euler} from 'three';
import {createBattleHandRig,parseBattleHandTemplate} from '../../../src/render/battle-hand-rig.js';
const b=readFileSync('public/assets/battle-hands/right.glb');const t=await parseBattleHandTemplate(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const h=createBattleHandRig(t);h.setRootPose({rotation:[-1.35,0,-.14],position:[.03,-.122,.15]});
h.setFingerPose({index:[.08,.10,.065],middle:[.06,.10,.065],ring:[.06,.1,.065],pinky:[.07,.1,.065],spread:{index:0,middle:0,ring:0,pinky:0},thumb:{opposition:.25,abduction:.2,mcp:.15,ip:.08}});
for(const f of ['index','middle','ring','pinky','thumb']) console.log(f,h.getPad(f).position.toArray(),h.getPad(f).normal.toArray());
console.log('wrist',h.root.quaternion.toArray());
const cfg=JSON.parse(readFileSync('artifacts/battle-hands/rigging/box-grips.json','utf8')).cradle;
h.setRootPose(cfg.wrist);h.setFingerPose(cfg.pose);
for(const pos of [[.072,-.065,.03],[.075,-.078,.032],[.065,-.08,.03]]){h.setFingerPose(cfg.pose);console.log('thumb target',pos,h.solveGrip({thumb:{position:pos,normal:[0,0,1]}},{iterations:150,tolerance:.0005,normalWeight:.004}),h.getPose().thumb);}
