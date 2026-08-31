import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { tapeQualifies } from '../causal/tape.js';
import { achievementDefinition } from '../progression/achievements.js';
import { consumeReturnReport } from '../progression/runtime.js';
import { formatDuration, returnDefinition } from '../progression/report.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';
import { getMeta } from './save.js';
import { roomLabel } from '../audio/manifest-map.js';
import {
  FEATURE_COPY,
  NEXT_ENDING_HINTS,
  POST_RUN_ACTIONS,
  POST_RUN_STAGE_COPY,
  dispatchPostRunAction,
  endingHintForEnding,
  transferRoomCopy,
} from './post-run-copy.js';

const chunk = (values, size) => {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
};

function reportRows(summary) {
  const ret = returnDefinition(summary.endingId);
  const contaminated = summary.takes?.contaminated || [];
  return [
    ['ENDING', ret?.title || summary.endingId.toUpperCase()],
    ...(summary.interference?.caseId ? [[
      'INTERFERENCE',
      `${summary.interference.caseId} / ${summary.interference.classification || 'UNRESOLVED'}`,
    ]] : []),
    ['DIFFICULTY', String(summary.rules?.startedPreset || 'contract').replaceAll('-', ' ').toUpperCase()],
    ['TAKES', `${summary.takes.completed} / 5`],
    ['SPOILED', String(summary.takes.spoiled)],
    ['CONTAMINATED', String(contaminated.length)],
    ...(contaminated.length ? [['AFFECTED ROOMS', contaminated.map((id) => roomLabel(id).toUpperCase()).join(' · ')]] : []),
    ['INJURIES', String(summary.injuries)],
    ['DISCOVERIES', `${summary.disclosures.found} / ??`],
    ['EQUIPMENT RETURNED', `${summary.equipment.returned} / ${summary.equipment.issued}`],
    ['DURATION', formatDuration(summary.durationSeconds)],
  ];
}

