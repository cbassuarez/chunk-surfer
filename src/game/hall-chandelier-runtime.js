import { createHallChandelierFlicker, hallChandelierBlockedReason } from './hall-chandelier-flicker.js';

const darkFrame = createHallChandelierFlicker().view();

// The host supplies current gameplay protections and the existing scare/save
// owners. No clocks, circuits, audio, STAB pool or implicit priority live here.
export function createHallChandelierRuntime({
  readContext = () => ({}),
  budgetReady = () => false,
  reserveBudget = () => false,
  persistConsumed = () => false,
} = {}) {
  let controller = null, runId = null, reviewConfig = null;
  const syncContext = () => {
    const context = readContext() || {};
    const currentRun = String(context.runId || 'legacy-run');
    if (!controller || currentRun !== runId) {
      runId = currentRun;
      controller = createHallChandelierFlicker({ seed: runId,
        consumedCount: context.consumedCount, config: reviewConfig || {} });
    }
    return context;
  };
  const view = () => controller?.view() || darkFrame;
  return {
    tick(dt) {
      const context = syncContext();
      const opportunity = controller.advance({ ...context, dt, budgetReady: budgetReady() === true });
      if (opportunity) controller.commit({ opportunity, reserveBudget, persistConsumed });
      return view();
    },
    guard() {
      const context = syncContext();
      // Render-time cancellation also runs while the ordinary world tick is
      // paused or blocked. A guard can never earn time, reserve or begin a beat.
      if (hallChandelierBlockedReason(context)) controller.advance({ ...context, dt: 0 });
      return view();
    },
    view,
    configureReview(config = null) {
      syncContext();
      const consumedCount = controller.snapshot().consumedCount;
      reviewConfig = config && typeof config === 'object' ? config : null;
      // DEV authoring changes the quiet duration, never the light's power or
      // saved consumption. The host must disclose staged timing in captures.
      controller = createHallChandelierFlicker({ seed: runId, consumedCount, config: reviewConfig || {} });
      return view();
    },
  };
}
