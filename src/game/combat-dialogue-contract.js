import {
  shouldAutoAdvanceBattleLine,
  battleLineAutoHoldSeconds,
  hardWrapBattleText,
  battleDialoguePages,
  battleDialoguePageView,
} from './combat-dialogue-model.js';

function assertPlayerPacedByDefault() {
  if (shouldAutoAdvanceBattleLine({ text: 'hello' })) {
    throw new Error('battle dialogue should not auto-advance by default');
  }
}

function assertExplicitAutoAdvanceOnly() {
  if (!shouldAutoAdvanceBattleLine({ text: 'hello', auto: true })) {
    throw new Error('auto:true battle line did not auto-advance');
  }
  if (!shouldAutoAdvanceBattleLine({ text: 'hello', battleAuto: true })) {
    throw new Error('battleAuto:true battle line did not auto-advance');
  }
  if (!shouldAutoAdvanceBattleLine({ text: 'hello', advance: 'auto' })) {
    throw new Error('advance:auto battle line did not auto-advance');
  }
}

function assertHoldScalesForLongAutoText() {
  const shortHold = battleLineAutoHoldSeconds({ text: 'short', auto: true });
  const longHold = battleLineAutoHoldSeconds({
    text: 'This is a deliberately long battle line that needs more reading time before the combat scene advances by itself.',
    auto: true,
  });

  if (longHold < shortHold) {
    throw new Error('long auto line received shorter hold than short line');
  }
}

function assertExplicitHoldWins() {
  const hold = battleLineAutoHoldSeconds({ text: 'long enough not to matter', hold: 0.25, auto: true });
  if (hold !== 0.25) throw new Error('explicit battle dialogue hold was not preserved');
}

function assertHardWrapDoesNotExceedWidth() {
  const rows = hardWrapBattleText('SUPERCALIFRAGILISTICEXPIALIDOCIOUS', 8);
  if (!rows.length || rows.some((row) => row.length > 8)) {
    throw new Error('hard wrap emitted over-width row');
  }
}

function assertPaginationPreservesRows() {
  const text = 'one two three four five six seven eight nine ten';
  const rows = hardWrapBattleText(text, 8);
  const pages = battleDialoguePages(text, 8, 2);
  const flattened = pages.flat();

  if (flattened.join('|') !== rows.join('|')) {
    throw new Error('dialogue pagination lost or reordered rows');
  }
}

function assertPageViewReportsMore() {
  const view = battleDialoguePageView({
    text: 'one two three four five six seven eight nine ten',
    typed: 999,
    width: 8,
    maxRows: 2,
    page: 0,
  });

  if (!view.hasMore || view.pageCount < 2) {
    throw new Error('long dialogue page did not report continuation');
  }
}

function assertPageViewClampsPage() {
  const view = battleDialoguePageView({
    text: 'one two three four five six seven eight nine ten',
    typed: 999,
    width: 8,
    maxRows: 2,
    page: 99,
  });

  if (view.page !== view.pageCount - 1) {
    throw new Error('dialogue page view did not clamp high page index');
  }
}

export function assertCombatDialogueContracts() {
  assertPlayerPacedByDefault();
  assertExplicitAutoAdvanceOnly();
  assertHoldScalesForLongAutoText();
  assertExplicitHoldWins();
  assertHardWrapDoesNotExceedWidth();
  assertPaginationPreservesRows();
  assertPageViewReportsMore();
  assertPageViewClampsPage();
  return true;
}
