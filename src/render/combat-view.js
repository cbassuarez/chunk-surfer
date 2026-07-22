// Code-native battle presentation primitives. These share the field-case tool
// schematics and the dialogue image-card renderer so combat looks like the same
// physical interface, under pressure.

import { uiDraw, uiFill, uiStrokeRect, uiText } from './ui.js';
import { UI_COLOR } from './palette.js';
import { drawBagIcon } from './bag-icons.js';
import { loadStoryArtImage, resolveStoryArt } from '../game/story-art.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export function combatBarCells(value, maxValue, width) {
  const max = Math.max(1, Number(maxValue) || 1);
  return clamp(value / max, 0, 1) * Math.max(0, Number(width) || 0);
}

export function combatInjuryStage({ composure = 0, maxComposure = 1, injuries = 0 } = {}) {
  const ratio = clamp(composure / Math.max(1, maxComposure), 0, 1);
  const burden = Math.max(0, Number(injuries) || 0);
  if (ratio <= .25 || burden >= 4) return 'critical';
  if (ratio <= .50 || burden >= 2) return 'wounded';
  if (ratio <= .75 || burden >= 1) return 'hurt';
  return 'steady';
}

export function drawCombatBar({ x, y, w, value, max, label, tone = 'player', alpha = 1 } = {}) {
  const labelText = String(label || '').toUpperCase();
  const amount = `${Math.max(0, Math.round(value))}/${Math.max(1, Math.round(max))}`;
  const fillColor = tone === 'enemy' ? 'rgba(255,76,76,0.84)' : 'rgba(255,181,54,0.88)';
  const low = value / Math.max(1, max) <= .25;
  uiText(x, y, labelText, tone === 'enemy' ? 'ui-danger' : low ? 'ui-danger' : 'ui-label', alpha);
  uiText(x + Math.max(0, w - amount.length), y, amount, tone === 'enemy' ? 'ui-danger' : low ? 'ui-danger' : 'ui-primary', alpha);
  uiFill(x, y + 1.15, w, .58, 'rgba(255,255,255,0.07)');
  uiFill(x, y + 1.15, combatBarCells(value, max, w), .58, fillColor);
  uiStrokeRect(x, y + 1.15, w, .58, tone === 'enemy' ? UI_COLOR.danger : UI_COLOR.amber, .42 * alpha, 1);
}

