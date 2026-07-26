// The loading dock has two lives: an ordinary load-out room and one impossible
// return. This module keeps the eligibility, threshold bookkeeping, timeline,
// and presentation data pure so a debug warp or save restore can never be
// mistaken for a player crossing a door.

export const DOCK_PORTAL = Object.freeze({
  FOYER: 'dock-foyer-service',
  SERVICE: 'dock-inner-service',
});

export const DOCK_HAUNTING_VARIANT = Object.freeze({
  BEHIND_FRAME: 'behind-frame',
  CROSS_DOCK: 'cross-dock',
  EXIT_BLOCK: 'exit-block',
});

export const DOCK_HAUNTING_PHASE = Object.freeze({
  QUIET: 'quiet',
  ANSWERS: 'answers',
  REVEAL: 'reveal',
  FIGURE: 'figure',
  RUPTURE: 'rupture',
  BLACKOUT: 'blackout',
  COMPLETE: 'complete',
});

export const DOCK_ACOUSTIC_PROP_IDS = Object.freeze([
  'dock-road-case',
  'dock-cable-reel',
  'dock-shutter-bar',
]);

export const DOCK_HERO_PROP_IDS = Object.freeze([
  'dock-work-order-clipboard',
  'dock-desk-1',
  'dock-crew-board',
  'acq-maintenance-searchlight-dock',
  'dock-hand-truck',
  'dock-freight-crates',
  'dock-road-case',
  'dock-cable-reel',
  'dock-shutter-bar',
  'dock-chandelier-frame',
]);

export const DOCK_HAUNTING_SECONDS = 6.5;
export const DOCK_HAUNTING_GRACE_MS = 3000;

const RETURN_PORTALS = new Set(Object.values(DOCK_PORTAL));
const EFFECTS = new Set(['full', 'reduced', 'off']);

export function isDockReturnPortal(id) {
  return RETURN_PORTALS.has(String(id || ''));
}

export function normalizeDockEffects(value) {
  const id = String(value || 'full').toLowerCase();
  return EFFECTS.has(id) ? id : 'full';
}

export function dockVariantFor({ drankCoffee = false, entryPortal = null } = {}) {
  if (drankCoffee) return DOCK_HAUNTING_VARIANT.EXIT_BLOCK;
  if (entryPortal === DOCK_PORTAL.FOYER) return DOCK_HAUNTING_VARIANT.CROSS_DOCK;
  return DOCK_HAUNTING_VARIANT.BEHIND_FRAME;
}

// The setup gate always blocks an early exit, but its explanatory line belongs
// only to a deliberate forward press through a real leaf. A sideways brush
// against the zone boundary is silent.
export function dockExitAttemptShouldSpeak({ forwardIntent = 0, hasDoor = false } = {}) {
  return !!hasDoor && Number(forwardIntent) > .72;
}

// Only a normal player step may become an entry. Loading, restoring, warping,
// and scripted repositioning are deliberately ineligible even if they land on
// the same cells.
export function deriveDockHauntingEligibility({
  departed = false,
  spent = false,
  drankCoffee = false,
  completedTakes = 0,
  transitionKind = 'step',
  entryPortal = null,
} = {}) {
  if (spent) return { eligible: false, reason: 'spent', variant: null };
  if (!departed) return { eligible: false, reason: 'not-departed', variant: null };
  if (transitionKind !== 'step') return { eligible: false, reason: 'not-a-step', variant: null };
  if (!isDockReturnPortal(entryPortal)) return { eligible: false, reason: 'unknown-portal', variant: null };
  if (drankCoffee && Number(completedTakes) < 1) return { eligible: false, reason: 'coffee-awaits-take', variant: null };
  return {
    eligible: true,
    reason: 'eligible',
    variant: dockVariantFor({ drankCoffee, entryPortal }),
  };
}

export function freshDockTransitState({ inside = true } = {}) {
  return { inside: !!inside, crossingPortal: null };
}

