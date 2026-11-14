import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import './chapel-desktop-surface.css';

const canvas = document.querySelector('canvas');
const context = canvas.getContext('2d', { alpha: true });
const target = getCurrentWebviewWindow().label === 'chapel-desktop-target';
const receiverButton = document.querySelector('.receiver');
const background = document.createElement('canvas');
const stars = document.createElement('canvas');
const plate = new Image();
let current = null;
let frameRequest = 0;

const limit = (value, low, high) => Math.min(high, Math.max(low, value));
const lerp = (from, to, t) => from + (to - from) * t;
const eased = t => t * t * (3 - 2 * t);

const THEMES = Object.freeze({
  chapel: { label: 'Parry the Chapel strike' },
  tower: { label: 'Catch the Tower clapper', light: '#f4d89a', edge: '#927551', dim: '#41332a', void: '#171317' },
  'source-ii': { label: 'Close the folded seam', light: '#b5e3cd', edge: '#588077', dim: '#244946', void: '#081a20' },
  'source-iii': { label: 'Close the catcher seam', light: '#dbc1ee', edge: '#876c9e', dim: '#45314e', void: '#151120' },
  'source-final': { label: 'Return Hush through the seam', light: '#f4dbbf', edge: '#8a6b79', dim: '#4d343d', void: '#1c1522' },
});
const WARMUP_SECONDS = .235;
const TAIL_SECONDS = .535;

function stroke(ctx, points, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const [index, point] of points.entries()) {
    if (index === 0) ctx.moveTo(...point);
    else ctx.lineTo(...point);
  }
  ctx.stroke();
}

function polygon(ctx, points, fill, edge, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = width; ctx.stroke(); }
}

