// The aperture and its cover stay at the housing. Only the electrode plane
// moves with the viewing angle, and the aperture clips that movement.
const unit = value => Math.max(-1, Math.min(1, Number(value) || 0));

export const LCD_INK = Object.freeze({
  signal: '#b8e3a3',
  quiet: '#92bc89',
  halo: '#86ce7a',
  warning: '#ffbd81',
  warningHalo: '#e88340',
});

export function lcdElectrodeOffset(view, dpr = 1, depth = 1) {
  return {
    x: -unit(view?.x ?? -.28) * 2.7 * dpr * depth,
    y: -unit(view?.y ?? -.15) * 2.0 * dpr * depth,
  };
}

function fill(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function gradient(ctx, x, y, endX, endY, stops) {
  const field = ctx.createLinearGradient(x, y, endX, endY);
  for (const [at, color] of stops) field.addColorStop(at, color);
  return field;
}

// Draw first, then clip the caller's electrode plane to the inner cutout.
export function drawLcdWell(ctx, {x, y, w, h, dpr: u = 1}, illumination = 0) {
  const opacity = ctx.globalAlpha;
  fill(ctx, x-2.3*u, y-2.3*u, w+4.6*u, h+4.6*u,
    gradient(ctx,x,y,x,y+h,[[0,'#566253'],[.45,'#282f27'],[1,'#d0d6b8']]));
  fill(ctx, x-u, y-u, w+2*u, h+2*u, '#0d1710');
  fill(ctx, x, y, w, h,
    gradient(ctx,x,y,x+w*.10,y+h,[[0,'#192a20'],[.18,'#283f2b'],[.64,'#385139'],[1,'#263928']]));
  if (illumination > 0) {
    ctx.globalAlpha = opacity * Math.min(.14, illumination);
    fill(ctx,x,y,w,h,'#a5ca83');
    ctx.globalAlpha = opacity;
  }
}

// Reflected light and the black lip belong to the face of the glass. Painting
// them after the electrodes keeps a reflected highlight in front of the text.
export function drawLcdCover(ctx, {x, y, w, h, dpr: u = 1}, view) {
  const angle = unit(view?.x ?? -.28);
  const start = x + (.08 + angle * .09) * w;
  fill(ctx,x,y,w,h,gradient(ctx,start,y,start+w*.49,y+h*.25,
    [[0,'#cdddb300'],[.24,'#cfdfba19'],[.48,'#e3ecc51b'],[.72,'#b9cfa708'],[1,'#b9cfa700']]));
  const lip = Math.min(h*.28,5.4*u);
  fill(ctx,x,y,w,lip,gradient(ctx,x,y,x,y+lip,[[0,'#081209c9'],[1,'#08120900']]));
  fill(ctx,x,y+h-lip,w,lip,gradient(ctx,x,y+h-lip,x,y+h,[[0,'#08120900'],[1,'#081209aa']]));
  fill(ctx,x,y,3*u,h,gradient(ctx,x,y,x+3*u,y,[[0,'#0b150ca0'],[1,'#0b150c00']]));
  fill(ctx,x+w-3*u,y,3*u,h,gradient(ctx,x+w-3*u,y,x+w,y,[[0,'#0b150c00'],[1,'#0b150ca0']]));
  fill(ctx,x+u,y+h-u,w-2*u,.6*u,'#c8dab96a');
}
