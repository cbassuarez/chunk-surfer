//
//  recorder-view.js — the hi ta chi DA-1000, and there is only one of it.
//
//  There used to be two faces of this machine, built to two standards. The take
//  overlay was an opaque box in the middle of the screen: a bargraph, a counter,
//  a level meter, and half a panel of nothing. The playback deck was the same
//  machine done properly — twin reels turning with the transport, a trace of the
//  print with cue marks and a playhead, channel meters, and a compact mode for a
//  small display. They shared a wordmark and nothing else, and they drifted.
//
//  So: one face, and what changes is the TRANSPORT. Recording and playing back
//  are two things the same machine does, and the player should be looking at the
//  same object doing both.
//
//  IT SITS LOW. The take overlay was centred and stayed there for the whole
//  forty-five seconds, which is the entire window several beats are eligible in
//  — the recording hallucinations were firing correctly and being drawn behind
//  the panel. A recordist holds the machine and looks past it at the room. The
//  room is the point; the meter is what you glance at.
//
//  House rules inherited from presentation.js: no gradients, flat black glass,
//  all the depth is phosphor glow and unlit silkscreen. Segments are for the
//  numeric counter only; everything else is the 5x7 dot matrix.
//

import { uiDraw, uiFill, uiLine, uiStrokeRect, uiText } from './ui.js';
import { UI_COLOR } from './palette.js';
import { drawMachinePanel, drawVfdCounter, drawVfdMeter, drawVfdText, drawLocationIndicator } from './presentation.js';
import { fitText } from './fit-text.js';
import {
  drawTranscript,
  drawTranscriptChoices,
  layoutTranscript,
  layoutTranscriptChoices,
} from './transcript.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

// The transport states. What the machine is doing decides what its face shows,
// and nothing else does.
export const TRANSPORT = Object.freeze({
  MONITOR: 'monitor',   // headphones on, nothing rolling
  RECORD: 'record',     // the minute
  PLAY: 'play',         // a sealed tape, in the cans
  BROWSE: 'browse',     // the tapes, as a list
  CHECK: 'check',       // the room mic, before the first take
  LISTEN: 'listen',     // the room and the authored pre-roll, on this machine
});

const LABEL = Object.freeze({
  [TRANSPORT.MONITOR]: 'MONITOR',
  [TRANSPORT.RECORD]: 'RECORD',
  [TRANSPORT.PLAY]: 'TAPE RETURN',
  [TRANSPORT.BROWSE]: 'TAKES',
  [TRANSPORT.CHECK]: 'MIC CHECK',
  [TRANSPORT.LISTEN]: 'LISTEN / PRE-ROLL',
});

export function formatTakeTime(seconds = 0) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

// ── WHERE THE MACHINE IS ─────────────────────────────────────────────────────
//
// One owner, because more than the draw call needs it: the hallucination
// staging asks whether a body clears the panel before it uses a position, and a
// second copy of this arithmetic is how those two silently disagree.
//
// Low and wide rather than centred and square. `lift` is how far off the bottom
// it sits — enough to clear the speech band, which is the one other thing that
// may be on screen while a take is rolling.
export const RECORDER_PANEL = Object.freeze({ maxW: 66, minW: 38, lift: 3 });

// `clearBottom` is how many rows at the foot of the screen already belong to
// something else. In practice that is the speech band, which is eight rows for
// a single line and grows with the text — and he TALKS during takes, so this is
// the normal case, not the edge one. Without it the machine sits under the
// monitor panel and loses its own location indicator and footer.
export function recorderPanelRect({ cols, rows, progress = 0, rowsNeeded = 8, clearBottom = 0 }) {
  // The dark closes in as the seconds run. Kept here because the letterbox and
  // the panel have to agree about how much room is left.
  const bar = 2 + Math.round(clamp01(progress) * 3);
  const w = Math.max(RECORDER_PANEL.minW, Math.min(RECORDER_PANEL.maxW, cols - 10));
  const x = Math.floor((cols - w) / 2);
  const compact = w < 52 || rows < 26;
  const h = rowsNeeded + 6;                       // header 2 + footer 2 + bezel 2
  // Sit above whatever owns the bottom of the screen, and above the letterbox,
  // but never so high it covers the room it is pointed at.
  const floor = Math.max(bar, clearBottom) + RECORDER_PANEL.lift;
  const y = Math.max(bar + 1, rows - floor - h);
  return { x, y, w, h, bar, compact };
}

