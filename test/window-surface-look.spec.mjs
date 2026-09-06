import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  WINDOW_CELL_PT,
  WINDOW_COHERENT_FLATTEN,
  WINDOW_FAULT_SECTOR_PT,
  WINDOW_PALETTE_AMOUNT,
  WINDOW_PALETTE_CHROMA,
  WINDOW_QUANT_STEPS,
  WINDOW_RAMP,
  WINDOW_SURFACE_LOOK_GLSL,
  WINDOW_FRONT_END_RAMP,
  WINDOW_FRONT_END_ENDS,
} from '../src/render/window-surface-look.js';
import { normalizeFrontEndPlate } from '../src/render/front-end-plate.js';
import { LOOK_PROFILE_IDS, getLookProfile } from '../src/render/look-profiles.js';

const surface = readFileSync(new URL('../src/window-media-surface.js', import.meta.url), 'utf8');

// The lattice, exactly as the shader computes it: device pixels to desktop
// points, then floored onto a cell.
const cellOf = (fragX, fragY, framebufferH, dpr, origin) => {
  const ptX = fragX / dpr + origin.x;
  const ptY = (framebufferH - fragY) / dpr + origin.y;
  return [Math.floor(ptX / WINDOW_CELL_PT), Math.floor(ptY / WINDOW_CELL_PT)];
};

test('one desktop point is one cell, in every window, at any scale', () => {
  // THE BUG THIS EXISTS TO CATCH. The old pass built its "shared" grid as
  // `gl_FragCoord + desktopOrigin` -- device pixels plus a DOM rect measured in
  // CSS points. On a retina display that is half the offset it should be, so no
  // two surfaces could line up even in principle, and the desktop lattice the
  // whole composition depends on was fictional.
  //
  // Two windows, different origins, different scales, both looking at the same
  // spot on the desktop. They have to agree about which cell it is.
  const desktop = { x: 811.5, y: 402.25 };
  const a = { origin: { x: 800, y: 400 }, dpr: 2, h: 360 };
  const b = { origin: { x: 640.5, y: 128.75 }, dpr: 1, h: 200 };
  const inWindow = (w) => {
    const fragX = (desktop.x - w.origin.x) * w.dpr;
    const fragY = w.h - (desktop.y - w.origin.y) * w.dpr;
    return cellOf(fragX, fragY, w.h, w.dpr, w.origin);
  };
  assert.deepEqual(inWindow(a), inWindow(b), 'both windows place the point in the same cell');

  // And the lattice is absolute, not relative to a window: the cell a point
  // falls in must not change when the window it is seen through moves.
  const still = cellOf(0, a.h, a.h, 2, { x: 800, y: 400 });
  const moved = cellOf(2 * WINDOW_CELL_PT * 2, a.h, a.h, 2, { x: 800 - WINDOW_CELL_PT * 2, y: 400 });
  assert.deepEqual(still, moved, 'sliding a window by whole cells does not renumber them');
});

test('the dither is never switched off', () => {
  // THE OTHER BUG, and the one the complaint was actually about. The threshold
  // was `mix(blueNoiseRank, 0.5, coherence)`, and coherence is 1 whenever a
  // surface is settled -- which is most of the time. Every pixel was then
  // measured against a constant, so there was no dither at all: a four-level
  // posterisation into five colours, flat violet continents with hard edges.
  // "Way too low-res" was never resolution.
  assert.ok(WINDOW_COHERENT_FLATTEN < 0.5,
    `a settled surface keeps most of its mask (flatten ${WINDOW_COHERENT_FLATTEN})`);
  assert.ok(WINDOW_COHERENT_FLATTEN > 0, 'but settling still calms it');

  // The mask must not be mixed all the way to a constant anywhere in the pass.
  assert.equal(/mix\(\s*rank\s*,\s*\.5\s*,\s*clamp\(\s*coherence[^)]*\)\s*\)/.test(WINDOW_SURFACE_LOOK_GLSL), false,
    'coherence alone can no longer reach the threshold');
  assert.match(WINDOW_SURFACE_LOOK_GLSL, /COHERENT_FLATTEN/, 'it is bounded by the constant above');
});