function seeded(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function grain(ctx, width, height, shade, seed) {
  const random = seeded(seed);
  for (let i = 0; i < width * height / 105; i++) {
    ctx.globalAlpha = .025 + random() * .12;
    ctx.fillStyle = i % 5 ? shade : '#000';
    ctx.fillRect(Math.floor(random() * width), Math.floor(random() * height), i % 7 ? 1 : 2, 1);
  }
  ctx.globalAlpha = 1;
}

function arch(ctx, x, y, width, height, outline, fill, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(x - width, y);
  ctx.lineTo(x - width, y - height * .46);
  ctx.bezierCurveTo(x - width, y - height * .68, x - width * .61, y - height * .84, x, y - height);
  ctx.bezierCurveTo(x + width * .61, y - height * .84, x + width, y - height * .68, x + width, y - height * .46);
  ctx.lineTo(x + width, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

function field(ctx, x, y, radius, bright, dark) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, bright);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function buildNave(width, height, receiver) {
  // The authored Chapel capture supplies the masonry and pew texture. The
  // perspective drawing extends it into exposed desktop, around the receiver.
  const ctx = background.getContext('2d');
  background.width = width;
  background.height = height;
  const vx = lerp(width * .5, receiver.x, .5);
  const vy = limit(receiver.y, height * .33, height * .61);
  ctx.fillStyle = '#101518';
  ctx.fillRect(0, 0, width, height);
  field(ctx, vx, vy, Math.max(width, height) * .7, '#31413d', '#101518');
  const span = Math.min(width, height);
  const apertureWidth = span * .075;
  const apertureHeight = span * .24;
  arch(ctx, vx, vy + apertureHeight * .29, apertureWidth, apertureHeight, '#606f64', '#181b24', 1.5);
  arch(ctx, vx, vy + apertureHeight * .27, apertureWidth * .81, apertureHeight * .86, '#819187', '#232b2b');
  for (const offset of [-.49, 0, .49]) {
    arch(ctx, vx + apertureWidth * offset, vy + apertureHeight * .22, apertureWidth * .18, apertureHeight * .56,
      '#6f736b', offset === 0 ? '#555b51' : '#394840');
  }
  for (let depth = 7; depth >= 0; depth--) {
    const k = Math.pow(1.29, depth);
    const archWidth = apertureWidth * 1.17 * k;
    const archHeight = apertureHeight * 1.2 * k;
    const floor = vy + apertureHeight * .3 * k;
    arch(ctx, vx, floor, archWidth, archHeight, `rgba(14, 21, 24, ${.29 + depth * .046})`, null, 4 + k * 2.3);
    arch(ctx, vx, floor, archWidth + 2 + k, archHeight + k * 3, `rgba(152, 165, 146, ${.12 + depth * .023})`, null, .7 + k * .23);
    for (const side of [-1, 1]) {
      const x = vx + side * archWidth;
      stroke(ctx, [[x - side * k * 4, floor], [x - side * k * 4, floor - archHeight * .45]], '#344443', Math.min(3, k));
      stroke(ctx, [[x, floor], [x + side * archWidth * .22, floor + k * 8]], '#172325', 2 + k);
      stroke(ctx, [[x, floor - k * 4], [x + side * archWidth * .22, floor + k * 4]], '#4b5851');
    }
  }
  for (let index = -7; index <= 7; index++) {
    stroke(ctx, [[vx + index * 9, vy + apertureHeight * .28], [vx + index * span * .14, height]], 'rgba(154,165,137,.16)');
  }
  for (let step = 0; step < 11; step++) {
    const y = vy + (height - vy) * Math.pow((step + 2) / 12, 2.4);
    stroke(ctx, [[0, y], [width, y]], 'rgba(83,97,87,.34)');
  }
  if (plate.naturalWidth) {
    ctx.globalAlpha = .57;
    ctx.globalCompositeOperation = 'screen';
    const imageHeight = Math.max(height * .8, width * plate.naturalHeight / plate.naturalWidth);
    const imageWidth = imageHeight * plate.naturalWidth / plate.naturalHeight;
    ctx.drawImage(plate, vx - imageWidth * .58, vy - imageHeight * .52, imageWidth, imageHeight);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  let seed = 414;
  for (let i = 0; i < width * height / 45; i++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const x = seed % width;
    const y = (seed >>> 14) % height;
    const near = Math.max(0, 1 - Math.hypot(x - vx, (y - vy) * .8) / span);
    ctx.fillStyle = i % 3 ? `rgba(157,168,142,${near * .13})` : 'rgba(4,9,12,.32)';
    ctx.fillRect(x, y, i % 5 ? 1 : 2, 1);
  }
  const vignette = ctx.createRadialGradient(vx, vy, span * .17, vx, vy, Math.max(width, height) * .73);
  vignette.addColorStop(0, 'rgba(10,14,18,0)');
  vignette.addColorStop(1, 'rgba(6,9,13,.76)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function tracePoint(state, t) {
  const { entry, receiver } = state;
  const dx = receiver.x - entry.x;
  const dy = receiver.y - entry.y;
  return [lerp(entry.x, receiver.x, t) + Math.sin(Math.PI * t) * dy * .08,
    lerp(entry.y, receiver.y, t) - Math.sin(Math.PI * t) * dx * .08];
}

function radialEdges(ctx, center, width, height, rotate, rows, color) {
  for (let row = 0; row < rows; row++) {
    const t = row / (rows - 1);
    const near = .07 + t * t;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rotate);
    stroke(ctx, [[-width * near, height * near], [-width * near, -height * near],
      [width * near, -height * near], [width * near, height * near]], color, 1 + t * 3);
    ctx.restore();
  }
}

function buildTower(width, height, receiver) {
  const ctx = background.getContext('2d');
  const floor = height * .84;
  const vanishX = lerp(width * .5, receiver.x, .54);
  ctx.fillStyle = '#16141a';
  ctx.fillRect(0, 0, width, height);
  field(ctx, receiver.x, receiver.y, Math.max(width, height) * .55, '#514238', '#171318');
  field(ctx, vanishX, height * .26, Math.min(width, height) * .4, '#6a5843', 'rgba(55,36,26,0)');

  for (let index = -3; index <= 3; index++) {
    const x = vanishX + index * width * .125;
    const half = width * .037;
    polygon(ctx, [[x - half, floor], [x - half, height * .13], [x, height * .04],
      [x + half, height * .13], [x + half, floor]], '#100f15', '#45404b');
    for (let slat = 0; slat < 12; slat++) {
      const y = height * (.16 + slat * .049);
      stroke(ctx, [[x - half * .88, y + 6], [x + half * .88, y]], '#302b35', 3);
      stroke(ctx, [[x - half * .88, y + 7], [x + half * .88, y + 1]], '#57463a');
    }
  }

  // All six bells hang from the same braced timber and share the active rope.
  // Frames are fixed in screen space. The clapper moves against real stops.
  for (const y of [height * .13, height * .41, height * .76]) {
    polygon(ctx, [[0, y - height * .02], [width, y - height * .036], [width, y + height * .02],
      [0, y + height * .03]], '#262127', '#705745', 1.5);
    stroke(ctx, [[0, y], [width, y - height * .016]], '#473734', 2);
  }
  for (let bay = -2; bay <= 3; bay++) {
    const x = vanishX + (bay - .5) * width * .137;
    const spread = width * .081;
    stroke(ctx, [[x - spread, height * .45], [x + spread, height * .115]], '#211d22', 11);
    stroke(ctx, [[x - spread, height * .45], [x + spread, height * .115]], '#654d40', 1);
    stroke(ctx, [[x, height * .115], [x, height * .02]], '#8a6a55', 4);
    stroke(ctx, [[x, floor], [x, height * .42]], '#19171b', 12);
  }
  grain(ctx, width, height, '#c6a47d', 1928);
}

function bell(ctx, center, radius, tilt, color, highlight) {
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(tilt);
  const r = radius;
  const metal = ctx.createLinearGradient(-r, 0, r, 0);
  metal.addColorStop(0, '#20191c');
  metal.addColorStop(.4, color);
  metal.addColorStop(.61, highlight);
  metal.addColorStop(.64, color);
  metal.addColorStop(1, '#211b20');
  ctx.beginPath();
  ctx.moveTo(-r * .31, -r * .82);
  ctx.bezierCurveTo(-r * .72, -r * .62, -r * .58, r * .36, -r, r * .56);
  ctx.bezierCurveTo(-r * .75, r * .82, r * .75, r * .82, r, r * .56);
  ctx.bezierCurveTo(r * .58, r * .36, r * .72, -r * .62, r * .31, -r * .82);
  ctx.closePath();
  ctx.fillStyle = metal;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * .025);
  ctx.strokeStyle = highlight;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, r * .57, r * .84, r * .135, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#151219';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function responseProgress(state, seconds) {
  const readyAt = state.readyAt == null ? WARMUP_SECONDS : (state.readyAt - state.started) / 1000;
  return limit((seconds - readyAt) / state.responseSeconds, 0, 1);
}

function towerClapper(state, receiver, seconds, approach, release, size) {
  const progress = state.reducedMotion ? 1 : approach;
  const hit = state.outcome === 'hit';
  const failed = state.outcome === 'miss';
  const speed = state.reducedMotion ? 0 : (hit ? 1 - eased(release) : 1);
  return {
    x: receiver.x + Math.sin(seconds * 7) * size * .15 * speed * progress
      + (failed && !state.reducedMotion ? release * size * .41 : 0),
    y: receiver.y + (1 - progress) * size * .64,
  };
}

function paintTowerBackdrop(state, approach, release, seconds) {
  const { entry, receiver, reduceFlash, reducedMotion } = state;
  const unit = Math.min(background.height, background.width);
  const center = { x: receiver.x, y: receiver.y - unit * .073 };
  const clapper = towerClapper(state, receiver, seconds, approach, release, 76);
  const hit = state.outcome === 'hit';
  const failed = state.outcome === 'miss';
  const color = failed ? '#ce836a' : hit ? '#bad5ad' : '#eecb8b';
  const fade = 1 - Math.pow(release, 2);
  context.globalAlpha = fade;
  context.drawImage(background, 0, 0);
  for (let i = 0; i < 5; i++) {
    const x = receiver.x + (i - 2.5) * unit * .24;
    const y = receiver.y + (i % 2 ? -1 : 1) * unit * .035;
    const radius = unit * (.079 + .01 * (i % 3));
    const tilt = reducedMotion ? 0 : Math.sin(seconds * 5.8 + i * .5) * .15 * (failed ? 1 : .42) * (hit ? 1 - eased(release) : 1);
    stroke(context, [[x, unit * .22], [x, y - radius * .8]], '#826e54', 2.2);
    bell(context, { x, y }, radius, tilt, '#665245', '#a98b65');
  }
  const tilt = reducedMotion ? 0 : Math.sin(seconds * 5.8) * .06 * (hit ? 1 - eased(release) : 1);
  bell(context, center, unit * .101, tilt, '#7d6047', color);

  // The rope's lower end is through the game frame. When missed its tip
  // snaps toward that same point. On a hit, two fixed jaws arrest the weight.
  const load = responseProgress(state, seconds);
  const dx = clapper.x - entry.x;
  const dy = clapper.y - entry.y;
  const sweep = failed && !reducedMotion ? 1 - eased(release) : eased(approach);
  const points = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16 * sweep;
    const wave = reducedMotion || hit ? 0 : Math.sin(t * Math.PI * 2 - seconds * 7) * Math.sin(t * Math.PI) * (4 + load * 6);
    return [entry.x + dx * t, entry.y + dy * t + wave];
  });
  stroke(context, points, '#201717', 6);
  stroke(context, points, color, 1.8);
  stroke(context, [[center.x, center.y - unit * .09], [clapper.x, clapper.y]], color, 2.8);
  field(context, clapper.x, clapper.y, 68, reduceFlash ? 'rgba(241,203,137,.06)' : 'rgba(241,203,137,.21)', 'rgba(241,203,137,0)');

  if ((!reducedMotion || failed) && !(hit && release > .28)) {
    const lineStart = failed ? release * 2 : load * .57;
    for (let i = 1; i <= 4; i++) {
      const f = lineStart + i * .22;
      const r = 34 + f * unit * .32;
      context.globalAlpha = fade * (reduceFlash ? .22 : .38) * Math.max(.14, 1 - f * .31);
      context.beginPath();
      context.ellipse(clapper.x, clapper.y, r, r * .44, 0, 0, Math.PI * 2);
      context.lineWidth = i === 1 ? 1.7 : 1;
      context.strokeStyle = color;
      context.stroke();
    }
  }
  context.globalAlpha = 1;
}