// ── THE TRANSPORT BAY ────────────────────────────────────────────────────────
//
// Twin reels and a trace. On a tape return the trace is a reading of the print;
// while recording it is the minute filling up. Same instrument, and the reels
// turn whenever the transport is moving, which is the one thing that tells a
// player at a glance that the machine is running.
function drawTransportBay(rect, view) {
  const progress = clamp01(view.progress);
  const drift = clamp01(view.drift);
  uiFill(rect.x, rect.y, rect.w, rect.h, 'rgba(0,3,3,0.94)');
  uiStrokeRect(rect.x, rect.y, rect.w, rect.h, UI_COLOR.frame, .42, 1);

  // A narrow waveform is a reading of the print, not an audio visualizer. The
  // late double trace is deliberately unlabelled: the machine never explains
  // the thing the player is hearing.
  const traceX = rect.x + 6;
  const traceW = Math.max(4, rect.w - 12);
  const mid = rect.y + rect.h * .52;
  const bins = Math.max(6, Math.floor(traceW));
  const left = clamp01(view.levels?.left);
  const right = clamp01(view.levels?.right);
  for (let index = 0; index < bins; index += 1) {
    const p = index / Math.max(1, bins - 1);
    const phase = p * 22 + progress * 7.4;
    const envelope = .18 + .82 * Math.abs(Math.sin(phase) * Math.cos(phase * .37));
    const amp = Math.min(rect.h * .32, (.18 + (left + right) * .38) * envelope);
    const x = traceX + p * traceW;
    // Ahead of the head is unwritten tape while recording, and unplayed print
    // on a return. Either way it is the dim half.
    uiLine(x, mid - amp, x, mid + amp, UI_COLOR.green, p <= progress ? .76 : .16, 1);
    if (drift > .04) {
      const offset = drift * (index % 3 === 0 ? .42 : -.22);
      uiLine(x + offset, mid - amp * .72, x + offset, mid + amp * .72, UI_COLOR.amber, drift * .28, 1);
    }
  }
  for (const marker of view.markers || []) {
    const x = traceX + clamp01(marker.position) * traceW;
    uiLine(x, rect.y + .25, x, rect.y + rect.h - .25, UI_COLOR.counter, .72, 1);
  }
  const headX = traceX + progress * traceW;
  uiLine(headX, rect.y + .1, headX, rect.y + rect.h - .1, UI_COLOR.amber, 1, 1.5);

  // Twin reel windows and capstan spokes make this read as a machine, even at
  // the smallest supported HUD scale. They stop when the transport stops.
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const toX = (cell) => cell * cellW * dpr;
    const toY = (cell) => cell * cellH * dpr;
    const radius = Math.min(cellW * 1.34, cellH * .88) * dpr;
    const centers = [rect.x + 2.8, rect.x + rect.w - 2.8];
    ctx.save();
    for (let reelIndex = 0; reelIndex < centers.length; reelIndex += 1) {
      const cx = toX(centers[reelIndex]);
      const cy = toY(rect.y + rect.h * .51);
      ctx.strokeStyle = UI_COLOR.frame;
      ctx.globalAlpha = .68;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, radius * .28, 0, Math.PI * 2); ctx.stroke();
      const spin = view.spin == null ? progress : view.spin;
      const rotation = spin * Math.PI * (reelIndex ? 15 : 21) * (reelIndex ? -1 : 1);
      for (let spoke = 0; spoke < 3; spoke += 1) {
        const angle = rotation + spoke * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * radius * .30, cy + Math.sin(angle) * radius * .30);
        ctx.lineTo(cx + Math.cos(angle) * radius * .82, cy + Math.sin(angle) * radius * .82);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

// L and R, as the deck has always drawn them.
function drawChannelMeter(x, y, width, level, label) {
  uiText(x, y, label, 'ui-label', .62, 2);
  const segments = Math.max(3, Math.floor(width - 2));
  const lit = Math.round(clamp01(level) * segments);
  for (let index = 0; index < segments; index += 1) {
    uiFill(x + 2 + index, y + .25, .72, .42,
      index < lit ? 'rgba(119,224,187,0.82)' : 'rgba(119,224,187,0.09)');
  }
}

// The list, when the machine is showing what is on it. Five rooms at most, so
// this never scrolls and never needs to.
function drawTakeList(body, view) {
  const rows = view.rows || [];
  if (!rows.length) {
    uiText(body.x, body.y + 1, 'NO TAPES ON THIS MACHINE', 'ui-label', .7, body.w);
    return;
  }
  rows.forEach((row, index) => {
    const y = body.y + index;
    if (y > body.y + body.h - 1) return;
    const selected = index === view.selected;
    if (selected) uiFill(body.x - .4, y - .1, body.w + .8, 1, 'rgba(255,181,54,0.10)');
    const role = selected ? 'ui-primary' : row.playable ? 'ui-secondary' : 'ui-label';
    uiText(body.x, y, selected ? '▶' : ' ', 'ui-amber', 1, 1);
    uiText(body.x + 2, y, fitText(row.ordinal, 3), role, selected ? 1 : .7, 3);
    uiText(body.x + 6, y, fitText(row.label, Math.max(6, body.w - 22)), role, selected ? 1 : .78,
      Math.max(6, body.w - 22));
    uiText(body.x + body.w - 15, y, fitText(row.status, 14), row.warn ? 'ui-amber' : 'ui-label',
      selected ? .9 : .6, 14);
  });
}

// ── THE FACE ─────────────────────────────────────────────────────────────────
//
// `view` is everything the machine knows, already decided by the caller. This
// draws it and returns the body rect; it makes no gameplay decisions and reads
// no global state, so a test can render any state it likes.
export function drawRecorderFace(view = {}) {
  const mode = view.mode || TRANSPORT.RECORD;
  const rect = view.rect;
  if (!rect) return null;
  const compact = !!rect.compact;

  const body = drawMachinePanel(rect.x, rect.y, rect.w, rect.h, {
    theme: 'green',
    wordmark: 'hi ta chi',
    model: 'DA-1000',
    label: view.label || LABEL[mode] || 'RECORD',
    source: view.source || null,
    meter: false,
    footer: view.footer || ' ',
    footerParts: view.footerParts || null,
    buttons: view.buttons || null,
  });
  const bx = body.x;
  const by = body.y;
  // The button cluster is drawn by drawMachinePanel against the right bezel,
  // over the top of the body. Everything laid out here has to stop short of it
  // or the panel draws two things in one place — which it did: the pre-roll
  // counter landed on STOP, and the channel meters landed on both.
  const keysW = view.buttons ? view.buttons.w + 2 : 0;
  const usableW = Math.max(12, body.w - keysW);

  // The transport lamp. One line, always in the same place, and the only thing
  // on the panel that is allowed to be red.
  if (view.lamp) {
    uiText(bx, by, fitText(view.lamp.text, body.w), view.lamp.role || 'ui-marker', 1, body.w);
  }

  // ── MIC CHECK ──────────────────────────────────────────────────────────────
  //
  // The one state whose meter is NOT the machine. Nothing is rolling, so the
  // counter, the bay and the location indicator would all read zero and say
  // nothing; what the player needs is the needle they are being asked to move,
  // large, and an unambiguous answer to "did it hear me". Everything below the
  // meter is the promise that this is not a take.
  if (mode === TRANSPORT.CHECK) {
    const check = view.check || {};
    uiText(bx, by, fitText(check.prompt || 'SAY: "CHECK, ONE TWO"', usableW), 'ui-amber', 1, usableW);
    const meterW = Math.max(10, Math.min(30, usableW - 12));
    // The scale, on the one screen whose entire job is teaching the player to
    // read the needle. No marks: nothing is recording, so nothing can be
    // spoiled, and a SPOIL line here would be the panel contradicting the
    // promise printed along its own foot.
    drawVfdMeter(bx, by + 1.4, meterW, view.roomMeter, {
      theme: 'green', thresholdDb: -12, id: 'mic-check', rows: 2,
    });
    // The held peak, and whether it is enough. Without this the panel gave no
    // sign it had heard anything until the instant it advanced, so a player who
    // spoke and saw nothing change reasonably pressed [r] again.
    uiText(bx + meterW + 2, by + 1.4, check.heard ? '✓ LEVEL OK' : (check.note || ''),
      check.heard ? 'ui-counter' : 'ui-label', check.heard ? 1 : .8,
      Math.max(6, usableW - meterW - 2));
    uiText(bx, by + 3.8, fitText(check.line || '', usableW),
      check.heard ? 'ui-counter' : 'ui-secondary', .85, usableW);
    return body;
  }

  if (mode === TRANSPORT.BROWSE) {
    // Same reservation as everything else: the transport keys are drawn over
    // the body against the right bezel, and a row that runs the full width puts
    // a tape's status underneath them.
    drawTakeList({ x: bx, y: by + 2, w: usableW, h: body.h - 2 }, view);
    return body;
  }

  // The pre-roll used to throw a second, generic plot monitor over this
  // machine. That split the physical act in two: REC opened a dialogue box,
  // then another REC press eventually found the recorder again. LISTEN is a
  // transport state. The same conversation model still owns the authored
  // words and choices, but the DA-1000 owns their presentation and never stops
  // being the object in the player's hands.
  if (mode === TRANSPORT.LISTEN) {
    const guide = view.guide || {};
    const content = { x: bx, y: by + .3, w: usableW, h: Math.max(1, body.h - .6) };
    const choices = layoutTranscriptChoices(guide, content.w);
    const choiceRows = choices.height ? choices.height + 1 : 0;
    const transcriptRows = Math.max(2, Math.floor(content.h - choiceRows));
    const transcript = layoutTranscript(guide, {
      width: content.w,
      maxRows: transcriptRows,
      keep: 4,
    });
    drawTranscript(transcript, {
      x: content.x,
      y: content.y,
      width: content.w,
      maxRows: transcriptRows,
    });
    if (choices.height) {
      drawTranscriptChoices(choices, {
        x: content.x,
        y: content.y + content.h - choices.height,
        width: content.w,
        maxRows: choices.height,
      });
    }
    return body;
  }

  // COUNTER on the left, TRANSPORT BAY on the right. The counter is the thing
  // the player actually reads; the bay is the thing that tells them the machine
  // is alive.
  const counterX = bx;
  const counterW = compact ? 10 : 13;
  if (view.counter) {
    uiText(counterX, by + 1.4, fitText(view.counterLabel || 'TIME COUNTER', counterW), 'ui-label', 1, counterW);
    drawVfdCounter(counterX, by + 2.4, view.counter, {
      scale: compact ? 1.1 : 1.4, theme: 'green', color: view.counterColor || null,
    });
    if (view.counterTotal) {
      uiText(counterX, by + 4.1, fitText(view.counterTotal, counterW), 'ui-secondary', .8, counterW);
    }
  }

  const bayX = bx + counterW + 1;
  const channelsW = compact || (view.levels && view.meter) ? 0 : 9;
  const bayW = Math.max(12, usableW - counterW - 1 - channelsW);
  drawTransportBay({ x: bayX, y: by + 1.4, w: bayW, h: compact ? 2.6 : 3.4 }, view);

  // The two channels, right of the bay, where a deck puts them — BUT ONLY WHEN
  // THERE IS NO LEVEL METER.
  //
  // While a take is rolling these were a fiction: one microphone in a room, its
  // single reading drawn twice at 0.9 and 0.82 so the pair would not sit
  // perfectly level. The comment beside that code already said faking a stereo
  // pair "would be the instrument lying"; the code then did it anyway, next to
  // a LEVEL meter that now prints a calibrated dB scale. One honest instrument
  // beats one honest instrument and two decorative ones.
  //
  // On playback they are real — playback.js carries genuine signalLeft and
  // signalRight off the tape — and there is no LEVEL meter there, so they stay.
  if (!compact && view.levels && !view.meter) {
    const meterW = Math.max(7, usableW - (bayX - bx) - bayW - 1);
    const meterX = bx + usableW - meterW;
    drawChannelMeter(meterX, by + 1.4, meterW, view.levels.left, 'L');
    drawChannelMeter(meterX, by + 2.5, meterW, view.levels.right, 'R');
  }

  // LOCATION INDICATOR — the minute, or the tape, with a red position marker.
  // The DA-1000's signature, and the reason the theme has a marker colour.
  //
  // The graduation NOTCHES cost no rows — they stand inside the bar — so the
  // strip always reads as a scale. The printed numbers cost a row and are only
  // taken when one is going spare, which is when there is no LEVEL meter below
  // wanting its own scale. During a take the notches plus the TIME COUNTER
  // directly above are enough to place yourself in the minute; before this the
  // strip carried a single number across the widest element on the panel and
  // you could not tell twenty seconds from forty.
  const locY = by + (compact ? 4.4 : 5.2);
  uiText(bx, locY, 'LOCATION INDICATOR', 'ui-label', 1, body.w);
  drawLocationIndicator(bx, locY + 1, Math.max(8, body.w), clamp01(view.progress), {
    theme: 'green',
    seconds: view.locationSeconds || 45,
    // What happened, and when. Already recorded, never shown.
    marks: view.locationMarks || null,
    rows: view.meter ? 1 : 2,
  });

  // LEVEL, and the room mic under it — ONE SCALE, TWO NEEDLES.
  //
  // These used to sit at different x with different widths (bx+7 by 16, and
  // bx+9 by 14), which meant two bars measuring the same thing in the same
  // units could not be read against each other: the tape's level and the level
  // of the room it is being recorded in, side by side, on two rulers. Aligned
  // and equal-width, one printed scale serves both, and the comparison the
  // player actually needs — is what the tape hears the room, or something else
  // — becomes a glance.
  //
  // The scale row is drawn only if it clears the note line at the foot of the
  // body. It is the first thing to go when the panel is short, which is the
  // same rule the widget applies when the bar is narrow.
  const meterX = bx + 10;
  const meterW = Math.max(6, usableW - 10);
  const lastMeterY = locY + 2 + (view.roomMeter ? 1 : 0);
  const scaleRows = lastMeterY + 1 < by + body.h - 1 ? 2 : 1;

  if (view.meter) {
    uiText(bx, locY + 2, fitText(view.meterLabel || 'LEVEL', 9), 'ui-label', 1, 9);
    drawVfdMeter(meterX, locY + 2, meterW, view.meter, {
      theme: 'green', id: 'take-level',
      thresholdDb: view.meterThresholdDb ?? -6,
      // The scale hangs off the LOWER of the two bars, so the numbers sit under
      // the stack rather than between the needles.
      rows: view.roomMeter ? 1 : scaleRows,
      marks: view.roomMeter ? null : view.meterMarks || null,
    });
  }

  if (view.roomMeter) {
    uiText(bx, locY + 3, 'ROOM MIC', 'ui-label', 1, 9);
    drawVfdMeter(meterX, locY + 3, meterW, view.roomMeter, {
      theme: 'green', id: 'room-mic', thresholdDb: -12,
      rows: scaleRows,
      // The marks belong to the take, not to the room, so they are only drawn
      // when the take's own meter is the one being scaled.
      marks: view.meter ? view.meterMarks || null : null,
    });
  }

  // The one line the machine says about itself, when it has something to say.
  if (view.note) {
    drawVfdText(bx, by + body.h - 1, fitText(view.note, Math.floor(body.w / .72)), {
      scale: .72, theme: view.noteTheme || 'green', alpha: .94, max: body.w,
    });
  }
  return body;
}
