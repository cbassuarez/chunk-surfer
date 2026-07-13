//
//  bag-icons.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Code-native service-manual schematics for the field case.

import { uiDraw } from './ui.js';
import { UI_COLOR, themeRoleColor, uiBrightness, uiFlickerAlpha } from './palette.js';

function iconColor(tone, x, cols) {
  if (tone === 'complete') return UI_COLOR.green;
  if (tone === 'danger') return UI_COLOR.danger;
  if (tone === 'metadata') return UI_COLOR.blue;
  if (tone === 'dim') return UI_COLOR.secondary;
  return themeRoleColor('phosphor', x, cols);
}

function withStyle(ctx, { color, alpha, active, dpr }) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(1, 1.15 * dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (active) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 * dpr;
  }
}

function path(ctx, points, box, close = false) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const px = box.x + box.w * x;
    const py = box.y + box.h * y;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  if (close) ctx.closePath();
  ctx.stroke();
}

function rect(ctx, x, y, w, h, box) {
  ctx.strokeRect(box.x + box.w * x, box.y + box.h * y, box.w * w, box.h * h);
}

function circle(ctx, x, y, r, box, fill = false) {
  ctx.beginPath();
  ctx.arc(box.x + box.w * x, box.y + box.h * y, Math.min(box.w, box.h) * r, 0, Math.PI * 2);
  fill ? ctx.fill() : ctx.stroke();
}

function drawLight(ctx, box) {
  rect(ctx, .34, .28, .20, .50, box);
  path(ctx, [[.34,.34],[.20,.18],[.68,.18],[.54,.34]], box, true);
  path(ctx, [[.68,.25],[.94,.10]], box);
  path(ctx, [[.70,.36],[.98,.32]], box);
  path(ctx, [[.68,.47],[.94,.57]], box);
}

function drawRecorder(ctx, box) {
  rect(ctx, .12, .12, .76, .76, box);
  circle(ctx, .34, .42, .15, box);
  circle(ctx, .66, .42, .15, box);
  rect(ctx, .24, .68, .52, .08, box);
  for (let i = 0; i < 6; i++) {
    const x = .26 + i * .08;
    path(ctx, [[x,.72],[x+.045,.72]], box);
  }
}

function drawRadio(ctx, box) {
  path(ctx, [[.50,.06],[.50,.25],[.72,.00]], box);
  rect(ctx, .18, .24, .64, .64, box);
  for (const x of [.32,.50,.68]) circle(ctx, x, .42, .025, box, true);
  rect(ctx, .30, .62, .40, .10, box);
  path(ctx, [[.23,.82],[.77,.82]], box);
}

function drawKeyring(ctx, box) {
  circle(ctx, .28, .38, .20, box);
  path(ctx, [[.44,.44],[.78,.78],[.88,.68]], box);
  path(ctx, [[.62,.61],[.72,.51]], box);
  path(ctx, [[.70,.69],[.80,.59]], box);
  path(ctx, [[.38,.48],[.68,.32],[.78,.42]], box);
}

function drawCoffee(ctx, box) {
  path(ctx, [[.28,.22],[.72,.22],[.64,.84],[.36,.84]], box, true);
  path(ctx, [[.24,.18],[.76,.18]], box);
  path(ctx, [[.40,.08],[.44,.00]], box);
  path(ctx, [[.55,.08],[.60,.00]], box);
}

function drawRoom(ctx, box) {
  rect(ctx, .12, .14, .76, .70, box);
  path(ctx, [[.12,.34],[.28,.34],[.38,.26],[.48,.42],[.60,.30],[.72,.38],[.88,.38]], box);
  path(ctx, [[.26,.70],[.42,.56],[.56,.70],[.72,.56]], box);
}

function drawFile(ctx, box) {
  path(ctx, [[.22,.08],[.66,.08],[.82,.26],[.82,.90],[.22,.90]], box, true);
  path(ctx, [[.66,.08],[.66,.28],[.82,.28]], box);
  path(ctx, [[.34,.46],[.70,.46]], box);
  path(ctx, [[.34,.60],[.70,.60]], box);
  path(ctx, [[.34,.74],[.58,.74]], box);
}

function drawUnknown(ctx, box) {
  rect(ctx, .18, .12, .64, .76, box);
  path(ctx, [[.36,.36],[.44,.26],[.58,.26],[.66,.34],[.64,.44],[.50,.52],[.50,.62]], box);
  circle(ctx, .50, .74, .025, box, true);
}

const DRAW = Object.freeze({
  light: drawLight,
  recorder: drawRecorder,
  radio: drawRadio,
  keyring: drawKeyring,
  coffee: drawCoffee,
  room: drawRoom,
  file: drawFile,
  unknown: drawUnknown,
});

export function drawBagIcon(kind, x, y, {
  w = 12,
  h = 7,
  active = false,
  state = 'active',
  alpha = 1,
  empty = false,
} = {}) {
  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    const box = {
      x: x * cellW * dpr,
      y: y * cellH * dpr,
      w: w * cellW * dpr,
      h: h * cellH * dpr,
    };
    const color = iconColor(empty ? 'danger' : state, x, cols);
    const flicker = uiFlickerAlpha(x, y, empty ? 'danger' : 'phosphor');

    ctx.save();
    withStyle(ctx, {
      color,
      alpha: Math.max(0, Math.min(1, alpha * flicker * uiBrightness() * (empty ? .42 : 1))),
      active,
      dpr,
    });

    (DRAW[kind] || DRAW.unknown)(ctx, box);

    if (empty) {
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.globalAlpha *= .55;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }

    ctx.restore();
  });
}