function paintTowerTarget(state, width, height, approach, release, seconds) {
  const theme = THEMES.tower;
  const failed = state.outcome === 'miss';
  const hit = state.outcome === 'hit';
  const reach = state.reducedMotion ? 1 : eased(limit((approach - .32) / .68, 0, 1));
  const color = failed ? '#ce836a' : hit ? '#bad5ad' : theme.light;
  const center = { x: width * .5, y: height * .52 };
  const clapper = towerClapper(state, center, seconds, approach, release, Math.min(width, height) * .62);
  const hingeY = height * .07;
  const lock = hit ? eased(release) : 0;
  context.globalAlpha = reach * (1 - Math.pow(release, 1.8));
  context.fillStyle = 'rgba(25,21,24,.92)';
  context.fillRect(1, 1, width - 2, height - 2);
  bell(context, { x: center.x, y: height * .33 }, width * .36, 0, theme.edge, color);
  stroke(context, [[center.x, hingeY], [clapper.x, clapper.y + 4]], color, 2.7);
  context.globalAlpha *= .9;
  const gap = width * (.31 - lock * .2);
  for (const side of [-1, 1]) {
    const x = center.x + side * gap;
    stroke(context, [[x + side * 9, height * .4], [x, height * .47], [x, height * .66],
      [x + side * 9, height * .73]], color, 2.3);
    stroke(context, [[x + side * 9, height * .52], [x + side * 5, height * .52]], color, 1.3);
  }
  context.beginPath();
  context.ellipse(clapper.x, clapper.y, width * .125, width * .145, 0, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.globalAlpha = 1;
}

function sourceBasis({ entry, receiver }) {
  const dx = receiver.x - entry.x;
  const dy = receiver.y - entry.y;
  const distance = Math.hypot(dx, dy) || 1;
  return { along: { x: dx / distance, y: dy / distance }, across: { x: -dy / distance, y: dx / distance }, distance };
}

function fromAxis(origin, { along, across }, depth, lateral) {
  return [origin.x + along.x * depth + across.x * lateral, origin.y + along.y * depth + across.y * lateral];
}

function buildStarField(width, height) {
  const ctx = stars.getContext('2d');
  stars.width = width;
  stars.height = height;
  ctx.fillStyle = '#150d22';
  ctx.fillRect(0, 0, width, height);
  const random = seeded(21991);
  for (let i = 0; i < Math.min(width * height / 235, 4100); i++) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    ctx.fillStyle = ['#4e307a', '#a275bb', '#cf94d4', '#e6c7eb', '#4e718c'][i % 5];
    ctx.globalAlpha = .28 + random() * .72;
    ctx.fillRect(x, y, i % 3 ? 1 : 2, i % 5 ? 1 : 2);
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 17; i++) {
    const x = width * random();
    const y = height * random();
    const radius = 13 + random() * 34;
    field(ctx, x, y, radius, 'rgba(172,74,196,.42)', 'rgba(107,42,153,0)');
    stroke(ctx, [[x - 7, y], [x + 7, y]], '#a589c3', 1);
    stroke(ctx, [[x, y - 11], [x, y + 11]], '#a589c3', 1);
  }
}