function coverRect(srcW, srcH, dstW, dstH) {
  if (!srcW || !srcH || !dstW || !dstH) return { sx: 0, sy: 0, sw: srcW || 1, sh: srcH || 1 };
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

function imageLoaded(record) {
  return !!(record?.loaded && !record.error && record.image?.naturalWidth && record.image?.naturalHeight);
}

export function drawOpponentCombatArt(ref, {
  x, y, w, h, coherence, maxCoherence, snr = 'signal', resolveProgress = 0, reduceFlash = false,
} = {}) {
  const art = resolveStoryArt(ref);
  const imageRecord = art?.src ? loadStoryArtImage(art.src) : null;
  const loss = 1 - clamp(coherence / Math.max(1, maxCoherence), 0, 1);
  const fractures = Math.floor(loss * 7);

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr;
    const py = y * cellH * dpr;
    const pw = w * cellW * dpr;
    const ph = h * cellH * dpr;
    const horizon = py + ph * .62;
    const signal = snr === 'silence' ? '77,139,160' : snr === 'noise' ? '224,84,79' : '108,99,255';
    const opponentW = pw * .48;
    const opponentH = ph * .96;
    const opponentX = px - pw * .01;
    const opponentY = py;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();

    // One continuous field: no card, bezel, caption rail, or object inset.
    const field = ctx.createLinearGradient(px, py, px, py + ph);
    field.addColorStop(0, 'rgba(1,2,5,0.96)');
    field.addColorStop(.58, `rgba(${signal},0.055)`);
    field.addColorStop(1, 'rgba(0,0,0,0.98)');
    ctx.fillStyle = field;
    ctx.fillRect(px, py, pw, ph);

    ctx.strokeStyle = `rgba(${signal},0.10)`;
    ctx.lineWidth = Math.max(1, dpr);
    for (let i = 0; i < 5; i++) {
      const yy = horizon + (ph - (horizon - py)) * (i / 5) ** 1.7;
      ctx.beginPath();
      ctx.moveTo(px, yy);
      ctx.lineTo(px + pw, yy);
      ctx.stroke();
    }
    for (const target of [.05, .25, .75, .95]) {
      ctx.beginPath();
      ctx.moveTo(px + pw * .5, py + ph);
      ctx.lineTo(px + pw * target, horizon);
      ctx.stroke();
    }

    if (imageLoaded(imageRecord)) {
      const image = imageRecord.image;
      const crop = art?.id === 'surfer'
        ? {
            sx: image.naturalWidth * .18,
            sy: image.naturalHeight * .14,
            sw: image.naturalWidth * .64,
            sh: image.naturalHeight * .75,
          }
        : coverRect(image.naturalWidth, image.naturalHeight, opponentW, opponentH);
      ctx.save();
      ctx.globalAlpha = .92;
      ctx.filter = `grayscale(${Math.max(0, .10 - loss * .08)}) saturate(${1.45 + loss * .28}) contrast(${1.28 + loss * .16}) brightness(${1.38 + loss * .16})`;
      const strike = resolveProgress > .18 && resolveProgress < .62
        ? Math.sin(resolveProgress * Math.PI) * pw * .012
        : 0;
      ctx.drawImage(
        image,
        crop.sx, crop.sy, crop.sw, crop.sh,
        opponentX - strike, opponentY, opponentW, opponentH,
      );
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = .26;
      ctx.drawImage(
        image,
        crop.sx, crop.sy, crop.sw, crop.sh,
        opponentX - strike, opponentY, opponentW, opponentH,
      );
      ctx.filter = 'none';
      ctx.globalAlpha = reduceFlash ? .055 : .11;
      ctx.fillStyle = `rgba(${signal},1)`;
      ctx.fillRect(opponentX, opponentY, opponentW, opponentH);
      ctx.restore();
    } else {
      // The far-corner body remains legible for the image's first loading frame.
      ctx.fillStyle = `rgba(${signal},0.18)`;
      ctx.fillRect(opponentX + opponentW * .30, opponentY + opponentH * .08, opponentW * .18, opponentH * .18);
      ctx.fillRect(opponentX + opponentW * .20, opponentY + opponentH * .27, opponentW * .38, opponentH * .42);
      ctx.fillRect(opponentX + opponentW * .11, opponentY + opponentH * .38, opponentW * .16, opponentH * .32);
    }

    // Fade the portrait into the scene instead of placing it on top of one.
    const edgeFade = ctx.createLinearGradient(opponentX + opponentW * .58, 0, opponentX + opponentW, 0);
    edgeFade.addColorStop(0, 'rgba(0,0,0,0)');
    edgeFade.addColorStop(1, 'rgba(0,0,0,0.76)');
    ctx.fillStyle = edgeFade;
    ctx.fillRect(opponentX, opponentY, opponentW, opponentH);
    const floorFade = ctx.createLinearGradient(0, opponentY + opponentH * .60, 0, opponentY + opponentH);
    floorFade.addColorStop(0, 'rgba(0,0,0,0)');
    floorFade.addColorStop(1, 'rgba(0,0,0,0.70)');
    ctx.fillStyle = floorFade;
    ctx.fillRect(opponentX, opponentY, opponentW, opponentH);

    ctx.strokeStyle = 'rgba(255,75,69,0.72)';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.globalAlpha = .28 + loss * .46;
    for (let i = 0; i < fractures; i++) {
      const sx = opponentX + opponentW * (.12 + ((i * 31) % 56) / 100);
      const sy = opponentY + opponentH * (.10 + ((i * 23) % 54) / 100);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + opponentW * (.08 + (i % 3) * .03), sy + opponentH * (.15 + (i % 2) * .08));
      ctx.lineTo(sx + opponentW * (.02 + (i % 4) * .02), sy + opponentH * (.31 + (i % 3) * .05));
      ctx.stroke();
    }
    if (resolveProgress > .20 && resolveProgress < .62) {
      ctx.globalAlpha = .18 + .28 * Math.sin(resolveProgress * Math.PI);
      ctx.fillStyle = 'rgba(255,180,55,1)';
      for (let i = 0; i < 4; i++) {
        const yy = py + ph * ((i * .23 + resolveProgress * .41) % 1);
        ctx.fillRect(px, yy, pw, Math.max(dpr, ph * .018));
      }
    }
    ctx.restore();
  });
  return { rendered: !!art, rows: h, art };
}

const TOOL_ICON = Object.freeze({
  self: null,
  torch: 'light',
  recorder: 'recorder',
  rig: 'interface',
  fork: 'tuning-fork',
  radio: 'radio',
  coffee: 'coffee',
});

