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
//  Displays remain phosphor behind glass. The transport is physical plastic
//  with printed legends; its lamp and mechanical travel are independent.
//

import { uiDraw, uiFill, uiLine, uiStrokeRect, uiText } from './ui.js';
import { UI_COLOR } from './palette.js';
import { PANEL, machinePanelBody, withMachinePanel, drawVfdAnnunciators, drawVfdCounter, drawVfdMeter, drawVfdText, drawLocationIndicator } from './presentation.js';
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
  const requestedH = rowsNeeded + 6;             // header 2 + footer 2 + bezel 2
  // The pre-roll asks for a tall transcript, not a larger physical transport.
  // At enlarged UI scale there may be fewer rows than that request. Keep its
  // lower choices and etched controls in frame; the transcript owns scrolling.
  const h = rowsNeeded > 10 ? Math.min(requestedH, Math.max(12, rows - bar - 2)) : requestedH;
  // Sit above whatever owns the bottom of the screen, and above the letterbox,
  // but never so high it covers the room it is pointed at.
  const floor = Math.max(bar, clearBottom) + RECORDER_PANEL.lift;
  const y = Math.max(bar + 1, rows - floor - h);
  return { x, y, w, h, bar, compact };
}

// Fixed housings are the hit targets, not the caps moving inside them. The
// arithmetic is shared with the drawMachinePanel / drawButtonCluster contract.
export function recorderButtons(rect, buttons) {
  if (!buttons) return null;
  // The generic six-cell cluster leaves only a 32px cap and microscopic
  // legends. Transport names own a physical column, including on narrow HUDs.
  const w = rect?.w >= 60 ? 11 : rect?.w >= 46 ? 10 : 9;
  return { ...buttons, w };
}

export function recordingOverlayButtons({ held = false, assisted = false, rolling = false } = {}) {
  return { keys: [
    { id: 'rec', label: held || assisted ? 'HOLD' : 'REC', lit: rolling, color: 'red', latched: true, controlId: 'recording:rec' },
    { id: 'stop', label: 'STOP', color: 'white', controlId: 'recording:stop' },
  ] };
}

export function recorderControlRegions(rect, buttons = {}) {
  if (!rect) return [];
  const cluster = recorderButtons(rect, buttons);
  const w = cluster?.w || 9;
  return (cluster?.keys || []).map((key, index) => ({
    kind: 'transport', id: key.id || key.controlId || String(index), index,
    controlId: key.controlId || `recorder:${key.id || index}`,
    x: rect.x + rect.w - w - 2,
    y: rect.y + PANEL.headerRows + 1 + index * 2,
    w: Math.max(1, w - 2), h: 1.6,
    enabled: key.enabled !== false,
  }));
}

export function recorderHitRegions(view = {}) {
  const rect = view.rect;
  if (!rect) return [];
  const buttons = recorderButtons(rect, view.buttons);
  const regions = recorderControlRegions(rect, buttons);
  const body = machinePanelBody(rect.x, rect.y, rect.w, rect.h, { footer: view.footer || ' ' });
  const usableW = Math.max(1, body.w - (buttons ? buttons.w + 2 : 0));
  if (view.mode === TRANSPORT.BROWSE) {
    for (const [index, take] of (view.rows || []).entries()) {
      if (index >= body.h - 2) break;
      regions.push({ kind: 'take', id: take.roomId || String(index), index,
        x: body.x, y: body.y + 2 + index, w: usableW, h: 1 });
    }
  }
  if (view.mode === TRANSPORT.LISTEN) {
    const content = recorderTranscriptRect(body, { usableW, compact: !!rect.compact });
    const choices = layoutTranscriptChoices(view.guide || {}, content.w);
    for (const [index, choice] of choices.rows.entries()) {
      if (choice.kind !== 'choice') continue;
      regions.push({ kind: 'choice', index: choice.choiceIndex,
        x: content.x + choices.lane.x, y: content.y + content.h - choices.height + index,
        w: choices.lane.w, h: 1 });
    }
    // This region comes last so explicit options win over advancing speech.
    regions.push({ kind: 'guide', ...content });
  }
  return regions;
}

