import { STORY_ART_PROJECT } from './story-art.js';
import { storyArtImageRect } from './story-art-layout-model.js';
import { freshStoryArtShotState, resolveStoryArtShot } from './story-art-shot.js';

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function artId(ref) {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return String(ref.id || ref.art || ref.key || ref.artId || '');
}

function resolveShot({ sceneId = 'cold-open', nodeId, sourceId = '', line = null, node = null } = {}) {
  return resolveStoryArtShot({
    mode: 'nodes',
    sceneId,
    nodeId,
    lineId: sourceId || `${sceneId}:${nodeId}`,
    sourceId,
    line,
    node,
    previous: freshStoryArtShotState(),
  });
}

function assetIdForStoryArt(id) {
  return (STORY_ART_PROJECT?.storyArt || []).find((entry) => entry.id === id)?.assetId || '';
}

function assertShot(context, args, expected) {
  const actual = artId(resolveShot(args).art);
  assert(actual === expected, `${context} should use ${expected}, got ${actual || '<none>'}`);
}

function assertNotShot(context, args, forbidden) {
  const actual = artId(resolveShot(args).art);
  assert(actual !== forbidden, `${context} must not use ${forbidden}`);
}

function assertNoProductionPlaceholderUsesWrongAsset() {
  assert(assetIdForStoryArt('story-art-7') !== 'guard.still', 'TORCH placeholder must not resolve to guard.still');
  assert(assetIdForStoryArt('story-art-7') === 'flashlight.still', 'TORCH placeholder should resolve to flashlight.still');
}

function assertColdOpenShotMap() {
  assertShot('start route', { nodeId: 'start' }, 'boothRain');
  assertShot('start pen line', { nodeId: 'start', sourceId: 'start.line.6', line: { sourceId: 'start.line.6' } }, 'boothPen');
  assertShot('start coffee line', { nodeId: 'start', sourceId: 'start.line.8', line: { sourceId: 'start.line.8' } }, 'boothCoffee');

  assertShot('order route', { nodeId: 'order.rooms.power' }, 'boothPen');
  assertShot('guard route', { nodeId: 'guard.last.out' }, 'guard');
  assertShot('tape route', { nodeId: 'tape', node: { art: { id: 'guard' } } }, 'recordist');
  assertShot('torch route', { nodeId: 'torch.him.why' }, 'flashlight');
  assertShot('coffee route', { nodeId: 'coffee' }, 'boothCoffee');
  assertShot('descent route', { nodeId: 'descent.dark' }, 'thresholdYard');
  assertShot('threshold route', { nodeId: 'threshold' }, 'thresholdYard');

  for (const sourceId of ['tape.run.line.3', 'tape.run.line.5', 'tape.run.line.7', 'tape.run.line.9']) {
    assertShot(sourceId, { nodeId: 'tape.run', sourceId, line: { sourceId, who: 'surfer' } }, 'recordist-swirled');
  }
  assertNotShot('tape route', { nodeId: 'tape', node: { art: { id: 'guard' } } }, 'guard');
}

function assertStoryArtHoldAndClearSemantics() {
  let state = freshStoryArtShotState();
  let resolved = resolveStoryArtShot({
    mode: 'beats',
    sceneId: 'after-title',
    nodeId: 'beats',
    lineId: 'one',
    line: { art: { id: 'door' }, artHold: true, artScope: 'scene' },
    previous: state,
  });
  state = resolved.state;
  assert(resolved.art?.id === 'door', 'line art should resolve immediately');

  resolved = resolveStoryArtShot({
    mode: 'beats',
    sceneId: 'after-title',
    nodeId: 'beats',
    lineId: 'two',
    line: { text: 'still held' },
    previous: state,
  });
  assert(resolved.art?.id === 'door', 'scene-held art should persist');

  resolved = resolveStoryArtShot({
    mode: 'beats',
    sceneId: 'after-title',
    nodeId: 'beats',
    lineId: 'three',
    line: { artClear: true, text: 'black' },
    previous: resolved.state,
  });
  assert(!resolved.art, 'artClear should clear held art');
}

function assertFocalPointAffectsCrop() {
  const left = storyArtImageRect({
    srcW: 2000,
    srcH: 1000,
    dstW: 500,
    dstH: 500,
    transform: { fit: 'cover', focalPoint: { x: 0.1, y: 0.5 } },
  });
  const right = storyArtImageRect({
    srcW: 2000,
    srcH: 1000,
    dstW: 500,
    dstH: 500,
    transform: { fit: 'cover', focalPoint: { x: 0.9, y: 0.5 } },
  });
  assert(left.sx < right.sx, 'focal point should affect horizontal crop');
}

function assertContainNeverCrops() {
  const rect = storyArtImageRect({
    srcW: 2000,
    srcH: 1000,
    dstW: 500,
    dstH: 500,
    transform: { fit: 'contain' },
  });
  assert(rect.sx === 0 && rect.sy === 0 && rect.sw === 2000 && rect.sh === 1000, 'contain should not crop source pixels');
  assert(rect.dw === 500 && rect.dh === 250, 'contain should letterbox instead of cropping');
}

export function assertStoryArtContracts() {
  assertNoProductionPlaceholderUsesWrongAsset();
  assertColdOpenShotMap();
  assertStoryArtHoldAndClearSemantics();
  assertFocalPointAffectsCrop();
  assertContainNeverCrops();
  return true;
}
