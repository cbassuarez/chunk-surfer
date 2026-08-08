import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import { shakeMode } from './access.js';
import { buildBagModel } from './bag-model.js';
import { BATTLE_GEAR } from './combat-loadout.js';
import { drawBattleWipe, drawCombatToolTile } from '../render/combat-view.js';

// A FIGHT STARTS HERE.
//
// This was the loadout briefing: a text list on a flat 97% black fill, no
// easing, no lead-in, and gated once-ever on a save flag so five of the six
// fights in a playthrough opened on nothing at all. It read as a settings screen
// that happened to appear before a battle.
//
// It is the encounter transition now. The wipe is the announcement — the fight
// has already started, that is the point of the surprise — and the pause for
// gear is the courtesy inside it. Nothing here can decline the fight.
//
// FOUR PHASES, on a clock:
//
//   HOLD    the world freezes mid-step. fx.hold() keeps the last painted frame,
//           so nothing is drawn over it; this beat is the whole surprise.
//   LOSS    the recorder stops holding the picture. The look profile goes to
//           'rupture' and the renderer's own eased blend does the work (see
//           syncLens in scenes.js), with glitch and shake over it.
//   TEAR    drawBattleWipe opens the shutters onto the select. The SAME wipe the
//           fight itself opens with (combat.js ~1228), so the encounter has one
//           visual language rather than two.
//   SELECT  the tiles. No timer, no pressure, no exit.
//
// Any key during the first three jumps to SELECT: the scare lands once, and a
// player who has seen it — or a harness driving a battle — is not held hostage.
//
// EVERY EFFECT IS INJECTED OR ALREADY GATED. fx.hold/glitch/shake in
// render/canvas.js each check flashMode/shakeMode/REDUCED_MOTION and no-op when
// the player has turned them down, and the phase clock runs on dt regardless —
// so with effects off this degrades to a short pause and the tiles, and can
// never strand anybody on a frozen frame.

export const ENCOUNTER_PHASE = Object.freeze({
  HOLD: 'hold', LOSS: 'loss', TEAR: 'tear', SELECT: 'select',
});

// Seconds. Short: this is a jolt, not a cutscene, and it sits in front of a
// fight the player did not ask for.
export const ENCOUNTER_TIMING = Object.freeze({
  hold: 0.18, loss: 0.42, tear: 0.30,
});

const NO_FX = { hold() {}, glitch() {}, shake() {}, flash() {} };

