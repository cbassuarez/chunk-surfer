import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Vector3,OrthographicCamera,Matrix4,Quaternion,Euler} from 'three';
import {buildRadioContactModel} from '../src/render/radio-contact-model.js';
import {radioContactView,radioContactControlRects,radioContactProjectPoint,RADIO_CONTACT_LEFT_GRIP,createRadioContactHands,poseRadioContactHands,radioContactReleaseOffset,radioContactResourceBudget,warmRadioContact3D,disposeRadioContact3D,radioContact3DDiagnostics} from '../src/render/radio-contact-3d.js';
import {parseBattleHandTemplate,createBattleHandRig} from '../src/render/battle-hand-rig.js';

test('pointer targets project the actual moving control anchors with the rendered camera',()=>{
  const model=buildRadioContactModel();
  for(const [width,height]of[[736,460],[320,480],[1280,640]])for(const gap of[0,.5,1]){
    const frame={raise:.7,ptt:.6,batteryGap:gap,batteryPress:.25,channel:13,interaction:{id:'key:2',pressure:.8}};
    model.update(frame);const view=radioContactView({width,height,frame});
    model.group.position.set(...view.position);model.group.rotation.set(...view.rotation);model.group.updateMatrixWorld(true);
    const camera=new OrthographicCamera(-view.halfWidth,view.halfWidth,view.extent/2,-view.extent/2,.01,4);
    camera.position.set(0,view.cameraY,1.8);camera.lookAt(0,view.cameraY,0);camera.updateMatrixWorld(true);
    const rects=radioContactControlRects({width,height,frame,minTarget:24});
    for(const id of['ptt','channel','volume','battery']){
      if(!rects[id])continue;
      const anchor=id==='channel'?model.parts.channelKnob.position:id==='volume'?model.parts.volumeKnob.position:new Vector3(...model.controls[id].position);
      const point=anchor.clone().applyMatrix4(model.group.matrixWorld).project(camera);
      assert.ok(Math.abs(rects[id].center.x-(point.x+1)*width/2)<1e-7,`${id}:x`);
      assert.ok(Math.abs(rects[id].center.y-(1-point.y)*height/2)<1e-7,`${id}:y`);
    }
    for(const rect of Object.values(rects)){assert.ok(rect.x>=0&&rect.y>=0);assert.ok(rect.x+rect.w<=width+1e-6&&rect.y+rect.h<=height+1e-6);}
  }
  model.dispose();
});

test('knob picking is centred on visible hardware, separately from the top finger-contact point',()=>{
  const model=buildRadioContactModel(),size={width:760,height:600},frame={raise:1};
  const rects=radioContactControlRects({...size,frame});
  for(const[id,part]of[['channel',model.parts.channelKnob],['volume',model.parts.volumeKnob]]){
    const body=radioContactProjectPoint(part.position.toArray(),{...size,frame});
    const contact=radioContactProjectPoint(model.controls[id].position,{...size,frame});
    assert.ok(Math.hypot(rects[id].center.x-body.x,rects[id].center.y-body.y)<1e-8,`${id} target follows the rendered knob body`);
    assert.ok(Math.abs(rects[id].center.y-contact.y)>10,`${id} does not use the higher finger-contact anchor as its pointer centre`);
    assert.ok(body.x>=rects[id].x&&body.x<=rects[id].x+rects[id].w&&body.y>=rects[id].y&&body.y<=rects[id].y+rects[id].h,`${id} visible body is clickable`);
    assert.deepEqual(rects[id].contactPosition,model.controls[id].position,'hand contact remains unchanged');
  }
  model.dispose();
});

test('operating hands clear the chassis core through the actual approach and withdrawal poses',async()=>{
  const bytes=await readFile(new URL('../public/assets/battle-hands/recordist.glb',import.meta.url));
  const template=await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const model=buildRadioContactModel(),hands=createRadioContactHands(template,model);
  const actions=['channel','volume','confirm','back','select','previous','next','key:1','key:#','battery'];
  for(const action of actions)for(const pressure of[0,.1,.25,.5,.75,.9,.95,1]){
    const frame={raise:1,thumb:0,ptt:0,handAction:action,handPressure:pressure,batteryGap:action==='battery'?1:0,interaction:{id:action,pressure}};
    model.update(frame);poseRadioContactHands(hands,frame);model.group.updateMatrixWorld(true);
    for(const side of['left','right']){
      const hand=hands[side];hand.skin.skeleton.update();let maximum=0;
      for(let i=0;i<hand.skin.geometry.attributes.position.count;i++){
        const p=hand.skin.localToWorld(hand.skin.getVertexPosition(i,new Vector3()));
        if(p.x>-.047&&p.x<.047&&p.y>-.08&&p.y<.07&&p.z>-.021&&p.z<.021)maximum=Math.max(maximum,Math.min(p.x+.047,.047-p.x,p.y+.08,.07-p.y,p.z+.021,.021-p.z));
      }
      assert.ok(maximum<.001,`${action} ${pressure} ${side}: ${maximum*1000} mm inside solid core`);
    }
    if(pressure===1){
      const side=['previous','next'].includes(action)?'left':'right',digit=side==='left'||action==='battery'?'thumb':'index';
      assert.ok(hands[side].getPad(digit).position.distanceTo(new Vector3(...model.controls[action].position))<.0016,`${action}: physical pad reaches the moving control`);
    }
  }
  const budget=radioContactResourceBudget(model.group);
  assert.ok(budget.sourceTriangles<30000&&budget.visibleDraws<110,JSON.stringify(budget));
  hands.left.dispose();hands.right.dispose();model.dispose();
});

