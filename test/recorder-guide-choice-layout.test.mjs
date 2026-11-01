import test from 'node:test';
import assert from 'node:assert/strict';
import {recorderGuideLayout,recorderHitRegions,TRANSPORT} from '../src/render/recorder-view.js';
import {recorderFaceLayout} from '../src/render/recorder-instrument.js';

const options=Array.from({length:8},(_,i)=>({text:`Response ${i+1}: `+'a careful answer '.repeat(i===6?14:2)}));
const guide=offset=>({pending:{kind:'branch',index:6,options},choiceScrollOffset:offset,spent:()=>false});

test('recorder guide keeps selected long response inside the VFD and pages through its text',()=>{
  for(const body of [{x:4,y:3,w:35,h:8},{x:2,y:4,w:24,h:5}]){
    const first=recorderGuideLayout(body,guide(0));
    assert.ok(first.choices.overflow);assert.ok(first.choices.selectedScroll);
    assert.ok(first.choices.selectedMaxOffset>0);
    assert.ok(first.choiceY>=body.y);
    assert.ok(first.choiceY+first.choices.rows.length*first.step<=body.y+body.h+1e-9);
    assert.ok(first.choices.rows.filter(row=>row.kind==='choice').every(row=>row.choiceIndex===6));
    const last=recorderGuideLayout(body,guide(first.choices.selectedMaxOffset));
    const expected=options[6].text.trim().split(/\s+/).at(-1);
    assert.ok(last.choices.rows.at(-1).bodyText.includes(expected),'last words are reachable');
    assert.notEqual(first.choices.rows.at(-1).bodyText,last.choices.rows.at(-1).bodyText);
  }
});

test('recorder pointer targets use the same fitted choice rows as the display',()=>{
  const rect={x:1,y:1,w:70,h:24},face=recorderFaceLayout(rect),view={rect,mode:TRANSPORT.LISTEN,guide:guide(2)};
  assert.ok(face?.transcriptRect);
  const {choices,step,choiceY}=recorderGuideLayout(face.transcriptRect,view.guide);
  const hits=recorderHitRegions(view).filter(row=>row.kind==='choice');
  assert.equal(hits.length,choices.rows.filter(row=>row.kind==='choice').length);
  for(const [i,row] of choices.rows.entries())if(row.kind==='choice'){
    assert.ok(hits.some(hit=>hit.index===row.choiceIndex&&Math.abs(hit.y-(choiceY+i*step))<1e-9));
  }
});
