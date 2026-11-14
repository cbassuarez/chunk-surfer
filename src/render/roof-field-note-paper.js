import { PAPER_FORMAT, PAPER_HANDLING_PROFILE, PAPER_STOCK, paperHandlingVector } from '../data/paper-system.js';
import { PAPER_TYPOGRAPHY } from '../generated/paper-catalog.js';
import { fitLines } from './fit-text.js';
import { ensureWorldLetteringFonts, worldLetteringFont, worldLetteringFontsStatus } from './world-lettering-fonts.js';

export const ROOF_FIELD_NOTE_ID = 'roof-ren-field-note';

const format = PAPER_FORMAT.A4;
const asset = { record: { handlingVector: paperHandlingVector(PAPER_HANDLING_PROFILE.CLEAN) } };
const pending = { asset, image: null, ready: false, error: null };
let cachedKey = null;
let cachedState = null;

// This note records a live quest state. Give its current body the same page
// surface as filed sheets without making a fallback edition for missing assets.
export function roofFieldNotePaper(doc) {
  if (typeof document === 'undefined') return pending;
  const fonts = worldLetteringFontsStatus(document);
  if (fonts.error) return { ...pending, error: fonts.error };
  if (!fonts.ready) {
    if (!fonts.pending) void ensureWorldLetteringFonts().catch(() => {});
    return pending;
  }

  const key = JSON.stringify([doc.byline, doc.body]);
  if (key === cachedKey) return cachedState;

  const image = document.createElement('canvas');
  image.width = format.canonicalPx[0] / 2;
  image.height = format.canonicalPx[1] / 2;
  const ctx = image.getContext('2d');
  if (!ctx) return { ...pending, error: 'Paper canvas unavailable' };

  const pxPerMm = image.width / format.widthMm;
  const ptToPx = pt => pt * 25.4 / 72 * pxPerMm;
  const left = 20 * pxPerMm;
  const width = image.width - 2 * left;
  const leading = PAPER_TYPOGRAPHY.rulePitchMm * pxPerMm;
  let y = 27 * pxPerMm;

  ctx.fillStyle = PAPER_STOCK.RECYCLED.tone;
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.fillStyle = '#2c2925';
  ctx.textBaseline = 'alphabetic';
  ctx.fontKerning = 'none';

  function print(value, size, role) {
    ctx.font = worldLetteringFont(ptToPx(size), role);
    const columns = Math.floor(width / ctx.measureText('0').width);
    for (const line of fitLines(value, columns)) {
      ctx.fillText(line, left, y);
      y += leading;
    }
  }

  for (const entry of doc.body) {
    if (entry?.raw) {
      print(entry.raw, PAPER_TYPOGRAPHY.headingPt, 'monoBold');
      if (doc.byline) print(doc.byline, PAPER_TYPOGRAPHY.labelPt, 'mono');
    } else if (entry?.rule) {
      ctx.fillRect(left, y - leading * .4, width, Math.max(1, .14 * pxPerMm));
    } else if (entry) {
      print(entry, PAPER_TYPOGRAPHY.bodyPt, 'mono');
    } else {
      y += leading * .55;
    }
  }

  cachedKey = key;
  cachedState = { asset, image, ready: true, error: null };
  return cachedState;
}
