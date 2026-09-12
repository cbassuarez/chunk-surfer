import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAcquired, mapAvailable } from '../src/game/map-ownership.js';
import { resolveBagOwnership } from '../src/game/bag-items.js';
import { buildBagModel } from '../src/game/bag-model.js';

test('new van runs acquire the Survey Indicator independently in either pickup order',()=>{
  const flags={'van.preparation.v1':true};
  assert.equal(mapAcquired(flags),false);
  assert.equal(mapAcquired({...flags,'bag.taken':true}),false);
  assert.equal(mapAcquired({...flags,'map.taken':true}),true);
  assert.equal(mapAcquired({...flags,'bag.taken':true,'map.taken':true}),true);
  assert.equal(mapAcquired(null),false);
});

test('legacy cases keep their issued plan while new partial unpacking survives save round trips',()=>{
  assert.equal(mapAcquired({'bag.taken':true}),true);
  assert.equal(mapAcquired({}),false);
  for(const flags of [
    {'bag.taken':true},
    {'van.preparation.v1':true,'bag.taken':true},
    {'van.preparation.v1':true,'map.taken':true},
  ])assert.equal(mapAcquired(JSON.parse(JSON.stringify(flags))),mapAcquired(flags));
});

test('runtime loss hides only an acquired instrument and stale saved loss cannot strand it',()=>{
  const flags={'van.preparation.v1':true,'map.taken':true,'lost.map':true};
  assert.equal(mapAvailable(flags),true,'historic loss flags have no recovery authority');
  assert.equal(mapAvailable(flags,true),false);
  assert.equal(mapAvailable(flags,false),true,'runtime recovery immediately restores it');
  assert.equal(mapAvailable({'van.preparation.v1':true},false),false);
});

test('the case lists only the explicitly collected map without changing other starter gear',()=>{
  const flags={'van.preparation.v1':true,'bag.taken':true};
  assert.deepEqual(resolveBagOwnership({bagTaken:true,flags}).kit,['light','recorder','radio']);
  assert.deepEqual(resolveBagOwnership({bagTaken:true,flags:{...flags,'map.taken':true}}).kit,['light','recorder','map','radio']);
  assert.deepEqual(resolveBagOwnership({bagTaken:true}).kit,['light','recorder','map','radio'],'legacy caller compatibility');
  assert.ok(!resolveBagOwnership({bagTaken:true,mapOwned:false}).kit.includes('map'));
  assert.deepEqual(resolveBagOwnership({bagTaken:false,flags:{'map.taken':true}}).kit,[],'having a device does not fabricate a bag');
});

test('an offline Survey Indicator explains its absence and cannot expose orphan waypoint actions',()=>{
  const job={rooms:[{id:'main_b3',label:'Studio B3'}],total:1,done:0};
  const model=buildBagModel({job,mapUnavailableReason:'Take the SI–1 from the van shelf.'});
  assert.equal(model.map,null);
  assert.equal(model.sections.find(section=>section.id==='map').entries.length,0);
  assert.match(model.mapUnavailableReason,/van shelf/);
  assert.equal(model.job.rooms.length,1,'the work order remains available independently of navigation');
});
