//
//  transcript.js
//
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// AUDIOCORP two-channel transcript renderer.
//
// This is message-composer spatial logic translated into a field-recorder
// monitor: received voices live on the left, the local operator lives on the
// right, and machine/direction text occupies a centered rail. It owns no scene
// state and changes no input; presenters pass it a conversation view.

import { uiText, uiItalicText, uiWrap } from './ui.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const SPEAKER_LABEL = Object.freeze({
  me: 'YOU',
  you: 'YOU',
  player: 'YOU',
  guard: 'GUARD',
  sarah: 'SARAH',
  client: 'CLIENT',
  radio: 'RADIO',
  recordist: 'RECORDIST',
  surfer: 'SIGNAL',
  unknown: 'UNKNOWN',
});

const SPEAKER_ACCENT = Object.freeze({
  guard: 'ui-amber',
  sarah: 'ui-blue',
  client: 'ui-blue',
  radio: 'ui-amber',
  recordist: 'ui-green',
  surfer: 'ui-danger',
  unknown: 'ui-counter',
});

function keyOf(who) {
  return String(who || 'direction').trim().toLowerCase();
}

function labelOf(who) {
  const key = keyOf(who);
  return SPEAKER_LABEL[key] || String(who || 'SOURCE').trim().toUpperCase();
}

export function transcriptRole(who) {
  const key = keyOf(who);

  if (key === 'me' || key === 'player') {
    return {
      key: 'player:spoken',
      kind: 'player',
      side: 'right',
      speaker: 'YOU',
      labelCls: 'ui-amber',
      bodyCls: 'ui-amber',
      cursorCls: 'ui-amber',
      activeAlpha: 1,
      groupable: true,
    };
  }

  if (key === 'you') {
    return {
      key: 'player:internal',
      kind: 'player',
      side: 'right',
      speaker: 'YOU',
      labelCls: 'ui-amber',
      bodyCls: 'ui-primary',
      cursorCls: 'ui-amber',
      activeAlpha: 0.96,
      groupable: true,
    };
  }

  if (key === 'system' || key === 'machine') {
    return {
      key: 'system',
      kind: 'system',
      side: 'center',
      speaker: '',
      labelCls: 'ui-label',
      bodyCls: 'ui-amber',
      cursorCls: 'ui-amber',
      activeAlpha: 0.82,
      groupable: false,
    };
  }

  if (key === 'direction' || key === 'narration' || key === '') {
    return {
      key: 'direction',
      kind: 'direction',
      side: 'center',
      speaker: '',
      labelCls: 'ui-secondary',
      bodyCls: 'ui-secondary',
      cursorCls: 'ui-secondary',
      activeAlpha: 0.68,
      groupable: false,
    };
  }

  return {
    key: `incoming:${key}`,
    kind: 'incoming',
    side: 'left',
    speaker: labelOf(who),
    labelCls: SPEAKER_ACCENT[key] || 'ui-amber',
    bodyCls: SPEAKER_ACCENT[key] || 'ui-primary',
    cursorCls: SPEAKER_ACCENT[key] || 'ui-amber',
    activeAlpha: 1,
    groupable: true,
  };
}

export function transcriptSource(who) {
  const role = transcriptRole(who);

  if (role.side === 'right') return 'LOCAL';
  if (role.side === 'center') return 'SYSTEM';
  return 'RX';
}

function laneFor(role, width) {
  const w = Math.max(12, Math.floor(width));

  // Narrow layouts retain the spatial distinction through indentation without
  // sacrificing most of the line length.
  if (w < 52) {
    if (role.side === 'right') {
      return {
        x: 3,
        w: Math.max(10, w - 3),
        align: 'left',
      };
    }

    if (role.side === 'center') {
      return {
        x: 1,
        w: Math.max(10, w - 2),
        align: 'center',
      };
    }

    return {
      x: 0,
      w: Math.max(10, w - 3),
      align: 'left',
    };
  }

  if (role.side === 'right') {
    const laneW = Math.max(24, Math.floor(w * 0.56));

    return {
      x: w - laneW - 1,
      w: laneW,
      align: 'left',
    };
  }

  if (role.side === 'center') {
    const laneW = Math.max(24, Math.floor(w * 0.68));

    return {
      x: Math.floor((w - laneW) / 2),
      w: laneW,
      align: 'center',
    };
  }

  const laneW = Math.max(24, Math.floor(w * 0.62));

  return {
    x: 1,
    w: laneW,
    align: 'left',
  };
}

