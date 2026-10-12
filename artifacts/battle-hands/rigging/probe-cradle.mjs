import{readFileSync}from'node:fs';import{createBattleHandRig,parseBattleHandTemplate}from'../../../src/render/battle-hand-rig.js';
const b=readFileSync('public/assets/battle-hands/right.glb'),t=await parseBattleHandTemplate(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));const h=createBattleHandRig(t);
h.setRootPose({rotation:[-1.35,0,-.14],position:[.03,-.143,.08]});h.setFingerPose({index:[.4,.7,.4],middle:[.4,.7,.4],ring:[.4,.7,.4],pinky:[.4,.7,.4],spread:{index:0,middle:0,ring:0,pinky:0},thumb:{opposition:.4,abduction:.2,mcp:.15,ip:.08}});
for(const f of ['index','middle','ring','pinky','thumb'])console.log(f,h.getPad(f).position.toArray(),h.getPad(f).normal.toArray());
const contacts={};for(const f of ['index','middle','ring','pinky']){const p=h.getPad(f).position;p.z=-.0255;contacts[f]={position:p.toArray(),normal:[0,0,-1]};}contacts.thumb={position:[.076,-.061,.030],normal:[0,0,1]};
console.log(h.solveGrip(contacts,{iterations:150,tolerance:.0004,normalWeight:.006}));console.log(JSON.stringify({wrist:{position:h.root.position.toArray(),quaternion:h.root.quaternion.toArray()},pose:h.getPose(),...contacts}));
