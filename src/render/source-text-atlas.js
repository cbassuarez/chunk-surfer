// Lossless, variable-width Source rows. Packing never edits authored copy.
// World quads retain their bounds; sourceTextQuadMatrix letterboxes their ink.
import { WORLD_LETTERING_FONT_KEY, worldLetteringFont } from './world-lettering-fonts.js';

const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const hash = values => {
  let h = 2166136261;
  for (const value of values) {
    const text = String(value);
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 10, 16777619);
  }
  return (h >>> 0).toString(16);
};
const textOf = entry => String(typeof entry === 'string' ? entry : entry?.text || entry?.source?.text || '');

/** Interaction > resident variant > unused base corpus if capacity is exceeded.
 * Whitespace, authored redaction and punctuation are identity-bearing copy. */
export function sourceTextAtlasInputs(corpus = [], instances = []) {
  const records = new Map();
  const add = (text, priority) => {
    if (!text) return;
    if (!records.has(text)) records.set(text, { text, priority, order: records.size });
    else records.get(text).priority = Math.max(priority, records.get(text).priority);
  };
  for (const entry of corpus) add(textOf(entry), 0);
  for (const entry of instances) add(textOf(entry), entry?.interactiveId ? 2 : 1);
  return [...records.values()];
}

export function sourceTextAtlasCacheKey(corpus = [], instances = [], options = {}) {
  const input = sourceTextAtlasInputs(corpus, instances);
  return `source-lossless-v1:${hash([
    WORLD_LETTERING_FONT_KEY, options.size ?? 2048, options.maxFont ?? 14,
    options.minFont ?? 8, options.gutter ?? 3, options.role ?? 'mono',
    ...input.flatMap(entry => [entry.priority, entry.text]),
  ])}:${input.length}`;
}

function measureBlock(ctx, entry, fontSize, role, gutter) {
  ctx.font = worldLetteringFont(fontSize, role);
  // Source code is monospaced: disable pair kerning to retain its columns.
  ctx.fontKerning = 'none'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const reference = ctx.measureText('Hg|[]_{}É—');
  const lines = entry.text.split('\n').map(text => {
    const m = ctx.measureText(text);
    return { text, advance: m.width,
      left: Math.max(0, number(m.actualBoundingBoxLeft, 0)),
      right: Math.max(m.width, number(m.actualBoundingBoxRight, m.width)),
      ascent: Math.max(0, number(m.actualBoundingBoxAscent, fontSize)),
      descent: Math.max(0, number(m.actualBoundingBoxDescent, fontSize * .25)) };
  });
  const ascent = Math.ceil(Math.max(number(reference.actualBoundingBoxAscent, fontSize), ...lines.map(line => line.ascent)));
  const descent = Math.ceil(Math.max(number(reference.actualBoundingBoxDescent, fontSize * .25), ...lines.map(line => line.descent)));
  const lineHeight = Math.max(1, ascent + descent + 1);
  // Browser ink metrics describe outline bounds. Raster antialiasing can touch
  // an adjacent pixel; keep that pixel INSIDE the sampled UV, then put the
  // separate atlas gutter beyond it to prevent neighboring-row bleed.
  const inkInset = 1;
  const inkWidth = Math.max(1, Math.ceil(Math.max(...lines.map(line => line.left + line.right)))) + inkInset * 2;
  const inkHeight = Math.max(1, ascent + descent + (lines.length - 1) * lineHeight) + inkInset * 2;
  return { ...entry, lines, fontSize, font: ctx.font, ascent, descent, lineHeight,
    inkInset, contentWidth: inkWidth, contentHeight: inkHeight, aspect: inkWidth / inkHeight,
    width: inkWidth + gutter * 2, height: inkHeight + gutter * 2 };
}

// MaxRects best-short-side packing; stable ties keep the GPU atlas deterministic.
function pack(rectangles, size, prioritize) {
  let free = [{ x: 0, y: 0, width: size, height: size }];
  const placed = [], omitted = [];
  const sorted = rectangles.slice().sort((a, b) =>
    (prioritize ? b.priority - a.priority : 0) || b.height - a.height || b.width - a.width || a.order - b.order);
  for (const rectangle of sorted) {
    let selected = null;
    for (const slot of free) {
      if (slot.width < rectangle.width || slot.height < rectangle.height) continue;
      const dw = slot.width - rectangle.width, dh = slot.height - rectangle.height;
      const score = [Math.min(dw, dh), Math.max(dw, dh), slot.y, slot.x];
      if (!selected || score.some((value, index) => value < selected.score[index] && score.slice(0, index).every((v, i) => v === selected.score[i]))) selected = { slot, score };
    }
    if (!selected) {
      omitted.push({ text: rectangle.text, priority: rectangle.priority,
        reason: rectangle.width > size || rectangle.height > size ? 'block-exceeds-texture-size' : 'atlas-capacity' });
      continue;
    }
    const used = { ...rectangle, x: selected.slot.x, y: selected.slot.y };
    placed.push(used);
    const next = [];
    for (const slot of free) {
      if (used.x >= slot.x + slot.width || used.x + used.width <= slot.x || used.y >= slot.y + slot.height || used.y + used.height <= slot.y) { next.push(slot); continue; }
      if (used.x > slot.x) next.push({ ...slot, width: used.x - slot.x });
      if (used.x + used.width < slot.x + slot.width) next.push({ ...slot, x: used.x + used.width, width: slot.x + slot.width - used.x - used.width });
      if (used.y > slot.y) next.push({ ...slot, height: used.y - slot.y });
      if (used.y + used.height < slot.y + slot.height) next.push({ ...slot, y: used.y + used.height, height: slot.y + slot.height - used.y - used.height });
    }
    free = next.filter((slot, index) => !next.some((other, j) => j !== index &&
      other.x <= slot.x && other.y <= slot.y && other.x + other.width >= slot.x + slot.width && other.y + other.height >= slot.y + slot.height &&
      (other.x !== slot.x || other.y !== slot.y || other.width !== slot.width || other.height !== slot.height || j < index)));
  }
  return { placed, omitted };
}

