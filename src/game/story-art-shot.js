export function freshStoryArtShotState() {
  return Object.freeze({ ref: null, hold: false, scope: null });
}

export function storyArtRefOf(obj) {
  if (!obj) return null;
  if (obj.artClear === true || obj.art === false || obj.art === null) return null;
  if (obj.art) return obj.art;
  if (obj.artId) return { id: obj.artId, mode: obj.artMode };
  return null;
}

function routeRoot(nodeId = '') {
  return String(nodeId || '').split('.')[0] || '';
}

function storyArtScopeKey({ sceneId = '', nodeId = '', lineId = '', line = null, fallback = 'line' } = {}) {
  const requested = line?.artScope || fallback;
  if (requested === 'scene') return `scene:${sceneId || 'story'}`;
  if (requested === 'route') return `route:${routeRoot(nodeId) || nodeId || sceneId || 'story'}`;
  if (requested === 'node') return `node:${nodeId || sceneId || 'story'}`;
  return `line:${lineId || line?.sourceId || line?.id || nodeId || sceneId || 'story'}`;
}

function normalizedLineId({ sourceId = '', lineId = '', line = null } = {}) {
  return String(sourceId || line?.sourceId || line?.id || lineId || '');
}

function isColdOpenShotScene(sceneId = '') {
  const id = String(sceneId || '');
  return id === 'cold-open' || id === 'god-cold-open' || id.endsWith(':cold-open');
}

const COLD_OPEN_ROUTE_ART = Object.freeze({
  start: { id: 'boothRain', mode: 'hero', caption: 'Vehicle gate / 21:38', status: 'STILL' },
  replay: { id: 'boothRain', mode: 'hero', caption: 'Vehicle gate / 21:38', status: 'STILL' },
  order: { id: 'boothPen', mode: 'hero', caption: 'Requisition 4-4-1-7', status: 'UNSIGNED' },
  guard: { id: 'guard', mode: 'hero', caption: 'Gate booth / the book', status: 'STILL' },
  tape: { id: 'recordist', mode: 'hero', caption: "The previous recordist's tape", status: 'ON THE TAPE' },
  torch: { id: 'flashlight', mode: 'hero', caption: 'Three-cell Maglite', status: 'KIT' },
  coffee: { id: 'boothCoffee', mode: 'hero', caption: 'Second cup / across the glass', status: 'OFFERED' },
  threshold: { id: 'thresholdYard', mode: 'hero', caption: 'The yard / a hundred metres', status: 'THRESHOLD' },
  descent: { id: 'thresholdYard', mode: 'hero', caption: 'The yard / a hundred metres', status: 'THRESHOLD' },
});

const COLD_OPEN_NODE_ART = Object.freeze({
  'replay-condensed': COLD_OPEN_ROUTE_ART.start,
});

const COLD_OPEN_LINE_ART = Object.freeze({
  'start.line.6': { id: 'boothPen', mode: 'hero', caption: 'Requisition 4-4-1-7', status: 'UNSIGNED' },
  'start.line.8': { id: 'boothCoffee', mode: 'hero', caption: 'Second cup / across the glass', status: 'OFFERED' },
  'tape.run.line.3': { id: 'recordist-swirled', mode: 'hero', caption: 'The fourth file stops behaving like a file.', status: 'WRONG' },
  'tape.run.line.5': { id: 'recordist-swirled', mode: 'hero', caption: 'The fourth file stops behaving like a file.', status: 'WRONG' },
  'tape.run.line.7': { id: 'recordist-swirled', mode: 'hero', caption: 'The fourth file stops behaving like a file.', status: 'WRONG' },
  'tape.run.line.9': { id: 'recordist-swirled', mode: 'hero', caption: 'The fourth file stops behaving like a file.', status: 'WRONG' },
});

export function canonicalStoryArtForShot({ sceneId = '', nodeId = '', sourceId = '', lineId = '', line = null } = {}) {
  if (!isColdOpenShotScene(sceneId)) return null;
  const id = normalizedLineId({ sourceId, lineId, line });
  if (id && COLD_OPEN_LINE_ART[id]) return { ref: COLD_OPEN_LINE_ART[id], scope: 'line', reason: 'canonical-line' };
  if (COLD_OPEN_NODE_ART[nodeId]) return { ref: COLD_OPEN_NODE_ART[nodeId], scope: 'node', reason: 'canonical-node' };
  const root = routeRoot(nodeId);
  if (COLD_OPEN_ROUTE_ART[root]) return { ref: COLD_OPEN_ROUTE_ART[root], scope: 'route', reason: 'canonical-route' };
  return null;
}

export function resolveStoryArtShot({
  mode = 'nodes',
  sceneId = '',
  nodeId = '',
  lineId = '',
  sourceId = '',
  line = null,
  node = null,
  previous = freshStoryArtShotState(),
} = {}) {
  if (line?.artClear === true || line?.art === false || line?.art === null) {
    return { art: null, state: freshStoryArtShotState(), reason: 'cleared' };
  }

  const canonical = canonicalStoryArtForShot({ sceneId, nodeId, sourceId, lineId, line });
  if (canonical?.ref) {
    const scope = storyArtScopeKey({ sceneId, nodeId, lineId: sourceId || lineId, line, fallback: canonical.scope });
    const hold = canonical.scope !== 'line' || line?.artHold === true;
    const state = hold ? { ref: canonical.ref, hold: true, scope } : freshStoryArtShotState();
    return { art: canonical.ref, state, reason: canonical.reason };
  }

  const lineArt = storyArtRefOf(line);
  if (lineArt) {
    const hold = line?.artHold === true;
    const scope = storyArtScopeKey({ sceneId, nodeId, lineId: sourceId || lineId, line, fallback: hold ? 'node' : 'line' });
    return {
      art: lineArt,
      state: hold ? { ref: lineArt, hold, scope } : freshStoryArtShotState(),
      reason: 'line',
    };
  }

  const nodeArt = storyArtRefOf(node);
  if (nodeArt) {
    const scope = storyArtScopeKey({ sceneId, nodeId, lineId: sourceId || lineId, line, fallback: 'node' });
    return {
      art: nodeArt,
      state: { ref: nodeArt, hold: true, scope },
      reason: 'node',
    };
  }

  const currentScope = storyArtScopeKey({ sceneId, nodeId, lineId: sourceId || lineId, line, fallback: mode === 'beats' ? 'scene' : 'node' });
  if (previous?.hold && previous?.ref && previous.scope === currentScope) {
    return { art: previous.ref, state: previous, reason: 'held' };
  }

  return { art: null, state: freshStoryArtShotState(), reason: 'none' };
}
