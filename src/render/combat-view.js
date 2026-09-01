// Code-native battle presentation primitives. These share the field-case tool
// schematics and the dialogue image-card renderer so combat looks like the same
// physical interface, under pressure.

import { uiDraw, uiFill, uiLine, uiStrokeRect, uiText } from './ui.js';
import { combatGaugeGeometry, combatGaugeState } from './meter.js';
import { UI_COLOR, activeTheme } from './palette.js';
import { drawBagIcon } from './bag-icons.js';
import { loadStoryArtImage, resolveStoryArt } from '../game/story-art.js';
import { SNR_TRIANGLE } from '../game/combat-state.js';
import { fireballRayPoint } from '../game/window-channel.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export function combatBarCells(value, maxValue, width) {
  const max = Math.max(1, Number(maxValue) || 1);
  return clamp(value / max, 0, 1) * Math.max(0, Number(width) || 0);
}

export function combatInjuryStage({ composure = 0, maxComposure = 1, injuries = 0 } = {}) {
  const ratio = clamp(composure / Math.max(1, maxComposure), 0, 1);
  const burden = Math.max(0, Number(injuries) || 0);
  if (ratio <= .25 || burden >= 4) return 'critical';
  if (ratio <= .50 || burden >= 2) return 'wounded';
  if (ratio <= .75 || burden >= 1) return 'hurt';
  return 'steady';
}

export function combatTonePalette(tone = 'player') {
  if (tone === 'enemy') {
    return { fill: 'rgba(255,76,76,0.84)', pip: '#FF4C4C', outline: UI_COLOR.danger, dim: '#FF4C4C' };
  }
  if (tone === 'theme') {
    const theme = activeTheme();
    return { fill: theme.phosphor, pip: theme.phosphor, outline: theme.phosphor, dim: theme.dim };
  }
  return { fill: 'rgba(255,181,54,0.88)', pip: '#FFB536', outline: UI_COLOR.amber, dim: '#FFB536' };
}

export function drawCombatBar({
  x, y, w, value, max, label, tone = 'player', alpha = 1, lowDanger = true,
} = {}) {
  const labelText = String(label || '').toUpperCase();
  const amount = `${Math.max(0, Math.round(value))}/${Math.max(1, Math.round(max))}`;
  const colors = combatTonePalette(tone);
  const low = lowDanger && value / Math.max(1, max) <= .25;
  uiText(x, y, labelText, tone === 'enemy' ? 'ui-danger' : low ? 'ui-danger' : 'ui-label', alpha);
  uiText(x + Math.max(0, w - amount.length), y, amount, tone === 'enemy' ? 'ui-danger' : low ? 'ui-danger' : 'ui-primary', alpha);
  uiFill(x, y + 1.15, w, .58, 'rgba(255,255,255,0.07)');
  uiFill(x, y + 1.15, combatBarCells(value, max, w), .58, colors.fill);
  uiStrokeRect(x, y + 1.15, w, .58, colors.outline, .42 * alpha, 1);
}

// ── the fixed-resolution VFD health readout ──────────────────────────────────
// The geometry moved to render/meter.js when the audio meter needed the same
// banked layout: a generic widget cannot import the combat screen. Re-exported
// here so this module's callers — and both test files that import them from
// this path — carry on unchanged.
export {
  COMBAT_GAUGE_SEGMENTS,
  COMBAT_GAUGE_BANK_SIZE,
  combatGaugeSegments,
  combatGaugeState,
  combatGaugeGeometry,
} from './meter.js';

export function drawCombatGauge({
  x, y, w, value, max, label, tone = 'player',
  ghostFrom = null, ghostAge = 0, now = 0, alpha = 1, lowDanger = true,
} = {}) {
  const gauge = combatGaugeState({ value, max, ghostFrom });
  const current = Math.max(0, Math.round(gauge.currentValue));
  const maximum = Math.max(1, Math.round(gauge.maximum));
  const low = lowDanger && tone !== 'enemy' && gauge.currentValue / gauge.maximum <= .25;
  const pulse = low ? .70 + .30 * Math.sin(now * 6) : 1;
  const labelRole = tone === 'enemy' || low ? 'ui-danger' : 'ui-label';
  const amount = `${current}/${maximum}`;
  const labelWidth = Math.max(0, Math.floor(w) - amount.length - 2);
  uiText(x, y, String(label || '').toUpperCase().slice(0, labelWidth), labelRole, alpha * pulse);
  uiText(x + Math.max(0, w - amount.length), y, amount, tone === 'enemy' || low ? 'ui-danger' : 'ui-primary', alpha);

  const ghostAlpha = Math.max(0, 1 - ghostAge / .65);
  const geometry = combatGaugeGeometry({ x, w });
  const colors = combatTonePalette(tone);
  const phosphor = colors.pip;

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const py = (y + 1.08) * cellH * dpr;
    const ph = .70 * cellH * dpr;
    // The glass: a flat black strip behind the segments, hairlined — the bar
    // is a display element on the faceplate, not paint on the void.
    const gx = (x - .25) * cellW * dpr;
    const gw = (w + .5) * cellW * dpr;
    ctx.save();
    ctx.fillStyle = '#07070a';
    ctx.fillRect(gx, py - .14 * cellH * dpr, gw, ph + .28 * cellH * dpr);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = dpr;
    ctx.strokeRect(gx + .5 * dpr, py - .14 * cellH * dpr + .5 * dpr, gw - dpr, ph + .28 * cellH * dpr - dpr);
    for (const cell of geometry.cells) {
      const i = cell.index;
      const px = cell.x * cellW * dpr;
      const pw = cell.w * cellW * dpr;
      const lit = i < gauge.filled;
      const lostGhost = !lit && i < gauge.filled + gauge.lost && ghostAlpha > 0;
      const gainedGhost = lit && i >= gauge.filled - gauge.gained && ghostAlpha > 0;
      const bucketPulse = gauge.sameBucketChange && i === gauge.leadingIndex && ghostAlpha > 0;
      // Multiplex scan artifact: each segment is addressed, not painted.
      const duty = .90 + .10 * Math.sin(now * 112 + i * .61);
      ctx.save();
      if (lostGhost) {
        const flicker = .55 + .45 * Math.sin(now * 42 + i * 1.7);
        ctx.fillStyle = 'rgba(255,244,230,1)';
        ctx.globalAlpha = alpha * ghostAlpha * flicker;
        ctx.shadowColor = 'rgba(255,220,180,1)';
        ctx.shadowBlur = 8 * dpr;
      } else if (gainedGhost) {
        ctx.fillStyle = 'rgba(148,224,164,.95)';
        ctx.globalAlpha = alpha * duty;
        ctx.shadowColor = 'rgba(148,224,164,1)';
        ctx.shadowBlur = 7 * dpr;
      } else if (bucketPulse) {
        const micro = .62 + .38 * Math.sin(now * 38 + i);
        ctx.fillStyle = gauge.delta > 0 ? 'rgba(148,224,164,.98)' : 'rgba(255,244,230,1)';
        ctx.globalAlpha = alpha * ghostAlpha * micro;
        ctx.shadowColor = gauge.delta > 0 ? 'rgba(148,224,164,1)' : 'rgba(255,220,180,1)';
        ctx.shadowBlur = 8 * dpr;
      } else if (lit) {
        ctx.fillStyle = phosphor;
        ctx.globalAlpha = alpha * pulse * duty;
        ctx.shadowColor = phosphor;
        ctx.shadowBlur = 5.5 * dpr;
      } else {
        // Dormant segments stay faintly visible in their own phosphor, the way
        // unlit elements do on a real VFD.
        ctx.fillStyle = colors.dim || phosphor;
        ctx.globalAlpha = alpha * .09;
      }
      ctx.fillRect(px, py, pw, ph);
      ctx.restore();
    }
    ctx.restore();
  });
}

// ── the battle wipe ───────────────────────────────────────────────────────────
// Two hard-edged shutters clear the stage on entry: the top half exits left as
// the opponent slides in behind it, the bottom half exits right as the hands
// rise — the classic opposed-wipe fight opening.
export function drawBattleWipe({ x, y, w, h, progress = 1, reducedMotion = false } = {}) {
  const p = clamp(progress, 0, 1);
  if (p >= 1) return;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr;
    const py = y * cellH * dpr;
    const pw = w * cellW * dpr;
    const ph = h * cellH * dpr;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    if (reducedMotion) {
      ctx.fillStyle = `rgba(1,2,4,${(1 - p).toFixed(3)})`;
      ctx.fillRect(px, py, pw, ph);
    } else {
      const eased = 1 - Math.pow(1 - p, 3);
      const cut = pw * .16;
      const off = eased * (pw + cut);
      const edge = Math.max(2 * dpr, pw * .005);
      ctx.fillStyle = 'rgba(1,2,4,0.97)';
      ctx.beginPath();
      ctx.moveTo(px - off - cut, py);
      ctx.lineTo(px + pw - off, py);
      ctx.lineTo(px + pw - off - cut, py + ph * .5);
      ctx.lineTo(px - off - cut * 2, py + ph * .5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,181,54,0.85)';
      ctx.fillRect(px + pw - off - cut * .5, py, edge, ph * .5);
      ctx.fillStyle = 'rgba(1,2,4,0.97)';
      ctx.beginPath();
      ctx.moveTo(px + off, py + ph * .5);
      ctx.lineTo(px + pw + off + cut, py + ph * .5);
      ctx.lineTo(px + pw + off + cut * 2, py + ph);
      ctx.lineTo(px + off + cut, py + ph);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,181,54,0.85)';
      ctx.fillRect(px + off + cut * .5, py + ph * .5, edge, ph * .5);
    }
    ctx.restore();
  });
}

function coverRect(srcW, srcH, dstW, dstH) {
  if (!srcW || !srcH || !dstW || !dstH) return { sx: 0, sy: 0, sw: srcW || 1, sh: srcH || 1 };
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

function imageLoaded(record) {
  return !!(record?.loaded && !record.error && record.image?.naturalWidth && record.image?.naturalHeight);
}

// Story-art stills arrive as opaque rectangles. For the fight void they get
// composited: the border colour is sampled and keyed out (with a soft band so
// dithered edges feather instead of cutting), and the remaining alpha fades
// toward the frame so any residue melts into the void instead of drawing a
// square. Processed once per image and cached.
const KEYED_ART = new Map();
function keyedArtCanvas(image) {
  const cacheKey = image.src || image;
  const cached = KEYED_ART.get(cacheKey);
  if (cached) return cached;
  if (typeof document === 'undefined') return image;
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  c.drawImage(image, 0, 0);
  let data;
  try {
    data = c.getImageData(0, 0, w, h);
  } catch {
    KEYED_ART.set(cacheKey, image);
    return image;
  }
  const px = data.data;
  const samples = [];
  for (let i = 0; i < 24; i++) {
    const t = Math.floor((i / 23) * (w - 1));
    const s = Math.floor((i / 23) * (h - 1));
    for (const [sx, sy] of [[t, 0], [t, h - 1], [0, s], [w - 1, s]]) {
      const at = (sy * w + sx) * 4;
      samples.push([px[at], px[at + 1], px[at + 2]]);
    }
  }
  const bg = samples.reduce((acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]], [0, 0, 0])
    .map((v) => v / samples.length);
  const spread = Math.sqrt(samples.reduce((acc, s) => (
    acc + (s[0] - bg[0]) ** 2 + (s[1] - bg[1]) ** 2 + (s[2] - bg[2]) ** 2
  ), 0) / (samples.length * 3));
  const hard = 16 + spread * 1.2;
  const soft = hard + 34;
  const feather = Math.max(6, Math.round(Math.min(w, h) * .07));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const distance = Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]);
      let alpha = px[i + 3];
      if (distance <= hard) alpha = 0;
      else if (distance < soft) alpha = Math.round(alpha * (distance - hard) / (soft - hard));
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edge < feather) alpha = Math.round(alpha * (edge / feather));
      px[i + 3] = alpha;
    }
  }
  c.putImageData(data, 0, 0);
  KEYED_ART.set(cacheKey, canvas);
  return canvas;
}

