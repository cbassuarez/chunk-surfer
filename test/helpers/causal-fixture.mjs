// Explicit supplied-state data for codec/storage/playback tests. This is never
// imported by production and is not an ordinary-play completion witness.
export function causalFixtureReturnEvent(runId, endingId, { endingVariant = null, at = 0 } = {}) {
  return { id: `fixture:return:${runId}`, at, order: 100000, actor: 'system', type: 'run.finished',
    payload: { summary: { id: `return:${runId}`, runId, endingId, endingVariant } } };
}

export function finalizeCausalFixture(recorder, options) {
  const event = causalFixtureReturnEvent(recorder.runId, options.endingId,
    { endingVariant: options.summary?.endingVariant ?? null, at: recorder.elapsedMs });
  recorder.recordEvent(event);
  return recorder.finalize(options);
}
