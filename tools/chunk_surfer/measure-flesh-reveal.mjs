// Largest SOLID ink region inside a crop, as a share of the crop. Solid
// means a pixel and its 5x5 neighbourhood are all ink: dark hatching is
// tissue in shadow, a field with no hatch at all is an absence.
// The region is the bus gap (|x|<.55, y .55..2.6 on the crossing plane)
// projected from the harness camera at bus-local (0, eye, 2.5) aimed at
// (0, floor+1.45, 4.3), with the renderer's default tan(half fov) .95.
//   node measure-flesh-reveal.mjs a.png [b.png ...]
import sharp from 'sharp';
import { OUTSKIRTS_BUS_PASSAGE as C } from '../../src/data/outskirts-bus-passage.js';
const files = process.argv.slice(2), INK = 14, TAN = .95;
function gapQuad(W, H) {
  const eye = [0, C.floor + 1.62, 2.5], target = [0, C.floor + 1.45, 4.3];
  const pitch = Math.atan2(target[1] - eye[1], target[2] - eye[2]), f = [0, Math.sin(pitch), Math.cos(pitch)], up = [0, Math.cos(pitch), -Math.sin(pitch)];
  // Bus +x prints on the left of the frame when looking down +z.
  return [[-.55, .55], [.55, .55], [.55, 2.6], [-.55, 2.6]].map(([x, y]) => {
    const d = [x, y + C.floor - .5 - eye[1] + .5, C.bodyPassage.planeZ - eye[2]], fz = d[1] * f[1] + d[2] * f[2], uy = d[1] * up[1] + d[2] * up[2];
    return [W / 2 - (x / fz) * (H / 2) / TAN, H / 2 - (uy / fz) * (H / 2) / TAN];
  });
}
const inside = (q, x, y) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, yi] = q[i], [xj, yj] = q[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
for (const file of files) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ink = new Uint8Array(W * H), solid = new Uint8Array(W * H), quad = gapQuad(W, H), mask = new Uint8Array(W * H);
  let area = 0; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (inside(quad, i + .5, j + .5)) { mask[j * W + i] = 1; area++; }
  for (let i = 0; i < W * H; i++) ink[i] = data[i] < INK ? 1 : 0;
  for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
    let all = 1; for (let b = -2; b <= 2 && all; b++) for (let a = -2; a <= 2; a++) if (!ink[(j + b) * W + i + a]) { all = 0; break; }
    solid[j * W + i] = all && mask[j * W + i];
  }
  const seen = new Uint8Array(W * H); let largest = 0, total = 0;
  for (let s = 0; s < W * H; s++) {
    if (!solid[s] || seen[s]) continue;
    let n = 0; const stack = [s]; seen[s] = 1;
    while (stack.length) { const p = stack.pop(); n++; const px = p % W, py = (p - px) / W;
      for (const q of [px > 0 ? p - 1 : -1, px < W - 1 ? p + 1 : -1, py > 0 ? p - W : -1, py < H - 1 ? p + W : -1])
        if (q >= 0 && solid[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }
    total += n; largest = Math.max(largest, n);
  }
  console.log(JSON.stringify({ file, gap: quad.map(p => p.map(Math.round)), largestSolidInkPctOfGap: +(100 * largest / area).toFixed(2), solidInkPctOfGap: +(100 * total / area).toFixed(2) }));
}
