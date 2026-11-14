import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playerCondition } from '../src/game/player-condition.js';
import { paintPlayerConditionFeedback, playerConditionVisualFrame } from '../src/render/player-condition-feedback.js';

const hurt={condition:playerCondition({composure:20,ceiling:35,injuries:1}),
  impact:1,settle:1,strain:15/35,wounds:1};
function canvas() {
  const calls=[],paths=[];let path=null;
  const ctx={
    save:()=>calls.push('save'),restore:()=>calls.push('restore'),
    createRadialGradient:(...geometry)=>{
      const stops=[];calls.push({gradient:geometry,stops});
      return {addColorStop:(...stop)=>stops.push(stop)};
    },
    createLinearGradient:()=>({addColorStop(){}}),
    fillRect:(...rect)=>calls.push({rect}),beginPath:()=>{path=[];paths.push(path);},
    moveTo:(...point)=>path.push(point),lineTo:(...point)=>path.push(point),
    bezierCurveTo:(...curve)=>{for(let i=0;i<curve.length;i+=2)path.push(curve.slice(i,i+2));},
    closePath(){},fill:()=>calls.push('path'),
    translate:()=>assert.fail('injury paint cannot move the camera'),
    rotate:()=>assert.fail('injury paint cannot rotate the view'),
    setTransform:()=>assert.fail('injury paint cannot change input or camera transforms'),
  };
  return {ctx,calls,paths};
}

test('effects off and an uninjured steady body leave the world image untouched', () => {
  const disabled=canvas();
  assert.equal(paintPlayerConditionFeedback(disabled.ctx,hurt,{width:1280,height:768,effects:false}).visible,false);
  assert.equal(disabled.calls.length,0);
  const steady=canvas();
  paintPlayerConditionFeedback(steady.ctx,{condition:playerCondition({composure:40,ceiling:40}),
    impact:0,settle:0,strain:0,wounds:0},{width:1280,height:768});
  assert.equal(steady.calls.length,0);
});

test('harm paints the image edges while preserving a transparent useful centre', () => {
  const width=1280,height=768,{ctx,calls,paths}=canvas();
  const view=paintPlayerConditionFeedback(ctx,hurt,{width,height});
  assert.ok(view.edge>0&&view.lower>0);
  const gradient=calls.find(call=>call.gradient);
  assert.ok(gradient.gradient[2]>=Math.min(width,height)*.2);
  assert.deepEqual(gradient.stops[0],[0,'rgba(0,0,0,0)']);
  assert.ok(paths.length>0);
  for(const path of paths)for(const [x,y] of path)
    assert.ok(y<=height*.3||y>=height*.7||x<width*.15||x>width*.85,
      'the eye response leaves the useful central view clear');
  assert.equal(calls.at(-1),'restore');
});

test('reduced motion removes the changing pinch and reduced flash reduces impact contrast', () => {
  const full=playerConditionVisualFrame(hurt),reduced=playerConditionVisualFrame(hurt,{motion:'off',flash:'off'});
  assert.equal(reduced.visible,true);assert.equal(reduced.pinch,0);
  assert.equal(reduced.blink,0);
  assert.ok(reduced.impact<full.impact&&reduced.edge<full.edge&&reduced.grain<full.grain);
  assert.equal(reduced.centerClear,full.centerClear);
  const {ctx}=canvas();
  assert.doesNotThrow(()=>paintPlayerConditionFeedback(ctx,hurt,{width:640,height:360,motion:'off',flash:'off'}));
});

test('a completely recovered injured player is not painted as currently depleted', () => {
  const {ctx,calls}=canvas();
  const view=paintPlayerConditionFeedback(ctx,{condition:playerCondition({composure:20,ceiling:20,injuries:4}),
    impact:0,settle:0,force:0,strain:0,wounds:4},{width:1280,height:768});
  assert.equal(view.edge,0);assert.equal(view.blink,0);assert.equal(calls.length,0);
});

test('the same transient has a stronger eye response for a stronger real event', () => {
  const slight=playerConditionVisualFrame({...hurt,force:.25});
  const severe=playerConditionVisualFrame({...hurt,force:.85});
  assert.ok(severe.blink>slight.blink);assert.ok(severe.edge>slight.edge);
  const steady=playerConditionVisualFrame({...hurt,impact:0,settle:0,force:0});
  assert.equal(steady.blink,0);assert.ok(steady.edge<.1);
});

test('presentation does not become a new input or resource owner', () => {
  const source=readFileSync(new URL('../src/render/player-condition-feedback.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/addEventListener|requestPointerLock|preventDefault|setComposure|\.injure\(|lookBy\(|setLook\(/);
  const before=JSON.stringify(hurt);paintPlayerConditionFeedback(canvas().ctx,hurt,{width:1280,height:768});
  assert.equal(JSON.stringify(hurt),before,'painting cannot alter the supplied resource projection');
});
