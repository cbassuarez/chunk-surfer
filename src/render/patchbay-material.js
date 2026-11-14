// Code-native patch hardware. All coordinates are device pixels; no atlas,
// emissive UI text, generated image, or per-frame texture readback is involved.
import { drawHardwareScrew } from './hardware-faceplate.js';

export const PATCH_COLORS = Object.freeze({
  torch: '#e7b64f', recorder: '#d8715d', rig: '#6eabc9',
  nerve: '#8ab879', fork: '#b69bcc', radio: '#d49460',
});

const TAU = Math.PI * 2;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
function gradient(ctx, x, y, w, h, stops) {
  const paint = ctx.createLinearGradient(x, y, x + w, y + h);
  for (const [at, color] of stops) paint.addColorStop(at, color);
  return paint;
}
function disc(ctx, x, y, r, paint) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = paint; ctx.fill();
}

/** A continuous rack strip, not a collection of button surrounds. */
export function drawPatchRack(ctx, x, y, w, h, { dpr = 1, seed = 0 } = {}) {
  if (!ctx || w <= 0 || h <= 0) return;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#080a09'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = gradient(ctx, x, y, 0, h, [
    [0, '#434944'], [.04, '#262d29'], [.34, '#202522'], [.82, '#171c19'], [1, '#323a34'],
  ]);
  ctx.fillRect(x + dpr, y + dpr, w - dpr * 2, h - dpr * 2);
  ctx.fillStyle = 'rgba(204,214,193,.15)';
  ctx.fillRect(x + dpr, y + dpr, w - dpr * 2, dpr * .55);
  // A punched horizontal opening reads as one rack unit across six modules.
  ctx.fillStyle = '#101411';
  ctx.fillRect(x + 7 * dpr, y + h * .54, w - 14 * dpr, h * .36);
  const screwR = Math.min(3.0 * dpr, h * .105);
  if (w > 80 * dpr) {
    drawHardwareScrew(ctx, x + 4.5 * dpr, y + h * .52, screwR, { dpr, seed: `${seed}:l` });
    drawHardwareScrew(ctx, x + w - 4.5 * dpr, y + h * .52, screwR, { dpr, seed: `${seed}:r` });
  }
  ctx.restore();
}

const JACK_FINISH = {
  brass: ['#d7ba82', '#847044', '#463725', '#a98c56', '#665035'],
  nickel: ['#e1e2cf', '#878c81', '#434b48', '#c3c6b5', '#696e63'],
};

function drawJackMount(ctx, x, y, r, finish, dpr) {
  const colors = JACK_FINISH[finish];
  ctx.beginPath();
  for (let facet = 0; facet < 6; facet++) {
    const angle = TAU * facet / 6 + Math.PI / 6;
    const fx = x + Math.cos(angle) * r * 1.22;
    const fy = y + Math.sin(angle) * r * 1.22;
    if (facet === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
  }
  ctx.closePath();
  ctx.fillStyle = gradient(ctx, x - r, y - r, r * 2, r * 2, colors.map((color, i) => [i / 4, color]));
  ctx.fill();
  ctx.lineWidth = dpr * .55;
  ctx.strokeStyle = '#251e15';
  ctx.stroke();
}

/** A real jack mouth: insulating ring, turned nickel lip, bevel and throat. */
export function drawPatchSocket(ctx, x, y, radius, {
  color = '#b9b6a5', connected = false, selected = false,
  compatible = false, available = true, dpr = 1, hardware = null,
} = {}) {
  if (!ctx || radius <= 0) return;
  const r = radius;
  ctx.save(); ctx.shadowBlur = 0;
  disc(ctx, x, y + r * .13, r * 1.12, '#070a08');
  if (hardware) drawJackMount(ctx, x, y, r, hardware, dpr);
  disc(ctx, x, y, r, color);
  // The coloured insulation is a physical ring even on an unavailable socket.
  const lip = hardware ? JACK_FINISH[hardware] : ['#ddd9c4', '#92998c', '#454e45', '#bdc2b1', '#586254'];
  const lipStops = [[0, lip[0]], [.26, lip[1]], [.45, lip[2]], [.71, lip[3]], [1, lip[4]]];
  disc(ctx, x, y, r * .81, gradient(ctx, x - r, y - r, r * 2, r * 2, lipStops));
  disc(ctx, x, y, r * .6, '#10140f');
  disc(ctx, x - r * .025, y + r * .045, r * .49,
    gradient(ctx, x, y - r * .5, 0, r, [[0, '#020402'], [.8, '#080e08'], [1, '#414a3b']]));
  ctx.beginPath(); ctx.arc(x, y, r * .73, Math.PI * 1.05, Math.PI * 1.7);
  ctx.strokeStyle = '#eeedce'; ctx.lineWidth = Math.max(.4 * dpr, r * .075); ctx.stroke();
  if (connected) disc(ctx, x, y, r * .19, '#aba996');
  // Small printed alignment indexes are separated from socket illumination.
  if (selected || compatible) {
    ctx.strokeStyle = compatible ? '#e7e7c8' : color;
    ctx.lineWidth = dpr;
    const span = r * 1.28;
    for (const sign of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x + sign * span, y - r * .36);
      ctx.lineTo(x + sign * span, y + r * .36); ctx.stroke();
    }
  }
  if (!available) {
    // A dead circuit does not erase the colour needed to identify its mate.
    ctx.fillStyle = '#657063'; ctx.fillRect(x - dpr, y + r * 1.28, dpr * 2, dpr * .6);
  }
  ctx.restore();
}