function normalizeEntry(entry, index, active = false, view = null) {
  const who = entry?.who || 'direction';

  return {
    id: entry?.serial ?? `${active ? 'active' : 'history'}:${index}`,
    who,
    role: transcriptRole(who),
    text: String(entry?.text ?? ''),
    active,
    typing: active && !!view?.typing,
  };
}

function mayGroup(a, b) {
  return !!a &&
    !!b &&
    a.role.groupable &&
    b.role.groupable &&
    a.role.key === b.role.key &&
    a.role.speaker === b.role.speaker;
}

export function transcriptBlocks(view, { keep = 12 } = {}) {
  const entries = [];
  const history = Array.isArray(view?.history)
    ? view.history.slice(-Math.max(0, keep))
    : [];

  history.forEach((entry, i) => {
    entries.push(normalizeEntry(entry, i, false, view));
  });

  // A branch is opened after the current line was committed to history.
  // Adding it again here would duplicate the last line above the choices.
  if (
    view?.line &&
    Number(view.typed) > 0 &&
    view?.pending?.kind !== 'branch'
  ) {
    entries.push(normalizeEntry({
      text: String(view.line?.text ?? view.line ?? '')
        .slice(0, Math.max(0, view.typed)),
      who: view.who,
      serial: view.lineSerial,
    }, entries.length, true, view));
  }

  const blocks = [];

  for (const entry of entries) {
    const prev = blocks[blocks.length - 1];

    if (mayGroup(prev, entry)) {
      prev.segments.push(entry);
      prev.active = prev.active || entry.active;
      continue;
    }

    blocks.push({
      id: entry.id,
      role: entry.role,
      speaker: entry.role.speaker,
      segments: [entry],
      active: entry.active,
    });
  }

  return blocks;
}

function centerText(text, width) {
  const s = String(text || '').slice(0, Math.max(0, width));

  return {
    text: s,
    offset: Math.max(0, Math.floor((width - s.length) / 2)),
  };
}

function preparedRows(block, lane) {
  const rows = [];
  const bodyInset = block.role.side === 'center' ? 0 : 2;
  const bodyW = Math.max(8, lane.w - bodyInset - 1);

  for (let s = 0; s < block.segments.length; s++) {
    const segment = block.segments[s];
    const raw = String(segment.text || '');

    if (block.role.kind === 'system') {
      const wrapped = uiWrap(raw.toUpperCase(), Math.max(6, lane.w - 4));

      wrapped.forEach((line, i) => {
        const decorated =
          `${i === 0 ? '[ ' : ''}` +
          `${line}` +
          `${i === wrapped.length - 1 ? ' ]' : ''}`;

        const centered = centerText(decorated, lane.w);

        rows.push({
          text: centered.text,
          x: centered.offset,
          active: segment.active,
          typing: segment.typing && i === wrapped.length - 1,
          segmentLast: i === wrapped.length - 1,
        });
      });

      continue;
    }

    if (block.role.kind === 'direction') {
      const wrapped = uiWrap(raw, Math.max(6, lane.w - 2));

      wrapped.forEach((line, i) => {
        const centered = centerText(line, lane.w);

        rows.push({
          text: centered.text,
          x: centered.offset,
          italic: true,
          active: segment.active,
          typing: false,
          segmentLast: i === wrapped.length - 1,
        });
      });

      continue;
    }

    const wrapped = uiWrap(raw, bodyW);

    wrapped.forEach((line, i) => {
      rows.push({
        text: line,
        x: bodyInset,
        active: segment.active,
        typing: segment.typing && i === wrapped.length - 1,
        segmentLast: i === wrapped.length - 1,
      });
    });
  }

  return rows;
}

function prepareBlock(block, width) {
  const lane = laneFor(block.role, width);
  const rows = preparedRows(block, lane);
  const labelRows = block.role.side === 'center' ? 0 : 1;

  return {
    ...block,
    lane,
    rows,
    labelRows,
    height: Math.max(1, labelRows + rows.length + 1),
  };
}

