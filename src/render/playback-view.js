// A sealed-take return on the recorder itself. Playback is not a generic HUD
// progress bar: it is a small, physical transport whose reels, counter, trace,
// printed sources and cue marks all describe the tape currently in the cans.

import { TRANSPORT, drawRecorderFace, recorderPanelRect } from './recorder-view.js';

export function formatPlaybackTime(seconds = 0) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function buildPlaybackViewModel(snapshot, { roomTitle = 'SEALED TAKE', takeNumber = 0 } = {}) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    roomTitle: String(roomTitle || 'sealed take').toUpperCase(),
    takeLabel: takeNumber > 0 ? `TAKE ${String(takeNumber).padStart(2, '0')}` : 'SEALED TAKE',
    elapsedLabel: formatPlaybackTime(snapshot.elapsedSec),
    remainingLabel: `-${formatPlaybackTime(snapshot.remainingSec)}`,
    printLabel: `${snapshot.sourceCount} SOURCE${snapshot.sourceCount === 1 ? '' : 'S'}`
      + (snapshot.eventCount ? ` · ${snapshot.eventCount} EVENT${snapshot.eventCount === 1 ? '' : 'S'}` : ''),
  };
}

// The transport bay, the channel meters and the panel geometry used to live
// here as a second implementation of the same instrument. They are in
// render/recorder-view.js now, drawn once for both transports.

export function drawPlaybackOverlay({ snapshot, cols, rows, roomTitle, takeNumber = 0, clearBottom = 0 } = {}) {
  const view = buildPlaybackViewModel(snapshot, { roomTitle, takeNumber });
  if (!view) return false;

  const rect = recorderPanelRect({ cols, rows, progress: 0, rowsNeeded: 9, clearBottom });
  drawRecorderFace({
    mode: TRANSPORT.PLAY,
    rect,
    source: 'HEADPHONES',
    // A tape return has no transport lamp of its own; the take number is what
    // identifies the thing in the cans.
    lamp: { text: `▶ ${view.takeLabel}`, role: 'ui-blue' },
    progress: view.progress,
    // The reels follow the tape rather than the clock: this one is being played,
    // not recorded, and it is the print moving past the head.
    spin: view.progress,
    drift: view.tapeDrift,
    markers: view.markers,
    counter: view.elapsedLabel,
    counterLabel: 'TIME COUNTER',
    counterTotal: view.remainingLabel,
    levels: { left: view.signalLeft, right: view.signalRight },
    // No LEVEL meter: nothing being played back can spoil anything, and a
    // gauge that cannot go wrong is a gauge that means nothing.
    meter: null,
    // The room, and what is printed on the tape. The machine never says
    // anything about the guest — see the note in game/playback.js.
    note: view.tapeDrift >= .18 ? 'REF MATCH' : view.roomTitle,
    noteTheme: view.tapeDrift >= .18 ? 'amber' : 'green',
    footer: `SEALED PRINT · ${view.printLabel} · IN THE CANS ONLY`,
    footerParts: [{ action: 'playback', label: 'STOP' }],
  });
  return true;
}
