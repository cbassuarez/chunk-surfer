import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestSubtitleLayout} from '../src/render/source-rest-subtitle.js';
import {sourceRestVisionFrame} from '../src/game/source-rest-vision.js';

test('long utterances retain their opening and ending at supported widths',()=>{
  const text='I wanted the line to keep going after the sound had left the bar, and I kept going back to hear how the next note answered it.';
  for(const cols of [40,60,86,120]){
    const l=sourceRestSubtitleLayout({line:{text},typed:text.length,who:'me'},{cols,rows:30});
    assert.equal(l.body.join(' '),text);assert.ok(l.x+l.width<=cols);assert.ok(l.y+l.height<=30);
  }
});
test('the final exchange carries only its words on black',()=>{
  const l=sourceRestSubtitleLayout({line:{text:'Listen.'},typed:7,restBlack:true,who:'unknown'});
  assert.equal(l.label,'');assert.deepEqual(l.body,['Listen.']);
});
test('an empty musical gate and a queued reply show nothing until a line is actually presented',()=>{
  const l=sourceRestSubtitleLayout({restQueuedReply:{text:'Let me hear it.'},typed:0,who:'unknown'});
  assert.equal(l.empty,true);assert.equal(l.label,'');assert.deepEqual(l.body,[]);assert.equal(l.height,0);
  const actual=sourceRestSubtitleLayout({line:{text:'Let me hear it.'},typed:15,who:'me'});
  assert.equal(actual.empty,false);assert.equal(actual.body.join(' '),'Let me hear it.');
});
test('vision narrows, recovers briefly, then reaches complete black without pulses',()=>{
  assert.equal(sourceRestVisionFrame(.3).black,0);
  assert.ok(sourceRestVisionFrame(.79).periphery>sourceRestVisionFrame(.85).periphery);
  assert.equal(sourceRestVisionFrame(.96).black,1);
  assert.equal(sourceRestVisionFrame(.85,{reducedMotion:true}).rally,0);
});