const SNR_TINT = Object.freeze({
  silence: '77,139,160',
  noise: '224,84,79',
  signal: '108,99,255',
});

// Each encounter gets one flat wash so the void itself carries the room's
// identity; the SNR stance tints only the opponent figure.
const VOID_TINT = Object.freeze({
  natatorium: '77,139,160',
  hall: '224,84,79',
  practice: '108,99,255',
  chapel: '214,178,92',
  training: '124,134,150',
  'source-final': '196,206,224',
});

export function combatVoidTint(profileKey = '', environmentLighting = null) {
  if(!['training','source-final'].includes(String(profileKey))&&Array.isArray(environmentLighting?.ambientColor)){
    return environmentLighting.ambientColor.slice(0,3)
      .map((value)=>Math.max(0,Math.min(255,Math.round((Number(value)||0)*255))))
      .join(',');
  }
  return VOID_TINT[String(profileKey)] || '124,134,150';
}

// Non-semantic residue from the room that produced the fight. These marks are
// deliberately static, low-alpha, and pushed toward the void's perimeter so
// they cannot be mistaken for an attack telegraph or opponent state.
export function drawVoidRoomMemory(ctx, profileKey, box, tint, {
  resolveProgress = 0,
  reduceFlash = false,
  dpr = 1,
} = {}) {
  if (!ctx || !box) return false;
  const key = String(profileKey || 'training');
  const { x, y, w, h } = box;
  const alpha = (reduceFlash ? 0.45 : 1) * (0.045 + Math.min(1, Math.max(0, resolveProgress)) * 0.018);
  const line = Math.max(0.6, dpr * 0.6);
  ctx.save();
  ctx.strokeStyle = `rgba(${tint},${alpha})`;
  ctx.fillStyle = `rgba(${tint},${alpha * 0.72})`;
  ctx.lineWidth = line;

  if (key === 'natatorium') {
    // Lane bars below the horizon and a few tile-edge registration marks.
    for (let lane = 0; lane < 4; lane += 1) {
      const yy = y + h * (0.78 + lane * 0.047);
      ctx.fillRect(x + w * 0.08, yy, w * 0.84, Math.max(line, h * 0.003));
    }
    for (let tile = 0; tile < 6; tile += 1) {
      const xx = x + w * (0.09 + tile * 0.032);
      ctx.fillRect(xx, y + h * 0.67, line, h * 0.05);
    }
  } else if (key === 'hall') {
    // Return-monitor traces which stop before the opponent's central bay.
    for (let trace = 0; trace < 5; trace += 1) {
      const yy = y + h * (0.15 + trace * 0.07);
      ctx.fillRect(x + w * 0.04, yy, w * (0.16 + trace * 0.018), line);
      ctx.fillRect(x + w * (0.79 - trace * 0.012), yy, w * 0.17, line);
    }
  } else if (key === 'practice') {
    // Piano-wire tension kept to the outer thirds of the field.
    for (const u of [0.08, 0.13, 0.18, 0.82, 0.87, 0.92]) {
      const xx = x + w * u;
      ctx.beginPath();
      ctx.moveTo(xx, y + h * 0.13);
      ctx.lineTo(xx + (u < 0.5 ? line * 4 : -line * 4), y + h * 0.66);
      ctx.stroke();
    }
  } else if (key === 'chapel') {
    // Angular lancets: window memory without arches or a readable symbol.
    for (const u of [0.10, 0.20, 0.80, 0.90]) {
      const xx = x + w * u;
      const half = w * 0.022;
      ctx.beginPath();
      ctx.moveTo(xx - half, y + h * 0.46);
      ctx.lineTo(xx, y + h * 0.18);
      ctx.lineTo(xx + half, y + h * 0.46);
      ctx.stroke();
    }
  } else if (key === 'source-final') {
    // Broken lattice at the limits of the frame, never behind the being.
    for (let index = 0; index < 5; index += 1) {
      const yy = y + h * (0.12 + index * 0.105);
      ctx.fillRect(x + w * 0.025, yy, w * 0.18, line);
      ctx.fillRect(x + w * 0.795, yy + line * 2, w * 0.18, line);
      const xx = x + w * (0.05 + index * 0.028);
      ctx.fillRect(xx, y + h * 0.10, line, h * 0.48);
      ctx.fillRect(x + w - (xx - x), y + h * 0.12, line, h * 0.45);
    }
  } else if (key === 'training') {
    // One neutral stepped standing-wave reference.
    const baseY = y + h * 0.32;
    for (let step = 0; step < 6; step += 1) {
      const xx = x + w * (0.07 + step * 0.035);
      ctx.fillRect(xx, baseY + (step % 2) * h * 0.018, w * 0.03, line);
    }
  }
  ctx.restore();
  return true;
}

// The abstract fight void: flat near-black, one tint wash, a floor hairline,
// and a stepped light pool under the opponent. Flat blocks only — no gradient
// rails, no ellipses; the display is a grid.
export function drawEnemyVoidStage(profileKey, {
  x, y, w, h, enemyBox = null, resolveProgress = 0, reduceFlash = false, environmentLighting = null,
} = {}) {
  const tint = combatVoidTint(profileKey,environmentLighting);
  const poolScale=Math.max(.62,Math.min(1.18,Number(environmentLighting?.poolScale)||1));
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr;
    const py = y * cellH * dpr;
    const pw = w * cellW * dpr;
    const ph = h * cellH * dpr;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.fillStyle = 'rgba(1,2,4,0.94)';
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = `rgba(${tint},0.05)`;
    ctx.fillRect(px, py + ph * .10, pw, ph * .54);
    const floorY = py + ph * .72;
    ctx.strokeStyle = `rgba(${tint},0.22)`;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(px + pw * .04, floorY);
    ctx.lineTo(px + pw * .96, floorY);
    ctx.stroke();
    drawVoidRoomMemory(ctx, profileKey, { x: px, y: py, w: pw, h: ph }, tint, {
      resolveProgress,
      reduceFlash,
      dpr,
    });
    if (enemyBox) {
      const cx = (enemyBox.x + enemyBox.w / 2) * cellW * dpr;
      const sw = enemyBox.w * cellW * dpr;
      for (const [scale, alpha] of [[.66, .06], [.46, .07], [.26, .09]]) {
        ctx.fillStyle = `rgba(${tint},${alpha})`;
        ctx.fillRect(cx - (sw * scale*poolScale) / 2, floorY - Math.max(dpr, ph * .006), sw * scale*poolScale, Math.max(dpr * 2, ph * .018));
      }
    }
    if (resolveProgress > .20 && resolveProgress < .62) {
      ctx.globalAlpha = (reduceFlash ? .08 : .16) + .26 * Math.sin(resolveProgress * Math.PI);
      ctx.fillStyle = 'rgba(255,180,55,1)';
      for (let i = 0; i < 4; i++) {
        const yy = py + ph * ((i * .23 + resolveProgress * .41) % 1);
        ctx.fillRect(px, yy, pw, Math.max(dpr, ph * .018));
      }
    }
    ctx.restore();
  });
}

// THE PICTURE MUST NOT DEPEND ON THE SPEAKERS. Combat owns this snapshot; the
// score, voice and renderer are consumers. A missing AudioContext therefore
// changes none of the waterline, transition or result semantics.
export function submergedBattleFrame({ submersion=null, presentation=null, movementIndex=0, intent=null }={}) {
  if(presentation?.mode!=='submerged')return null;
  const wetMix=clamp(submersion?.wetMix||0,0,1);
  return{
    phase:submersion?.phase||'dry',
    targetPhase:submersion?.targetPhase||submersion?.phase||'dry',
    wetMix,
    dryMix:1-wetMix,
    progress:clamp(submersion?.progress||0,0,1),
    depth:clamp(submersion?.depth||0,0,1),
    waterline:clamp(submersion?.waterline??1,-.08,1),
    lowpassHz:Number(submersion?.lowpassHz)||20000,
    visualClass:intent?.presentation?.visualClass||'pressure-field',
    movementIndex:Math.max(0,Math.floor(Number(movementIndex)||0)),
    driver:submersion?.enabled?'combat':'none',
  };
}

