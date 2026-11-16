import { WINDOW_RAMP, WINDOW_FRONT_END_RAMP } from './window-surface-look.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
export function theatreHouseScene(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  return { kind: value.kind === 'wash' ? 'wash' : 'house', frontEnd: value.frontEnd === true,
    intensity: clamp(value.intensity, 0, .35) };
}

// One still dither field at rest. Dynamic scene/frame events repaint this field;
// there is no idle animation, video, desktop capture or additional GL context.
export function paintTheatreHouse(ctx, width, height, scene = {}, frame = {}) {
  const style = theatreHouseScene(scene), ramp = style.frontEnd ? WINDOW_FRONT_END_RAMP : WINDOW_RAMP;
  const image = ctx.createImageData(width, height), pixels = image.data;
  const cx = frame.known ? (frame.x + frame.width / 2) / Math.max(1, frame.houseWidth) : .5;
  const cy = frame.known ? (frame.y + frame.height / 2) / Math.max(1, frame.houseHeight) : .5;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const rank = (BAYER[(y % 4) * 4 + x % 4] + .5) / 16;
    const falloff = Math.max(0, 1 - Math.hypot(x / width - cx, y / height - cy) * 1.5);
    const level = .15 + (style.kind === 'wash' ? style.intensity * falloff * 7 : 0);
    const index = Math.min(ramp.length - 1, Math.floor(level) + (rank < level % 1 ? 1 : 0));
    const p = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) pixels[p + c] = Math.round(ramp[index][c] * 255);
    pixels[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}
