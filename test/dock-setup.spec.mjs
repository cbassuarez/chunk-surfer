// The dock setup, as a contract.
//
// The setup is the one place the game teaches, and the three failures it has
// already had are all failures of nerve about saying so:
//
//   · a guided step that only whispered from a button label, so a required
//     verb read as a stray keybind the player was free to ignore;
//   · a locked surface that never admitted it was locked, and answered every
//     other press with a line of monitor text that arrived minutes later;
//   · a level check that ended and handed off to nothing.
//
// Pure modules only — the runtime wiring is walked by the browser suites.

import assert from 'node:assert/strict';

import {
  LEVEL_CHECK_SECONDS,
  loadTutorialState,
  startTutorial,
  tickTutorial,
  tutorialActive,
  tutorialGuide,
  tutorialPrompt,
  tutorialStep,
} from '../src/game/tutorial.js';
import { bagLayout } from '../src/render/bag-layout.js';
import { bagGuideRows } from '../src/render/bag-view.js';
import { clearSpeech, isSpeaking, say, speaking, updateSpeech } from '../src/game/speech.js';

// ── the steps, walked in order ──────────────────────────────────────────────
const said = [];
const base = {
  px: 0, py: 0, light: false, recording: false, takeElapsed: 0, spoiled: false,
  spoilReason: '', slow: false, workOrderRead: false, marked: null,
  rehearsed: false, leftDock: false,
};
const run = (ctx) => tickTutorial(0.1, { ...base, ...ctx });

startTutorial();
assert.equal(tutorialStep(), 'light');

// A step without a guide is a thing the room wants, not a lock.
assert.equal(tutorialGuide('bag'), null, 'the dark is not a guided surface');

run({ light: true });
assert.equal(tutorialStep(), 'read');

// ── the prompt never hides a verb he already has ────────────────────────────
// The order of the setup is his discipline, not a lock: the recorder works from
// the first step (firstTakeIntercept opens the level check whenever levels are
// unset), so a prompt naming only the bag was concealing a live key and making
// the one it did name look like the only thing the room would take.
const readPrompt = tutorialPrompt();
assert.match(readPrompt, /work order/i, 'the step still asks for the thing it wants');
assert.match(readPrompt, /levels/i, 'and admits the recorder is live');

// ── the guided steps say WHY, not just which key ────────────────────────────
const readGuide = tutorialGuide('bag');
assert.ok(readGuide, 'the work order step is guided');
assert.equal(readGuide.surface, 'bag');
assert.equal(readGuide.section, 'files');
assert.equal(readGuide.entry, 'file:work-order');
assert.equal(readGuide.step, 'read');
assert.ok(readGuide.why.length > 24, 'a guide carries a reason, not a keycap');
assert.equal(tutorialGuide('world'), null, 'a surface only ever gets its own guide');

// ── the level check comes before the waypoint ───────────────────────────────
// A bearing means nothing to a player who has not done anything yet, and
// everything to one who is about to walk into a building. So: light, the order,
// the six seconds and the daydream, and THEN write down where you are going.
run({ light: true, workOrderRead: true });
assert.equal(tutorialStep(), 'level', 'the recorder comes before the plan');
assert.equal(tutorialGuide('bag'), null, 'the level check does not happen in the bag');

// Six clean seconds sets levels. The step stays put, because the daydream comes
// out of it and the next step's line must not land on top of the drill.
run({ light: true, workOrderRead: true, recording: true, takeElapsed: LEVEL_CHECK_SECONDS });
assert.equal(tutorialStep(), 'level', 'levels good is not the end of setting up');

run({ light: true, workOrderRead: true, rehearsed: true });
assert.equal(tutorialStep(), 'mark', 'the daydream hands over to the waypoint');

// ── and the waypoint is the last thing, guided hardest ──────────────────────
const markGuide = tutorialGuide('bag');
assert.equal(markGuide.section, 'map');
assert.equal(markGuide.entry, 'room:main_b3');
assert.equal(markGuide.action, 'mark');
assert.ok(/BEARING/.test(markGuide.why), 'the mark step explains what a mark IS');
assert.ok(/FIRST/.test(markGuide.why), '...and why this room goes first');
// It is the one verb the setup has not shown, so its prompt sends them to the bag.
assert.match(tutorialPrompt(), /bag/i, 'the last step points at the case');

run({ light: true, workOrderRead: true, rehearsed: true, marked: 'main_b3' });
assert.equal(tutorialStep(), 'go', 'a marked room finishes the setup');

run({ light: true, workOrderRead: true, rehearsed: true, marked: 'main_b3', leftDock: true });
assert.equal(tutorialActive(), false, 'leaving the dock ends the setup');

// Spoiling costs nothing: the step is never failed, only unfinished.
loadTutorialState({});
startTutorial();
run({ light: true });
run({ light: true, workOrderRead: true });
run({ light: true, workOrderRead: true, recording: true, spoiled: true, spoilReason: 'you moved', takeElapsed: 9 });
assert.equal(tutorialStep(), 'level', 'a spoiled level check is still the level check');

// ── the callout is real geometry, never an overlay ──────────────────────────
const guide = { action: 'mark', title: 'MARK STUDIO B3', why: 'A MARK IS A BEARING — THE ROOM YOU MARK IS THE ONE THE HUD POINTS AT ALL NIGHT.' };
const rows = bagGuideRows(guide, 100);
assert.ok(rows >= 3, 'a callout is a head, a reason, and a footer');
assert.equal(bagGuideRows(null, 100), 0, 'an unguided case reserves nothing');

const body = { x: 0, y: 0, w: 100, h: 30 };
const plain = bagLayout({ body });
const guided = bagLayout({ body, guideRows: rows });
assert.equal(plain.guide, null);
assert.equal(guided.guide.h, rows);
assert.ok(guided.guide.y + guided.guide.h <= guided.actionRail.y, 'the callout sits above the rail');
assert.equal(guided.taskRail.y, guided.guide.y - 1, 'and directly under the task line');
assert.ok(guided.list.h < plain.list.h, 'the case gives up rows for it rather than printing over itself');

// ── a man does not say the same sentence twice in a row ─────────────────────
// This is the flood the player reported: leaning on a refused key used to buy
// minutes of monitor text that could not be stopped and arrived far too late.
// Drain the band, counting how many distinct lines it actually said.
function drain(limit = 400) {
  const heard = [];
  for (let i = 0; i < limit && isSpeaking(); i++) {
    updateSpeech(9);
    const line = speaking();
    if (line && heard[heard.length - 1] !== line.text) heard.push(line.text);
  }
  return heard;
}

clearSpeech();
for (let i = 0; i < 40; i++) say({ who: 'you', text: 'Basement first.' });
updateSpeech(0.016);
assert.equal(speaking().text, 'Basement first.');
assert.deepEqual(drain(), ['Basement first.'], 'forty presses is one thought, not forty');

clearSpeech();
for (let i = 0; i < 40; i++) say({ who: 'you', text: `line ${i}` });
const heard = drain();
assert.ok(heard.length <= 6, `a backlog is capped, not replayed (${heard.length})`);
assert.equal(heard[heard.length - 1], 'line 39', 'and it keeps the newest, not the stalest');
clearSpeech();

console.log('dock setup contracts passed');