const HAND_PALETTE = Object.freeze({
  signal: Object.freeze({
    outline: '#170508',
    deepest: '#25152e',
    base: '#40304f',
    shade: '#34233f',
    light: '#443ec0',
    hot: '#6c63ff',
  }),
  noise: Object.freeze({
    outline: '#1d0507',
    deepest: '#2c151d',
    base: '#4d2f47',
    shade: '#3e2134',
    light: '#a83245',
    hot: '#e0544f',
  }),
  silence: Object.freeze({
    outline: '#071316',
    deepest: '#17272d',
    base: '#30424b',
    shade: '#26373f',
    light: '#245a73',
    hot: '#4c8ba0',
  }),
});

function pixelPoly(ctx, px, py, pw, ph, points, fill, outline, lineWidth) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(px + points[0][0] * pw, py + points[0][1] * ph);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(px + points[i][0] * pw, py + points[i][1] * ph);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function pixelBlock(ctx, px, py, pw, ph, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(
    Math.round(px + x * pw),
    Math.round(py + y * ph),
    Math.max(1, Math.round(w * pw)),
    Math.max(1, Math.round(h * ph)),
  );
}

function drawOpenHand(ctx, box, palette, severity, lineWidth) {
  const { px, py, pw, ph } = box;

  // Four separate fingers are joined by the palm. Their right-angle contours
  // intentionally preserve the chunky authored silhouette at any terminal size.
  const fingers = [
    [[.14,.57],[.12,.57],[.12,.48],[.14,.48],[.14,.35],[.16,.35],[.16,.24],[.18,.24],[.18,.17],[.21,.17],[.21,.25],[.20,.25],[.20,.38],[.19,.38],[.19,.51],[.22,.51],[.22,.60]],
    [[.20,.53],[.20,.38],[.22,.38],[.22,.21],[.24,.21],[.24,.10],[.28,.10],[.28,.18],[.27,.18],[.27,.35],[.26,.35],[.26,.51],[.29,.51],[.29,.59]],
    [[.27,.51],[.28,.30],[.30,.30],[.30,.13],[.32,.13],[.32,.03],[.36,.03],[.36,.12],[.35,.12],[.35,.31],[.34,.31],[.34,.51],[.37,.51],[.37,.59]],
    [[.34,.54],[.36,.38],[.38,.38],[.38,.25],[.40,.25],[.40,.17],[.44,.17],[.44,.24],[.43,.24],[.43,.39],[.41,.39],[.40,.56]],
  ];
  for (const finger of fingers) pixelPoly(ctx, px, py, pw, ph, finger, palette.base, palette.outline, lineWidth);

  pixelPoly(ctx, px, py, pw, ph, [
    [0,1],[0,.82],[.05,.82],[.05,.76],[.09,.76],[.09,.68],[.13,.68],
    [.13,.59],[.17,.59],[.17,.51],[.22,.51],[.22,.45],[.28,.45],[.28,.42],
    [.34,.42],[.34,.47],[.39,.47],[.39,.54],[.43,.54],[.43,.61],[.47,.61],
    [.47,.73],[.43,.73],[.43,.81],[.37,.81],[.37,.88],[.29,.88],[.29,.94],
    [.21,.94],[.21,1],
  ], palette.base, palette.outline, lineWidth);

  // Thumb reaches toward the held tool and visually connects the two corners.
  pixelPoly(ctx, px, py, pw, ph, [
    [.34,.55],[.40,.49],[.40,.45],[.46,.45],[.46,.40],[.53,.40],[.53,.44],
    [.50,.44],[.50,.49],[.46,.49],[.46,.54],[.42,.54],[.42,.61],[.38,.66],
  ], palette.base, palette.outline, lineWidth);

  pixelPoly(ctx, px, py, pw, ph, [
    [.29,.78],[.34,.78],[.34,.72],[.39,.72],[.39,.64],[.43,.64],[.43,.73],
    [.40,.73],[.40,.81],[.35,.81],[.35,.87],[.29,.87],
  ], palette.shade, null, 0);
  pixelBlock(ctx, px, py, pw, ph, .19, .49, .025, .075, palette.deepest);
  pixelBlock(ctx, px, py, pw, ph, .26, .48, .025, .065, palette.deepest);
  pixelBlock(ctx, px, py, pw, ph, .34, .49, .025, .065, palette.deepest);

  // Broad, deliberately irregular signal-light patches from the supplied art.
  pixelPoly(ctx, px, py, pw, ph, [
    [.04,.86],[.08,.86],[.08,.78],[.13,.78],[.13,.68],[.17,.68],[.17,.60],
    [.20,.60],[.20,.73],[.18,.73],[.18,.82],[.14,.82],[.14,.91],[.09,.91],
    [.09,.97],[.04,.97],
  ], palette.light, null, 0);
  pixelPoly(ctx, px, py, pw, ph, [
    [.20,.62],[.23,.62],[.23,.57],[.27,.57],[.27,.64],[.30,.64],[.30,.74],
    [.27,.74],[.27,.79],[.23,.79],[.23,.72],[.20,.72],
  ], palette.light, null, 0);
  pixelBlock(ctx, px, py, pw, ph, .18, .38, .04, .08, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .24, .22, .025, .08, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .30, .17, .035, .12, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .37, .26, .027, .09, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .32, .57, .045, .08, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .07, .83, .045, .05, palette.hot);

  if (severity) {
    const blood = severity >= 3 ? '#d32b35' : '#8b1323';
    pixelBlock(ctx, px, py, pw, ph, .285, .46, .055, .025, palette.outline);
    pixelBlock(ctx, px, py, pw, ph, .30, .475, .045, .022, blood);
    pixelBlock(ctx, px, py, pw, ph, .155, .63, .035, .035, blood);
    if (severity >= 2) {
      // A dark missing corner makes worsening damage change the silhouette.
      pixelBlock(ctx, px, py, pw, ph, .395, .17, .025, .045, palette.outline);
      pixelBlock(ctx, px, py, pw, ph, .39, .54, .035, .045, blood);
    }
    if (severity >= 3) {
      pixelBlock(ctx, px, py, pw, ph, .225, .10, .025, .045, palette.outline);
      pixelBlock(ctx, px, py, pw, ph, .24, .70, .028, .055, blood);
    }
  }
}