export function layoutTranscript(view, {
  width,
  maxRows,
  keep = 12,
} = {}) {
  const all = transcriptBlocks(view, { keep })
    .map((block) => prepareBlock(block, width));

  const limit = Math.max(1, Math.floor(maxRows || 1));
  const visible = [];
  let used = 0;

  // Fill upward from the current signal so active/recent material always wins.
  for (let i = all.length - 1; i >= 0; i--) {
    const block = all[i];

    if (visible.length && used + block.height > limit) break;

    if (!visible.length && block.height > limit) {
      const availableBody = Math.max(
        1,
        limit - block.labelRows - 1,
      );

      visible.unshift({
        ...block,
        rows: block.rows.slice(-availableBody),
        height:
          block.labelRows +
          Math.min(block.rows.length, availableBody) +
          1,
        clipped: true,
      });

      used = limit;
      break;
    }

    visible.unshift(block);
    used += block.height;
  }

  return {
    blocks: visible,
    height: Math.min(limit, used),
    hiddenBefore: Math.max(0, all.length - visible.length),
    lineAge: Math.max(0, Number(view?.lineAge) || 0),
  };
}

function spentAlpha(age) {
  if (age <= 0) return 0.72;
  if (age === 1) return 0.60;
  if (age === 2) return 0.49;
  if (age === 3) return 0.40;

  return clamp(
    0.34 - (age - 4) * 0.035,
    0.24,
    0.34,
  );
}

function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function drawAligned(
  x,
  y,
  width,
  text,
  align,
  cls,
  alpha,
) {
  const s = String(text || '').slice(0, Math.max(0, width));
  let dx = x;

  if (align === 'right') {
    dx = x + Math.max(0, width - s.length);
  } else if (align === 'center') {
    dx = x + Math.max(
      0,
      Math.floor((width - s.length) / 2),
    );
  }

  uiText(dx, y, s, cls, alpha);
  return dx;
}

function labelText(block, active, railOn) {
  const label = block.speaker || '';
  if (!label) return '';

  if (block.role.side === 'right') {
    const leftRail = active ? '─── ' : '';
    const rightRail = active && railOn ? ' ▐' : '';

    return `${leftRail}${label}${rightRail}`;
  }

  const leftRail = active && railOn ? '▌ ' : '';
  const rightRail = active ? ' ───' : '';

  return `${leftRail}${label}${rightRail}`;
}

export function drawTranscript(layout, {
  x,
  y,
  width,
  maxRows = Infinity,
} = {}) {
  const blocks = layout?.blocks || [];
  const activeEase = easeOutCubic(
    (layout?.lineAge || 0) / 0.24,
  );

  const acquireAlpha = 0.28 + activeEase * 0.72;

  const railOn =
    (layout?.lineAge || 0) >= 0.48 ||
    Math.floor((layout?.lineAge || 0) * 14) % 2 === 0;

  let cy = y;
  let used = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (used >= maxRows) break;

    const newer = blocks.length - 1 - i;
    const baseSpent = spentAlpha(newer);
    const topFade =
      i === 0 && layout.hiddenBefore > 0
        ? 0.74
        : 1;

    const laneX = x + block.lane.x;

    // Active incoming signals acquire from the left. Local speech acquires
    // from the right. The offset is deliberately tiny and non-springy.
    const enterOffset = block.active
      ? (1 - activeEase) *
        1.6 *
        (
          block.role.side === 'right'
            ? 1
            : block.role.side === 'left'
              ? -1
              : 0
        )
      : 0;

    const bx = laneX + enterOffset;

    if (block.labelRows) {
      const label = labelText(
        block,
        block.active,
        railOn,
      );

      const labelAlpha = block.active
        ? acquireAlpha * 0.92
        : baseSpent * 0.82 * topFade;

      drawAligned(
        bx,
        cy,
        block.lane.w,
        label,
        block.role.side === 'right'
          ? 'right'
          : 'left',
        block.active || newer <= 1
          ? block.role.labelCls
          : 'ui-secondary',
        labelAlpha,
      );

      cy++;
      used++;
    }

    for (
      let r = 0;
      r < block.rows.length && used < maxRows;
      r++
    ) {
      const row = block.rows[r];
      const activeRow = !!row.active;

      // The most recently cooled signal retains some of its original hue.
      // Older material settles into the common dim phosphor/silkscreen color.
      const cls =
        activeRow || newer <= 1
          ? block.role.bodyCls
          : 'ui-secondary';

      let alpha = activeRow
        ? block.role.activeAlpha * acquireAlpha
        : baseSpent * topFade;

      if (block.role.kind === 'direction') {
        alpha *= activeRow ? 0.86 : 0.78;
      }

      if (block.role.kind === 'system') {
        alpha *= activeRow ? 0.95 : 0.88;
      }

      const drawX = bx + row.x;

      const drawText = row.italic ? uiItalicText : uiText;
      drawText(
        drawX,
        cy,
        row.text.slice(
          0,
          Math.max(0, block.lane.w - row.x),
        ),
        cls,
        alpha,
      );

      if (row.typing) {
        const cursor =
          block.role.kind === 'direction' ||
          block.role.kind === 'system'
            ? '·'
            : '▌';

        uiText(
          drawX + row.text.length,
          cy,
          cursor,
          block.role.cursorCls,
          alpha,
        );
      }

      cy++;
      used++;
    }

    if (used < maxRows) {
      cy++;
      used++;
    }
  }

  return {
    rows: used,
    y: cy,
  };
}

