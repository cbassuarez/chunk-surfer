// Thinking, over a corridor that has not stopped.
//
// The same conversation machine as the cold open, drawn over the live world:
//
//   blocksInput: true    you cannot walk while you are deciding what to think
//   blocksWorld: FALSE   the presence keeps hunting. Noise keeps decaying. The
//                        building keeps rearranging behind you.
//
// This is the point. Thinking costs time, in a building that spends it. If it
// reaches you in the middle of a thought, then that is the scene, and it is
// the scene precisely because you were given three ways to reassure yourself
// and you took one.
//
// Four of these exist (see data/conservatory-script.js):
//
//   POST_DOOR   the push bar is not where the push bar is
//   FIRST_TAKE  the only place the game says the rule out loud
//   HUSH        the first time it gets close
//   RADIO_DEAD  the guard told you twice not to shake it

import * as scenes from './scenes.js';
import { uiSize, uiScrim } from '../render/ui.js';
import { withMachinePanel } from '../render/presentation.js';
import { createConversation } from './conversation.js';
import {
  drawStoryArtCard,
  planStoryArtInPanel,
  planStoryArtSideBySide,
  storyArtSideBySidePanelRows,
  storyArtSideBySideTextLayout,
} from './story-art-card.js';
import { resolveStoryArt } from './story-art.js';
import {
  drawTranscript,
  drawTranscriptChoices,
  drawTranscriptHeader,
  fixedTranscriptLanes,
  layoutTranscript,
  layoutTranscriptChoices,
  transcriptSource,
} from '../render/transcript.js';
import { promptLine } from './bindings.js';

// Match the cold-open dialogue shell width (COL_W) so the in-world thought
// monitor reads as the same machine, not a narrower one-off.
const BAND_W = 86;

// The glass, not the outer faceplate, is the reading budget. Measure the
// complete current utterance so typing never makes its container jump.
export function planThoughtTextPanel({view={},width=BAND_W,rows=40,slate='',page=0}={}) {
  const contentW=Math.max(8,width-8),choices=layoutTranscriptChoices(view,contentW);
  const reserve=choices.height?choices.height+1:0,maxHeight=Math.max(8,rows-4);
  let headerSlate=slate,headerSystem=view.speaker||'';
  const headerRows=()=> (headerSlate?1:0)+(headerSystem?(headerSlate?2:1):0);
  if(maxHeight-6.5-headerRows()-1-reserve<3)headerSystem='';
  if(maxHeight-6.5-headerRows()-1-reserve<3)headerSlate='';
  const headerOffset=headerRows()+(headerRows()?1:0);
  const full=String(view.line?.text??'');
  const history=Array.isArray(view.history)?view.history:[];
  const latest=view.pending?.kind==='branch'
    ? {...view,history:history.slice(-1),line:null,typed:0}
    : {...view,history:[],typed:full.length,typing:false};
  const needed=layoutTranscript(latest,{width:contentW,maxRows:10000,keep:3});
  const panelH=Math.min(maxHeight,Math.max(12,Math.ceil(6.5+headerOffset+reserve+needed.height)));
  const availableRows=Math.max(1,Math.floor(panelH-6.5-headerOffset-reserve));
  const active=layoutTranscript(view.pending?.kind==='branch'?latest:{...view,history:[]},{width:contentW,maxRows:10000,keep:3});
  const block=active.blocks.at(-1),fullBlock=needed.blocks.at(-1);
  const bodyCapacity=Math.max(1,availableRows-(fullBlock?.labelRows||0)-1);
  const pages=Math.max(1,Math.ceil((fullBlock?.rows.length||0)/bodyCapacity));
  const currentPage=Math.max(0,Math.min(pages-1,Math.floor(Number(page)||0)));
  let transcript;
  if(pages>1&&block){
    const body=block.rows.slice(currentPage*bodyCapacity,(currentPage+1)*bodyCapacity);
    transcript={...active,blocks:[{...block,rows:body,height:block.labelRows+body.length+1}],height:Math.min(availableRows,block.labelRows+body.length+1)};
  }else{
    // Consecutive speech groups with history; remove history before allowing
    // the current utterance to be cropped by that group.
    let kept=history.slice(-3);
    do{
      transcript=layoutTranscript({...view,history:kept},{width:contentW,maxRows:availableRows,keep:3});
      if(!transcript.blocks.some(b=>b.clipped)||!kept.length)break;
      kept=kept.slice(1);
    }while(true);
  }
  return {panelH,contentW,headerSlate,headerSystem,headerOffset,availableRows,transcript,pages,page:currentPage,bodyCapacity};
}

