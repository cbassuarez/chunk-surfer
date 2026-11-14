import { assetUrl } from '../platform/paths.js';

const tileWidth = 400;
const tileHeight = 250;
const duration = .66;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

// Overlapping exposures let the next detail come forward before the previous
// one leaves. Hold on the figure at Horizon long enough to leave an imprint.
const cuts = [
  { tile: 0, start: 0, centerX: .46, centerY: .42 }, // Work order
  { tile: 2, start: .15, centerX: .52, centerY: .39 }, // HUSH
  { tile: 3, start: .29, centerX: .47, centerY: .44 }, // Demolition vision
  { tile: 4, start: .43, centerX: .50, centerY: .40 }, // Source doors
  { tile: 6, start: .57, centerX: .54, centerY: .37 }, // Source II
  { tile: 5, start: .72, centerX: .50, centerY: .39 }, // Horizon
];
const facets = [
  { tile: 1, bounds: [.028, .06, .34, .40], shape: [[.04,.05],[.36,.11],[.28,.41],[.012,.51]] },
  { tile: 7, bounds: [.61, .08, .35, .48], shape: [[.66,.08],[.97,.13],[.94,.47],[.68,.61],[.73,.36]] },
  { tile: 6, bounds: [.10, .40, .39, .30], shape: [[.11,.42],[.36,.33],[.53,.55],[.30,.72],[.09,.58]] },
  { tile: 3, bounds: [.57, .40, .38, .26], shape: [[.62,.44],[.96,.39],[.91,.60],[.65,.67],[.53,.57]] },
];

export async function loadOpeningLifeFlashAtlas() {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
  const image = new Image();
  image.src = assetUrl('assets/source-drive/opening-futures.webp');
  await image.decode();
  if (image.naturalWidth !== tileWidth * 4 || image.naturalHeight !== tileHeight * 2) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 400;
  const layer = canvas.getContext('2d');
  if (!layer) return null;
  const mask = layer.createRadialGradient(314, 148, 52, 314, 148, 220);
  mask.addColorStop(0, '#fff');
  mask.addColorStop(.65, 'rgba(255,255,255,.85)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  return { image, layer, mask };
}

export function openingLifeFlashFrame(frame, presentation = {}) {
  const pose = frame?.vehiclePose;
  if (frame?.phase !== 'fall' || frame.worldOwner !== 'drive' || !pose?.cliffCommitted || frame.skipped ||
      presentation.effectsMode === 'off' || presentation.flashMode === 'off') return null;
  const flight = frame.commitment?.contactFlight;
  const left = flight - pose.fallSeconds;
  const window = Math.min(duration, flight);
  if (!(left > 0 && left < window)) return null;
  const progress = 1 - left / window;
  const envelope = smooth(progress / .14) * smooth((1 - progress) / .12);
  const steady = presentation.flashMode === 'reduced' || presentation.reducedMotion || presentation.reducedDread;
  return { progress, envelope, steady: !!steady };
}

function drawTile(ctx, image, tile, x, y, w, h) {
  const sw = Math.min(tileWidth, tileHeight * w / h);
  const sh = Math.min(tileHeight, tileWidth * h / w);
  const sx = tile % 4 * tileWidth + (tileWidth - sw) / 2;
  const sy = Math.floor(tile / 4) * tileHeight + (tileHeight - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

function clipFacet(ctx, shape, width, height) {
  ctx.beginPath();
  for (const [index, [x,y]] of shape.entries()) {
    if (index === 0) ctx.moveTo(x * width, y * height);
    else ctx.lineTo(x * width, y * height);
  }
  ctx.closePath();
  ctx.clip();
}

export function drawOpeningLifeFlash(ctx, { image, layer, mask }, { progress, envelope, steady }) {
  const { width, height } = ctx.canvas;
  if (!width || !height || !image || envelope <= 0) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  // Keep the dash and wheel visible. The fall stays behind the images in the
  // gaps and along the edges of the same first-person view.
  for (const [index, facet] of facets.entries()) {
    const [x,y,w,h] = facet.bounds;
    ctx.save();
    clipFacet(ctx, facet.shape, width, height);
    ctx.globalAlpha = envelope * (steady ? .22 : .46 * smooth((progress - index * .065) / .25));
    drawTile(ctx, image, facet.tile, x * width, y * height, w * width, h * height);
    ctx.restore();
  }

  const index = steady ? cuts.length - 1 : cuts.findLastIndex(cut => cut.start <= progress);
  const current = cuts[index], next = steady ? null : cuts[index + 1];
  const dissolve = next ? smooth((progress - (next.start - .095)) / .095) : 0;
  // Form a single exposure before blending it into the live picture. This
  // keeps the overlap at the same strength and feathers it into the cab.
  const { width: lw, height: lh } = layer.canvas;
  layer.save();
  layer.fillStyle = '#080d11';
  layer.fillRect(0, 0, lw, lh);
  layer.globalCompositeOperation = 'lighter';
  for (const [shot, weight] of [[current, 1 - dissolve], [next, dissolve]]) {
    if (!shot || weight <= 0) continue;
    const w = .77 * lw, h = .68 * lh;
    layer.globalAlpha = weight;
    drawTile(layer, image, shot.tile, shot.centerX * lw - w / 2, shot.centerY * lh - h / 2, w, h);
  }
  layer.globalCompositeOperation = 'destination-in';
  layer.globalAlpha = 1;
  layer.fillStyle = mask;
  layer.fillRect(0, 0, lw, lh);
  layer.restore();
  ctx.globalAlpha = envelope * (steady ? .56 : .92);
  ctx.drawImage(layer.canvas, 0, 0, width, height);
  ctx.restore();
}
