// Connector centres and dimensions are in CSS pixels. The caller owns the
// device scale and paints plugs after this layer, at the same jack centres.
const TAU = Math.PI * 2;
const NICKEL = [
  [0, '#898982'], [.24, '#e8e3cd'], [.38, '#a6a79a'], [.53, '#4b504b'],
  [.73, '#777d72'], [.89, '#bfc0ac'], [1, '#4a514a'],
];
const PHENOLIC = [
  [0, '#4c4e45'], [.16, '#262922'], [.56, '#171b17'], [1, '#090d0a'],
];

function paintGradient(ctx, x, y, r, stops) {
  const paint = ctx.createLinearGradient(x - r * .62, y - r, x + r * .50, y + r);
  for (const [offset, color] of stops) paint.addColorStop(offset, color);
  return paint;
}

function disc(ctx, x, y, r, paint) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = paint;
  ctx.fill();
}

function arc(ctx, x, y, r, start, end, color, width) {
  ctx.beginPath();
  ctx.arc(x, y, r, start, end);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function hex(ctx, x, y, r, paint) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + i * Math.PI / 3;
    const u = x + Math.cos(angle) * r;
    const v = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(u, v);
    else ctx.lineTo(u, v);
  }
  ctx.closePath();
  ctx.fillStyle = paint;
  ctx.fill();
}

function plugCap(ctx, x, y, r) {
  disc(ctx, x, y, r * .66, '#111510');
  disc(ctx, x, y - r * .015, r * .60, paintGradient(ctx, x, y, r * .60, [
    [0, '#75786a'], [.24, '#575b4f'], [.52, '#2d332c'], [1, '#212720'],
  ]));
  arc(ctx, x, y, r * .56, Math.PI * 1.04, Math.PI * 1.48, '#929487', r * .06);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-.41);
  const w = r * .71;
  const h = Math.max(.8, r * .14);
  ctx.fillStyle = '#101511';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#76766a';
  ctx.fillRect(-w * .43, h * .47, w * .86, Math.max(.36, r * .047));
  ctx.restore();
}

export function drawChannelJack(ctx, x, y, r, {
  color = '#b8ad91', cap = false, ready = false, selected = false,
  compatible = false, outlet = false, occupied = false,
} = {}) {
  if (!(r > 0)) return;
  ctx.save();
  // Shallow cast shadow, the fixed insulating washer, then the machined nut.
  disc(ctx, x + r * .09, y + r * .16, r * .98, 'rgba(0,0,0,.61)');
  disc(ctx, x, y, r, '#0d100d');
  disc(ctx, x, y, r * .94, paintGradient(ctx, x, y, r, PHENOLIC));
  arc(ctx, x, y, r * .925, Math.PI * 1.02, Math.PI * 1.54, '#63635a', r * .058);

  if (cap) {
    plugCap(ctx, x, y, r);
    ctx.restore();
    return;
  }

  const metal = paintGradient(ctx, x, y, r * .72, NICKEL);
  hex(ctx, x, y + r * .03, r * .773, '#090b09');
  hex(ctx, x, y, r * .747, metal);
  disc(ctx, x, y, r * .574, '#353a34');
  disc(ctx, x, y, r * .519, metal);
  disc(ctx, x, y, r * .439, '#070a07');
  arc(ctx, x, y, r * .416, Math.PI * .09, Math.PI * .72, '#4f5349', r * .07);

  if (occupied) {
    // Collar remains visible under a seated plug. Its centre isn't a lamp.
    disc(ctx, x, y, r * .309, '#20251e');
  } else if (r > 4) {
    arc(ctx, x, y, r * .315, Math.PI * .23, Math.PI * .56, '#7b7863', r * .05);
  }

  if (compatible) {
    // Compatibility is the only state that gets an illuminated witness ring.
    arc(ctx, x, y, r * .865, 0, TAU, '#dca974', Math.max(.85, r * .12));
    arc(ctx, x, y, r * .865, Math.PI * 1.14, Math.PI * 1.71, '#f6e3bc', Math.max(.75, r * .072));
  } else {
    // A small enamel mark carries channel identity even when there's no lead.
    const centre = outlet ? Math.PI * .14 : Math.PI * 1.24;
    arc(ctx, x, y, r * .858, centre - .23, centre + .23, ready || selected ? color : '#888573',
      Math.max(.6, r * (selected ? .10 : .076)));
  }
  ctx.restore();
}

function roundPlate(ctx, x, y, w, h, r, paint) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = paint;
  ctx.fill();
}

function screw(ctx, x, y, r, direction) {
  disc(ctx, x, y + r * .13, r, '#0f1310');
  disc(ctx, x, y, r * .81, paintGradient(ctx, x, y, r, NICKEL));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(direction);
  ctx.fillStyle = '#30352e';
  ctx.fillRect(-r * .56, -r * .135, r * 1.12, r * .27);
  ctx.restore();
}

// A fitted cable starts at a fixed rubber boot rather than at a jack. The
// centre exit is y + .66r, with the two neighbouring exits at x +/- .35r.
export function drawChannelHarness(ctx, x, y, r, {
  color = '#b8ad91', available = false, selected = false,
} = {}) {
  if (!(r > 0)) return;
  ctx.save();
  const left = x - r * 1.54;
  const top = y - r * .78;
  const width = r * 3.08;
  const height = r * 1.57;
  roundPlate(ctx, left + r * .08, top + r * .17, width, height, r * .21, 'rgba(0,0,0,.58)');
  roundPlate(ctx, left, top, width, height, r * .20, '#101510');
  roundPlate(ctx, left + r * .06, top + r * .05, width - r * .12, height - r * .12, r * .16,
    paintGradient(ctx, x, y, r, [
      [0, '#777a6b'], [.26, '#53594e'], [.54, '#343c33'], [1, '#232b23'],
    ]));
  screw(ctx, x - r * 1.13, y, r * .225, .32);
  screw(ctx, x + r * 1.13, y, r * .225, -.68);

  const slotW = r * 1.78;
  roundPlate(ctx, x - slotW / 2, y - r * .40, slotW, r * 1.16, r * .12, '#0b100d');
  ctx.fillStyle = '#777867';
  ctx.fillRect(x - slotW * .39, y - r * .40, slotW * .78, Math.max(.45, r * .06));
  for (const n of [-1, 0, 1]) {
    const bootX = x + n * r * .35;
    roundPlate(ctx, bootX - r * .153, y - r * .21, r * .306, r * .91, r * .11,
      paintGradient(ctx, bootX, y, r * .26, [
        [0, '#62675a'], [.34, '#434b40'], [.66, '#293128'], [1, '#111811'],
      ]));
    ctx.fillStyle = '#202820';
    for (const row of [.20, .39, .57]) {
      ctx.fillRect(bootX - r * .124, y + r * row, r * .248, Math.max(.42, r * .05));
    }
  }
  ctx.fillStyle = selected ? '#e1be83' : available ? color : '#6c6c5c';
  ctx.fillRect(x - r * .76, y - r * .62, r * 1.52, Math.max(.7, r * (selected ? .12 : .075)));
  ctx.restore();
}