function drawGripHandBack(ctx, box, palette, severity, lineWidth) {
  const { px, py, pw, ph } = box;
  pixelPoly(ctx, px, py, pw, ph, [
    [1,1],[.72,1],[.72,.96],[.68,.96],[.68,.89],[.64,.89],[.64,.80],
    [.61,.80],[.61,.69],[.59,.69],[.59,.61],[.62,.61],[.62,.53],[.66,.53],
    [.66,.48],[.71,.48],[.71,.44],[.78,.44],[.78,.47],[.84,.47],[.84,.52],
    [.89,.52],[.89,.60],[.93,.60],[.93,.71],[.97,.71],[.97,.84],[1,.84],
  ], palette.base, palette.outline, lineWidth);

  // Knuckles rise behind the object before the closing fingers are drawn over it.
  const knuckles = [
    [[.62,.56],[.58,.50],[.58,.43],[.55,.43],[.55,.35],[.57,.35],[.57,.30],[.61,.30],[.61,.34],[.64,.34],[.64,.42],[.67,.42],[.67,.55]],
    [[.68,.50],[.65,.43],[.65,.31],[.63,.31],[.63,.23],[.65,.23],[.65,.19],[.70,.19],[.70,.24],[.72,.24],[.72,.35],[.75,.35],[.75,.49]],
    [[.75,.48],[.73,.39],[.73,.28],[.75,.28],[.75,.23],[.80,.23],[.80,.28],[.82,.28],[.82,.39],[.84,.39],[.84,.51]],
    [[.83,.52],[.82,.43],[.84,.43],[.84,.35],[.89,.35],[.89,.40],[.91,.40],[.91,.49],[.94,.49],[.94,.60]],
  ];
  for (const knuckle of knuckles) pixelPoly(ctx, px, py, pw, ph, knuckle, palette.base, palette.outline, lineWidth);

  pixelPoly(ctx, px, py, pw, ph, [
    [.77,.72],[.82,.72],[.82,.67],[.87,.67],[.87,.73],[.91,.73],[.91,.84],
    [.88,.84],[.88,.90],[.81,.90],[.81,.84],[.77,.84],
  ], palette.shade, null, 0);
  pixelBlock(ctx, px, py, pw, ph, .66, .46, .035, .025, palette.deepest);
  pixelBlock(ctx, px, py, pw, ph, .74, .44, .035, .025, palette.deepest);
  pixelBlock(ctx, px, py, pw, ph, .82, .49, .035, .025, palette.deepest);

  pixelBlock(ctx, px, py, pw, ph, .68, .55, .055, .12, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .75, .49, .035, .08, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .82, .57, .04, .10, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .71, .78, .045, .08, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .88, .83, .07, .05, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .91, .94, .055, .04, palette.hot);

  if (severity) {
    const blood = severity >= 3 ? '#d32b35' : '#8b1323';
    pixelBlock(ctx, px, py, pw, ph, .79, .54, .05, .025, blood);
    if (severity >= 2) pixelBlock(ctx, px, py, pw, ph, .68, .88, .04, .045, blood);
    if (severity >= 3) pixelBlock(ctx, px, py, pw, ph, .875, .35, .025, .045, palette.outline);
  }
}

