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
import { drawMachinePanel } from '../render/presentation.js';
import { createConversation } from './conversation.js';
import {
  drawTranscript,
  drawTranscriptChoices,
  drawTranscriptHeader,
  layoutTranscript,
  layoutTranscriptChoices,
  transcriptSource,
} from '../render/transcript.js';

const BAND_W = 74;

// A thought tree is a scene like any other. `onDone` fires once, when he stops
// thinking and the building is his problem again.
export function makeThoughtScene({
  id = 'thought', nodes, startAt = 'start', onDone, onChoice, cue, fx, audio, getAudio, replay = null,
  scrim = 0.62, lensPreset = 'calm',
} = {}) {
  const convo = createConversation({
    nodes, startAt, sceneId: `thought:${id}`, replay, onChoice, cue, fx, audio, getAudio,
    volume: 0.24,
    onDone: () => { scenes.pop(); onDone?.(); },
  });

  return {
    id: `thought:${id}`,
    blocksInput: true,
    blocksWorld: false,          // the corridor is still there. it is still walking.
    lensPreset,

    enter() { convo.start(); },
    exit() { convo.stop(); audio?.stopTyping?.(); },
    update(dt) { convo.update(dt); },
    view() { return convo.view(); },        // for the headless suites
    keyup(e) { return convo.keyup?.(e) || false; },
    key(e) {
      if (e.key === 'Escape') return true;   // you do not get to stop thinking
      return convo.key(e);
    },

      render() {
        const v = convo.view();
        const { cols, rows } = uiSize();

        uiScrim(scrim);

        const w = Math.min(BAND_W, cols - 8);
        const x = Math.floor((cols - w) / 2);

        const choices = layoutTranscriptChoices(
          v,
          Math.max(12, w - 6),
        );

        const panelH = Math.min(
          rows - 4,
          Math.max(
            12,
            Math.min(21, 12 + choices.height),
          ),
        );

        const y0 = rows - panelH - 2;

        const sourceWho =
          v.pending?.kind === 'say'
            ? 'me'
            : v.who;

        const panel = drawMachinePanel(
          x - 2,
          y0,
          w + 4,
          panelH,
          {
            label: 'MONITOR',
            source: transcriptSource(sourceWho),
            footer: v.pending?.options?.length
              ? '[↑/↓] SELECT · [ENTER] TRANSMIT'
              : '[SPACE] CONTINUE',
            meter: true,
          },
        );

        const contentX = panel.x + 1;
        const contentW = Math.max(8, panel.w - 2);

        const header = drawTranscriptHeader({
          x: contentX,
          y: panel.y,
          width: contentW,
          system: v.speaker,
        });

        const choiceLayout = layoutTranscriptChoices(
          v,
          contentW,
        );

        const reserve = choiceLayout.height
          ? choiceLayout.height + 1
          : 0;

        const transcriptY =
          header.y + (header.rows ? 1 : 0);

        const availableRows = Math.max(
          1,
          panel.y +
            panel.h -
            transcriptY -
            reserve,
        );

        // Thoughts remain a compact overlay. Only recent signal blocks survive so
        // the moving corridor behind them stays readable.
        const transcript = layoutTranscript(v, {
          width: contentW,
          maxRows: availableRows,
          keep: 3,
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
            y:
              panel.y +
              panel.h -
              choiceLayout.height,
            width: contentW,
            maxRows: choiceLayout.height,
          });
        }
      },
  };
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
