// CSS-pixel projection of a cord above the plate. Socket coordinates are the
// plug tips, while the jacket joins the backs of the two strain reliefs.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const MAX_LANES = 3;

function seedFraction(seed) {
  const value = String(seed ?? '');
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967295;
}

function harnessOffset(source, lane, laneCount) {
  if (!source.captive || !Number.isFinite(lane)) return 0;
  const count = clamp(Math.round(laneCount ?? MAX_LANES), 1, MAX_LANES);
  const index = clamp(Math.round(lane), 0, count - 1);
  return (index - (count - 1) / 2) * Math.min(4.4, (source.r ?? 6) * .62);
}

function plugAt(point, fallbackRadius, depth, angle, clearance) {
  const radius = Number.isFinite(point.r) ? point.r : fallbackRadius;
  const width = clamp(radius * 1.57, 4.5, 11.4);
  const stem = width * 1.15;
  const exposed = stem * (1 - depth);
  const axis = { x: Math.sin(angle), y: Math.cos(angle) };
  // Foreshorten the connected body for shallow racks while keeping its apparent
  // width. Loose plugs are fully visible once they clear the jack.
  const desired = width * 1.92;
  const projected = Number.isFinite(clearance) && axis.y > .25
    ? clamp((clearance - 3) / axis.y - exposed, desired * .42, desired) : desired;
  const body = projected * .61;
  const boot = projected - body;
  const length = exposed + projected;
  return {
    x: point.x, y: point.y, angle, width, exposed, stem, boot, body, axis,
    tail: { x: point.x + axis.x * length, y: point.y + axis.y * length },
  };
}

function plugPair(source, destination, { radius, held, compatible, lane, laneCount, gutterY }) {
  const x = source.x + harnessOffset(source, lane, laneCount);
  const dx = destination.x - x;
  const dy = destination.y - source.y;
  const side = Math.tanh(dx / 38);
  const looseAngle = Math.atan2(-dx, 22 - dy);
  const start = plugAt(
    { ...source, x }, radius, clamp(source.depth ?? 1, 0, 1), source.angle ?? -side * .075,
    gutterY - source.y,
  );
  if (source.captive) {
    const exitY = Number.isFinite(source.exitY) ? source.exitY : source.y + start.width * .46;
    start.tail = { x, y: exitY };
    start.axis = { x: side * .12, y: 1 };
  }
  const end = plugAt(
    destination, radius, clamp(destination.depth ?? (held ? compatible ? .67 : 0 : 1), 0, 1),
    destination.angle ?? (held && !compatible ? looseAngle : side * .075),
    held ? Infinity : gutterY - destination.y,
  );
  return { start, end };
}

function fittedLength(start, end, seed, lane) {
  const chord = Math.hypot(end.tail.x - start.tail.x, end.tail.y - start.tail.y);
  const slack = clamp(17 - chord * .022 + seedFraction(seed) * 4 + (lane ?? 0) * 3.2, 8, 27);
  return chord + slack;
}

/** Approximate free length in CSS pixels, for the same cord after withdrawal. */
export function fieldPatchCordLength(source, destination, {
  radius = 5, seed = '', lane, laneCount, gutterY = Infinity,
} = {}) {
  const { start, end } = plugPair(source, destination, { radius, lane, laneCount, gutterY });
  return fittedLength(start, end, seed, lane);
}

function hangingCurve(start, end, length, bottom, bias, swing) {
  const a = start.tail, b = end.tail;
  const dx = b.x - a.x, dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  const slack = Math.max(0, length - chord);
  const spread = Math.abs(dx);
  const drop = clamp(Math.sqrt(spread * slack * .38) + slack * .32, 0, 33);
  // When pulled taut, the belly rises and the curve only keeps the two
  // connector bends. With slack, its lowest point shifts toward the higher end.
  const across = Math.sign(dx || 1) * Math.min(62, spread * .225);
  const midpointX = (a.x + b.x) / 2 + across * bias;
  const midpointY = Math.min((a.y + b.y) / 2 + drop + swing, bottom);
  const bend = Math.min(24, chord * .33 + 2, 3 + drop * .68);
  const roomFor = (point, axis) => axis.y > .001
    ? Math.max(0, (bottom - point.y) / axis.y) : Infinity;
  const startBend = Math.min(bend, roomFor(a, start.axis));
  const endBend = Math.min(bend, roomFor(b, end.axis));
  const slope = Math.sign(dy) * Math.min(Math.abs(dy) * .16, Math.max(0, bottom - midpointY));
  return {
    a, b, midpointX, midpointY, across, slope,
    ax: a.x + start.axis.x * startBend,
    ay: a.y + start.axis.y * startBend,
    bx: b.x + end.axis.x * endBend,
    by: b.y + end.axis.y * endBend,
  };
}