// Natatorium-only battle volume. This pass happens after opponent art but
// before hands and all HUD glyphs. It may bend and absorb the image, while type
// is drawn afterwards at native grid resolution and remains sharp.
export function drawSubmergedBattleField({
  x,y,w,h,frame=null,now=0,reducedMotion=false,resolveProgress=0,
}={}){
  if(!frame||frame.wetMix<=.001)return;
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const px=x*cellW*dpr,py=y*cellH*dpr,pw=w*cellW*dpr,ph=h*cellH*dpr;
    const waterTop=py+ph*frame.waterline;
    const wetHeight=Math.max(0,py+ph-waterTop);
    const tick=reducedMotion?0:now;
    ctx.save();ctx.beginPath();ctx.rect(px,py,pw,ph);ctx.clip();
    // Absorption is deliberately strong at full depth: the field should feel
    // underwater before a player reads any label saying so.
    ctx.fillStyle=`rgba(0,32,31,${(.22+.43*frame.depth)*frame.wetMix})`;
    ctx.fillRect(px,waterTop,pw,wetHeight);
    if(frame.waterline>.001&&frame.waterline<.999){
      ctx.fillStyle=`rgba(175,230,203,${.56*frame.wetMix})`;
      ctx.fillRect(px,waterTop,pw,Math.max(dpr*2,ph*.012));
      ctx.fillStyle=`rgba(52,130,117,${.22*frame.wetMix})`;
      ctx.fillRect(px,waterTop+Math.max(dpr*2,ph*.012),pw,Math.max(dpr,ph*.025));
    }
    // Broad non-text refraction bands. HUD is not present in this pass.
    if(!reducedMotion&&wetHeight>0){
      for(let band=0;band<7;band+=1){
        const yy=waterTop+wetHeight*((band+.5)/7);
        const sway=Math.sin(tick*1.05+band*1.7)*pw*.014;
        ctx.fillStyle=`rgba(92,178,155,${.028*frame.wetMix})`;
        ctx.fillRect(px+sway,yy,pw,Math.max(dpr,ph*.012));
      }
    }
    // Caustic fragments, suspended particulate and bubbles all share the same
    // deterministic layout so reduced-motion can freeze rather than erase them.
    for(let index=0;index<34;index+=1){
      const seedX=((index*37)%101)/101;
      const seedY=((index*67)%97)/97;
      const drift=reducedMotion?0:Math.sin(tick*.55+index*1.9)*.014;
      const rise=reducedMotion?0:(tick*(.012+(index%5)*.002))%1;
      const xx=px+(seedX+drift)*pw;
      const yy=waterTop+((seedY-rise+1)%1)*wetHeight;
      const size=Math.max(dpr,(index%7===0?2:1)*dpr);
      ctx.fillStyle=index%7===0
        ?`rgba(178,224,198,${.26*frame.wetMix})`
        :`rgba(155,195,172,${.11*frame.wetMix})`;
      ctx.fillRect(xx,yy,size,size);
    }
    if(frame.depth>.72){
      for(let index=0;index<6;index+=1){
        const yy=waterTop+wetHeight*(.10+index*.145);
        const offset=(reducedMotion?0:Math.sin(tick*.7+index)*.035)*pw;
        ctx.strokeStyle=`rgba(124,205,176,${(.10-index*.009)*frame.wetMix})`;
        ctx.lineWidth=Math.max(dpr,ph*.006);
        ctx.beginPath();
        ctx.moveTo(px-pw*.05+offset,yy);
        ctx.quadraticCurveTo(px+pw*.45-offset,yy+ph*.035,px+pw*1.05+offset,yy-ph*.018);
        ctx.stroke();
      }
    }
    const line=Math.max(dpr,ph*.009),alpha=(.10+.14*resolveProgress)*frame.wetMix;
    ctx.fillStyle=`rgba(118,178,151,${alpha})`;
    const cls=frame.visualClass;
    if(cls==='meter-return'||cls==='bottom-return'){
      for(let index=0;index<5;index+=1){const yy=waterTop+ph*(.09+index*.12);ctx.fillRect(px+pw*(.08+index*.035),yy,pw*(.66-index*.055),line);}
    }else if(cls==='pressure-field'||cls==='depth-pressure'){
      for(let index=0;index<4;index+=1){const inset=pw*(.08+index*.07),yy=waterTop+ph*(.08+index*.06);ctx.strokeStyle=`rgba(118,178,151,${alpha*(1-index*.14)})`;ctx.lineWidth=line;ctx.strokeRect(px+inset,yy,pw-inset*2,Math.max(line,ph*(.74-index*.12)));}
    }else if(cls==='surface-notes'){
      for(let index=0;index<7;index+=1){const xx=px+pw*(.10+index*.12),rise=reducedMotion ? .12 : ((tick*.08+index*.13)%1)*.36;ctx.fillRect(xx,waterTop+ph*(.08+rise),pw*.018,ph*.055);}
    }else if(cls==='drain-return'||cls==='ladder-absence'){
      const lx=px+pw*.22;for(let index=0;index<6;index+=1){ctx.fillRect(lx,waterTop+ph*(.09+index*.10),pw*.17,line);ctx.fillRect(lx,waterTop+ph*.07,pw*.012,ph*.64);ctx.fillRect(lx+pw*.16,waterTop+ph*.07,pw*.012,ph*.64);}
    }else if(cls==='undertow'){
      const shift=reducedMotion?0:((tick*.08)%1)*pw*.14;for(let index=-1;index<8;index+=1){const xx=px+index*pw*.16+shift;ctx.save();ctx.translate(xx,waterTop);ctx.rotate(-.28);ctx.fillRect(0,0,pw*.035,ph);ctx.restore();}
    }else{
      for(let index=0;index<42;index+=1){const hx=((index*37)%101)/101,hy=((index*67)%97)/97,drift=reducedMotion?0:Math.sin(tick*.7+index)*.012;ctx.fillRect(px+(hx+drift)*pw,waterTop+hy*Math.max(0,py+ph-waterTop),line,line);}
    }
    // Pressure closes around the fully submerged image without dimming the
    // centre into illegibility.
    if(frame.depth>.74){
      const vignette=ctx.createRadialGradient(px+pw*.5,py+ph*.48,pw*.12,px+pw*.5,py+ph*.48,pw*.64);
      vignette.addColorStop(0,'rgba(0,8,10,0)');
      vignette.addColorStop(1,`rgba(0,7,10,${.62*frame.wetMix})`);
      ctx.fillStyle=vignette;ctx.fillRect(px,py,pw,ph);
    }
    ctx.restore();
  });
}

const FIREBALL_SHEET='./assets/fireball-sheet.svg';

// THE COMET IS BUILT IN LAYERS, LIKE EVERYTHING ELSE ON THIS SCREEN.
//
// It was a sprite with seven squares dragged behind it, which reads as a sprite
// with seven squares dragged behind it. The rest of this renderer says heat and
// distance with ORDERED DITHER -- coverage as the density of lit cells rather
// than as alpha -- because that is what the halftone stack downstream is going
// to do to it anyway. So the fireball is made the same way: a pressure wake
// dithered into the air behind it, embers that fall out of that wake and cool,
// a corona that breathes, the authored pixel core, and the notes it sheds.
//
// It is a sound as much as a thing. The Surfer throws the recordist's own tape;
// what comes off the tail is the tape's own notation, in the same glyphs the
// enemy's attacks already use.
const BAYER4 = Object.freeze([
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
]);
// Coverage, not alpha: at 0.5 half the cells are lit and the halftone downstream
// still has something to resolve.
const dithered = (cx, cy, coverage) => (BAYER4[((cy & 3) << 2) | (cx & 3)] + .5) / 16 < coverage;

// Hot to cold, and the same ramp inverted for a comet that has been answered.
const EMBER_RAMP = Object.freeze(['#FFF6AA', '#FFE15A', '#FFAD1F', '#FF6A15', '#E74712', '#A9260C', '#5C1406']);
const RETURN_RAMP = Object.freeze(['#EAFBFF', '#BFF1FF', '#84E0FF', '#3FBEEC', '#1C86B4', '#12536F', '#08283A']);
const rampAt = (ramp, t) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1))))];

function fireHash(seed, index) {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Where a comet is on its ray, plus the basis it is travelling in. Everything
// else is drawn relative to this so no layer can disagree about which way it is
// pointing.
function cometFrame(ray, state, progress, box) {
  const reversed = state === 'reversed';
  const from = reversed ? ray.exit : ray.origin;
  const to = reversed ? ray.origin : ray.exit;
  const point = fireballRayPoint(ray, { state, progress });
  const dx = (to.x - from.x) * box.w;
  const dy = (to.y - from.y) * box.h;
  const len = Math.hypot(dx, dy) || 1;
  return {
    cx: box.x + point.x * box.w,
    cy: box.y + point.y * box.h,
    ux: dx / len,
    uy: dy / len,
    // Perpendicular, for anything that scatters off the line.
    px: -dy / len,
    py: dx / len,
  };
}

export function drawFireballCast({x,y,w,h,cast=null,flights=null,progress=0,now=0,reducedMotion=false,externalPresented=false}={}){
  if(!cast?.rays?.length)return;
  const record=loadStoryArtImage(FIREBALL_SHEET);
  const drawn=Array.isArray(flights)&&flights.length
    ? flights
    : cast.rays.map((_,index)=>({index,state:cast.state,progress}));
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const box={x:x*cellW*dpr,y:y*cellH*dpr,w:w*cellW*dpr,h:h*cellH*dpr};
    const unit=Math.max(1,Math.round(dpr*2));          // one dither cell
    ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();ctx.imageSmoothingEnabled=false;
    for(const flight of drawn){
      const index=Math.max(0,Math.min(cast.rays.length-1,Number(flight.index)||0));
      const ray=cast.rays[index];
      const rawState=String(flight.state||'outbound');
      if(externalPresented&&['approach','rebound'].includes(rawState))continue;
      const state=rawState==='rebound'?'outbound':rawState;
      if(state==='waiting'||state==='gone')continue;
      const p=clamp(['approach','rebound'].includes(rawState)
        ? flight.canvasProgress??.86
        : flight.progress,0,1);
      const answered=state==='deflected'||state==='reversed';
      const ramp=answered?RETURN_RAMP:EMBER_RAMP;
      const at=cometFrame(ray,state,p,box);
      const seed=(index+1)*2654435761;
      // It is coming toward you the whole time it crosses the stage, so it is
      // bigger at the edge than it was in the Surfer's hand.
      const near=.72+p*.62;
      // Sized against the BAND, not against min(width,height). The stage is a
      // wide short strip, so measuring off its smaller dimension produced a
      // comet a few pixels across -- a dot with a dotted line behind it, which
      // is not a fireball. A fifth of the band's height is a thing with a body,
      // and it still clears the text above and below it.
      const head=Math.max(dpr*11,box.h*.19*near);

      if(state==='impact'||state==='deflected'){
        // ── the burst: a dithered disc thrown outward, then embers ──────────
        const age=clamp(1-p,0,1);
        const open=1-age;
        const radius=head*(1+open*3.4);
        const steps=Math.max(2,Math.round(radius/unit));
        for(let gy=-steps;gy<=steps;gy+=1){
          for(let gx=-steps;gx<=steps;gx+=1){
            const dist=Math.hypot(gx,gy)/Math.max(1,steps);
            if(dist>1)continue;
            // A shell, not a disc: the middle has already gone.
            const shell=1-Math.abs(dist-open*.9)*2.6;
            if(shell<=0)continue;
            const cellX=Math.round(at.cx/unit)+gx,cellY=Math.round(at.cy/unit)+gy;
            if(!dithered(cellX,cellY,shell*age))continue;
            ctx.fillStyle=rampAt(ramp,dist*.8+(1-age)*.2);
            ctx.fillRect(cellX*unit,cellY*unit,unit,unit);
          }
        }
        for(let ember=0;ember<10;ember+=1){
          const spread=fireHash(seed,ember)*Math.PI*2;
          const reach=radius*(.5+fireHash(seed+31,ember)*.9);
          const size=Math.max(unit,Math.round(unit*(2-fireHash(seed+77,ember))));
          ctx.fillStyle=rampAt(ramp,.2+fireHash(seed+13,ember)*.6);
          ctx.globalAlpha=age;
          ctx.fillRect(
            Math.round(at.cx+Math.cos(spread)*reach*(1-age)),
            Math.round(at.cy+Math.sin(spread)*reach*(1-age)),
            size,size,
          );
        }
        ctx.globalAlpha=1;
        continue;
      }

      // ── layer 1: the pressure wake ──────────────────────────────────────
      // A dithered corridor of heated air behind the head, widening and
      // thinning with distance. This is the layer that makes it look fast.
      const wake=head*5.5;
      const wakeCells=Math.max(3,Math.round(wake/unit));
      for(let back=1;back<=wakeCells;back+=1){
        const along=back/wakeCells;
        const falloff=(1-along)**1.7;
        const spread=Math.max(1,Math.round((head*.5+head*1.15*along)/unit));
        const baseX=at.cx-at.ux*back*unit;
        const baseY=at.cy-at.uy*back*unit;
        for(let side=-spread;side<=spread;side+=1){
          const lateral=1-Math.abs(side)/(spread+1);
          const coverage=falloff*lateral*.92;
          if(coverage<=.03)continue;
          const cellX=Math.round((baseX+at.px*side*unit)/unit);
          const cellY=Math.round((baseY+at.py*side*unit)/unit);
          if(!dithered(cellX,cellY,coverage))continue;
          ctx.fillStyle=rampAt(ramp,.42+along*.55);
          ctx.fillRect(cellX*unit,cellY*unit,unit,unit);
        }
      }

      // ── layer 2: embers falling out of the wake and cooling ─────────────
      for(let ember=0;ember<12;ember+=1){
        const phase=reducedMotion?fireHash(seed,ember):((now*(.6+fireHash(seed+5,ember)*.9)+fireHash(seed,ember))%1);
        const back=(.15+phase*.95)*wake;
        const drift=(fireHash(seed+91,ember)-.5)*head*1.9*phase;
        const size=Math.max(unit,Math.round(unit*(2.2-phase*1.4)));
        ctx.globalAlpha=(1-phase)*.9;
        ctx.fillStyle=rampAt(ramp,.25+phase*.7);
        ctx.fillRect(
          Math.round(at.cx-at.ux*back+at.px*drift),
          Math.round(at.cy-at.uy*back+at.py*drift),
          size,size,
        );
      }
      ctx.globalAlpha=1;

      // ── layer 3: the corona, breathing ──────────────────────────────────
      const breath=reducedMotion?.5:(.5+.5*Math.sin(now*9.4+index*1.7));
      const coronaCells=Math.max(2,Math.round(head*(1.25+breath*.3)/unit));
      for(let gy=-coronaCells;gy<=coronaCells;gy+=1){
        for(let gx=-coronaCells;gx<=coronaCells;gx+=1){
          const dist=Math.hypot(gx,gy)/coronaCells;
          if(dist<.55||dist>1)continue;
          const cellX=Math.round(at.cx/unit)+gx,cellY=Math.round(at.cy/unit)+gy;
          if(!dithered(cellX,cellY,(1-dist)*1.7))continue;
          ctx.fillStyle=rampAt(ramp,.15+dist*.5);
          ctx.fillRect(cellX*unit,cellY*unit,unit,unit);
        }
      }

      // ── layer 4: the authored core, with a lit face and a shaded back ───
      const frame=(reducedMotion?2:Math.floor(now*16+index*3))%8;
      const size=head*2;
      if(record?.loaded){
        ctx.save();
        ctx.translate(at.cx,at.cy);
        ctx.rotate(Math.atan2(at.uy,at.ux)+(answered?Math.PI:0));
        ctx.drawImage(record.image,frame*32,0,32,32,-size*.5,-size*.5,size,size);
        ctx.restore();
      }else{
        ctx.fillStyle=rampAt(ramp,0);
        ctx.fillRect(Math.round(at.cx-size*.3),Math.round(at.cy-size*.3),Math.round(size*.6),Math.round(size*.6));
      }
      // The leading edge is the hottest thing on screen; directly behind it is
      // the coolest. Two blocks, and the comet stops being symmetrical.
      ctx.fillStyle=rampAt(ramp,0);
      ctx.fillRect(Math.round(at.cx+at.ux*head*.72),Math.round(at.cy+at.uy*head*.72),unit*2,unit*2);
      ctx.fillStyle=rampAt(ramp,1);
      ctx.fillRect(Math.round(at.cx-at.ux*head*.66),Math.round(at.cy-at.uy*head*.66),unit,unit);

      // ── layer 5: what it is made of ─────────────────────────────────────
      // The Surfer throws the recordist's tape back at him, so the tape's own
      // notation comes off the tail. One glyph per comet, shed on its own
      // phase, in the same sprites the enemy's attacks are already drawn with.
      const shed=reducedMotion?1:2;
      for(let note=0;note<shed;note+=1){
        const phase=reducedMotion?.45:((now*.75+fireHash(seed+404,note))%1);
        const back=(.3+phase)*wake*.9;
        const rise=phase*head*2.4;
        const alpha=Math.sin(Math.min(1,phase)*Math.PI)*.85;
        if(alpha<=.04)continue;
        const glyph=NOTE_SPRITES[NOTE_KINDS[(index+note)%NOTE_KINDS.length]]||NOTE_SPRITES.crotchet;
        const px=Math.max(1,Math.round(cellH*dpr*.72/glyph.length));
        const originX=Math.round(at.cx-at.ux*back+at.px*(fireHash(seed+808,note)-.5)*head*1.4);
        const originY=Math.round(at.cy-at.uy*back-rise);
        ctx.globalAlpha=alpha;
        ctx.fillStyle=answered?RETURN_RAMP[1]:UI_COLOR.amber;
        for(let row=0;row<glyph.length;row+=1){
          const line=glyph[row];
          for(let col=0;col<line.length;col+=1){
            if(line[col]!=='#')continue;
            ctx.fillRect(originX+col*px,originY+row*px,px,px);
          }
        }
      }
      ctx.globalAlpha=1;
    }
    ctx.restore();
  });
}

