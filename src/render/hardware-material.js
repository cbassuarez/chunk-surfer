// Physical controls are full-DPR surfaces, not glyph-grid rectangles. The two
// expensive pigment/transmission fields are baked once; mechanical travel only
// translates the cap over a stationary socket. No canvas readback on a frame.
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(Number(n)) ? Number(n) : a));
export const CAP_PIGMENTS = Object.freeze({
  amber: { off: [170, 144, 77], on: [255, 210, 79] },
  red: { off: [198, 126, 106], on: [255, 82, 37] },
  green: { off: [115, 155, 115], on: [170, 229, 137] },
  blue: { off: [116, 148, 168], on: [136, 213, 238] },
  white: { off: [189, 189, 172], on: [255, 241, 201] },
});
const fields = new Map();
const CACHE_ENTRIES = 48, CACHE_PIXELS = 4 * 1024 * 1024;
let fieldPixels = 0;
let reducedByGame = false, motionQuery = null;
export function setHardwareReducedMotion(value) { reducedByGame = !!value; }
export function hardwareMotionReduced() {
  if (!motionQuery && typeof globalThis.matchMedia === 'function') motionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  return reducedByGame || !!motionQuery?.matches;
}

export function clearHardwareMaterialCache() { fields.clear(); fieldPixels = 0; }
export function hardwareMaterialCacheStats() { return { entries: fields.size, pixels: fieldPixels, maxEntries: CACHE_ENTRIES, maxPixels: CACHE_PIXELS }; }

export function hardwareCapGeometry(width, height, travel = 0, { dpr = 1, finish = 'lens' } = {}) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const scale = clamp(dpr, .5, 4), depth = clamp(travel, 0, 1);
  const keyboard = finish === 'keycap';
  const rim = Math.min(keyboard ? 1.1 * scale : 3 * scale, h * .075, w * .07);
  const gap = Math.min(keyboard ? .65 * scale : 1.25 * scale, h * .04);
  const stroke = Math.min(2.3 * scale, h * .09);
  const inset = rim + gap;
  const distance = Math.min(keyboard ? 1.65 * scale : 3.6 * scale, h * .105);
  const face = { x: inset + stroke * .3, y: inset + distance * depth,
    w: Math.max(.5, w - 2 * inset - stroke * .6), h: Math.max(.5, h - 2 * inset - distance - stroke) };
  return { w, h, rim, gap, distance, depth, face,
    radius: Math.min(keyboard ? 3.6 * scale : 2.9 * scale, face.h * .15, face.w * .08),
    shoulder: Math.min(keyboard ? 2.4 * scale : 2.1 * scale, face.h * .14),
    content: { x: face.x + stroke + scale, y: face.y + stroke * .65,
      w: Math.max(.5, face.w - 2 * (stroke + scale)), h: Math.max(.5, face.h - stroke * 1.3) },
  };
}

function round(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// A molded shoulder rolls into the face instead of having a diagonal software
// bevel. The lower corners spread into the skirt: shallow injection draft.
function capPath(ctx, x, y, w, h, r, draft = 0) {
  ctx.beginPath(); ctx.moveTo(x + r + draft, y);
  ctx.lineTo(x + w - r - draft, y);
  ctx.bezierCurveTo(x + w - draft, y, x + w, y + r * .45, x + w, y + r * 1.4);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r * 1.4);
  ctx.bezierCurveTo(x, y + r * .45, x + draft, y, x + r + draft, y); ctx.closePath();
}

function vertical(ctx, y, h, stops) {
  const g = ctx.createLinearGradient(0, y, 0, y + Math.max(.01, h));
  for (const [p, c] of stops) g.addColorStop(p, c);
  return g;
}

export function hardwarePigment(color = 'amber') {
  if (CAP_PIGMENTS[color]) return CAP_PIGMENTS[color];
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const rgb = [1,3,5].map(i => parseInt(color.slice(i, i + 2), 16));
    return { on: rgb, off: rgb.map(v => Math.round(v * .48 + 53)) };
  }
  return CAP_PIGMENTS.amber;
}

