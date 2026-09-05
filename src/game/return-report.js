import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import {
  drawLocationIndicator, drawMachinePanel, drawVfdCounter, drawVfdText,
} from '../render/presentation.js';
import { drawTakeRail } from '../render/field-deck.js';
import { drawVfdGlyph } from '../render/vfd-font.js';
import { monitorSnapshotForRms } from '../audio/monitor.js';
import { fitText } from '../render/fit-text.js';

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
// WHAT THE HEADER METER READS ONCE THE NIGHT IS OVER.
//
// drawMachinePanel defaults to the live HUSH exposure snapshot, which measures
// SEMANTIC PLAYER NOISE and is therefore flat zero the moment the run ends — the
// needle on this screen has always been dead. It reads the RETURN instead: how
// much of the job came back, so a full five-take night pins it and an empty one
// barely moves. It is the only honest thing left for it to measure.
function returnMeterSnapshot(summary) {
  const done = Math.max(0, Math.min(5, Number(summary?.takes?.completed) || 0));
  const spoiled = Math.max(0, Number(summary?.takes?.spoiled) || 0);
  // Spoiled takes are signal that went to tape and came back unusable, so they
  // register as peak without registering as level.
  return monitorSnapshotForRms(done / 5, {
    peak: Math.min(1, (done + spoiled) / 5),
    clipped: spoiled > 0 && done === 0,
  });
}

// ONE SECTION OF THE ACCOUNT, RASTERISED FOR A PANE.
//
// The window panes cannot draw text — window-media-surface.js is a WebGL shader
// with an image sampler and a handful of procedural forms, and no glyph path at
// all. A `text` pane therefore renders in the in-canvas simulation and comes up
// BLACK on the desktop, which is the wrong way round for a feature whose whole
// point is the desktop.
//
// So each section is drawn here, offscreen, in the same 5x7 ROM the rest of the
// interface uses, and handed over as an image. The composition's own
// nvme-sector fault then chews on it exactly as it chews on the footage — the
// account degrades along with everything else in the shot, which is a better
// result than clean text would have been.
function renderSectionImage(heading, entries, { width = 320, height = 210 } = {}) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Flat black glass, like every other panel in the game.
  ctx.fillStyle = '#05070A';
  ctx.fillRect(0, 0, width, height);

  const cellW = 11, cellH = 15, pad = 12;
  const put = (text, col, row, color, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    [...String(text)].forEach((ch, i) => {
      drawVfdGlyph(ctx, ch, pad + (col + i) * cellW, pad + row * cellH, cellW, cellH,
        { color, dim: null, blur: 3.2, dpr: 1, alpha: 1 });
    });
    ctx.restore();
  };
  const cols = Math.floor((width - pad * 2) / cellW);

  put(String(heading).toUpperCase().slice(0, cols), 0, 0, UI_COLOR.amber);
  ctx.save();
  ctx.globalAlpha = 0.34; ctx.fillStyle = UI_COLOR.amber;
  ctx.fillRect(pad, pad + cellH + 2, width - pad * 2, 1);
  ctx.restore();

  entries.slice(0, Math.floor((height - pad * 2) / cellH) - 2).forEach(([label, value], index) => {
    const row = index + 2;
    const name = String(label).toUpperCase();
    const shown = fitText(String(value), Math.max(3, cols - name.length - 1));
    put(name.slice(0, cols), 0, row, UI_COLOR.secondary || '#9A7B3F', 0.8);
    put(shown, Math.max(0, cols - shown.length), row, UI_COLOR.primary || '#F2A81E');
  });

  try { return canvas.toDataURL('image/webp', 0.82); } catch (_) { return null; }
}