// THE ENGULF, WHERE IT ACTUALLY BELONGS.
//
// A comet that left the frame comes back at the player and lands ON the window.
// The first attempt at that grew the external surface until it was the size of
// the display, which is not a fireball arriving -- it is the desktop being
// replaced by one, and an opaque screen-sized click target between the player
// and their own game. Out there it stays fist-sized and reads as close. The
// arriving is drawn in here, over the frame it arrived at, in the same dither
// as everything else: a shell of fire opening out of the point it came in at
// until it has covered the panel, and then gone.
export function drawFireballEngulf({
  x, y, w, h, at = null, now = 0, seconds = .42, reducedMotion = false, answered = false,
} = {}) {
  if (!at) return;
  const age = clamp((now - (Number(at.at) || 0)) / Math.max(.05, seconds), 0, 1);
  if (age >= 1) return;
  const ramp = answered ? RETURN_RAMP : EMBER_RAMP;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const box = { x: x * cellW * dpr, y: y * cellH * dpr, w: w * cellW * dpr, h: h * cellH * dpr };
    const unit = Math.max(1, Math.round(dpr * 2));
    // Where on the panel it came in. The burst opens from there, so four comets
    // landing from four bearings do not all bloom out of the middle.
    const cx = box.x + clamp(at.u, 0, 1) * box.w;
    const cy = box.y + clamp(at.v, 0, 1) * box.h;
    const reach = Math.hypot(box.w, box.h);
    const open = reducedMotion ? .5 : age ** .62;
    const fade = 1 - age;
    ctx.save();
    ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    const cells = Math.ceil(reach / unit);
    const originX = Math.round(cx / unit), originY = Math.round(cy / unit);
    for (let gy = -cells; gy <= cells; gy += 1) {
      for (let gx = -cells; gx <= cells; gx += 1) {
        const cellX = originX + gx, cellY = originY + gy;
        const px = cellX * unit, py = cellY * unit;
        if (px < box.x - unit || py < box.y - unit || px > box.x + box.w || py > box.y + box.h) continue;
        const dist = Math.hypot(gx, gy) / cells;
        // A shell that opens outward and hollows behind itself, so the middle
        // of the panel clears before the edge does and the fight comes back
        // through the hole rather than from under a curtain.
        const shell = 1 - Math.abs(dist - open) * 3.1;
        if (shell <= 0) continue;
        // A wash, not a curtain. The fight has to stay readable through it --
        // the player is still being asked to answer the beat that is resolving
        // underneath this.
        if (!dithered(cellX, cellY, shell * (.18 + fade * .62))) continue;
        ctx.fillStyle = rampAt(ramp, Math.min(1, dist * .7 + open * .3));
        ctx.fillRect(px, py, unit, unit);
      }
    }
    ctx.restore();
  });
}

export function drawOpponentCombatArt(ref, {
  x, y, w, h, coherence, maxCoherence, snr = 'signal', resolveProgress = 0, reduceFlash = false,
  oblique = 0, hitFlash = 0, knock = 0,
} = {}) {
  const art = resolveStoryArt(ref);
  const imageRecord = art?.src ? loadStoryArtImage(art.src) : null;
  const loss = 1 - clamp(coherence / Math.max(1, maxCoherence), 0, 1);
  const fractures = Math.floor(loss * 7);
  const signal = SNR_TINT[snr] || SNR_TINT.signal;

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = (x + knock) * cellW * dpr;
    const py = y * cellH * dpr;
    const pw = w * cellW * dpr;
    const ph = h * cellH * dpr;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px - cellW * dpr, py, pw + cellW * dpr * 2, ph);
    ctx.clip();
    if (oblique) {
      // The fight stance: the opponent leans in at a slight oblique instead of
      // standing flat like a dialogue portrait.
      const cx = px + pw / 2;
      const cy = py + ph;
      ctx.translate(cx, cy);
      ctx.rotate(oblique);
      ctx.translate(-cx, -cy);
    }

    if (imageLoaded(imageRecord)) {
      const image = imageRecord.image;
      const keyed = keyedArtCanvas(image);
      const crop = art?.id === 'surfer'
        ? {
            sx: image.naturalWidth * .18,
            sy: image.naturalHeight * .14,
            sw: image.naturalWidth * .64,
            sh: image.naturalHeight * .75,
          }
        : coverRect(image.naturalWidth, image.naturalHeight, pw, ph);
      ctx.save();
      ctx.globalAlpha = .92;
      ctx.filter = `grayscale(${Math.max(0, .10 - loss * .08)}) saturate(${1.45 + loss * .28}) contrast(${1.28 + loss * .16}) brightness(${1.38 + loss * .16})`;
      const strike = resolveProgress > .18 && resolveProgress < .62
        ? Math.sin(resolveProgress * Math.PI) * pw * .012
        : 0;
      ctx.drawImage(keyed, crop.sx, crop.sy, crop.sw, crop.sh, px - strike, py, pw, ph);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = .26;
      ctx.drawImage(keyed, crop.sx, crop.sy, crop.sw, crop.sh, px - strike, py, pw, ph);
      ctx.filter = 'none';
      ctx.restore();
    } else {
      // A centred stand-in body for the image's first loading frame.
      ctx.fillStyle = `rgba(${signal},0.18)`;
      ctx.fillRect(px + pw * .40, py + ph * .08, pw * .20, ph * .18);
      ctx.fillRect(px + pw * .30, py + ph * .27, pw * .40, ph * .44);
      ctx.fillRect(px + pw * .24, py + ph * .38, pw * .16, ph * .32);
    }

    ctx.strokeStyle = 'rgba(255,75,69,0.72)';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.globalAlpha = .28 + loss * .46;
    for (let i = 0; i < fractures; i++) {
      const sx = px + pw * (.12 + ((i * 31) % 56) / 100);
      const sy = py + ph * (.10 + ((i * 23) % 54) / 100);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + pw * (.08 + (i % 3) * .03), sy + ph * (.15 + (i % 2) * .08));
      ctx.lineTo(sx + pw * (.02 + (i % 4) * .02), sy + ph * (.31 + (i % 3) * .05));
      ctx.stroke();
    }
    if (hitFlash > 0) {
      // The landed hit reads on the body itself: the keyed sprite redrawn as a
      // blown-out silhouette, never a flashing rectangle.
      ctx.save();
      ctx.globalAlpha = Math.min(1, hitFlash) * (reduceFlash ? .3 : .6);
      if (imageLoaded(imageRecord)) {
        const image = imageRecord.image;
        const keyed = keyedArtCanvas(image);
        const crop = art?.id === 'surfer'
          ? { sx: image.naturalWidth * .18, sy: image.naturalHeight * .14, sw: image.naturalWidth * .64, sh: image.naturalHeight * .75 }
          : coverRect(image.naturalWidth, image.naturalHeight, pw, ph);
        ctx.filter = 'brightness(6) saturate(0)';
        ctx.drawImage(keyed, crop.sx, crop.sy, crop.sw, crop.sh, px, py, pw, ph);
        ctx.filter = 'none';
      } else {
        ctx.fillStyle = 'rgba(255,244,230,1)';
        ctx.fillRect(px + pw * .24, py + ph * .08, pw * .46, ph * .74);
      }
      ctx.restore();
    }
    ctx.restore();
  });
  return { rendered: !!art, rows: h, art };
}

