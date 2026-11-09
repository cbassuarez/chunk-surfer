// The cold open: a service booth, a bored man, a form, and a door.
//
// This file is a presenter. The conversation itself lives in conversation.js;
// here we put it on a black screen, in a column, with a slate across the top
// and everything already said receding behind it.
//
// There is no [esc]. This is the only conversation in the game and you are
// going to have it. (`?skiptut=1` exists for people who have to walk this
// building forty times today.)

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiLine, uiDraw, uiWithClip } from '../render/ui.js';
import { PANEL, withMachinePanel, drawVfdText } from '../render/presentation.js';
import {
  drawTranscript,
  drawTranscriptChoices,
  drawTranscriptHeader,
  fitTranscriptChoices,
  fixedTranscriptLanes,
  layoutTranscript,
  layoutTranscriptChoices,
  transcriptSource,
} from '../render/transcript.js';
import { UI_COLOR } from '../render/palette.js';
import { createConversation } from './conversation.js';
import {
  drawStoryArtCard,
  planStoryArtInPanel,
  planStoryArtSideBySide,
  storyArtSideBySidePanelRows,
  storyArtSideBySideTextLayout,
} from './story-art-card.js';
import { resolveStoryArt } from './story-art.js';
import { promptLine, activeInputPromptDevice } from './bindings.js';
import {sourceRestSubtitleLayout} from '../render/source-rest-subtitle.js';
import {renderArrivalTitleOption} from '../render/arrival-title-options.js';
import {hardwareMotionReduced} from '../render/hardware-material.js';

const COL_W = 86;
const KEEP = 12;

export const STYLE = {
  // No nameplate on your own line. You know who is talking.
  me: { cls: 'ui-primary', alpha: 1, label: '' },
  you: { cls: 'ui-primary', alpha: 1, label: '' },
  guard: { cls: 'ui-amber', alpha: 1, label: 'GUARD' },
  client: { cls: 'ui-blue', alpha: 1, label: 'CLIENT' },
  recordist: { cls: 'ui-primary', alpha: 1, label: 'TAKE' },
  surfer: { cls: 'ui-danger', alpha: 1, label: '' },
  radio: { cls: 'ui-amber', alpha: 1, label: 'RADIO' },
  direction: { cls: 'ui-secondary', alpha: 1, label: '' },
};