function buildSource(width, height, state) {
  const ctx = background.getContext('2d');
  const theme = THEMES[state.theme];
  const { entry, receiver } = state;
  const basis = sourceBasis(state);
  const unit = Math.min(width, height);
  ctx.fillStyle = theme.void;
  ctx.fillRect(0, 0, width, height);
  field(ctx, receiver.x, receiver.y, Math.max(width, height) * .62, theme.dim, theme.void);

  if (state.theme === 'source-ii') {
    // A real resemblance to II's terrain. Floor, wall and underside meet on
    // different axes, carrying the same edge and transverse rail into the seam.
    for (let i = 8; i >= 0; i--) {
      const d = (i - 4) * unit * .168;
      const cross = (i % 2 ? -.14 : .16) * unit;
      const origin = { x: receiver.x + basis.along.x * d, y: receiver.y + basis.along.y * d };
      const p = (z, y) => fromAxis(origin, basis, z * unit, cross + y * unit);
      polygon(ctx, [p(-.18, .40), p(.14, .21), p(.32, .36), p(.02, .58)], '#153135', '#567d75');
      polygon(ctx, [p(.14, -.55), p(.14, .21), p(.32, .36), p(.34, -.30)], '#102528', '#355d5b');
      polygon(ctx, [p(.01, -.43), p(.14, -.55), p(.34, -.30), p(.23, -.18)], '#23474a', '#60877f');
      for (let grid = 0; grid < 6; grid++) {
        const step = grid * .044;
        stroke(ctx, [p(-.15 + step, .39 - step * .55), p(.022 + step, .57 - step * .70)], '#315558');
        stroke(ctx, [p(.14, -.49 + grid * .12), p(.32, -.25 + grid * .12)], '#244448');
      }
    }
    radialEdges(ctx, entry, width * .63, height * .66, -.22, 8, '#225153');
  } else if (state.theme === 'source-iii') {
    // The Catch stays overhead. Empty sectors between the supported ledges
    // expose the shaft, with the desktop receiver at the end of one plate.
    const cx = lerp(width * .47, receiver.x, .35);
    const cy = lerp(height * .58, receiver.y, .32);
    for (let ring = 4; ring >= 0; ring--) {
      const r = unit * (.18 + ring * .146);
      for (let i = 0; i < 8; i++) {
        const start = i * Math.PI / 4 + ring * .21;
        const size = (i + ring) % 3 === 0 ? .23 : .58;
        const p = (a, radius) => [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
        const outside = Array.from({ length: 7 }, (_, k) => p(start + k / 6 * size, r));
        const inside = Array.from({ length: 7 }, (_, k) => p(start + (1 - k / 6) * size, r - unit * .065));
        polygon(ctx, [...outside, ...inside], (i + ring) % 3 ? '#302443' : '#49365c', '#826b9b');
        for (let k = 1; k <= 5; k++) {
          const a = start + size * k / 6;
          stroke(ctx, [p(a, r), p(a, r - unit * .063)], '#87699b');
        }
      }
    }
    field(ctx, cx, cy, unit * .18, '#080913', 'rgba(8,9,19,0)');
    stroke(ctx, [[cx - 7, cy - unit * .85], [cx - 7, cy + unit * .72]], '#b59db4', 2);
    stroke(ctx, [[cx + 7, cy - unit * .85], [cx + 7, cy + unit * .72]], '#3a2f53', 3);
  } else {
    // The final Source already broke the desktop casing. This exposure traces
    // the three familiar return paths through the nearest exposed band only.
    for (let lane = -1; lane <= 1; lane++) {
      const route = Array.from({ length: 9 }, (_, i) => {
        const reach = (i - 2.7) * unit * .21;
        return fromAxis(receiver, basis, reach, lane * unit * (.02 + .065 * Math.abs(i - 3)) + (i % 2) * unit * .013);
      });
      stroke(ctx, route, '#1b1321', 20);
      stroke(ctx, route, lane === 0 ? '#ac827b' : '#654c74', lane === 0 ? 3 : 1.5);
      for (const [x, y] of route) {
        polygon(ctx, [[x - 12, y], [x, y - 6], [x + 12, y], [x, y + 6]], '#241a27', '#957480');
      }
    }
  }
  grain(ctx, width, height, theme.light, 9227);
  buildStarField(width, height);
}

function seam(ctx, x, y, span, basis, theme, closed, opacity = 1) {
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(basis.along.y, basis.along.x));
  for (const side of [-1, 1]) {
    const gap = (7 + span * .18) * (1 - closed * .72);
    const inner = side * gap;
    const outer = side * (gap + span * .25);
    polygon(ctx, [[outer, -span], [inner, -span * .77], [inner, span * .77], [outer, span]],
      theme.dim, theme.edge, 2);
    stroke(ctx, [[outer, -span], [inner, -span * .77], [inner, span * .77], [outer, span]], theme.light, 2.2);
    for (const y1 of [-.56, -.25, .05, .36, .67]) {
      stroke(ctx, [[inner, span * y1], [outer, span * (y1 + .10)]], theme.edge);
    }
  }
  ctx.restore();
}