// A thought tree is a scene like any other. `onDone` fires once, when he stops
// thinking and the building is his problem again.
// `anchor: 'bottom'` drops the shell to the foot of the screen and leaves the
// middle of the frame alone. It exists for beats that are ABOUT something the
// player has to keep watching — the level-check daydream is the case: the whole
// point of him counting to six is that you are looking at the recorder's meter
// while he does it, and a centred panel over a 0.62 scrim buries the machine the
// beat is narrating. Combined with `scrim: 0` it reads as the monitor band
// talking under a take that is still visibly rolling.
// `slate` and `blocksWorld` exist for one caller: the cold open, which used to be
// a full-screen scene of its own (makeColdOpenScene) and is now a conversation
// held at a window in the world. It is the same shell either way — the same
// createConversation, transcript, choices and story art — so rather than keep two
// presenters, the two things the black-screen version had that a thought does not
// are options here. A thought is something you have while walking, so it still
// defaults to letting the world through; a conversation with another person is
// not, so that caller passes blocksWorld.
export function makeThoughtScene({
  id = 'thought', nodes, startAt = 'start', onDone, onChoice, onLine, cue, fx, audio, getAudio, replay = null,
  scrim = 0.62, lensPreset = 'calm', anchor = 'center', slate = '', blocksWorld = false, worldView = null, onExit = null,
  escapable = true, allowsLook = true, onCancel = null, showStoryArt = true,
} = {}) {
  let completed = false;
  let cancelled = false;
  let scene = null;
  let textPage=0,textPageKey='';
  function textPlan(v){
    const key=`${v.nodeId||''}:${v.lineSerial||0}:${v.pending?.kind||''}`;
    if(key!==textPageKey){textPageKey=key;textPage=0;}
    const {cols,rows}=uiSize();
    return planThoughtTextPanel({view:v,width:Math.min(BAND_W,cols-8),rows,slate,page:textPage});
  }
  const convo = createConversation({
    nodes, startAt, sceneId: `thought:${id}`, replay, onChoice, onLine, cue, fx, audio, getAudio,
    volume: 0.24,
    onDone: () => {
      if (completed || cancelled) return;
      completed = true;
      scenes.remove(scene);
      onDone?.();
    },
  });

  scene = {
    id: `thought:${id}`,
    blocksInput: true,
    allowsLook,
    handlesEscape: !!escapable,
    blocksWorld,                 // the corridor is still there. it is still walking.
    lensPreset,

    enter() { convo.start(); },
    exit() {
      convo.stop();
      audio?.stopTyping?.();
      // Replacement/removal abandons the same interaction as Escape. Owners
      // must release dialogue leases even when another scene closes this one.
      if (!completed && !cancelled) { cancelled = true; onCancel?.(); }
      onExit?.();
    },
    update(dt) { convo.update(dt); },
    worldView:typeof worldView==='function'?worldView:undefined,
    view() { return convo.view(); },        // for the headless suites
    keyup(e) { return convo.keyup?.(e) || false; },
    key(e) {
      if (e.key === 'Escape') {
        if (!escapable) return true;
        if (cancelled || completed) return true;
        cancelled = true;
        scenes.remove(scene);
        onCancel?.();
        return true;
      }
      const v=convo.view();
      if(!showStoryArt||!v.art){
        const p=textPlan(v),advance=['Enter',' ','z','Z'].includes(e.key);
        if(p.pages>1&&(e.key==='PageDown'||e.key==='PageUp')){textPage=Math.max(0,Math.min(p.pages-1,p.page+(e.key==='PageDown'?1:-1)));return true;}
        if(p.pages>1&&!v.typing&&!v.pending?.options?.length&&advance&&p.page<p.pages-1){textPage++;return true;}
      }
      return convo.key(e);
    },

      render() {
        const v = convo.view();
        const { cols, rows } = uiSize();

        if (scrim > 0) uiScrim(scrim);

        const w = Math.min(BAND_W, cols - 8);
        const x = Math.floor((cols - w) / 2);

        const choices = layoutTranscriptChoices(
          v,
          Math.max(12, w - 6),
        );

        // A conversation about the person physically in front of us can keep
        // that body visible. Its authored art remains in the conversation
        // record; this option only suppresses the illustrated presentation.
        const art = showStoryArt ? resolveStoryArt(v.art || null) : null;
        const textLayoutPlan=art?null:textPlan(v);
        const fixedArtPanelH = art
          ? storyArtSideBySidePanelRows({
              choicesRows: 0,
              bottomPadRows: 2,
            })
          : 0;
        // Match the cold-open dialogue shell: with a story plate the panel is
        // exactly header + art/text band + pad (no dead space under the group),
        // and it sits centered like the usual monitor rather than dropped to the
        // bottom of the screen.
        const panelH = art
          ? Math.min(rows - 4, fixedArtPanelH)
          : textLayoutPlan.panelH;

        const y0 = anchor === 'bottom'
          ? Math.max(2, rows - panelH - 1)
          : Math.max(2, Math.floor((rows - panelH) / 2));

        const sourceWho =
          v.pending?.kind === 'say'
            ? 'me'
            : v.who;

        withMachinePanel(
          x,
          y0,
          w,
          panelH,
          {
            label: 'MONITOR',
            source: (v.pending?.kind !== 'say' && v.line?.sourceLabel) || transcriptSource(sourceWho),
            footer: (v.pending?.options?.length
              ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'TRANSMIT' }])
              : promptLine([{ action: 'continue', label: textLayoutPlan?.pages>1&&textLayoutPlan.page<textLayoutPlan.pages-1?'NEXT PAGE':'CONTINUE' }]))
              +(textLayoutPlan?.pages>1?` · ${textLayoutPlan.page+1}/${textLayoutPlan.pages} PGUP/PGDN`:''),
            meter: true,
          },
        (panel) => {

        const contentX = panel.x + 1;
        const contentW = Math.max(8, panel.w - 2);

        const header = drawTranscriptHeader({
          x: contentX,
          y: panel.y,
          width: contentW,
          slate: textLayoutPlan?textLayoutPlan.headerSlate:slate,
          system: textLayoutPlan?textLayoutPlan.headerSystem:v.speaker,
        });

        let choiceLayout = layoutTranscriptChoices(v, contentW);
        let reserve = choiceLayout.height ? choiceLayout.height + 1 : 0;

        let transcriptY =
          header.y + (header.rows ? 1 : 0);

        const sidePanelRows = Math.max(
          1,
          panel.y +
            panel.h -
            transcriptY,
        );
        const beforeTextRows = Math.max(1, sidePanelRows - reserve);
        const sidePlan = planStoryArtSideBySide({
          art,
          mode: art?.mode || 'compact',
          panelRows: sidePanelRows,
          panelCols: contentW,
          textRowsMin: 3,
          choicesRows: 0,
          minTextCols: 28,
          bottomPadRows: 2,
        });

        let transcriptX = contentX;
        let transcriptW = contentW;
        let availableRows = beforeTextRows;

        if (sidePlan.show) {
          const lanes = fixedTranscriptLanes(contentW, { split: sidePlan });
          choiceLayout = layoutTranscriptChoices(v, contentW, { lane: lanes.right });
          reserve = choiceLayout.height ? choiceLayout.height + 1 : 0;
          const textLayout = storyArtSideBySideTextLayout({
            rows: sidePlan.rows,
            choicesRows: choiceLayout.height,
          });

          drawStoryArtCard(art, {
            x: contentX,
            y: transcriptY,
            w: sidePlan.artCols,
            rows: sidePlan.rows,
            mode: sidePlan.mode || art.mode,
            lockRows: true,
          });
          transcriptX = contentX + sidePlan.artCols + sidePlan.gap;
          transcriptW = sidePlan.textCols;
          availableRows = textLayout.transcriptRows;
          const transcript = layoutTranscript(v, {
            width: contentW,
            maxRows: availableRows,
            keep: 3,
            lanes,
          });

          drawTranscript(transcript, {
            x: contentX,
            y: transcriptY,
            width: contentW,
            maxRows: availableRows,
          });

          if (choiceLayout.height) {
            drawTranscriptChoices(choiceLayout, {
              x: contentX,
              y: transcriptY + textLayout.choicesOffset,
              width: contentW,
              maxRows: textLayout.choicesRows,
            });
          }

          return;
        } else {
          const artPlan = planStoryArtInPanel({
            art,
            mode: art?.mode || 'compact',
            panelRows: beforeTextRows,
            textRowsMin: 3,
            choicesRows: reserve,
          });

          if (!choiceLayout.height && artPlan.show) {
            drawStoryArtCard(art, {
              x: contentX,
              y: transcriptY,
              w: contentW,
              rows: artPlan.rows,
              mode: artPlan.mode || art.mode,
            });
            transcriptY += artPlan.rows + 1;
          }

          availableRows = Math.max(
            1,
            panel.y +
              panel.h -
              transcriptY -
              reserve,
          );
        }

        // Thoughts remain a compact overlay. Only recent signal blocks survive so
        // the moving corridor behind them stays readable.
        const transcript = layoutTranscript(v, {
          width: transcriptW,
          maxRows: availableRows,
          keep: 3,
        });

        drawTranscript(textLayoutPlan?.transcript||transcript, {
          x: transcriptX,
          y: transcriptY,
          width: transcriptW,
          maxRows: textLayoutPlan?.availableRows||availableRows,
        });

        if (choiceLayout.height) {
          drawTranscriptChoices(choiceLayout, {
            x: contentX,
            y:
              panel.y +
              panel.h - (textLayoutPlan?.5:0) -
              choiceLayout.height,
            width: contentW,
            maxRows: choiceLayout.height,
          });
        }
        });
      },
  };
  return scene;
}

// ── which thoughts have already been had ────────────────────────────────────
// A thought tree fires once per run. `terror.js`'s `once()` is keyed on story
// flags and survives a reload, which is right for a scripted beat and wrong
// for a beat that should re-arm after death. Nothing here re-arms.
const had = new Set();
export function thoughtHad(id) { return had.has(id); }
export function markThought(id) { had.add(id); }
export function resetThoughts() { had.clear(); }
export function loadThoughtState(saved = {}) {
  had.clear();
  for (const id of saved.had || []) had.add(id);
}
export function saveThoughtState() { return { had: [...had] }; }
