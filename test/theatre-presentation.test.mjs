import test from 'node:test';
import assert from 'node:assert/strict';
import { createTheatrePresentation } from '../src/platform/theatre-presentation.js';
import { paintTheatreHouse, theatreHouseScene } from '../src/render/theatre-house.js';
import { DISPLAY_CONTRACT, DEFAULT_DISPLAY_SETTINGS, normalizeDisplaySettings } from '../src/platform/display-policy.js';

test('two clear display choices preserve old saved IDs and default to the staged frame', () => {
  assert.deepEqual(DISPLAY_CONTRACT.displayModes.map(p => p.label), ['Staged window', 'Fill screen']);
  assert.equal(DEFAULT_DISPLAY_SETTINGS.displayMode, 'windowed');
  for (const displayMode of ['windowed', 'game-mode']) assert.equal(normalizeDisplaySettings({displayMode}).displayMode, displayMode);
});

test('the house is opaque, dark and deterministically dithered without a running clock', () => {
  let pixels;
  const ctx = {createImageData: (w,h) => ({data:new Uint8ClampedArray(w*h*4)}),putImageData: image => {pixels=image.data;}};
  paintTheatreHouse(ctx, 16, 16);
  const first = pixels.slice(), colours = new Set();
  for (let i=0;i<pixels.length;i+=4) {
    assert.equal(pixels[i+3],255); assert.ok(Math.max(...pixels.slice(i,i+3))<28);
    colours.add([...pixels.slice(i,i+3)].join(','));
  }
  assert.equal(colours.size,2);
  paintTheatreHouse(ctx,16,16); assert.deepEqual(pixels,first);
  paintTheatreHouse(ctx,16,16,{kind:'wash',intensity:.35}); assert.notDeepEqual(pixels,first);
  assert.deepEqual(theatreHouseScene({kind:'url',intensity:Infinity}),{kind:'house',frontEnd:false,intensity:.35});
});

function fixture({wait=false,fail=false}={}) {
  const calls=[],events=new Map();let resume,released=0;
  const ready=wait?new Promise(resolve=>resume=resolve):Promise.resolve();
  const api={async listen(name,handler){await ready;events.set(name,handler);return()=>{events.delete(name);released++;};},
    async invoke(name,payload){calls.push({name,payload});if(fail)throw Error('unavailable');return true;}};
  return {api,calls,events,release:()=>resume(),released:()=>released};
}
test('late connection presents only the newest scene and retirement returns house dark', async () => {
  const f=fixture({wait:true}), presentation=createTheatrePresentation({api:f.api});
  const old=presentation.scene({kind:'wash',intensity:.2}), latest=presentation.scene({kind:'house'});
  f.release();await Promise.all([old,latest]);
  assert.deepEqual(f.calls.map(c=>c.name),['chunk_theatre_set','chunk_theatre_scene']);
  assert.deepEqual(f.calls[1].payload.sceneState,{kind:'house'});
  await presentation.composition({type:'composition',native:true,plan:{purpose:'title'}});
  assert.equal(f.calls.at(-1).payload.sceneState.frontEnd,true);
  await presentation.composition({type:'restore'});
  assert.deepEqual(f.calls.at(-1).payload.sceneState,{kind:'house'});
  presentation.dispose();assert.equal(f.released(),1);
});
test('OS requests redirect through the single mode owner and late events cannot reopen a disposed surface', async () => {
  const f=fixture();let fills=0;
  const presentation=createTheatrePresentation({api:f.api,onFillRequest:()=>fills++});await presentation.start();
  const event=f.events.get('chunk-display:fullscreen-redirect');event();assert.equal(fills,1);
  presentation.dispose();event();assert.equal(fills,1);assert.equal(await presentation.scene({kind:'wash'}),false);
  const late=fixture({wait:true}), retired=createTheatrePresentation({api:late.api}), pending=retired.start();
  await Promise.resolve();retired.dispose();late.release();assert.equal(await pending,false);assert.equal(late.calls.length,0);assert.equal(late.released(),1);
});
test('a missing backdrop reports its error and releases the listener without holding the game', async () => {
  const f=fixture({fail:true}), errors=[];
  const presentation=createTheatrePresentation({api:f.api,onError:error=>errors.push(error.message)});
  assert.equal(await presentation.start(),false);assert.deepEqual(errors,['unavailable']);assert.equal(f.released(),1);
});