/** A branch's captive wire ends enter a common strain-relief gland. */
export function drawPatchSupply(ctx, x, y, radius, {
  color = '#b9b6a5', available = true, selected = false, dpr = 1, hardware = null,
} = {}) {
  if (!ctx || radius <= 0) return;
  ctx.save(); ctx.shadowBlur = 0;
  const half = Math.max(radius, 2.6 * dpr);
  if (hardware) {
    drawJackMount(ctx, x, y, half, hardware, dpr);
    disc(ctx, x, y, half * .79, color);
    disc(ctx, x, y, half * .61, '#15140e');
    if (available || selected) {
      ctx.beginPath(); ctx.arc(x, y, half * 1.31, Math.PI * 1.1, Math.PI * 1.9);
      ctx.strokeStyle = selected ? '#eee4bd' : '#c8ab79';
      ctx.lineWidth = dpr * .7;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#0c100d';
  ctx.fillRect(x - half - .6 * dpr, y - half * .62, half * 2 + 1.2 * dpr, half * 1.5);
  ctx.fillStyle = gradient(ctx, x, y - half * .62, 0, half * 1.5,
    [[0, '#848a78'], [.2, '#464f43'], [.63, '#252c24'], [1, '#101611']]);
  ctx.fillRect(x - half, y - half * .62, half * 2, half * 1.24);
  ctx.fillStyle = color;
  ctx.fillRect(x - half * .75, y - half * .5, half * 1.5, .8 * dpr);
  ctx.fillStyle = '#111713';
  ctx.fillRect(x - half * .64, y + half * .33, half * 1.28, half * .53);
  if (selected || available) {
    ctx.fillStyle = selected ? '#e7e7c8' : '#8d997d';
    ctx.fillRect(x - half * .69, y - half * .94, half * 1.38, dpr);
  }
  ctx.restore();
}

/** A recessed place to stow the pulled lead, formed in the case above the panel. */
export function drawPatchReturnWell(ctx, x, y, w, h, { dpr = 1, active = false } = {}) {
  if (w < 8 * dpr || h < 6 * dpr) return;
  ctx.save();
  const round = (inset, fill) => {
    ctx.beginPath();
    ctx.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, Math.min(h * .26, 5 * dpr));
    ctx.fillStyle = fill;
    ctx.fill();
  };
  round(0, gradient(ctx, x, y, 0, h, [[0, '#2d362c'], [.46, '#111611'], [1, '#707362']]));
  round(dpr, gradient(ctx, x, y, 0, h, [[0, '#0a0d0a'], [.31, '#171c16'], [1, '#30382d']]));
  round(dpr * 2, gradient(ctx, x, y, 0, h, [[0, '#070a07'], [.68, '#161a14'], [1, '#1e251b']]));
  ctx.fillStyle = active ? '#d5c28c' : '#727b65';
  const gripW = Math.min(h * .46, w * .08);
  for (const side of [x + h * .32, x + w - h * .32 - gripW]) {
    for (let notch = 0; notch < 3; notch++) {
      ctx.fillRect(side, y + h * (.40 + notch * .11), gripW, dpr * .52);
    }
  }
  ctx.restore();
}

const SUPPLY_LANES = [0, -1.7, 1.7, -2.8, 2.8];

export function patchSupplyAnchor(point, index, dpr = 1) {
  const offset = SUPPLY_LANES[Math.min(index, SUPPLY_LANES.length - 1)];
  return { x: point.x + offset * dpr, y: point.y, captive: true };
}

export function patchCableCurve(from, to, { sag = null, side = 1, dpr = 1, gutterX = null } = {}) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const drop = sag == null ? clamp(22 * dpr - length * .095, 4 * dpr, 22 * dpr) : Math.max(0, sag);
  const bend = Math.min(length * .32 + 2 * dpr, drop + 4 * dpr);
  const upstream = from.axis || { x: 0, y: 1 };
  const downstream = to.axis || { x: 0, y: 1 };
  const bow = side * Math.min(drop * .26, bend * .4);
  if (Number.isFinite(gutterX)) {
    const reach = Math.min(Math.max(8 * dpr, dy * .17), 26 * dpr);
    const gutterTop = { x: gutterX, y: from.y + reach };
    const gutterBottom = { x: gutterX, y: to.y - reach };
    return {
      from, to, sections: [
        { c1: { x: from.x, y: from.y + reach * .6 }, c2: { x: gutterX, y: from.y + reach * .25 }, to: gutterTop },
        { c1: { x: gutterX - drop * .25, y: gutterTop.y + reach }, c2: { x: gutterX - drop * .25, y: gutterBottom.y - reach }, to: gutterBottom },
        { c1: { x: gutterX, y: to.y + reach * .4 }, c2: { x: to.x, y: to.y + reach * .8 }, to },
      ],
    };
  }
  return {
    from: { x: from.x, y: from.y },
    c1: { x: from.x + upstream.x * bend + bow, y: from.y + upstream.y * bend },
    c2: { x: to.x + downstream.x * bend + bow, y: to.y + downstream.y * bend },
    to: { x: to.x, y: to.y },
  };
}