function catcherSeam(ctx, x, y, span, basis, theme, closed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(basis.along.y, basis.along.x));
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(-side * span * .59 * closed, 0);
    ctx.rotate(side * -closed * .29);
    const radius = span * 1.15;
    const wedge = r => Array.from({ length: 9 }, (_, i) => {
      const theta = (i - 4) * .13;
      return [side * Math.cos(theta) * r, Math.sin(theta) * r];
    });
    polygon(ctx, [...wedge(radius), ...wedge(radius * .63).reverse()], theme.dim, theme.light, 2.2);
    stroke(ctx, [[side * radius * .63, 0], [side * radius, 0]], theme.edge);
    ctx.restore();
  }
  ctx.restore();
}

function paintSeam(ctx, state, x, y, span, basis, theme, closed, opacity = 1) {
  if (state.theme === 'source-iii') {
    ctx.save();
    ctx.globalAlpha *= opacity;
    catcherSeam(ctx, x, y, span, basis, theme, closed);
    ctx.restore();
  } else seam(ctx, x, y, span, basis, theme, closed, opacity);
}

function hushAperture(ctx, state, x, y, basis, bodySize, seconds, opacity) {
  if (opacity <= 0 || bodySize <= 0) return;
  const overhead = state.theme === 'source-iii';
  const point = overhead
    ? (u, v) => fromAxis({ x, y }, basis, -v * bodySize, u * bodySize)
    : (u, v) => [x + u * bodySize, y + v * bodySize];
  const wobble = state.reducedMotion ? 0 : Math.sin(seconds * 7.2) * .11;
  const shape = overhead
    ? [[-.91, .72], [-.80, .32], [-.85, -.10], [-.62, -.40], [-.39, -.43], [-.25, -.74], [.10, -.89],
      [.37, -.64], [.44, -.42], [.72, -.31], [.88, .06], [.73, .26], [.92, .57], [.48, .89], [.09, .73], [-.23, .90]]
    : [[-.77, 1.52], [-.66, .98], [-.54, .65], [-.59, .33], [-.46, .18], [-.49 - wobble, -.28],
      [-.36 - wobble, -.46], [-.24, -.57], [-.18, -1.13], [.12, -1.32], [.29, -1.12], [.28, -.85],
      [.26, -.65], [.37, -.57], [.49 + wobble, -.32], [.54, -.04], [.68, .21], [.62, .53], [.81, 1.49],
      [.46, 1.36], [.21, 1.47], [.20, 1.27], [-.13, 1.39], [-.44, 1.29]];
  const edge = shape.map(([u, v]) => point(u, v));
  ctx.save();
  ctx.globalAlpha *= opacity;
  polygon(ctx, edge, '#110b1f', state.reduceFlash ? '#79608b' : '#ba91cc', 2.6);
  ctx.save();
  ctx.clip();
  // Keep this texture in desktop coordinates. Each movement merely changes
  // the aperture that reveals it. No crop or transform follows the body.
  if (stars.width && stars.height) ctx.drawImage(stars, 0, 0);
  ctx.restore();
  ctx.globalAlpha *= .46;
  if (overhead) {
    stroke(ctx, [point(-.52, .58), point(-.34, .11), point(-.32, -.24), point(0, -.70)], '#b07ab9', 2);
    stroke(ctx, [point(.07, -.65), point(.37, -.18), point(.44, .45), point(.7, .61)], '#5e4d91', 2);
  } else {
    stroke(ctx, [point(-.55, 1.36), point(-.34, .34), point(-.36, -.28), point(-.10, -.55)], '#b07ab9', 2);
    stroke(ctx, [point(.1, -1.21), point(.22, -.77), point(.56, -.24), point(.67, .89)], '#5e4d91', 2);
  }
  ctx.restore();
}