test('16 bit, not 8: a long ramp dithered into a 5/6/5 grid', () => {
  // The old pass had five swatches and four tone levels and rounded to the
  // nearest -- under three bits of colour. Measured over the four preview
  // surfaces it produced 15-58 distinct colours a frame; this produces 130-460.
  assert.ok(WINDOW_RAMP.length >= 8, `the ramp has somewhere to dither between (${WINDOW_RAMP.length} steps)`);
  assert.deepEqual({ ...WINDOW_QUANT_STEPS }, { r: 31, g: 63, b: 31 }, 'RGB565');
  const total = (WINDOW_QUANT_STEPS.r + 1) * (WINDOW_QUANT_STEPS.g + 1) * (WINDOW_QUANT_STEPS.b + 1);
  assert.equal(total, 65536, '65,536 reachable colours');

  // The ramp has to actually climb, or the extra steps are decoration.
  const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (let i = 1; i < WINDOW_RAMP.length; i += 1) {
    assert.ok(luma(WINDOW_RAMP[i]) > luma(WINDOW_RAMP[i - 1]), `ramp step ${i} is lighter than ${i - 1}`);
  }
  assert.ok(luma(WINDOW_RAMP[0]) < 0.02, 'it reaches black');
  assert.ok(luma(WINDOW_RAMP[WINDOW_RAMP.length - 1]) > 0.8, 'and something near paper');

  // The two dithers must not share a rank, or the same pattern prints twice.
  assert.match(WINDOW_SURFACE_LOOK_GLSL, /windowSurfaceLook\(vec3 rgb,float rank,float quantRank/,
    'the ramp and the quantiser take separate masks');
  assert.match(surface, /blueNoiseRank\(cellId\+vec2\(/, 'and the second is offset from the first');
});

test('the surfaces are made the way the game is made', () => {
  // The game's mesh carries a comment about this exact mistake: a palette that
  // quantises by luminance alone throws away everything the material said in
  // colour. Same fix, same two lines.
  assert.match(WINDOW_SURFACE_LOOK_GLSL, /vec3 chroma=rgb-vec3\(dot\(rgb/, "the source's chroma is taken as a residual");
  assert.match(WINDOW_SURFACE_LOOK_GLSL, /pal=clamp\(pal\+chroma\*PALETTE_CHROMA/, 'and bends the block it lands in');

  // Both numbers stay inside the ranges the game validates its own profiles
  // against, so the two images are gradeable against each other.
  assert.ok(WINDOW_PALETTE_CHROMA >= 0 && WINDOW_PALETTE_CHROMA <= 0.6, "chroma is in the game's band");
  assert.ok(WINDOW_PALETTE_AMOUNT > 0 && WINDOW_PALETTE_AMOUNT <= 1);
  // Out here the palette is the subject, so the amount is far above any game
  // profile -- and the chroma has to be correspondingly far below, or it stops
  // tinting and starts restoring the video.
  const gameAmounts = LOOK_PROFILE_IDS.map((id) => getLookProfile(id).vfd.paletteAmount);
  assert.ok(WINDOW_PALETTE_AMOUNT > Math.max(...gameAmounts), 'the palette carries the image out here');
  assert.ok(WINDOW_PALETTE_CHROMA < Math.max(...LOOK_PROFILE_IDS.map((id) => getLookProfile(id).vfd.paletteChroma)),
    'which is why the chroma is spent more carefully than in the game');

  // The cell is the game's own, so a surface sits beside the window it came out
  // of rather than shouting over it. 1.5pt is 3 device pixels at 2x.
  const gameCells = LOOK_PROFILE_IDS.map((id) => getLookProfile(id).vfd.cellPx);
  assert.ok(gameCells.includes(Math.round(WINDOW_CELL_PT * 2)), `${WINDOW_CELL_PT}pt at 2x is a cell the game uses`);
});

test('the media is sampled once per shared cell, not once per fragment', () => {
  // Pixelation is the point: without this the dither is a per-fragment shimmer
  // at device resolution and there are no pixels to see.
  assert.match(surface, /vec2 cellId=floor\(globalPt\/CELL_PT\)/, 'the cell is derived first');
  assert.match(surface, /vec2 q=crop\.xy\+cuv\*crop\.zw/, 'and the media is read through it');
  assert.equal(/vec2 q=crop\.xy\+uv\*crop\.zw/.test(surface), false, 'nothing samples raw fragment uv any more');
  // Including the transitions, or a dissolve would un-pixelate mid-cut.
  assert.equal(/texture\(outgoingImage,uv\)/.test(surface), false, 'the transitions are on the lattice too');

  // The fault grid moved into the same space; leaving it in device pixels would
  // have made the tear a different size on every display.
  assert.match(surface, /floor\(globalPt\/SECTOR_PT\)/, 'the fault sectors share the space');
  assert.ok(WINDOW_FAULT_SECTOR_PT.w > 0 && WINDOW_FAULT_SECTOR_PT.h > 0);

  // And the origin has to be converted before it is added, which is the whole
  // reason the old lattice did not work.
  assert.match(surface, /gl_FragCoord\.x,framebufferSize\.y-gl_FragCoord\.y\)\/scale\+desktopOrigin/,
    'device pixels are divided by the scale BEFORE the desktop origin is added');
  assert.match(surface, /uniform float dpr/, 'and the scale is uploaded');
});

test('while the front end is up the surfaces wear its plate, not their own', () => {
  // Four violet fragments unfolding onto a paper-white negative belong to a
  // different picture. Measured over the composited title, the desktop runs at
  // 6.4% saturation and the violet panes at 45.4%; on the plate they come down
  // to 10.2%, which is what "match the palette" means numerically.
  const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // ABSOLUTE chroma, not a ratio: the ink end is essentially black, where a
  // ratio divides by nothing and reports a fully saturated colour for a
  // difference of one 255th.
  const chroma = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);

  // Both ends are the measured plate, not a chosen grey.
  assert.deepEqual(WINDOW_FRONT_END_RAMP[0], [...WINDOW_FRONT_END_ENDS.ink].map((v) => Number(v.toFixed(4))));
  assert.deepEqual(WINDOW_FRONT_END_RAMP.at(-1), [...WINDOW_FRONT_END_ENDS.paper].map((v) => Number(v.toFixed(4))));
  assert.equal(WINDOW_FRONT_END_RAMP.length, WINDOW_RAMP.length, 'the two ramps crossfade step for step');

  // THE CAP IS THE POINT. The plate's paper end is the VFD's light ink, not
  // white -- a pane that ran to white would sit ON the desktop rather than in
  // it, which is exactly how the violet ones read.
  assert.ok(luma(WINDOW_FRONT_END_RAMP.at(-1)) < 0.58, 'the paper end stops where the desktop stops');
  assert.ok(luma(WINDOW_FRONT_END_RAMP.at(-1)) > 0.45, 'but still reaches the desktop');
  assert.ok(luma(WINDOW_RAMP.at(-1)) > luma(WINDOW_FRONT_END_RAMP.at(-1)),
    'the violet ramp is the brighter of the two, which is why it had to stand down');

  // Near-neutral, like the plate. The violet ramp is not, and must not become so.
  for (const step of WINDOW_FRONT_END_RAMP) {
    assert.ok(chroma(step) < 0.05, `${JSON.stringify(step)} is near-neutral, like the plate`);
  }
  assert.ok(Math.max(...WINDOW_RAMP.map(chroma)) > 0.2,
    'the channel keeps its own voice for the rest of the game');
  // The plate is not grey, though: it is the cool green-grey the negative
  // actually prints, green over blue over red, and the ramp has to keep that.
  const paper = WINDOW_FRONT_END_RAMP.at(-1);
  assert.ok(paper[1] > paper[2] && paper[2] > paper[0], 'green over blue over red, as measured');

  // It climbs, or the extra steps are decoration.
  for (let i = 1; i < WINDOW_FRONT_END_RAMP.length; i += 1) {
    assert.ok(luma(WINDOW_FRONT_END_RAMP[i]) > luma(WINDOW_FRONT_END_RAMP[i - 1]), `front-end step ${i} climbs`);
  }
});

test('the plate that grades the background is the one the windows are told about', () => {
  // One value, not two. The surfaces read the same `negative` r3d grades the
  // composite with, so they turn with the desktop and crossfade with it instead
  // of snapping at the boundary -- and there is no second switch to keep in step.
  assert.equal(normalizeFrontEndPlate('title').negative, 1, 'the menu is printed');
  assert.equal(normalizeFrontEndPlate('credits').negative, 1, 'so is the opening');
  assert.equal(normalizeFrontEndPlate('gameplay').negative, 0, 'play is not');

  assert.match(WINDOW_SURFACE_LOOK_GLSL, /float negative\)/, 'the look stage takes the plate');
  assert.match(WINDOW_SURFACE_LOOK_GLSL, /mix\(v\[j\],f\[j\],clamp\(negative/, 'and crossfades the two ramps with it');

  // The pane is PRINTED, not merely tinted. Borrowing the colours alone left it
  // upside down against the desktop: the night sky behind the window prints as
  // paper, while the same darkness inside the window printed as ink, and the
  // pane read as a hole punched in the picture.
  assert.match(WINDOW_SURFACE_LOOK_GLSL, /y=mix\(y,1\.-y,clamp\(negative/, 'the media is inverted with the plate');

  // The chroma bend and the raw-media mix have to stand down too, or the
  // video's own colour goes back into a grey plate and undoes the match.
  assert.match(WINDOW_SURFACE_LOOK_GLSL, /chroma\*PALETTE_CHROMA\*keep/, 'the chroma bend stands down');
  assert.match(WINDOW_SURFACE_LOOK_GLSL, /mix\(PALETTE_AMOUNT,1\.,clamp\(negative/, 'and the palette takes the whole image');
});
