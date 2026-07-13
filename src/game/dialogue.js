// Dialogue runtime.
//
// Node shape (see data/script-schema.md):
//   { speaker, portrait, register, lines:[...], choices:[...],
//     if, set:[], clear:[], effects:[] }
// A line is either a string, or { text } / { direction } / { fx }.
//   text      — spoken, typewritten
//   direction — a visible stage direction. The mediation moves into the
//               dialogue itself; the game narrates its own conventions.
//
// Registers (the engine features the narrative needs):
//   straight  — plain
//   ironic    — choices carry marginal asides
//   decay     — revisiting a node elides/strikes lines it already spoke
//   exhausted — the typewriter completes your choice before you pick it
//
// Everything here is mechanism. The prose lives in src/data/*.js.

import * as scenes from './scenes.js';
import { flagTest, flagApply, flagGet, flagBump } from './flags.js';
import { uiText, uiWrap, uiGlyph, uiSize, uiScrim } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { portrait, degrade } from '../render/portraits.js';
import { textCps } from './access.js';
import { drawStoryArtCard, planStoryArtInPanel, planStoryArtSideBySide, storyArtRows, storyArtSideBySidePanelRows } from './story-art-card.js';
import { resolveStoryArt } from './story-art.js';
import { interpolate } from './terror.js';

const PORTRAIT_W = 22, PORTRAIT_H = 13;

let script = {};            // id -> node
let effectHandler = () => {};
let blipHandler = () => {};

export function dialogueInit({ effects, blip } = {}) {
  if (effects) effectHandler = effects;
  if (blip) blipHandler = blip;
}
export function loadScript(nodes) { Object.assign(script, nodes); }
export function getNode(id) { return script[id]; }

// How many times each node has been played this run — drives `decay`.
function visits(id) { return Number(flagGet(`__seen.${id}`)) || 0; }

export function startDialogue(nodeId) {
  const node = script[nodeId];
  if (!node) { console.warn('dialogue: no node', nodeId); return null; }
  if (!flagTest(node.if)) return null;
  return scenes.push(makeDialogueScene(nodeId));
}

function visibleLines(node, id) {
  const seen = visits(id);
  const out = [];
  for (let i = 0; i < node.lines.length; i++) {
    const raw = node.lines[i];
    const src = typeof raw === 'string' ? { text: raw } : raw;
    if (src.if && !flagTest(src.if)) continue;
    // {steps} / {minutes} / {runs} — the save file, quoted back at the player
    const line = { ...src };
    if (line.text != null) line.text = interpolate(line.text);
    if (line.direction != null) line.direction = interpolate(line.direction);
    // decay: on each revisit another line has already been said, and is not
    // said again. What remains is the residue of a conversation.
    if (node.register === 'decay' && seen > 0 && i < Math.min(seen, node.lines.length - 1)) {
      out.push({ ...line, struck: true });
      continue;
    }
    out.push(line);
  }
  return out;
}

