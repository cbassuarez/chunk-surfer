import { documentInk, documentPageState, drawPhysicalPage } from '../game/document.js';
import { paperMaterialState } from '../game/paper-assets.js';
import { uiDraw } from './ui.js';

const PAGE_ASPECT = 210 / 297;
const POSE = { yaw: .25, pitch: -.15, roll: -.062, distance: .535 };
let surface = null;
let lastPage = null;

// The reader's paper mesh also renders the preview. Copy its frame once per
// selection, asset arrival or resize since the reader shares its GL canvas.
export function drawBagSheetPreview(doc, page, rect) {
  if (!doc || rect.w <= 0 || rect.h <= 0) return 'unavailable';
  const state = documentPageState(doc, page);
  if (!state.asset || state.error) return 'unavailable';
  const material = paperMaterialState(doc, page);
  if (!state.ready) return 'loading';

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const x = rect.x * cellW * dpr;
    const y = rect.y * cellH * dpr;
    const w = rect.w * cellW * dpr;
    const h = rect.h * cellH * dpr;
    const pageW = Math.min(w, h * PAGE_ASPECT);
    const pageH = pageW / PAGE_ASPECT;
    const rasterW = Math.max(192, Math.min(704, Math.ceil(pageW / 16) * 16));
    const rasterH = Math.round(rasterW / PAGE_ASPECT);
    const materialImage = material.ready ? material.image : null;
    const ink = documentInk(doc, page);

    if (!surface) surface = document.createElement('canvas');
    if (!lastPage || lastPage.image !== state.image || lastPage.materialImage !== materialImage
      || lastPage.inkImage !== ink?.image || lastPage.inkVersion !== ink?.version
      || surface.width !== rasterW || surface.height !== rasterH) {
      surface.width = rasterW;
      surface.height = rasterH;
      const preview = surface.getContext('2d');
      if (!preview) return;
      const inset = .045;
      drawPhysicalPage(preview, doc, page, {
        x: rasterW * inset, y: rasterH * inset,
        w: rasterW * (1 - 2 * inset), h: rasterH * (1 - 2 * inset), dpr: rasterW / 520,
      }, { pose: POSE, ink });
      lastPage = { image: state.image, materialImage, inkImage: ink?.image, inkVersion: ink?.version };
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(surface, x + (w - pageW) / 2, y + (h - pageH) / 2, pageW, pageH);
  });
  return 'ready';
}
