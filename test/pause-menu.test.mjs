import test from 'node:test';
import assert from 'node:assert/strict';
import { makePauseScene, shouldOpenPauseForEvent } from '../src/game/pause.js';
import * as scenes from '../src/game/scenes.js';

test('pause is a run hold surface, not a duplicate settings menu', () => {
  const scene=makePauseScene({status:()=>({area:'STUDIO B3',takes:2,light:true,hush:'TRACKING',time:'00:12:34'})});
  const view=scene.view();
  assert.deepEqual(view.items,[
    'resume','objectives','archive','settings','restart','title','quit',
  ]);
  assert.equal(view.items.includes('audio'),false);
  assert.equal(view.items.includes('controls'),false);
  assert.deepEqual(view.status,{area:'STUDIO B3',takes:2,light:true,hush:'TRACKING',time:'00:12:34'});
});

test('escape resumes directly from pause', () => {
  let resumed=0;
  const scene=makePauseScene({onResume:()=>{resumed++;}});
  scene.key({key:'Escape',preventDefault(){}});
  assert.equal(resumed,1);
});

test('bag owns Escape before the run-level pause route', () => {
  assert.equal(shouldOpenPauseForEvent({storyMode:true,key:'Escape',topSceneId:'bag'}),false);
  assert.equal(shouldOpenPauseForEvent({storyMode:true,code:'Escape',topSceneId:'bag'}),false);
  assert.equal(shouldOpenPauseForEvent({storyMode:true,key:'Escape',topSceneId:'cold-open'}),true);
  assert.equal(shouldOpenPauseForEvent({storyMode:false,key:'Escape',topSceneId:'bag'}),false);
});

test('the bag closes with Escape or B, including from confirmation', async () => {
  const previousDocument=globalThis.document;
  globalThis.document={
    baseURI:'http://localhost/',
    body:{classList:{add(){},remove(){}}},
  };
  try {
    const {makeBagScene}=await import('../src/game/bag.js');
    const equipment=[{id:'radio',label:'radio',action(){}}];
    const job={rooms:[],unfiled:[],done:0,total:5};

    let closed=0;
    const escapeBag=makeBagScene({equipment,job,onClose:()=>{closed++;}});
    scenes.replace(escapeBag);
    escapeBag.key({key:'Enter',code:'Enter'});
    assert.equal(escapeBag.debugState().nav.mode,'confirm');
    escapeBag.key({key:'Escape',code:'Escape'});
    assert.equal(scenes.top(),null);
    assert.equal(closed,1);

    const toggleBag=makeBagScene({equipment,job,onClose:()=>{closed++;}});
    scenes.push(toggleBag);
    toggleBag.key({key:'b',code:'KeyB'});
    assert.equal(scenes.top(),null);
    assert.equal(closed,2);
  } finally {
    scenes.replace({id:'cleanup'});
    globalThis.document=previousDocument;
  }
});

test('pause freezes authored scene clocks beneath its overlay', () => {
  let underneath = 0;
  let overlay = 0;
  scenes.replace({ id: 'cold-open', update: (dt) => { underneath += dt; } });
  scenes.push({ id: 'pause', update: (dt) => { overlay += dt; } });
  scenes.update(1);
  assert.equal(underneath, 0);
  assert.equal(overlay, 1);
  scenes.replace({ id: 'cleanup' });
});

test('scene updates remain stable when a scene removes itself', () => {
  const updates = [];
  let first;
  scenes.replace(first = {
    id: 'first',
    update: () => {
      updates.push('first');
      scenes.remove(first);
    },
  });
  scenes.push({ id: 'second', update: () => updates.push('second') });

  scenes.update(1);
  assert.deepEqual(updates, ['first', 'second']);
  scenes.replace({ id: 'cleanup' });
});

test('scene replacement applies only the final look profile', () => {
  const profiles = [];
  scenes.scenesInit({ applyLookProfile: (profile) => profiles.push(profile) });
  scenes.replace({ id: 'old', lookProfile: 'battle' });
  profiles.length = 0;

  scenes.replace({ id: 'new', lookProfile: 'calm' });
  assert.deepEqual(profiles, ['calm']);
  scenes.replace({ id: 'cleanup' });
});