function makeDialogueScene(nodeId) {
  const node = script[nodeId];
  const lines = visibleLines(node, nodeId);
  const cps = () => textCps(42);

  let li = 0;             // line index
  let chars = 0;          // typed characters of the current line
  let done = false;       // all lines shown; choices (if any) active
  let choiceIdx = 0;
  let acc = 0;

  const choices = () => (node.choices || []).filter((c) => flagTest(c.if));

  function advance() {
    const line = lines[li];
    const full = String(line.text ?? line.direction ?? '');
    if (chars < full.length) { chars = full.length; return; }   // reveal all
    if (li < lines.length - 1) { li++; chars = 0; return; }
    if (choices().length) { done = true; return; }
    finish();
  }

  function finish(choice) {
    flagBump(`__seen.${nodeId}`);
    flagApply(node.set, node.clear);
    if (choice) flagApply(choice.set, choice.clear);
    scenes.pop();
    for (const fx of [...(node.effects || []), ...((choice && choice.effects) || [])]) {
      effectHandler(fx);
    }
    const goto = choice?.goto || node.goto;
    if (goto) startDialogue(goto);
  }

  return {
    id: `dialogue:${nodeId}`,
    blocksInput: true,
    lensPreset: node.lensPreset || 'calm',

    update(dt) {
      if (done) return;
      const line = lines[li];
      const full = String(line.text ?? line.direction ?? '');
      if (chars >= full.length) return;
      acc += dt * cps();
      while (acc >= 1 && chars < full.length) {
        acc -= 1;
        const ch = full[chars];
        chars++;
        if (ch && ch !== ' ') blipHandler(node.speaker);
      }
    },

    key(e) {
      const list = choices();
      if (done && list.length) {
        choiceIdx = Math.max(0, Math.min(choiceIdx, list.length - 1));
        if (e.key === 'ArrowUp' || e.key === 'w') { choiceIdx = (choiceIdx - 1 + list.length) % list.length; return true; }
        if (e.key === 'ArrowDown' || e.key === 's') { choiceIdx = (choiceIdx + 1) % list.length; return true; }
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') { finish(list[choiceIdx]); return true; }
        return true;
      }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') { advance(); return true; }
      return true; // modal
    },

    render() {
      const { cols, rows } = uiSize();
      uiScrim(0.5);

      const currentLine = lines[li] || null;
      const art = resolveStoryArt(currentLine?.art || node.art || null);
      const choicesReserve = done && choices().length ? Math.min(choices().length, 3) + 1 : 1;
      const wantedArtRows = art ? storyArtRows(art.mode, Math.floor(rows * 0.28)) + 1 : 0;
      const fixedSideBySideRows = art
        ? storyArtSideBySidePanelRows({ choicesRows: choicesReserve, headerRows: 1, bottomPadRows: 2 })
        : 0;
      const boxH = Math.min(rows - 2, Math.max(12 + wantedArtRows, fixedSideBySideRows));
      const boxY = rows - boxH - 1;
      const boxX = 1, boxW = cols - 2;
      const panel = drawMachinePanel(boxX, boxY, boxW, boxH, {
        label: 'MONITOR', source: node.speaker || 'DIALOGUE',
        footer: done && choices().length ? '[↑/↓] SELECT · [ENTER] CONFIRM' : '[SPACE] CONTINUE', meter: true,
      });

      let contentY = panel.y;
      let contentX = panel.x;
      let contentW = panel.w;
      let artShown = false;
      let textBottomY = boxY + boxH - 2;

      const sidePlan = planStoryArtSideBySide({
        art,
        mode: art?.mode || 'compact',
        panelRows: panel.h,
        panelCols: panel.w,
        textRowsMin: 5,
        choicesRows: choicesReserve,
        minTextCols: 34,
        bottomPadRows: 2,
      });

      if (sidePlan.show) {
        drawStoryArtCard(art, {
          x: panel.x,
          y: contentY,
          w: sidePlan.artCols,
          rows: sidePlan.rows,
          mode: sidePlan.mode || art.mode,
          lockRows: true,
        });
        contentX = panel.x + sidePlan.artCols + sidePlan.gap;
        contentW = sidePlan.textCols;
        textBottomY = Math.min(textBottomY, contentY + sidePlan.rows);
        artShown = true;
      } else {
        const artPlan = planStoryArtInPanel({
          art,
          mode: art?.mode || 'compact',
          panelRows: panel.h,
          textRowsMin: 5,
          choicesRows: choicesReserve,
        });

        if (artPlan.show) {
          drawStoryArtCard(art, {
            x: panel.x,
            y: contentY,
            w: panel.w,
            rows: artPlan.rows,
            mode: artPlan.mode || art.mode,
          });
          contentY += artPlan.rows + 1;
          artShown = true;
        }
      }

      // portrait pane. Story art supersedes the old portrait block when present.
      const pid = artShown ? null : node.portrait;
      let block = portrait(pid);
      if (block && node.register === 'decay') block = degrade(block, Math.min(0.85, visits(nodeId) * 0.22));
      const textX = contentX + 1 + (block ? PORTRAIT_W + 2 : 0);
      if (block) {
        for (let yy = 0; yy < Math.min(PORTRAIT_H, boxH - 2); yy++) {
          uiText(contentX, contentY + yy, block[yy], 'ui-secondary');
        }
      }

      if (node.speaker) drawVfdText(textX, contentY, node.speaker);

      // lines: everything before the current one stays on screen
      const textW = Math.max(8, contentX + contentW - textX - 2);
      let y = contentY + 2;
      for (let i = 0; i <= li && y < textBottomY; i++) {
        const line = lines[i];
        const isDirection = line.direction != null;
        const full = String(line.text ?? line.direction ?? '');
        const shown = i < li ? full : full.slice(0, chars);
        const cls = line.struck ? 'ui-secondary' : isDirection ? 'ui-secondary' : 'ui-primary';
        for (const wrapped of uiWrap(shown, textW)) {
          if (y >= textBottomY) break;
          uiText(textX, y, wrapped, cls, line.struck ? 0.58 : 1);
          if (line.struck) for (let k = 0; k < wrapped.length; k++) uiGlyph(textX + k, y, '─', 'ui-frame', 0.65);
          y++;
        }
      }

      // choices
      const list = choices();
      if (done && list.length) {
        let cy = boxY + boxH - 2 - Math.min(list.length, 3);
        list.slice(0, 3).forEach((c, i) => {
          const sel = i === choiceIdx;
          const label = `${sel ? '>' : ' '} ${c.text}`;
          uiText(textX, cy, label.slice(0, textW), sel ? 'ui-amber' : 'ui-primary');
          // ironic register: the choice comments on itself, in the margin
          if (node.register === 'ironic' && c.aside) {
            uiText(textX + label.length + 2, cy, `— ${c.aside}`, 'ui-secondary');
          }
          cy++;
        });
      } else if (!done) {
        const line = lines[li];
        const full = String(line.text ?? line.direction ?? '');
        if (chars >= full.length) uiText(boxX + boxW - 4, boxY + boxH - 3, '▾', 'ui-amber');
      }
    },
  };
}