function wrappedChoice(text, width, maxLines = 2) {
  const lines = uiWrap(text, Math.max(8, width));

  if (lines.length <= maxLines) return lines;

  const out = lines.slice(0, maxLines);
  const last = out[out.length - 1];

  out[out.length - 1] = last.length >= width
    ? `${last.slice(0, Math.max(1, width - 1))}…`
    : `${last}…`;

  return out;
}

export function layoutTranscriptChoices(view, width) {
  const options = view?.pending?.options || [];

  if (!options.length) {
    return {
      rows: [],
      height: 0,
      lane: laneFor(transcriptRole('me'), width),
    };
  }

  const role = transcriptRole('me');

  const lane = width < 52
    ? laneFor(role, width)
    : {
        x: Math.max(
          1,
          width - Math.floor(width * 0.80) - 1,
        ),
        w: Math.floor(width * 0.80),
        align: 'left',
      };

  const rows = [];

  const label = view.pending.kind === 'say'
    ? 'YOU / READY ▐'
    : 'YOU / SELECT ▐';

  rows.push({
    kind: 'label',
    text: label,
    selected: false,
  });

  options.forEach((choice, idx) => {
    const selected = idx === view.pending.index;
    const spent = !!view.spent?.(choice) || choice.replayState === 'seen-before-run';
    const signal = choice.archiveSignal ? '◆' : ' ';
    const prefix = `${selected ? '▸' : ' '} ${idx + 1}${signal} `;
    const continuation = ' '.repeat(prefix.length);

    const parts = wrappedChoice(
      `${String(choice.text || '')}`,
      Math.max(8, lane.w - prefix.length),
      2,
    );

    parts.forEach((part, lineIdx) => {
      rows.push({
        kind: 'choice',
        text:
          `${lineIdx === 0 ? prefix : continuation}` +
          `${part}`,
        selected,
        spent,
        archiveSignal: !!choice.archiveSignal,
      });
    });
  });

  return {
    rows,
    height: rows.length + 1,
    lane,
  };
}

export function drawTranscriptChoices(layout, {
  x,
  y,
  width,
  maxRows = Infinity,
} = {}) {
  if (!layout?.rows?.length) {
    return {
      rows: 0,
      y,
    };
  }

  const laneX = x + layout.lane.x;
  let cy = y;
  let used = 0;

  for (const row of layout.rows) {
    if (used >= maxRows) break;

    if (row.kind === 'label') {
      drawAligned(
        laneX,
        cy,
        layout.lane.w,
        row.text,
        'right',
        'ui-label',
        0.74,
      );
    } else {
      const cls = row.archiveSignal && !row.selected
        ? 'ui-blue'
        : row.spent
          ? 'ui-secondary'
        : row.selected
          ? 'ui-amber'
          : 'ui-primary';

      const alpha = row.archiveSignal && !row.selected
        ? 0.9
        : row.spent
          ? 0.48
        : row.selected
          ? 1
          : 0.82;

      uiText(
        laneX,
        cy,
        row.text.slice(0, layout.lane.w),
        cls,
        alpha,
      );
    }

    cy++;
    used++;
  }

  return {
    rows: used,
    y: cy,
  };
}

export function drawTranscriptHeader({
  x,
  y,
  width,
  slate = '',
  system = '',
} = {}) {
  let cy = y;
  let rows = 0;

  if (slate) {
    uiText(
      x,
      cy,
      String(slate).toUpperCase().slice(0, width),
      'ui-label',
      0.70,
    );

    cy++;
    rows++;
  }

  if (system) {
    if (rows) cy++;

    const raw = `[ ${String(system).toUpperCase()} ]`;

    const text = raw.length <= width
      ? raw
      : `[ ${String(system)
          .toUpperCase()
          .slice(0, Math.max(1, width - 5))}… ]`;

    drawAligned(
      x,
      cy,
      width,
      text,
      'center',
      'ui-amber',
      0.84,
    );

    cy++;
    rows += rows ? 2 : 1;
  }

  return {
    rows,
    y: cy,
  };
}
