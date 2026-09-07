// Launch advisories and the required fullscreen handoff share one presentation.
// They sit ahead of the licence/calibration flow and require a fresh input on
// every launch. The in-game handoff advances only after the native exit succeeds.
import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiSize, uiWrap, uiWithAlpha } from '../render/ui.js';
import { uiRoleColor } from '../render/palette.js';
import { drawVfdText } from '../render/presentation.js';

export const DISPLAY_NOTICE_SCENE_ID = 'display-notice';

const HEADLINE = 'PLAY IN A WINDOW';
const READ_BEFORE_TRANSITION = 2.4;
const TRANSITION_SETTLE = 0.6;

export function displayNoticeLines({ desktop = true, fullscreen = false } = {}) {
  return {
    body: desktop
      ? 'Some sequences open extra windows around the game.'
      : 'The desktop version opens extra windows during play.',
    warning: desktop
      ? `${fullscreen ? 'Fullscreen is on. ' : ''}The game switches to windowed mode when those windows are needed.`
      : 'In your browser, they appear inside the game.',
  };
}

const PREVIEW_WINDOWS = Object.freeze([
  { rx: .42, ry: .44, speed:  .55, phase: 0,   w: 4.2, h: 1.35 },
  { rx: .48, ry: .32, speed: -.38, phase: 2.1, w: 3.4, h: 1.15 },
  { rx: .35, ry: .48, speed:  .27, phase: 4.0, w: 3.0, h: 1.05 },
  { rx: .52, ry: .24, speed: -.62, phase: 5.2, w: 2.6, h: .95 },
]);

function drawWindowPreview(x, y, w, h, t, release = null) {
  const glass = uiRoleColor('ui-amber');
  const other = uiRoleColor('ui-secondary');
  const cx = x + w / 2, cy = y + h / 2;

  const pane = (px, py, pw, ph, colour) => {
    uiFill(px, py, pw, .24, colour);              // the title bar
    uiFill(px, py + .30, pw, Math.max(.2, ph - .30), colour);
  };

  uiWithAlpha(release == null ? 1 : release, () => {
    for (const s of PREVIEW_WINDOWS) {
      const a = t * s.speed + s.phase;
      const swell = 1 + .12 * Math.sin(t * .43 + s.phase);
      pane(
        cx + Math.cos(a) * w * s.rx * swell - s.w / 2,
        cy + Math.sin(a) * h * s.ry * swell - s.h / 2,
        s.w, s.h, other,
      );
    }
  });
  // During a handoff the central frame shrinks to reveal the satellites.
  const size = release == null ? 0 : 1 - release;
  const iw = w * (.34 + .56 * size), ih = h * (.42 + .5 * size);
  pane(cx - iw / 2, cy - ih / 2, iw, ih, glass);
}

export const HEADPHONE_NOTICE_SCENE_ID = 'headphone-notice';

export function headphoneNoticeLines() {
  return {
    body: 'The game uses your microphone to measure room noise.\nSound from speakers can raise that reading and make you lose faster.',
    warning: 'Use headphones to keep game audio out of the mic.',
  };
}

// The same small, amber silhouette as the window preview. Sound stays between
// the ear cups. This is an illustration, not a live microphone reading.
function drawHeadphonePreview(x, y, w, h, t) {
  const amber = uiRoleColor('ui-amber');
  const other = uiRoleColor('ui-secondary');
  const cx = x + w / 2;
  const scale = h / 5;
  const fill = (px, py, pw, ph, color) => uiFill(cx + (px - cx) * scale, y + (py - y) * scale, pw * scale, ph * scale, color);
  h = 5;
  fill(cx - 3, y, 6, .35, amber);
  fill(cx - 3.7, y + .35, .7, .55, amber);
  fill(cx + 3, y + .35, .7, .55, amber);
  fill(cx - 4, y + .9, .35, h - 1.6, amber);
  fill(cx + 3.65, y + .9, .35, h - 1.6, amber);
  fill(cx - 3.65, y + h - 2.5, 1.1, 2.1, amber);
  fill(cx + 2.55, y + h - 2.5, 1.1, 2.1, amber);
  for (let i = 0; i < 7; i++) {
    const level = .25 + .9 * (.5 + .5 * Math.sin(t * 2.2 + i * .8));
    fill(cx - 1.7 + i * .5, y + 3.2 - level / 2, .22, level, other);
  }
}

export function makeHeadphoneNoticeScene(options = {}) {
  return makeDisplayNoticeScene({ ...options, kind: 'headphones', transition: null });
}

// Balance centered paragraphs so a single trailing word never hangs below a
// full line. Keep the original line count and stay within the available width.
function wrapNotice(text, width) {
  const lines = uiWrap(text, width);
  if (lines.length < 2) return lines;
  for (let candidate = Math.ceil(text.length / lines.length); candidate < width; candidate++) {
    const balanced = uiWrap(text, candidate);
    if (balanced.length === lines.length) return balanced;
  }
  return lines;
}

// All copy, including retry instructions, wraps inside the same column.
function noticeLayout({ cols, rows }, headline, notice, prompt) {
  const width = Math.min(56, Math.max(16, cols - 6));
  const compact = rows < 28;
  const headScale = Math.min(compact ? 1.2 : 1.5, (cols - 4) / headline.length);
  const body = notice.body.split('\n').map(p => wrapNotice(p, width));
  const warning = wrapNotice(notice.warning, width);
  const gap = compact ? .7 : 1.5;
  const previewH = compact ? 3 : 5;
  const previewSpace = previewH + (compact ? 1 : 2.4);
  const bodyH = body.reduce((n, lines) => n + lines.length, 0) + (body.length - 1) * gap;
  const promptLines = wrapNotice(prompt, width);
  const height = headScale + gap + previewSpace + gap + bodyH + gap + warning.length + gap + promptLines.length;
  return { width, headScale, body, warning, promptLines, gap, previewH, previewSpace, y: Math.max(.5, (rows - height) / 2) };
}