// ── the procedural opponent: a phosphor signal-being ─────────────────────────
// Encounters without authored raster art get a code-native figure in the same
// multiplexed-display idiom as the VFD chrome: discrete glowing dots along a
// per-profile trace, modulated by the telegraphed intent, decimated as its
// coherence drains. Time is quantized so it strobes like an addressed grid
// rather than animating smoothly.

// The field encounters are the hush wearing the room as an ill-fitting shell —
// a signal-form with a dark formless core showing through the middle. The finals
// (chapel, source) use the surfer raster instead (the later-gen body that grew
// its own form), so their figures here are only fallbacks. `training` stays a
// plain standing wave: the bench signal is not the hush and has no core.
const BEING_FIGURE = Object.freeze({
  natatorium: 'drowned',
  hall: 'return',
  practice: 'wire',
  chapel: 'seal',
  training: 'column',
  'source-final': 'lattice',
});

function beingSeed(profileKey = '') {
  let hash = 0;
  const text = String(profileKey);
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 9973;
  return hash;
}

// The formless hush at the centre of a borrowed shell. Small, dense, slightly
// off-centre and adrift — the shell never sits quite right over it. Marked
// `core` so drawSignalBeing renders it as a dark mass ringed by faint signal
// instead of the shell's tint, and so it never dissolves with coherence.
function pushCore(points, tick, seed) {
  const cx = Math.sin(tick * .7 + seed) * .045;
  const cy = Math.cos(tick * .5 + seed) * .035;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + tick * .8;
    const radius = .028 + (Math.sin(i * 2.7 + tick * 1.3) * .5 + .5) * .055;
    points.push({ u: cx + Math.cos(angle) * radius, v: cy + Math.sin(angle) * radius * .92, a: .96, core: true });
  }
}

function beingPoints(figure, { tick, layers, seed }) {
  const points = [];
  const push = (u, v, a = 1) => points.push({ u, v, a });
  if (figure === 'drowned') {
    // Natatorium — the empty pool's ripples worn as a hollow carapace, the core
    // sitting in water that is not there. Rings start out from a hollow centre so
    // the dark core reads through the gap.
    for (let ring = 1; ring < 3 + layers; ring++) {
      const radius = .12 + ring * .12;
      const count = 14 + ring * 8;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + tick * .5 * (ring % 2 ? -1 : 1);
        push(Math.cos(angle) * radius, Math.sin(angle) * radius * .62, 1 - ring * .13);
      }
    }
    pushCore(points, tick, seed);
  } else if (figure === 'wire') {
    // Practice — the braided helix as a cage of piano-wire the hush strings
    // itself through, the core threaded down the centre and plucking it.
    for (let voice = 0; voice < 3; voice++) {
      for (let i = 0; i <= 26; i++) {
        const v = -.42 + (i / 26) * .84;
        const u = Math.sin(v * Math.PI * (3 + layers) + voice * (Math.PI * 2 / 3) + tick) * .17;
        push(u, v, .9 - voice * .18);
      }
    }
    pushCore(points, tick, seed);
  } else if (figure === 'return') {
    // Hall — a monitor return worn as a shell: a standing wave that rises then
    // folds back on itself, the core knotted at the fold.
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const v = -.44 + t * .88;
      const fold = Math.sin(t * Math.PI);
      const u = Math.sin(v * Math.PI * (2 + layers) + tick) * (.05 + .16 * fold);
      push(u, v, .95);
      push(-u * .6, v, .38 + .3 * fold);
    }
    pushCore(points, tick, seed);
  } else if (figure === 'ripples') {
    for (let ring = 0; ring < 2 + layers; ring++) {
      const radius = .10 + ring * .13;
      const count = 16 + ring * 8;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + tick * .5 * (ring % 2 ? -1 : 1);
        push(Math.cos(angle) * radius, Math.sin(angle) * radius * .62, 1 - ring * .14);
      }
    }
  } else if (figure === 'braid') {
    for (let voice = 0; voice < 3; voice++) {
      for (let i = 0; i <= 26; i++) {
        const v = -.42 + (i / 26) * .84;
        const u = Math.sin(v * Math.PI * (3 + layers) + voice * (Math.PI * 2 / 3) + tick) * .16;
        push(u, v, .9 - voice * .18);
      }
    }
  } else if (figure === 'seal') {
    const count = 28 + layers * 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + tick * .25;
      const tickLen = i % 4 === 0 ? .07 : .02;
      push(Math.cos(angle) * .30, Math.sin(angle) * .30 * .8, .9);
      push(Math.cos(angle) * (.30 + tickLen), Math.sin(angle) * (.30 + tickLen) * .8, .55);
    }
  } else if (figure === 'lattice') {
    for (let ix = 0; ix < 9; ix++) {
      for (let iy = 0; iy < 7; iy++) {
        const u = -.36 + (ix / 8) * .72;
        const v = -.38 + (iy / 6) * .76;
        const wave = Math.sin(ix * 1.7 + tick * 2 + seed) + Math.cos(iy * 2.3 - tick * 1.4);
        push(u, v, .35 + .3 * Math.abs(wave));
      }
    }
  } else {
    // 'column' — a standing wave, one harmonic per movement.
    for (let i = 0; i <= 30; i++) {
      const v = -.44 + (i / 30) * .88;
      const u = Math.sin(v * Math.PI * (2 + layers) + tick) * .17;
      push(u, v, .95);
      push(-u * .5, v, .40);
    }
  }
  return points;
}

// ── the opponent's notes ─────────────────────────────────────────────────────
// While the other side is playing, the sound they are making is visible: note
// sprites come off the figure and dance until the attack is over.
//
// Two rules this obeys. They are SPRITES, not '♪' — the atlas renders glyphs
// through a monospace stack with no dependable music note in it, the same trap
// that made the minimap's mischief ring invisible. And they are stepped blocks,
// not vector curves, because everything else in this void is (see the hands: no
// ctx.ellipse anywhere in this file, and combat-presentation.spec pins it).
export const NOTE_SPRITES = Object.freeze({
  quaver: Object.freeze(['..###', '..#.#', '..#..', '..#..', '..#..', '###..', '###..']),
  beamed: Object.freeze(['#######', '#.....#', '#.....#', '#.....#', '#.....#', '###.###', '###.###']),
  crotchet: Object.freeze(['...#.', '...#.', '...#.', '...#.', '...#.', '###..', '###..']),
});
const NOTE_KINDS = Object.freeze(['quaver', 'beamed', 'crotchet', 'quaver']);

function noteHash(seed, index) {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function attackNoteLayout({ count = 3, now = 0, seed = 0, reducedMotion = false } = {}) {
  const notes = [];
  const total = Math.max(0, Math.min(12, Math.floor(count)));
  for (let index = 0; index < total; index += 1) {
    const r1 = noteHash(seed, index);
    const r2 = noteHash(seed + 7919, index);
    const r3 = noteHash(seed + 104729, index);
    // Each note keeps its own phase, so they never rise as a rank.
    const speed = .34 + r2 * .3;
    const life = reducedMotion ? .5 : ((now * speed + r1) % 1);
    notes.push({
      // Across the figure, climbing and drifting outward as it goes.
      u: Math.min(.94, Math.max(.02, .1 + r1 * .78 + (r3 - .5) * life * .5)),
      v: 1 - life,
      // The dance: a sway that is not in step with the climb.
      sway: reducedMotion ? 0 : Math.sin(now * 2.6 + r3 * Math.PI * 2) * .45,
      life,
      // In and out — never full strength at either end of the climb.
      alpha: Math.sin(Math.min(1, Math.max(0, life)) * Math.PI),
      scale: .8 + r2 * .5,
      kind: NOTE_KINDS[Math.floor(r2 * NOTE_KINDS.length) % NOTE_KINDS.length],
    });
  }
  return notes;
}

export function drawAttackNotes({
  x, y, w, h, count = 3, now = 0, seed = 0, reducedMotion = false, alpha = 1, tone = 'enemy',
} = {}) {
  if (!(w > 0) || !(h > 0) || !(count > 0)) return;
  const notes = attackNoteLayout({ count, now, seed, reducedMotion });
  if (!notes.length) return;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    ctx.fillStyle = tone === 'enemy' ? UI_COLOR.danger : UI_COLOR.amber;
    for (const note of notes) {
      const a = alpha * note.alpha * .92;
      if (a <= .02) continue;
      const sprite = NOTE_SPRITES[note.kind] || NOTE_SPRITES.crotchet;
      // A note stands about one character tall, so it belongs to this screen.
      const px = Math.max(1, Math.round((cellH * dpr * note.scale) / sprite.length));
      const originX = Math.round((x + note.u * w + note.sway * .4) * cellW * dpr);
      const originY = Math.round((y + note.v * Math.max(1, h - 1)) * cellH * dpr);
      ctx.globalAlpha = a;
      for (let row = 0; row < sprite.length; row += 1) {
        const line = sprite[row];
        for (let col = 0; col < line.length; col += 1) {
          if (line[col] !== '#') continue;
          ctx.fillRect(originX + col * px, originY + row * px, px, px);
        }
      }
    }
    ctx.restore();
  });
}

export function drawSignalBeing(profileKey, {
  x, y, w, h, snr = 'signal', coherenceRatio = 1, movementIndex = 0,
  intentKind = null, now = 0, resolveProgress = 0, reducedMotion = false,
  oblique = 0, hitFlash = 0, knock = 0,
} = {}) {
  const figure = BEING_FIGURE[String(profileKey)] || 'column';
  const seed = beingSeed(profileKey);
  const tick = reducedMotion ? 0 : Math.floor(now * 8) / 8;
  const rnd = (i) => {
    const s = Math.sin((i + 1 + seed) * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  let points = beingPoints(figure, { tick, layers: Math.max(0, movementIndex), seed });

  const pulse = .5 + .5 * Math.sin(tick * Math.PI);
  let alphaScale = 1;
  if (intentKind === 'broadcast') {
    const grow = 1 + .22 * pulse;
    points = points.map((p) => ({ ...p, u: p.u * grow, v: p.v * grow }));
  } else if (intentKind === 'conceal') {
    alphaScale = .32;
  } else if (intentKind === 'overload') {
    points = points.map((p, i) => ({ ...p, u: p.u + (rnd(i * 3) - .5) * .07, v: p.v + (rnd(i * 7) - .5) * .03 }));
  } else if (intentKind === 'loop') {
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2 + tick;
      points.push({ u: Math.cos(angle) * .44, v: Math.sin(angle) * .40, a: .5 });
    }
  } else if (intentKind === 'silence') {
    points = points.map((p) => ({ ...p, v: p.v * .22 }));
  }

  if (oblique) {
    // Shear the whole figure so the being leans into the fight rather than
    // hanging flat in the void.
    const shear = oblique * 2.4;
    points = points.map((p) => ({ ...p, u: p.u + p.v * shear }));
  }

  const keep = .15 + .85 * clamp(coherenceRatio, 0, 1);
  const flash = clamp(hitFlash, 0, 1);
  const tint = SNR_TINT[snr] || SNR_TINT.signal;
  const strike = resolveProgress > .18 && resolveProgress < .55 ? Math.sin(resolveProgress * Math.PI) : 0;

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = (x + knock) * cellW * dpr;
    const py = y * cellH * dpr;
    const pw = w * cellW * dpr;
    const ph = h * cellH * dpr;
    const cx = px + pw / 2 - strike * pw * .04;
    const cy = py + ph / 2;
    const dot = Math.max(2 * dpr, Math.min(pw, ph) * .018);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px - cellW * dpr, py, pw + cellW * dpr * 2, ph);
    ctx.clip();
    points.forEach((point, index) => {
      // The core is the hush itself: it never thins out with coherence, and it
      // reads as a dark mass haloed by the shell's tint rather than taking the
      // tint. The shell (everything else) dissolves as the fight wears it down.
      if (!point.core && rnd(index) > keep) return;
      const alpha = point.core
        ? clamp(point.a, 0, 1) * (.8 + .2 * rnd(index * 13))
        : clamp(point.a * alphaScale, 0, 1) * (.55 + .45 * rnd(index * 13));
      const color = flash > 0 ? '255,244,230' : point.core ? '9,7,12' : tint;
      const size = point.core ? dot * 1.7 : dot;
      ctx.fillStyle = `rgba(${color},${Math.min(1, alpha + flash * .5).toFixed(3)})`;
      ctx.shadowColor = point.core ? `rgba(${tint},.85)` : `rgba(${color},.9)`;
      ctx.shadowBlur = ((point.core ? 6 : 4) + flash * 5) * dpr;
      ctx.fillRect(
        Math.round(cx + point.u * pw - size / 2),
        Math.round(cy + point.v * ph - size / 2),
        Math.round(size),
        Math.round(size),
      );
    });
    ctx.restore();
  });
}

