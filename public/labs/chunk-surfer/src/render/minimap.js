// A very shitty map.
//
// It shows you where you are, and a waypoint. It does not show walls, doors, or
// routes, because the previous recordist did not draw any — he wrote down where
// the rooms were and assumed whoever came after him could find a corridor.
//
// This is deliberate and it is the whole navigation design: pages give you a
// destination, the building gives you nothing, and the dark does the rest.

import { uiText, uiGlyph, uiSize } from './ui.js';
import { drawMachinePanel } from './presentation.js';
import { CELL_SCALE } from '../config.js';

const W = 22, H = 11;       // cells
const SCALE = 7 * CELL_SCALE; // runtime cells per map cell

export function drawMinimap(px, py, waypoint, opts = {}) {
  const project=opts.project||((x,y)=>({x,y,layer:''})),player=project(px,py);px=player.x;py=player.y;
  const { cols } = uiSize();
  const x0 = cols - W - 2, y0 = 2;
  const panel = drawMachinePanel(x0, y0, W, H, { label:'LOCATION', source:'N', meter:false });

  const left = panel.x, right = panel.x + panel.w - 1;
  const top = panel.y, bottom = panel.y + panel.h - 1;
  const cx = Math.floor((left + right) / 2), cy = Math.floor((top + bottom) / 2);

  // north mark, because a compass is the one honest thing on this page
  uiGlyph(cx, top, '│', 'ui-green');
  uiText(left, top, 'N', 'ui-green');

  // you
  uiGlyph(cx, cy, '+', 'ui-green', 1);

  if (waypoint) {
    waypoint=project(waypoint.x,waypoint.y);
    const dx = Math.round((waypoint.x - px) / SCALE);
    const dy = Math.round((waypoint.y - py) / SCALE);
    const mx = cx + dx, my = cy + dy;
    const inside = mx >= left && mx <= right && my >= top && my <= bottom;
    if (inside) {
      const mark=waypoint.layer&&player.layer&&waypoint.layer!==player.layer?(waypoint.floor>player.floor?'↑':'↓'):'×';
      uiGlyph(mx, my, mark, 'ui-blue', 1);
    } else {
      // off the edge of the page: pin it to the rim, the way you would with a
      // thumb held against a paper map
      const ex = Math.max(left, Math.min(right, mx));
      const ey = Math.max(top, Math.min(bottom, my));
      const mark=waypoint.layer&&player.layer&&waypoint.layer!==player.layer?(waypoint.floor>player.floor?'↑':'↓'):'×';uiGlyph(ex,ey,mark,'ui-blue');
    }
  }

  // The recorder return is shown only after the HUSH source has been silenced.
  // The source itself never receives a mark: it must be found by its sound.
  if (opts.returnPoint) {
    opts.returnPoint=project(opts.returnPoint.x,opts.returnPoint.y);
    const dx = Math.round((opts.returnPoint.x - px) / SCALE);
    const dy = Math.round((opts.returnPoint.y - py) / SCALE);
    const mx = cx + dx, my = cy + dy;
    const ex = Math.max(left, Math.min(right, mx));
    const ey = Math.max(top, Math.min(bottom, my));
    uiGlyph(ex, ey, '◎', 'ui-blue', 1);
  }

  if (opts.presence) {
    opts.presence={...opts.presence,...project(opts.presence.x,opts.presence.y)};
    const dx = Math.round((opts.presence.x - px) / SCALE);
    const dy = Math.round((opts.presence.y - py) / SCALE);
    const mx = cx + dx, my = cy + dy;
    const inside = mx >= left && mx <= right && my >= top && my <= bottom;
    if (inside) {
      uiGlyph(mx, my, '☍', 'ui-danger', Math.max(0.72, opts.presence.alpha ?? 0.95));
    } else {
      const ex = Math.max(left, Math.min(right, mx));
      const ey = Math.max(top, Math.min(bottom, my));
      uiGlyph(ex, ey, '☍', 'ui-danger', Math.max(0.72, opts.presence.alpha ?? 0.65));
    }
  }

  const layer=String(opts.layer||player.layer||'').replace('hall_','').toUpperCase();
  if(layer&&layer!=='GROUND')uiText(right-Math.min(right-left,layer.length+2),top,`${layer==='LOWER'?'↓↑':layer==='UPPER'?'↓':'↑'} ${layer}`,'ui-green');
  if (opts.label) uiText(left, bottom, opts.label.toUpperCase().slice(0, panel.w), 'ui-blue');
}