function trace(ctx, curve, x = 0, y = 0) {
  const { a, b, ax, ay, bx, by, midpointX, midpointY, across, slope } = curve;
  ctx.beginPath();
  ctx.moveTo(a.x + x, a.y + y);
  ctx.bezierCurveTo(ax + x, ay + y, midpointX - across + x, midpointY - slope + y, midpointX + x, midpointY + y);
  ctx.bezierCurveTo(midpointX + across + x, midpointY + slope + y, bx + x, by + y, b.x + x, b.y + y);
}

function acrossPlug(ctx, width, stops) {
  const gradient = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

function fillRound(ctx, x, y, w, h, r, paint) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = paint;
  ctx.fill();
}

const NICKEL = [
  [0,'#353a37'], [.14,'#686f6b'], [.31,'#b9bcb3'], [.43,'#e4e1d3'],
  [.51,'#a7aaa3'], [.76,'#747a76'], [.92,'#454b48'], [1,'#2a302d'],
];
const BRASS = [
  [0,'#4b3b24'], [.18,'#827047'], [.34,'#bca56d'], [.46,'#e0c98e'],
  [.57,'#a49264'], [.77,'#867044'], [1,'#493c28'],
];
const BOOT = [[0,'#0b0d0a'], [.22,'#1d211c'], [.44,'#434640'], [.67,'#252921'], [1,'#111410']];

function paintTip(ctx, plug) {
  const { width, exposed, stem } = plug;
  if (exposed < .25) return;
  const radius = width * .205;
  const shoulder = Math.min(radius * .72, exposed * .6);
  ctx.beginPath();
  ctx.moveTo(-radius, exposed + .75);
  ctx.lineTo(-radius, shoulder + radius * .22);
  ctx.quadraticCurveTo(-radius * .94, shoulder, -radius * .64, shoulder * .52);
  ctx.quadraticCurveTo(0, -shoulder * .32, radius * .64, shoulder * .52);
  ctx.quadraticCurveTo(radius * .94, shoulder, radius, shoulder + radius * .22);
  ctx.lineTo(radius, exposed + .75);
  ctx.closePath();
  ctx.fillStyle = acrossPlug(ctx, radius * 2, NICKEL);
  ctx.fill();
  for (const fraction of [.29, .62]) {
    const y = exposed - stem * fraction;
    if (y > shoulder + .4) {
      ctx.fillStyle = '#201f1a';
      ctx.fillRect(-radius, y, radius * 2, clamp(width * .075, .48, .92));
    }
  }
}

function paintBoot(ctx, width, shoulder, boot) {
  const near = width * .43, far = width * .22;
  ctx.beginPath();
  ctx.moveTo(-near, shoulder);
  ctx.lineTo(near, shoulder);
  ctx.quadraticCurveTo(near * .78, shoulder + boot * .42, far, shoulder + boot);
  ctx.lineTo(-far, shoulder + boot);
  ctx.quadraticCurveTo(-near * .78, shoulder + boot * .42, -near, shoulder);
  ctx.closePath();
  ctx.fillStyle = acrossPlug(ctx, width * .86, BOOT);
  ctx.fill();
  for (const rib of [.16, .36, .57, .76]) {
    const at = shoulder + boot * rib;
    const half = near + (far - near) * rib;
    ctx.fillStyle = 'rgba(230,230,206,.27)';
    ctx.fillRect(-half, at, half * 1.75, clamp(boot * .095, .36, .70));
    ctx.fillStyle = 'rgba(3,4,2,.64)';
    ctx.fillRect(-half, at + boot * .10, half * 2, clamp(boot * .10, .35, .8));
  }
}

