// The skills screen is a live patch rack: fixed input jacks, outputs only on
// installed modules, and only the leads which actually exist in the build.
// This module owns cell-space geometry and material drawing, not purchases.
import { uiCellMetrics, uiDraw, uiFill, uiLine, uiStrokeRect, uiText, uiWrap } from './ui.js';
import { UI_COLOR } from './palette.js';
import { drawPrintedText } from './keycap.js';
import { drawVfdText } from './presentation.js';
import { fitText } from './fit-text.js';
import { PATCH_COLORS, drawPatchRack, drawPatchSocket, drawPatchCable, drawPatchLabel } from './patchbay-material.js';

// Which existing kit icon stands for each branch. Five were already drawn for
// the KIT tab; `nerve` is the one addition (see bag-icons.js).
export const BRANCH_ICON = Object.freeze({
  torch: 'light',
  recorder: 'recorder',
  rig: 'interface',
  nerve: 'nerve',
  fork: 'tuning-fork',
  radio: 'radio',
});

export const BRANCH_LABEL = Object.freeze({
  torch: 'TORCH',
  recorder: 'RECORDER',
  rig: 'BENT RIG',
  nerve: 'NERVE',
  fork: 'FORK',
  radio: 'RADIO',
});

// Capability belongs in the detail card, not the node's ownership badge.
// SPECIAL is the word the fight itself uses — it is on the move tile and in the
// charge readout — so it is the word here too. There used to be a distinction
// between a 'manual technique' and a 'signature move', which meant the
// difference between an active you could use freely and a finisher you got once
// per encounter. Nothing is once per encounter any more: a special is a special,
// and what separates it from a regular is that it costs charge.
export function skillKindLabel(entry) {
  if (entry?.special) return 'SPECIAL · COSTS CHARGE';
  if (entry?.active) return 'MANUAL TECHNIQUE';
  return 'PASSIVE EFFECT';
}

// One colour-coded channel per branch, one actual rack strip per tier. There
// is no cable topology for an uninstalled module. `hit` boxes deliberately
// exceed the nickel mouth: a 12px jack is still a practical pointer target.
export function patchBayLayout({ region, branches = [], maxTier = 1 }) {
  const x0 = region.x;
  const y0 = region.y;
  const cols = Math.max(1, branches.length);
  const rows = Math.max(1, maxTier);
  const headlineH = Math.min(1.55, region.h * .12);
  const detailRows = Math.min(4.2, Math.max(3.2, region.h * .18));
  const treeH = Math.max(1, region.h - headlineH - detailRows);
  const colW = region.w / cols;
  const tileW = Math.max(3, colW - 1.1);
  const headerH = Math.min(2.25, treeH * .18);
  const treeTop = y0 + headlineH;
  const tileH = Math.max(.4, (treeH - headerH) / rows);
  const aspect = uiCellMetrics().aspect;
  const visualRY = Math.min(.33, tileH * .17, colW * aspect * .095);
  const hitH = Math.min(1.2, tileH * .78);
  const hitW = Math.min(colW * .42, hitH / aspect);
  const socket = ({ id, branch, x, y, kind, entry = null, rowTop, rowH }) => ({
    id, branch, x, y, kind, skillId: entry?.id || null,
    techniqueId: entry?.techniqueId || null,
    r: visualRY, rX: visualRY / aspect, rY: visualRY,
    w: hitW, h: hitH,
    hit: { x: x - hitW / 2, y: Math.min(y - hitH / 2, rowTop + rowH - hitH - .015), w: hitW, h: hitH },
  });
  const result = {
    x: x0, y: y0, w: region.w, h: region.h,
    cols, rows, colW, tileW, tileH, headerH,
    treeH, treeTop,
    headline: { x: x0, y: y0 },
    returnZone: { x: x0 + Math.max(0, region.w - 19), y: y0, w: Math.min(19, region.w), h: headlineH },
    detail: { x: x0, y: treeTop + treeH, w: region.w, h: detailRows },
    columnX: (index) => x0 + index * colW,
    tileY: (tier) => treeTop + headerH + (tier - 1) * tileH,
    sources: [], nodes: [], inputs: [], outputs: [], sockets: [], cables: [],
  };
  for (const [index, branch] of branches.entries()) {
    const x = result.columnX(index);
    const source = socket({ id: `supply:${branch.id}`, branch: branch.id,
      x: x + colW * .28, y: treeTop + headerH * .68, kind: 'output', rowTop: treeTop, rowH: headerH });
    result.sources.push(source);
    for (const entry of branch.entries) {
      const y = result.tileY(entry.tier);
      const bounds = { x: x + .55, y: y + .08, w: tileW, h: Math.max(.3, tileH - .13) };
      const input = socket({ id: `input:${entry.id}`, entry, branch: branch.id,
        x: x + colW * .28, y: y + tileH * .76, kind: 'input', rowTop: y, rowH: tileH });
      const installed = entry.owned || entry.pending || ['owned', 'pending'].includes(entry.state);
      const output = installed ? socket({ id: `output:${entry.id}`, entry, branch: branch.id,
        x: x + colW * .72, y: input.y, kind: 'output', rowTop: y, rowH: tileH }) : null;
      result.nodes.push({ id: entry.id, entryId: entry.id, techniqueId: entry.techniqueId,
        entry, branch: branch.id, ...bounds, bounds, input, output });
      result.inputs.push(input);
      if (output) result.outputs.push(output);
    }
  }
  for (const node of result.nodes) {
    if (!node.output) continue;
    const upstream = node.entry.lead
      ? result.nodes.find((other) => other.branch === node.branch && other.entry.tier === node.entry.lead.fromTier)?.output
      : result.sources.find((source) => source.branch === node.branch);
    if (upstream) result.cables.push({ id: `lead:${node.id}`, skillId: node.id,
      branch: node.branch, from: upstream, to: node.input, fresh: !!node.entry.pending });
  }
  result.sockets = [...result.sources, ...result.inputs, ...result.outputs];
  return result;
}