// Door portals occupy several runtime cells and the gap immediately outside
// the dock is ZONE.none. Remember the leaf crossed, then resolve the transition
// only after the body clears it. Turning around before reaching the leaf is not
// leaving the loading dock.
export function reduceDockTransit(value, event = {}) {
  const state = {
    inside: value?.inside !== false,
    crossingPortal: isDockReturnPortal(value?.crossingPortal) ? value.crossingPortal : null,
  };
  if (event.kind !== 'step') return { ...state, departedNow: false, enteredNow: false, entryPortal: null };
  const fromPortal = isDockReturnPortal(event.fromPortal) ? event.fromPortal : null;
  const toPortal = isDockReturnPortal(event.toPortal) ? event.toPortal : null;
  const crossingPortal = toPortal || fromPortal || state.crossingPortal;
  let inside = state.inside;
  let departedNow = false;
  let enteredNow = false;
  let entryPortal = null;

  if (inside && fromPortal && !toPortal && !event.toDock) {
    inside = false;
    departedNow = true;
  } else if (!inside && !event.fromDock && event.toDock) {
    inside = true;
    enteredNow = true;
    entryPortal = crossingPortal;
  }

  return {
    inside,
    crossingPortal: inside ? null : crossingPortal,
    departedNow,
    enteredNow,
    entryPortal,
  };
}

export function dockHauntingPhaseAt(seconds) {
  const t = Math.max(0, Number(seconds) || 0);
  if (t >= DOCK_HAUNTING_SECONDS) return DOCK_HAUNTING_PHASE.COMPLETE;
  if (t >= 5.5) return DOCK_HAUNTING_PHASE.BLACKOUT;
  if (t >= 4.2) return DOCK_HAUNTING_PHASE.RUPTURE;
  if (t >= 2.6) return DOCK_HAUNTING_PHASE.FIGURE;
  if (t >= 1.35) return DOCK_HAUNTING_PHASE.REVEAL;
  if (t >= .35) return DOCK_HAUNTING_PHASE.ANSWERS;
  return DOCK_HAUNTING_PHASE.QUIET;
}

export function dockHauntingEvents({ auditioned = [], effects = 'full' } = {}) {
  const heard = DOCK_ACOUSTIC_PROP_IDS.filter((id) => new Set(auditioned || []).has(id));
  const events = [];
  if (heard.length) {
    const span = heard.length === 1 ? 0 : 1.4 / (heard.length - 1);
    heard.forEach((propId, index) => events.push({ at: .35 + span * index, type: 'answer', propId, index }));
  } else events.push({ at: .7, type: 'frame-creak' });
  events.push(
    { at: 1.35, type: 'glow' },
    { at: 1.55, type: 'reflection' },
    { at: 2.6, type: 'literal' },
  );
  if (normalizeDockEffects(effects) === 'full') {
    events.push(
      { at: 4.2, type: 'rupture', group: 1 },
      { at: 4.7, type: 'rupture', group: 2 },
      { at: 5.15, type: 'rupture', group: 3 },
    );
  } else events.push({ at: 4.55, type: 'rupture', group: 'all' });
  events.push({ at: 5.5, type: 'blackout' }, { at: DOCK_HAUNTING_SECONDS, type: 'complete' });
  return events.sort((a, b) => a.at - b.at);
}

export function dockHauntingSnapshot({ seconds = 0, variant = DOCK_HAUNTING_VARIANT.BEHIND_FRAME, entryPortal = null, coffee = false, effects = 'full' } = {}) {
  const t = Math.max(0, Math.min(DOCK_HAUNTING_SECONDS, Number(seconds) || 0));
  const phase = dockHauntingPhaseAt(t);
  const reveal = t >= 1.35 && t < 5.5;
  const rupture = t >= 4.2;
  return {
    seconds: t,
    progress: t / DOCK_HAUNTING_SECONDS,
    phase,
    variant,
    entryPortal,
    coffee: !!coffee,
    effects: normalizeDockEffects(effects),
    glow: reveal,
    glowMix: reveal ? Math.max(0, Math.min(1, (t - 1.35) / .7)) : 0,
    reflection: t >= 1.55 && t < 2.75,
    literal: t >= 2.6 && t < 5.5,
    rupture,
    blackout: t >= 5.5,
    complete: t >= DOCK_HAUNTING_SECONDS,
  };
}

