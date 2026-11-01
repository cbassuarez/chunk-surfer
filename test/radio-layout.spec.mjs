import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { radioSceneLayout } from '../src/render/radio-scene.js';
import { uiWrap, uiCellMetrics, uiSetScale } from '../src/render/ui.js';
import { radioContactFrame } from '../src/render/radio-contact-performance.js';
import { radioContactProjectPoint } from '../src/render/radio-contact-3d.js';
import { RADIO_CONTACT_CONTROLS } from '../src/render/radio-contact-model.js';
import { UI_CELL_W, UI_CELL_H } from '../src/render/atlas.js';

const directory = new URL('../content/narrative/', import.meta.url);
const documents = readdirSync(directory).filter(name => name.startsWith('radio.') || name === 'conservatory.radio_dead.story.json')
  .map(name => JSON.parse(readFileSync(new URL(name, directory), 'utf8')));
const inside = (point, rect) => point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;

test('the actual radio corpus remains complete at compact landscape and enlarged-text sizes without sacrificing the physical view', () => {
  const sizes = [{ cols: 50, rows: 16 }, { cols: 60, rows: 18 },
    { cols: Math.floor(960 / (UI_CELL_W * 1.5)), rows: Math.floor(600 / (UI_CELL_H * 1.5)) }];
  let checked = 0;
  for (const size of sizes) for (const doc of documents) for (const node of Object.values(doc.nodes || {})) {
    const states = (node.lines || []).map(line => ({ line }));
    if (node.choices?.length) states.push({ line: node.lines.at(-1), pending: { options: node.choices, index: 0 } });
    for (const view of states) {
      const layout = radioSceneLayout(size, { ...view, radio: { time: 1, instrument: { channel: 2 } } });
      const label = `${doc.id}:${view.line?.id || node.id} ${size.cols}×${size.rows}`;
      const proseBottom = layout.textY + (layout.lines.length - 1) * layout.lineStep + 1;
      assert.ok(proseBottom <= (layout.choices[0]?.y - .15 || layout.footerY - .5) + 1e-6, label);
      assert.equal(layout.textRows, Math.max(1, layout.lines.length), `${label}: no prose is clipped out`);
      assert.ok(layout.stage.h >= size.rows * .75, `${label}: the carried object retains its vertical scale`);
      assert.ok(layout.x >= 0 && layout.x + layout.w <= size.cols, label);
      for (const rect of layout.choices) {
        assert.ok(rect.y >= 0 && rect.y + rect.h <= layout.footerY, label);
        const rows = uiWrap(rect.choice.text, rect.w - layout.choiceTextInset);
        assert.ok((rows.length - 1) * layout.lineStep + 1 <= rect.h, `${label}: every reply row remains visible`);
      }
      checked++;
    }
  }
  assert.ok(checked >= 250, 'exercise authored prose and reply sets, including both terminal failures');
});

test('hardware picking retains projected centers at both text scales and never reaches through caption ink', () => {
  try {
    for (const scale of [1, 1.5]) for (const size of [{ cols: 60, rows: 18 }, { cols: 120, rows: 38 }]) {
      uiSetScale(scale);
      const view = { line: { text: 'Channel two.' }, radio: { stage: 'live', time: 1, instrument: { channel: 2 } } };
      const layout = radioSceneLayout(size, view), frame = radioContactFrame(view), { cellW, cellH } = uiCellMetrics();
      assert.ok(Object.keys(layout.controls).length >= 2, 'a settled physical instrument has distinct exposed controls');
      for (const [id, rect] of Object.entries(layout.controls)) {
        const point = radioContactProjectPoint(RADIO_CONTACT_CONTROLS[id].pickCenter || RADIO_CONTACT_CONTROLS[id].position,
          { width: layout.stage.w * cellW, height: layout.stage.h * cellH, frame });
        assert.ok(Math.abs(rect.center.x - (layout.stage.x + point.x / cellW)) < .02, `${id}: real x center`);
        assert.ok(Math.abs(rect.center.y - (layout.stage.y + point.y / cellH)) < .02, `${id}: real y center`);
        assert.ok(inside(rect.center, layout.stage), `${id}: center stays on stage`);
        assert.ok(!layout.occlusionRects.some(ink => inside(rect.center, ink)), `${id}: cannot click through caption ink`);
      }
    }
  } finally { uiSetScale(1); }
});

test('off-channel status is measured as the actual visible caption rather than the shorter waiting line', () => {
  const view = { line: { text: 'Ready.' }, radio: { time: 1, instrument: { channel: 13 } } };
  const layout = radioSceneLayout({ cols: 60, rows: 18 }, view);
  assert.equal(layout.lines.join(' '), 'No front desk carrier. Channel two is still there.');
  assert.ok(layout.textY + (layout.lines.length - 1) * layout.lineStep + 1 < layout.footerY);
});
