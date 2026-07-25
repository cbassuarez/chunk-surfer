export const COMBAT_DIALOGUE_DEFAULT_AUTO_HOLD = 1.15;
export const COMBAT_DIALOGUE_MIN_MANUAL_DWELL = 0.16;

export function shouldAutoAdvanceBattleLine(line) {
  return line?.auto === true
    || line?.battleAuto === true
    || line?.advance === 'auto';
}

export function battleLineAutoHoldSeconds(line) {
  const explicit = Number(line?.hold);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const text = String(line?.text ?? line ?? '');
  return Math.max(
    COMBAT_DIALOGUE_DEFAULT_AUTO_HOLD,
    Math.min(4.5, text.length / 28),
  );
}

export function hardWrapBattleText(text, width) {
  const safeW = Math.max(1, Math.floor(width || 1));
  const words = String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const lines = [];
  let line = '';

  for (const word of words) {
    const chunks = [];
    for (let i = 0; i < word.length; i += safeW) {
      chunks.push(word.slice(i, i + safeW));
    }

    for (const chunk of chunks) {
      const next = line ? `${line} ${chunk}` : chunk;
      if (next.length > safeW) {
        if (line) lines.push(line.slice(0, safeW));
        line = chunk;
      } else {
        line = next;
      }
    }
  }

  if (line) lines.push(line.slice(0, safeW));
  return lines;
}

export function battleDialoguePages(text, width, maxRows) {
  const rows = hardWrapBattleText(text, width);
  const pageSize = Math.max(1, Math.floor(maxRows || 1));
  const pages = [];

  for (let i = 0; i < rows.length; i += pageSize) {
    pages.push(rows.slice(i, i + pageSize));
  }

  return pages.length ? pages : [[]];
}

export function clampDialoguePage(page, pageCount) {
  const count = Math.max(1, Math.floor(pageCount || 1));
  return Math.max(0, Math.min(count - 1, Math.floor(Number(page) || 0)));
}

export function battleDialoguePageView({ text, typed, width, maxRows, page } = {}) {
  const shown = String(text ?? '').slice(0, Math.max(0, Math.floor(Number(typed) || 0)));
  const pages = battleDialoguePages(shown, width, maxRows);
  const pageIndex = clampDialoguePage(page, pages.length);

  return {
    rows: pages[pageIndex] || [],
    page: pageIndex,
    pageCount: pages.length,
    hasMore: pageIndex < pages.length - 1,
    hasPrev: pageIndex > 0,
  };
}
