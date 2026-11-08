// Gamepad traces: real frames, recorded once, replayed forever.
//
// A trace is the raw device state per polled frame — axes and per-button
// values, nothing derived — so replaying one through the poller exercises the
// exact same code a live pad does, deterministically. The dev capture side
// (record/download) runs in the game behind ?gamepadTrace; the replay side
// runs in node tests through setControllerNavigatorForTest.

import { deviceLayoutFor } from './controller-device.js';

const SEMANTIC_INDEX = Object.freeze({
  south: 0, east: 1, west: 2, north: 3, leftShoulder: 4, rightShoulder: 5,
  leftTrigger: 6, rightTrigger: 7, view: 8, menu: 9, leftStick: 10, rightStick: 11,
  dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15, guide: 16,
});
const STANDARD_AXES = Object.freeze(['leftx', 'lefty', 'rightx', 'righty']);

export function traceFrameFromSnapshot(snapshot) {
  const raw = snapshot?.rawValues || {};
  const buttons = {};
  for (const [id, value] of Object.entries(raw.buttons || {})) buttons[id] = Number(value) || 0;
  return { axes: [...(raw.axes || [])].map((v) => Number(v) || 0), buttons };
}

// A frame's buttons may be named by semantic id ('south') or by numeric
// physical index ('6'). Semantic ids are placed on the physical index where
// THIS device's south/trigger/etc. actually lives — the database row when the
// pad id resolves, the standard position when it does not — so the same
// trace replays truthfully on any device shape.
function frameButtonValue(frame, index, padId) {
  const byNumber = frame.buttons[index];
  if (byNumber != null && typeof byNumber === 'number') return byNumber;
  if (byNumber != null && typeof byNumber === 'object') return Number(byNumber.value ?? 0);
  const semantic = semanticToPhysical(padId);
  for (const [id, value] of Object.entries(frame.buttons)) {
    const target = semantic[id] ?? SEMANTIC_INDEX[id];
    if (target === index) return Number(value) || 0;
  }
  return 0;
}

/**
 * A navigator whose pads are served from a recorded trace, one frame per
 * poll. The pad identity belongs to the trace, so device-database resolution
 * and family detection are exercised too.
 */
export function gamepadTraceNavigator({ frames = [], padId = 'Trace Pad (Vendor: 054c Product: 09cc)' } = {}) {
  let poll = 0;
  return {
    getGamepads: () => {
      const frame = frames[Math.min(poll, frames.length - 1)];
      poll += 1;
      if (!frame) return [];
      const axes = Array.isArray(frame.axes) ? frame.axes : Object.values(STANDARD_AXES).map((role) => Number(frame.axes?.[role] ?? 0));
      const buttons = Array.from({ length: 18 }, (_, index) => {
        const value = frameButtonValue(frame, index, padId);
        return { pressed: value >= 0.5, value };
      });
      return [{ id: padId, index: 0, axes, buttons, mapping: 'standard' }];
    },
  };
}

// The device's own row, inverted: semantic id -> physical index. DB rows may
// also place triggers on axes; those keep no physical index here because the
// poller reads the axis value for them.
const semanticToPhysicalCache = new Map();
function semanticToPhysical(padId) {
  if (semanticToPhysicalCache.has(padId)) return semanticToPhysicalCache.get(padId);
  const layout = deviceLayoutFor(padId);
  const map = {};
  for (const [physical, semantic] of layout?.buttons || []) map[semantic] = physical;
  semanticToPhysicalCache.set(padId, map);
  return map;
}

// The capture side, for the game itself: records the live snapshot each tick
// and hands the trace over as a downloadable JSON file.
export function createGamepadTraceRecorder() {
  const frames = [];
  return {
    record(snapshot) {
      frames.push(traceFrameFromSnapshot(snapshot));
      if (frames.length > 60 * 120) frames.shift(); // two minutes at 60 fps
    },
    download(filename = 'gamepad-trace.json') {
      const blob = new Blob([JSON.stringify({ schema: 1, frames }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return frames.length;
    },
    frames() { return frames.length; },
  };
}