function drawGripHandFront(ctx, box, palette, severity, lineWidth, hasTool) {
  const { px, py, pw, ph } = box;
  const reach = hasTool ? 0 : .035;

  // Thumb and curled fingertips cross in front of the item: it is being held,
  // not merely composited between two unrelated hands.
  pixelPoly(ctx, px, py, pw, ph, [
    [.68,.68],[.61,.68],[.61,.64],[.56,.64],[.56,.60],[.51,.60],[.51,.54],
    [.54,.49],[.58,.49],[.58,.53],[.56,.53],[.56,.57],[.60,.57],[.60,.61],
    [.65,.61],[.65,.57],[.70,.57],[.72,.62],
  ].map(([x, y]) => [x + reach, y]), palette.base, palette.outline, lineWidth);
  pixelBlock(ctx, px, py, pw, ph, .59 + reach, .60, .035, .035, palette.light);

  const curls = [
    [[.57,.30],[.61,.30],[.61,.34],[.64,.34],[.64,.40],[.61,.40],[.61,.37],[.57,.37]],
    [[.65,.19],[.70,.19],[.70,.24],[.72,.24],[.72,.31],[.69,.31],[.69,.27],[.65,.27]],
    [[.75,.23],[.80,.23],[.80,.28],[.82,.28],[.82,.34],[.79,.34],[.79,.31],[.75,.31]],
  ];
  for (const curl of curls) pixelPoly(ctx, px, py, pw, ph, curl, palette.base, palette.outline, lineWidth);
  pixelBlock(ctx, px, py, pw, ph, .58, .31, .025, .025, palette.hot);
  pixelBlock(ctx, px, py, pw, ph, .66, .20, .027, .025, palette.light);
  pixelBlock(ctx, px, py, pw, ph, .76, .24, .027, .025, palette.light);

  if (severity >= 2) pixelBlock(ctx, px, py, pw, ph, .53 + reach, .53, .025, .035, '#9b1825');
}

export function drawFirstPersonCombatant(toolId, { x, y, w, h, stage = 'steady', snr = 'signal', now = 0, resolveProgress = 0, reducedMotion = false } = {}) {
  const severity = stage === 'critical' ? 3 : stage === 'wounded' ? 2 : stage === 'hurt' ? 1 : 0;
  const tremor = reducedMotion || !severity ? 0 : Math.sin(now * (7 + severity * 2)) * severity * .12;
  const impact = resolveProgress > .18 && resolveProgress < .55 ? Math.sin(resolveProgress * Math.PI) * 1.2 : 0;
  const palette = HAND_PALETTE[snr] || HAND_PALETTE.signal;
  let box = null;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = (x + tremor) * cellW * dpr;
    const py = (y + impact * .18) * cellH * dpr;
    const pw = w * cellW * dpr;
    const ph = h * cellH * dpr;
    box = { px, py, pw, ph };
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    const lineWidth = Math.max(1, 1.35 * dpr);
    drawOpenHand(ctx, box, palette, severity, lineWidth);
    drawGripHandBack(ctx, box, palette, severity, lineWidth);
    ctx.restore();
  });

  const icon = TOOL_ICON[toolId];
  if (icon) drawBagIcon(icon, x + w * .47, y + h * .10, {
    w: w * .13,
    h: h * .60,
    active: resolveProgress > 0 || toolId !== 'self',
    state: snr === 'noise' ? 'danger' : snr === 'signal' ? 'metadata' : 'dim',
    alpha: .62,
  });

  // uiDraw is immediate; this final pass places the gripping digits over the
  // existing bag icon so every equipped object inherits the same held pose.
  if (box) uiDraw(({ ctx, dpr }) => {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    drawGripHandFront(ctx, box, palette, severity, Math.max(1, 1.35 * dpr), Boolean(icon));
    ctx.restore();
  });
}