function paintPlug(ctx, plug, color, metal) {
  const { x, y, angle, width, exposed, boot, body } = plug;
  const half = width / 2;
  const shoulder = exposed + body - .35;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  const barrel = acrossPlug(ctx, width, metal === 'brass' ? BRASS : NICKEL);
  // The tight shadow at the jack separates the barrel from the faceplate.
  if (exposed < .55) {
    ctx.beginPath();
    ctx.ellipse(.58, 1.1, half + 1.8, half * .65, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(1,3,2,.77)';
    ctx.fill();
  }
  paintTip(ctx, plug);
  fillRound(ctx, -half + .4, exposed + 1.15, width + 1.1, body + 1.5, 1.5, '#050705a6');
  fillRound(ctx, -half, exposed, width, body, 1.3, barrel);
  fillRound(ctx, -half - .4, exposed, width + .8, Math.max(1.25, body * .21), .7, barrel);
  ctx.fillStyle = 'rgba(250,246,224,.56)';
  ctx.fillRect(-half * .52, exposed + .38, half * .92, .52);
  ctx.fillStyle = '#20251f';
  ctx.fillRect(-half, exposed + body * .27, width, Math.max(1.1, body * .40));
  for (let k = 0; k < 5; k++) {
    const gripX = -half + width * (.13 + k * .17);
    ctx.fillStyle = 'rgba(151,156,143,.40)';
    ctx.fillRect(gripX, exposed + body * .33, .48, body * .27);
  }
  ctx.fillStyle = color;
  ctx.fillRect(-half + .35, exposed + body * .72, width - .7, Math.max(.8, body * .14));
  ctx.fillStyle = 'rgba(255,241,215,.36)';
  ctx.fillRect(-half * .46, exposed + body * .73, half * .8, .46);
  paintBoot(ctx, width, shoulder, boot);
  ctx.restore();
}

function drawJacket(ctx, curve, color, diameter, raised) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace(ctx, curve, .9, raised ? 4.2 : 1.85);
  ctx.strokeStyle = raised ? '#03060457' : '#03060499';
  ctx.lineWidth = diameter + (raised ? 3.9 : 2.3);
  ctx.stroke();
  trace(ctx, curve);
  ctx.strokeStyle = '#131813';
  ctx.lineWidth = diameter + .88;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = diameter;
  ctx.stroke();
  // Offset translucent ribbons model a curved, satin rubber jacket.
  trace(ctx, curve, .22, diameter * .19);
  ctx.strokeStyle = 'rgba(8,12,8,.40)';
  ctx.lineWidth = diameter * .54;
  ctx.stroke();
  trace(ctx, curve, -.18, -diameter * .15);
  ctx.strokeStyle = 'rgba(245,240,218,.24)';
  ctx.lineWidth = diameter * .49;
  ctx.stroke();
  trace(ctx, curve, -.28, -diameter * .22);
  ctx.strokeStyle = 'rgba(252,245,220,.17)';
  ctx.lineWidth = Math.max(.55, diameter * .15);
  ctx.stroke();
}

/**
 * `gutterY` is the bottom edge of the channel, in CSS pixels. Set `lane` and
 * `laneCount` for conductors emerging from one captive SEND. Pass the fitted
 * restLength while lifting an existing plug so its drape responds to tension.
 */
export function drawFieldPatchCord(ctx, source, destination, {
  color = '#c28d4d', radius = 5, seed = '', held = false, compatible = false,
  well = null, gutterY = Infinity, restLength = null, metal = 'nickel',
  lane, laneCount, swing = 0,
} = {}) {
  if (!ctx || ![source?.x, source?.y, destination?.x, destination?.y].every(Number.isFinite)) return;
  const limit = Number.isFinite(gutterY) ? gutterY : Infinity;
  const wellBottom = well && Number.isFinite(well.y + well.h) ? well.y + well.h : Infinity;
  const edge = Math.min(limit, wellBottom);
  const { start, end } = plugPair(source, destination, {
    radius, held, compatible, lane, laneCount, gutterY: edge,
  });
  const length = Number.isFinite(restLength) ? restLength : fittedLength(start, end, seed, lane);
  const diameter = clamp((start.width + end.width) * .20, 2.25, 4.65);
  // Keep the outside of the shadow, not just the curve center, above the lip.
  const reserve = 2.25 + (diameter + 2.3) / 2;
  const bottom = held ? Infinity : Math.max(start.tail.y, end.tail.y, edge - reserve);
  const curve = hangingCurve(start, end, length, bottom, (seedFraction(seed) - .5) * .4, held ? clamp(swing, -1, 1) * 6 : 0);
  ctx.save();
  drawJacket(ctx, curve, color, diameter, held && !compatible);
  if (!source.captive) paintPlug(ctx, start, color, metal);
  paintPlug(ctx, end, color, metal);
  ctx.restore();
}
