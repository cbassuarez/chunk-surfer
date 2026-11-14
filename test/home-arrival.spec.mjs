// THE WALK IN: whiteout into the snow valley, opened by what he names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HOME_ARRIVAL_ANCHORS, HOME_ARRIVAL_FLAG, HOME_ARRIVAL_NAMED_SECONDS, HOME_ARRIVAL_REST_DELAY,
  HOME_ARRIVAL_REST_SECONDS, HOME_ARRIVAL_START, createHomeArrival, finishHomeArrival,
  homeArrivalComplete, homeArrivalFrame, nameHomeArrival,
} from '../src/game/home-arrival.js';
import { HOME_ARRIVAL_GLSL, HOME_ARRIVAL_GLSL_ANCHORS } from '../src/render/home-arrival-glsl.js';
import { ELSEWHERE_GLSL } from '../src/render/elsewhere-glsl.js';

const story = JSON.parse(readFileSync(new URL('../content/narrative/source-space.door-field.story.json', import.meta.url), 'utf8'));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('he arrives in whiteout with nothing named', () => {
  const frame = homeArrivalFrame(createHomeArrival('k', 10), 10);
  assert.equal(frame.whiteout, 1);
  assert.equal(frame.rest, 0);
  for (const anchor of HOME_ARRIVAL_ANCHORS) assert.equal(frame[anchor], 0, anchor);
});

test('a named thing clears over its own time, and naming it again does not restart it', () => {
  let state = nameHomeArrival(createHomeArrival('k', 0), 'lines', 10);
  assert.ok(Math.abs(homeArrivalFrame(state, 10 + HOME_ARRIVAL_NAMED_SECONDS / 2).lines - .5) < 1e-9);
  state = nameHomeArrival(state, 'lines', 12);
  assert.equal(homeArrivalFrame(state, 10 + HOME_ARRIVAL_NAMED_SECONDS).lines, 1);
  assert.equal(homeArrivalFrame(state, 11).houses, 0, 'naming one thing parts the snow around another');
  assert.equal(nameHomeArrival(state, 'the-river', 13), state, 'an unknown anchor changed the arrival');
});

test('the rest comes in after a lead, then the whiteout is gone', () => {
  let state = nameHomeArrival(createHomeArrival('k', 0), ['window', 'all'], 20);
  const restAt = 20 + HOME_ARRIVAL_REST_DELAY;
  assert.equal(state.restAt, restAt);
  assert.equal(homeArrivalFrame(state, restAt).rest, 0);
  assert.ok(homeArrivalFrame(state, restAt + HOME_ARRIVAL_REST_SECONDS / 2).rest > .4);
  assert.equal(homeArrivalComplete(state, restAt + HOME_ARRIVAL_REST_SECONDS), true);
  assert.equal(homeArrivalFrame(state, restAt + HOME_ARRIVAL_REST_SECONDS), null);
  assert.equal(finishHomeArrival(state, 99).restAt, restAt, 'a second finish moved the end');
});

test('every way through the questions lifts the whiteout and ends on the valley\'s walk line', () => {
  const nodes = story.nodes;
  assert.ok(story.entries.includes(HOME_ARRIVAL_START));
  const ends = [];
  const walk = (id, named, depth) => {
    assert.ok(depth < 8, `the walk in loops at ${id}`);
    const node = nodes[id];
    assert.ok(node, `${id} is missing`);
    if (node.goto) { assert.equal(node.goto, 'home.walk'); ends.push(named); return; }
    assert.ok(node.choices?.length, `${id} has no way on`);
    for (const choice of node.choices) {
      const arrive = Array.isArray(choice.arrive) ? choice.arrive : choice.arrive ? [choice.arrive] : [];
      for (const anchor of arrive) assert.ok(anchor === 'all' || HOME_ARRIVAL_ANCHORS.includes(anchor), `${choice.id}: ${anchor}`);
      walk(choice.goto, [...named, ...arrive], depth + 1);
    }
  };
  walk(HOME_ARRIVAL_START, [], 0);
  assert.ok(ends.length >= 9);
  for (const named of ends) assert.ok(named.includes('all'), `a path never brings the rest of the valley in: ${named.join(',')}`);
  assert.ok(ends.some((named) => named[0] === 'tree') && ends.some((named) => named[0] === 'window') && ends.some((named) => named[0] === 'lines'));
});

test('nothing he is asked or says talks about the world arriving', () => {
  const texts = Object.values(story.nodes).filter(({ id }) => id.startsWith(HOME_ARRIVAL_START))
    .flatMap((node) => [...(node.lines || []).map(({ text }) => text), ...(node.choices || []).map(({ text }) => text)]);
  assert.ok(texts.length > 20);
  for (const text of texts) assert.doesNotMatch(text, /\b(load|ready|early|arriv|appear|wait)/i, text);
  for (const text of texts) assert.doesNotMatch(text, /\bhold|\bheld\b/i, text);
});

test('the snow parts around the valley\'s own things, and the openings show only whiteout', () => {
  assert.ok(ELSEWHERE_GLSL.includes(HOME_ARRIVAL_GLSL));
  assert.match(ELSEWHERE_GLSL, /float arrivalWhite=ewHomeArrivalWhite\(ro,rd,surfaceHit,t\);/);
  assert.match(ELSEWHERE_GLSL, /if\(arrivalWhite>\.5\)\{surfaceHit=460\.0;surfacePrint=vec2\(0\.0\);\}/, 'whited-out surfaces still engrave their edges');
  assert.equal(HOME_ARRIVAL_GLSL_ANCHORS.wireRun.length, 4, 'three poles and the service fixing');
  assert.ok(HOME_ARRIVAL_GLSL_ANCHORS.roofs.length >= 6);
  assert.equal(HOME_ARRIVAL_GLSL_ANCHORS.laneTree.id, 'lane-tree');
  const props = read('../src/render/props3d.js');
  assert.match(props, /gl\.uniform4f\(CU\('uHomeArrival'\)/);
  assert.match(props, /gl\.uniform4f\(PU\('uHomeArrival'\),1,0,0,0\)/);
});

test('main starts the walk in where the valley used to say its walk line', () => {
  const main = read('../src/main.js');
  assert.match(main, /!frame\.realm\.homeState\?\.recognized&&!beginHomeArrival\(frame\)\)sayStationNode\('home\.walk'\)/);
  assert.match(main, /homePresentation:\{\.\.\.homePresentation,activity,rest,arrival:homeArrivalPresentation\(\)\}/);
  assert.ok(main.includes(`godFlags([],['station.home.seen','station.home.departed',HOME_ARRIVAL_FLAG]);`));
  assert.equal(HOME_ARRIVAL_FLAG, 'station.home.arrived');
});
