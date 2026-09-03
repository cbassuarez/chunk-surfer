import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import {
  drawFormRow, drawFormRule, drawFormStamp, drawMachinePanel, drawPaperPanel, drawVfdText,
} from '../render/presentation.js';
import { fitText } from '../render/fit-text.js';
import { PAPER_ISSUER } from '../data/paper-system.js';

// The company whose form this is. Authored data, not a string we invented here.
const RETURN_ISSUER = PAPER_ISSUER.ELLERY_WORKS;
// A works order number, not a slice of a UUID. Digits only, five of them, so
// the sheet carries something a filing clerk could actually read back.
const formNumber = (runId = '') => {
  let n = 0;
  for (const ch of String(runId)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return String(n % 100000).padStart(5, '0');
};
const filedCount = () => Object.keys(getMeta()?.knowledge?.documents || {}).length;
import { UI_COLOR } from '../render/palette.js';
import { CAUSAL_REQUIREMENT, tapeQualifies } from '../causal/tape.js';
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

// THE RETURN, AS W. ELLERY RECEIVES IT.
//
// This was eleven label/value pairs. buildRunSummary hands over far more than
// that and the form threw nearly all of it away: the entire signal-combat record
// (battles started/won/lost), WHICH rooms were taken rather than how many, the
// documents read, what came back from the equipment issue and what did not.
// A works order that came back with kit missing says so on the form; that is
// what the form is for.
//
// Grouped into sections, because a form has sections. Each entry is
// [label, value] and a bare string is a section heading.
function reportSections(summary) {
  const ret = returnDefinition(summary.endingId);
  const contaminated = summary.takes?.contaminated || [];
  const rooms = summary.takes?.rooms || [];
  const battles = summary.battles || {};
  const equipment = summary.equipment || {};
  const missing = equipment.missing || [];

  const engagements = Number(battles.started) || 0;
  const sections = [
    ['THE JOB', [
      ['DISPOSITION', ret?.title || String(summary.endingId || '').toUpperCase()],
      ['CLASSIFICATION', ret?.classification || 'UNCLASSIFIED'],
      ['TERMS', String(summary.rules?.startedPreset || 'contract').replaceAll('-', ' ').toUpperCase()],
      ['TIME ON SITE', formatDuration(summary.durationSeconds)],
      ...(summary.interference?.caseId ? [['CASE', `${summary.interference.caseId} / ${summary.interference.classification || 'UNRESOLVED'}`]] : []),
    ]],
    ['TAKES', [
      ['ACCEPTED', `${summary.takes.completed} OF 5`],
      ['SPOILED', String(summary.takes.spoiled)],
      ['CONTAMINATED', String(contaminated.length)],
      // WHICH rooms, not how many. The count was all the form ever printed and
      // the room list has been in the summary the whole time.
      ...(rooms.length ? [['ROOMS FILED', rooms.map((id) => roomLabel(id).toUpperCase()).join(', ')]] : []),
      ...(contaminated.length ? [['AFFECTED', contaminated.map((id) => roomLabel(id).toUpperCase()).join(', ')]] : []),
    ]],
  ];

  // The night's fighting was completely invisible on this form. It is only
  // printed when there was any — a quiet return should not carry an empty
  // section about violence.
  if (engagements > 0) {
    sections.push(['ENGAGEMENTS', [
      ['ENCOUNTERED', String(engagements)],
      ['RESOLVED', String(Number(battles.won) || 0)],
      ['LOST', String(Number(battles.lost) || 0)],
      ...(Number(battles.firstPassWon) ? [['CLEAN AT FIRST PASS', String(battles.firstPassWon)]] : []),
    ]]);
  }

  sections.push(['THE RECORDIST', [
    ['INJURIES CARRIED', String(summary.injuries)],
    ['DISCLOSURES FOUND', String(summary.disclosures.found)],
    ...(Number(summary.documents?.read) ? [['DOCUMENTS READ', String(summary.documents.read)]] : []),
  ]]);

  sections.push(['EQUIPMENT', [
    ['RETURNED', `${equipment.returned} OF ${equipment.issued}`],
    // A works order does not shrug about missing kit. Name it.
    ...(missing.length ? [['NOT RETURNED', missing.map((id) => String(id).toUpperCase()).join(', ')]] : []),
    ...(Number(equipment.recovered) ? [['RECOVERED ON SITE', String(equipment.recovered)]] : []),
  ]]);

  return sections;
}

// The stamp the office puts on the bottom of the sheet.
function reportStamp(summary) {
  if (summary.rules?.startedPreset === 'dead-air') {
    return summary.integrity?.deadAir?.eligible ? 'DEAD AIR' : 'NOT MET';
  }
  if (Number(summary.injuries) > 0) return 'FILED';
  if (Number(summary.takes?.completed) >= 5) return 'COMPLETE';
  return 'FILED';
}

export function makeReturnReportScene({
  summary,
  onReopen = () => {},
  onTransferRoom = () => {},
  onArchive = () => {},
  onTitle = () => {},
  getCausalStatus = () => summary.causalTape || { status: tapeQualifies(summary.injuries) ? 'filing' : 'not-qualified' },
} = {}) {
  const RETURN_REF = `${RETURN_ISSUER.formPrefix}${formNumber(summary.runId || summary.id || '4417')}`;
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

    // The sheet itself. One column of ruled sections, a stamp at the foot.
    drawReturnSheet(x, y, w, h) {
      // A SHEET IS AS LONG AS WHAT IS TYPED ON IT.
      //
      // Holding the full panel height left a hand's width of blank stock above
      // the RECEIVED rule, which is the thing that made the old screens read as
      // a content card floating in a page. Measure the sections, cut the paper
      // to them, and centre what is left.
      // +14: drawPaperPanel keeps 4 rows of margin for itself, and the sheet
      // spends 10 more on the letterhead, the two rules and the received line.
      // Getting this wrong by exactly the panel's own padding is what pushed the
      // last section onto an imaginary continuation sheet.
      const needed = reportSections(summary).reduce((sum, [, entries]) => sum + entries.length + 2, 0) + 14;
      const fitted = Math.max(16, Math.min(h, needed));
      const top = y + Math.floor((h - fitted) / 2);
      const sheet = drawPaperPanel(x, top, w, fitted);
      const left = sheet.x + 1;
      const width = sheet.w - 2;

      // Letterhead. The issuer is real authored data — W. ELLERY / WORKS, with
      // a Brighouse address and a form prefix — so the form says who it belongs
      // to in the company's own words rather than in ours.
      uiText(left, sheet.y, RETURN_ISSUER.mark, 'paper-ink');
      uiText(left, sheet.y + 1, RETURN_ISSUER.descriptor, 'paper-ink', 0.62);
      uiText(left + width - RETURN_REF.length, sheet.y, RETURN_REF, 'paper-ink', 0.86);
      uiText(left + width - 15, sheet.y + 1, 'RETURN OF WORKS', 'paper-ink', 0.62);
      drawFormRule(left, sheet.y + 2, width, { alpha: 0.42, weight: 2 });

      // The body, section by section, until the sheet runs out. A form that
      // overflows its page is a form with a second page, not a form with a
      // scrollbar — so it stops, and the count of what did not fit is honest.
      let ry = sheet.y + 4;
      const foot = sheet.y + sheet.h - 4;
      let dropped = 0;
      for (const [heading, entries] of reportSections(summary)) {
        if (ry + 2 + entries.length > foot) { dropped += entries.length; continue; }
        uiText(left, ry, heading, 'paper-ink', 0.55);
        drawFormRule(left, ry, width, { alpha: 0.18 });
        ry += 1;
        for (const [label, value] of entries) {
          ry = drawFormRow(left + 1, ry, width - 1, label, fitText(String(value), width - label.length - 4));
        }
        ry += 1;
      }
      if (dropped) uiText(left + 1, foot - 1, `${dropped} FURTHER ENTR${dropped === 1 ? 'Y' : 'IES'} ON CONTINUATION SHEET`, 'paper-ink', 0.42);

      drawFormRule(left, foot, width, { alpha: 0.42, weight: 2 });
      uiText(left, foot + 1, 'RECEIVED', 'paper-ink', 0.55);
      uiText(left + 10, foot + 1, RETURN_ISSUER.address[1] || '', 'paper-ink', 0.42);
      drawFormStamp(left + width - 14, foot + 1, reportStamp(summary), { alpha: 0.9 });

      const prompt = promptLine([{ action: 'continue', label: 'CONTINUE' }]);
      uiText(left, sheet.y + sheet.h - 1, prompt, 'paper-ink', 0.5);
    },

    // THE DISPOSITION BLOCK, WHICH IS NOT TWO CALLS TO ACTION.
    //
    // This was a pair of equal-width cards side by side, each with a bold
    // heading, four wrapped lines of body copy and a small label, over two text
    // links in the footer. That is a landing page, and it was the most
    // web-shaped thing in the build.
    //
    // A form ends by asking what is to be done with it. Four ruled rows, one
    // tick box each, the selected one stamped — the same four POST_RUN_ACTIONS
    // and the same keys, on the same sheet as everything above it.
    drawDisposition(x, y, w, h, { causal = {}, hushCopy = {} } = {}) {
      // Four rows and a foot. Same reason as the sheet above.
      const fitted = Math.max(16, Math.min(h, POST_RUN_ACTIONS.length * 2 + 12));
      const top = y + Math.floor((h - fitted) / 2);
      const sheet = drawPaperPanel(x, top, w, fitted);
      const left = sheet.x + 1;
      const width = sheet.w - 2;

      uiText(left, sheet.y, RETURN_ISSUER.mark, 'paper-ink');
      uiText(left + width - RETURN_REF.length, sheet.y, RETURN_REF, 'paper-ink', 0.86);
      uiText(left, sheet.y + 1, 'DISPOSITION OF THIS RETURN', 'paper-ink', 0.62);
      drawFormRule(left, sheet.y + 2, width, { alpha: 0.42, weight: 2 });

      // One line each. The description that used to be a paragraph of body copy
      // is the form's own note column, which is where a form puts it.
      const notes = {
        replay: 'NEW WORKS ORDER · TERMS TO BE SET',
        'transfer-room': hushCopy.enabled ? (hushCopy.note || 'FILE AND COLLECT') : 'NOT AVAILABLE ON THIS RETURN',
        archive: `${filedCount()} DOCUMENT${filedCount() === 1 ? '' : 'S'} ON FILE`,
        title: 'CLOSE THE FILE',
      };
      let ry = sheet.y + 4;
      POST_RUN_ACTIONS.forEach((entry, index) => {
        const picked = index === action;
        const available = entry.id !== 'transfer-room' || hushCopy.enabled !== false;
        const box = picked ? '[X]' : '[ ]';
        const alpha = available ? 1 : 0.45;
        uiText(left, ry, box, 'paper-ink', alpha);
        uiText(left + 4, ry, String(entry.label || '').toUpperCase(), 'paper-ink', alpha);
        const note = fitText(String(notes[entry.id] || ''), Math.max(4, width - 30));
        if (note) uiText(left + width - note.length, ry, note, 'paper-ink', alpha * 0.5);
        drawFormRule(left, ry, width, { alpha: picked ? 0.34 : 0.12 });
        ry += 2;
      });

      const foot = sheet.y + sheet.h - 4;
      drawFormRule(left, foot, width, { alpha: 0.42, weight: 2 });
      // The causal tape's own line, which the report only ever showed as a
      // spinner on the filing stage.
      const tape = causal.status === 'ready' ? 'SECOND TRACK SEALED'
        : causal.status === 'not-qualified' ? `SECOND TRACK REFUSED · ${CAUSAL_REQUIREMENT}`
          : '';
      if (tape) uiText(left, foot + 1, tape, 'paper-ink', 0.5);
      drawFormStamp(left + width - 14, foot + 1, POST_RUN_ACTIONS[action]?.id === 'title' ? 'CLOSED' : 'PENDING', { alpha: 0.85 });

      const prompt = promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CONFIRM' }]);
      uiText(left, sheet.y + sheet.h - 1, prompt, 'paper-ink', 0.5);
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

      // THE RETURN IS PAPERWORK, AND PAPERWORK IS NOT ON THE GLASS.
      //
      // The night is over and the building is behind him. Everything up to this
      // point is lit — phosphor behind glass, in the dark. This is the first
      // surface in the game that is a physical object under an office lamp, and
      // that tonal break IS the ending: you are out, and now somebody files you.
      //
      // It is drawn rather than rasterised because a return form carries
      // TONIGHT's numbers. The offline paper pipeline (game/paper-assets.js)
      // owns the 211 authored documents and its own rule is that "strings were
      // fixed before this program runs" — which is exactly what a form filled in
      // from a live run cannot be. Printed stationery, typed entries: the
      // stationery is the sheet, the entries are drawn onto it now.
      if (current === 'report') { this.drawReturnSheet(x, y, w, h); return; }
      if (current === 'actions') {
        const causal = getCausalStatus() || {};
        const hushCopy = transferRoomCopy({ filed: filedCount() });
        this.drawDisposition(x, y, w, h, { causal, hushCopy });
        return;
      }

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
        // Drawn on the sheet, not on the glass — see drawReport's paper branch.
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

    },
  };
}
