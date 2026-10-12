// Source keeps its face when it reaches through the player's recorded night.
// Reuse the combat portrait, including its cache and crop, for both ends of
// the throw. The surrounding executable is drawn in the game's cell space.
import { uiFill, uiInk, uiLine, uiSize, uiText } from './ui.js';
import { drawOpponentCombatArt } from './combat-view.js';
import { sectorErrorLines } from './sector-error.js';

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

// SENT BACK: THE SURFER THROWS THE CODE, AND THE MUSIC WITH IT.
//
// Not a card handed over. The screen floods with the executable from the top
// down — ntfsclone failing to read the volume, with his calls threaded through
// it — faster as it fills, torn by red scan faults, his face breaking up behind
// it, until it is solid and the last frames flash to the cut into the building.
// main.js slams his stems on the same 1.6 seconds. Reduced motion keeps the
// rows still; reduced flash never goes white.
const SEND_BACK_CODE = Object.freeze([
  'SOURCE.throw(game.code)',
  'recordAction(player) != history',
  'building.load(take.room)',
  'player.position = take.mark',
  'combat.suspend(movement)',
  'return playerShadow;',
]);
export function drawSourceSendBackFlood({ progress = 0, id = '', roomId = '', roomName = '', takeNumber = 1, reducedMotion = false, reducedFlash = false, seed = 4417 } = {}) {
  const { cols, rows } = uiSize();
  const p = clamp(progress, 0, 1);
  uiFill(0, 0, cols, rows, 'rgba(2,3,6,0.97)');
  const strobe = !reducedFlash && Math.floor(p * 16) % 2 === 1;
  drawOpponentCombatArt('surfer', {
    x:cols * .26, y:rows * .02, w:cols * .48, h:rows * .96,
    coherence:1, maxCoherence:1, reduceFlash:reducedFlash,
    hitFlash:strobe ? .42 : 0,
    resolveProgress:reducedMotion ? 0 : p * .9,
    oblique:reducedMotion ? 0 : (p - .5) * .12,
  });
  const warnings = (sectorErrorLines({ count:Math.max(12, Math.ceil(rows)), seed }) || []).map((line) => String(line?.text ?? line));
  const code = [
    ...SEND_BACK_CODE,
    `recordAction("${id || 'movement'}")`,
    `roll({ take:${takeNumber}, room:"${roomId || 'main_b3'}" })`,
  ];
  const filled = Math.min(rows, Math.floor(rows * ease(p) * 1.2));
  const scroll = reducedMotion ? 0 : Math.floor(p * p * 60);
  for (let r = 0; r < filled; r += 1) {
    const ours = r % 3 === 1;
    const source = ours ? code : warnings;
    const line = source.length ? source[(r + scroll) % source.length] : '';
    const shift = reducedMotion ? 0 : ((r * 7 + Math.floor(p * 40)) % 5) - 2;
    uiFill(0, r, cols, 1, `rgba(1,2,4,${(.45 + .5 * p).toFixed(3)})`);
    uiText(Math.max(0, 1 + shift), r, String(line).slice(0, Math.max(0, cols - 2)), ours ? 'ui-amber' : 'ui-danger', .5 + .5 * p);
  }
  if (!reducedMotion) {
    for (let i = 0; i < 3; i += 1) {
      const y = Math.floor((p * rows * 2.4 + (i * rows) / 3) % rows);
      uiFill(0, y, cols, 1 + (i % 2), 'rgba(255,60,40,0.34)');
    }
  }
  const where = String(roomName || roomId || 'the building').toUpperCase();
  uiFill(0, rows - 3, cols, 2, 'rgba(1,2,3,0.86)');
  uiText(2, rows - 2.5, `SOURCE.throw(game.code)  →  ${where}`.slice(0, Math.max(0, cols - 4)), 'ui-danger', .95);
  if (p > .9) uiFill(0, 0, cols, rows, reducedFlash ? 'rgba(6,6,10,0.92)' : 'rgba(236,232,216,0.94)');
}
