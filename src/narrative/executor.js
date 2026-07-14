import { applyMutations, evaluateCondition, interpolateStoryText } from './conditions.js';

const lineObject = (line, fallbackId) => typeof line === 'string'
  ? { id: fallbackId, text: line }
  : { id: fallbackId, ...line };

export function createNarrativeExecutor(document, initialContext = {}) {
  let context = structuredClone(initialContext);
  if (!context.flags) context.flags = {};
  let nodeId = document.entry;
  let lineIndex = 0;
  let finished = false;
  const events = [];

  const node = () => document.nodes?.[nodeId] || null;
  const visibleLines = () => (node()?.lines || [])
    .map((line, index) => lineObject(line, `${nodeId}.line.${index}`))
    .filter((line) => evaluateCondition(line.when, { ...context, ...context.flags }));
  const choices = () => (node()?.choices || [])
    .filter((choice) => evaluateCondition(choice.when, { ...context, ...context.flags }));

  function enter(id) {
    if (!document.nodes?.[id]) { finished = true; events.push({ type: 'error', message: `missing node ${id}` }); return; }
    nodeId = id;
    lineIndex = 0;
    events.push({ type: 'node-enter', nodeId: id });
    for (const cueId of node()?.cues || []) events.push({ type: 'cue', cueId, anchor: 'node-enter', nodeId });
  }

  function completeNode() {
    const current = node();
    context = applyMutations(context, current?.mutations);
    if (choices().length) return;
    if (current?.goto) enter(current.goto);
    else { finished = true; events.push({ type: 'complete', nodeId }); }
  }

  enter(nodeId);
  return {
    view() {
      const lines = visibleLines();
      const current = lines[lineIndex] || null;
      return {
        documentId: document.id, nodeId, node: node(), lineIndex,
        line: current ? { ...current, text: interpolateStoryText(current.text ?? current.direction, { ...context, ...context.flags }) } : null,
        choices: lineIndex >= lines.length ? choices() : [],
        finished, context: structuredClone(context), events: events.slice(),
      };
    },
    advance() {
      if (finished) return this.view();
      const lines = visibleLines();
      if (lineIndex < lines.length) {
        const line = lines[lineIndex++];
        events.push({ type: 'line', nodeId, lineId: line.id });
        for (const cueId of line.cues || (line.cue ? [line.cue] : [])) events.push({ type: 'cue', cueId, anchor: 'line', nodeId, lineId: line.id });
      }
      if (lineIndex >= lines.length) completeNode();
      return this.view();
    },
    choose(choiceId) {
      if (finished) return this.view();
      const choice = choices().find((item) => item.id === choiceId);
      if (!choice) throw new Error(`choice ${choiceId} is not available`);
      context = applyMutations(context, choice.mutations);
      events.push({ type: 'choice', nodeId, choiceId });
      for (const cueId of choice.cues || []) events.push({ type: 'cue', cueId, anchor: 'choice', nodeId, choiceId });
      if (choice.goto) enter(choice.goto);
      else { finished = true; events.push({ type: 'complete', nodeId }); }
      return this.view();
    },
    reset(nextContext = initialContext) {
      context = structuredClone(nextContext); if (!context.flags) context.flags = {};
      finished = false; events.length = 0; enter(document.entry); return this.view();
    },
  };
}