/** Allocate exact strings; choose the largest common font that fits the atlas.
 * On true overflow, live interactive/resident text gets first allocation and
 * omissions remain explicit. No clipping, excerpting, wrapping or stretching. */
export function planSourceTextAtlas(ctx, { corpus = [], instances = [], size = 2048,
  maxFont = 14, minFont = 8, gutter = 3, role = 'mono' } = {}) {
  if (!ctx?.measureText) throw new TypeError('Source text atlas needs a Canvas measurement context');
  size = Math.min(2048, Math.max(32, Math.floor(number(size, 2048))));
  minFont = Math.max(1, Math.floor(number(minFont, 8)));
  maxFont = Math.max(minFont, Math.floor(number(maxFont, 14)));
  gutter = Math.max(1, Math.floor(number(gutter, 3)));
  const input = sourceTextAtlasInputs(corpus, instances);
  let packed, blocks, fontSize = maxFont;
  ctx.save();
  try {
    for (; fontSize >= minFont; fontSize--) {
      blocks = input.map(entry => measureBlock(ctx, entry, fontSize, role, gutter));
      packed = pack(blocks, size, false);
      if (!packed.omitted.length) break;
    }
    if (fontSize < minFont) { fontSize = minFont; packed = pack(blocks, size, true); }
  } finally { ctx.restore(); }
  const entries = new Map(packed.placed.map(entry => {
    const left = entry.x + gutter, top = entry.y + gutter;
    return [entry.text, { ...entry,
      // Match the production Canvas FLIP_Y upload and top-left authoring.
      uv: [left / size, 1 - (top + entry.contentHeight) / size,
        (left + entry.contentWidth) / size, 1 - top / size] }];
  }));
  const usedPixels = packed.placed.reduce((sum, entry) => sum + entry.width * entry.height, 0);
  let gpuBytesWithMipmaps = 0, mipLevelCount = 0;
  for (let level = size; level >= 1; level = Math.floor(level / 2)) { gpuBytesWithMipmaps += level * level * 4; mipLevelCount++; }
  return { size, fontSize, font: worldLetteringFont(fontSize, role), role, gutter,
    requested: input.length, accepted: entries.size, entries, omitted: packed.omitted,
    interactiveOmissions: packed.omitted.filter(entry => entry.priority === 2).length,
    residentOmissions: packed.omitted.filter(entry => entry.priority > 0).length,
    usedPixels, occupancy: usedPixels / (size * size), bytes: size * size * 4, gpuBytesWithMipmaps, mipLevelCount,
    fontKey: WORLD_LETTERING_FONT_KEY,
    cacheKey: sourceTextAtlasCacheKey(corpus, instances, { size, maxFont, minFont, gutter, role }) };
}

export function paintSourceTextAtlas(ctx, plan) {
  if (!ctx || !plan?.entries) throw new TypeError('Source text atlas needs a plan and Canvas context');
  ctx.save();
  try {
    ctx.clearRect(0, 0, plan.size, plan.size);
    ctx.font = plan.font; ctx.fontKerning = 'none'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    for (const entry of plan.entries.values()) for (let index = 0; index < entry.lines.length; index++) {
      const line = entry.lines[index];
      ctx.fillText(line.text, entry.x + plan.gutter + entry.inkInset + line.left,
        entry.y + plan.gutter + entry.inkInset + entry.ascent + index * entry.lineHeight);
    }
  } finally { ctx.restore(); }
}

/** Preserve the real glyph aspect inside the authored centered physical quad.
 * Translation, orientation, depth, collision and the containing bounds persist. */
export function sourceTextQuadMatrix(matrix, entry) {
  if (!matrix || matrix.length !== 16 || !(entry?.aspect > 0)) return matrix;
  const width = Math.hypot(matrix[0], matrix[1], matrix[2]);
  const height = Math.hypot(matrix[4], matrix[5], matrix[6]);
  if (!(width > 0 && height > 0)) return matrix;
  const aspect = width / height;
  const sx = Math.min(1, entry.aspect / aspect), sy = Math.min(1, aspect / entry.aspect);
  const result = new Float32Array(matrix);
  for (let axis = 0; axis < 3; axis++) { result[axis] *= sx; result[4 + axis] *= sy; }
  return result;
}