function trace(ctx, curve, offsetX = 0, offsetY = 0) {
  ctx.beginPath(); ctx.moveTo(curve.from.x + offsetX, curve.from.y + offsetY);
  for (const section of curve.sections || [curve]) {
    ctx.bezierCurveTo(section.c1.x + offsetX, section.c1.y + offsetY,
      section.c2.x + offsetX, section.c2.y + offsetY, section.to.x + offsetX, section.to.y + offsetY);
  }
}

function patchPlug(end, radius, dpr) {
  const width = clamp(radius * 1.32, 2.8 * dpr, 7 * dpr);
  const reach = Math.max(width, end.reach ?? Infinity);
  const body = Math.min(width * 1.43, reach * .67);
  const boot = Math.min(width * .72, reach * .33);
  const shaft = width * 1.2;
  const angle = end.angle || 0;
  const depth = clamp(end.depth ?? 1, 0, 1);
  const axis = { x: -Math.sin(angle), y: Math.cos(angle) };
  const anchor = (1 - depth) * shaft + body + boot;
  return { ...end, axis, width, body, boot, shaft, angle, depth,
    tail: { x: end.x + axis.x * anchor, y: end.y + axis.y * anchor, axis } };
}

function drawPatchPlug(ctx, plug, color, dpr, hardware) {
  const { x, y, width, body, boot, shaft, depth, angle } = plug;
  const shoulder = shaft * (1 - depth);
  const shaftWidth = width * .49;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  if (shoulder > .12 * dpr) {
    // A pushed-in shaft is occluded by the jack mouth. Only a fully loose
    // end exposes the point and all of its insulating bands.
    const tip = Math.min(shoulder * .6, shaftWidth * .45);
    ctx.fillStyle = gradient(ctx, -shaftWidth / 2, 0, shaftWidth, 0,
      [[0, '#6e776a'], [.35, '#eee9d2'], [.66, '#c5c5ac'], [1, '#777f6d']]);
    ctx.beginPath(); ctx.moveTo(-shaftWidth / 2, shoulder);
    ctx.lineTo(-shaftWidth / 2, tip); ctx.quadraticCurveTo(0, -tip * .62, shaftWidth / 2, tip);
    ctx.lineTo(shaftWidth / 2, shoulder); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#30372d';
    for (const band of [.3, .63]) {
      const bandY = shoulder - shaft * band;
      if (bandY > tip) ctx.fillRect(-shaftWidth / 2, bandY, shaftWidth, .65 * dpr);
    }
  }
  const collar = Math.max(dpr, width * .15);
  ctx.fillStyle = hardware ? JACK_FINISH[hardware][3] : '#b2b09a';
  ctx.fillRect(-width * .49, shoulder - .24 * dpr, width * .98, collar);
  const shell = hardware ? JACK_FINISH[hardware] : null;
  ctx.fillStyle = gradient(ctx, -width / 2, shoulder, width, 0, shell
    ? [[0, shell[2]], [.23, shell[1]], [.43, shell[0]], [.61, shell[3]], [1, shell[2]]]
    : [[0, '#141b16'], [.25, '#343e35'], [.58, '#4b5244'], [1, '#141a15']]);
  ctx.fillRect(-width / 2, shoulder + collar, width, body - collar);
  ctx.fillStyle = color;
  const bandY = shoulder + collar + (hardware ? body * .44 : 0);
  const bandWidth = width * (hardware ? .86 : .82);
  ctx.fillRect(-bandWidth / 2, bandY, bandWidth, width * (hardware ? .23 : .34));
  if (hardware) {
    ctx.fillStyle = 'rgba(17,13,8,.42)';
    for (const mark of [-.32, -.18, .06, .30]) {
      ctx.fillRect(mark * width, shoulder + collar + dpr, .55 * dpr, Math.max(0, bandY - shoulder - collar - dpr));
    }
  }
  ctx.fillStyle = '#171d17';
  ctx.beginPath(); ctx.moveTo(-width * .42, shoulder + body);
  ctx.lineTo(width * .42, shoulder + body);
  ctx.lineTo(width * .28, shoulder + body + boot);
  ctx.lineTo(-width * .28, shoulder + body + boot); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#565e50';
  for (const rib of [.16, .42, .68]) {
    const inset = width * (.39 - rib * .13);
    ctx.fillRect(-inset, shoulder + body + rib * boot, inset * 2, .55 * dpr);
  }
  ctx.restore();
}