export function makeDisplayNoticeScene({
  onDone = () => {},
  onCancel = () => {},
  desktop = true,
  isFullscreen = () => false,
  getReducedMotion = () => false,
  now = () => performance.now() / 1000,
  transition = null,
  signal = null,
  kind = 'window',
} = {}) {
  let scene = null;
  let t = 0;
  let enteredAt = null;
  let settledAt = null;
  let closed = false;
  let pending = false;
  let failed = false;
  const ARMED_AFTER = 0.35;
  // Gameplay clamps dt during expensive startup frames. A fresh click after
  // reading the notice must not be rejected because simulation time ran slowly.
  const armed = () => t >= ARMED_AFTER || (enteredAt != null && now() - enteredAt >= ARMED_AFTER);

  const cancel = () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', cancel);
    scenes.remove(scene);
    onCancel();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', cancel);
    scenes.remove(scene);
    onDone();
  };
  const advance = () => {
    if (closed || pending || settledAt != null) return;
    if (!transition) { close(); return; }
    pending = true;
    failed = false;
    // Preserve a real retry gesture for platforms that require one.
    let result;
    try { result = transition(); } catch { result = false; }
    Promise.resolve(result).then((ok) => {
      if (closed) return;
      pending = false;
      if (ok) settledAt = t;
      else failed = true;
    }, () => {
      if (closed) return;
      pending = false;
      failed = true;
    });
  };

  scene = {
    id: transition ? 'window-transition' : kind === 'headphones' ? HEADPHONE_NOTICE_SCENE_ID : DISPLAY_NOTICE_SCENE_ID,
    freezesBelow: true,
    blocksInput: true,
    blocksWorld: true,
    suppressesHud: true,
    handlesEscape: true,
    worldPresentation: 'hidden',

    enter() {
      enteredAt = now();
      if (signal?.aborted) cancel();
      else signal?.addEventListener('abort', cancel, { once: true });
    },
    exit: cancel,
    update(dt) {
      if (closed) return;
      t += Math.max(0, dt || 0);
      if (settledAt != null) {
        if (t - settledAt >= TRANSITION_SETTLE) close();
      } else if (transition && t >= READ_BEFORE_TRANSITION && !pending && !failed) advance();
    },
    key(event) {
      if (event?.repeat || event?.metaKey || event?.ctrlKey || event?.altKey) return true;
      // OS display shortcuts must not also acknowledge the advisory.
      if (['Meta', 'Control', 'Alt', 'Shift', 'F11'].includes(event?.key)) return true;
      if (armed() && (!transition || failed)) advance();
      return true;
    },
    pointer(event) {
      const button = event?.button ?? event?.originalEvent?.button ?? 0;
      if (event?.type === 'pointerdown' && button === 0
          && armed() && (!transition || failed)) advance();
      return true;
    },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, '#050506');
      const complete = settledAt != null;
      const notice = transition ? {
        body: 'This sequence opens extra windows outside the game.',
        warning: failed ? 'Exit fullscreen manually if the problem continues.'
          : complete ? 'Windowed mode is ready.' : 'Switching out of fullscreen so you can see them.',
      } : kind === 'headphones' ? headphoneNoticeLines() : displayNoticeLines({ desktop, fullscreen: !!isFullscreen() });
      const headline = transition ? (failed ? 'COULD NOT LEAVE FULLSCREEN' : 'SWITCHING TO WINDOWED MODE')
        : kind === 'headphones' ? 'PLAY WITH HEADPHONES' : HEADLINE;
      const prompt = transition ? (failed ? 'PRESS ANY KEY OR CLICK TO RETRY' : complete ? 'CONTINUING...' : 'PLEASE WAIT')
        : 'PRESS ANY KEY OR CLICK';
      const layout = noticeLayout({ cols, rows }, headline, notice, prompt);
      const { width, headScale, body, warning, promptLines, gap, previewH, previewSpace } = layout;
      let y = layout.y;
      drawVfdText((cols - headline.length * headScale) / 2, y, headline,
        { scale: headScale, alpha: .96, max: cols - 4 });
      y += headScale + gap;

      const reduced = !!getReducedMotion();
      const previewTime = reduced ? 0 : t;
      const dw = Math.min(22, width - 4);
      const previewY = y + (previewSpace - previewH) / 2;
      if (kind === 'headphones') drawHeadphonePreview((cols - dw) / 2, previewY, dw, previewH, previewTime);
      else {
        const release = transition ? (reduced ? 1 : Math.min(1, t / READ_BEFORE_TRANSITION)) : null;
        drawWindowPreview((cols - dw) / 2, previewY, dw, previewH, previewTime, release);
      }
      y += previewSpace + gap;
      for (const [index, paragraph] of body.entries()) {
        if (index) y += gap;
        for (const line of paragraph) { uiCenter(y, line, 'ui-primary', .9); y++; }
      }
      y += gap;
      for (const line of warning) { uiCenter(y, line, 'ui-amber', .9); y++; }
      y += gap;
      // Keep the prompt readable throughout its breath, including reduced motion.
      const pulse = reduced ? .75 : .7 + .12 * Math.sin(t * 2.2);
      for (const line of promptLines) {
        uiCenter(y, line, 'ui-primary', armed() ? pulse : .4); y++;
      }
    },
  };
  return scene;
}
