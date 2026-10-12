// LEGACY PAINTED WINDOW. The live whiteout uses childhood-bedroom-glsl.js and
// the physical window in realm-pocket-geometry.js. Only the release hook below
// remains in main's cleanup path; this plate does not render the current home.
//
// The way home through the snow ends here: the one lit window he has been walking
// at, close enough to look in and not to go in. The kitchen of the house he grew up
// in, as it was, warm, with nobody in it — and on the radiator under the sill a
// jumper drying that could never have been there: Lyle's. Nobody says so.
// (docs/plans/door-field-station.md, stage 3.)
//
// Painted, not modelled, the way the phone box's set is: onto a canvas the renderer
// prints through the game's own look (r3dSetTableau). `reveal` brings it up out of
// the snow; `time` moves the snow and the steam; reduced motion stills both.

const TAU = Math.PI * 2;
function hash(n) { let x = (n | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967295; }

let plate = null, plateKey = '';
const surface = (w, h) => {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};

// Everything that does not move: the wall, the window and the room behind it.
function paintPlate(w, h) {
  const c = surface(w, h), ctx = c.getContext('2d');
  const u = Math.min(w, h);
  // The night, the snow blowing off to nothing.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1b2230'); sky.addColorStop(1, '#3b4452');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // The house wall: pebbledash, lit from the window it is around.
  const wx = w * 0.06, wy = h * 0.1, ww = w * 0.88, wh = h * 0.84;
  ctx.fillStyle = '#6d6a63'; ctx.fillRect(wx, wy, ww, wh);
  for (let i = 0; i < 5000; i += 1) {
    ctx.fillStyle = hash(i) > 0.5 ? 'rgba(255,250,235,.08)' : 'rgba(0,0,0,.12)';
    ctx.fillRect(wx + hash(i * 3) * ww, wy + hash(i * 7) * wh, 1 + hash(i * 11) * 2, 1 + hash(i * 13) * 2);
  }
  // The window: a white-painted wooden frame, four panes, a deep sill.
  // Low in the picture: the thought that comes up over it sits across the middle,
  // and the radiator and what is drying on it must stay in view below.
  const fx = w * 0.24, fy = h * 0.3, fw = w * 0.52, fh = h * 0.56;
  const pane = { x: fx + u * 0.02, y: fy + u * 0.02, w: fw - u * 0.04, h: fh - u * 0.04 };
  // THE KITCHEN, behind the glass.
  ctx.save(); ctx.beginPath(); ctx.rect(pane.x, pane.y, pane.w, pane.h); ctx.clip();
  const room = ctx.createLinearGradient(0, pane.y, 0, pane.y + pane.h);
  room.addColorStop(0, '#d9b57a'); room.addColorStop(1, '#a37848');
  ctx.fillStyle = room; ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
  // Tiles on the far wall, cream with a brown band.
  const tile = pane.w / 16;
  for (let r = 0; r < 6; r += 1) for (let k = 0; k < 17; k += 1) {
    ctx.fillStyle = r === 2 ? 'rgba(120,70,30,.35)' : 'rgba(255,245,220,.25)';
    ctx.fillRect(pane.x + k * tile + 1, pane.y + pane.h * 0.18 + r * tile + 1, tile - 2, tile - 2);
  }
  // Wall cupboards, a clock, the hanging lamp and its warm pool.
  ctx.fillStyle = '#7f5a34'; ctx.fillRect(pane.x + pane.w * 0.05, pane.y, pane.w * 0.4, pane.h * 0.16);
  ctx.fillStyle = '#f2e7cf'; ctx.beginPath(); ctx.arc(pane.x + pane.w * 0.72, pane.y + pane.h * 0.12, pane.w * 0.045, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pane.x + pane.w * 0.72, pane.y + pane.h * 0.12); ctx.lineTo(pane.x + pane.w * 0.72, pane.y + pane.h * 0.09); ctx.moveTo(pane.x + pane.w * 0.72, pane.y + pane.h * 0.12); ctx.lineTo(pane.x + pane.w * 0.745, pane.y + pane.h * 0.125); ctx.stroke();
  const lamp = ctx.createRadialGradient(pane.x + pane.w * 0.5, pane.y + pane.h * 0.2, 0, pane.x + pane.w * 0.5, pane.y + pane.h * 0.2, pane.w * 0.6);
  lamp.addColorStop(0, 'rgba(255,236,190,.55)'); lamp.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = lamp; ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
  ctx.fillStyle = '#3b2b1c'; ctx.fillRect(pane.x + pane.w * 0.495, pane.y, 2, pane.h * 0.14);
  ctx.fillStyle = '#f7e6b8'; ctx.beginPath(); ctx.ellipse(pane.x + pane.w * 0.5, pane.y + pane.h * 0.17, pane.w * 0.05, pane.h * 0.03, 0, 0, TAU); ctx.fill();
  // The table with its oilcloth, two chairs, a teapot.
  ctx.fillStyle = '#5e7d6a'; ctx.fillRect(pane.x + pane.w * 0.18, pane.y + pane.h * 0.58, pane.w * 0.5, pane.h * 0.06);
  for (let k = 0; k < 10; k += 1) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(pane.x + pane.w * (0.19 + k * 0.05), pane.y + pane.h * 0.585, pane.w * 0.02, pane.h * 0.05); }
  ctx.fillStyle = '#4a321d'; ctx.fillRect(pane.x + pane.w * 0.2, pane.y + pane.h * 0.64, pane.w * 0.02, pane.h * 0.2); ctx.fillRect(pane.x + pane.w * 0.65, pane.y + pane.h * 0.64, pane.w * 0.02, pane.h * 0.2);
  ctx.fillStyle = '#32465a'; ctx.beginPath(); ctx.ellipse(pane.x + pane.w * 0.43, pane.y + pane.h * 0.55, pane.w * 0.04, pane.h * 0.04, 0, 0, TAU); ctx.fill();
  // THE RADIATOR under the sill, and on it the jumper, drying. Not his, not the
  // family's: a man's green jumper, the cuffs pulled long, a darn in one elbow.
  const rx = pane.x + pane.w * 0.12, ry = pane.y + pane.h * 0.74, rw = pane.w * 0.76, rh = pane.h * 0.24;
  ctx.fillStyle = '#e9e4d6'; ctx.fillRect(rx, ry, rw, rh);
  for (let k = 0; k < 18; k += 1) { ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(rx + (k + 0.5) * rw / 18, ry, 2, rh); }
  const jx = rx + rw * 0.16, jw = rw * 0.62;
  // Mid green, not dark: printed through the game's look a dark jumper went to a
  // hatched block on the radiator and stopped reading as anything someone wore.
  ctx.fillStyle = '#6f9a62';
  ctx.beginPath(); ctx.moveTo(jx, ry - rh * 0.05); ctx.lineTo(jx + jw, ry - rh * 0.05); ctx.lineTo(jx + jw * 0.94, ry + rh * 0.62); ctx.lineTo(jx + jw * 0.06, ry + rh * 0.62); ctx.closePath(); ctx.fill();
  ctx.fillRect(jx - jw * 0.06, ry - rh * 0.02, jw * 0.1, rh * 0.95); ctx.fillRect(jx + jw * 0.96, ry - rh * 0.02, jw * 0.1, rh * 0.9);
  for (let r = 0; r < 7; r += 1) for (let k = 0; k < 24; k += 1) { ctx.fillStyle = (r + k) % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.1)'; ctx.fillRect(jx + k * jw / 24, ry + r * rh * 0.09, jw / 48, rh * 0.06); }
  ctx.fillStyle = '#9dbb84'; ctx.fillRect(jx + jw * 0.18, ry + rh * 0.3, jw * 0.07, rh * 0.08);
  ctx.restore();
  // The frame and glazing bars, painted white years ago.
  ctx.fillStyle = '#e3dfd3';
  ctx.fillRect(fx, fy, fw, u * 0.02); ctx.fillRect(fx, fy + fh - u * 0.02, fw, u * 0.02);
  ctx.fillRect(fx, fy, u * 0.02, fh); ctx.fillRect(fx + fw - u * 0.02, fy, u * 0.02, fh);
  ctx.fillRect(fx + fw / 2 - u * 0.008, fy, u * 0.016, fh); ctx.fillRect(fx, fy + fh * 0.42, fw, u * 0.014);
  // The sill, snow lying on it, the window's light across the snow.
  ctx.fillStyle = '#c9c4b6'; ctx.fillRect(fx - u * 0.03, fy + fh, fw + u * 0.06, u * 0.03);
  ctx.fillStyle = '#f3f5f7'; ctx.beginPath(); ctx.ellipse(fx + fw / 2, fy + fh - u * 0.002, fw * 0.54, u * 0.025, 0, Math.PI, TAU); ctx.fill();
  const spill = ctx.createLinearGradient(0, fy + fh, 0, h);
  spill.addColorStop(0, 'rgba(255,214,150,.45)'); spill.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = '#e8ebee'; ctx.fillRect(0, h * 0.9, w, h * 0.1);
  ctx.fillStyle = spill; ctx.beginPath(); ctx.moveTo(fx, fy + fh); ctx.lineTo(fx + fw, fy + fh); ctx.lineTo(fx + fw * 1.4, h); ctx.lineTo(fx - fw * 0.4, h); ctx.closePath(); ctx.fill();
  // Frost in the corners of the glass, and his breath on it.
  for (const [cx, cy] of [[pane.x, pane.y], [pane.x + pane.w, pane.y], [pane.x, pane.y + pane.h], [pane.x + pane.w, pane.y + pane.h]]) {
    const frost = ctx.createRadialGradient(cx, cy, 0, cx, cy, pane.w * 0.22);
    frost.addColorStop(0, 'rgba(235,242,248,.7)'); frost.addColorStop(1, 'rgba(235,242,248,0)');
    ctx.fillStyle = frost; ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
  }
  const breath = ctx.createRadialGradient(pane.x + pane.w * 0.5, pane.y + pane.h * 0.46, 0, pane.x + pane.w * 0.5, pane.y + pane.h * 0.46, pane.w * 0.16);
  breath.addColorStop(0, 'rgba(240,244,248,.35)'); breath.addColorStop(1, 'rgba(240,244,248,0)');
  ctx.fillStyle = breath; ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
  return c;
}

