import { uiFill, uiSize, uiText } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { PROGRESSION_CASE_IDS, progressionFixture } from '../data/progression-fixtures.js';
import { deriveUnlocks } from '../progression/unlocks.js';
import { resolveDifficulty } from '../progression/difficulty.js';

export function makeProgressionLabScene() {
  let at = 0;
  let fixture = progressionFixture(PROGRESSION_CASE_IDS[at]);
  function change(delta) {
    at = (at + delta + PROGRESSION_CASE_IDS.length) % PROGRESSION_CASE_IDS.length;
    fixture = progressionFixture(PROGRESSION_CASE_IDS[at]);
  }
  return {
    id: 'progression-lab', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    key(e) {
      const k = String(e.key || '').toLowerCase();
      if (k === 'c') { change(e.shiftKey ? -1 : 1); return true; }
      return true;
    },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const w = Math.min(88, cols - 4), h = Math.min(28, rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, { label: 'PROGRESSION LAB', source: 'FIXTURE', footer: '[C] NEXT · [SHIFT+C] PREVIOUS', meter: false });
      drawVfdText(body.x, body.y, fixture.id.toUpperCase().replaceAll('-', ' '), { color: UI_COLOR.amber, max: body.w });
      const difficulty = resolveDifficulty(fixture.run.rules);
      const unlocks = deriveUnlocks(fixture.meta);
      const rowsOut = [
        ['RUN', fixture.run.id],
        ['STATUS', fixture.run.status],
        ['PRESET', fixture.run.rules.startedPreset],
        ['CERTIFICATION', fixture.run.integrity.deadAir.eligible ? 'ACTIVE' : fixture.run.integrity.deadAir.startedEligible ? 'ENDED' : 'N/A'],
        ['ENDINGS', String(fixture.meta.endingsSeen.length)],
        ['DEAD AIR', unlocks.deadAir ? 'UNLOCKED' : 'WITHHELD'],
        ['CUSTOM SHIFT', unlocks.customShift ? 'UNLOCKED' : 'WITHHELD'],
        ['ESCAPE', difficulty.escape.seconds == null ? 'OFF' : `${difficulty.escape.seconds} SEC`],
        ['PRESENCE', difficulty.values.presencePressure],
      ];
      rowsOut.forEach(([label, value], i) => {
        uiText(body.x, body.y + 4 + i * 2, label.padEnd(18), 'ui-secondary');
        uiText(body.x + 19, body.y + 4 + i * 2, String(value).toUpperCase(), label === 'CERTIFICATION' && value === 'ENDED' ? 'ui-danger' : 'ui-primary');
      });
    },
  };
}
