//
//  bag-skills.js
//
//  The SKILLS tab: the recorder's six modification branches as a tile tree.
//
//  This replaced a text list that nobody could read. The rules it follows come
//  from how legible skill screens actually work:
//
//    · a node has FOUR unmistakable states — installed, chosen, available,
//      locked — and
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

import { uiFill, uiLine, uiStrokeRect, uiText, uiWrap } from './ui.js';
import { UI_COLOR } from './palette.js';
import { drawBagIcon } from './bag-icons.js';
import { drawVfdText } from './presentation.js';
import { fitText } from './fit-text.js';

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
  const detailRows = clamp(region.h - headlineH - minTreeH, 3, 6);
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

const STATE_ROLE = Object.freeze({
  [SKILL_STATE.OWNED]: 'ui-green',
  [SKILL_STATE.PENDING]: 'ui-amber',
  [SKILL_STATE.AFFORDABLE]: 'ui-amber',
  [SKILL_STATE.LOCKED]: 'ui-secondary',
});
const STATE_MARK = Object.freeze({
  [SKILL_STATE.OWNED]: '◆',
  // A PLAIN ASCII MARK, ON PURPOSE.
  //
  // This was '◈' and rendered as nothing at all: uiGlyph fails SILENTLY on a
  // codepoint the atlas cannot rasterise — right cell, right colour, no pixels —
  // which is the same trap map-icons.js documents and dodges by drawing its
  // lozenge as real geometry. So PATCHED and NEW, two of the four states this
  // screen promises are unmistakable, were a filled diamond and a blank.
  // '◉' turned out to be missing too. '+' is in every face there is, and a new
  // connection is what it looks like.
  [SKILL_STATE.PENDING]: '+',
  [SKILL_STATE.AFFORDABLE]: '◇',
  [SKILL_STATE.LOCKED]: '·',
});
const STATE_LABEL = Object.freeze({
  [SKILL_STATE.OWNED]: 'PATCHED',
  [SKILL_STATE.PENDING]: 'PATCHED · NEW',
  [SKILL_STATE.AFFORDABLE]: 'OPEN',
  [SKILL_STATE.LOCKED]: 'NO REACH',
});

const fit = (text, width) => fitText(text, Math.max(1, Math.floor(width)));