// The whole account, one image per section, for the surfaces.
export function returnSectionImages(summary) {
  return reportSections(summary)
    .map(([heading, entries]) => ({ label: heading, image: renderSectionImage(heading, entries) }))
    .filter((page) => !!page.image);
}

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
  // True once the return composition has actually taken the sections. main.js
  // owns that answer because it owns the director.
  sectionsOnPanes = () => false,
  // Called once when the reader advances past the account.
  onAccountRead = () => {},
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
        const wasReport = stages[stage]?.id === 'report';
        stage = Math.min(stages.length - 1, stage + 1);
        // The account has been read; the surfaces let it go rather than sitting
        // over every screen that follows.
        if (wasReport && stages[stage]?.id !== 'report') onAccountRead();
        AUDIO.menuConfirm(); return true;
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

    // The transport, reading the return. Everything on it is an instrument
    // showing a real figure, not a label with a number typed beside it.
    drawTransport(x, y, w, h, pageSource) {
      // The header is wordmark + model + label + SOURCE + meter on one row, and
      // at the narrow width it ran out of room and truncated mid-word. The
      // brand is the first thing a faceplate can afford to lose.
      const narrow = w < 70;
      const body = drawMachinePanel(x, y, w, h, {
        label: 'RETURN',
        source: pageSource,
        wordmark: narrow ? '' : 'AUDIOCORP',
        model: 'DA-1000',
        footer: promptLine([{ action: 'continue', label: 'CONTINUE' }]),
        // The header meter is fed the run rather than the live HUSH exposure,
        // which is flat zero once the run is over and has always read dead here.
        meterSnapshot: returnMeterSnapshot(summary),
        meter: true,
      });

      const left = body.x;
      const width = body.w;
      const ret = returnDefinition(summary.endingId);

      // WHAT CAME BACK, on the top line, in the machine's own large type.
      drawVfdText(left, body.y, ret?.title || String(summary.endingId || '').toUpperCase(), {
        color: UI_COLOR.amber, max: width,
      });
      uiText(left, body.y + 3, ret?.classification || 'UNCLASSIFIED', 'ui-label', 0.72);

      // TIME ON SITE — the segment counter, which is what a transport shows.
      uiText(left, body.y + 5, 'TIME ON SITE', 'ui-label', 0.68);
      drawVfdCounter(left, body.y + 6, formatDuration(summary.durationSeconds), { theme: 'amber' });

      // TAKES and what they cost, on the rail built for exactly this pair and
      // never once called from this screen.
      drawTakeRail({
        x: left, y: body.y + 9,
        done: Number(summary.takes?.completed) || 0,
        total: 5,
        injuries: Number(summary.injuries) || 0,
      });

      // THE ROOMS HE ACTUALLY WALKED. The old report printed the COUNT and threw
      // the room list away; takes.rooms has been in the summary all along.
      const rooms = summary.takes?.rooms || [];
      // The bar reads how much of the job came back. It was pinned at 1 — a full
      // amber rail on a night with no takes at all, which is the opposite of the
      // truth.
      const filedShare = Math.max(0, Math.min(1, (Number(summary.takes?.completed) || 0) / 5));
      drawLocationIndicator(left, body.y + 11, width, filedShare, {
        theme: 'amber',
        label: 'ROOMS FILED',
        rows: 1,
        marks: rooms.map((id, index) => ({
          at: rooms.length > 1 ? index / (rooms.length - 1) : 0,
          label: roomLabel(id).toUpperCase().slice(0, 10),
        })),
      });

      // THE SECTIONS BELONG TO THE PANES, NOT TO BOTH.
      //
      // When the composition took, every section is already out on the surfaces
      // (or on the in-canvas panes, which is the same plan) and repeating them
      // here is just clutter over the instruments. They are printed in the
      // window ONLY as the fallback — no DOM to rasterise into, fewer than two
      // sections, a refused pool — so the account is never lost, and never shown
      // twice.
      if (sectionsOnPanes()) {
        // With the account out on the surfaces the column has room for what a
        // transport shows when it is not reading: what came back, and whether
        // the second track took.
        const causal = getCausalStatus() || {};
        const foot = body.y + body.h - 5;
        uiLine(left, foot - 1, left + width - 1, foot - 1, UI_COLOR.frame, 0.28);
        uiText(left, foot, 'STATUS', 'ui-label', 0.62);
        uiText(left + width - reportStamp(summary).length, foot, reportStamp(summary), 'ui-amber');
        const tape = causal.status === 'ready' ? 'SECOND TRACK SEALED'
          : causal.status === 'not-qualified' ? 'SECOND TRACK REFUSED'
            : 'SECOND TRACK FILING';
        uiText(left, foot + 2, 'SECOND TRACK', 'ui-label', 0.62);
        const tail = tape.replace('SECOND TRACK ', '');
        uiText(left + width - tail.length, foot + 2, tail,
          causal.status === 'ready' ? 'ui-green' : causal.status === 'not-qualified' ? 'ui-danger' : 'ui-secondary');
        return;
      }
      const sections = reportSections(summary);
      let ry = body.y + 15;
      const colW = Math.floor((width - 2) / 2);
      let col = 0;
      for (const [heading, entries] of sections) {
        if (ry + entries.length + 2 > body.y + body.h - 1) {
          if (col === 1) break;
          col = 1; ry = body.y + 15;
        }
        const cx = left + col * (colW + 2);
        uiText(cx, ry, heading, 'ui-label', 0.62);
        ry += 1;
        for (const [label, value] of entries) {
          const shown = fitText(String(value), Math.max(4, colW - label.length - 2));
          uiText(cx, ry, label, 'ui-secondary', 0.78);
          uiText(cx + colW - shown.length, ry, shown, 'ui-primary');
          ry += 1;
        }
        ry += 1;
      }
    },

    drawReport() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      // WHEN THE SECTIONS ARE OUT ON THE SURFACES, THE TRANSPORT MAKES ROOM.
      //
      // At full width the panes have nowhere to go and land on top of the panel,
      // clipping its own header. Narrowing the centre column turns that into the
      // arrangement it should be: the machine in the middle, the account around
      // it. Native panes sit outside the frame entirely, so this only matters for
      // the in-canvas path — which is every browser run and every session with
      // choreography off, so it matters.
      const currentStage = stages[stage];
      const spread = currentStage.id === 'report' && sectionsOnPanes();
      const w = Math.min(spread ? 56 : 88, cols - 4);
      const h = Math.min(Math.max(30, rows - 8), rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const current = currentStage.id;
      const pageSource = currentStage.pages > 1 ? `${currentStage.page}/${currentStage.pages}` : '4417-C';
      const stageCopy = POST_RUN_STAGE_COPY[current] || POST_RUN_STAGE_COPY.actions;

      // THE MACHINE READS THE NIGHT BACK.
      //
      // A first pass drew this as a cream form on stock. It was too fake, and it
      // was never going to be otherwise: the game owns REAL paper — 211
      // documents rasterised offline at 2048x2896 with impact-printer
      // morphology, in assets/paper — and a beige rectangle with a noise wash
      // cannot stand next to that. So it stops imitating a material this game
      // already does properly and goes back to the one it is actually made of.
      //
      // The DA-1000 is the frame for it. The night was a recording job; the
      // return is that tape played back. The counter runs the time on site, the
      // location indicator walks the rooms actually taken, the take rail shows
      // the takes and what they cost. Those instruments are all built and
      // tested and were unused by this screen while it printed the same numbers
      // as ASCII strings.
      if (current === 'report') { this.drawTransport(x, y, w, h, pageSource); return; }

      const body = drawMachinePanel(x, y, w, h, {
        label: stageCopy.panel,
        source: pageSource,
        footer: current === 'actions'
          ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CONFIRM' }])
          : promptLine([{ action: 'continue', label: 'CONTINUE' }]),
        meter: current !== 'actions',
        meterSnapshot: returnMeterSnapshot(summary),
      });

      if (current === 'filing') {
        drawVfdText(body.x, body.y, stageCopy.title, { color: UI_COLOR.danger, max: body.w });
        uiText(body.x, body.y + 4, POST_RUN_STAGE_COPY.filing.primary, 'ui-amber');
        uiWrap(POST_RUN_STAGE_COPY.filing.secondary, body.w).slice(0, 2)
          .forEach((line, i) => uiText(body.x, body.y + 6 + i, line, 'ui-secondary'));
        // The status the machine will print once it settles. Held, not blank.
        uiText(body.x, body.y + body.h - 2, `STATUS  ${reportStamp(summary)}`, 'ui-label', 0.6);
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

      if (current === 'actions') {
        // WHAT IS TO BE DONE WITH THE RETURN.
        //
        // This was two equal cards side by side, each with a bold heading, four
        // wrapped lines of body copy and a small label, over two text links —
        // structurally a two-column CTA landing page, and the most web-shaped
        // thing in the build. It is a selection list on an instrument now: one
        // row each, a caret on the live one, the reason in the right column.
        const hushCopy = transferRoomCopy({ filed: filedCount() });
        const causal = getCausalStatus() || {};
        drawVfdText(body.x, body.y, stageCopy.title, { color: UI_COLOR.amber, max: body.w });
        const notes = {
          replay: 'NEW WORKS ORDER · TERMS TO BE SET',
          'transfer-room': hushCopy.enabled ? (hushCopy.note || 'FILE AND COLLECT') : 'NOT AVAILABLE ON THIS RETURN',
          archive: `${filedCount()} DOCUMENT${filedCount() === 1 ? '' : 'S'} ON FILE`,
          title: 'CLOSE THE FILE',
        };
        let ry = body.y + 5;
        POST_RUN_ACTIONS.forEach((entry, index) => {
          const picked = index === action;
          const available = entry.id !== 'transfer-room' || hushCopy.enabled !== false;
          const label = String(entry.label || '').toUpperCase();
          uiText(body.x, ry, picked ? '▸' : ' ', 'ui-amber');
          uiText(body.x + 2, ry, label, picked ? 'ui-amber' : available ? 'ui-primary' : 'ui-secondary', available ? 1 : 0.5);
          const note = fitText(String(notes[entry.id] || ''), Math.max(6, body.w - label.length - 6));
          if (note) uiText(body.x + body.w - note.length, ry, note, 'ui-secondary', available ? 0.72 : 0.4);
          uiLine(body.x, ry + 1, body.x + body.w - 1, ry + 1, picked ? UI_COLOR.amber : UI_COLOR.frame, picked ? 0.5 : 0.16);
          ry += 3;
        });
        // The causal tape's own line, which only ever appeared as a spinner.
        const tape = causal.status === 'ready' ? 'SECOND TRACK SEALED'
          : causal.status === 'not-qualified' ? `SECOND TRACK REFUSED · ${CAUSAL_REQUIREMENT}`
            : '';
        if (tape) uiText(body.x, body.y + body.h - 2, tape, 'ui-label', 0.6);
        uiText(body.x + body.w - 12, body.y + body.h - 2, `STATUS ${reportStamp(summary)}`, 'ui-label', 0.6);
        return;
      }
    },
  };
}
