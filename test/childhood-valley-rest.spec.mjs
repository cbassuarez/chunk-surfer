import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import { makeSourceRestConversationScene } from '../src/game/source-rest-conversation-scene.js';
import { normalizeEndingCutsceneCheckpoint } from '../src/game/save.js';
import { stationRealmCanOccupy, stationRealmFloor } from '../src/game/station-realms.js';
import {
  HOME_VALLEY_REST_END_SECONDS, HOME_VALLEY_REST_LOCI, HOME_VALLEY_REST_SITE,
  chooseHomeValleyRestLocus, homeValleyRestFocus, homeValleyRestFrame, homeValleyRestStory,
} from '../src/game/childhood-valley-rest.js';

test.afterEach(() => scenes.clear());

test('one visit draws one location and never redraws a saved locus', () => {
  for (const [index, locus] of HOME_VALLEY_REST_LOCI.entries()) {
    assert.equal(chooseHomeValleyRestLocus(null, () => (index + .5) / 3), locus);
    assert.equal(chooseHomeValleyRestLocus(locus, () => assert.fail('redrew')), locus);
  }
});

test('lookout bench focus shares supported terrain and requires a directed approach', () => {
  const x = -78.1, z = 131.6, floorY = stationRealmFloor(5, x, z);
  assert.equal(stationRealmCanOccupy(5, x, z, floorY), true);
  const realm = { stage: 'inside', home: { eligible: true }, eyeHeight: 1.62,
    pose: { x, z, floorY, yaw: 0, pitch: -.55 } };
  assert.equal(homeValleyRestFocus(realm)?.id, 'lookout-seat-plank');
  assert.equal(homeValleyRestFocus({ ...realm, pose: { ...realm.pose, yaw: Math.PI } }), null);
  assert.equal(homeValleyRestFocus({ ...realm, homeState: { recognized: true } }), null);
  const seated = homeValleyRestFrame(realm, 'bench', 1);
  assert.ok(seated.eyeHeight < realm.eyeHeight);
  assert.ok(seated.pose.z > realm.pose.z);
  const dying = homeValleyRestFrame(realm, 'bench', 1, HOME_VALLEY_REST_END_SECONDS);
  assert.equal(dying.darkness, 1);
  assert.equal(dying.commit, 1);
  assert.ok(dying.eyeHeight < seated.eyeHeight);
  assert.equal(homeValleyRestFrame(realm, 'bench', 1, HOME_VALLEY_REST_END_SECONDS, true).eyeHeight,
    seated.eyeHeight);
});

function advanceLines(scene) {
  for (let attempt = 0; attempt < 18 && !scene.view().pending; attempt++) {
    scenes.update(1);
    scenes.key({ key: 'Enter' });
    scenes.keyup({ key: 'Enter' });
  }
  assert.equal(scene.view().pending?.kind, 'branch');
}

function reply(scene, suffix) {
  const index = scene.view().pending.options.findIndex(choice => choice.contentId.endsWith(suffix));
  assert.ok(index >= 0, suffix);
  scenes.key({ key: String(index + 1) });
}

test('each physical locus reaches the same explicit ending or can still be left', () => {
  for (const locus of HOME_VALLEY_REST_LOCI) {
    for (const action of ['leave', 'commit']) {
      const receipts = [];
      const scene = makeSourceRestConversationScene({ story: homeValleyRestStory(locus),
        onDone: outcome => receipts.push(outcome) });
      scenes.push(scene);
      advanceLines(scene);
      assert.deepEqual(receipts, []);
      reply(scene, ':stay');
      advanceLines(scene);
      assert.equal(scene.view().nodeId, 'warning');
      assert.match(scene.view().pending.options[0].text, /get up/i);
      assert.match(scene.view().pending.options[1].text, /die.*end this run/i);
      reply(scene, action === 'commit' ? ':remain' : ':rise');
      assert.deepEqual(receipts, [action]);
      assert.equal(scenes.top(), null);
    }
  }
});

test('the fatal choice survives checkpoint normalization only at a valid valley location', () => {
  const common = { schema: 1, endingId: 'contact-lost', arrival: 'rested', variant: 'source-rest' };
  for (const restLocus of HOME_VALLEY_REST_LOCI) {
    const checkpoint = { ...common, restSite: HOME_VALLEY_REST_SITE, restLocus };
    assert.deepEqual(normalizeEndingCutsceneCheckpoint(JSON.parse(JSON.stringify(checkpoint))), checkpoint);
  }
  assert.equal(normalizeEndingCutsceneCheckpoint({ ...common, restSite: HOME_VALLEY_REST_SITE }), null);
  assert.equal(normalizeEndingCutsceneCheckpoint({ ...common, restSite: 'elsewhere', restLocus: 'bench' }), null);
  assert.equal(normalizeEndingCutsceneCheckpoint({ ...common, restSite: HOME_VALLEY_REST_SITE,
    restLocus: 'bench', restLock: { runId: 'abc', seatId: 'source-rest-ii' } }), null);
});