// ── the turn glyph ────────────────────────────────────────────────────────────
// Whose beat it is, as a drawn symbol pair rather than text: a signal-ring for
// the recordist and the hush's dark core-diamond for the opponent (the same core
// that shows through its shell). The active side is lit, filled and gently
// pulsing; the idle side recedes to a dim outline. A small exchange tally sits
// alongside. Filled-vs-outline plus the ring/diamond shapes carry it without
// relying on colour, and the pulse holds still under reduced motion.
export function drawTurnGlyph(x, y, { active = 'player', turn = 1, reducedMotion = false, now = 0 } = {}) {
  const enemyTurn = active === 'enemy';
  const pulse = reducedMotion ? 1 : .78 + .22 * Math.abs(Math.sin(now * Math.PI * 1.4));
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const cw = cellW * dpr, ch = cellH * dpr;
    const cy = (y + 0.5) * ch;
    const r = Math.min(cw, ch) * 0.42;
    // Recordist — a signal ring, filled and haloed on your beat, else a faint hoop.
    const youAlpha = enemyTurn ? 0.3 : pulse;
    ctx.save();
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeStyle = `rgba(120,190,255,${youAlpha.toFixed(3)})`;
    ctx.beginPath(); ctx.arc((x + 0.7) * cw, cy, r, 0, Math.PI * 2);
    if (!enemyTurn) {
      ctx.shadowColor = 'rgba(120,190,255,0.8)'; ctx.shadowBlur = 6 * dpr;
      ctx.fillStyle = `rgba(120,190,255,${youAlpha.toFixed(3)})`; ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
    // Hush — the dark core-diamond, lit and haloed red on its beat, else a dim rim.
    const enAlpha = enemyTurn ? pulse : 0.3;
    ctx.save();
    ctx.translate((x + 2.15) * cw, cy); ctx.rotate(Math.PI / 4);
    ctx.lineWidth = Math.max(1, dpr * 1.3);
    ctx.strokeStyle = `rgba(255,70,55,${enAlpha.toFixed(3)})`;
    if (enemyTurn) { ctx.shadowColor = `rgba(255,60,50,${enAlpha.toFixed(3)})`; ctx.shadowBlur = 8 * dpr; }
    ctx.fillStyle = enemyTurn ? 'rgba(12,6,10,1)' : `rgba(120,40,40,${enAlpha.toFixed(3)})`;
    ctx.beginPath(); ctx.rect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64); ctx.fill(); ctx.stroke();
    ctx.restore();
  });
  uiText(x + 3, y, `TURN ${Math.max(1, Math.floor(turn))}`, 'ui-amber', .82);
}

// ── the stance triangle ───────────────────────────────────────────────────────
// Signal / noise / silence as a visible rock-paper-scissors widget: the current
// stance ringed, the highlighted move's shift marked, and the live modifiers
// spelled out from SNR_TRIANGLE so the readout can never drift from the rules.
export function drawStanceTriangle(x, y, w, { snr = 'signal', pendingShift = null, compact = false } = {}) {
  const role = (stance) => (stance === 'noise' ? 'ui-danger' : stance === 'signal' ? 'ui-blue' : 'ui-secondary');
  if (compact) {
    let cx = x;
    uiText(cx, y, 'SNR', 'ui-label', .6);
    cx += 4;
    for (const stance of ['signal', 'noise', 'silence']) {
      const label = stance.toUpperCase();
      const active = stance === snr;
      const pending = pendingShift === stance && !active;
      uiText(cx, y, `${active ? '▸' : pending ? '›' : ' '}${label}`, active ? role(stance) : 'ui-secondary', active ? 1 : pending ? .85 : .4);
      cx += label.length + 2;
    }
    return { x, y, w, h: 1 };
  }
  const nodes = {
    signal: { label: 'SIGNAL', x: x + Math.max(1, Math.floor((w - 6) / 2)), y },
    noise: { label: 'NOISE', x: x + 1, y: y + 2 },
    silence: { label: 'SILENCE', x: x + w - 8, y: y + 2 },
  };
  uiLine(nodes.signal.x + 3, y + .95, nodes.noise.x + 2.5, y + 1.95, UI_COLOR.frame, .35);
  uiLine(nodes.signal.x + 3, y + .95, nodes.silence.x + 3.5, y + 1.95, UI_COLOR.frame, .35);
  uiLine(nodes.noise.x + 6, y + 2.5, nodes.silence.x - .5, y + 2.5, UI_COLOR.frame, .35);
  for (const [stance, node] of Object.entries(nodes)) {
    const active = stance === snr;
    const pending = pendingShift === stance && !active;
    uiText(node.x, node.y, node.label, active ? role(stance) : pending ? 'ui-amber' : 'ui-secondary', active ? 1 : pending ? .9 : .45);
    if (active) uiStrokeRect(node.x - .6, node.y - .05, node.label.length + 1.2, 1.1, UI_COLOR.amber, .55, 1);
    if (pending) uiText(node.x - 1, node.y, '▶', 'ui-amber', .9);
  }
  uiText(x, y + 4, String(SNR_TRIANGLE[snr]?.blurb || '').slice(0, w), 'ui-secondary', .55);
  return { x, y, w, h: 5 };
}

export const COMBAT_TOOL_ICON = Object.freeze({
  self: null,
  torch: 'light',
  recorder: 'recorder',
  rig: 'interface',
  fork: 'tuning-fork',
  radio: 'radio',
  coffee: 'coffee',
});

export function combatToolIcon(toolId) {
  return COMBAT_TOOL_ICON[toolId] || (toolId === 'self' ? 'nerve' : 'unknown');
}

// The command deck is operated by silhouettes first and read as text second.
// These are small service-manual symbols, not font glyphs: they remain legible
// at the VFD's native low resolution and do not depend on platform emoji fonts.
export function drawCombatActionIcon(actionId, x, y, {
  w = 5,
  h = 2.2,
  active = false,
  enabled = true,
  counter = false,
  alpha = 1,
} = {}) {
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const box = {
      x: x * cellW * dpr,
      y: y * cellH * dpr,
      w: w * cellW * dpr,
      h: h * cellH * dpr,
    };
    const X = (u) => box.x + box.w * u;
    const Y = (v) => box.y + box.h * v;
    const path = (points, close = false) => {
      ctx.beginPath();
      points.forEach(([u, v], index) => (index ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))));
      if (close) ctx.closePath();
      ctx.stroke();
    };
    const circle = (u, v, r, fill = false) => {
      ctx.beginPath();
      ctx.arc(X(u), Y(v), Math.min(box.w, box.h) * r, 0, Math.PI * 2);
      fill ? ctx.fill() : ctx.stroke();
    };
    const rect = (u, v, ww, hh, fill = false) => {
      const args = [X(u), Y(v), box.w * ww, box.h * hh];
      fill ? ctx.fillRect(...args) : ctx.strokeRect(...args);
    };
    const id = String(actionId || '');
    const color = !enabled ? UI_COLOR.secondary : counter ? '#84e6a1' : active ? UI_COLOR.counter : UI_COLOR.primary;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * (enabled ? 1 : .34);
    ctx.lineWidth = Math.max(1, 1.15 * dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (active && enabled) { ctx.shadowColor = color; ctx.shadowBlur = 4 * dpr; }

    if (id === 'hold') {
      path([[.5,.06],[.82,.20],[.76,.62],[.5,.92],[.24,.62],[.18,.20]], true);
      path([[.5,.18],[.5,.76]]);
    } else if (id === 'wait') {
      rect(.29,.16,.13,.68,true); rect(.58,.16,.13,.68,true);
    } else if (id === 'compose') {
      path([[.08,.54],[.27,.54],[.34,.28],[.46,.76],[.57,.42],[.66,.54],[.92,.54]]);
      circle(.5,.53,.39);
    } else if (id === 'expose') {
      rect(.12,.32,.23,.38); path([[.35,.35],[.88,.10],[.88,.90],[.35,.67]], true);
      path([[.67,.28],[.93,.18]]); path([[.67,.72],[.93,.82]]);
    } else if (id === 'whiteout') {
      circle(.5,.5,.16,true);
      for (const [a,b] of [[[.5,.02],[.5,.25]],[[.5,.75],[.5,.98]],[[.02,.5],[.25,.5]],[[.75,.5],[.98,.5]],[[.16,.16],[.31,.31]],[[.69,.69],[.84,.84]],[[.84,.16],[.69,.31]],[[.31,.69],[.16,.84]]]) path([a,b]);
    } else if (id === 'monitor') {
      circle(.32,.45,.18); circle(.68,.45,.18); path([[.32,.45],[.68,.45]]);
      rect(.22,.73,.56,.10);
    } else if (id === 'playback') {
      path([[.31,.16],[.78,.50],[.31,.84]], true); path([[.08,.18],[.08,.82]]);
    } else if (id === 'master-take') {
      circle(.30,.45,.16); circle(.70,.45,.16); path([[.30,.45],[.70,.45]]);
      path([[.20,.78],[.36,.63],[.50,.78],[.64,.63],[.80,.78]]);
    } else if (id === 'invert') {
      path([[.22,.39],[.34,.20],[.66,.20],[.80,.39]]); path([[.80,.39],[.68,.36],[.76,.25]]);
      path([[.78,.61],[.66,.80],[.34,.80],[.20,.61]]); path([[.20,.61],[.32,.64],[.24,.75]]);
    } else if (id === 'runaway-feedback') {
      path([[.08,.52],[.26,.24],[.48,.48],[.70,.76],[.92,.50],[.72,.24],[.50,.50],[.28,.76],[.08,.52]]);
      circle(.50,.50,.05,true);
    } else if (id === 'tune') {
      path([[.30,.08],[.30,.48],[.42,.63],[.46,.63],[.46,.94]]);
      path([[.70,.08],[.70,.48],[.58,.63],[.54,.63],[.54,.94]]);
      path([[.18,.18],[.06,.10]]); path([[.82,.18],[.94,.10]]);
    } else if (id === 'radio-decoy') {
      path([[.42,.20],[.58,.20],[.58,.84],[.42,.84]], true); path([[.50,.20],[.50,.04]]);
      path([[.30,.30],[.18,.20],[.12,.08]]); path([[.70,.30],[.82,.20],[.88,.08]]);
      circle(.50,.63,.06,true);
    } else if (id === 'steady-hands') {
      path([[.26,.24],[.74,.24],[.66,.84],[.34,.84]], true); path([[.22,.18],[.78,.18]]);
      path([[.40,.12],[.43,.02]]); path([[.57,.12],[.61,.02]]);
    } else if (id === 'end-tempo') {
      rect(.23,.18,.54,.64); rect(.38,.36,.24,.28,true);
    } else {
      circle(.50,.50,.28); path([[.50,.08],[.50,.92]]); path([[.18,.50],[.82,.50]]);
    }
    ctx.restore();
  });
}

