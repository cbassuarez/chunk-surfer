// Pure battle-faceplate geometry. Combat rendering consumes these named regions
// instead of letting one readout position the next, so a longer gauge or label
// can never push resources, commands, or reaction controls into each other.

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value)));

const rect = (x, y, w, h) => Object.freeze({
  x: finite(x),
  y: finite(y),
  w: Math.max(0, finite(w)),
  h: Math.max(0, finite(h)),
});

export function combatHudLayout({
  panel = {},
  mode = 'command',
  sourceActive = false,
  compact = null,
} = {}) {
  const x = finite(panel.x);
  const y = finite(panel.y);
  const w = Math.max(36, finite(panel.w, 36));
  const h = Math.max(18, finite(panel.h, 18));
  const isCompact = compact == null ? h < 28 : !!compact;
  const contentBottom = y + h - 1.45;

  const headerH = isCompact ? 3.45 : 4.15;
  const header = rect(x, y, w, headerH);
  const enemyGaugeW = Math.min(isCompact ? 42 : 49, Math.max(28, Math.floor(w * .43)));
  const enemyGauge = rect(x, y + (isCompact ? 1.05 : 2.0), enemyGaugeW, 1.8);
  const turnW = isCompact ? 0 : Math.min(12, Math.max(10, Math.floor(w * .11)));
  const turn = rect(x + w - turnW, enemyGauge.y, turnW, 1.9);
  const returnX = enemyGauge.x + enemyGauge.w + 2;
  const returnW = Math.max(0, Math.min(20, turn.x - returnX - 1.5));
  const returnMonitor = rect(returnX, enemyGauge.y, returnW, 1.8);

  const deckTarget = mode === 'reaction'
    ? (isCompact ? 8.8 : 10.4)
    : mode === 'dialogue'
      ? (isCompact ? 8.6 : 11.2)
      : mode === 'arrival'
        ? 5.2
        : (isCompact ? 9.8 : sourceActive ? 16.2 : 13.3);
  const stageY = y + headerH;
  const stageAvailable = Math.max(6, contentBottom - stageY - 1);
  const stageMin = isCompact ? 6 : 9;
  const stageMax = isCompact ? 10 : 18;
  const stageH = clamp(stageAvailable - deckTarget, stageMin, stageMax);
  const stage = rect(x, stageY, w, stageH);
  const deckY = stage.y + stage.h + 1;
  const deck = rect(x, deckY, w, Math.max(4, contentBottom - deckY));

  const playerGaugeW = Math.min(isCompact ? 42 : 49, Math.max(28, Math.floor(w * .43)));
  const playerGauge = rect(x, deckY, playerGaugeW, 1.8);
  const resourceX = playerGauge.x + playerGauge.w + 2;
  const resourceW = Math.max(0, x + w - resourceX);
  const resources = rect(resourceX, deckY, resourceW, 1.8);
  const resourceGap = resourceW > 48 ? .8 : .35;
  const usableResourceW = Math.max(0, resourceW - resourceGap * 3);
  const weights = [.34, .22, .25, .19];
  let cursor = resourceX;
  const resourceCells = {};
  ['take', 'charge', 'battery', 'mods'].forEach((id, index) => {
    const cellW = index === weights.length - 1
      ? Math.max(0, resourceX + resourceW - cursor)
      : usableResourceW * weights[index];
    resourceCells[id] = rect(cursor, deckY, cellW, 1.8);
    cursor += cellW + resourceGap;
  });

  const bodyY = deckY + 2.45;
  const body = rect(x, bodyY, w, Math.max(0, contentBottom - bodyY));
  const reaction = rect(x, bodyY, w, body.h);
  const dialogue = rect(x, bodyY, w, body.h);
  const arrival = rect(x, bodyY, w, body.h);

  const channelH = sourceActive && mode === 'command' ? (isCompact ? 2.45 : 3.15) : 0;
  const channels = rect(x, bodyY, w, channelH);
  const commandY = bodyY + (channelH ? channelH + .55 : 0);
  const detailH = isCompact ? 1.55 : 1.9;
  const detail = rect(x, Math.max(commandY, contentBottom - detailH), w, detailH);
  const commandAvailable = Math.max(2.8, detail.y - commandY - .55);

  let tools;
  let actions;
  let carousel;
  if (isCompact) {
    carousel = rect(x, commandY, w, commandAvailable);
    tools = carousel;
    actions = carousel;
  } else {
    const toolH = clamp(commandAvailable * .43, 3.2, 5.1);
    const actionY = commandY + toolH + .65;
    tools = rect(x, commandY, w, toolH);
    actions = rect(x, actionY, w, Math.max(3.2, detail.y - actionY - .55));
    carousel = rect(x, commandY, w, commandAvailable);
  }

  return Object.freeze({
    compact: isCompact,
    mode,
    contentBottom,
    header,
    enemyGauge,
    returnMonitor,
    turn,
    stage,
    deck,
    playerGauge,
    resources,
    resourceCells: Object.freeze(resourceCells),
    body,
    reaction,
    dialogue,
    arrival,
    channels,
    tools,
    actions,
    carousel,
    detail,
  });
}