// Paint the window at (w, h) into `target` (a 2D context): the plate, the snow in
// front of it, and how far it has come up out of the whiteout.
export function paintChildhoodWindow(target, w, h, { reveal = 1, time = 0, reducedMotion = false } = {}) {
  const key = `${w}x${h}`;
  if (!plate || plateKey !== key) { plate = paintPlate(w, h); plateKey = key; }
  target.save();
  target.fillStyle = '#e9edf1'; target.fillRect(0, 0, w, h);
  target.globalAlpha = Math.max(0, Math.min(1, reveal));
  target.drawImage(plate, 0, 0);
  target.globalAlpha = 1;
  // The snow, between him and the glass.
  const t = reducedMotion ? 0 : time;
  for (let i = 0; i < 90; i += 1) {
    const x = (hash(i * 5) * w + t * (20 + hash(i * 7) * 40)) % w;
    const y = (hash(i * 9) * h + t * (40 + hash(i * 11) * 70)) % h;
    const r = 0.8 + hash(i * 13) * 2.6;
    target.fillStyle = `rgba(245,248,252,${0.12 + hash(i * 17) * 0.2})`;
    target.beginPath(); target.arc(x, y, r, 0, TAU); target.fill();
  }
  // The whiteout, thinning as he gets there.
  target.fillStyle = `rgba(233,237,241,${Math.max(0, 1 - reveal) * 0.95})`;
  target.fillRect(0, 0, w, h);
  target.restore();
}
export function releaseChildhoodWindow() { plate = null; plateKey = ''; }
