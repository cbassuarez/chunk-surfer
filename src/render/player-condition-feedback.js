import { uiDraw } from './ui.js';

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const pigments = new Map();

export function playerConditionVisualFrame(frame = {}, {effects = true, flash = 'full', motion = 'full'} = {}) {
  const visible = effects && frame.condition?.available === true;
  const force = Number.isFinite(frame.force) ? clamp(frame.force) : .75;
  const impact = visible && flash !== 'off' ? clamp(frame.impact) * force : 0;
  const settle = visible ? clamp(frame.settle) : 0;
  const strain = visible ? clamp(frame.strain) : 0;
  const wounds = visible ? Math.min(4, Math.max(0, Number(frame.wounds) || 0)) : 0;
  const reduced = flash !== 'full';
  return Object.freeze({visible, impact:impact * (reduced ? .38 : 1),
    edge:visible ? Math.min(.48, strain * (.08 + wounds * .003) + impact * (reduced ? .12 : .42)) : 0,
    lower:visible ? Math.min(.42, impact * (reduced ? .14 : .34) + settle * force * .055) : 0,
    blink:visible ? impact * (reduced ? .28 : 1) * (motion === 'full' ? 1 : .22) : 0,
    pinch:visible && motion === 'full' ? impact * .075 + settle * .012 : 0,
    grain:visible ? Math.min(.30, impact * (reduced ? .07 : .23) + settle * force * .025) : 0,
    centerClear:.24});
}

function ink(ctx, color) {
  if (pigments.has(color)) return pigments.get(color);
  if (typeof document === 'undefined' || !ctx.createPattern) return color;
  const tile = document.createElement('canvas'); tile.width = 4; tile.height = 4;
  const brush = tile.getContext('2d');
  if (!brush) return color;
  const order = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  brush.fillStyle = color;
  for (let i = 0; i < order.length; i++) if (order[i] < 9) brush.fillRect(i % 4, Math.floor(i / 4), 1, 1);
  const pattern = ctx.createPattern(tile, 'repeat') || color;
  pigments.set(color, pattern); return pattern;
}

// Ink remains outside the useful centre. The instrument and dialogue draw later.
export function paintPlayerConditionFeedback(ctx, frame, {width, height, ...settings} = {}) {
  const view = playerConditionVisualFrame(frame, settings);
  if (!view.visible || !(width > 0 && height > 0) || view.edge + view.lower < .001) return view;
  const cx = width * .5, cy = height * .46, span = Math.min(width, height);
  ctx.save();
  try {
    const edge = ctx.createRadialGradient(cx, cy, span * view.centerClear, cx, cy, Math.max(width, height) * .64);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(.56, `rgba(19,23,22,${view.edge * .20})`);
    edge.addColorStop(1, `rgba(7,10,9,${view.edge})`);
    ctx.fillStyle = edge; ctx.fillRect(0, 0, width, height);

    if (view.blink > .001) {
      const top = height * view.blink * .27, bottom = height * view.blink * .19;
      const upper = ctx.createLinearGradient(0, 0, 0, Math.max(1, top));
      upper.addColorStop(0, 'rgba(5,8,7,.96)');
      upper.addColorStop(.58, 'rgba(8,11,10,.94)');
      upper.addColorStop(1, 'rgba(24,29,26,.24)');
      ctx.fillStyle = upper;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(width, 0);
      ctx.lineTo(width, top * .58);
      ctx.bezierCurveTo(width * .78, top * .79, width * .59, top * 1.04, width * .43, top);
      ctx.bezierCurveTo(width * .23, top * .92, width * .10, top * .48, 0, top * .68);
      ctx.closePath(); ctx.fill();
      const lower = ctx.createLinearGradient(0, height - bottom, 0, height);
      lower.addColorStop(0, 'rgba(24,29,26,.20)');
      lower.addColorStop(.38, 'rgba(8,11,10,.88)');
      lower.addColorStop(1, 'rgba(5,8,7,.96)');
      ctx.fillStyle = lower;
      ctx.beginPath(); ctx.moveTo(0, height); ctx.lineTo(width, height);
      ctx.lineTo(width, height - bottom * .73);
      ctx.bezierCurveTo(width * .77, height - bottom * .44, width * .55, height - bottom * .95, width * .38, height - bottom);
      ctx.bezierCurveTo(width * .20, height - bottom * 1.02, width * .10, height - bottom * .52, 0, height - bottom * .62);
      ctx.closePath(); ctx.fill();
    }

    if (view.lower > .001) {
      const depth = height * (.075 + view.pinch);
      ctx.globalAlpha = view.lower;
      ctx.fillStyle = ink(ctx, '#101713');
      ctx.beginPath(); ctx.moveTo(0, height * .70);
      ctx.bezierCurveTo(width * .13, height - depth * 1.9, width * .20, height - depth, width * .44, height - depth * .28);
      ctx.bezierCurveTo(width * .69, height - depth * .10, width * .88, height - depth * 1.4, width, height * .77);
      ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
    }
    if (view.grain > .001) {
      ctx.globalAlpha = view.grain; ctx.fillStyle = ink(ctx, '#6b746c');
      const reach = width * (.018 + view.pinch * .4);
      ctx.beginPath(); ctx.moveTo(0, height * .12); ctx.lineTo(reach, height * .30);
      ctx.lineTo(reach * .45, height * .68); ctx.lineTo(reach * 1.7, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(width, height * .22); ctx.lineTo(width - reach * .7, height * .39);
      ctx.lineTo(width - reach, height * .81); ctx.lineTo(width, height); ctx.closePath(); ctx.fill();
    }
  } finally { ctx.restore(); }
  return view;
}

export function drawPlayerConditionFeedback(frame, settings) {
  let view = playerConditionVisualFrame(frame, settings);
  if (!view.visible || view.edge + view.lower < .001) return view;
  uiDraw(({ctx, dpr, cellW, cellH, cols, rows}) => {
    view = paintPlayerConditionFeedback(ctx, frame, {width:cols * cellW * dpr, height:rows * cellH * dpr, ...settings});
  });
  return view;
}
