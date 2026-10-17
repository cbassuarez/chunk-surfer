import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BAG_ACTION_MODE,
  BAG_ITEM_REGISTRY,
  COLLECTED_ITEM_AUDIT,
  bagInspectionDialogue,
  bagKeyFacts,
  resolveBagItemAction,
  resolveBagOwnership,
} from '../src/game/bag-items.js';

test('Ren personal effects and reward have separate, truthful bag homes', () => {
  assert.equal(BAG_ITEM_REGISTRY['ren-home-cassette'].role, 'quest-keepsake');
  assert.equal(BAG_ITEM_REGISTRY['ren-service-key'].role, 'access');
  assert.equal(COLLECTED_ITEM_AUDIT.find(({ id }) => id === 'ren-home-cassette').destination, 'kit');
  assert.equal(COLLECTED_ITEM_AUDIT.find(({ id }) => id === 'ren-service-key').destination, 'keyring');

  const carrying = resolveBagOwnership({ bagTaken: true, renCassetteOwned: true });
  assert.ok(carrying.kit.includes('ren-home-cassette'));
  assert.equal(carrying.keyring, null);

  const returned = resolveBagOwnership({ bagTaken: true, renServiceKey: true });
  assert.ok(!returned.kit.includes('ren-home-cassette'));
  assert.equal(returned.keyring.ren, true);
  assert.equal(returned.keyring.visible, true);
  assert.deepEqual(resolveBagOwnership({ bagTaken: true, renServiceKey: true }), returned,
    'persisted state reconstructs the reward without duplicating a loose key');
});

test('the cassette permits inspection without silently playing a private message', () => {
  const action = resolveBagItemAction('ren-home-cassette');
  assert.equal(action.id, 'inspect-ren-home-cassette');
  assert.equal(action.label, 'LOOK AT TAPE');
  assert.equal(action.mode, BAG_ACTION_MODE.DIALOG);
  assert.equal(action.confirm, null);
  assert.equal(resolveBagItemAction('ren-home-cassette', { present: false }).enabled, false);

  const sealed = bagInspectionDialogue('ren-home-cassette');
  const sealedText = sealed.start.lines.map(({ text }) => text).join(' ');
  assert.match(sealedText, /asked us to keep this from you/i);
  assert.doesNotMatch(sealedText, /come (and|in for) (eat|dinner)/i);
  const listenedText = bagInspectionDialogue('ren-home-cassette', { renCassetteListened: true })
    .start.lines.map(({ text }) => text).join(' ');
  assert.match(listenedText, /called Ren in for dinner/i);
});

test('Ren’s roof access reward is visible on the aggregated keyring', () => {
  assert.deepEqual(bagKeyFacts({ ren: true }).at(-1), ['ROOF', "REN'S SERVICE KEY"]);
  assert.match(bagInspectionDialogue('keyring', { ren: true }).start.lines.at(-1).text, /Ren put this one in my hand/);
  assert.equal(resolveBagItemAction('ren-service-key').id, 'inspect-ren-service-key');
  assert.match(bagInspectionDialogue('ren-service-key').start.lines.map(({ text }) => text).join(' '), /roof service key/i);
});
