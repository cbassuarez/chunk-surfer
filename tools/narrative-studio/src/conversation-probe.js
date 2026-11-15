import { createConversation } from '../../../src/game/conversation.js';
import { evaluateCondition, interpolateStoryText } from '../../../src/narrative/conditions.js';
import { parseFlagAssignment } from '../../../src/game/flags.js';

/** The production cursor, speech decisions, revisits and spent answers. Only
 * explicit choice flag callbacks are supplied; world callbacks are logged. */
export function createConversationProbe(document, initialContext = {}, startAt = document.entry, fromCode = false) {
  let context = structuredClone(initialContext), events = [], lastNode = null;
  context.flags ||= {};
  const convertLine = line => ({ ...line, sourceId: line.id, if: line.when || line.if, resolveText: () => interpolateStoryText(line.text || line.direction || '', { ...context, ...context.flags }) });
  const nodes = Object.fromEntries(Object.entries(document.nodes).map(([id, node]) => [id, {
    ...node, lines: (node.lines || []).map(convertLine), revisitLines: (node.revisitLines || []).map(convertLine),
    choices: (node.choices || []).map(choice => ({ ...choice, sourceId: choice.id, if: choice.when || choice.if })),
  }]));
  const lineOwners = new Map(Object.entries(document.nodes).flatMap(([nodeId, node]) => [...(node.lines || []), ...(node.revisitLines || [])].map(line => [line.id, nodeId])));
  const machine = createConversation({ nodes, startAt, sceneId: `studio:${document.id}`, voiceEnabled: false,
    conditionTest: item => evaluateCondition(item?.if, { ...context, ...context.flags }),
    onLine: line => events.push({ type: 'line', nodeId: lineOwners.get(line.sourceId), lineId: line.sourceId, text: line.text }),
    cue: cueId => events.push({ type: 'cue', cueId }),
    onChoice: choice => {
      events.push({ type: 'choice', choiceId: choice.sourceId, goto: choice.goto, exit: choice.exit });
      const mutations = choice.mutations || { set: choice.set || [], clear: choice.clear || [] };
      for (const entry of mutations.set || []) { const [name, value] = parseFlagAssignment(entry); context.flags[name] = value; }
      for (const name of mutations.clear || []) context.flags[String(name).trim()] = false;
      if (mutations.set?.length || mutations.clear?.length) events.push({ type: 'flags', text: JSON.stringify(context.flags) });
      if (choice.exit || choice.check) events.push({ type: 'caller-boundary', text: choice.exit ? `Exit event: ${choice.exit}` : 'Choice check requires its game caller' });
    },
    onDone: () => events.push({ type: 'complete' }),
  });
  const view = () => {
    const frame = machine.view();
    if (frame.nodeId !== lastNode) { lastNode = frame.nodeId; events.push({ type: 'node', nodeId: lastNode }); }
    return { ...frame, context: structuredClone(context), events: [...events], fromCode };
  };
  machine.start();
  return {
    view,
    advance() { machine.update(30); machine.key({ key: 'Enter' }); return view(); },
    choose(index) { machine.selectChoice(index, { sound: false }); machine.key({ key: 'Enter' }); return view(); },
    stop() { machine.stop(); },
  };
}
