import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { achievementDefinition } from '../progression/achievements.js';
import { consumeReturnReport } from '../progression/runtime.js';
import { formatDuration, returnDefinition } from '../progression/report.js';
import * as AUDIO from '../audio/story-audio.js';

const chunk = (values, size) => {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
};

const FEATURE_LABELS = Object.freeze({
  archive: 'ACHIEVEMENTS',
  returnIndex: 'ENDINGS INDEX',
  reopenCase: 'NEW RUN',
  deadAir: 'DEAD AIR DIFFICULTY',
  seenTextAcceleration: 'SEEN TEXT FAST-FORWARD',
  archiveSignals: 'UNSEEN CHOICE MARKERS',
  condensedCheckIn: 'CONDENSED CHECK-IN',
  partialReturnClassifications: 'ENDING TYPES',
  customShift: 'CUSTOM DIFFICULTY',
  fullReturnIndex: 'FULL ENDINGS INDEX',
});

function reportRows(summary) {
  const ret = returnDefinition(summary.endingId);
  return [
    ['ENDING', ret?.title || summary.endingId.toUpperCase()],
    ['DIFFICULTY', String(summary.rules?.startedPreset || 'contract').replaceAll('-', ' ').toUpperCase()],
    ['TAKES', `${summary.takes.completed} / 5`],
    ['SPOILED', String(summary.takes.spoiled)],
    ['INJURIES', String(summary.injuries)],
    ['DISCLOSURES', `${summary.disclosures.found} / ??`],
    ['EQUIPMENT', `${summary.equipment.returned} / ${summary.equipment.issued} RETURNED`],
    ['DURATION', formatDuration(summary.durationSeconds)],
  ];
}

export function makeReturnReportScene({
  summary,
  onReopen = () => {},
  onArchive = () => {},
  onTitle = () => {},
} = {}) {
  const achievementPages = chunk(summary.unlockedAchievements || [], 3);
  const unlockPages = chunk(summary.newlyUnlockedFeatures || [], 7);
  const stages = [
    { id: 'report' },
    ...achievementPages.map((ids, index) => ({ id: 'achievements', ids, page: index + 1, pages: achievementPages.length })),
    ...unlockPages.map((ids, index) => ({ id: 'unlocks', ids, page: index + 1, pages: unlockPages.length })),
    { id: 'actions' },
  ];
  let stage = 0;
  let action = 0;
  const actions = ['NEW RUN', 'ACHIEVEMENTS', 'TITLE'];
  let consumed = false;

  function finish(kind) {
    if (!consumed) { consumeReturnReport(summary.id); consumed = true; }
    scenes.pop();
    if (kind === 'NEW RUN') onReopen();
    else if (kind === 'ACHIEVEMENTS') onArchive();
    else onTitle();
  }

  return {
    id: 'return-report', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { AUDIO.startMenuHiss(); },
    exit() { AUDIO.stopMenuHiss(); },
    key(e) {
      const k = String(e.key || '').toLowerCase();
      const current = stages[stage].id;
      if (current === 'actions') {
        if (e.key === 'ArrowUp' || k === 'w') { action = (action - 1 + actions.length) % actions.length; AUDIO.menuMove(); return true; }
        if (e.key === 'ArrowDown' || k === 's') { action = (action + 1) % actions.length; AUDIO.menuMove(); return true; }
        if (e.key === 'Enter' || e.key === ' ' || k === 'z') { AUDIO.menuConfirm(); finish(actions[action]); return true; }
        return true;
      }
      if (e.key === 'Enter' || e.key === ' ' || k === 'z' || e.key === 'ArrowRight') {
        stage = Math.min(stages.length - 1, stage + 1); AUDIO.menuConfirm(); return true;
      }
      if (e.key === 'ArrowLeft' && stage > 0) { stage--; AUDIO.menuMove(); return true; }
      return true;
    },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const w = Math.min(88, cols - 4), h = Math.min(30, rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const currentStage = stages[stage];
      const current = currentStage.id;
      const pageSource = currentStage.pages > 1 ? `${currentStage.page}/${currentStage.pages}` : '4417-C';
      const body = drawMachinePanel(x, y, w, h, {
        label: current === 'report' ? 'RUN SUMMARY' : current === 'achievements' ? 'ACHIEVEMENTS' : current === 'unlocks' ? 'UNLOCKS' : 'NEXT',
        source: pageSource,
        footer: current === 'actions' ? '[↑/↓] SELECT · [ENTER] CONFIRM' : '[ENTER] CONTINUE',
        meter: current !== 'actions',
      });

      if (current === 'report') {
        drawVfdText(body.x, body.y, 'RUN SUMMARY', { color: UI_COLOR.amber, max: body.w });
        let ry = body.y + 4;
        for (const [label, value] of reportRows(summary)) {
          uiText(body.x, ry, label.padEnd(14), 'ui-secondary');
          uiText(body.x + 15, ry, value.slice(0, Math.max(1, body.w - 15)), label === 'ENDING' ? 'ui-amber' : 'ui-primary');
          ry += 2;
        }
        const cert = summary.rules.startedPreset === 'dead-air'
          ? summary.integrity.deadAir.eligible ? 'DEAD AIR CERTIFIED' : 'DEAD AIR CERTIFICATION ENDED'
          : 'RUN COMPLETE';
        uiCenter(y + h - 3, cert, cert.includes('ENDED') ? 'ui-danger' : 'ui-green');
        return;
      }

      if (current === 'achievements') {
        drawVfdText(body.x, body.y, 'ACHIEVEMENTS UNLOCKED', { color: UI_COLOR.amber, max: body.w });
        let ry = body.y + 4;
        for (const id of currentStage.ids || []) {
          const def = achievementDefinition(id);
          if (!def) continue;
          uiText(body.x, ry++, def.name.toUpperCase(), 'ui-amber');
          uiWrap(def.description, body.w).slice(0, 2).forEach((line) => uiText(body.x + 2, ry++, line, 'ui-primary'));
          ry++;
        }
        return;
      }

      if (current === 'unlocks') {
        drawVfdText(body.x, body.y, 'NEW OPTIONS UNLOCKED', { color: UI_COLOR.danger, max: body.w });
        let ry = body.y + 4;
        for (const id of currentStage.ids || []) {
          const text = id.startsWith('cosmetic:') ? `DISPLAY / ${id.slice(9).replaceAll('-', ' ').toUpperCase()}` : FEATURE_LABELS[id] || id.toUpperCase();
          uiText(body.x, ry, `▸ ${text}`, id === 'deadAir' ? 'ui-danger' : 'ui-amber');
          ry += 2;
        }
        return;
      }

      drawVfdText(body.x, body.y, 'WHAT NEXT?', { color: UI_COLOR.amber, max: body.w });
      uiLine(body.x, body.y + 3, body.x + body.w, body.y + 3, UI_COLOR.frame, 0.65);
      const menuY = body.y + 6;
      actions.forEach((label, i) => uiText(body.x + 2, menuY + i * 3, `${i === action ? '▸' : ' '} ${label}`, i === action ? 'ui-amber' : 'ui-secondary'));
    },
  };
}