function sourceTrace(state, amount, basis) {
  const span = basis.distance;
  const routeShape = state.theme === 'source-ii' ? -.18 : state.theme === 'source-iii' ? .38 : -.09;
  const points = [
    [0, 0], [.14, routeShape * .30], [.39, -routeShape * .30], [.65, routeShape * .57], [.83, 0], [1, 0],
  ];
  const p = limit(amount, 0, 1) * (points.length - 1);
  const index = Math.min(Math.floor(p), points.length - 2);
  const [a, b] = points[index];
  const [c, d] = points[index + 1];
  return fromAxis(state.entry, basis, lerp(a, c, p - index) * span, lerp(b, d, p - index) * span);
}

function sourcePressureProgress(state, approach, seconds) {
  if (state.reducedMotion) return .74;
  return approach * .44 + responseProgress(state, seconds) * .56;
}

function paintSourceBackdrop(state, approach, release, seconds) {
  const { entry, receiver, reducedMotion, reduceFlash } = state;
  const theme = THEMES[state.theme];
  const basis = sourceBasis(state);
  const hit = state.outcome === 'hit';
  const failed = state.outcome === 'miss';
  const fade = 1 - Math.pow(release, 1.8);
  const pressure = sourcePressureProgress(state, approach, seconds);
  const offered = state.releasedProgress ?? pressure;
  const progress = state.outcome && !reducedMotion ? offered * (1 - eased(release)) : pressure;
  const [x, y] = sourceTrace(state, progress, basis);
  const cue = failed ? '#e59782' : theme.light;
  context.globalAlpha = fade;
  context.drawImage(background, 0, 0);
  const route = Array.from({ length: 31 }, (_, i) => sourceTrace(state, i / 30, basis));
  stroke(context, route, '#100f18', 9);
  stroke(context, route, theme.edge, 2.6);
  const toBody = Array.from({ length: 21 }, (_, i) => sourceTrace(state, i / 20 * progress, basis));
  stroke(context, toBody, cue, reduceFlash ? 1 : 1.7);

  // The open desktop seam is a fixed physical place, while the silhouette
  // carries its weight all the way toward it. A miss sends that weight back
  // through the same game edge. A hit shuts the planes across its route.
  paintSeam(context, state, receiver.x, receiver.y, 48, basis, theme, hit ? eased(release) : 0);
  paintSeam(context, state, entry.x, entry.y, 33, basis, theme, failed ? .9 : .32, .62);
  const size = limit(basis.distance * .26, 22, 95) * (failed && !reducedMotion ? 1 + release * .28 : 1);
  hushAperture(context, state, x, y, basis, size, seconds, (.24 + approach * .64) * (hit ? 1 - release : 1));

  const waveAt = state.outcome ? progress : Math.min(1, pressure + .10);
  for (let i = 0; i < 4; i++) {
    const at = limit(waveAt - i * .13, 0, 1);
    const [wx, wy] = sourceTrace(state, at, basis);
    const reach = size * (.55 + i * .27) * (failed ? 1 + release : 1);
    stroke(context, [[wx - basis.across.x * reach, wy - basis.across.y * reach],
      [wx + basis.across.x * reach, wy + basis.across.y * reach]], i < 2 ? cue : theme.edge, 1);
  }
  context.globalAlpha = 1;
}