export function makeLoadingDockHauntingScene({
  variant = DOCK_HAUNTING_VARIANT.BEHIND_FRAME,
  entryPortal = null,
  coffee = false,
  effects = 'full',
  auditioned = [],
  onEvent = null,
  onUpdate = null,
  onRender = null,
  onComplete = null,
  onExit = null,
} = {}) {
  let seconds = 0;
  let eventIndex = 0;
  let completed = false;
  let exited = false;
  const events = dockHauntingEvents({ auditioned, effects });
  const snapshot = () => dockHauntingSnapshot({ seconds, variant, entryPortal, coffee, effects });
  const scene = {
    id: 'loading-dock-haunting',
    blocksInput: true,
    blocksWorld: true,
    allowsLook: true,
    lookProfile: coffee ? 'hush' : 'rupture',
    update(dt) {
      if (completed) return;
      seconds = Math.min(DOCK_HAUNTING_SECONDS, seconds + Math.max(0, Number(dt) || 0));
      while (eventIndex < events.length && events[eventIndex].at <= seconds) {
        onEvent?.(events[eventIndex], snapshot());
        eventIndex += 1;
      }
      const frame = snapshot();
      onUpdate?.(frame);
      if (frame.complete) {
        completed = true;
        onComplete?.(scene, frame);
      }
    },
    render() { onRender?.(snapshot()); },
    key() { return true; },
    pointer() { return true; },
    exit() {
      if (exited) return;
      exited = true;
      onExit?.(snapshot());
    },
    view() { return { ...snapshot(), pendingEvents: events.slice(eventIndex) }; },
  };
  return scene;
}

export function dockHauntingLights(snapshot = null) {
  if (!snapshot?.glow || snapshot.blackout) return [];
  const mix = Math.max(.05, Number(snapshot.glowMix) || 0);
  const steady = snapshot.effects === 'off' ? .78 : 1;
  const intensity = mix * steady;
  const color = [1, .46, .17];
  return [
    { id: 'dock-chandelier-west', x: 68.45, z: 6.0, y: 2.15, color, intensity: 1.05 * intensity, radius: 5.2 },
    { id: 'dock-chandelier-centre', x: 69.0, z: 6.0, y: 2.25, color, intensity: 1.32 * intensity, radius: 5.8 },
    { id: 'dock-chandelier-east', x: 69.55, z: 6.0, y: 2.15, color, intensity: 1.05 * intensity, radius: 5.2 },
    { id: 'dock-chandelier-fill', x: 67.8, z: 8.2, y: 1.7, color: [1, .31, .12], intensity: .38 * intensity, radius: 7.2 },
    { id: 'dock-surfer-rim', x: 70.2, z: 6.8, y: 1.35, color: [.68, .12, .08], intensity: .24 * intensity, radius: 3.4 },
  ];
}

function literalPose(snapshot) {
  const p = Math.max(0, Math.min(1, (snapshot.seconds - 2.6) / 1.6));
  if (snapshot.variant === DOCK_HAUNTING_VARIANT.CROSS_DOCK) {
    return { x: 59.2 + p * 13.1, z: 9.15, yaw: Math.PI / 2 };
  }
  if (snapshot.variant === DOCK_HAUNTING_VARIANT.EXIT_BLOCK) {
    return snapshot.entryPortal === DOCK_PORTAL.FOYER
      ? { x: 72.45, z: 13.15, yaw: -Math.PI / 2 }
      : { x: 65.5, z: 14.1, yaw: 0 };
  }
  return { x: 69.85, z: 6.65, yaw: Math.PI };
}

export function dockHauntingDynamicInstances(snapshot = null) {
  if (!snapshot || snapshot.blackout) return [];
  const out = [];
  if (snapshot.reflection) {
    out.push({
      id: 'dock-surfer-reflection', mesh: 'stair_shadow_figure',
      x: 68.72, y: .72, z: 5.82, yaw: Math.PI,
      scale: .72, scaleX: -.48, scaleY: .86, scaleZ: .42, zone: 1,
    });
  }
  if (snapshot.literal) {
    const pose = literalPose(snapshot);
    out.push({
      id: 'dock-surfer-literal', mesh: 'stair_shadow_figure',
      ...pose, y: 0, scale: 1.08,
      scaleX: snapshot.coffee ? .72 : .9,
      scaleY: snapshot.coffee ? 1.22 : 1.05,
      scaleZ: .72, zone: 1,
    });
  }
  return out;
}

export function dockEndingBeat({ spent = false, variant = null, supernatural = false, drankCoffee = false } = {}) {
  if (!spent) return [];
  const figure = variant === DOCK_HAUNTING_VARIANT.CROSS_DOCK
    ? 'the figure that crossed the loading dock'
    : variant === DOCK_HAUNTING_VARIANT.EXIT_BLOCK
      ? 'the figure that waited in the loading-dock doorway'
      : 'the figure that stood behind the chandelier frame';
  if (supernatural && !drankCoffee) {
    return [{ who: 'you', text: `The dock. ${figure}. It was not trying to catch me. It was showing me it already knew where I would come back.` }];
  }
  return [{ who: 'you', text: `The dock. ${figure}. Then the broken bulbs. Or the bulbs first. I can hold every part of it except the order.` }];
}
