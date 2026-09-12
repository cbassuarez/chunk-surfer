import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LINES, RIG_CHECK_FLAGS, RIG_CHECK_TOPICS, rigCheckNodes } from '../src/data/conservatory-script.js';

// ── [R] OUTSIDE ELLERY ───────────────────────────────────────────────────────
//
// Two presses in two places that used to do nothing. On the walk the recorder
// key cycled four lines and then repeated the last one for ever; in the loading
// bay it reached SPEECH.say(LINES.notARoom) — and LINES had no notARoom, so the
// press was a silent no-op in the one place a player is most likely to try it.
//
// Both are the same scene now, on either side of picking the case up: a hub
// about the kit.

test('the line the bay press has always reached now exists', () => {
  // Referenced by recordAction since the room gate was written. `SPEECH.say`
  // of an undefined line is not an error, which is exactly why it survived.
  assert.ok(LINES.notARoom?.text, 'notARoom is authored');
  assert.equal(LINES.notARoom.who, 'you');
});

test('each place is a hub whose spokes come back to it', () => {
  for (const place of ['walk', 'bay']) {
    const nodes = rigCheckNodes({ place });
    const hub = nodes.start;
    assert.ok(hub.choices.length >= 4, `${place} offers something`);
    assert.ok(hub.revisitLines?.length,
      `${place} does not repeat its whole greeting on the way back (conversation.js)`);

    for (const choice of hub.choices) {
      if (choice.goto === 'done') continue;
      const spoke = nodes[choice.goto];
      assert.ok(spoke, `${place}: "${choice.text}" goes somewhere`);
      // A spoke either returns to the hub or hands on to another node that does.
      const lands = spoke.goto === 'start' ? 'start' : nodes[spoke.goto]?.goto;
      assert.equal(lands, 'start', `${place}: "${choice.text}" comes back to the hub`);
      assert.ok(spoke.lines.length, `${place}: "${choice.text}" has something to say`);
    }
    // And exactly one way out.
    assert.equal(hub.choices.filter((c) => c.goto === 'done').length, 1);
  }
});

test('a question put to bed stays in bed', () => {
  // The spending is on FLAGS, not on the conversation engine's own `asked` set:
  // that set dies with the scene, and this is a bag he can come back to across
  // the whole walk. Every spoke must therefore set its topic and hide on it.
  const seen = new Set();
  for (const place of ['walk', 'bay']) {
    for (const choice of rigCheckNodes({ place }).start.choices) {
      if (choice.goto === 'done') { assert.ok(!choice.set, 'the way out spends nothing'); continue; }
      assert.equal(choice.set?.length, 1, `"${choice.text}" spends exactly one topic`);
      const flag = choice.set[0];
      assert.ok(RIG_CHECK_FLAGS.includes(flag), `${flag} is a declared topic`);
      assert.ok(RIG_CHECK_TOPICS[place].includes(flag), `${flag} belongs to ${place}`);
      assert.match(choice.if, new RegExp(`!${flag.replace('.', '\\.')}`),
        `"${choice.text}" hides once it is spent`);
      assert.ok(!seen.has(flag), `${flag} belongs to one place only`);
      seen.add(flag);
    }
  }
  // Every declared topic is actually reachable — a flag in the table with no
  // choice behind it would leave the hub permanently "open" and offering nothing.
  assert.deepEqual([...seen].sort(), [...RIG_CHECK_FLAGS].sort());
});

test('the tree cannot describe gear he is not carrying', () => {
  const bay = rigCheckNodes({ place: 'bay' });
  const gated = { 'rig.fork': 'has.fork', 'rig.bent': 'has.interface' };
  for (const choice of bay.start.choices) {
    const flag = choice.set?.[0];
    if (!gated[flag]) continue;
    assert.match(choice.if, new RegExp(gated[flag].replace('.', '\\.')),
      `${flag} is gated on owning the thing it talks about`);
  }
  // The fork spoke is the one place art is used, and it is the object itself.
  assert.equal(bay.fork.art?.id, 'tuningFork');
  // Everything ungated is kit he always has.
  const ungated = bay.start.choices.filter((c) => c.set && !gated[c.set[0]]).map((c) => c.set[0]);
  assert.deepEqual(ungated.sort(), ['rig.ears', 'rig.machine', 'rig.power', 'rig.radio', 'rig.voice']);
});

test('the walk and the bay are not the same conversation', () => {
  const walk = rigCheckNodes({ place: 'walk' }).start;
  const bay = rigCheckNodes({ place: 'bay' }).start;
  assert.notEqual(walk.lines[0].text, bay.lines[0].text);
  // On the walk the kit is in the van, so nothing on that hub claims to be
  // holding it; in the bay it is on his shoulder and the bag is open.
  assert.match(walk.lines[0].text, /van/i);
  assert.match(bay.revisitLines[0].text, /bag is still open/i);
  // The one `me` beat in the tree — said out loud, so the engine offers it as a
  // decision (conversation.js rule 2) — belongs to the bay, which is a room.
  const voice = rigCheckNodes({ place: 'bay' }).voice;
  assert.ok(voice.lines.some((l) => l.who === 'me'), 'he speaks into the bay');
  assert.ok(voice.lines.filter((l) => l.who === 'me').every((l) => l.prompt),
    'and a long line carries a prompt for the picker');
});

test('one press, before the machine, and only where there is a question left', () => {
  const main = readFileSync('src/main.js', 'utf8');
  const open = main.slice(main.indexOf('function openRecorder()'), main.indexOf('function recorderMachineState()'));
  // Hooked on the roll attempt instead, the bay needed [r] to open the A-1000
  // and then [r][enter] to reach it: three keys to have a thought.
  assert.ok(open.indexOf('tryRigCheck()') < open.indexOf("flagTest('bag.taken')"),
    'the kit comes before the machine');
  assert.match(main, /function tryRigCheck\(\)/);
  // Exterior only. Indoors, [r] off the order is still a refusal.
  assert.match(main, /RIG_EXTERIOR_ZONES=new Set\(\[ZONE\.dock,ZONE\.street,ZONE\.civicCourt,ZONE\.serviceYard\]\)/);
  // An unowned topic can never be spent, so it must not count as unspent either
  // or the hub stays open for ever and opens with nothing in it.
  assert.match(main, /RIG_TOPIC_REQUIRES=\{'rig\.fork':'has\.fork','rig\.bent':'has\.interface'\}/);
  assert.match(main, /if\(needs&&!flagTest\(needs\)\)return false;/);
  // The old cycling list survives as the tail, not as the whole beat.
  assert.match(main, /const RECORDER_BEFORE_KIT=Object\.freeze\(\[/);
});

console.log('rig check contracts passed');