export function makeReturnReportScene({
  summary,
  onReopen = () => {},
  onTransferRoom = () => {},
  onArchive = () => {},
  onTitle = () => {},
  getCausalStatus = () => summary.causalTape || { status: tapeQualifies(summary.injuries) ? 'filing' : 'not-qualified' },
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
  // The file is always open, so this row no longer waits on anything being
  // prepared; PLAY AGAIN stays the default because that is still the likelier
  // thing to want off the back of an ending.
  let action = 0;
  let consumed = false;
  // The summary arrives out of the black the closing quote left behind, with the
  // hiss bed already up under it (see presentCredits onBlack). It fades in rather
  // than cutting, because cutting to a stats panel is the one thing that would
  // undo the ending.
  let entered = 0;
  const FADE_IN = 2.2;

  function finish(actionId) {
    if (!consumed) { consumeReturnReport(summary.id); consumed = true; }
    scenes.pop();
    dispatchPostRunAction(actionId, { onReopen, onTransferRoom, onArchive, onTitle });
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
        if (e.key === 'ArrowUp' || k === 'w') { action = (action - 1 + POST_RUN_ACTIONS.length) % POST_RUN_ACTIONS.length; AUDIO.menuMove(); return true; }
        if (e.key === 'ArrowDown' || k === 's') { action = (action + 1) % POST_RUN_ACTIONS.length; AUDIO.menuMove(); return true; }
        if (e.key === 'ArrowLeft' || k === 'a') { action = action === 1 ? 0 : action === 3 ? 2 : action; AUDIO.menuMove(); return true; }
        if (e.key === 'ArrowRight' || k === 'd') { action = action === 0 ? 1 : action === 2 ? 3 : action; AUDIO.menuMove(); return true; }
        if (e.key === 'Enter' || e.key === ' ' || k === 'z') {
          const selectedAction = POST_RUN_ACTIONS[action];
          AUDIO.menuConfirm(); finish(selectedAction?.id || 'title'); return true;
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
      const stageCopy = POST_RUN_STAGE_COPY[current] || POST_RUN_STAGE_COPY.actions;
      const body = drawMachinePanel(x, y, w, h, {
        label: stageCopy.panel,
        source: pageSource,
        footer: current === 'actions'
          ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CONFIRM' }])
          : promptLine([{ action: 'continue', label: 'CONTINUE' }]),
        meter: current !== 'actions',
      });

      if(current==='filing'){
        drawVfdText(body.x, body.y, stageCopy.title, { color: UI_COLOR.danger, max: body.w });
        uiCenter(body.y + Math.floor(body.h / 2), POST_RUN_STAGE_COPY.filing.primary, 'ui-amber');
        uiCenter(body.y + Math.floor(body.h / 2) + 3, POST_RUN_STAGE_COPY.filing.secondary, 'ui-secondary');
        return;
      }

      if (current === 'report') {
        drawVfdText(body.x, body.y, stageCopy.title, { color: UI_COLOR.amber, max: body.w });
        let ry = body.y + 4;
        const labelW = Math.min(20, Math.max(12, Math.floor(body.w * 0.28)));
        const valueX = body.x + labelW + 1;
        for (const [label, value] of reportRows(summary).slice(0, Math.max(1, Math.floor((body.h - 5) / 2)))) {
          uiText(body.x, ry, label.slice(0, labelW).padEnd(labelW), 'ui-secondary');
          uiText(valueX, ry, value.slice(0, Math.max(1, body.x + body.w - valueX)), label === 'ENDING' ? 'ui-amber' : 'ui-primary');
          ry += 2;
        }
        const result = summary.rules?.startedPreset === 'dead-air'
          ? summary.integrity?.deadAir?.eligible ? 'DEAD AIR ACHIEVEMENT EARNED' : 'DEAD AIR REQUIREMENTS NOT MET'
          : 'RUN COMPLETE';
        uiCenter(body.y + body.h - 1, result, result.includes('NOT MET') ? 'ui-danger' : 'ui-green');
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
          const feature = FEATURE_COPY[id];
          const text = id.startsWith('cosmetic:') ? `DISPLAY / ${id.slice(9).replaceAll('-', ' ').toUpperCase()}` : feature?.label || id.toUpperCase();
          uiText(body.x, ry, `▸ ${text}`.slice(0, body.w), id === 'deadAir' ? 'ui-danger' : 'ui-amber');
          const description = feature?.description;
          if(description&&ry+1<=maxY)uiText(body.x+2,ry+1,description.slice(0,Math.max(1,body.w-2)),'ui-secondary');
          ry += 3;
        }
        return;
      }

      if (current === 'second-shift') {
        const ending = returnDefinition(summary.endingId);
        const completed = Math.max(1, Number(summary.endingsAtCompletion) || 1);
        const unseen = Math.max(0, Object.keys(NEXT_ENDING_HINTS).length - completed);
        drawVfdText(body.x, body.y, stageCopy.title, { color: UI_COLOR.danger, max: body.w });
        if (unseen === 0) {
          uiText(body.x, body.y + 5, 'ALL ENDINGS FOUND', 'ui-amber');
          uiWrap('You can still replay the story, change difficulty, or play THE HUSH from a qualifying completed run.', body.w).slice(0, 5)
            .forEach((line, i) => uiText(body.x, body.y + 8 + i, line, 'ui-primary'));
          return;
        }
        uiText(body.x, body.y + 4, 'YOU REACHED', 'ui-label');
        uiText(body.x, body.y + 6, ending?.title || summary.endingId.toUpperCase(), 'ui-amber');
        uiText(body.x, body.y + 9, 'HINT FOR ANOTHER ENDING', 'ui-label');
        uiWrap(endingHintForEnding(summary.endingId) || 'Try changing a major choice near the end of the story.', body.w).slice(0, 5)
          .forEach((line, i) => uiText(body.x, body.y + 11 + i, line, 'ui-primary'));
        uiText(body.x, body.y + body.h - 3, `${unseen} ENDING${unseen === 1 ? '' : 'S'} STILL UNSEEN`, 'ui-danger');
        return;
      }

      drawVfdText(body.x, body.y, stageCopy.title, { color: UI_COLOR.amber, max: body.w });
      const causal = getCausalStatus() || {};
      const filed = Object.keys(getMeta()?.knowledge?.documents || {}).length;
      const hushCopy = transferRoomCopy({ filed });
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
      const replayAction = POST_RUN_ACTIONS[0];
      const hushAction = POST_RUN_ACTIONS[1];
      uiText(leftX + 2, panelY + 2, `${action === 0 ? '▸ ' : ''}${replayAction.label}`, action === 0 ? 'ui-amber' : 'ui-primary');
      uiWrap(replayAction.body, panelW - 4).slice(0, 4)
        .forEach((line, i) => uiText(leftX + 2, panelY + 5 + i, line, 'ui-secondary'));
      uiText(leftX + 2, panelY + panelH - 2, 'CHOOSE DIFFICULTY', 'ui-label');

      uiText(rightX + 2, panelY + 2, `${action === 1 ? '▸ ' : ''}${hushAction.label}`, action === 1 ? 'ui-danger' : hushCopy.enabled ? 'ui-amber' : 'ui-secondary');
      uiWrap(hushCopy.body, panelW - 4).slice(0, 4)
        .forEach((line, i) => uiText(rightX + 2, panelY + 5 + i, line, hushCopy.enabled ? 'ui-primary' : 'ui-secondary'));

      const footerY = body.y + body.h - 4;
      const archiveAction = POST_RUN_ACTIONS[2];
      const titleAction = POST_RUN_ACTIONS[3];
      uiText(body.x + 2, footerY, `${action === 2 ? '▸ ' : ''}${archiveAction.label}`, action === 2 ? 'ui-amber' : 'ui-secondary');
      const titleLabel = `${action === 3 ? '▸ ' : ''}${titleAction.label}`;
      uiText(body.x + Math.max(0, body.w - titleLabel.length), footerY, titleLabel, action === 3 ? 'ui-amber' : 'ui-secondary');
    },
  };
}
