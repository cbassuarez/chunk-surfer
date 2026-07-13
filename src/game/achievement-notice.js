import * as scenes from './scenes.js';
import { uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { consumeNotice, resolveNotice } from '../progression/notifications.js';
import * as AUDIO from '../audio/story-audio.js';

export function makeAchievementNoticeScene({ notice, duration = 3.8 } = {}) {
  const resolved = resolveNotice(notice);
  let self = null;
  let t = 0;
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    consumeNotice(notice.id);
    scenes.remove(self);
  }
  self = {
    id: `achievement-notice:${notice.id}`,
    overlay: true,
    blocksInput: false,
    blocksWorld: false,
    enter() { AUDIO.menuConfirm?.(); },
    update(dt) { t += dt; if (t >= duration) finish(); },
    key() { return false; },
    render() {
      if (!resolved) return;
      const { cols, rows } = uiSize();
      const w = Math.min(50, cols - 4), h = 9;
      const x = cols - w - 2, y = Math.max(2, rows - h - 2);
      const alpha = Math.min(1, t / 0.18, (duration - t) / 0.35);
      const body = drawMachinePanel(x, y, w, h, {
        label: 'ACHIEVEMENT UNLOCKED', source: 'PROGRESS', footer: '', meter: false,
      });
      uiText(body.x, body.y + 1, resolved.title.toUpperCase(), 'ui-amber', alpha);
      uiWrap(resolved.body, body.w).slice(0, 3).forEach((line, i) => uiText(body.x, body.y + 3 + i, line, 'ui-primary', alpha));
    },
  };
  return self;
}