// `ambient: false` is the scene that runs AFTER the title — the door, the dark
// and the bag. The song has already gone and the booth is a hundred metres away
// behind a fire door, so it starts nothing and it stops nothing.
export function makeColdOpenScene({
  id = 'cold-open',
  beats = [], opening = null, startAt = 'start', slate = '', ambient = true, lensPreset = 'booth',
  onDone, onChoice, onLine, cue, fx, audio, getAudio, replay = null, voiceEnabled = true,
  blocksWorld = true, allowsLook = false, suppressesHud = false,
  worldUnderlay = false, worldView = null, presentation = worldUnderlay ? 'cinematic' : 'monitor',
  transcriptBackground = 'rgba(2,4,5,.58)',
  transcriptPlacement = 'bottom', presentationView = null, automatic = false,
} = {}) {
  let scene = null;
  let completed = false;
  let exited = false;
  let choiceScrollOffset=0,choiceScrollKey='',choiceScrollMax=0;
  function choiceView(){
    const raw=convo.view(),view=typeof presentationView==='function'?(presentationView(raw)||raw):raw;
    const key=`${view.nodeId||''}:${view.pending?.kind||''}:${view.pending?.index??''}`;
    if(key!==choiceScrollKey){choiceScrollKey=key;choiceScrollOffset=0;choiceScrollMax=0;}
    return {...view,choiceScrollOffset};
  }
  const active = () => !exited && (presentation !== 'cinematic' || scenes.top() === scene);
  const convo = createConversation({
    nodes: opening, beats, startAt, sceneId: id, replay, onChoice, onLine, cue, fx, audio, getAudio, voiceEnabled,
    isActive: active,
    onDone: () => {
      if (completed || exited) return;
      completed = true;
      // A line may have opened a held action or another scene. Only this
      // conversation owns its removal; popping the stack can erase the child
      // and leave this finished transcript beneath the ending's last shot.
      scenes.remove(scene);
      if (ambient) audio?.stopBoothTone?.({ fade: 0.8 });
      onDone?.();
    },
  });

  scene = {
    id,
    get faceplate(){return presentation==='monitor';},
    blocksInput: true,
    blocksWorld,
    allowsLook,
    suppressesHud,
    lensPreset,
    worldView: typeof worldView === 'function' ? worldView : () => worldView,

    enter() {
      if (ambient) { audio?.startSoundtrack?.(); audio?.startBoothTone?.(); }
      convo.start();
    },
    exit() { exited = true; convo.stop(); audio?.stopTyping?.(); },
    update(dt) { if (active()) convo.update(dt); },
    view() { return { ...choiceView(), presentation, transcriptBackground }; }, // for the headless suites
    textReviewSuspend() { convo.textReviewSuspend?.(); },
    textReviewResume() { convo.textReviewResume?.(); },
    presentationPause() { return convo.presentationPause?.(); },
    presentationResume() { return convo.presentationResume?.(); },
    keyup(e) { return convo.keyup?.(e) || false; },
    key(e) {
      if (!active()) return true;
      if (e.key === 'Escape') return true;   // no way out of a conversation
      const v=choiceView();
      const choicePageNext=e.key==='PageDown'||e.controllerAction==='tabNext',choicePagePrev=e.key==='PageUp'||e.controllerAction==='tabPrev';
      if(v.pending?.options?.length&&choiceScrollMax>0&&(choicePageNext||choicePagePrev)){
        choiceScrollOffset=Math.max(0,Math.min(choiceScrollMax,choiceScrollOffset+(choicePageNext?1:-1)));return true;
      }
      return convo.key(e);
    },

      render() {
        if (!active()) return;
        const v = choiceView();
        const { cols, rows } = uiSize();

        // Endings remain in the world. Their transcript is an instrument panel
        // over the physical image, not a cut to the old full-screen black
        // monitor. Other conversations retain the opaque cold-open surface.
        if (!worldUnderlay) uiFill(0, 0, cols, rows, UI_COLOR.glass);

        // A terminal ending is a shot with words in it, not a web page laid over
        // a shot. Keep only the live exchange and its choices in a low glass
        // subtitle strip. There is deliberately no MONITOR bezel, meter, source
        // lane, modal card or centered column here: the transformed room is the
        // primary image and remains legible while the player reads.
        if (presentation === 'cinematic') {
          if(v.restSubtitle){
            const scale=1.55,localCols=Math.floor(cols/scale),localRows=Math.floor(rows/scale);
            const width=Math.max(18,Math.min(86,localCols-8));
            const choices=fitTranscriptChoices(layoutTranscriptChoices(v,width-4,{label:v.choiceHeading??null}),Math.max(1,localRows-8-(v.restChoiceTimer?2:0)),{selectedOffset:choiceScrollOffset});
            choiceScrollMax=choices.selectedMaxOffset||0;
            const timerRows=choices.height&&v.restChoiceTimer?2:0;
            const layout=sourceRestSubtitleLayout(v,{cols:localCols,rows:localRows,choiceRows:choices.height?choices.height+2+timerRows:0});
            if(layout.empty)return;
            uiDraw(({ctx})=>{ctx.scale(scale,scale);
            if(!v.restBlack)uiFill(layout.x,layout.y-1,layout.width,layout.height+2,'rgba(0,0,0,.88)');
            let cy=layout.y;
            if(layout.label)uiText(layout.x+2,cy++,layout.label,'ui-counter',.72);
            for(const line of layout.body)uiText(layout.x+2,cy++,line,'ui-primary',v.restBlack?1:.88);
            if(choices.height){
              const choiceY=layout.y+layout.height-choices.height-1;
              if(v.restChoiceTimer){
                const timer=v.restChoiceTimer,barY=choiceY-1.15,barWidth=layout.width-4;
                uiText(layout.x+2,choiceY-2,timer.resumeHold?'REPLY HELD · SELECT AGAIN TO RESUME':timer.active?`REPLY IN ${Math.ceil(timer.remaining)}s · SELECT AGAIN TO CLEAR`:'CHOOSE A REPLY · NOTHING SELECTED','ui-counter',.8);
                uiFill(layout.x+2,barY,barWidth,.12,'rgba(158,190,177,.22)');
                if(timer.active)uiFill(layout.x+2,barY,barWidth*Math.max(0,Math.min(1,timer.fraction)),.12,'rgba(202,222,207,.84)');
              }
              drawTranscriptChoices(choices,{x:layout.x+2,y:choiceY,width:layout.width-4,maxRows:choices.height});
              const prompt=v.presentationPrompt??promptLine([{action:'select',label:'SELECT'},{action:'confirm',label:'REPLY'},...(v.restRecorderPrompt?[{action:'recorder',label:'RECORDER'}]:[])]);
              uiText(layout.x+2,layout.y+layout.height,String(v.restChoiceTimer?`${prompt} · BACKSPACE CLEAR`:prompt).slice(0,layout.width-4),'ui-counter',.9);
            }else if(!v.restBlack){
              const controls=promptLine([...(v.restCanLeave?[{action:'interact',label:'GET UP'}]:[]),...(v.restRecorderPrompt?[{action:'recorder',label:'RECORDER'}]:[]),{action:'back',label:'PAUSE'}]);
              uiText(layout.x+2,layout.y+layout.height,controls.slice(0,layout.width-4),'ui-counter',.8);
            }
            });
            return;
          }
          const width = Math.min(76, Math.max(26, cols - 12));
          const x = Math.max(3, Math.floor((cols - width) / 2));
          const choices = fitTranscriptChoices(layoutTranscriptChoices(v,width-4,{label:v.choiceHeading??null}),Math.max(1,rows-8),{selectedOffset:choiceScrollOffset});
          choiceScrollMax=choices.selectedMaxOffset||0;
          const choiceRows = choices.height ? choices.height + 1 : 0;
          const maxTranscriptRows = Math.max(2, Math.min(choices.height ? 7 : 4, rows - choiceRows - 7));
          const transcript = layoutTranscript(v, {
            width: width - 4,
            maxRows: maxTranscriptRows,
            keep: choices.height ? 4 : 2,
          });
          const h = Math.min(rows - 3, Math.max(4, transcript.height + choiceRows + 2));
          const y = transcriptPlacement === 'top' ? 2 : Math.max(2, rows - h - 1);
          uiFill(x, y, width, h, transcriptBackground);
          const transcriptY = y + 1;
          drawTranscript(transcript, {
            x: x + 2,
            y: transcriptY,
            width: width - 4,
            maxRows: maxTranscriptRows,
          });
          if (choices.height) {
            drawTranscriptChoices(choices, {
              x: x + 2,
              y: y + h - choices.height - 1,
              width: width - 4,
              maxRows: choices.height,
            });
            const prompt=promptLine([{action:'select',label:'SELECT'},{action:'confirm',label:v.pending.kind==='say'?'SAY':'REPLY'}])
              +(choiceScrollMax?(activeInputPromptDevice()==='keyboard'?' · [PGUP/PGDN] READ':` · ${promptLine([{action:'tabPrev'},{action:'tabNext',label:'READ'}])}`):'')
              +(activeInputPromptDevice()==='keyboard'?` · [1${v.pending.options.length>1?`–${Math.min(9,v.pending.options.length)}`:''}] ${v.pending.kind==='say'?'SAY':'REPLY'}`:'');
            uiText(x+2,y+h-1,String(v.presentationPrompt??prompt).slice(0,width-4),'ui-secondary',.75);
          } else if(!automatic) {
            const prompt = promptLine([{ action: 'continue', label: 'CONTINUE' }]);
            uiText(x + width - Math.min(width - 3, prompt.length) - 2, y + h - 1, prompt.slice(0, width - 3), 'ui-secondary', .62);
          }
          return;
        }

        // A two-channel monitor needs enough width for two distinct lanes. It
        // remains centered and capped, but no longer crushes the transcript into
        // one terminal column.
        const w = Math.min(COL_W, cols - 4);
        const x = Math.floor((cols - w) / 2);

        const art = resolveStoryArt(v.art || null);
        const fixedArtPanelH = art
          ? storyArtSideBySidePanelRows({
              choicesRows: 0,
              bottomPadRows: 2,
            })
          : 0;
        // With a story plate present the panel is exactly the height of the
        // header + fixed art/text band + bottom pad. Sizing to that removes the
        // dead space that used to sit under the image/text group when the panel
        // was stretched to a share of the screen instead.
        // THE PANEL IS THE HEIGHT OF WHAT IS IN IT, WITH OR WITHOUT A PLATE.
        //
        // The art branch was already sized to its content — see the note above —
        // and the branch without one was still taking a share of the SCREEN:
        // 64% of the rows whether it held eight lines or two. That is what left
        // the coda as three lines of transcript at the top of a tall pane of
        // empty glass, and it is the single reason those screens read as a
        // content card floating in whitespace.
        //
        // Measured the same way the drawing measures it: contentW is derived
        // from the panel width, which is already fixed, so the transcript can be
        // laid out before the bezel is committed to a height.
        const measureW = Math.max(8, w - PANEL.padX * 2 - 4);
        const measured = layoutTranscript(v, { width: measureW, maxRows: rows });
        const measuredChoices = fitTranscriptChoices(layoutTranscriptChoices(v,measureW),Math.max(1,rows-15),{selectedOffset:choiceScrollOffset});
        const contentRows = measured.height
          + (measuredChoices.height ? measuredChoices.height + 1 : 0);
        const panelH = art
          ? Math.min(rows - 4, fixedArtPanelH)
          : Math.min(
              rows - 4,
              // Header, the content, and the bezel's own furniture. Floored so a
              // single line still gets a panel rather than a slot.
              Math.max(12, contentRows + PANEL.headerRows + PANEL.footerRows + 5),
            );

        const top = Math.max(
          2,
          Math.floor((rows - panelH) / 2),
        );

        const sourceWho =
          v.pending?.kind === 'say'
            ? 'me'
            : v.who;

        withMachinePanel(
          x,
          top,
          w,
          panelH,
          {
            label: 'MONITOR',
            source: transcriptSource(sourceWho),
            footer: v.pending?.options?.length
              ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: v.pending.kind==='say'?'SAY':'REPLY' }])
                +(choiceScrollMax?(activeInputPromptDevice()==='keyboard'?' · [PGUP/PGDN] READ':` · ${promptLine([{action:'tabPrev'},{action:'tabNext',label:'READ'}])}`):'')
                +(activeInputPromptDevice()==='keyboard'?` · [1${v.pending.options.length>1?`–${Math.min(9,v.pending.options.length)}`:''}] ${v.pending.kind==='say'?'SAY':'REPLY'}`:'')
              : promptLine([{ action: 'continue', label: 'CONTINUE' }]),
            meter: true,
          },
          (body) => {
        const contentX = body.x + 1;
        const contentW = Math.max(8, body.w - 2);

        const header = drawTranscriptHeader({
          x: contentX,
          y: body.y,
          width: contentW,
          slate,
          system: v.speaker,
        });

        let choices = fitTranscriptChoices(layoutTranscriptChoices(v,contentW),Math.max(1,Math.floor(body.h-5)),{selectedOffset:choiceScrollOffset});
        choiceScrollMax=choices.selectedMaxOffset||0;
        let choiceReserve = choices.height ? choices.height + 1 : 0;

        let transcriptY =
          header.y + (header.rows ? 1 : 0);

        const sidePanelRows = Math.max(
          1,
          body.y +
            body.h -
            transcriptY,
        );
        const beforeTextRows = Math.max(1, sidePanelRows - choiceReserve);
        const sidePlan = planStoryArtSideBySide({
          art,
          mode: art?.mode || 'compact',
          panelRows: sidePanelRows,
          panelCols: contentW,
          textRowsMin: choices.height ? 4 : 5,
          choicesRows: 0,
          minTextCols: 32,
          bottomPadRows: 2,
        });

        let transcriptX = contentX;
        let transcriptW = contentW;
        let transcriptMaxRows = beforeTextRows;

        if (sidePlan.show) {
          const lanes = fixedTranscriptLanes(contentW, { split: sidePlan });
          choices = fitTranscriptChoices(layoutTranscriptChoices(v,contentW,{lane:lanes.right}),Math.max(1,Math.floor(sidePlan.rows-4)),{selectedOffset:choiceScrollOffset});
          choiceScrollMax=choices.selectedMaxOffset||0;
          choiceReserve = choices.height ? choices.height + 1 : 0;
          const textLayout = storyArtSideBySideTextLayout({
            rows: sidePlan.rows,
            choicesRows: choices.height,
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
          transcriptMaxRows = textLayout.transcriptRows;
          const transcript = layoutTranscript(v, {
            width: contentW,
            maxRows: transcriptMaxRows,
            keep: KEEP,
            lanes,
          });

          drawTranscript(transcript, {
            x: contentX,
            y: transcriptY,
            width: contentW,
            maxRows: transcriptMaxRows,
          });

          if (choices.height) {
            drawTranscriptChoices(choices, {
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
            textRowsMin: choices.height ? 4 : 5,
            choicesRows: choiceReserve,
          });

          if (!choices.height && artPlan.show) {
            drawStoryArtCard(art, {
              x: contentX,
              y: transcriptY,
              w: contentW,
              rows: artPlan.rows,
              mode: artPlan.mode || art.mode,
            });
            transcriptY += artPlan.rows + 1;
          }

          transcriptMaxRows = Math.max(
            1,
            body.y +
              body.h -
              transcriptY -
              choiceReserve,
          );
        }

        const transcript = layoutTranscript(v, {
          width: transcriptW,
          maxRows: transcriptMaxRows,
          keep: KEEP,
        });

        drawTranscript(transcript, {
          x: transcriptX,
          y: transcriptY,
          width: transcriptW,
          maxRows: transcriptMaxRows,
        });

        if (choices.height) {
          drawTranscriptChoices(choices, {
            x: contentX,
            y: body.y + body.h - choices.height,
            width: contentW,
            maxRows: choices.height,
          });
        }
        });
      },
  };
  return scene;
}
// THE ARRIVAL. He is standing at the back of his own van on a wet road and the
// game has not started yet.
//
// Control used to arrive on a hard cut: one frame of menu, the next frame of a
// man outdoors in the rain, already able to walk. Nothing said "this is a place"
// before it said "you may now move". Two and a half seconds of black coming off
// the world is all it takes, and it is also the only chance the rain and the
// bed get to arrive before the player's hands do.
//
// `blocksWorld` stays false: the world is rendering underneath the whole time,
// which is the point — it is a fade FROM black onto a shot, not a loading card.
export function makeArrivalScene({ onDone, audio, duration = 2.6 } = {}) {
  let t = 0;
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    scenes.pop();
    onDone?.();
  }

  return {
    id: 'arrival',
    blocksInput: true,
    blocksWorld: false,
    lensPreset: 'calm',

    enter() { audio?.startRain?.(); audio?.startOpeningSceneBed?.(); },
    update(dt) { t += dt; if (t >= duration) finish(); },
    // No skipping. It is two and a half seconds and it is the first thing the
    // game says.
    key() { return true; },

    render() {
      const { cols, rows } = uiSize();
      // Full black for the first fifth, then off. Cubed, so the last of it
      // lingers and the yard resolves rather than snapping in.
      const k = Math.min(1, Math.max(0, (t - duration * 0.18) / (duration * 0.82)));
      const alpha = (1 - k) * (1 - k) * (1 - k);
      if (alpha > 0.002) uiFill(0, 0, cols, rows, `rgba(4,5,7,${alpha.toFixed(3)})`);
    },
  };
}


