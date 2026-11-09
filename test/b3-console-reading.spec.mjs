import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {makeB3ConsoleScene} from '../src/game/b3-console-scene.js';
import {b3ConsoleLayout,b3ConsoleHit,b3ConsoleReadout} from '../src/render/b3-console-view.js';
import {createB3SpeakerDisturbance} from '../src/game/b3-speaker-disturbance.js';

function fixture(){
  const speaker=createB3SpeakerDisturbance(),actions=[],looks=[];let recording=false,stops=0,closes=0;
  speaker.step({dt:.1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:41,minimumSeconds:45});
  const scene=makeB3ConsoleScene({getState:()=>speaker.snapshot(),onFader:(c,v)=>{speaker.setFader(c,v);actions.push(['fader',c,v]);},onPower:v=>{speaker.setPower(v);actions.push(['power',v]);},onLookMode:(mode,detail)=>looks.push([mode,detail.gesture]),isRecording:()=>recording,onRecord:()=>{stops++;recording=false;},onClose:()=>closes++});
  scenes.push(scene);return{scene,speaker,actions,looks,set recording(value){recording=value;},get stops(){return stops;},get closes(){return closes;}};
}
const point=r=>({cellX:r.x+r.w/2,cellY:r.y+r.h/2});
const click=(scene,r,id=1)=>{scene.pointer({type:'pointerdown',button:0,pointerId:id,...point(r)});scene.pointer({type:'pointerup',button:0,pointerId:id,...point(r)});};

test('the passive return and studio needles expose real pre/post fader gain while power remains irrelevant',()=>{
  const f=fixture(),s=f.scene,before=b3ConsoleReadout(f.speaker.snapshot());assert.ok(before.outputMeter>0);
  s.key({key:'p'});assert.equal(f.speaker.snapshot().powerOn,false);assert.deepEqual(b3ConsoleReadout(f.speaker.snapshot()),before);
  s.key({key:'ArrowRight'});s.key({key:'ArrowRight'});s.key({key:'ArrowDown'});
  const after=b3ConsoleReadout(f.speaker.snapshot());assert.ok(Math.abs(after.sourceRatio-before.sourceRatio)<1e-9);assert.ok(after.outputRatio<before.outputRatio);
  assert.equal(after.strips[2].legend,'RETURN');assert.equal(after.strips[2].signal,after.sourceMeter);assert.equal(after.strips[1].signal,0);
  s.key({key:'End'});assert.equal(f.speaker.snapshot().phase,'sounding','the pre-fader return survives a closed channel');assert.ok(b3ConsoleReadout(f.speaker.snapshot()).outputMeter>0);
  assert.equal(f.speaker.inspectReturn(),true);assert.equal(f.speaker.disconnectReturn(),true);assert.equal(f.speaker.snapshot().phase,'silenced');assert.equal(b3ConsoleReadout(f.speaker.snapshot()).outputMeter,0);assert.equal(b3ConsoleReadout(f.speaker.snapshot()).sourceMeter,0);s.key({key:'Escape'});
});

test('large and compact desk banks keep all16channels and the physical controls independently reachable',()=>{
  for(const size of [{cols:120,rows:38},{cols:70,rows:22},{cols:20,rows:8}])for(let n=1;n<=16;n++){
    const l=b3ConsoleLayout(size,n),s=l.strips.find(s=>s.channel===n);assert.ok(s);assert.ok(s.track.h>0&&s.w>0);
    assert.equal(b3ConsoleHit(l,s.x+s.w/2,s.track.y+s.track.h/2).channel,n);
    for(const kind of ['power','look','close','inspect'])assert.equal(b3ConsoleHit(l,...Object.values(point(l[kind]))).kind,kind);
  }
  const wide=b3ConsoleLayout({cols:120,rows:38},3);assert.equal(wide.visible,8);assert.ok(wide.worldVisibleToY>=38*.54,'the live room retains the upper screen');
  assert.equal(b3ConsoleLayout({cols:70,rows:22},3).visible,4);assert.equal(b3ConsoleLayout({cols:20,rows:8},3).visible,2);
});

