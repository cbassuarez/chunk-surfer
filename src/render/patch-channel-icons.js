// Centered, one-ink silkscreen symbols for the 4417-C connector plate.
// Coordinates use a common 20-unit grid so engraving and state ink stay aligned.
function lines(ctx, points) {
  ctx.beginPath();
  for (const [index, [x, y]] of points.entries()) {
    if (index) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
}

function circle(ctx, x, y, radius, solid = false) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (solid) ctx.fill();
  else ctx.stroke();
}

function torch(ctx) {
  // The broad bell and the grip stay distinct at the smallest stencil size.
  lines(ctx, [[2.7, 8], [8.1, 8], [11.6, 5.9], [11.6, 14.1], [8.1, 12], [2.7, 12], [2.7, 8]]);
  lines(ctx, [[6.1, 8.2], [6.1, 11.8]]);
  lines(ctx, [[14.3, 7.6], [17.1, 5.9]]);
  lines(ctx, [[14.8, 10], [18.1, 10]]);
  lines(ctx, [[14.3, 12.4], [17.1, 14.1]]);
}

function recorder(ctx) {
  // Two visible cassette hubs and the head opening identify the medium.
  lines(ctx, [[2.2, 4.8], [17.8, 4.8], [17.8, 15.2], [2.2, 15.2], [2.2, 4.8]]);
  circle(ctx, 6.5, 9, 1.58);
  circle(ctx, 13.5, 9, 1.58);
  lines(ctx, [[8.2, 9], [11.8, 9]]);
  lines(ctx, [[5.5, 15.2], [6.9, 12.7], [13.1, 12.7], [14.5, 15.2]]);
}

function rig(ctx) {
  // The kinked trace and displaced plate edge distinguish the bent bridge.
  lines(ctx, [[2.2, 5.3], [11.7, 5.3], [14.1, 7.5], [17.8, 7.5], [17.8, 15.3], [2.2, 15.3], [2.2, 5.3]]);
  circle(ctx, 5.6, 11.5, 1.13);
  circle(ctx, 10, 11.5, 1.13);
  circle(ctx, 14.4, 11.5, 1.13);
  lines(ctx, [[5.6, 10.3], [5.6, 8.2], [8.2, 8.2], [10, 10.3]]);
}

function nerve(ctx) {
  // The breath control branch. Paired lung lobes share one central airway.
  lines(ctx, [[10, 3], [10, 8.4], [7.8, 10.1]]);
  lines(ctx, [[10, 8.4], [12.2, 10.1]]);
  ctx.beginPath();
  ctx.moveTo(7.4, 6);
  ctx.bezierCurveTo(4.8, 6.7, 2.7, 11, 2.9, 14.4);
  ctx.quadraticCurveTo(3, 16.6, 5.2, 16.3);
  ctx.lineTo(7.9, 15.6);
  ctx.quadraticCurveTo(9, 15.2, 9, 14);
  ctx.lineTo(9, 11.9);
  ctx.moveTo(12.6, 6);
  ctx.bezierCurveTo(15.2, 6.7, 17.3, 11, 17.1, 14.4);
  ctx.quadraticCurveTo(17, 16.6, 14.8, 16.3);
  ctx.lineTo(12.1, 15.6);
  ctx.quadraticCurveTo(11, 15.2, 11, 14);
  ctx.lineTo(11, 11.9);
  ctx.stroke();
}

function fork(ctx) {
  ctx.beginPath();
  ctx.moveTo(5.8, 3);
  ctx.lineTo(5.8, 9);
  ctx.bezierCurveTo(5.8, 11.1, 7.7, 12.5, 10, 12.5);
  ctx.bezierCurveTo(12.3, 12.5, 14.2, 11.1, 14.2, 9);
  ctx.lineTo(14.2, 3);
  ctx.moveTo(10, 12.5);
  ctx.lineTo(10, 17);
  ctx.stroke();
  lines(ctx, [[8.2, 17], [11.8, 17]]);
}

function radio(ctx) {
  // A tilted aerial, tuning window and speaker vent read as a portable set.
  lines(ctx, [[3.3, 7.3], [16.7, 7.3], [16.7, 16.6], [3.3, 16.6], [3.3, 7.3]]);
  lines(ctx, [[5.5, 7.1], [12.5, 3.5]]);
  lines(ctx, [[5.7, 10.1], [14.4, 10.1]]);
  lines(ctx, [[5.7, 12.8], [10.6, 12.8]]);
  lines(ctx, [[5.7, 14.5], [10.6, 14.5]]);
  circle(ctx, 13.6, 13.7, 1.1, true);
}

function spare(ctx) {
  // A loose lead with both plugs visible.
  lines(ctx, [[4, 4.8], [4, 2.9]]);
  lines(ctx, [[16, 4.8], [16, 2.9]]);
  ctx.strokeRect(2.55, 4.8, 2.9, 4);
  ctx.strokeRect(14.55, 4.8, 2.9, 4);
  ctx.beginPath();
  ctx.moveTo(4, 8.8);
  ctx.bezierCurveTo(4, 18.5, 16, 18.5, 16, 8.8);
  ctx.stroke();
}

function portDirection(ctx, input) {
  circle(ctx, 14.1, 10, 3.2);
  lines(ctx, [[2.6, 10], [10.9, 10]]);
  const tip = input ? 9.3 : 3.1;
  const base = input ? 6 : 6.4;
  lines(ctx, [[base, 6.8], [tip, 10], [base, 13.2]]);
}

function passive(ctx) {
  circle(ctx, 10, 10, 5);
  circle(ctx, 10, 10, 1.7, true);
}

function manual(ctx) {
  lines(ctx, [[4.8, 4.4], [15.2, 10], [4.8, 15.6], [4.8, 4.4]]);
}

function special(ctx) {
  lines(ctx, [[11, 2.4], [5.5, 10.9], [9.1, 10.9], [8.4, 17.6], [14.5, 8.9], [10.8, 8.9], [11, 2.4]]);
}

const glyphs = Object.freeze({
  torch, recorder, rig, nerve, fork, radio, spare, passive, manual, special,
  input: ctx => portDirection(ctx, true),
  output: ctx => portDirection(ctx, false),
});

export function drawPatchChannelIcon(ctx, id, x, y, size, {
  color = '#e5dac0', lineWidth,
} = {}) {
  if (!ctx || !Object.hasOwn(glyphs, id) || !(size > 0) || ![x, y, size].every(Number.isFinite)) return false;
  const stroke = lineWidth ?? Math.max(1, Math.min(1.8, size * .085));
  ctx.save();
  ctx.translate(x - size * .5, y - size * .5);
  ctx.scale(size / 20, size / 20);
  ctx.lineWidth = stroke * 20 / size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  glyphs[id](ctx);
  ctx.restore();
  return true;
}
