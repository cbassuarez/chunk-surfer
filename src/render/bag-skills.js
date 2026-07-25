//
//  bag-skills.js
//
//  The SKILLS tab: the recorder's six modification branches as a tile tree.
//
//  This replaced a text list that nobody could read. The rules it follows come
//  from how legible skill screens actually work:
//
//    · a node has THREE unmistakable states — owned, affordable, locked — and
//      never leaves the player guessing which;
//    · a locked node says what unlocks it BY NAME, not "TIER I REQUIRED";
//    · the prerequisite chain is drawn, so a branch's depth is visible without
//      reading anything;
//    · unspent points are the loudest thing on screen, because an unspent point
//      is the only thing on this screen that is urgent;
//    · and the tile carries state, not prose. The full description lives in one
//      detail strip, so no tile is ever a paragraph.
//
//  Pure geometry + drawing. Gameplay authority (what a pin buys, what a tier
//  requires) stays in combat-progression.js.

import { uiFill, uiLine, uiStrokeRect, uiText } from './ui.js';
import { UI_COLOR } from './palette.js';
import { drawBagIcon } from './bag-icons.js';
import { drawVfdText } from './presentation.js';

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

// A move you fire in a fight, something that is simply true, or a once-a-fight
// finisher. '‹ACTIVE›' and '‹SPECIAL›' were jargon; these are sentences.
export function skillKindLabel(entry) {
  if (entry?.special) return 'ONCE PER FIGHT';
  if (entry?.active) return 'A MOVE YOU FIRE';
  return 'ALWAYS ON';
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

// Column per branch, row per tier. Sized to the region it is given, so the tree
// shrinks gracefully rather than running off the panel the way the old list did.
export function skillsTreeLayout({ region, branches, maxTier }) {
  const x0 = region.x;
  const y0 = region.y;
  const cols = Math.max(1, branches.length);
  const rows = Math.max(1, maxTier);
  // The pin count gets its own row INSIDE the region. Drawn above it, it printed
  // over the tab strip's help line.
  const headlineH = 1.6;
  // The TREE has first claim on the space, and everything else yields to it in
  // order: the detail strip shrinks, then the branch header, then tiles go to one
  // row each. Reserving a fixed four-row detail strip FIRST is what made the
  // deepest tier print over it on a short panel — a floor that forces overflow is
  // not a floor.
  const minTreeH = rows + 2;
  const detailRows = clamp(region.h - headlineH - minTreeH, 2, 4);
  const treeH = Math.max(rows, region.h - detailRows - headlineH);
  // Six columns must FIT, whatever the terminal. A minimum column width wide
  // enough for a name forced six of them off the edge of a small panel, so the
  // floor is the state mark instead: narrow tiles drop their label (see drawTile)
  // rather than the tree dropping a branch.
  const colW = Math.max(4, Math.floor(region.w / cols));
  const tileW = Math.max(3, colW - (colW >= 10 ? 2 : 1));
  // Icon + branch name above the tiers; the header gives up its rows before the
  // tiles do, because a tier you cannot see is worse than a column you must read.
  const slack = treeH - rows;
  const headerH = treeH >= 14 ? 3 : slack >= 2 ? 2 : slack >= 1 ? 1 : 0;
  const treeTop = y0 + headlineH;
  // Fractional, and never clamped UPWARD. A one-row tile still carries its state
  // mark and, if the column is wide enough, its name.
  const tileH = clamp((treeH - headerH) / rows, 1, 4);
  return {
    x: x0, y: y0, w: region.w, h: region.h,
    cols, rows, colW, tileW, tileH, headerH,
    treeH, treeTop,
    headline: { x: x0, y: y0 },
    detail: { x: x0, y: treeTop + treeH, w: region.w, h: detailRows },
    columnX: (index) => x0 + index * colW,
    tileY: (tier) => treeTop + headerH + (tier - 1) * tileH,
  };
}

// The three states, named once so the view and the tests agree.
export const SKILL_STATE = Object.freeze({
  OWNED: 'owned',
  AFFORDABLE: 'affordable',
  LOCKED: 'locked',
});

export function skillState({ owned, enabled }) {
  if (owned) return SKILL_STATE.OWNED;
  return enabled ? SKILL_STATE.AFFORDABLE : SKILL_STATE.LOCKED;
}

const STATE_ROLE = Object.freeze({
  [SKILL_STATE.OWNED]: 'ui-counter',
  [SKILL_STATE.AFFORDABLE]: 'ui-amber',
  [SKILL_STATE.LOCKED]: 'ui-secondary',
});
const STATE_MARK = Object.freeze({
  [SKILL_STATE.OWNED]: '●',
  [SKILL_STATE.AFFORDABLE]: '+',
  [SKILL_STATE.LOCKED]: '·',
});

function fit(text, width) {
  const s = String(text ?? '');
  const w = Math.max(1, Math.floor(width));
  return s.length <= w ? s : `${s.slice(0, Math.max(1, w - 1))}…`;
}

// One tile. State first (colour + mark + fill), then the name, then nothing else
// — a tile that tries to be a paragraph is the thing this screen is replacing.
function drawTile(entry, box, { selected }) {
  const role = STATE_ROLE[entry.state] || 'ui-secondary';
  const owned = entry.state === SKILL_STATE.OWNED;
  const affordable = entry.state === SKILL_STATE.AFFORDABLE;
  uiFill(box.x, box.y, box.w, box.h,
    owned ? 'rgba(255,181,54,0.20)' : affordable ? 'rgba(255,181,54,0.07)' : 'rgba(255,255,255,0.025)');
  uiStrokeRect(box.x, box.y, box.w, box.h, owned || affordable ? UI_COLOR.amber : UI_COLOR.frame,
    owned ? .85 : affordable ? .55 : .22, 1);
  if (selected) uiStrokeRect(box.x - .3, box.y - .18, box.w + .6, box.h + .36, UI_COLOR.primary, .9, 1);

  const mark = STATE_MARK[entry.state] || '·';
  // Too narrow for a name: the mark alone, centred. Still three readable states.
  if (box.w < 8) {
    uiText(box.x + Math.max(0, (box.w - 1) / 2), box.y + .2, mark, role, owned ? 1 : affordable ? .95 : .55);
    return;
  }
  uiText(box.x + .5, box.y + .2, mark, role, owned ? 1 : affordable ? .95 : .5);
  uiText(box.x + 2, box.y + .2, fit(entry.label, box.w - 2.5), role, selected ? 1 : owned ? .92 : affordable ? .85 : .45);
  // A second line only when the tile is tall enough to hold one without crowding.
  if (box.h >= 3) {
    uiText(box.x + 2, box.y + 1.2, fit(skillKindLabel(entry), box.w - 2.5), 'ui-secondary', selected ? .8 : .45);
  }
}

export function drawSkillsSection({ model, layout, selectedId, now = 0 }) {
  const section = model?.sections?.find((s) => s.id === 'skills');
  if (!section) return;
  const { branches, maxTier, pins } = section.tree;
  const tree = skillsTreeLayout({ region: layout, branches, maxTier });

  // ── the pins, loudest thing here ──────────────────────────────────────────
  // An unspent pin is the only urgent thing on this screen, so it is the only
  // thing drawn as VFD text.
  const headline = pins.unspent
    ? `${pins.unspent} PIN${pins.unspent === 1 ? '' : 'S'} TO SPEND`
    : pins.earned ? 'ALL PINS SPENT' : 'NO PINS YET';
  drawVfdText(tree.headline.x, tree.headline.y, headline, { scale: 1, theme: 'amber', alpha: pins.unspent ? 1 : .55 });
  if (!pins.earned) {
    uiText(tree.headline.x + headline.length + 2, tree.headline.y + .1,
      fit('WIN A FIGHT, OR SEARCH THE ATRIUM, THE GALLERY AND THE TOWER', tree.w - headline.length - 3),
      'ui-secondary', .6);
  }

  branches.forEach((branch, index) => {
    const cx = tree.columnX(index);
    // The branch's own icon, so a column is identifiable without reading it.
    drawBagIcon(BRANCH_ICON[branch.id] || 'unknown', cx + .5, tree.treeTop - .1, {
      w: Math.min(6, Math.max(3, tree.tileW - 1)), h: 2,
      state: branch.entries.some((e) => e.state === SKILL_STATE.OWNED) ? 'active' : 'dim',
      alpha: .95,
    });
    uiText(cx + .5, tree.treeTop + 2, fit(BRANCH_LABEL[branch.id] || branch.id.toUpperCase(), tree.tileW),
      branch.entries.some((e) => e.state === SKILL_STATE.OWNED) ? 'ui-amber' : 'ui-label', .8);

    branch.entries.forEach((entry) => {
      const y = tree.tileY(entry.tier);
      const box = { x: cx + .5, y, w: tree.tileW, h: Math.max(1, tree.tileH - .35) };
      // The chain, drawn. A player should see how deep a path goes without
      // reading a word of it.
      if (entry.tier > 1) {
        const prevBottom = tree.tileY(entry.tier - 1) + Math.max(1, tree.tileH - .35);
        uiLine(box.x + 1.2, prevBottom, box.x + 1.2, y, UI_COLOR.frame,
          entry.state === SKILL_STATE.LOCKED ? .25 : .6);
      }
      drawTile(entry, box, { selected: entry.id === selectedId });
    });
  });

  // ── the detail strip ──────────────────────────────────────────────────────
  const selected = branches.flatMap((b) => b.entries).find((e) => e.id === selectedId);
  const d = tree.detail;
  uiLine(d.x, d.y - .4, d.x + d.w, d.y - .4, UI_COLOR.frame, .3);
  if (!selected) return;
  uiText(d.x, d.y, fit(`${BRANCH_LABEL[selected.branch] || selected.branch} · ${selected.label} · ${skillKindLabel(selected)}`, d.w), 'ui-blue', .85);
  uiText(d.x, d.y + 1, fit(selected.detail, d.w), 'ui-primary', .9);
  // What to do about it, in the imperative, including WHY not.
  const call = selected.state === SKILL_STATE.OWNED ? 'FITTED · LOCKED IN FOR THIS RUN'
    : selected.state === SKILL_STATE.AFFORDABLE ? `SPEND A PIN ON THIS · ${selected.buyPrompt}`
      : selected.blockedBy;
  uiText(d.x, d.y + 2, fit(call, d.w),
    selected.state === SKILL_STATE.OWNED ? 'ui-counter' : selected.state === SKILL_STATE.AFFORDABLE ? 'ui-amber' : 'ui-danger', .9);
  void now;
}
