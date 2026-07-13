import * as scenes from './scenes.js';
import { uiScrim, uiSize } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { drawStoryArtCard } from './story-art-card.js';
import { storyArtRefId } from './story-art.js';

export function makeStoryArtPreviewScene({ art = 'guard', mode = 'hero' } = {}) {
  const id = storyArtRefId(art) || String(art || 'guard');

  return {
    id: `story-art-preview:${id}`,
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    key(e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key === 'z') {
        scenes.pop();
      }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiScrim(0.62);
      const w = Math.min(92, cols - 4);
      const h = Math.min(rows - 4, Math.max(20, Math.floor(rows * 0.72)));
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const panel = drawMachinePanel(x, y, w, h, {
        label: 'STORY ART',
        source: id.toUpperCase(),
        footer: '[ESC] CLOSE',
        meter: true,
      });
      drawStoryArtCard({ id, mode }, {
        x: panel.x,
        y: panel.y,
        w: panel.w,
        rows: Math.min(16, panel.h - 1),
        mode,
      });
    },
  };
}