// The annunciators are a separate instrument row, not part of the transcript.
// Use the same rectangle for type, choices, and their pointer hit targets.
export function recorderTranscriptRect(body, { usableW = body.w, compact = false } = {}) {
  const top = compact ? 2.4 : 1.4;
  return { x: body.x, y: body.y + top, w: usableW, h: Math.max(1, body.h - top - .3) };
}

// Counter, reels and stereo meters share one finite width before the transport
// column. No minimum-width child is allowed to overrun its assigned bay.
export function recorderInstrumentLayout(body, { compact = false, buttons = null, levels = null, meter = null } = {}) {
  const usableW = Math.max(1, body.w - (buttons ? buttons.w + 2 : 0));
  const counterW = Math.min(compact ? 10 : 13, usableW * .48);
  const channelsW = !compact && levels && !meter && usableW >= 36 ? 9 : 0;
  const bayX = body.x + counterW + 1;
  const bayW = Math.max(.5, usableW - counterW - 1 - channelsW - (channelsW ? 1 : 0));
  return { usableW, counterW, bayX, bayW, channelsW,
    channelsX: body.x + usableW - channelsW };
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
  const traceInset = Math.min(6, rect.w * .35);
  const traceX = rect.x + traceInset;
  const traceW = Math.max(.5, rect.w - traceInset * 2);
  const mid = rect.y + rect.h * .52;
  const bins = Math.max(6, Math.floor(traceW));
  const left = clamp01(view.levels?.left);
  const right = clamp01(view.levels?.right);
  for (let index = 0; index < bins; index += 1) {
    const p = index / Math.max(1, bins - 1);
    const phase = p * 22 + progress * 7.4;
    const envelope = .18 + .82 * Math.abs(Math.sin(phase) * Math.cos(phase * .37));
    // A FLOOR UNDER THE TRACE.
    //
    // Amplitude was a pure function of signal, so a machine sitting in MONITOR
    // with nothing in front of the mic drew a flat dotted line across a large
    // empty box — the panel's biggest element saying nothing at all. Real tape
    // has a print on it whether or not anything is being said into it. The floor
    // is the print; the signal rides on top.
    // As a fraction of the bay, not as a raw signal. The first attempt at a
    // floor multiplied the envelope by the signal AND by the height AND by a
    // constant under one, which put the print at a tenth of a cell — a flat line
    // with a texture. The bay is the largest element on the panel; it has to
    // carry something.
    const drive = .35 + Math.min(1, left + right) * .65;
    const amp = rect.h * (.10 + .30 * envelope * drive);
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
    const radius = Math.min(cellW * 1.62, cellH * 1.02, cellW * rect.w * .12) * dpr;
    const reelInset = Math.min(2.8, rect.w * .20);
    const centers = [rect.x + reelInset, rect.x + rect.w - reelInset];
    ctx.save();
    // The tape path: the span the print is actually carried across. Without it
    // the two reels read as unrelated dials at opposite ends of a box.
    ctx.strokeStyle = UI_COLOR.frame;
    ctx.globalAlpha = .30;
    ctx.lineWidth = Math.max(1, dpr);
    const pathY = toY(rect.y + rect.h * .51);
    ctx.beginPath();
    ctx.moveTo(toX(centers[0]) + radius, pathY - radius * .34);
    ctx.lineTo(toX(centers[1]) - radius, pathY - radius * .34);
    ctx.stroke();
    for (let reelIndex = 0; reelIndex < centers.length; reelIndex += 1) {
      const cx = toX(centers[reelIndex]);
      const cy = toY(rect.y + rect.h * .51);
      ctx.strokeStyle = UI_COLOR.frame;
      ctx.globalAlpha = .68;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
      // How much tape is on this spool. The supply reel empties as the take
      // fills and the take-up reel grows, which is a second reading of the same
      // progress the location strip carries — and the one a player recognises
      // without being told what it means.
      const packed = reelIndex ? .32 + progress * .52 : .84 - progress * .52;
      ctx.globalAlpha = .30;
      ctx.beginPath(); ctx.arc(cx, cy, radius * packed, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .68;
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
    const statusW = Math.max(4, Math.min(14, Math.floor(body.w * .28)));
    const nameW = Math.max(1, body.w - statusW - 8);
    uiText(body.x + 6, y, fitText(row.label, nameW), role, selected ? 1 : .78, nameW);
    uiText(body.x + body.w - statusW, y, fitText(row.status, statusW), row.warn ? 'ui-amber' : 'ui-label',
      selected ? .9 : .6, statusW);
  });
}

// Which legends this machine has, and which one is alight. Derived from the
// transport so every caller gets the row without maintaining it; a caller with
// something better to say passes `view.annunciators`.
function annunciatorsFor(mode, view = {}) {
  return [
    { label: 'REC', lit: mode === TRANSPORT.RECORD, role: 'ui-marker' },
    { label: 'PLAY', lit: mode === TRANSPORT.PLAY },
    { label: 'MON', lit: mode === TRANSPORT.MONITOR || mode === TRANSPORT.LISTEN },
    { label: 'MIC', lit: mode === TRANSPORT.CHECK || !!view.roomMeter },
    { label: 'TAKES', lit: mode === TRANSPORT.BROWSE },
  ];
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
  const buttons = recorderButtons(rect, view.buttons);

  return withMachinePanel(rect.x, rect.y, rect.w, rect.h, {
    theme: 'green',
    finish: 'aluminum',
    wordmark: 'hi ta chi',
    model: 'DA-1000',
    label: view.label || LABEL[mode] || 'RECORD',
    source: view.source || null,
    meter: false,
    footer: view.footer || ' ',
    footerParts: view.footerParts || null,
    buttons,
  }, (body) => drawRecorderDisplay(body, view, mode, compact, buttons));
}

// All transport states share the same sealed display cavity. Early returns
// leave only this content callback, so the glass cover and physical controls
// are still drawn after MIC CHECK, TAKES, and LISTEN as well as a rolling tape.
function drawRecorderDisplay(body, view, mode, compact, buttons) {
  const bx = body.x;
  const by = body.y;
  // The button cluster is drawn by withMachinePanel against the right bezel,
  // over the top of the body. Everything laid out here has to stop short of it
  // or the panel draws two things in one place — which it did: the pre-roll
  // counter landed on STOP, and the channel meters landed on both.
  const instruments = recorderInstrumentLayout(body, { compact, buttons, levels: view.levels, meter: view.meter });
  const { usableW } = instruments;

  // ── THE ANNUNCIATOR ROW ───────────────────────────────────────────────────
  //
  // What the machine CAN be doing, with the one it is doing lit. The panel used
  // to carry a single transport lamp — "◆ READY" alone on a row — which told the
  // player the state and nothing about the instrument. A row of legends that are
  // mostly dark is the thing that makes a VFD read as hardware, and it costs the
  // same row the lamp was already taking.
  //
  // The lamp's own text still prints, to the right of the legends, because it
  // says things the four fixed words cannot ("TAPE RETURN", a spoil reason).
  const annunciators = (view.annunciators || annunciatorsFor(mode, view)).map((item) => usableW < 30
    ? { ...item, label: ({ REC: 'R', PLAY: 'P', MON: 'M', MIC: 'MIC', TAKES: 'T' })[item.label] || item.label }
    : item);
  const annunW = drawVfdAnnunciators(bx, by, annunciators, { theme: 'green', gap: usableW < 30 ? .6 : 2 });
  if (view.lamp && !compact) {
    const lampX = bx + annunW + 1;
    const lampW = Math.max(0, usableW - annunW - 1);
    if (lampW > 6) uiText(lampX, by, fitText(view.lamp.text, lampW), view.lamp.role || 'ui-marker', 1, lampW);
  } else if (view.lamp) {
    uiText(bx, by + 1, fitText(view.lamp.text, usableW), view.lamp.role || 'ui-marker', 1, usableW);
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
    const content = recorderTranscriptRect(body, { usableW, compact });
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

  // ── THE ROW BUDGET ────────────────────────────────────────────────────────
  //
  // Rows are assigned once, in order, instead of by ad-hoc offsets off `by`.
  // The note was drawn at body.h-1 while the room-mic meter was drawn at locY+3
  // with a two-row scale, so on a ten-row body they landed on top of each other
  // — that is "NOT A ROOM ON THE ORDER" printed inside the ROOM MIC bar. The
  // note owns the last row and nothing else is allowed to reach it.
  const noteRow = by + body.h - 1;
  const bandY = by + 1.2;
  const bandH = compact ? 2.4 : 3.2;

  // COUNTER on the left, TRANSPORT BAY on the right. The counter is the thing
  // the player actually reads; the bay is the thing that tells them the machine
  // is alive.
  const counterX = bx;
  const { counterW, bayX, bayW, channelsW } = instruments;
  if (view.counter) {
    uiText(counterX, bandY, fitText(view.counterLabel || (compact ? 'COUNTER' : 'TIME COUNTER'), counterW), 'ui-label', 1, counterW);
    drawVfdCounter(counterX, bandY + 1, view.counter, {
      scale: compact ? 1.1 : 1.4, theme: 'green', color: view.counterColor || null,
    });
    if (view.counterTotal) {
      uiText(counterX, bandY + 2.7, fitText(view.counterTotal, counterW), 'ui-secondary', .8, counterW);
    }
  }

  drawTransportBay({ x: bayX, y: bandY, w: bayW, h: bandH }, view);

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
  if (channelsW) {
    const meterW = channelsW;
    const meterX = instruments.channelsX;
    drawChannelMeter(meterX, bandY, meterW, view.levels.left, 'L');
    drawChannelMeter(meterX, bandY + 1.1, meterW, view.levels.right, 'R');
  }

  // LOCATION INDICATOR — the minute, or the tape, with a red position marker.
  // The DA-1000's signature, and the reason the theme has a marker colour.
  //
  // The graduation NOTCHES cost no rows — they stand inside the bar — so the
  // strip always reads as a scale. The printed numbers cost a row and are only
  // taken when one is going spare, which is when there is no LEVEL meter below
  // wanting its own scale.
  const locY = bandY + bandH + (compact ? .2 : .4);
  const stacked = (view.meter ? 1 : 0) + (view.roomMeter ? 1 : 0);
  uiText(bx, locY, 'LOCATION INDICATOR', 'ui-label', 1, body.w);
  drawLocationIndicator(bx, locY + 1, Math.max(8, body.w), clamp01(view.progress), {
    theme: 'green',
    seconds: view.locationSeconds || 45,
    // What happened, and when. Already recorded, never shown.
    marks: view.locationMarks || null,
    rows: stacked ? 1 : 2,
  });

  // LEVEL, and the room mic under it — ONE SCALE, TWO NEEDLES, and both of them
  // above the note. Aligned and equal-width so the comparison the player
  // actually needs — is what the tape hears the room, or something else — is a
  // glance rather than a conversion between two rulers.
  const meterX = bx + 10;
  const meterW = Math.max(6, usableW - 10);
  const firstMeterY = locY + 1 + (stacked ? 1 : 2);
  // The scale row hangs off the LOWER bar, and is the first thing dropped when
  // the panel is short: a scale that overruns the note is worse than no scale.
  const lastMeterY = firstMeterY + Math.max(0, stacked - 1);
  const scaleRows = lastMeterY + 2 <= noteRow ? 2 : 1;

  if (view.meter) {
    uiText(bx, firstMeterY, fitText(view.meterLabel || 'LEVEL', 9), 'ui-label', 1, 9);
    drawVfdMeter(meterX, firstMeterY, meterW, view.meter, {
      theme: 'green', id: 'take-level',
      thresholdDb: view.meterThresholdDb ?? -6,
      rows: view.roomMeter ? 1 : scaleRows,
      marks: view.roomMeter ? null : view.meterMarks || null,
    });
  }

  if (view.roomMeter) {
    const roomY = view.meter ? firstMeterY + 1 : firstMeterY;
    uiText(bx, roomY, 'ROOM MIC', 'ui-label', 1, 9);
    drawVfdMeter(meterX, roomY, meterW, view.roomMeter, {
      theme: 'green', id: 'room-mic', thresholdDb: -12,
      rows: scaleRows,
      // The marks belong to the take, not to the room, so they are only drawn
      // when the take's own meter is the one being scaled.
      marks: view.meter ? view.meterMarks || null : null,
    });
  }

  // The one line the machine says about itself, on the row reserved for it.
  if (view.note) {
    drawVfdText(bx, noteRow, fitText(view.note, Math.floor(body.w / .72)), {
      scale: .72, theme: view.noteTheme || 'green', alpha: .94, max: body.w,
    });
  }
  return body;
}