export function combatActionReadout(move = {}) {
  if (move.enabled === false) return 'UNAVAILABLE';
  const bits = [];
  if (move.damage) bits.push(`DMG ${move.damage}`);
  if (move.prevents) bits.push(`GUARD ${move.prevents}`);
  if (move.heals) bits.push(`HEAL ${move.heals}`);
  if (move.captures) bits.push('CAPTURE');
  if (move.consumesTake) bits.push('PLAY TAKE');
  if (move.reveals) bits.push(`READ ${move.reveals}`);
  if (move.free) bits.push('FREE');
  if (move.once) bits.push('ONCE');
  return bits.slice(0, 2).join(' · ') || 'POSITION';
}

export function drawCombatToolTile(tool, { x, y, w, h = 3, selected = false, focused = false } = {}) {
  const ready = tool?.ready !== false;
  uiFill(x, y, w, h, selected ? 'rgba(242,168,30,.075)' : 'rgba(255,255,255,.018)');
  uiStrokeRect(x, y, w, h, selected ? UI_COLOR.amber : UI_COLOR.frame, focused ? .86 : selected ? .46 : .18, focused ? 1.4 : 1);
  const iconW = Math.min(4.3, Math.max(2.8, w * .34));
  drawBagIcon(combatToolIcon(tool?.id), x + .35, y + .28, {
    w: iconW,
    h: h - .55,
    active: selected,
    state: ready ? (selected ? 'active' : 'dim') : 'dim',
    alpha: ready ? 1 : .28,
    empty: !ready,
  });
  const labelX = x + iconW + .8;
  const labelW = Math.max(1, Math.floor(w - iconW - 1.1));
  uiText(labelX, y + .48, String(tool?.label || '').slice(0, labelW), selected ? 'ui-primary' : 'ui-secondary', selected ? 1 : .68);
  uiText(labelX, y + 1.50, ready ? 'READY' : 'LOCKED', ready ? 'ui-label' : 'ui-danger', ready ? .48 : .55);
  return { x, y, w, h };
}

export function drawCombatActionTile(move, { x, y, w, h = 3.2, selected = false, focused = false } = {}) {
  const enabled = move?.enabled !== false;
  const counters = !!move?.perfect;
  const color = counters ? '#84e6a1' : selected ? UI_COLOR.primary : UI_COLOR.frame;
  uiFill(x, y, w, h, selected ? 'rgba(91,240,138,.065)' : 'rgba(255,255,255,.018)');
  uiStrokeRect(x, y, w, h, color, focused ? .90 : selected ? .50 : .18, focused ? 1.4 : 1);
  const iconW = Math.min(5.5, Math.max(3.6, w * .28));
  drawCombatActionIcon(move?.id, x + .35, y + .34, {
    w: iconW,
    h: h - .68,
    active: selected,
    enabled,
    counter: counters,
    alpha: selected ? 1 : .72,
  });
  const labelX = x + iconW + .85;
  const labelW = Math.max(1, Math.floor(w - iconW - 1.15));
  uiText(labelX, y + .48, String(move?.label || '').slice(0, labelW), !enabled ? 'ui-secondary' : counters ? 'ui-counter' : selected ? 'ui-primary' : 'ui-secondary', selected ? 1 : .72);
  uiText(labelX, y + 1.52, combatActionReadout(move).slice(0, labelW), !enabled ? 'ui-danger' : 'ui-label', !enabled ? .52 : .58);
  if (counters) uiText(x + w - 2, y + .35, '◆', 'ui-counter', .92);
  return { x, y, w, h };
}

const HAND_PALETTE = Object.freeze({
  signal: Object.freeze({
    outline: '#170508',
    deepest: '#25152e',
    base: '#40304f',
    shade: '#34233f',
    light: '#443ec0',
    hot: '#6c63ff',
  }),
  noise: Object.freeze({
    outline: '#1d0507',
    deepest: '#2c151d',
    base: '#4d2f47',
    shade: '#3e2134',
    light: '#a83245',
    hot: '#e0544f',
  }),
  silence: Object.freeze({
    outline: '#071316',
    deepest: '#17272d',
    base: '#30424b',
    shade: '#26373f',
    light: '#245a73',
    hot: '#4c8ba0',
  }),
});

function pixelPoly(ctx, px, py, pw, ph, points, fill, outline, lineWidth) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(px + points[0][0] * pw, py + points[0][1] * ph);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(px + points[i][0] * pw, py + points[i][1] * ph);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function pixelBlock(ctx, px, py, pw, ph, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(
    Math.round(px + x * pw),
    Math.round(py + y * ph),
    Math.max(1, Math.round(w * pw)),
    Math.max(1, Math.round(h * ph)),
  );
}

// The hand silhouettes were authored against the supplied pixel-art reference
// inside shared-band spans (open hand 0..0.53, grip hand 0.5..1.0). Each draw
// function rescales its span to fill its own near-square box, so the chunky
// contours keep the reference proportions instead of smearing across the panel.
function drawOpenHand(ctx, box, palette, severity, lineWidth) {
  const { px, py, pw, ph } = box;
  const X = (value) => value / .53;
  const poly = (points, fill, outline, lw) => pixelPoly(ctx, px, py, pw, ph, points.map(([xx, yy]) => [X(xx), yy]), fill, outline, lw);
  const block = (xx, yy, ww, hh, fill) => pixelBlock(ctx, px, py, pw, ph, X(xx), yy, X(ww), hh, fill);

  // Four separate fingers are joined by the palm. Their right-angle contours
  // intentionally preserve the chunky authored silhouette at any terminal size.
  const fingers = [
    [[.14,.57],[.12,.57],[.12,.48],[.14,.48],[.14,.35],[.16,.35],[.16,.24],[.18,.24],[.18,.17],[.21,.17],[.21,.25],[.20,.25],[.20,.38],[.19,.38],[.19,.51],[.22,.51],[.22,.60]],
    [[.20,.53],[.20,.38],[.22,.38],[.22,.21],[.24,.21],[.24,.10],[.28,.10],[.28,.18],[.27,.18],[.27,.35],[.26,.35],[.26,.51],[.29,.51],[.29,.59]],
    [[.27,.51],[.28,.30],[.30,.30],[.30,.13],[.32,.13],[.32,.03],[.36,.03],[.36,.12],[.35,.12],[.35,.31],[.34,.31],[.34,.51],[.37,.51],[.37,.59]],
    [[.34,.54],[.36,.38],[.38,.38],[.38,.25],[.40,.25],[.40,.17],[.44,.17],[.44,.24],[.43,.24],[.43,.39],[.41,.39],[.40,.56]],
  ];
  for (const finger of fingers) poly(finger, palette.base, palette.outline, lineWidth);

  poly([
    [0,1],[0,.82],[.05,.82],[.05,.76],[.09,.76],[.09,.68],[.13,.68],
    [.13,.59],[.17,.59],[.17,.51],[.22,.51],[.22,.45],[.28,.45],[.28,.42],
    [.34,.42],[.34,.47],[.39,.47],[.39,.54],[.43,.54],[.43,.61],[.47,.61],
    [.47,.73],[.43,.73],[.43,.81],[.37,.81],[.37,.88],[.29,.88],[.29,.94],
    [.21,.94],[.21,1],
  ], palette.base, palette.outline, lineWidth);

  // Thumb reaches up-right toward the opponent, the way the reference art's
  // foreground hand leads with it.
  poly([
    [.34,.55],[.40,.49],[.40,.45],[.46,.45],[.46,.40],[.52,.40],[.52,.44],
    [.50,.44],[.50,.49],[.46,.49],[.46,.54],[.42,.54],[.42,.61],[.38,.66],
  ], palette.base, palette.outline, lineWidth);

  poly([
    [.29,.78],[.34,.78],[.34,.72],[.39,.72],[.39,.64],[.43,.64],[.43,.73],
    [.40,.73],[.40,.81],[.35,.81],[.35,.87],[.29,.87],
  ], palette.shade, null, 0);
  block(.19, .49, .025, .075, palette.deepest);
  block(.26, .48, .025, .065, palette.deepest);
  block(.34, .49, .025, .065, palette.deepest);

  // Broad, deliberately irregular signal-light patches from the supplied art.
  poly([
    [.04,.86],[.08,.86],[.08,.78],[.13,.78],[.13,.68],[.17,.68],[.17,.60],
    [.20,.60],[.20,.73],[.18,.73],[.18,.82],[.14,.82],[.14,.91],[.09,.91],
    [.09,.97],[.04,.97],
  ], palette.light, null, 0);
  poly([
    [.20,.62],[.23,.62],[.23,.57],[.27,.57],[.27,.64],[.30,.64],[.30,.74],
    [.27,.74],[.27,.79],[.23,.79],[.23,.72],[.20,.72],
  ], palette.light, null, 0);
  block(.18, .38, .04, .08, palette.light);
  block(.24, .22, .025, .08, palette.light);
  block(.30, .17, .035, .12, palette.light);
  block(.37, .26, .027, .09, palette.light);
  block(.32, .57, .045, .08, palette.light);
  block(.07, .83, .045, .05, palette.hot);

  if (severity) {
    const blood = severity >= 3 ? '#d32b35' : '#8b1323';
    block(.285, .46, .055, .025, palette.outline);
    block(.30, .475, .045, .022, blood);
    block(.155, .63, .035, .035, blood);
    if (severity >= 2) {
      // A dark missing corner makes worsening damage change the silhouette.
      block(.395, .17, .025, .045, palette.outline);
      block(.39, .54, .035, .045, blood);
    }
    if (severity >= 3) {
      block(.225, .10, .025, .045, palette.outline);
      block(.24, .70, .028, .055, blood);
    }
  }
}

