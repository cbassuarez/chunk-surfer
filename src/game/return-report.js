import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { achievementDefinition } from '../progression/achievements.js';
import { consumeReturnReport } from '../progression/runtime.js';
import { formatDuration, returnDefinition } from '../progression/report.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';
import { roomLabel } from '../audio/manifest-map.js';
import { secondShiftForEnding } from './second-shift.js';

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
const FEATURE_DESCRIPTIONS = Object.freeze({
  archive: 'Review achievements and the physical residue filed by each return.',
  returnIndex: 'One adjacent return classification and lead is now visible.',
  reopenCase: 'A new shift carries changed evidence into the same building.',
  deadAir: 'A stricter authored ruleset is available for the next story return.',
  seenTextAcceleration: 'Previously read passages may be accelerated in replay settings.',
  archiveSignals: 'Unseen decisions may be marked without revealing their result.',
  condensedCheckIn: 'The repeated arrival can be shortened after it has been lived once.',
  partialReturnClassifications: 'Filed evidence now exposes related return types.',
  customShift: 'Individual challenge rules may be assembled for a new shift.',
  fullReturnIndex: 'All return classifications are visible; routes remain undisclosed.',
});

function reportRows(summary) {
  const ret = returnDefinition(summary.endingId);
  const contaminated = summary.takes?.contaminated || [];
  return [
    ['ENDING', ret?.title || summary.endingId.toUpperCase()],
    ...(summary.interference?.caseId ? [[
      'FIELD RETURN',
      `${summary.interference.caseId} / ${summary.interference.classification || 'CONTESTED'}`,
    ]] : []),
    ['DIFFICULTY', String(summary.rules?.startedPreset || 'contract').replaceAll('-', ' ').toUpperCase()],
    ['TAKES', `${summary.takes.completed} / 5`],
    ['SPOILED', String(summary.takes.spoiled)],
    ['NOISE FLOOR', contaminated.length ? `${contaminated.length} TAKE${contaminated.length===1?'':'S'} / BALLAST` : 'CLEAN'],
    ...(contaminated.length?[['MARKED',contaminated.map((id)=>roomLabel(id).toUpperCase()).join(' · ')]]:[]),
    ['INJURIES', String(summary.injuries)],
    ['DISCLOSURES', `${summary.disclosures.found} / ??`],
    ['EQUIPMENT', `${summary.equipment.returned} / ${summary.equipment.issued} RETURNED`],
    ['DURATION', formatDuration(summary.durationSeconds)],
  ];
}

