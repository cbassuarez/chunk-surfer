import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixedTranscriptLanes,
  layoutTranscript,
  layoutTranscriptChoices,
} from '../src/render/transcript.js';

const viewWithLongLocalChoice = {
  who: 'you',
  line: { text: 'I should answer from the right lane.' },
  typed: 36,
  lineSerial: 1,
  history: [
    { who: 'guard', text: 'Five rooms. It says. That is a lot of rooms.', serial: 0 },
  ],
  pending: {
    kind: 'branch',
    index: 0,
    options: [
      { text: 'it is only a minute each, really it is the waiting about that takes the night' },
      { text: 'ask about the work order again before folding it up' },
    ],
  },
  spent: () => false,
};

test('fixed transcript lanes keep image and text as separate halves', () => {
  const lanes = fixedTranscriptLanes(82, { split: { artCols: 40, textCols: 40, gap: 2 } });
  assert.deepEqual(lanes.left, { x: 42, w: 40, align: 'left' });
  assert.deepEqual(lanes.right, { x: 42, w: 40, align: 'left' });
  assert.deepEqual(lanes.center, { x: 42, w: 40, align: 'center' });
});

test('choice layout clamps every local choice row to the right pane', () => {
  const lanes = fixedTranscriptLanes(82, { split: { artCols: 40, textCols: 40, gap: 2 } });
  const layout = layoutTranscriptChoices(viewWithLongLocalChoice, 82, { lane: lanes.right });
  assert.equal(layout.lane.x, 42);
  assert.equal(layout.lane.w, 40);
  assert.ok(layout.rows.length > 3, 'long choices should wrap to multiple rows');
  for (const row of layout.rows) {
    assert.ok(row.text.length <= layout.lane.w, row.text);
  }
});

test('story-art transcript layout clamps every role to the right text pane', () => {
  const lanes = fixedTranscriptLanes(82, { split: { artCols: 40, textCols: 40, gap: 2 } });
  const layout = layoutTranscript(viewWithLongLocalChoice, {
    width: 82,
    maxRows: 12,
    keep: 4,
    lanes,
  });
  assert.ok(layout.blocks.length >= 1);
  for (const block of layout.blocks) {
    assert.equal(block.lane.x, 42, `${block.role.side} lane starts at ${block.lane.x}`);
    assert.ok(block.lane.w <= 40, `${block.role.side} lane width ${block.lane.w}`);
  }
});
