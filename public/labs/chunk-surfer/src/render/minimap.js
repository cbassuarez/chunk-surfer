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
import { F } from '../data/floorplan/legend.js';

const W = 22, H = 11;       // cells

export function drawMinimap(px, py, waypoint, opts = {}) {
  const project=opts.project||((x,y)=>({x,y,layer:''})),player=project(px,py);px=player.x;py=player.y;
  const { cols,rows } = uiSize();
  const width=Math.max(18,Math.floor(opts.bounds?.w||W)),height=Math.max(9,Math.floor(opts.bounds?.h||H));
  const x0 = Math.floor(opts.bounds?.x ?? (cols-width-2)), y0 = Math.floor(opts.bounds?.y ?? 2);
  const panel = drawMachinePanel(x0, y0, width, height, { label:'LOCATION', source:opts.targetLabel||'N', meter:false });

  const left = panel.x, right = panel.x + panel.w - 1;
  const top = panel.y, bottom = panel.y + panel.h - 1;
  const cx = Math.floor((left + right) / 2), cy = Math.floor((top + bottom) / 2);
  const scale=Math.max(1,Math.floor(opts.scale||CELL_SCALE));

  // The physical slice the renderer and collision both consume. Open floor,
  // walls and doors are sampled in physical coordinates, so stacked hall
  // levels never appear on top of one another and the map cannot lie about a
  // threshold.
  const plan=opts.plan;
  if(plan?.solid&&plan.w&&plan.h){
    for(let my=top;my<=bottom;my++)for(let mx=left;mx<=right;mx++){
      const sx=Math.round(px+(mx-cx)*scale),sy=Math.round(py+(my-cy)*scale);
      if(sx<0||sy<0||sx>=plan.w||sy>=plan.h)continue;
      const i=sy*plan.w+sx,solid=!!plan.solid[i],flags=plan.flags?.[i]||0;
      if(flags&F.DOOR)uiGlyph(mx,my,'╫',flags&F.BRICKED?'ui-danger':'ui-amber',.58);
      else if(solid)uiGlyph(mx,my,'■','ui-frame',.34);
      else uiGlyph(mx,my,'·','ui-secondary',.18);
    }
  }

  // north mark, because a compass is the one honest thing on this page
  uiGlyph(cx, top, '│', 'ui-green');
  uiText(left, top, 'N', 'ui-green');

  // you
  uiGlyph(cx, cy, '+', 'ui-green', 1);

  if (waypoint) {
    waypoint=project(waypoint.x,waypoint.y);
    const dx = Math.round((waypoint.x - px) / scale);
    const dy = Math.round((waypoint.y - py) / scale);
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
    const dx = Math.round((opts.returnPoint.x - px) / scale);
    const dy = Math.round((opts.returnPoint.y - py) / scale);
    const mx = cx + dx, my = cy + dy;
    const ex = Math.max(left, Math.min(right, mx));
    const ey = Math.max(top, Math.min(bottom, my));
    uiGlyph(ex, ey, '◎', 'ui-blue', 1);
  }

  if (opts.presence) {
    opts.presence={...opts.presence,...project(opts.presence.x,opts.presence.y)};
    const dx = Math.round((opts.presence.x - px) / scale);
    const dy = Math.round((opts.presence.y - py) / scale);
    const mx = cx + dx, my = cy + dy;
    const inside = mx >= left && mx <= right && my >= top && my <= bottom;
    if (inside) {
      uiGlyph(mx,my,'H','ui-danger',Math.max(0.72,opts.presence.alpha??0.95));
    } else {
      const ex = Math.max(left, Math.min(right, mx));
      const ey = Math.max(top, Math.min(bottom, my));
      uiGlyph(ex, ey, 'H', 'ui-danger', Math.max(0.72, opts.presence.alpha ?? 0.65));
    }
  }

  if(opts.hush){
    opts.hush={...opts.hush,...project(opts.hush.x,opts.hush.y)};
    const mx=cx+Math.round((opts.hush.x-px)/scale),my=cy+Math.round((opts.hush.y-py)/scale);
    if(mx>=left&&mx<=right&&my>=top&&my<=bottom)uiGlyph(mx,my,'S','ui-amber',.92);
  }

  const layer=String(opts.layer||player.layer||'').replace('hall_','').toUpperCase();
  if(layer&&layer!=='GROUND')uiText(right-Math.min(right-left,layer.length+2),top,`${layer==='LOWER'?'↓↑':layer==='UPPER'?'↓':'↑'} ${layer}`,'ui-green');
  if (opts.label) uiText(left, bottom, opts.label.toUpperCase().slice(0, panel.w), 'ui-blue');
  if(opts.expanded)uiText(left,Math.min(rows-2,bottom+1),'[GREEN] YOU · [BLUE] TARGET · [RED] HUSH', 'ui-secondary',.72);
}
