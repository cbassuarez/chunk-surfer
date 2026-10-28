import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SOURCE_CONTINUATION as C} from '../src/data/source-continuation.js';
import {weightPassesFrameGeometry,createWeightPassesFrames,captureRoomMediaFrames} from '../src/render/window-media-owned-frames.js';

function drawingDocument(){
  const canvases=[];
  const documentApi={createElement(tag){
    assert.equal(tag,'canvas');const commands=[];
    const ctx=new Proxy({commands,createLinearGradient(){return{addColorStop(){}};},fillText(){throw Error('No captions in owned media');},
      drawImage(...args){commands.push(['drawImage',...args]);}},
      {get(target,key){if(key in target)return target[key];return(...args)=>commands.push([key,...args]);},set(target,key,value){commands.push(['set',key,value]);target[key]=value;return true;}});
    const canvas={width:0,height:0,ownerDocument:documentApi,getContext(kind){assert.equal(kind,'2d');return ctx;},commands,
      toDataURL(type){assert.equal(type,'image/png');return'data:image/png;base64,'+createHash('sha256').update(JSON.stringify(commands)).digest('base64');}};
    canvases.push(canvas);return canvas;
  }};
  return{documentApi,canvases};
}

test('counterweight illustrations preserve actual drum dimensions and immutable local geometry',()=>{
  const before=JSON.stringify(C),g=weightPassesFrameGeometry(0,0);
  assert.equal(g.drum.radius,C.catch.hoist.drumRadius);assert.equal(g.drum.height,C.catch.hoist.drumHeight);
  assert.ok(g.drum.screenTop.y<g.drum.screenFoot.y);assert.equal(g.drum.screenTop.x,g.drum.screenFoot.x);
  assert.equal(g.drum.hoops.length,3);assert.ok(g.drum.hoops.every(y=>y>0&&y<g.drum.height));
  assert.throws(()=>{g.drum.foot.x=9;},TypeError);assert.throws(()=>{g.support.y=99;},TypeError);
  assert.equal(JSON.stringify(C),before);
});

test('one object departs above, crosses support, and never appears at the receiver',()=>{
  const held=weightPassesFrameGeometry(0,0),leaving=weightPassesFrameGeometry(1,0);
  assert.ok(leaving.drum.foot.x>held.support.maxX);assert.ok(leaving.drum.foot.y<held.drum.foot.y);
  assert.ok(leaving.drum.screenFoot.y>held.drum.screenFoot.y);
  assert.equal(weightPassesFrameGeometry(2,0).drum,null);
  assert.ok(weightPassesFrameGeometry(2,1).drum);
  assert.equal(weightPassesFrameGeometry(3,1).drum,null);
  for(let phase=0;phase<5;phase++)assert.equal(weightPassesFrameGeometry(phase,2).drum,null);
  assert.equal(weightPassesFrameGeometry(-1,0),null);assert.equal(weightPassesFrameGeometry(0,3),null);
});

test('Weight Passes produces five triplets and caches only the shared empty receiver',()=>{
  const f=drawingDocument(),frames=createWeightPassesFrames({documentApi:f.documentApi});
  assert.equal(frames.length,5);assert.ok(frames.every(row=>row.length===3));
  assert.equal(f.canvases.length,11,'ten above/support drawings plus one shared receiver');
  assert.ok(frames.every(row=>row[2]===frames[0][2]));
  assert.notEqual(frames[0][0],frames[1][0]);assert.notEqual(frames[0][1],frames[2][1]);
  assert.equal(frames[3][1],frames[4][1],'support emptiness persists');
  assert.throws(()=>frames[0].push('extra'),TypeError);
});

test('Room Between derives matched crops from baseline and contradiction only from current canvas',()=>{
  const f=drawingDocument(),previousCanvas={id:'before',width:1280,height:720},current={id:'after',width:1280,height:720};
  const result=captureRoomMediaFrames(current,{previousCanvas,documentApi:f.documentApi});
  assert.equal(result.snapshotFrames.length,3);assert.ok(result.contradictionFrame);
  const draws=f.canvases.map(c=>c.commands.find(command=>command[0]==='drawImage'));
  assert.ok(draws.slice(0,3).every(d=>d[1]===previousCanvas));assert.equal(draws[3][1],current);
  assert.ok(draws[0][2]<draws[1][2]&&draws[1][2]<draws[2][2]);
  assert.equal(draws[1][2],draws[3][2]);assert.equal(draws[1][3],draws[3][3]);
  for(const draw of draws)assert.ok(Math.abs(draw[4]/draw[5]-220/124)<1e-8,'a room crop must preserve architectural proportions');
  assert.notEqual(result.contradictionFrame,result.snapshotFrames[1]);
  assert.throws(()=>result.snapshotFrames[1]='bad',TypeError);
});

test('a first room sample establishes evidence without fabricating a flipped room',()=>{
  const f=drawingDocument(),canvas={width:800,height:600,ownerDocument:f.documentApi};
  const result=captureRoomMediaFrames(canvas);
  assert.equal(result.snapshotFrames.length,3);assert.equal(result.contradictionFrame,null);
  assert.equal(f.canvases.length,3);
  assert.ok(f.canvases.every(c=>!c.commands.some(cmd=>cmd[0]==='scale'||cmd[0]==='rotate')));
});

test('unavailable, tainted or failing canvases do not throw into the game',()=>{
  assert.equal(createWeightPassesFrames({documentApi:null}),null);assert.equal(captureRoomMediaFrames(null),null);
  assert.equal(captureRoomMediaFrames({width:0,height:0}),null);
  const broken={createElement(){throw Error('unavailable');}};
  assert.equal(createWeightPassesFrames({documentApi:broken}),null);
  assert.equal(captureRoomMediaFrames({width:800,height:600},{documentApi:broken}),null);
  const f=drawingDocument(),tainted={createElement(tag){const c=f.documentApi.createElement(tag);c.toDataURL=()=>{throw Error('tainted');};return c;}};
  assert.equal(captureRoomMediaFrames({width:800,height:600},{documentApi:tainted}),null);
});