function pigmentFields(ctx, w, h, color, finish) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  const key = [w,h,color,finish].join(':');
  const existing = fields.get(key);
  if (existing) { fields.delete(key); fields.set(key, existing); return existing; }
  const owner = ctx.canvas?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!owner?.createElement || w * h * 2 > CACHE_PIXELS) return null;
  const off = owner.createElement('canvas'), on = owner.createElement('canvas');
  off.width = on.width = w; off.height = on.height = h;
  const a = off.getContext('2d'), b = on.getContext('2d');
  if (!a?.createImageData || !b?.createImageData) return null;
  const dark = a.createImageData(w,h), bright = b.createImageData(w,h);
  const pigment = hardwarePigment(color), lens = finish === 'lens';
  const xLight = Array.from({length:w}, (_,x) => Math.exp(-(((x/w-.43)/.48)**2)*1.6));
  const yLight = Array.from({length:h}, (_,y) => Math.exp(-(((y/h-.62)/.57)**2)*1.8));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h, edge = Math.min(u, 1-u, v, 1-v);
    // Lens thickness absorbs at the perimeter. Opaque caps have a broad satin
    // dish with a darker centre and brighter rolled shoulder, not a glass wash.
    const absorption = lens ? .71 + .29 * clamp(edge / .105, 0, 1) : .94;
    const dish = lens ? .94 - .10 * v : .93 + .10 * (2*u-1)**2 - .07 * v;
    const grain = (((x * 73 + y * 151) ^ (x * y * 3)) % 101 / 101 - .5) * (lens ? 2.2 : 2.8);
    const bulb = xLight[x] * yLight[y];
    const i = (y*w+x)*4;
    for (let k=0;k<3;k++) {
      const ambient = pigment.off[k] * dish * absorption;
      const radiance = pigment.on[k] * (.53 + .47 * bulb) * absorption + bulb * [12,9,3][k];
      // Removing circuit permission does not change the physical pigment or
      // erase its legend. Disabled is reported by the readout, not dark ink.
      dark.data[i+k] = clamp(ambient + grain, 0, 255);
      bright.data[i+k] = clamp((lens ? radiance : ambient) + grain, 0, 255);
    }
    dark.data[i+3] = bright.data[i+3] = 255;
  }
  a.putImageData(dark,0,0); b.putImageData(bright,0,0);
  const entry = { off, on, pixels: w*h*2 };
  while (fields.size && (fields.size >= CACHE_ENTRIES || fieldPixels + entry.pixels > CACHE_PIXELS)) {
    const oldest = fields.keys().next().value; fieldPixels -= fields.get(oldest).pixels; fields.delete(oldest);
  }
  fields.set(key,entry); fieldPixels += entry.pixels;
  return entry;
}