// Kept as a geometry compatibility export for navigation consumers and old
// saves/tests; the live presentation is a patch bay, never a button tile tree.
export const skillsTreeLayout = patchBayLayout;

// The four states, named once so the view and the tests agree.
export const SKILL_STATE = Object.freeze({
  OWNED: 'owned',
  PENDING: 'pending',
  AFFORDABLE: 'affordable',
  LOCKED: 'locked',
});

export function skillState({ owned, pending, enabled }) {
  if (pending) return SKILL_STATE.PENDING;
  if (owned) return SKILL_STATE.OWNED;
  return enabled ? SKILL_STATE.AFFORDABLE : SKILL_STATE.LOCKED;
}

const fit = (text, width) => fitText(text, Math.max(1, Math.floor(width)));

// Public legacy print-metrics helper retained for old hardware callers. Patch
// labels below use fixed service tape rather than a moving plastic cap.
export function skillCapPrintLayout(label, face, { cellW = 8.45, cellH = 20 } = {}) {
  const text = String(label || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const serviceH = Math.min(.35, face.h * .2);
  const nameY = face.y + serviceH + .06;
  const nameH = Math.max(0, face.h - serviceH - .06);
  const lineH = Math.min(.68, nameH / 2);
  const width = Math.max(0, face.w - .16);
  const approxFontPx = lineH * cellH * .91;
  const maxChars = Math.max(5, Math.floor(width * cellW / Math.max(1, approxFontPx * .64)));
  let names = [text];
  const words = text.split(' ');
  if (text.length > maxChars && words.length > 1) {
    let best = null;
    for (let cut = 1; cut < words.length; cut += 1) {
      const lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
      const score = Math.max(...lines.map((line) => line.length)) + Math.abs(lines[0].length - lines[1].length) * .15;
      if (!best || score < best.score) best = { lines, score };
    }
    names = best.lines;
  }
  const firstY = nameY + (nameH - names.length * lineH) / 2;
  return {
    compact: face.h * cellH < 24 || width * cellW < 45,
    service: { x: face.x + .08, y: face.y, w: width, h: serviceH },
    lines: names.map((name, index) => ({ text: name, x: face.x + .08, y: firstY + index * lineH, w: width, h: lineH })),
  };
}

// Historical name retained for narrow consumers: this now prints a fixed,
// removable service tape. It draws no cap, glow, latch or clickable rectangle.
function drawTile(entry, box, { selected }) {
  const face = { x: box.x + .45, y: box.y + .16, w: Math.max(1, box.w - .9), h: Math.min(1.02, box.h * .44) };
  const compact = face.h < .55 || face.w < 6.8;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    drawPatchLabel(ctx, face.x * cellW * dpr, face.y * cellH * dpr,
      face.w * cellW * dpr, face.h * cellH * dpr, { dpr, selected });
  });
  if (compact) {
    drawPrintedText(face.x + .2, face.y, `${entry.tier} ${entry.label}`, {
      w: face.w - .4, h: face.h, ink: '#22291f', alpha: .96, align: 'center',
    });
    return;
  }
  const words = String(entry.label).split(' ');
  let names = [entry.label];
  if (entry.label.length > 13 && words.length > 1) {
    let score = Infinity;
    for (let i = 1; i < words.length; i++) {
      const split = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
      const next = Math.max(...split.map((name) => name.length));
      if (next < score) { score = next; names = split; }
    }
  }
  const nameH = Math.min(.52, face.h / names.length);
  names.forEach((name, index) => drawPrintedText(face.x + .2,
    face.y + (face.h - nameH * names.length) / 2 + index * nameH, name,
    { w: face.w - .4, h: nameH, ink: '#22291f', align: 'center', alpha: .97 }));
}