test('taking hands off grants only real look, leaves the room running and suppresses fader input',()=>{
  const f=fixture(),s=f.scene;assert.equal(s.allowsLook,false);assert.equal(s.blocksWorld,false);
  s.key({key:'Tab',isTrusted:true,preventDefault(){}});assert.equal(s.allowsLook,true);assert.equal(scenes.allowsLook(),true);assert.deepEqual(f.looks,[[true,true]]);
  const before=f.speaker.snapshot();for(const key of ['ArrowDown','ArrowRight','Home','End','p'])s.key({key});assert.deepEqual(f.speaker.snapshot(),before);
  f.recording=true;s.key({key:'r',code:'KeyR'});assert.equal(f.stops,1);s.key({key:'r',code:'KeyR'});assert.equal(f.stops,1);
  s.key({key:'Tab',repeat:true});assert.equal(s.allowsLook,true);s.key({key:'Tab',metaKey:true});assert.equal(s.allowsLook,true);
  s.key({key:'Tab'});assert.equal(s.allowsLook,false);assert.deepEqual(f.looks,[[true,true],[false,false]]);s.key({key:'Escape'});
});

test('pointer buttons commit only a matching release, and a LOOK activation cannot cancel itself',()=>{
  const f=fixture(),s=f.scene,p=s.view().layout.power;
  s.pointer({type:'pointerdown',button:0,pointerId:3,...point(p)});assert.equal(f.actions.length,0);
  s.pointer({type:'pointerup',button:0,pointerId:4,...point(p)});assert.equal(f.actions.length,0);
  s.pointer({type:'pointerdown',button:0,pointerId:3,...point(p)});s.blur();s.pointer({type:'pointerup',button:0,pointerId:3,...point(p)});assert.equal(f.actions.length,0);
  click(s,p);assert.equal(f.speaker.snapshot().powerOn,false);
  const look=s.view().layout.look;click(s,look);assert.equal(s.allowsLook,true);assert.equal(f.looks.length,1);
  s.pointer({type:'pointerup',button:0,pointerId:1,...point(look)});assert.equal(s.allowsLook,true);
  s.pointer({type:'pointerdown',button:2,pointerId:1,cellX:1,cellY:1});assert.equal(s.allowsLook,true);
  s.pointer({type:'pointerdown',button:0,pointerId:1,cellX:1,cellY:1});assert.equal(s.allowsLook,false);assert.equal(f.looks.length,2);s.key({key:'Escape'});
});

test('a fresh glance cancels a held slider; controller power, glance, return and exit all release ownership once',()=>{
  const f=fixture(),s=f.scene,t=s.view().layout.strips[0];
  s.pointer({type:'pointerdown',button:0,pointerId:6,cellX:t.x+t.w/2,cellY:t.track.y});
  s.key({controllerAction:'tabNext'});const before=f.actions.length;assert.equal(s.view().dragging,false);
  s.pointer({type:'pointermove',pointerId:6,cellX:t.x+t.w/2,cellY:t.track.y+t.track.h});assert.equal(f.actions.length,before);
  s.key({controllerAction:'confirm'});assert.equal(s.allowsLook,false);
  s.key({controllerAction:'move_left'});assert.equal(s.view().focus,'power');s.key({controllerAction:'confirm'});assert.equal(f.speaker.snapshot().powerOn,false);
  s.key({controllerAction:'tabPrev'});assert.equal(s.allowsLook,true);s.key({controllerAction:'back'});assert.equal(f.closes,1);assert.equal(f.looks.at(-1)[0],false);assert.equal(scenes.has('b3-console'),false);
  s.exit();assert.equal(f.closes,1,'late stack cleanup cannot duplicate close');
});