/** A lead starts behind each plug's strain relief. End depth runs from loose to seated. */
export function drawPatchCable(ctx, from, to, {
  color = '#dbad4e', dpr = 1, radius = 5, preview = false,
  valid = true, side = 1, sag = null, gutterX = null, hardware = null,
} = {}) {
  if (!ctx || ![from?.x, from?.y, to?.x, to?.y].every(Number.isFinite)) return;
  const source = patchPlug(from, radius, dpr);
  const input = patchPlug(to, radius, dpr);
  const sourceTail = from.captive ? { x: from.x, y: from.y + radius * .64, axis: source.axis } : source.tail;
  const curve = patchCableCurve(sourceTail, input.tail, { side, sag, dpr, gutterX });
  ctx.save(); ctx.shadowBlur = 0; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (preview) ctx.globalAlpha *= valid ? 1 : .89;
  const core = hardware ? Math.min(3.7 * dpr, Math.max(2.1 * dpr, source.width * .51))
    : Math.min(3.1 * dpr, Math.max(1.9 * dpr, source.width * .46));
  trace(ctx, curve, .85 * dpr, 1.8 * dpr);
  ctx.strokeStyle = 'rgba(0,0,0,.64)'; ctx.lineWidth = core + 2.2 * dpr; ctx.stroke();
  trace(ctx, curve); ctx.strokeStyle = '#0c110d'; ctx.lineWidth = core + 1.35 * dpr; ctx.stroke();
  trace(ctx, curve); ctx.strokeStyle = color; ctx.lineWidth = core; ctx.stroke();
  trace(ctx, curve, -.23 * dpr, -.4 * dpr);
  ctx.strokeStyle = 'rgba(243,239,204,.24)'; ctx.lineWidth = .56 * dpr; ctx.stroke();
  if (hardware) {
    trace(ctx, curve);
    ctx.strokeStyle = 'rgba(43,32,23,.28)';
    ctx.setLineDash([dpr * .65, dpr * 2.25]);
    ctx.lineWidth = core * .79;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (!from.captive) drawPatchPlug(ctx, source, color, dpr, hardware);
  drawPatchPlug(ctx, input, color, dpr, hardware);
  ctx.restore();
}

/** Removable service tape with paper thickness, never a raised button. */
export function drawPatchLabel(ctx, x, y, w, h, { color = '#c3c1a7', dpr = 1, selected = false } = {}) {
  if (!ctx || w <= 0 || h <= 0) return;
  ctx.save(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,.44)'; ctx.fillRect(x + .5 * dpr, y + dpr, w, h);
  ctx.fillStyle = gradient(ctx, x, y, 0, h, [[0, '#d2ceb4'], [.1, color], [.86, color], [1, '#a49f84']]);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(250,247,214,.38)'; ctx.fillRect(x, y, w, .5 * dpr);
  if (selected) {
    ctx.fillStyle = '#141b14'; ctx.fillRect(x + dpr, y + dpr, Math.min(2 * dpr, w * .04), Math.max(0, h - 2 * dpr));
  }
  ctx.restore();
}
