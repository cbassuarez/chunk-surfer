import { getMeta, getSave, metaCommit, saveCommit } from '../game/save.js';

const categories = new Set(['lines', 'choices', 'documents', 'playbacks', 'props']);

export function markKnowledge(category, id, runId = getSave()?.run?.id, at = Date.now()) {
  if (!categories.has(category) || typeof id !== 'string' || !id) return false;
  const meta = getMeta();
  const knowledge = { ...meta.knowledge };
  const bucket = { ...(knowledge[category] || {}) };
  const previous = bucket[id];
  bucket[id] = previous ? {
    ...previous,
    lastSeenAt: at,
    count: Math.max(1, Number(previous.count) || 1) + 1,
  } : {
    firstSeenAt: at,
    firstSeenRunId: runId || '',
    lastSeenAt: at,
    count: 1,
  };
  knowledge[category] = bucket;
  metaCommit({ knowledge });
  return true;
}

export function knowledgeStatus(category, id, runId = getSave()?.run?.id) {
  const record = getMeta()?.knowledge?.[category]?.[id];
  if (!record) return 'unseen';
  return record.firstSeenRunId === runId ? 'seen-this-run' : 'seen-before-run';
}

export function lineContentId({ sceneId = 'scene', nodeId = 'beats', line, index = 0 }) {
  return line?.id || `${sceneId}:${nodeId}:line:${index}`;
}

export function choiceContentId({ sceneId = 'scene', nodeId = 'node', choice, index = 0 }) {
  return choice?.knowledgeId || choice?.id || `${sceneId}:${nodeId}:choice:${index}`;
}

export function createReplayService(sceneId = 'scene') {
  return {
    lineId({ nodeId, line, index }) { return lineContentId({ sceneId, nodeId, line, index }); },
    choiceId({ nodeId, choice, index }) { return choiceContentId({ sceneId, nodeId, choice, index }); },
    lineStatus(id) { return knowledgeStatus('lines', id); },
    choiceStatus(id) { return knowledgeStatus('choices', id); },
    seenTextMode() { return getSave()?.run?.replay?.seenTextMode || 'normal'; },
    archiveSignalsEnabled() {
      return !!getSave()?.run?.replay?.archiveSignals && (getMeta()?.endingsSeen?.length || 0) > 0;
    },
    markLine(id) { return markKnowledge('lines', id); },
    markChoice(id) { return markKnowledge('choices', id); },
    noteSeenTextAssist() {
      const run = getSave()?.run;
      if (!run || run.replay.seenTextAssistUsed) return;
      run.replay.seenTextAssistUsed = true;
      saveCommit({ run });
    },
  };
}
