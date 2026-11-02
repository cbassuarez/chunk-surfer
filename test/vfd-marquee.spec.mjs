import test from 'node:test';
import assert from 'node:assert/strict';
import {vfdMarqueeFrame} from '../src/render/vfd-marquee.js';

test('short display names stay still; overflow holds the beginning, travels, then holds the complete ending',()=>{
  for(const time of[0,1,10,10000])assert.equal(vfdMarqueeFrame('CHUNK SURFER',{width:20,time}).offset,0);
  const text='ELLERY CONSERVATOIRE OF MUSIC',first=vfdMarqueeFrame(text,{width:12,time:0});
  assert.equal(first.phase,'hold-start');assert.equal(first.offset,0);assert.equal(vfdMarqueeFrame(text,{width:12,time:2.59}).offset,0);
  const moving=vfdMarqueeFrame(text,{width:12,time:4});assert.equal(moving.phase,'travel');assert.ok(moving.offset>0);
  const last=vfdMarqueeFrame(text,{width:12,time:100});assert.equal(last.phase,'hold-end');assert.equal(last.offset,last.maxOffset);
  assert.ok(last.contentWidth-last.offset<=last.windowWidth,'the last letters fit fully in the addressed window');
});

test('addressed travel steps by real phosphor-column pitch rather than subpixel interpolation',()=>{
  for(let time=0;time<20;time+=.017){
    const f=vfdMarqueeFrame('A LONG TITLE THAT EXCEEDS ITS DISPLAY',{width:18,scale:1.58,time});
    assert.ok(f.offset>=0&&f.offset<=f.maxOffset);assert.ok(Math.abs(f.offset/f.dotPitch-Math.round(f.offset/f.dotPitch))<1e-7);
  }
});

test('reduced motion is still and deterministic without deleting or abbreviating the authored text',()=>{
  const text='FIVE ROOM TONES. ONE BUILDING LISTENING.',early=vfdMarqueeFrame(text,{width:20,time:0,reducedMotion:true}),
    later=vfdMarqueeFrame(text,{width:20,time:1000,reducedMotion:true});
  assert.deepEqual(early,later);assert.equal(early.text,text);assert.equal(early.phase,'reduced');assert.equal(early.offset,0);
  assert.ok(Object.values(vfdMarqueeFrame(null,{width:NaN,time:Infinity,scale:NaN})).filter(v=>typeof v==='number').every(Number.isFinite));
});