export function drawSkillsSection({ model, layout, selectedId, now = 0, patchDrag = null }) {
  const section = model?.sections?.find((s) => s.id === 'skills');
  if (!section) return;
  const { branches, maxTier, pins } = section.tree;
  const tree = patchBayLayout({ region: layout, branches, maxTier });

  // ── the pins, loudest thing here ──────────────────────────────────────────
  // An unspent pin is the only urgent thing on this screen, so it is the only
  // thing drawn as VFD text.
  const moved = pins.pending ? ` · ${pins.pending} NEW` : pins.pulled ? ` · ${pins.pulled} PULLED` : '';
  const headline = pins.unspent
    ? `${pins.unspent} LEAD${pins.unspent === 1 ? '' : 'S'} SPARE${moved}`
    : pins.pending ? `${pins.pending} NEW · TAKES EFFECT WHEN THE CASE CLOSES`
      : pins.earned ? 'EVERY LEAD PATCHED' : 'NO LEADS YET';
  const headlinePrint = fit(headline, Math.max(1, tree.w - tree.returnZone.w - 1));
  drawVfdText(tree.headline.x, tree.headline.y, headlinePrint, { scale: 1, theme: 'amber', alpha: pins.unspent || pins.pending ? 1 : .55 });
  const returnHover = patchDrag?.returnable && patchDrag?.valid
    && patchDrag.to?.x >= tree.returnZone.x && patchDrag.to?.x <= tree.returnZone.x + tree.returnZone.w
    && patchDrag.to?.y >= tree.returnZone.y && patchDrag.to?.y <= tree.returnZone.y + tree.returnZone.h;
  uiFill(tree.returnZone.x, tree.returnZone.y, tree.returnZone.w, tree.returnZone.h - .2, '#171d18');
  uiStrokeRect(tree.returnZone.x, tree.returnZone.y, tree.returnZone.w, tree.returnZone.h - .2,
    returnHover ? '#d7d6b1' : '#535e4c', returnHover ? 1 : .62, 1);
  drawPrintedText(tree.returnZone.x + .5, tree.returnZone.y + .1, 'SPARES / RETURN LEAD', {
    w: tree.returnZone.w - 1, h: .7, ink: '#b7bca6', finish: 'faceplate', align: 'center',
  });

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = (x) => x * cellW * dpr, py = (y) => y * cellH * dpr;
    const point = (socket) => ({ x: px(socket.x), y: py(socket.y) });
    ctx.save();
    // A lifted lead is confined to the case. It cannot scribble over a HUD,
    // document, or the selected module's prose beneath the rack.
    ctx.beginPath(); ctx.rect(px(tree.x), py(tree.treeTop), px(tree.w), py(tree.treeH - .08)); ctx.clip();
    drawPatchRack(ctx, px(tree.x), py(tree.treeTop), px(tree.w), py(tree.headerH - .08), { dpr, seed: 'supply' });
    for (let tier = 1; tier <= maxTier; tier++) {
      drawPatchRack(ctx, px(tree.x), py(tree.tileY(tier)), px(tree.w), py(tree.tileH - .08), { dpr, seed: `tier:${tier}` });
    }
    for (const node of tree.nodes) {
      const color = PATCH_COLORS[node.branch];
      const compatible = patchDrag?.compatibleIds?.some((id) => id === node.id || id === node.techniqueId || id === node.input.id);
      drawPatchSocket(ctx, px(node.input.x), py(node.input.y), py(node.input.rY), {
        color, connected: !!node.output, selected: node.id === selectedId,
        compatible, available: node.entry.enabled || !!node.output, dpr,
      });
      if (node.output) drawPatchSocket(ctx, px(node.output.x), py(node.output.y), py(node.output.rY), { color, dpr });
    }
    for (const source of tree.sources) drawPatchSocket(ctx, px(source.x), py(source.y), py(source.rY), {
      color: PATCH_COLORS[source.branch], available: pins.unspent > 0, dpr,
      compatible: !!patchDrag && patchDrag.from.branch === source.branch,
    });
    for (const cable of tree.cables) {
      if (patchDrag?.rerouteId === cable.skillId || patchDrag?.rerouteId === cable.to.techniqueId) continue;
      drawPatchCable(ctx, point(cable.from), point(cable.to), {
        color: PATCH_COLORS[cable.branch], dpr, radius: py(cable.to.rY),
        side: 1, sag: Math.min(py(tree.tileH * .43), 26 * dpr),
      });
    }
    ctx.restore();
    if (patchDrag?.from && patchDrag?.to) {
      // Drag preview may reach the return tray above the rack, but remains
      // clipped to the complete skills region rather than the game world.
      ctx.save(); ctx.beginPath(); ctx.rect(px(tree.x), py(tree.y), px(tree.w), py(tree.h)); ctx.clip();
      drawPatchCable(ctx, point(patchDrag.from), point(patchDrag.to), {
        color: PATCH_COLORS[patchDrag.from.branch], dpr, preview: true,
        valid: patchDrag.valid, radius: py(tree.nodes[0]?.input.rY || .3),
      });
      ctx.restore();
    }
  });
  // Label tape is mounted ahead of each cable gutter, keeping the identifying
  // words readable even in a densely patched run. Blank tiers stay blank metal.
  for (const [index, branch] of branches.entries()) {
    const x = tree.columnX(index);
    drawPrintedText(x + 1, tree.treeTop + .05, BRANCH_LABEL[branch.id] || branch.id.toUpperCase(), {
      w: tree.colW - 2, h: Math.min(.64, tree.headerH * .32), ink: PATCH_COLORS[branch.id],
      finish: 'faceplate', align: 'center', alpha: .96,
    });
    const source = tree.sources[index];
    drawPrintedText(source.x + source.rX + .7, source.y - .18, 'SEND', {
      w: Math.max(1, tree.colW * .55 - source.rX - 1.4), h: .36,
      ink: '#a4ae98', finish: 'faceplate', alpha: .78,
    });
  }
  for (const node of tree.nodes) {
    drawTile(node.entry, node.bounds, { selected: node.id === selectedId });
    if (tree.tileH > 1.5) {
      drawPrintedText(node.input.x + node.input.rX + .4, node.input.y - .2, 'IN', {
        w: 1.5, h: .34, ink: '#a4ae98', finish: 'faceplate', alpha: .7,
      });
      if (node.output) drawPrintedText(node.output.x + node.output.rX + .35, node.output.y - .2, 'OUT', {
        w: Math.min(2, tree.colW * .27 - node.output.rX - .4), h: .34,
        ink: '#a4ae98', finish: 'faceplate', alpha: .75,
      });
    }
  }

  // ── the detail strip ──────────────────────────────────────────────────────
  const selected = branches.flatMap((b) => b.entries).find((e) => e.id === selectedId);
  const d = tree.detail;
  uiLine(d.x, d.y - .4, d.x + d.w, d.y - .4, UI_COLOR.frame, .3);
  if (!selected) return;
  uiText(d.x, d.y, fit(`${BRANCH_LABEL[selected.branch] || selected.branch} · ${selected.label} · ${skillKindLabel(selected)}`, d.w), 'ui-blue', .85);
  const descriptionRows=Math.max(1,Math.floor(d.h-2));
  uiWrap(selected.detail,Math.max(8,Math.floor(d.w))).slice(0,descriptionRows)
    .forEach((line,index)=>uiText(d.x,d.y+1+index,fit(line,d.w),'ui-primary',.9));
  // What to do about it, in the imperative, including WHY not.
  // A pull says what it costs BEFORE the confirm does, because most pulls never
  // reach a confirm: only one that takes the run below it does.
  const pulls = selected.pulls?.length || 0;
  const call = selected.state === SKILL_STATE.OWNED || selected.state === SKILL_STATE.PENDING
    ? (pulls > 1
        ? `DRAG INPUT TO REPATCH / SPARES · ${pulls} LEADS IN THIS RUN`
        : 'DRAG INPUT TO REPATCH / SPARES · 1 LEAD BACK')
    : selected.state === SKILL_STATE.AFFORDABLE
      ? `DRAG MATCHING SEND TO INPUT · 1 LEAD · ${pins.unspent} SPARE`
      : selected.blockedBy;
  uiText(d.x, d.y + d.h - 1, fit(call, d.w),
    selected.state === SKILL_STATE.OWNED ? 'ui-green'
      : selected.state === SKILL_STATE.PENDING || selected.state === SKILL_STATE.AFFORDABLE ? 'ui-amber' : 'ui-danger', .9);
  void now;
}
