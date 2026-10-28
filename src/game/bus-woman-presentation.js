// Presentation changes the existing woman; it never chooses a place to put her.
import { busWomanDescriptor, busWomanTicketVisible, BUS_WOMAN_READY_SECONDS, BUS_WOMAN_STEP_SECONDS } from '../render/bus-woman-performance.js';
import { busWomanWrongOriginReturn } from '../data/bus-woman-wrong-origin.js';
import { busWomanWrongOriginDescriptor, busWomanWrongOriginFrame } from '../render/bus-woman-wrong-origin-performance.js';
import { busWomanPassageDescriptor } from '../render/bus-woman-passage-performance.js';

export function busWomanPerformance({ clock = 0, woman = {}, id = '', aboard = false, closeEncounter = false, passage = null, reducedMotion = false, stretch, repeat } = {}) {
  const now = Math.max(0, Number(clock) || 0);
  const sinceReceipt = woman.receivedAt == null ? null : Math.max(0, now - woman.receivedAt);
  const receipt = woman.receiveId === id ? sinceReceipt : null;
  const paperReady = woman.ticketReturned && (sinceReceipt == null || sinceReceipt >= 11);
  const receiptPending = woman.ticketReturned && sinceReceipt != null && sinceReceipt < 11;
  const supportStepSeconds = closeEncounter && woman.stepAt != null && now - woman.stepAt < BUS_WOMAN_STEP_SECONDS
    ? Math.max(0, now - woman.stepAt) : null;
  // An old acknowledgment must not interrupt storage/retrieval or reappear
  // afterwards as a fully turned body with paper suddenly in its hand. A new
  // look begun after the ticket is ready remains available at the bus gap.
  const acknowledgeAvailable = closeEncounter && woman.acknowledgedAt != null
    && (!woman.ticketReturned || sinceReceipt == null || woman.acknowledgedAt >= woman.receivedAt + 11);
  let receiveFrom;
  if (closeEncounter && receipt != null && receipt < .43 - 1e-9) {
    const previousStep = woman.stepAt == null ? null : woman.receivedAt - woman.stepAt;
    if (previousStep != null && previousStep >= 0 && previousStep < BUS_WOMAN_STEP_SECONDS) {
      receiveFrom = { mode: 'step', seconds: previousStep };
    } else if (woman.acknowledgedAt != null && woman.acknowledgedAt <= woman.receivedAt) {
      receiveFrom = { mode: 'acknowledge', seconds: Math.min(2.4, woman.receivedAt - woman.acknowledgedAt) };
    }
  }
  let mode, seconds;
  if (receipt != null && receipt < 4) { mode = 'receive'; seconds = receipt; }
  else if (receiptPending) {
    mode = sinceReceipt >= 9 ? 'ready' : 'wait'; seconds = sinceReceipt >= 9 ? sinceReceipt - 9 : 4;
  } else if (passage) {
    // The bus's quiet body makes its sustained attention legible. It does not
    // repeat the ordinary courtesy turn or steal the hand's receipt sequence.
    mode=paperReady?'ticket-wait':'wait';seconds=4;
  } else if (supportStepSeconds != null) {
    mode = paperReady ? 'step-ticket' : 'step'; seconds = Math.max(0, now - woman.stepAt);
  } else if (acknowledgeAvailable) {
    mode = paperReady ? 'acknowledge-ticket' : 'acknowledge';
    seconds = Math.min(2.4, Math.max(0, now - woman.acknowledgedAt));
  } else if (paperReady) {
    mode = 'ticket-wait'; seconds = 4;
  } else if (aboard || (woman.ticketReturned && sinceReceipt != null) || (receipt != null && receipt < 12)) { mode = 'wait'; seconds = Math.min(4, now % 24); }
  else { mode = 'search'; seconds = Math.min(6, now % 24); }
  if (reducedMotion) seconds = mode === 'receive' ? 4 : mode === 'ready' ? BUS_WOMAN_READY_SECONDS : mode.startsWith('acknowledge') ? 2.4 : mode.startsWith('step') ? BUS_WOMAN_STEP_SECONDS : 0;
  return { mode, seconds, acknowledgeYaw: woman.acknowledgeYaw,
    ...(passage?{passage:{...passage,clock:now}}:{}),
    ...(stretch != null || repeat != null ? { stretch: stretch ?? repeat } : {}),
    ...(supportStepSeconds != null ? { supportStepSeconds: reducedMotion ? BUS_WOMAN_STEP_SECONDS : supportStepSeconds } : {}),
    ...(receiveFrom ? { receiveFrom } : {}),
    ...(aboard ? { aboard: true } : {}),
    ...(reducedMotion ? { reducedMotion: true } : {}) };
}

export function busWomanInstances(instance, performance = {}) {
  if (!['exterior_bus_woman', 'outskirts_bus_woman'].includes(instance?.mesh)) return [instance];
  const { mode = 'wait', seconds = 0, acknowledgeYaw, reducedMotion = false, supportStepSeconds, receiveFrom, aboard = false, passage } = performance;
  const outskirts = instance.mesh === 'outskirts_bus_woman';
  const stretch = performance.stretch ?? performance.repeat ?? instance.stretch ?? instance.repeat
    ?? /^r(\d+)-/.exec(instance.id ?? '')?.[1] ?? 0;
  const remembered = busWomanWrongOriginReturn(stretch);
  const options = { stretch, acknowledgeYaw, reducedMotion, supportStepSeconds, receiveFrom, aboard, passage };
  const character = outskirts ? (passage&&Number(stretch)===7?busWomanPassageDescriptor(mode,seconds,options):busWomanWrongOriginDescriptor(mode, seconds, options))
    : busWomanDescriptor(mode, seconds, { acknowledgeYaw });
  const body = { ...instance, structural: false, character,
    ...(outskirts ? { mesh: remembered.mesh,
      ...(remembered.stage > 0 ? { fallbackMesh: 'outskirts_bus_woman' } : {}),
      wrongOrigin: { stretch: remembered.stretch, stage: remembered.stage } } : {}) };
  const copy = (suffix, mesh) => ({ ...body, id: `${instance.id}:${suffix}`, mesh, fallbackMesh: undefined });
  const parts = [body, copy('bag', 'bus_woman_bag')];
  const clipTime = outskirts ? busWomanWrongOriginFrame(mode, seconds, options).time : seconds;
  if (busWomanTicketVisible(mode, clipTime)) parts.push(copy('return-half', 'bus_woman_ticket'));
  return parts;
}
