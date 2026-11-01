import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestInstrumentDecay,withSourceRestInstrumentDecay} from '../src/render/source-rest-instrument-decay.js';
import {sourceRestInstrumentFrame} from '../src/render/source-rest-instrument.js';
import {sourceRestInterfacePresentation} from '../src/game/source-rest-interface.js';
const area=(frame,{x=0,y=0,w=666,h=239})=>frame.columns.reduce((sum,p)=>sum+Math.max(0,Math.min(x+w,p.x+p.w)-Math.max(x,p.x)),0)
  *frame.rows.reduce((sum,p)=>sum+Math.max(0,Math.min(y+h,p.y+p.h)-Math.max(y,p.y)),0);

test('all actual VFD annotation lanes die by stage three while digit and gauge electrodes fragment',()=>{
  const f=sourceRestInstrumentDecay({stage:3});
  for(const rect of [{x:0,y:16,w:666,h:19},{x:0,y:112,w:666,h:39},{x:0,y:153,w:666,h:27},{x:0,y:211,w:666,h:28}])
    assert.equal(area(f,rect),0,'counter/location headers, units, START/END, RMS/MAX/dB readouts and scale labels cannot remain pristine');
  const counter={x:20,y:42,w:270,h:70},bar={x:65,y:181,w:580,h:29};
  assert.ok(area(f,counter)>0&&area(f,counter)<counter.w*counter.h*.45);
  assert.ok(area(f,bar)>0&&area(f,bar)<bar.w*bar.h*.45);
  const late=sourceRestInstrumentDecay({stage:5});assert.ok(late.coverage<.025,'the same glass is almost electrically dead by stage five');
});

test('scan-bank failure is deterministic, only loses light across stages and never alters readings',()=>{
  let previous=1;
  for(let stage=0;stage<=7;stage++){
    const frame=sourceRestInstrumentDecay({stage});assert.ok(frame.coverage<=previous);previous=frame.coverage;
    assert.deepEqual(frame,sourceRestInstrumentDecay({stage}));
  }
  assert.equal(sourceRestInstrumentDecay(null).active,false);
  assert.equal(sourceRestInstrumentDecay({stage:0}).coverage,1);
  const source={trace:true,face:{counter:'--:--',meter:{db:-96},locationSeconds:60}},original=structuredClone(source),
    frame=sourceRestInstrumentFrame({machine:source,presentation:sourceRestInterfacePresentation(.36),cols:190,rows:54});
  assert.equal(frame.view.sourceRestPresentation.stage,3);assert.equal(frame.view.meter,source.face.meter);assert.equal(frame.view.counter,'88:88','the display may now lie while source readings stay untouched');
  assert.deepEqual(source,original);
});

test('the optional clip affects only the readout draw and restores the canvas before physical chassis or keys',()=>{
  const calls=[],ctx={save:()=>calls.push('save'),restore:()=>calls.push('restore'),beginPath:()=>calls.push('begin'),rect:()=>calls.push('rect'),clip:()=>calls.push('clip')},rect={x:35,y:76,w:666,h:239};
  withSourceRestInstrumentDecay(ctx,rect,{stage:3},()=>calls.push('electrodes'));calls.push('physical-ink-and-keys');
  assert.equal(calls.filter(x=>x==='clip').length,2);assert.deepEqual(calls.slice(-3),['electrodes','restore','physical-ink-and-keys']);
  calls.length=0;withSourceRestInstrumentDecay(ctx,rect,null,()=>calls.push('ordinary-recorder'));
  assert.deepEqual(calls,['ordinary-recorder'],'ordinary recording, inventory and workbench use the unchanged draw');
});