export function makeReturnReportScene({
  summary,
  onReopen = () => {},
  onHush = () => {},
  onArchive = () => {},
  onTitle = () => {},
  getCausalStatus = () => summary.causalTape || { status: summary.injuries <= 1 ? 'filing' : 'not-qualified' },
} = {}) {
  const buildStages=()=>{
    const achievementIds=[...(summary.unlockedAchievements||[])];
    if(getCausalStatus()?.status==='ready'&&!achievementIds.includes('ACH_SECOND_TRACK'))achievementIds.push('ACH_SECOND_TRACK');
    const achievementPages=chunk(achievementIds,3);
    const unlockPages=chunk(summary.newlyUnlockedFeatures||[],4);
    return [
      {id:'report'},
      ...achievementPages.map((ids,index)=>({id:'achievements',ids,page:index+1,pages:achievementPages.length})),
      ...unlockPages.map((ids,index)=>({id:'unlocks',ids,page:index+1,pages:unlockPages.length})),
      {id:'second-shift'},
      {id:'actions'},
    ];
  };
  let stages=getCausalStatus()?.status==='filing'?[{id:'filing'}]:buildStages();
  let stage = 0;
  let action = getCausalStatus()?.status === 'ready' ? 1 : 0;
  const actions = ['REOPEN STORY CASE', 'THE HUSH', 'ACHIEVEMENTS / RETURN FILES', 'TITLE'];
  let consumed = false;
  // The summary arrives out of the black the closing quote left behind, with the
  // hiss bed already up under it (see presentCredits onBlack). It fades in rather
  // than cutting, because cutting to a stats panel is the one thing that would
  // undo the ending.
  let entered = 0;
  const FADE_IN = 2.2;

  function finish(kind) {
    if (!consumed) { consumeReturnReport(summary.id); consumed = true; }
    scenes.pop();
    if (kind === 'REOPEN STORY CASE') onReopen();
    else if (kind === 'THE HUSH') onHush();
    else if (kind === 'ACHIEVEMENTS / RETURN FILES') onArchive();
    else onTitle();
  }

  return {
    id: 'return-report', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { AUDIO.startMenuHiss(); },
    exit() { AUDIO.stopMenuHiss(); },
    update(dt = 0) {
      entered += Math.max(0, Number(dt) || 0);
      if(stages[0]?.id==='filing'&&getCausalStatus()?.status!=='filing'){stages=buildStages();stage=0;}
    },
    key(e) {
      // A key during the fade takes you to the end of it, never past it.
      if (entered < FADE_IN) { entered = FADE_IN; return true; }
      const k = String(e.key || '').toLowerCase();
      const current = stages[stage].id;
      if(current==='filing')return true;
      if (current === 'actions') {
        if (e.key === 'ArrowUp' || k === 'w') { action = (action - 1 + actions.length) % actions.length; AUDIO.menuMove(); return true; }
        if (e.key === 'ArrowDown' || k === 's') { action = (action + 1) % actions.length; AUDIO.menuMove(); return true; }
        if (e.key === 'ArrowLeft' || k === 'a') { action = action === 1 ? 0 : action === 3 ? 2 : action; AUDIO.menuMove(); return true; }
        if (e.key === 'ArrowRight' || k === 'd') { action = action === 0 ? 1 : action === 2 ? 3 : action; AUDIO.menuMove(); return true; }
        if (e.key === 'Enter' || e.key === ' ' || k === 'z') {
          if (actions[action] === 'THE HUSH' && getCausalStatus()?.status !== 'ready') { AUDIO.menuMove(); return true; }
          AUDIO.menuConfirm(); finish(actions[action]); return true;
        }
        return true;
      }
      if (e.key === 'Enter' || e.key === ' ' || k === 'z' || e.key === 'ArrowRight') {
        stage = Math.min(stages.length - 1, stage + 1); AUDIO.menuConfirm(); return true;
      }
      if (e.key === 'ArrowLeft' && stage > 0) { stage--; AUDIO.menuMove(); return true; }
      return true;
    },
    render() {
      this.drawReport();
      // Up out of the black the closing quote went out on.
      if (entered < FADE_IN) {
        const { cols, rows } = uiSize();
        const remaining = 1 - (entered / FADE_IN);
        uiFill(0, 0, cols, rows, `rgba(2,2,3,${(remaining * remaining).toFixed(3)})`);
      }
    },

    drawReport() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const w = Math.min(88, cols - 4), h = Math.min(Math.max(30, rows - 8), rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const currentStage = stages[stage];
      const current = currentStage.id;
      const pageSource = currentStage.pages > 1 ? `${currentStage.page}/${currentStage.pages}` : '4417-C';
      const body = drawMachinePanel(x, y, w, h, {
        label: current === 'filing' ? 'FILING SECOND TRACK' : current === 'report' ? 'RUN SUMMARY' : current === 'achievements' ? 'ACHIEVEMENTS' : current === 'unlocks' ? 'UNLOCKS' : current === 'second-shift' ? 'CASE REOPENED' : 'SECOND SHIFT',
        source: pageSource,
        footer: current === 'actions'
          ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CONFIRM' }])
          : promptLine([{ action: 'continue', label: 'CONTINUE' }]),
        meter: current !== 'actions',
      });

      if(current==='filing'){
        drawVfdText(body.x,body.y,'FILING SECOND TRACK',{color:UI_COLOR.danger,max:body.w});
        uiCenter(body.y+Math.floor(body.h/2),'SEALING CAUSAL TAPE / VERIFYING CHECKSUM','ui-amber');
        uiCenter(body.y+Math.floor(body.h/2)+3,'THE STORY RETURN IS ALREADY FILED.','ui-secondary');
        return;
      }

      if (current === 'report') {
        drawVfdText(body.x, body.y, 'RUN SUMMARY', { color: UI_COLOR.amber, max: body.w });
        let ry = body.y + 4;
        for (const [label, value] of reportRows(summary).slice(0, Math.max(1, Math.floor((body.h - 5) / 2)))) {
          uiText(body.x, ry, label.padEnd(14), 'ui-secondary');
          uiText(body.x + 15, ry, value.slice(0, Math.max(1, body.w - 15)), label === 'ENDING' ? 'ui-amber' : 'ui-primary');
          ry += 2;
        }
        const cert = summary.rules.startedPreset === 'dead-air'
          ? summary.integrity.deadAir.eligible ? 'DEAD AIR CERTIFIED' : 'DEAD AIR CERTIFICATION ENDED'
          : 'RUN COMPLETE';
        uiCenter(body.y + body.h - 1, cert, cert.includes('ENDED') ? 'ui-danger' : 'ui-green');
        return;
      }

      if (current === 'achievements') {
        drawVfdText(body.x, body.y, 'ACHIEVEMENTS UNLOCKED', { color: UI_COLOR.amber, max: body.w });
        let ry = body.y + 4;
        const maxY = body.y + body.h - 1;
        for (const id of currentStage.ids || []) {
          const def = achievementDefinition(id);
          if (!def || ry > maxY) continue;
          uiText(body.x, ry++, def.name.toUpperCase().slice(0, body.w), 'ui-amber');
          for (const line of uiWrap(def.description, body.w - 2).slice(0, 2)) {
            if (ry > maxY) break;
            uiText(body.x + 2, ry++, line, 'ui-primary');
          }
          ry++;
        }
        return;
      }

      if (current === 'unlocks') {
        drawVfdText(body.x, body.y, 'NEW OPTIONS UNLOCKED', { color: UI_COLOR.danger, max: body.w });
        let ry = body.y + 4;
        const maxY = body.y + body.h - 1;
        for (const id of currentStage.ids || []) {
          if (ry > maxY) break;
          const text = id.startsWith('cosmetic:') ? `DISPLAY / ${id.slice(9).replaceAll('-', ' ').toUpperCase()}` : FEATURE_LABELS[id] || id.toUpperCase();
          uiText(body.x, ry, `▸ ${text}`.slice(0, body.w), id === 'deadAir' ? 'ui-danger' : 'ui-amber');
          const description=FEATURE_DESCRIPTIONS[id];
          if(description&&ry+1<=maxY)uiText(body.x+2,ry+1,description.slice(0,Math.max(1,body.w-2)),'ui-secondary');
          ry += 3;
        }
        return;
      }

      if (current === 'second-shift') {
        const shift = secondShiftForEnding(summary.endingId);
        drawVfdText(body.x, body.y, 'CASE REOPENED / SECOND SHIFT', { color: UI_COLOR.danger, max: body.w });
        uiText(body.x, body.y + 4, 'PERSISTENT EVIDENCE', 'ui-label');
        uiText(body.x, body.y + 6, `${shift?.evidenceLabel || 'CASE FILE'} / ${shift?.residueLabel || 'UNRESOLVED'}`.slice(0, body.w), 'ui-amber');
        uiText(body.x, body.y + 9, 'ACTIONABLE LEAD', 'ui-label');
        uiWrap(shift?.lead || 'A second pass will not be the same case.', body.w).slice(0, 5).forEach((line, i) => uiText(body.x, body.y + 11 + i, line, 'ui-primary'));
        uiText(body.x, body.y + body.h - 3, `ADJACENT RETURN / ${shift?.adjacentClassification || 'WITHHELD'}`, 'ui-danger');
        return;
      }

      drawVfdText(body.x, body.y, 'SECOND SHIFT', { color: UI_COLOR.amber, max: body.w });
      const causal = getCausalStatus() || {};
      const gap = 3;
      const panelW = Math.max(20, Math.floor((body.w - gap) / 2));
      const panelY = body.y + 4;
      const panelH = Math.min(12, body.h - 10);
      const leftX = body.x;
      const rightX = body.x + panelW + gap;
      [[leftX, 0], [rightX, 1]].forEach(([px, index]) => {
        uiFill(px, panelY, panelW, panelH, index === action ? 'rgba(186,116,31,.13)' : 'rgba(8,10,10,.42)');
        uiLine(px, panelY, px + panelW - 1, panelY, index === action ? UI_COLOR.amber : UI_COLOR.frame, 0.85);
        uiLine(px, panelY + panelH - 1, px + panelW - 1, panelY + panelH - 1, index === action ? UI_COLOR.amber : UI_COLOR.frame, 0.55);
      });
      uiText(leftX + 2, panelY + 2, `${action === 0 ? '▸ ' : ''}REOPEN STORY CASE`, action === 0 ? 'ui-amber' : 'ui-primary');
      const unseen=Math.max(0,5-(summary.endingsAtCompletion||1));
      uiWrap(`${secondShiftForEnding(summary.endingId)?.residueLabel || 'Changed evidence'} filed. Replay assists ready. ${unseen} unseen return${unseen===1?'':'s'}.`, panelW - 4).slice(0, 3).forEach((line, i) => uiText(leftX + 2, panelY + 5 + i, line, 'ui-secondary'));
      uiText(leftX + 2, panelY + panelH - 2, 'CHOOSE DIFFICULTY', 'ui-label');

      uiText(rightX + 2, panelY + 2, `${action === 1 ? '▸ ' : ''}THE HUSH`, action === 1 ? 'ui-danger' : causal.status === 'ready' ? 'ui-amber' : 'ui-secondary');
      const hushLine = causal.status === 'ready' ? 'CAUSE WHAT THE SOURCE TAPE ALREADY CONTAINS'
        : causal.status === 'filing' ? 'FILING SECOND TRACK'
          : causal.status === 'failed' ? 'TAPE FILING FAILED'
            : 'COMPLETE A RETURN WITH ≤ 1 INJURY';
      uiWrap(hushLine, panelW - 4).slice(0, 3).forEach((line, i) => uiText(rightX + 2, panelY + 5 + i, line, causal.status === 'ready' ? 'ui-primary' : 'ui-secondary'));

      const footerY = body.y + body.h - 4;
      uiText(body.x + 2, footerY, `${action === 2 ? '▸ ' : ''}ACHIEVEMENTS / RETURN FILES`, action === 2 ? 'ui-amber' : 'ui-secondary');
      uiText(body.x + body.w - 10, footerY, `${action === 3 ? '▸ ' : ''}TITLE`, action === 3 ? 'ui-amber' : 'ui-secondary');
    },
  };
}