function paintSourceTarget(state, width, height, approach, release, seconds) {
  const reach = state.reducedMotion ? 1 : eased(limit((approach - .32) / .68, 0, 1));
  const theme = THEMES[state.theme];
  const hit = state.outcome === 'hit';
  const failed = state.outcome === 'miss';
  const basis = sourceBasis(state);
  const center = { x: width * .5, y: height * .5 };
  const span = Math.min(width, height) * .37;
  const remaining = 1 - responseProgress(state, seconds);
  context.globalAlpha = reach * (1 - Math.pow(release, 1.8));
  context.fillStyle = theme.void;
  context.fillRect(2, 2, width - 4, height - 4);
  for (let i = 1; i < 12; i++) {
    const y = height * i / 12;
    stroke(context, [[3, y], [width - 3, y]], theme.dim);
  }
  paintSeam(context, state, center.x, center.y, span, basis, theme, hit ? eased(release) : 0);

  const px = center.x;
  const py = center.y;
  const cue = failed ? '#eeaa94' : hit ? '#b5e4bd' : theme.light;
  const radius = 8 + remaining * 5;
  polygon(context, [[px, py - radius], [px + radius, py], [px, py + radius], [px - radius, py]], theme.void, cue, 2.6);
  context.fillStyle = cue;
  context.fillRect(px - 1, py - 1, 2, 2);
  if (!state.reduceFlash && !state.reducedMotion && !state.outcome) {
    const line = radius + 4 + Math.sin(seconds * 6);
    stroke(context, [[px - line, py], [px - line - 5, py]], cue);
    stroke(context, [[px + line, py], [px + line + 5, py]], cue);
  }
  context.globalAlpha = 1;
}

function paintBackdrop(state, approach, release, seconds) {
  const { entry, receiver, reducedMotion, reduceFlash } = state;
  context.globalAlpha = 1 - Math.pow(release, 2.6);
  context.drawImage(background, 0, 0);
  const failed = state.outcome === 'miss';
  const distance = failed && !reducedMotion ? 1 - eased(release) : eased(approach);
  const tint = failed ? '196,123,103' : '232,217,166';
  const [x, y] = tracePoint(state, distance);
  const strength = reduceFlash ? .16 : .28;
  const focus = reducedMotion ? receiver : { x, y };
  field(context, focus.x, focus.y, 108, `rgba(${tint},${strength})`, `rgba(${tint},0)`);
  const alongSide = Math.abs(receiver.x - entry.x) > Math.abs(receiver.y - entry.y);
  const dx = Math.sign(receiver.x - entry.x);
  const dy = Math.sign(receiver.y - entry.y);
  const jamb = alongSide ? { x: entry.x + dx * 3, y: entry.y } : { x: entry.x, y: entry.y + dy * 3 };
  const span = 21 + approach * 12;
  field(context, jamb.x, jamb.y, 42, `rgba(${tint},.18)`, `rgba(${tint},0)`);
  stroke(context, alongSide
    ? [[jamb.x + dx * 4, jamb.y - span], [jamb.x, jamb.y - span * .72], [jamb.x, jamb.y + span * .72], [jamb.x + dx * 4, jamb.y + span]]
    : [[jamb.x - span, jamb.y + dy * 4], [jamb.x - span * .72, jamb.y], [jamb.x + span * .72, jamb.y], [jamb.x + span, jamb.y + dy * 4]],
  `rgba(${tint},.64)`, 1.6);
  const trace = Array.from({ length: 13 }, (_, index) => tracePoint(state, distance * index / 12));
  if (reducedMotion) {
    stroke(context, [[entry.x, entry.y], [receiver.x, receiver.y]], `rgba(${tint},.29)`, 1.2);
  } else {
    stroke(context, trace, `rgba(${tint},.34)`, 2);
    const tremor = 2 + Math.sin(seconds * 17) * 1.3;
    for (const side of [-1, 1]) {
      stroke(context, trace.map(([tx, ty], i) => [tx, ty + Math.sin(i / 12 * Math.PI) * tremor * side]), `rgba(${tint},.46)`);
    }
    for (let i = 0; i < 3; i++) {
      const radius = 7 + i * 7 + (release && !failed ? release * 20 : 0);
      arch(context, x, y + radius, radius * .6, radius * 1.75, `rgba(${tint},${.62 - i * .16})`, null, 1.2);
    }
  }
  context.globalAlpha = 1;
}