export function makeEncounterStartScene({
  getLoadout = () => ({}),
  getEquipment = () => [],
  moveEquipment = () => ({ changed: false }),
  reorderEquipment = () => ({ changed: false }),
  onConfirm = () => {},
  teach = false,
  fx = NO_FX,
  slate = 'SIGNAL / CONTACT',
} = {}) {
  let phase = ENCOUNTER_PHASE.HOLD;
  let elapsed = 0;
  let entered = false;
  let selected = 0;
  let notice = '';
  let tiles = [];
  let started = false;

  const kit = () => buildBagModel({ equipment: getEquipment() || [], loadout: getLoadout() })
    .sections.find((section) => section.id === 'kit')?.entries
    .filter((entry) => entry.battleCapable && entry.present) || [];

  const clampSel = (list) => { selected = Math.max(0, Math.min(selected, Math.max(0, list.length - 1))); };
  const move = (delta) => { const list = kit(); selected = (selected + delta + list.length) % Math.max(1, list.length); notice = ''; };

  const leadIn = () => phase !== ENCOUNTER_PHASE.SELECT;
  function toSelect() { phase = ENCOUNTER_PHASE.SELECT; elapsed = 0; }

  function act(kind) {
    const list = kit();
    clampSel(list);
    const entry = list[selected];
    if (!entry) return;
    if (kind === 'toggle') {
      const dest = entry.compartment === 'top' ? 'storage' : 'top';
      const result = moveEquipment(entry.sourceId, dest);
      notice = result?.changed
        ? `${entry.title} → ${dest === 'top' ? 'BATTLE TRAY' : 'STORAGE'}`
        : result?.reason === 'top-full' ? 'TRAY FULL · MOVE ONE OUT FIRST' : 'UNCHANGED';
    } else if (kind === 'up') {
      const result = reorderEquipment(entry.sourceId, 'up');
      if (result?.changed) { selected = Math.max(0, selected - 1); notice = `${entry.title} MOVED UP`; }
      else notice = 'ALREADY FIRST';
    }
  }

  // Once. A double-tap on ENTER must not start two fights.
  const confirm = () => {
    if (started) return;
    started = true;
    scenes.pop();
    onConfirm();
  };

  return {
    id: 'encounter-start',
    blocksInput: true,
    blocksWorld: true,
    // The shock idiom this game already uses for a hard turn (tower-impact,
    // taken-aftermath, hush-contact). syncLens hands it to the renderer with the
    // profile's own transitionMs, so the look change is eased for free.
    lensPreset: 'rupture',

    enter() {
      if (entered) return;
      entered = true;
      // No-ops when the player has effects or motion turned down; the clock
      // below does not care either way.
      fx.hold?.(Math.round(ENCOUNTER_TIMING.hold * 1000));
      fx.glitch?.(1, Math.round((ENCOUNTER_TIMING.hold + ENCOUNTER_TIMING.loss) * 1000));
      fx.shake?.(1.1, Math.round(ENCOUNTER_TIMING.loss * 1000));
    },

    update(dt) {
      const step = Math.max(0, Number(dt) || 0);
      if (!leadIn()) return;
      elapsed += step;
      if (phase === ENCOUNTER_PHASE.HOLD && elapsed >= ENCOUNTER_TIMING.hold) {
        phase = ENCOUNTER_PHASE.LOSS; elapsed = 0;
      } else if (phase === ENCOUNTER_PHASE.LOSS && elapsed >= ENCOUNTER_TIMING.loss) {
        phase = ENCOUNTER_PHASE.TEAR; elapsed = 0;
        fx.flash?.(110);
      } else if (phase === ENCOUNTER_PHASE.TEAR && elapsed >= ENCOUNTER_TIMING.tear) {
        toSelect();
      }
    },

    key(e) {
      // The scare is skippable, the fight is not.
      if (leadIn()) { toSelect(); return true; }
      const k = String(e.key || '').toLowerCase();
      const code = e.code || '';
      if (e.key === 'ArrowUp' || k === 'w' || code === 'KeyW' || e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowDown' || k === 's' || code === 'KeyS' || e.key === 'ArrowRight') move(1);
      else if (e.key === ' ' || code === 'Space' || e.controllerAction === 'confirm') act('toggle');
      else if (k === 'r' || code === 'KeyR') act('up');
      else if (e.key === 'Enter' || code === 'Enter' || e.controllerAction === 'start') confirm();
      // Escape is deliberately dead. The transition has already said a fight
      // started; an exit that is not real is worse than no exit at all. The old
      // screen "closed" on Escape and then began the fight anyway, which read as
      // a bug rather than as a rule.
      return true;
    },

    pointer(e) {
      if (e.type !== 'pointerdown') return true;
      if (leadIn()) { toSelect(); return true; }
      const x = Number(e.cellX);
      const y = Number(e.cellY);
      const hit = tiles.find((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
      if (hit) { selected = hit.index; act('toggle'); }
      return true;
    },

    view() {
      const list = kit();
      clampSel(list);
      return {
        id: 'encounter-start',
        phase,
        leadIn: leadIn(),
        top: list.filter((entry) => entry.compartment === 'top').map((entry) => entry.sourceId),
        selected: list[selected]?.sourceId || null,
        capacity: getLoadout()?.capacity ?? null,
        started,
      };
    },

    render() {
      const { cols, rows: screenRows } = uiSize();
      const reducedMotion = shakeMode() !== 'full';

      // HOLD draws nothing on purpose: fx.hold keeps the last world frame on
      // screen, and anything drawn here would be the thing that breaks the
      // freeze. With effects off there is no freeze and this is simply a very
      // short blank beat before the wipe.
      if (phase === ENCOUNTER_PHASE.HOLD) return;

      if (phase === ENCOUNTER_PHASE.LOSS) {
        // The picture failing: the frame floods and the encoder gives up in
        // bands rather than fading politely.
        const p = Math.min(1, elapsed / Math.max(0.001, ENCOUNTER_TIMING.loss));
        uiFill(0, 0, cols, screenRows, `rgba(2,2,3,${(0.35 + 0.62 * p).toFixed(3)})`);
        if (!reducedMotion) {
          for (let i = 0; i < 5; i += 1) {
            const band = Math.floor(((i * 7 + Math.floor(p * 11)) % Math.max(1, screenRows - 2)) + 1);
            uiFill(0, band, cols, 1, `rgba(255,181,54,${(0.05 + 0.10 * (1 - p)).toFixed(3)})`);
          }
        }
        uiText(Math.max(0, Math.floor(cols / 2) - 8), Math.floor(screenRows / 2), slate.slice(0, 24), 'ui-amber', 0.55 + 0.4 * p);
        return;
      }

      // TEAR and SELECT both draw the select; the wipe sits over it and opens.
      drawSelect();
      if (phase === ENCOUNTER_PHASE.TEAR) {
        const p = Math.min(1, elapsed / Math.max(0.001, ENCOUNTER_TIMING.tear));
        drawBattleWipe({ x: 0, y: 0, w: cols, h: screenRows, progress: p, reducedMotion });
      }

      function drawSelect() {
        const list = kit();
        clampSel(list);
        const top = list.filter((entry) => entry.compartment === 'top');
        const stored = list.filter((entry) => entry.compartment !== 'top');

        // The fight's own chrome, called the way the fight calls it
        // (combat.js ~956) — same wordmark, same meter, same footer bar. This is
        // a fight screen that happens to let you repack, so it has to be the
        // same machine as the one it hands off to, not a menu in front of it.
        const footer = activeInputPromptDevice() === 'controller'
          ? promptLine([{ action: 'select', label: 'GEAR' }, { action: 'confirm', label: 'PATCH' }, { action: 'start', label: 'FIGHT' }])
          : '[↑↓←→] GEAR · [SPACE] PATCH IN/OUT · [R] ORDER · [ENTER] FIGHT';
        const width = Math.min(88, cols - 6);
        const px = Math.floor((cols - width) / 2);
        const panel = drawMachinePanel(px - 2, 1, width + 4, screenRows - 2, {
          // Just 'SIGNAL COMBAT': drawMachinePanel already draws the AUDIOCORP
          // wordmark, and combat.js passes it a second time in the label, which
          // is why the fight's own header reads "AUDIOCORP AUDIOCORP / SIGNAL
          // COMBAT". Not copying that here.
          label: 'SIGNAL COMBAT', source: 'FIELD', meter: true, scrim: true, footer,
        });
        const x = panel.x;

        drawVfdText(x, panel.y, slate, { scale: 2 });
        uiText(x, panel.y + 2.6, 'A FIGHT HAS STARTED. THIS IS THE LAST TIME YOU CAN REACH THE CASE.', 'ui-amber', 0.8);
        uiText(x + Math.max(24, Math.floor(panel.w * .62)), panel.y, `TRAY ${top.length}/${getLoadout()?.capacity ?? 4}`, 'ui-counter', .85);
        if (teach) {
          uiText(x, panel.y + 4, 'THE TRAY IS WHAT YOU CAN REACH MID-FIGHT. ITS ORDER IS YOUR TOOL RAIL.', 'ui-secondary', .68);
        }

        // The fight screen's own tile, not an imitation of it — same fill,
        // stroke, icon and READY/LOCKED line the tool rail uses in combat.
        tiles = [];
        const cellW = Math.floor((panel.w - 2) / 2);
        const tileH = 3;
        let y = panel.y + (teach ? 5.8 : 4.6);
        const drawGroup = (label, entries) => {
          uiText(x, y, `— ${label}`, 'ui-label', .6);
          y += 1.2;
          if (!entries.length) { uiText(x + 2, y, 'EMPTY', 'ui-secondary', .5); y += tileH; return; }
          entries.forEach((entry, i) => {
            const index = list.indexOf(entry);
            const col = i % 2;
            const tx = x + col * (cellW + 2);
            const ty = y + Math.floor(i / 2) * (tileH + .6);
            const active = index === selected;
            drawCombatToolTile({
              id: BATTLE_GEAR[entry.sourceId]?.toolId || entry.sourceId,
              label: entry.title,
              ready: entry.compartment === 'top',
            }, { x: tx, y: ty, w: cellW, h: tileH, selected: active, focused: active });
            tiles.push({ index, x: tx, y: ty, w: cellW, h: tileH });
          });
          y += Math.ceil(entries.length / 2) * (tileH + .6) + .6;
        };
        drawGroup('BATTLE TRAY · REACHABLE', top);
        drawGroup('STORAGE · NOT IN THIS FIGHT', stored);

        if (notice) uiText(x, panel.y + panel.h - 2, notice.slice(0, panel.w), 'ui-amber', .85);
      }
    },
  };
}