function drawGripHandBack(ctx, box, palette, severity, lineWidth) {
  const { px, py, pw, ph } = box;
  const X = (value) => (value - .5) / .5;
  const W = (value) => value / .5;
  const poly = (points, fill, outline, lw) => pixelPoly(ctx, px, py, pw, ph, points.map(([xx, yy]) => [X(xx), yy]), fill, outline, lw);
  const block = (xx, yy, ww, hh, fill) => pixelBlock(ctx, px, py, pw, ph, X(xx), yy, W(ww), hh, fill);

  poly([
    [1,1],[.72,1],[.72,.96],[.68,.96],[.68,.89],[.64,.89],[.64,.80],
    [.61,.80],[.61,.69],[.59,.69],[.59,.61],[.62,.61],[.62,.53],[.66,.53],
    [.66,.48],[.71,.48],[.71,.44],[.78,.44],[.78,.47],[.84,.47],[.84,.52],
    [.89,.52],[.89,.60],[.93,.60],[.93,.71],[.97,.71],[.97,.84],[1,.84],
  ], palette.base, palette.outline, lineWidth);

  // Knuckles rise behind the object before the closing fingers are drawn over it.
  const knuckles = [
    [[.62,.56],[.58,.50],[.58,.43],[.55,.43],[.55,.35],[.57,.35],[.57,.30],[.61,.30],[.61,.34],[.64,.34],[.64,.42],[.67,.42],[.67,.55]],
    [[.68,.50],[.65,.43],[.65,.31],[.63,.31],[.63,.23],[.65,.23],[.65,.19],[.70,.19],[.70,.24],[.72,.24],[.72,.35],[.75,.35],[.75,.49]],
    [[.75,.48],[.73,.39],[.73,.28],[.75,.28],[.75,.23],[.80,.23],[.80,.28],[.82,.28],[.82,.39],[.84,.39],[.84,.51]],
    [[.83,.52],[.82,.43],[.84,.43],[.84,.35],[.89,.35],[.89,.40],[.91,.40],[.91,.49],[.94,.49],[.94,.60]],
  ];
  for (const knuckle of knuckles) poly(knuckle, palette.base, palette.outline, lineWidth);

  poly([
    [.77,.72],[.82,.72],[.82,.67],[.87,.67],[.87,.73],[.91,.73],[.91,.84],
    [.88,.84],[.88,.90],[.81,.90],[.81,.84],[.77,.84],
  ], palette.shade, null, 0);
  block(.66, .46, .035, .025, palette.deepest);
  block(.74, .44, .035, .025, palette.deepest);
  block(.82, .49, .035, .025, palette.deepest);

  block(.68, .55, .055, .12, palette.light);
  block(.75, .49, .035, .08, palette.light);
  block(.82, .57, .04, .10, palette.light);
  block(.71, .78, .045, .08, palette.light);
  block(.88, .83, .07, .05, palette.light);
  block(.91, .94, .055, .04, palette.hot);

  if (severity) {
    const blood = severity >= 3 ? '#d32b35' : '#8b1323';
    block(.79, .54, .05, .025, blood);
    if (severity >= 2) block(.68, .88, .04, .045, blood);
    if (severity >= 3) block(.875, .35, .025, .045, palette.outline);
  }
}

function drawGripHandFront(ctx, box, palette, severity, lineWidth, hasTool) {
  const { px, py, pw, ph } = box;
  const X = (value) => (value - .5) / .5;
  const W = (value) => value / .5;
  const poly = (points, fill, outline, lw) => pixelPoly(ctx, px, py, pw, ph, points.map(([xx, yy]) => [X(xx), yy]), fill, outline, lw);
  const block = (xx, yy, ww, hh, fill) => pixelBlock(ctx, px, py, pw, ph, X(xx), yy, W(ww), hh, fill);
  const reach = hasTool ? 0 : .035;

  // Thumb and curled fingertips cross in front of the item: it is being held,
  // not merely composited between two unrelated hands.
  poly([
    [.68,.68],[.61,.68],[.61,.64],[.56,.64],[.56,.60],[.51,.60],[.51,.54],
    [.54,.49],[.58,.49],[.58,.53],[.56,.53],[.56,.57],[.60,.57],[.60,.61],
    [.65,.61],[.65,.57],[.70,.57],[.72,.62],
  ].map(([xx, yy]) => [xx + reach, yy]), palette.base, palette.outline, lineWidth);
  block(.59 + reach, .60, .035, .035, palette.light);

  const curls = [
    [[.57,.30],[.61,.30],[.61,.34],[.64,.34],[.64,.40],[.61,.40],[.61,.37],[.57,.37]],
    [[.65,.19],[.70,.19],[.70,.24],[.72,.24],[.72,.31],[.69,.31],[.69,.27],[.65,.27]],
    [[.75,.23],[.80,.23],[.80,.28],[.82,.28],[.82,.34],[.79,.34],[.79,.31],[.75,.31]],
  ];
  for (const curl of curls) poly(curl, palette.base, palette.outline, lineWidth);
  block(.58, .31, .025, .025, palette.hot);
  block(.66, .20, .027, .025, palette.light);
  block(.76, .24, .027, .025, palette.light);

  if (severity >= 2) block(.53 + reach, .53, .025, .035, '#9b1825');
}

// The recordist's hands, first person, OFF-style: the open hand rises large in
// the near-left foreground, the gripping hand sits smaller and further right,
// and both are clipped to the stage so wrists never spill into the command band.
export function drawFirstPersonHands(toolId, {
  stage = null,
  left = null,
  right = null,
  injury = 'steady',
  snr = 'signal',
  now = 0,
  resolveProgress = 0,
  reducedMotion = false,
  hurt = 0,
  brace = false,
} = {}) {
  const severity = injury === 'critical' ? 3 : injury === 'wounded' ? 2 : injury === 'hurt' ? 1 : 0;
  const flinch = clamp(hurt, 0, 1);
  const tremor = reducedMotion ? 0 : Math.sin(now * (7 + severity * 2)) * (severity * .12 + flinch * .35);
  const punch = resolveProgress > .18 && resolveProgress < .55 ? Math.sin(resolveProgress * Math.PI) : 0;
  const bob = reducedMotion ? 0 : Math.sin(now * 1.4);
  const palette = HAND_PALETTE[snr] || HAND_PALETTE.signal;

  const leftCells = left && {
    x: left.x + tremor + punch * .8 - flinch * .6 + (brace ? left.w * .08 : 0),
    y: left.y + bob * .22 - punch * 1.4 + flinch * 1.3 + (brace ? .45 : 0),
    w: left.w,
    h: left.h,
  };
  const rightCells = right && {
    x: right.x + tremor - punch * .8 + flinch * .6 - (brace ? right.w * .08 : 0),
    y: right.y + Math.sin(now * 1.4 + .9) * (reducedMotion ? 0 : .16) - punch * 1.4 + flinch * 1.3 + (brace ? .45 : 0),
    w: right.w,
    h: right.h,
  };

  const toPx = (cells, cellW, cellH, dpr) => ({
    px: cells.x * cellW * dpr,
    py: cells.y * cellH * dpr,
    pw: cells.w * cellW * dpr,
    ph: cells.h * cellH * dpr,
  });
  const settle = (ctx, dpr, cellW, cellH) => {
    ctx.imageSmoothingEnabled = false;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    if (stage) {
      const clip = toPx(stage, cellW, cellH, dpr);
      ctx.beginPath();
      ctx.rect(clip.px, clip.py, clip.pw, clip.ph);
      ctx.clip();
    }
    return Math.max(1, 1.35 * dpr);
  };

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    const lineWidth = settle(ctx, dpr, cellW, cellH);
    if (leftCells) drawOpenHand(ctx, toPx(leftCells, cellW, cellH, dpr), palette, severity, lineWidth);
    if (rightCells) drawGripHandBack(ctx, toPx(rightCells, cellW, cellH, dpr), palette, severity, lineWidth);
    ctx.restore();
  });

  const icon = rightCells ? COMBAT_TOOL_ICON[toolId] : null;
  if (icon) drawBagIcon(icon, rightCells.x + rightCells.w * .30, rightCells.y + rightCells.h * .12, {
    w: rightCells.w * .34,
    h: rightCells.h * .55,
    active: resolveProgress > 0 || toolId !== 'self',
    state: snr === 'noise' ? 'danger' : snr === 'signal' ? 'metadata' : 'dim',
    alpha: .62,
  });

  // uiDraw is immediate; this final pass places the gripping digits over the
  // existing bag icon so every equipped object inherits the same held pose.
  if (rightCells) uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    const lineWidth = settle(ctx, dpr, cellW, cellH);
    drawGripHandFront(ctx, toPx(rightCells, cellW, cellH, dpr), palette, severity, lineWidth, Boolean(icon));
    ctx.restore();
  });
}

// ── THE THREE HALL APPARITIONS ─────────────────────────────────────────────
//
// Three bodies, three fused chairs, three targetable health pools. The room is
// backdrop only. These sprites deliberately echo the world apparition poses
// without importing the emergency-light director or weakening its boundary.
const HALL_APPARITION_SPRITES = Object.freeze({
  'head-turn': ['..##...', '.####..', '..###..', '.#####.', '.##.##.', '###.###', '#.....#'],
  stoop:       ['...##..', '..####.', '.#####.', '####...', '.##.##.', '###.###', '#.....#'],
  'arm-out':   ['..##...', '.####..', '#######', '..###..', '.##.##.', '###.###', '#.....#'],
});

export function hallApparitionLayout(members = [], { x = 0, w = 40 } = {}) {
  const gap = 2;
  const slotW = Math.max(8, (w - gap * Math.max(0, members.length - 1)) / Math.max(1, members.length));
  return members.map((member, index) => ({ ...member, index, x: x + index * (slotW + gap), w: slotW }));
}

export function drawHallApparitions(roster, {
  x, y, w, h, now = 0, reducedMotion = false, dim = 1,
} = {}) {
  if (!roster?.members?.length || !(w > 0) || !(h > 0)) return;
  const members = hallApparitionLayout(roster.members, { x, w });
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    const px = Math.max(1, Math.round(Math.min(cellW, cellH) * dpr * .72));
    for (const member of members) {
      const sprite = HALL_APPARITION_SPRITES[member.pose] || HALL_APPARITION_SPRITES['head-turn'];
      const spriteW = sprite[0].length * px;
      const spriteH = sprite.length * px;
      const sway = reducedMotion || member.defeated ? 0 : Math.sin(now * 1.4 + member.index * 1.7) * px * .55;
      const originX = Math.round((member.x + member.w / 2) * cellW * dpr - spriteW / 2 + sway);
      const originY = Math.round((y + Math.max(.3, (h - 3) * .08)) * cellH * dpr + (member.defeated ? spriteH * .48 : 0));
      ctx.globalAlpha = dim * (member.defeated ? .2 : member.acting ? 1 : .74);
      ctx.fillStyle = member.acting ? UI_COLOR.danger
        : member.parryReady ? UI_COLOR.blue
          : member.targeted ? UI_COLOR.amber : UI_COLOR.primary;
      for (let row = 0; row < sprite.length; row += 1) {
        for (let col = 0; col < sprite[row].length; col += 1) {
          if (sprite[row][col] !== '#') continue;
          ctx.fillRect(originX + col * px, originY + row * px, px, px);
        }
      }
    }
    ctx.restore();
  });

  for (const member of members) {
    const role = member.defeated ? 'ui-secondary'
      : member.acting ? 'ui-danger'
        : member.parryReady ? 'ui-blue'
          : member.targeted ? 'ui-amber' : 'ui-primary';
    const labelY = y + Math.max(2.8, h - 2.4);
    const width = Math.max(1, Math.floor(member.w - .8));
    const number = String(member.label || '').match(/\d+$/)?.[0] || String(member.index + 1).padStart(2, '0');
    const identity = `${member.primary ? '▸ ' : ''}${number} ${member.seat}`;
    const condition = member.defeated ? 'RELEASED'
      : member.parryReady ? 'PARRY READY'
        : member.acting ? 'ACTING'
          : `${member.health}/${member.maxHealth}`;
    // The stage box is intentionally narrow. Full APPARITION labels belong to
    // the target cards below; these compact identifiers must never run into the
    // adjacent body and make three entities read as one word.
    uiText(member.x + .4, labelY, identity.slice(0, width), role, member.defeated ? .35 : .78);
    uiText(member.x + .4, labelY + .82, condition.slice(0, width), role, member.defeated ? .3 : .58);
  }
}
