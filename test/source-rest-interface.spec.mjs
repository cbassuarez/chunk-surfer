import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestInterfaceFrame,sourceRestInterfacePresentation,sourceRestInterfaceText,sourceRestInterfaceMachine,sourceRestInterfaceView} from '../src/game/source-rest-interface.js';
import {sourceRestSubtitleLayout} from '../src/render/source-rest-subtitle.js';

test('actual fields fail early in multiple stages without invented telemetry or a late clean rally',()=>{
  assert.deepEqual([0,.20,.27,.36,.46,.58,.75,.96].map(p=>sourceRestInterfacePresentation(p).stage),[0,1,2,3,4,5,6,7]);
  assert.equal(sourceRestInterfacePresentation(.08,{afterInterruption:true}).stage,1);
  assert.equal(sourceRestInterfacePresentation(.20,{minimumStage:4}).stage,4);
  assert.equal(sourceRestInterfacePresentation(.20,{affliction:{pain:1,facultyLoss:1}}).stage,1,'a brief hit cannot invent reversible chronology');
  for(const p of [0,.2,.5,.85,.96])assert.deepEqual(sourceRestInterfaceFrame(p),[]);
  assert.equal(sourceRestInterfaceText('name-other','HERE',.20),'HEAR');
  assert.notEqual(sourceRestInterfaceText('counter','03:28',.27),'03:28');
  assert.equal(sourceRestInterfaceText('header','FL–3',.75).trim(),'');
  assert.equal(sourceRestInterfaceText('status','◆ TRACE',.96).trim(),'');
});

test('the real recorder and trace display fail while measurements, equipment and route state remain authoritative',()=>{
  const machine={recording:false,playing:false,progress:.42,note:'The return is below.',trace:true,
    signal:{available:true,db:-21,strength:.56,direction:'AHEAD',label:'SIGNAL · AHEAD'},
    face:{lamp:{text:'◆ TRACE',role:'ui-blue'},counter:'03:28',counterLabel:'TAPE POSITION',counterTotal:'-02:30',
      meterLabel:'SIGNAL · AHEAD',meter:{db:-21},progress:.42,locationSeconds:240,locationMarks:[{at:.5,id:'door'}]},
    controls:[{id:'stop',enabled:true}],takes:[{roomId:'B3',usable:true}]},original=structuredClone(machine),shown=sourceRestInterfaceMachine(machine,.46);
  for(const key of ['counter','counterLabel','counterTotal','meterLabel'])assert.notEqual(shown.face[key],machine.face[key]);
  assert.notEqual(shown.face.lamp.text,machine.face.lamp.text);assert.notEqual(shown.note,machine.note);assert.notEqual(shown.signal.label,machine.signal.label);
  for(const key of ['db','strength','available','direction'])assert.equal(shown.signal[key],machine.signal[key]);
  for(const key of ['meter','progress','locationSeconds','locationMarks'])assert.deepEqual(shown.face[key],machine.face[key]);
  assert.deepEqual(shown.controls,machine.controls);assert.deepEqual(shown.takes,machine.takes);assert.deepEqual(machine,original);
  assert.equal(sourceRestInterfaceMachine(machine,.1),machine);
});

test('speaker authority erodes while choices, delayed selected words and functional controls retain their identities',()=>{
  const choice={text:'Stay here.',contentId:'rest:stay',goto:'still',restAction:'commit'},raw={who:'unknown',line:{text:'Listen.',sourceId:'line'},
    history:[{who:'me',text:'I can hear it.'}],pending:{kind:'branch',index:0,options:[choice]},
    restQueuedReply:{text:'I can hear it.',contentId:'reply'},restCanLeave:true},original=structuredClone(raw),
    legacy={...raw,pending:{...raw.pending,options:[{...choice,text:'Stay here·'}]},presentationPrompt:'S E L E C T'},
    shown=sourceRestInterfaceView(legacy,.46,{originalView:raw});
  assert.notEqual(shown.line.sourceLabel,'HERE');assert.notEqual(shown.history[0].sourceLabel,'YOU');
  assert.deepEqual(shown.pending,raw.pending);assert.deepEqual(shown.restQueuedReply,raw.restQueuedReply);
  assert.equal(shown.line.text,raw.line.text);assert.equal(shown.restCanLeave,true);assert.equal(shown.presentationPrompt,undefined);
  for(const role of ['choice','response','confirmation','control','navigation','binding','warning'])
    assert.equal(sourceRestInterfaceText(role,'[E] GET UP / [ESC] PAUSE',.96),'[E] GET UP / [ESC] PAUSE');
  assert.deepEqual(raw,original);
});

test('reduced presentation effects preserve original field values',()=>{
  for(const field of ['header','counter','status','name-other'])assert.equal(sourceRestInterfaceText(field,'ORIGINAL',.9,{effects:false}),'ORIGINAL');
});

test('deliberately erased fields cannot resurrect clean production fallbacks',()=>{
  const raw={who:'unknown',line:{text:'Listen.'},typed:7},shown=sourceRestInterfaceView(raw,.94),layout=sourceRestSubtitleLayout(shown);
  assert.ok(layout.label);assert.equal(layout.label.trim(),'');
  const machine=sourceRestInterfaceMachine({note:'The return.',face:{counterLabel:'TAPE POSITION',meterLabel:'SIGNAL',counter:'03:28'}},.94);
  assert.equal((machine.face.counterLabel||'TIME COUNTER').trim(),'');
  assert.equal((machine.face.meterLabel||'OUTPUT LEVEL').trim(),'');
  assert.equal((machine.note||'RECORD / MONITOR').trim(),'');
});
