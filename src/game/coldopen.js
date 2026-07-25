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
import { uiSize, uiFill, uiText } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import {
  drawTranscript,
  drawTranscriptChoices,
  drawTranscriptHeader,
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
import { promptLine } from './bindings.js';

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
  onDone, onChoice, cue, fx, audio, getAudio, replay = null,
} = {}) {
  const convo = createConversation({
    nodes: opening, beats, startAt, sceneId: id, replay, onChoice, cue, fx, audio, getAudio,
    onDone: () => { scenes.pop(); if (ambient) audio?.stopBoothTone?.({ fade: 0.8 }); onDone?.(); },
  });
  let lastBeatArt = null;

  return {
    id,
    blocksInput: true,
    blocksWorld: true,
    lensPreset,

    enter() {
      if (ambient) { audio?.startSoundtrack?.(); audio?.startBoothTone?.(); }
      convo.start();
    },
    exit() { convo.stop(); audio?.stopTyping?.(); },
    update(dt) { convo.update(dt); },
    view() { return convo.view(); },        // for the headless suites
    keyup(e) { return convo.keyup?.(e) || false; },
    key(e) {
      if (e.key === 'Escape') return true;   // no way out of a conversation
      return convo.key(e);
    },

      render() {
        const v = convo.view();
        const { cols, rows } = uiSize();

        uiFill(0, 0, cols, rows, UI_COLOR.glass);

        // A two-channel monitor needs enough width for two distinct lanes. It
        // remains centered and capped, but no longer crushes the transcript into
        // one terminal column.
        const w = Math.min(COL_W, cols - 4);
        const x = Math.floor((cols - w) / 2);

        if (v.art) lastBeatArt = v.art;
        const art = resolveStoryArt(v.art || (v.mode === 'beats' ? lastBeatArt : null));
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
        const panelH = art
          ? Math.min(rows - 4, fixedArtPanelH)
          : Math.min(
              rows - 4,
              Math.max(18, Math.min(30, Math.floor(rows * 0.64))),
            );

        const top = Math.max(
          2,
          Math.floor((rows - panelH) / 2),
        );

        const sourceWho =
          v.pending?.kind === 'say'
            ? 'me'
            : v.who;

        const body = drawMachinePanel(
          x,
          top,
          w,
          panelH,
          {
            label: 'MONITOR',
            source: transcriptSource(sourceWho),
            footer: v.pending?.options?.length
              ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'TRANSMIT' }])
              : promptLine([{ action: 'continue', label: 'CONTINUE' }]),
            meter: true,
          },
        );

        const contentX = body.x + 1;
        const contentW = Math.max(8, body.w - 2);

        const header = drawTranscriptHeader({
          x: contentX,
          y: body.y,
          width: contentW,
          slate,
          system: v.speaker,
        });

        let choices = layoutTranscriptChoices(v, contentW);
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
          choices = layoutTranscriptChoices(v, contentW, { lane: lanes.right });
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
      },
  };
}
// Long enough that the song gets a verse and the reader gets to sit in it. The
// fade takes the whole back half, so the door lands in a mix that has emptied.
export function makeWorldTitleScene({ onDone, audio, duration = 12.0 } = {}) {
  let t = 0;
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    scenes.pop();
    onDone?.();
  }

  return {
    id: 'world-title',
    blocksInput: true,
    blocksWorld: false,
    lensPreset: 'calm',

    // The song leaves before the title does, so the door slams into an empty mix.
    enter() { audio?.fadeSoundtrack?.({ fade: Math.max(2, duration - 2.4) }); },
    update(dt) { t += dt; if (t >= duration) finish(); },
    // This is an authored twelve-second scene, not a text line. Input is
    // swallowed until the song and title complete; no key can collapse it.
    key() { return true; },
    exit() { audio?.stopTyping?.(); },

    // Nothing but type, on black. No band, no box, no ornament — the song does
    // the work, and the lens is asleep behind this, so the black is real black.
    // Each line fades up on its own beat and they all leave together.
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);

      const out = Math.min(1, Math.max(0, (duration - t) / 2.4));
      const up = (at, over = 1.8) => Math.min(1, Math.max(0, (t - at) / over)) * out;

      const w = Math.min(72, cols - 4), h = Math.min(17, rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, { label:'PROGRAM', source:'ELLERY', meter:true });
      drawVfdText(Math.max(body.x, Math.floor((cols - 12) / 2)), body.y + 2, 'CHUNK SURFER', { color:UI_COLOR.primary });
      uiText(Math.max(body.x, Math.floor((cols - 29) / 2)), body.y + 5, 'ELLERY CONSERVATORY OF MUSIC', 'ui-blue', up(2.4));
      uiText(Math.max(body.x, Math.floor((cols - 31) / 2)), body.y + 7, '5 ROOMS / 1 CLEAN MINUTE EACH', 'ui-secondary', up(3.6));
    },
  };
}
