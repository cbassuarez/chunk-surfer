// Dev-only structural checks for the authored cold-open conversation graph.
// This file has no runtime side effects; import it from a console or a local
// validation script when editing src/data/conservatory-script.js.

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function effectsOf(choice = {}) {
  return [
    ...asList(choice.set).map((item) => `+${item}`),
    ...asList(choice.clear).map((item) => `-${item}`),
  ];
}

function isReturnish(choice = {}) {
  return /(^|\.)back$|return|booth\.hub|rooms\.hub|guard$|order$|torch$|tape$/.test(String(choice.id || choice.goto || choice.text || ''));
}

export function lintColdOpenDialogue(nodes = {}) {
  const warnings = [];
  const ids = new Set(Object.keys(nodes || {}));
  const choiceIds = new Map();

  for (const [nodeId, node] of Object.entries(nodes || {})) {
    const choices = asList(node.choices);

    if (node.goto && !ids.has(node.goto)) {
      warnings.push({ level: 'error', nodeId, message: `missing goto target ${node.goto}` });
    }

    if ((node.kind === 'hub' || node.kind === 'subhub') && choices.length < 3 && !node.allowSmallHub) {
      warnings.push({ level: 'warn', nodeId, message: 'hub/subhub has fewer than three choices' });
    }

    if ((node.kind === 'hub' || node.kind === 'subhub') && choices.length && !choices.some(isReturnish)) {
      warnings.push({ level: 'warn', nodeId, message: 'hub/subhub has no obvious return route' });
    }

    if (choices.length === 1 && !node.forced && !effectsOf(choices[0]).length && node.kind !== 'bridge') {
      warnings.push({ level: 'warn', nodeId, message: 'single-choice node has no explicit state effect' });
    }

    const gotoBuckets = new Map();
    choices.forEach((choice, index) => {
      if (!choice.id && !choice.knowledgeId) {
        warnings.push({ level: 'warn', nodeId, choiceIndex: index, message: 'choice is missing id/knowledgeId' });
      }

      // `knowledgeId` may intentionally be shared between the full open and
      // the replay-condensed route. Only `id` needs to be graph-unique.
      const stableId = choice.id;
      if (stableId) {
        const previous = choiceIds.get(stableId);
        if (previous) warnings.push({ level: 'error', nodeId, choiceId: stableId, message: `duplicate choice id also used in ${previous}` });
        else choiceIds.set(stableId, nodeId);
      }

      if (choice.goto && !ids.has(choice.goto)) {
        warnings.push({ level: 'error', nodeId, choiceId: stableId || index, message: `missing choice goto target ${choice.goto}` });
      }

      const bucket = choice.goto || '<beats>';
      const current = gotoBuckets.get(bucket) || [];
      current.push(choice);
      gotoBuckets.set(bucket, current);
    });

    for (const [goto, bucket] of gotoBuckets.entries()) {
      if (choices.length > 1 && bucket.length === choices.length) {
        const effectKeys = new Set(bucket.map((choice) => effectsOf(choice).join('|')));
        if (effectKeys.size <= 1) {
          warnings.push({ level: 'warn', nodeId, goto, message: 'all choices converge without distinct state effects' });
        }
      }
    }
  }

  return warnings;
}