// One tile. State first (colour + mark + fill), then the name, then nothing else
// — a tile that tries to be a paragraph is the thing this screen is replacing.
function drawTile(entry, box, { selected }) {
  const role = STATE_ROLE[entry.state] || 'ui-secondary';
  const owned = entry.state === SKILL_STATE.OWNED;
  const pending = entry.state === SKILL_STATE.PENDING;
  const affordable = entry.state === SKILL_STATE.AFFORDABLE;
  uiFill(box.x, box.y, box.w, box.h,
    owned ? 'rgba(65,173,135,0.14)'
      : pending ? 'rgba(255,181,54,0.24)'
        : affordable ? 'rgba(255,181,54,0.07)'
          : 'rgba(255,255,255,0.025)');
  uiStrokeRect(box.x, box.y, box.w, box.h,
    owned ? UI_COLOR.green : pending || affordable ? UI_COLOR.amber : UI_COLOR.frame,
    owned ? .58 : pending ? .95 : affordable ? .48 : .20, pending ? 1.5 : 1);
  if (selected) {
    uiStrokeRect(box.x - .35, box.y - .22, box.w + .7, box.h + .44, UI_COLOR.primary, .95, 1.4);
    uiLine(box.x - .35, box.y - .22, box.x + Math.min(4, box.w * .45), box.y - .22, UI_COLOR.amber, 1, 2);
  }

  const mark = STATE_MARK[entry.state] || '·';
  // Too narrow for a name: the mark alone, centred. Still four readable states.
  if (box.w < 8) {
    uiText(box.x + Math.max(0, (box.w - 1) / 2), box.y + .2, mark, role, owned || pending ? 1 : affordable ? .95 : .55);
    return;
  }
  uiText(box.x + .5, box.y + .2, mark, role, owned || pending ? 1 : affordable ? .95 : .5);
  uiText(box.x + 2, box.y + .2, fit(entry.label, box.w - 2.5), role,
    selected ? 1 : owned || pending ? .92 : affordable ? .85 : .45);
  if (box.w >= 12) uiText(box.x + box.w - 2.3, box.y + .2, `T${entry.tier}`, 'ui-label', selected ? .68 : .36);
  // Ownership gets the second line. Capability is kept in the detail card so
  // PASSIVE EFFECT can never read like proof that something was purchased.
  if (box.h >= 3) {
    uiText(box.x + 2, box.y + 1.2, fit(STATE_LABEL[entry.state], box.w - 2.5), role,
      selected ? .85 : owned || pending ? .68 : .42);
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
  const moved = pins.pending ? ` · ${pins.pending} NEW` : pins.pulled ? ` · ${pins.pulled} PULLED` : '';
  const headline = pins.unspent
    ? `${pins.unspent} LEAD${pins.unspent === 1 ? '' : 'S'} SPARE${moved}`
    : pins.pending ? `${pins.pending} NEW · TAKES EFFECT WHEN THE CASE CLOSES`
      : pins.earned ? 'EVERY LEAD PATCHED' : 'NO LEADS YET';
  const headlinePrint = fit(headline, tree.w);
  drawVfdText(tree.headline.x, tree.headline.y, headlinePrint, { scale: 1, theme: 'amber', alpha: pins.unspent || pins.pending ? 1 : .55 });
  if (!pins.earned) {
    uiText(tree.headline.x + headlinePrint.length + 2, tree.headline.y + .1,
      fit('WIN A FIGHT, OR SEARCH THE ATRIUM, THE GALLERY AND THE TOWER', tree.w - headlinePrint.length - 3),
      'ui-secondary', .6);
  }

  branches.forEach((branch, index) => {
    const cx = tree.columnX(index);
    if (tree.headerH >= 2) {
      uiFill(cx + .15, tree.treeTop - .2, tree.tileW + .7, Math.max(1.8, tree.headerH - .15), 'rgba(255,255,255,0.018)');
      uiStrokeRect(cx + .15, tree.treeTop - .2, tree.tileW + .7, Math.max(1.8, tree.headerH - .15), UI_COLOR.frame, .18, 1);
    }
    // The branch's own icon, so a column is identifiable without reading it.
    drawBagIcon(BRANCH_ICON[branch.id] || 'unknown', cx + .5, tree.treeTop - .1, {
      w: Math.min(6, Math.max(3, tree.tileW - 1)), h: 2,
      state: branch.entries.some((e) => e.state === SKILL_STATE.OWNED || e.state === SKILL_STATE.PENDING) ? 'active' : 'dim',
      alpha: .95,
    });
    uiText(cx + .5, tree.treeTop + 2, fit(BRANCH_LABEL[branch.id] || branch.id.toUpperCase(), tree.tileW),
      branch.entries.some((e) => e.state === SKILL_STATE.OWNED || e.state === SKILL_STATE.PENDING) ? 'ui-amber' : 'ui-label', .8);

    branch.entries.forEach((entry) => {
      const y = tree.tileY(entry.tier);
      const box = { x: cx + .5, y, w: tree.tileW, h: Math.max(1, tree.tileH - .35) };
      // THE CABLE.
      //
      // It runs where the signal runs, which is where a prerequisite is — never
      // simply between one tier and the next. Four sockets sit under another
      // and are not fed by it (ROOM TONE, HEADROOM, and the first two rungs of
      // NERVE, which are patched direct), and this used to draw a line into all
      // four. Green when the run carries, amber while it is new this session,
      // and a dark frame line when the socket is open.
      if (entry.lead) {
        const from = tree.tileY(entry.lead.fromTier) + Math.max(1, tree.tileH - .35);
        uiLine(box.x + 1.2, from, box.x + 1.2, y,
          entry.lead.fresh ? UI_COLOR.amber : entry.lead.live ? UI_COLOR.green : UI_COLOR.frame,
          entry.lead.fresh ? .95 : entry.lead.live ? .58 : .18,
          entry.lead.fresh ? 1.4 : 1);
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
  const descriptionRows=Math.max(1,d.h-3);
  uiWrap(selected.detail,Math.max(8,Math.floor(d.w))).slice(0,descriptionRows)
    .forEach((line,index)=>uiText(d.x,d.y+1+index,fit(line,d.w),'ui-primary',.9));
  // What to do about it, in the imperative, including WHY not.
  // A pull says what it costs BEFORE the confirm does, because most pulls never
  // reach a confirm: only one that takes the run below it does.
  const pulls = selected.pulls?.length || 0;
  const call = selected.state === SKILL_STATE.OWNED || selected.state === SKILL_STATE.PENDING
    ? (pulls > 1
        ? `[ENTER] PULL LEAD · ${pulls} BACK · DROPS ${selected.pulls.slice(1).join(', ')}`
        : `[ENTER] PULL LEAD · 1 BACK`)
    : selected.state === SKILL_STATE.AFFORDABLE
      ? `[ENTER] PATCH · 1 LEAD · ${pins.unspent} SPARE · ${selected.buyPrompt}`
      : selected.blockedBy;
  uiText(d.x, d.y + d.h - 2, fit(call, d.w),
    selected.state === SKILL_STATE.OWNED ? 'ui-green'
      : selected.state === SKILL_STATE.PENDING || selected.state === SKILL_STATE.AFFORDABLE ? 'ui-amber' : 'ui-danger', .9);
  uiText(d.x,d.y+d.h-1,fit('◆ PATCHED   + NEW   ◇ OPEN   · NO REACH',d.w),'ui-label',.62);
  void now;
}