/** All coordinates and dpr are device pixels. Returns face/content geometry. */
export function drawHardwareCap(ctx, x, y, w, h, {
  color = 'amber', finish = 'lens', travel = 0, lampHeat = 0,
  enabled = true, focused = false, alpha = 1, dpr = 1,
} = {}) {
  const g = hardwareCapGeometry(w,h,travel,{dpr,finish});
  const { rim, face: f, radius, shoulder } = g, keyboard = finish === 'keycap';
  const heat = enabled && finish === 'lens' ? clamp(lampHeat,0,1) : 0;
  ctx.save(); ctx.translate(x,y); const opacity = ctx.globalAlpha * clamp(alpha,0,1); ctx.globalAlpha = opacity;
  // A stationary machined retainer with distinct facets, not a luminous border.
  round(ctx,0,0,g.w,g.h,keyboard ? radius * 1.25 : Math.max(.5,rim*.5));
  ctx.fillStyle = keyboard ? '#22261e' : vertical(ctx,0,g.h,[[0,'#393d34'],[.025,'#c0c2b0'],[.05,'#828a75'],[.10,'#30382a'],[.83,'#292f24'],[.94,'#9fa68b'],[.975,'#565f47'],[1,'#181e15']]); ctx.fill();
  if (!keyboard) {
    const sides = ctx.createLinearGradient(0,0,g.w,0);
    sides.addColorStop(0,'#b7bca275'); sides.addColorStop(.035,'#131c12');
    sides.addColorStop(.075,'#626f5100'); sides.addColorStop(.94,'#838c6d00');
    sides.addColorStop(.985,'#0f180f'); sides.addColorStop(1,'#b7bca264');
    round(ctx,.6*dpr,rim,g.w-1.2*dpr,g.h-2*rim,.5*dpr); ctx.fillStyle=sides;ctx.fill();
  }
  round(ctx,rim,rim,g.w-2*rim,g.h-2*rim,radius*.7);ctx.fillStyle='#0a100a';ctx.fill();
  const sideH = g.distance * (1-g.depth) + shoulder;
  capPath(ctx,f.x-.4*dpr,f.y+shoulder*.5,f.w+.8*dpr,f.h+sideH,radius,shoulder*.25);
  ctx.fillStyle = vertical(ctx,f.y,f.h+sideH,[[0,'#6f775b'],[.76,'#4c533a'],[.88,'#3b432c'],[1,'#151d10']]);ctx.fill();
  // Cavity contact darkens above a sunk cap. The cast/contact shadow changes
  // with travel while the retainer and hit rectangle never move.
  ctx.fillStyle=`rgba(0,0,0,${.24+.32*g.depth})`;
  ctx.fillRect(f.x,rim,f.w,Math.max(.25*dpr,f.y-rim));
  ctx.save();capPath(ctx,f.x,f.y,f.w,f.h,radius,shoulder*.28);ctx.clip();
  const field = pigmentFields(ctx,f.w,f.h,color,finish);
  if (field) {
    ctx.drawImage(field.off,f.x,f.y,f.w,f.h);
    if (heat > 0) {ctx.globalAlpha=opacity*heat;ctx.drawImage(field.on,f.x,f.y,f.w,f.h);ctx.globalAlpha=opacity;}
  } else { const p=hardwarePigment(color);ctx.fillStyle=`rgb(${p.off.join(',')})`;ctx.fillRect(f.x,f.y,f.w,f.h); }
  // Curved shoulders: thin grazing highlight at the top, a broad soft roll,
  // and a transmitted lip at the bottom. None depends on selection or time.
  ctx.fillStyle=vertical(ctx,f.y,f.h,[[0,'#17200e80'],[.018,'#f6f4d66c'],[.065,'#e9edd24c'],[.17,'#fcf8dc08'],[.72,'#111b0500'],[.93,'#18240530'],[.975,keyboard?'#aeb69b68':'#c9d2a45c'],[1,'#111a08a0']]);
  ctx.fillRect(f.x,f.y,f.w,f.h);
  // A molded seam at the skirt, not a uniform rectangle drawn on the face.
  ctx.strokeStyle='#171d0f50';ctx.lineWidth=Math.max(.5,dpr*.5);ctx.beginPath();
  ctx.moveTo(f.x+radius,f.y+f.h-1.2*dpr);ctx.quadraticCurveTo(f.x+f.w*.5,f.y+f.h-.6*dpr,f.x+f.w-radius,f.y+f.h-1.2*dpr);ctx.stroke();
  ctx.restore();
  if (heat > 0 && !keyboard) {ctx.globalAlpha=opacity*heat*.2;ctx.fillStyle=color==='red'?'#ff9754':'#ffe4a2';ctx.fillRect(rim*2,g.h-rim*.9,g.w-rim*4,Math.max(.5,dpr*.5));ctx.globalAlpha=opacity;}
  // Focus is two small mechanical index marks on the surround. It never
  // changes the bulb's electrical state or floods the cap under a cursor.
  if (focused) {
    ctx.fillStyle='#f2e6be';const mark=Math.min(5*dpr,g.w*.12);
    ctx.fillRect(g.w*.5-mark*.5,.3*dpr,mark,Math.max(.65,dpr*.7));
    ctx.fillRect(g.w*.5-mark*.5,g.h-1.1*dpr,mark,Math.max(.65,dpr*.7));
  }
  ctx.restore(); return g;
}
