// THE SCREEN AFTER A LOST FIGHT.
//
// This is one half of a composition. The other half is already built and
// already runs: `deathCompositionPlan` (platform/window-composition.js) throws
// four panes onto the DESKTOP carrying quarters of your final rendered frame,
// reveals real footage into three of them, swaps two at the autopsy, and
// ripples them back. That has been firing on every loss for some time with
// nothing inside the game window to answer it — the desktop performed an
// autopsy while the canvas sat on the last frame of combat.
//
// So this draws the SAME EDIT on the SAME BEATS. With window choreography on,
// the canvas and the desktop are one piece and the panes look like fragments
// that got out. With it off — and it is opt-out, and it can revoke itself
// (see main.js disablePersonalizedInterference) — this carries the whole thing
// alone. That is the requirement, not a fallback: most of the reasons a player
// never sees the desktop half are invisible to the player.
//
// It draws no numbers. What the loss cost is a line in the log and a thought in
// his own voice when he comes to somewhere else; a statistics panel over a
// picture of your own death is a different game.

import { uiDraw, uiFill, uiSize } from '../render/ui.js';
import { drawVfdText } from '../render/presentation.js';

// The desktop score, in seconds. Every one of these is lifted from
// deathCompositionPlan's cue list so the two halves cannot drift: reveals at
// 180/300/420ms, the autopsy swap at 2500ms, the ripple restore at 4000ms,
// and a 5200ms loop. We hold exactly one loop and then hand off.
export const DEATH_BEATS = Object.freeze({
  revealA: 0.18,
  revealB: 0.30,
  revealC: 0.42,
  autopsy: 2.50,
  restore: 4.00,
  loop: 5.20,
});

// Where the four quarters sit, as fractions of the frame, and where each one
// drifts to. They start assembled — it is your own last frame, whole — and come
// apart. The drift is small: this is a picture coming unstuck, not an explosion.
const QUARTERS = Object.freeze([
  { crop: { x: 0, y: 0, w: .5, h: .5 }, drift: { x: -.055, y: -.038 } },
  { crop: { x: .5, y: 0, w: .5, h: .5 }, drift: { x: .055, y: -.038 } },
  { crop: { x: 0, y: .5, w: .5, h: .5 }, drift: { x: -.048, y: .042 } },
  { crop: { x: .5, y: .5, w: .5, h: .5 }, drift: { x: .048, y: .042 } },
]);

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = (t) => { const v = clamp01(t); return v * v * (3 - 2 * v); };

// How far apart the quarters have come, 0..1, and which pair is swapped.
// Exported so a test can assert the canvas is on the desktop's beats without
// standing up a renderer.
export function deathFrameState(elapsed = 0) {
  const t = Math.max(0, Number(elapsed) || 0);
  const B = DEATH_BEATS;
  // The reveals stagger the quarters apart one at a time, in the order the
  // desktop reveals its panes.
  const openings = [0, B.revealA, B.revealB, B.revealC];
  const spread = openings.map((at) => smooth((t - at) / 1.6));
  // The autopsy holds them still for a breath, then the restore pulls them back
  // most of the way — never all of it. It does not go back together.
  const settling = t < B.autopsy ? 0
    : t < B.restore ? smooth((t - B.autopsy) / (B.restore - B.autopsy)) * .18
      : .18 + smooth((t - B.restore) / (B.loop - B.restore)) * .34;
  return {
    elapsed: t,
    spread: spread.map((value) => Math.max(0, value - settling)),
    autopsy: t >= B.autopsy && t < B.restore,
    complete: t >= B.loop,
  };
}

// `snapshot` is an HTMLImageElement (or anything drawImage accepts) holding the
// frame the fight ended on — main.js gets it from the same captureSnapshot()
// the desktop panes are already fed from, so both halves show the same picture.
export function makeDeathScene({ snapshot = null, title = '', onDone = null } = {}) {
  let t = 0;
  let handedOff = false;
  return {
    id: 'death',
    blocksInput: true,
    blocksWorld: true,
    suppressesHud: true,
    lookProfile: 'rupture',
    update(dt) {
      t += dt;
      if (handedOff || !deathFrameState(t).complete) return;
      handedOff = true;
      onDone?.();
    },
    // Nothing is dismissable. It is five seconds and it is not negotiable.
    key() { return true; },
    pointer() { return true; },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, '#000');
      const frame = deathFrameState(t);
      if (snapshot) uiDraw(({ ctx }) => {
        const w = ctx.canvas.width, h = ctx.canvas.height;
        const sw = snapshot.naturalWidth || snapshot.width || 0;
        const sh = snapshot.naturalHeight || snapshot.height || 0;
        if (!sw || !sh) return;
        // Fit the frame inside the canvas with room for the quarters to travel.
        const scale = Math.min(w / sw, h / sh) * .82;
        const dw = sw * scale, dh = sh * scale;
        const cx = (w - dw) / 2, cy = (h - dh) / 2;
        ctx.save();
        QUARTERS.forEach((quarter, index) => {
          const spread = frame.spread[index];
          // The autopsy swap: the two the desktop exchanges cross here too.
          const swapped = frame.autopsy && (index === 1 || index === 2);
          const partner = index === 1 ? QUARTERS[2] : QUARTERS[1];
          const crop = swapped ? partner.crop : quarter.crop;
          const dx = cx + quarter.crop.x * dw + quarter.drift.x * dw * spread;
          const dy = cy + quarter.crop.y * dh + quarter.drift.y * dh * spread;
          // Each piece dims as it leaves. The frame is going out, not moving.
          ctx.globalAlpha = Math.max(0, .92 - spread * .34);
          ctx.drawImage(
            snapshot,
            crop.x * sw, crop.y * sh, crop.w * sw, crop.h * sh,
            dx, dy, dw * quarter.crop.w, dh * quarter.crop.h,
          );
        });
        ctx.globalAlpha = 1;
        // The seams. Four hairlines where the frame came apart, brightening as
        // the gaps open — the only thing on screen that is not the photograph.
        const seam = clamp01(frame.spread[0] + frame.spread[3]) * .5;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(196,224,232,${.10 * seam})`;
        ctx.fillRect(cx, cy + dh / 2 - 1, dw, 2);
        ctx.fillRect(cx + dw / 2 - 1, cy, 2, dh);
        ctx.restore();
      });
      // A vignette that closes over the whole thing as it runs out.
      uiDraw(({ ctx }) => {
        const w = ctx.canvas.width, h = ctx.canvas.height;
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${.18 + smooth(t / DEATH_BEATS.loop) * .46})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      });
      // One line, and it arrives late — after the autopsy, once the picture has
      // already told you. Caps and ROM characters only: see vfd-font.js and the
      // coverage spec that fails the build on anything the atlas cannot draw.
      if (title && t >= DEATH_BEATS.autopsy) {
        const fade = Math.min(1, (t - DEATH_BEATS.autopsy) / .9);
        drawVfdText(Math.floor(cols / 2) - Math.floor(title.length), Math.floor(rows / 2), title, {
          scale: 2, role: 'ui-secondary', alpha: fade * .74, max: cols - 8,
        });
      }
    },
  };
}
