// Source keeps its face when it reaches through the player's recorded night.
// Reuse the combat portrait, including its cache and crop, for both ends of
// the throw. The surrounding executable is drawn in the game's cell space.
import { uiFill, uiInk, uiLine, uiSize, uiText } from './ui.js';
import { drawOpponentCombatArt } from './combat-view.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const ease = (t) => t * t * (3 - 2 * t);

export function drawSourceRepriseCast({ progress = 0, id = '', roomId = '', takeNumber = 1, reducedMotion = false, reducedFlash = false } = {}) {
  const { cols, rows } = uiSize();
  const flight = ease(clamp((progress - .18) / .82, 0, 1));
  uiFill(0, 0, cols, rows, 'rgba(2,3,6,0.995)');
  const figure = { x:cols * .52, y:rows * .12, w:cols * .40, h:rows * .72 };
  drawOpponentCombatArt('surfer', {
    ...figure, coherence:1, maxCoherence:1, reduceFlash:reducedFlash,
    resolveProgress:reducedMotion ? 0 : progress * .6,
    oblique:reducedMotion ? 0 : -.05,
  });

  // The packet leaves the visible figure's near hand, expands toward the
  // player, and occupies the same rectangle that opens into the copied room.
  const targetW = Math.min(cols - 4, cols * .76);
  const targetH = Math.max(9, Math.min(rows - 4, rows * .56));
  const width = reducedMotion ? targetW : 12 + (targetW - 12) * flight;
  const height = reducedMotion ? targetH : 4 + (targetH - 4) * flight;
  const cx = reducedMotion ? cols * .46 : cols * (.62 - flight * .16);
  const cy = rows * (.56 - (reducedMotion ? 1 : flight) * .06);
  const x = cx - width / 2, y = cy - height / 2;
  if (progress > .14) {
    uiLine(cols * .72, rows * .51, cx, cy, 'rgba(230,89,65,0.65)', .75, 2);
    uiFill(x + 1, y + 1, width, height, 'rgba(125,33,32,0.48)');
    uiFill(x, y, width, height, 'rgba(215,214,197,0.98)');
    if (width > 34) {
      const code = [
        'SOURCE.throw(game.code)',
        `recordAction("${id || 'reprise'}")`,
        `roll({ take:${takeNumber}, room:"${roomId || 'unknown'}" })`,
        'return playerShadow;',
      ];
      code.forEach((line, index) => uiInk(x + 2, y + 1 + index * 2, line.slice(0, Math.max(1, Math.floor(width - 4))), {
        color:index === 0 ? '#742826' : '#202328',
      }));
    } else uiInk(x + 2, y + 1, '{ REC }', { color:'#742826' });
  }
  uiText(2, rows - 3, 'SOURCE // EXECUTE', 'ui-danger', .8);
}

export function drawSourceRepriseScare({ progress = 0, reducedMotion = false, reducedFlash = false } = {}) {
  const { cols, rows } = uiSize();
  // A held, recognizable intrusion. Reduced flash never gets a white field;
  // both settings keep the same face and exact duration without a strobe.
  uiFill(0, 0, cols, rows, reducedFlash ? '#06080d' : '#12101b');
  const reach = reducedMotion ? 1 : 1 + clamp(progress, 0, 1) * .045;
  const width = cols * .86 * reach, height = rows * 1.20 * reach;
  drawOpponentCombatArt('surfer', {
    x:(cols - width) / 2, y:(rows - height) / 2, w:width, h:height,
    coherence:1, maxCoherence:1, reduceFlash:reducedFlash,
    hitFlash:reducedFlash ? 0 : .52,
  });
  uiFill(0, rows * .76, cols, 2, 'rgba(2,3,6,0.78)');
  const write = 'TAKE ACCEPTED // SOURCE';
  uiText(Math.max(1, (cols - write.length) / 2), rows * .76 + .5, write, 'ui-danger', .95);
}