export function makeBoothDownbeatHoldScene({ duration = 0, onDone, scrim = 0.28 } = {}) {
  let t = 0;
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    scenes.pop();
    onDone?.();
  }

  return {
    id: 'booth-downbeat-hold',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'booth',

    update(dt) {
      t += Math.max(0, Number(dt) || 0);
      if (t >= duration) finish();
    },

    key() { return true; },
    keyup() { return true; },

    render() {
      if (scrim <= 0) return;
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, `rgba(4,5,7,${Math.min(1, Math.max(0, scrim)).toFixed(3)})`);
    },
  };
}

// Long enough that the song gets a verse and the reader gets to sit in it. The
// fade takes the whole back half, so the door lands in a mix that has emptied.
//
// THE LEAD-IN IS THE CROSSING ITSELF.
//
// This used to open on a frame of solid glass, which meant the last thing the
// player saw of the outdoors was whatever happened to be under the cursor on the
// step that fired it — a hard cut off a wall. The door he has just come through
// is the most important object in the game (see the post-door beat, and the
// masonry), and it went past unwatched.
//
// So the scene now begins in the world: the view swings back to the door, the
// closer takes it, and the last rectangle of yard light narrows to nothing
// before the type comes up. `duration` still means the length of the TYPE, so
// every existing caller and the god menu are unchanged.
export function makeWorldTitleScene({
  onDone, audio, cue, camera = null,
  duration = 12.0, turn = 1.3, iris = 1.6, marquee = false, manageSoundtrack = true,
} = {}) {
  let t = 0;
  let done = false;
  let entryPose = null;
  const lead = camera ? turn + iris : 0;

  function finish() {
    if (done) return;
    done = true;
    // Give the head back exactly as it was handed over. The turn is the scene's
    // to make; the direction the player is left standing in is not — leaving
    // them a half-turn round means the only way to face front again is to walk.
    camera?.restore?.(entryPose);
    scenes.pop();
    onDone?.();
  }

  return {
    id: 'world-title',
    blocksInput: true,
    blocksWorld: false,
    lensPreset: 'calm',
    // The look-back and closing iris still need the real doorway. Once the
    // aperture is completely black, drawing the hidden building only competes
    // with the title and can stretch its capped presentation clock badly.
    get worldPresentation() { return t >= lead ? 'hidden' : 'visible'; },
    view() { return { elapsed: t, lead, duration, opaque: t >= lead }; },

    // The song leaves before the title does. Real leaves own their close sound;
    // the title must not add a second, disembodied slam.
    enter() {
      entryPose = camera?.pose?.() || null;
      if(manageSoundtrack)audio?.fadeSoundtrack?.({ fade: Math.max(2, lead + duration - 2.4) });
    },
    update(dt) {
      t += dt;
      // The turn is driven a frame at a time rather than set, because r3dLook
      // clamps how far the head moves per call — a man looking over his
      // shoulder, not a camera being teleported.
      if (camera && t < turn) camera.turn?.(Math.min(dt, turn - (t - dt)) / turn);
      if (t >= lead + duration) finish();
    },
    // This is an authored scene, not a text line. Input is swallowed until the
    // song and title complete; no key can collapse it.
    key() { return true; },
    exit() { audio?.stopTyping?.(); },

    // Nothing but type, on black. No band, no box, no ornament — the song does
    // the work, and the lens is asleep behind this, so the black is real black.
    // Each line fades up on its own beat and they all leave together.
    render() {
      const { cols, rows } = uiSize();

      // ── the iris ────────────────────────────────────────────────────────────
      // On a character grid an iris is not a circle; it is four filled bands
      // closing on an aperture, and that is the right instrument for it — the
      // shape that ends up on screen is a door-height slot, because the width
      // collapses on a steeper curve than the height.
      if (t < lead) {
        if (t <= turn) return;                       // world only: he is turning
        const k = Math.min(1, (t - turn) / iris);
        const e = k * k * (3 - 2 * k);
        const aw = Math.max(0, Math.round(cols * Math.pow(1 - e, 1.9)));
        const ah = Math.max(0, Math.round(rows * (1 - e)));
        const ax = Math.floor((cols - aw) / 2), ay = Math.floor((rows - ah) / 2);
        uiFill(0, 0, cols, ay, UI_COLOR.glass);
        uiFill(0, ay + ah, cols, rows - ay - ah, UI_COLOR.glass);
        uiFill(0, ay, ax, ah, UI_COLOR.glass);
        uiFill(ax + aw, ay, cols - ax - aw, ah, UI_COLOR.glass);
        return;
      }

      uiFill(0, 0, cols, rows, UI_COLOR.glass);

      const tt = t - lead;
      const out = Math.min(1, Math.max(0, (duration - tt) / 2.4));
      const up = (at, over = 1.8) => Math.min(1, Math.max(0, (tt - at) / over)) * out;

      if (!marquee) {
        // The original frontispiece remains still. Only the named Ellery-entry
        // factory below requests the finite hardware display treatment.
        const title = 'CHUNK SURFER';
        const place = 'ELLERY CONSERVATOIRE OF MUSIC';
        const work = '5 ROOMS / 1 CLEAN MINUTE EACH';
        const width = Math.max(16, cols - 4);
        const wrap = (copy) => {
          const lines = [];
          let line = '';
          for (const word of copy.split(' ')) {
            const next = line ? `${line} ${word}` : word;
            if (line && next.length > width) { lines.push(line); line = word; }
            else line = next;
          }
          if (line) lines.push(line);
          return lines;
        };
        const placeLines = wrap(place), workLines = wrap(work);
        const compact = rows < 15;
        const scale = Math.min(compact ? 2 : 3.4, (cols - 4) / title.length);
        const titleHeight = scale * .60;
        const placeGap = compact ? .50 : 1.75, workGap = compact ? .25 : .85;
        const height = titleHeight + placeGap + placeLines.length + workGap + workLines.length;
        const y = Math.max(.15, Math.min(rows - height - .15, rows * .46 - height / 2));
        drawVfdText((cols - title.length * scale) / 2, y, title,
          { scale, color:UI_COLOR.paper, alpha:up(0) });
        const placeY = y + titleHeight + placeGap;
        for (const [index, line] of placeLines.entries())
          uiText((cols - line.length) / 2, placeY + index, line, 'ui-secondary', up(2.4) * .90);
        const workY = placeY + placeLines.length + workGap;
        for (const [index, line] of workLines.entries())
          uiText((cols - line.length) / 2, workY + index, line, 'ui-secondary', up(3.6) * .72);
        return;
      }

      // The approved disc display uses exactly the same layout and phosphor
      // rendering as its design preview. The title itself never scrolls.
      renderArrivalTitleOption({direction:'disc',cols,rows,time:tt,duration,
        reducedMotion:hardwareMotionReduced()}, {drawText:drawVfdText,withClip:uiWithClip});
    },
  };
}

// This is the title encountered at Ellery's goods-entry threshold, not the
// opening credits/overture. Retain the same scene id and camera lifecycle so
// the existing input and opaque-world safeguards still own its presentation.
export function makeArrivalTitleScene(options = {}) {
  return makeWorldTitleScene({ ...options, marquee: true });
}