test('released radio drops beneath a fixed opposed cloth pinch instead of remaining glued to both palms',async()=>{
  const bytes=await readFile(new URL('../public/assets/battle-hands/recordist.glb',import.meta.url));
  const template=await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const model=buildRadioContactModel(),hands=createRadioContactHands(template,model),anchor=[.072,-.020,.015];
  const frame={release:1,raise:1,batteryGap:.75,dead:true},size={width:736,height:460};
  const offset=radioContactReleaseOffset(frame,size),target=anchor.map((v,i)=>v+offset[i]);
  model.update({...frame,strapTarget:target});poseRadioContactHands(hands,{...frame,strapTarget:target});
  assert.ok(hands.right.getPad('index').position.distanceTo(new Vector3(...target))<.0001,'index actually holds the band');
  assert.ok(hands.right.getPad('thumb').position.distanceTo(hands.right.getPad('index').position)<.0041,'opposed pads hold a four-millimetre band');
  const before=radioContactView({...size,frame:{...frame,release:0}}),after=radioContactView({...size,frame});
  const matrix=v=>new Matrix4().compose(new Vector3(...v.position),new Quaternion().setFromEuler(new Euler(...v.rotation)),new Vector3(1,1,1));
  assert.ok(new Vector3(...anchor).applyMatrix4(matrix(before)).distanceTo(new Vector3(...target).applyMatrix4(matrix(after)))<1e-8,'wrist anchor remains fixed while the set falls below it');
  assert.ok(after.position[1]<before.position[1]-.05,'the actual radio falls more than five centimetres');
  hands.left.dispose();hands.right.dispose();model.dispose();
});

test('a fake Node canvas does not launch fetches or create a radio GPU lifetime',async()=>{
  const before=radioContact3DDiagnostics().lifecycle;const oldDocument=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({})})};
  try{assert.equal(await warmRadioContact3D(),null);assert.deepEqual(radioContact3DDiagnostics().lifecycle,before);}
  finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;disposeRadioContact3D();}
});

test('controls outside the shown stage and hidden closed battery are not made into edge targets',()=>{
  assert.equal(radioContactControlRects({frame:{raise:1,batteryGap:0}}).battery,undefined);
  const low=radioContactControlRects({width:320,height:180,frame:{raise:0}});
  assert.equal(low['key:0'],undefined,'lowered unseen keypad is unavailable');
  assert.equal(radioContactControlRects({frame:{raise:1,batteryGap:1}}).ptt,undefined,'PTT on turned-away side is not interactive');
});

test('reduced motion removes raising travel while preserving physical inspection and inputs',()=>{
  const frame={raise:0,ptt:1,batteryGap:1,batteryPress:.2,reducedMotion:true},before=structuredClone(frame);
  const held=radioContactView({frame}),same=radioContactView({frame:{...frame,raise:1}});
  assert.deepEqual(held,same);assert.deepEqual(frame,before);
  const a=radioContactProjectPoint([0,0,0],{frame}),b=radioContactProjectPoint([0,.05,0],{frame});
  assert.ok(b.y<a.y,'model stays upright on ordinary screen axes');
});

test('the anatomical support grip reaches PTT and rear pads without skin inside the chassis core',async()=>{
  const bytes=await readFile(new URL('../public/assets/battle-hands/recordist.glb',import.meta.url));
  const template=await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const hand=createBattleHandRig(template,{side:'left'});hand.setRootPose(RADIO_CONTACT_LEFT_GRIP.wrist);hand.setFingerPose(RADIO_CONTACT_LEFT_GRIP.pose);
  const targets={index:[-.0354,-.0042,-.049],middle:[-.035,-.0266,-.049],ring:[-.033,-.0364,-.049],pinky:[-.0354,-.0594,-.049],thumb:[-.058,.027,.001]};
  for(const [digit,target]of Object.entries(targets))assert.ok(hand.getPad(digit).position.distanceTo(new Vector3(...target))<.0005,`${digit} pad is planted`);
  hand.root.updateMatrixWorld(true);hand.skin.skeleton.update();let coreVertices=0;
  for(let i=0;i<hand.skin.geometry.attributes.position.count;i++){
    const p=hand.skin.localToWorld(hand.skin.getVertexPosition(i,new Vector3()));
    if(p.x>-.047&&p.x<.047&&p.y>-.08&&p.y<.07&&p.z>-.021&&p.z<.021)coreVertices++;
  }
  assert.equal(coreVertices,0,'central solid core excludes the whole skinned hand, not only its fingertips');hand.dispose();
});
