import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestInstrumentFrame,drawSourceRestInstrument} from '../src/render/source-rest-instrument.js';
import {sourceRestInterfaceMachine,sourceRestInterfacePresentation} from '../src/game/source-rest-interface.js';
import {liveTakePanelRect,TRANSPORT} from '../src/render/recorder-view.js';
const machine={trace:true,progress:0,note:'There is no signal here.',face:{lamp:{text:'◆ TRACE',role:'ui-blue'},counter:'--:--',counterLabel:'TAPE POSITION',
  counterTotal:'',meterLabel:'NO SIGNAL',meter:{db:-96},locationSeconds:60,locationMarks:[]}},
  conversation={restSubtitle:true,who:'unknown',line:{text:'Listen to the next sound.'},typed:25,history:[],restCanLeave:true};

test('the existing lowered chassis fits wholly above the exact production subtitle area',()=>{
  for(const [cols,rows]of[[151,45],[190,54],[240,72]]){
    const presentation=sourceRestInterfacePresentation(.26),input={machine:sourceRestInterfaceMachine(machine,.26),presentation,conversationView:conversation,cols,rows},
      frame=sourceRestInstrumentFrame(input);
    assert.ok(frame,`${cols}×${rows} has room for the two existing surfaces`);
    assert.deepEqual(frame.rect,liveTakePanelRect({cols,rows,progress:0,clearBottom:frame.clearBottom}));
    assert.ok(frame.rect.y+frame.rect.h<=frame.subtitleTop-.5);assert.ok(frame.rect.x+frame.rect.w<=cols);
    assert.equal(frame.view.mode,TRANSPORT.TRACE);assert.equal(frame.view.counter,frame.view.sourceRestFieldStory.counter);
    assert.equal(frame.view.meter,input.machine.face.meter);assert.equal(frame.view.note,frame.view.sourceRestFieldStory.note);
  }
});

test('real choices reserve their actual height and win rather than shrinking the device or moving dialogue',()=>{
  const input={machine,presentation:sourceRestInterfacePresentation(.26),conversationView:conversation,cols:151,rows:45},plain=sourceRestInstrumentFrame(input),
    pending={...conversation,pending:{kind:'branch',index:0,options:Array.from({length:6},(_,i)=>({text:`A complete response with enough words to wrap ${i}.`,contentId:`choice-${i}`}))}};
  const chosen=sourceRestInstrumentFrame({...input,conversationView:pending});
  assert.ok(plain);assert.equal(chosen,null,'the authored choices consume the available vertical room');
  assert.equal(sourceRestInstrumentFrame({...input,cols:80,rows:26}),null,'narrow view keeps dialogue without another layout');
  assert.equal(sourceRestInstrumentFrame({...input,conversationView:{...conversation,restBlack:true}}),null);
  assert.equal(sourceRestInstrumentFrame({...input,presentation:sourceRestInterfacePresentation(.75)}),null);
  assert.equal(sourceRestInstrumentFrame({...input,transitionProgress:0}),null);
});

test('the submitted surface is the same real face with read-only keys and no invented time or callbacks',()=>{
  const original=structuredClone(machine),input={machine,presentation:sourceRestInterfacePresentation(0),transitionProgress:.7,conversationView:conversation,cols:190,rows:54},calls=[];
  assert.equal(drawSourceRestInstrument(input,{drawFace:view=>calls.push(view),withAlpha:(alpha,draw)=>{assert.equal(alpha,.7);draw();}}),true);
  assert.equal(calls.length,1);const face=calls[0];
  assert.equal(face.counter,'--:--');assert.equal(face.lamp.text,'◆ TRACE');assert.equal(face.meterLabel,'NO SIGNAL');assert.equal(face.spin,0);
  assert.deepEqual(face.buttons.keys.map(key=>key.label),['REC','STOP','TAKES']);assert.ok(face.buttons.keys.every(key=>key.enabled===false&&!key.lit));
  assert.ok(!Object.keys(face).some(key=>/^on[A-Z]/.test(key)));assert.deepEqual(machine,original);
  assert.equal(drawSourceRestInstrument({...input,presentation:sourceRestInterfacePresentation(.75)},{drawFace:()=>assert.fail('eroded device must not draw')}),false);
});