function paintTarget(state, width, height, approach, release, seconds) {
  if (approach < .64 && !state.reducedMotion) return;
  const x = width * .5;
  const bottom = height - 9;
  const size = Math.min(width * .44, 34);
  const tall = height - 17;
  const failed = state.outcome === 'miss';
  const active = limit((approach - .64) / .36, 0, 1);
  context.globalAlpha = (state.reducedMotion ? 1 : eased(active)) * (1 - Math.pow(release, .9));
  const outline = failed ? '#c47b67' : '#e9d7a3';
  context.fillStyle = 'rgba(22,30,30,.81)';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(123,126,107,.48)';
  context.strokeRect(.5, .5, width - 1, height - 1);
  field(context, x, height * .54, size * 1.3, failed ? '#382821' : '#4b4b3d', 'rgba(0,0,0,0)');
  arch(context, x, bottom, size, tall, '#6f7162', '#151c1d', 1);
  arch(context, x, bottom - 5, size - 5, tall - 11, outline, '#282f2a', 1.8);
  const inner = state.reducedMotion ? 0 : Math.sin(seconds * 8) * 2;
  arch(context, x, bottom - 11, size - 11 + inner, tall - 25 + inner, outline, null, 1);
  stroke(context, [[x - 7, height * .57], [x + 7, height * .57]], outline);
  stroke(context, [[x, height * .57 - 7], [x, height * .57 + 7]], outline);
  if (state.outcome === 'hit' && !state.reducedMotion) {
    const travel = eased(release);
    for (const side of [-1, 1]) {
      const leaf = x + side * (5 + (size - 9) * travel);
      stroke(context, [[leaf, bottom - 11], [leaf, height * .49], [x + side * size * travel, height * .24]], outline, 1.4);
    }
  }
  context.globalAlpha = 1;
}

function frame(now) {
  frameRequest = 0;
  const state = current;
  if (!state) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvas.width !== width || canvas.height !== height || state.rebuild) {
    canvas.width = width;
    canvas.height = height;
    if (!target && width && height) {
      background.width = width;
      background.height = height;
      if (state.theme === 'chapel') buildNave(width, height, state.receiver);
      else if (state.theme === 'tower') buildTower(width, height, state.receiver);
      else buildSource(width, height, state);
    }
    state.rebuild = false;
  }
  if (!width || !height) { frameRequest = requestAnimationFrame(frame); return; }
  const seconds = (now - state.started) / 1000;
  const approach = state.reducedMotion ? 1 : limit(seconds / WARMUP_SECONDS, 0, 1);
  const release = state.released ? limit((now - state.released) / (TAIL_SECONDS * 1000), 0, 1) : 0;
  context.clearRect(0, 0, width, height);
  if (target) {
    if (state.theme === 'chapel') paintTarget(state, width, height, approach, release, seconds);
    else if (state.theme === 'tower') paintTowerTarget(state, width, height, approach, release, seconds);
    else paintSourceTarget(state, width, height, approach, release, seconds);
  } else {
    if (state.theme === 'chapel') paintBackdrop(state, approach, release, seconds);
    else if (state.theme === 'tower') paintTowerBackdrop(state, approach, release, seconds);
    else paintSourceBackdrop(state, approach, release, seconds);
  }
  if (approach === 1 && !state.released && ++state.readyFrames === 2) {
    // Native opens the hit region only when both WebViews have drawn their
    // matching cue on consecutive compositor opportunities.
    state.readyAt = now;
    void invoke('chunk_chapel_desktop_surface', { action: 'painted', token: state.token });
    if (target) receiverButton.hidden = false;
  }
  if (release < 1) frameRequest = requestAnimationFrame(frame);
}

async function install() {
  if (!target) {
    plate.src = `${import.meta.env.BASE_URL}assets/chapel-desktop-nave.jpg`;
    await plate.decode().catch(() => {});
  }
  await listen('chapel-desktop:frame', ({ payload }) => {
    receiverButton.hidden = true;
    const theme = Object.hasOwn(THEMES, payload.theme) ? payload.theme : 'chapel';
    const responseSeconds = limit(Number(payload.responseSeconds) || 2.15, .8, 4);
    receiverButton.setAttribute('aria-label', THEMES[theme].label);
    current = { ...payload, theme, responseSeconds, started: performance.now(), readyFrames: 0, rebuild: true };
    if (!frameRequest) frameRequest = requestAnimationFrame(frame);
  });
  await listen('chapel-desktop:release', ({ payload }) => {
    if (current?.token === payload.token) {
      receiverButton.hidden = true;
      current.released = performance.now();
      current.releasedProgress = sourcePressureProgress(current, 1, (current.released - current.started) / 1000);
      current.outcome = payload.outcome;
    }
  });
  await listen('chapel-desktop:clear', ({ payload }) => {
    if (current?.token !== payload.token) return;
    receiverButton.hidden = true;
    current = null;
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    context.clearRect(0, 0, canvas.width, canvas.height);
  });
  if (target) {
    receiverButton.addEventListener('click', event => {
      if (!event.isTrusted || event.button !== 0 || !current || current.released || current.readyFrames < 2) return;
      void invoke('chunk_chapel_desktop_surface', { action: 'hit', token: current.token });
    });
  }
  await invoke('chunk_chapel_desktop_surface', { action: 'ready', token: null });
}

void install();
