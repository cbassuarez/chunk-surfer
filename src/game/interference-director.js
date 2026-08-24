import { createEphemeralIdentityCache, normalizePersonalInterferenceSettings } from './personalized-interference.js';
import {
  appendInterferenceRevision,
  createInterferenceRecord,
  finalizeInterferenceRecord,
  maskIdentitySnapshot,
  normalizeInterferenceRecord,
} from './interference-case.js';
import { loadOrCreateInterferenceKey, writeInterferenceArtifact } from '../platform/interference-artifacts.js';
import {
  freshPsychProfileState,
  normalizePsychProfileSettings,
  profileInfluence,
} from './psychological-profile.js';
import {
  advanceWindowChannelScene,
  availableWindowReturnTier,
  canonicalWindowChannelBattleId,
  chargeWindowReturn,
  compileWindowChannelScene,
  freshWindowChannelProgress,
  movementWindowTableau,
  spendWindowReturn,
} from './window-channel.js';

const STAGE = Object.freeze({
  'practice-room-hush': 'foreshadow',
  'recording-2': 'recognition',
  'pre-recording-4': 'control',
  natatorium: 'recognition',
  hall: 'control',
  practice: 'control',
  chapel: 'handoff',
  'source-final': 'handoff',
});

const WINDOW_KIND = Object.freeze({
  broadcast: 'broadcast',
  conceal: 'conceal',
  overload: 'overload',
  loop: 'loop',
  silence: 'silence',
});

const annotationFor = (stage, result) => {
  if (stage === 'foreshadow') return 'AUDIOCORP: UNREGISTERED RETURN DETECTED. NO OPERATOR RESOLUTION ATTEMPTED.';
  if (stage === 'recognition') return result === 'win'
    ? 'AUDIOCORP: OPERATOR PATH RESOLVED DURING HOSTILE SIGNAL CONTACT.'
    : 'AUDIOCORP: OPERATOR PATH REMAINS OPEN AFTER CONTACT.';
  if (stage === 'control') return 'AUDIOCORP: LOCAL HOST AND SELECTED INPUT ENTERED THE RETURN PATH.';
  return 'UNATTRIBUTED REVISION: THIS WAS YOUR REPORT UNTIL THE RETURN PATH OPENED.';
};

function deterministicVariant(values, count = 3) {
  let hash = 0x811c9dc5;
  for (const ch of (Array.isArray(values) ? values : []).map(String).sort().join('|')) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  return hash % Math.max(1, count);
}

export function interferenceStageForBattle(encounterId, battleId = '') {
  return STAGE[encounterId] || STAGE[battleId] || null;
}

export function createBattleInterferenceDirector({
  identityCache = createEphemeralIdentityCache(),
  loadKey = loadOrCreateInterferenceKey,
  maskSnapshot = maskIdentitySnapshot,
  effects = null,
  writeArtifact = writeInterferenceArtifact,
  getSettings = () => ({}),
  getProfile = null,
  getProfileState = () => freshPsychProfileState(),
  getContext = () => ({}),
  getRecord = () => null,
  onRecord = () => {},
  onEmergency = () => {},
  onObservation = () => {},
} = {}) {
  // Pull persisted state lazily. The director is constructed before the save
  // service has necessarily finished loading on desktop boot.
  let record = null;
  let identity = null;
  let liveLine = null;
  let disabledForSession = false;
  const sessions = new Map();

  const settings = () => normalizePersonalInterferenceSettings(getSettings());
  const profile = () => {
    if (typeof getProfile === 'function') return normalizePsychProfileSettings(getProfile());
    const legacy = settings();
    return normalizePsychProfileSettings({
      schema: 1,
      consentVersion: legacy.enabled ? 'legacy-test' : '',
      windowIntensity: legacy.intensity,
      modules: {
        microphone: false,
        steamName: legacy.enabled && legacy.sourceSteam,
        osUsername: legacy.enabled && legacy.sourceOs,
        computerName: legacy.enabled && legacy.sourceHost,
        microphoneLabel: legacy.enabled && legacy.sourceMic,
        behavioralMeasurement: false,
        adaptiveDifficulty: false,
        windowChoreography: legacy.enabled,
        fieldReturnFiles: legacy.enabled,
      },
    });
  };
  const enabled = () => settings().enabled && !disabledForSession;
  const windowEnabled = () => enabled() && profile().modules.windowChoreography;
  const fileEnabled = () => enabled() && profile().modules.fieldReturnFiles;
  const safeWrite = (value) => fileEnabled()
    ? Promise.resolve(writeArtifact?.(value)).catch(() => null)
    : Promise.resolve({ ok: false, disabled: true });

  async function ensureRecord(context = {}) {
    if (!record?.caseId) record = normalizeInterferenceRecord(getRecord());
    if (record?.caseId) return record;
    identity = await identityCache.request(settings(), {
      micLabel: context.micLabel,
      micPermission: !!context.micPermission,
    });
    // Identity-only personalization never touches disk. The durable masking key
    // exists solely as part of the separately consented field-return module.
    const key = await loadKey({ persist: fileEnabled() });
    const masked = await maskSnapshot(identity || {}, key);
    record = createInterferenceRecord(masked);
    onRecord(record);
    return record;
  }

  function sidecarPayload(session, state = 'MONITOR RETURN') {
    const tableau = movementWindowTableau({
      battleId: session?.battleId,
      movementId: session?.movement?.id,
    });
    return {
      state,
      battleId: tableau?.battleId || session?.channelBattle || '',
      movementId: tableau?.movementId || session?.movement?.id || '',
      title: tableau?.title || 'AUDIOCORP / WINDOW CHANNEL',
      caption: tableau?.caption || (session?.stage === 'handoff'
        ? 'THE HANDOFF CONTINUES OUTSIDE THE FRAME.'
        : 'THE RETURN PATH HAS FOUND ANOTHER SURFACE.'),
      palette: tableau?.palette || null,
      motifs: tableau?.motifs || null,
      tableau,
    };
  }

  function lineFor(stage, variant = 0) {
    if (stage === 'foreshadow') return 'UNREGISTERED MONITOR RETURN / OPERATOR RESOLUTION WITHHELD';
    if (stage === 'recognition') {
      // THIS IS THE LINE WHERE IT SAYS YOUR REAL NAME.
      //
      // It used to read "LOCAL OPERATOR PATH RESOLVED: <you>", which is a log
      // entry — and a log entry is the one thing this beat must not be. The
      // machine has just found the person on the other side of the glass, and
      // what it does with that is not file it. It says the name, and then it
      // cannot stop saying the name.
      //
      // The stutter is the read head sticking on the syllable it likes: I, eye,
      // I. Kept uppercase because the VFD has no lower case, and kept to three
      // variants so a second encounter is not the same sentence.
      const display = settings().vfdText !== false
        ? identity?.persona?.value || 'UNRESOLVED'
        : record?.tokens?.persona?.token || 'OPERATOR MASKED';
      return [
        `IIIII I I SEE YOU ${display} I EYE EYEYEY I CAN SEEEE YOU ${display}`,
        `${display}. ${display}. THERE YOU ARE. I I I HAVE BEEN LOOKING RIGHT AT YOU ${display}`,
        `EYE EYE I KNOW WHICH ONE OF YOU IS ${display} I SEEEE YOU I SEE YOU I SEE`,
      ][variant % 3];
    }
    if (stage === 'control') {
      const showExact = settings().vfdText !== false;
      const host = showExact ? identity?.hostname?.value || 'UNRESOLVED' : record?.tokens?.hostname?.token || 'HOST MASKED';
      const input = showExact ? identity?.mic?.value || 'UNRESOLVED' : record?.tokens?.mic?.token || 'INPUT MASKED';
      return [
        `HOST ${host} / INPUT ${input}`,
        `LOCAL SIGNAL PATH: ${host} / ${input}`,
        `MONITOR RETURN ATTACHED TO ${host} / ${input}`,
      ][variant % 3];
    }
    return [
      `AUDIOCORP CASE ${record?.caseId || 'UNFILED'} / HUSH HAS THE RETURN PATH`,
      `${record?.caseId || 'UNFILED'} / AUDIOCORP FILE ORDER CONTESTED`,
      `HUSH REVISION ACCEPTED INTO ${record?.caseId || 'UNFILED'}`,
    ][variant % 3];
  }

  async function enter(session) {
    if (!enabled() || !session.stage) return false;
    const context = getContext(session.encounterId, session.battleId) || {};
    session.variant = deterministicVariant([
      session.encounterId,
      session.battleId,
      context.roomId || '',
      ...(context.choiceIds || []),
      ...(context.variantIds || []),
    ]);
    if (session.stage !== 'foreshadow') await ensureRecord(context);
    const st = settings();
    const run = context.run || {};
    session.profileInfluence = profileInfluence(getProfileState(), {
      enabled: profile().modules.behavioralMeasurement,
      adaptiveDifficulty: profile().modules.adaptiveDifficulty,
      preset: run.preset || context.preset || 'contract',
      custom: !!(run.custom ?? context.custom),
    });
    if (windowEnabled()) {
      session.effectToken = await effects?.begin?.({
        stage: session.stage,
        encounterId: session.encounterId,
        intensity: st.intensity,
        reducedMotion: context.reducedMotion,
        fullscreen: !!context.fullscreen,
        profile: session.profileInfluence,
      });
    }
    return true;
  }

  async function movementChanged(session, event = {}) {
    session.movement = {
      id: String(event.id || ''),
      index: Math.max(0, Math.floor(Number(event.index) || 0)),
      title: String(event.title || '').slice(0, 64),
    };
    const tableau = movementWindowTableau({ battleId: session.battleId, movementId: session.movement.id });
    if (!tableau || !windowEnabled()) return tableau;
    const context = getContext(session.encounterId, session.battleId) || {};
    await effects?.arrangeMovement?.(tableau, {
      token: session.effectToken,
      forceInternal: context.inputDevice === 'controller',
    });
    return tableau;
  }

  async function beginChannelAttack(session, event = {}) {
    if (!windowEnabled() || !session.channelBattle || !effects?.beginWindowChannel) return { outcome: 'skip' };
    const movementIndex = Math.max(0, Math.floor(Number(event.movementIndex) || 0));
    if (session.channelMovements.has(movementIndex)) return { outcome: 'skip', duplicate: true };
    const scene = compileWindowChannelScene({
      battleId: session.battleId,
      movementId: event.movementId,
      movementIndex,
      movementTitle: event.movementTitle,
      intentId: event.intentId,
      intentLabel: event.intentLabel,
      intentKind: event.intentKind,
      windowScale: event.windowScale,
    });
    if (!scene) return { outcome: 'skip' };
    session.channelMovements.add(movementIndex);
    session.activeChannelScene = scene;
    session.windowEvents.push(`channel:${scene.movementId}:${scene.intentId}`);
    const context = getContext(session.encounterId, session.battleId) || {};
    const result = await effects.beginWindowChannel(scene, {
      token: session.effectToken,
      forceInternal: context.inputDevice === 'controller',
    });
    const eventScene = advanceWindowChannelScene(scene, {
      phase: result?.outcome === 'cut' ? 'cut' : result?.outcome === 'timeout' ? 'damage' : 'impact',
      outcome: result?.outcome || 'skip',
      damage: 0,
    }) || scene;
    session.activeChannelScene = eventScene;
    session.activeChannelResult = result;
    await effects?.noteWindowChannelEvent?.(eventScene, { token: session.effectToken });
    if (result?.outcome === 'timeout') {
      session.missedResponses += 1;
      session.windowEvents.push(`channel-timeout:${scene.movementId}`);
    } else if (result?.outcome === 'cut') {
      session.windowEvents.push(`channel-cut:${scene.movementId}`);
    }
    return { ...result, scene: eventScene, deadlineMs: scene.deadlineMs };
  }

  async function completeChannelDefense(session, { allowReturn = true } = {}) {
    const scene = session.activeChannelScene;
    if (!scene || session.activeChannelResult?.outcome !== 'cut') return { defended: false, charge: session.windowProgress.charge };
    session.windowProgress = chargeWindowReturn(session.windowProgress, { defended: true });
    const tier = availableWindowReturnTier(session.windowProgress);
    if (!tier || !allowReturn || !windowEnabled() || !effects?.offerWindowReturn) {
      return { defended: true, charge: session.windowProgress.charge, tier: 0, returned: false, hits: 0 };
    }
    const context = getContext(session.encounterId, session.battleId) || {};
    const choice = await effects.offerWindowReturn(scene, {
      token: session.effectToken,
      tier,
      forceInternal: context.inputDevice === 'controller',
    });
    if (choice?.outcome !== 'return') {
      session.activeChannelScene = advanceWindowChannelScene(scene, {
        phase: 'return', outcome: 'held', returnTier: tier,
      }) || scene;
      await effects?.noteWindowChannelEvent?.(session.activeChannelScene, { token: session.effectToken });
      session.windowEvents.push(`return-held:${tier}`);
      return { defended: true, charge: session.windowProgress.charge, tier, returned: false, hits: 0 };
    }
    const spent = spendWindowReturn(session.windowProgress);
    session.windowProgress = spent.state;
    session.activeChannelScene = advanceWindowChannelScene(scene, {
      phase: 'return', outcome: 'return', returnTier: spent.tier, returnHits: spent.hits,
    }) || scene;
    await effects?.noteWindowChannelEvent?.(session.activeChannelScene, { token: session.effectToken });
    session.windowEvents.push(`return-fired:${spent.tier}`);
    return {
      defended: true,
      charge: session.windowProgress.charge,
      tier: spent.tier,
      returned: true,
      hits: spent.hits,
    };
  }

  async function resolveChannel(session) {
    const tableau = movementWindowTableau({ battleId: session.battleId, movementId: session.movement?.id });
    const restored = advanceWindowChannelScene(session.activeChannelScene, {
      phase: 'restored', outcome: session.activeChannelResult?.outcome || 'resolved',
    });
    if (restored) await effects?.noteWindowChannelEvent?.(restored, { token: session.effectToken });
    session.activeChannelScene = null;
    session.activeChannelResult = null;
    if (!windowEnabled() || !tableau) return false;
    const context = getContext(session.encounterId, session.battleId) || {};
    return effects?.resolveWindowChannel?.(tableau, {
      token: session.effectToken,
      forceInternal: context.inputDevice === 'controller',
    });
  }

  async function impact(session, event = {}) {
    if (!enabled() || !session.stage || session.stage === 'foreshadow' || session.stage === 'recognition') return null;
    const kind = WINDOW_KIND[event.kind] || null;
    if (!kind) return null;
    const perfect = !!event.perfect || !!event.parried;
    if (session.channelBattle && session.activeChannelScene) {
      if (perfect) session.perfectCounters += 1;
      session.windowEvents.push(`${perfect ? 'channel-rejected' : 'channel-landed'}:${kind}`);
      session.activeChannelScene = advanceWindowChannelScene(session.activeChannelScene, {
        phase: perfect ? 'parry' : 'damage',
        outcome: perfect ? 'parried' : 'landed',
        parried: perfect,
        damage: Math.max(0, Number(event.received) || 0),
      }) || session.activeChannelScene;
      await effects?.noteWindowChannelEvent?.(session.activeChannelScene, { token: session.effectToken });
      return perfect ? 'rejected' : kind;
    }
    if (perfect) {
      session.perfectCounters += 1;
      session.windowEvents.push(`reject:${kind}`);
      if (windowEnabled()) await effects?.reject?.({ ...sidecarPayload(session, 'SIGNAL REJECTED'), kind, inputLocked: true, token: session.effectToken });
      return 'rejected';
    }
    session.missedResponses += Math.max(0, Number(event.received) || 0) > 0 ? 1 : 0;
    session.windowEvents.push(kind);
    if (windowEnabled()) await effects?.apply?.(kind, {
      ...sidecarPayload(session),
      kind,
      stage: session.stage,
      inputLocked: true,
      token: session.effectToken,
      title: session.stage === 'handoff' ? `HUSH / ${record?.caseId || 'RETURN'}` : `AUDIOCORP / ${kind.toUpperCase()}`,
    });
    return kind;
  }

  async function phaseBreak(session) {
    if (!enabled() || !session.stage) return null;
    if (session.stage !== 'foreshadow') await ensureRecord(getContext(session.encounterId, session.battleId) || {});
    session.phaseBreaks += 1;
    liveLine = {
      text: lineFor(session.stage, session.variant),
      stage: session.stage,
      dwellMs: session.stage === 'foreshadow' ? 1200 : 2200,
      until: Date.now() + 6500,
    };
    if (session.stage === 'foreshadow') {
      session.windowEvents.push('architecture:door-frame');
      if (windowEnabled()) await effects?.apply?.('broadcast', {
        state: 'UNREGISTERED RETURN',
        operator: 'WITHHELD', host: 'WITHHELD', input: 'WITHHELD',
        stage: session.stage,
        inputLocked: true,
        token: session.effectToken,
        title: 'AUDIOCORP / UNREGISTERED FRAME',
      });
    } else if (session.stage === 'recognition') {
      session.windowEvents.push('title:operator-resolved');
      const payload = sidecarPayload(session, 'OPERATOR RESOLVED');
      if (windowEnabled()) await effects?.apply?.('broadcast', {
        ...payload,
        phase: 'phase-break',
        resolution: { phaseBreak: true, outcome: 'movement-break' },
        stage: session.stage,
        inputLocked: true,
        token: session.effectToken,
        title: payload.title,
      });
    } else if (session.stage === 'handoff') {
      session.windowEvents.push('sidecar:handoff');
      const firstPass = session.phaseBreaks === 1;
      const payload = sidecarPayload(session, firstPass ? 'AUDIOCORP DIAGNOSTIC' : 'CONTESTED HANDOFF');
      if (windowEnabled()) await effects?.apply?.('broadcast', {
        ...payload,
        phase: 'phase-break',
        resolution: { phaseBreak: true, outcome: firstPass ? 'diagnostic' : 'handoff' },
        stage: session.stage,
        inputLocked: true,
        token: session.effectToken,
        annotation: firstPass
          ? 'UNATTRIBUTED REVISION: CHANNEL FOUND. AUTHORSHIP PENDING.'
          : 'RETURN PATH: WINDOW OWNERSHIP UNRESOLVED.',
        title: `${firstPass ? 'AUDIOCORP' : 'HUSH'} / ${record?.caseId || 'RETURN'}`,
      });
    }
    return liveLine;
  }

  async function finish(session, result = 'abort', metrics = {}) {
    if (!session.stage) return null;
    try {
      if (enabled() && session.stage !== 'foreshadow') {
        await ensureRecord(getContext(session.encounterId, session.battleId) || {});
        const context = getContext(session.encounterId, session.battleId) || {};
        record = appendInterferenceRevision(record, {
          battleId: session.encounterId,
          stage: session.stage,
          result,
          roomId: context.roomId || metrics.roomId || '',
          choiceIds: context.choiceIds || [],
          actionIds: [...session.actionIds, ...Object.keys(metrics.toolsUsed || {})],
          windowEvents: session.windowEvents,
          perfectCounters: Math.max(session.perfectCounters, Math.max(0, Number(metrics.perfectCounters) || 0)),
          missedResponses: Math.max(session.missedResponses, Math.max(0, Number(metrics.missedCounters) || 0)),
          annotation: annotationFor(session.stage, result),
          responseClassification: session.profileInfluence?.classification || 'UNRESOLVED',
        });
        onRecord(record);
        await safeWrite(record);
        onObservation({
          kind: 'battle',
          signals: {
            resistance: Math.max(0, Math.min(1, 0.5 + ((session.perfectCounters - session.missedResponses) * 0.12))),
            composure: result === 'win' ? 0.68 : result === 'lose' ? 0.32 : 0.5,
            exposure: Math.max(0, Math.min(1, 0.45 + (session.missedResponses * 0.1))),
          },
          weight: 0.8,
        });
      }
    } finally {
      liveLine = null;
      await effects?.end?.(session.effectToken);
      sessions.delete(session.key);
    }
    return record;
  }

  function forBattle(encounterId, battleId = encounterId, recovery = null) {
    const stage = interferenceStageForBattle(encounterId, battleId);
    const key = `${encounterId}:${battleId}`;
    const canonicalBattle = canonicalWindowChannelBattleId(battleId);
    const recoveredBattle = canonicalWindowChannelBattleId(recovery?.battleId);
    const recoveredMovements = canonicalBattle && recoveredBattle === canonicalBattle
      ? (Array.isArray(recovery?.movements) ? recovery.movements : [])
        .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
        .filter((value, index, list) => list.indexOf(value) === index)
      : [];
    const session = {
      key, encounterId, battleId, stage,
      channelBattle: canonicalBattle,
      channelMovements: new Set(recoveredMovements),
      windowProgress: freshWindowChannelProgress(battleId, recovery),
      movement: null, activeChannelScene: null, activeChannelResult: null,
      actionIds: [], windowEvents: [], perfectCounters: 0, missedResponses: 0, phaseBreaks: 0, variant: 0,
    };
    sessions.set(key, session);
    return {
      active: () => enabled() && !!stage,
      enter: () => enter(session),
      movement: (event) => movementChanged(session, event),
      beginWindowChannel: (event) => beginChannelAttack(session, event),
      completeWindowDefense: (options) => completeChannelDefense(session, options),
      resolveWindowChannel: () => resolveChannel(session),
      windowChannelInput: (action) => effects?.channelInput?.(action) || false,
      impact: (event) => impact(session, event),
      phaseBreak: () => phaseBreak(session),
      action: (id) => { if (id) session.actionIds.push(String(id).slice(0, 64)); },
      finish: (result, metrics) => finish(session, result, metrics),
      influence: () => session.profileInfluence || profileInfluence(getProfileState(), { enabled: false }),
      line: () => liveLine && liveLine.until > Date.now() ? { ...liveLine } : null,
      statusLine: () => effects?.statusLine?.() || '',
      channelState: () => ({
        battleId: session.channelBattle,
        charge: session.windowProgress.charge,
        returned: session.windowProgress.returned,
        movementCount: session.channelMovements.size,
        movements: [...session.channelMovements].sort((a, b) => a - b),
      }),
    };
  }

  async function finalizeEnding(endingId) {
    if (!record?.caseId) record = normalizeInterferenceRecord(getRecord());
    if (!record?.caseId) return null;
    record = finalizeInterferenceRecord(record, endingId);
    onRecord(record);
    await safeWrite(record);
    return record;
  }

  async function settingsChanged() {
    identityCache.clear(); identity = null; liveLine = null;
    if (settings().enabled) disabledForSession = false;
    if (!windowEnabled()) await effects?.emergencyRestore?.({ notify: false });
  }

  async function emergencyDisable() {
    disabledForSession = true;
    identityCache.clear(); identity = null; liveLine = null;
    await effects?.emergencyRestore?.({ notify: false });
    onEmergency();
  }

  return {
    forBattle,
    finalizeEnding,
    settingsChanged,
    emergencyDisable,
    currentRecord: () => normalizeInterferenceRecord(record || getRecord()),
    // Build the case up front, before any battle needs it, and hand back the
    // masked persona token — a one-way HMAC fragment like `OPERATOR 4F2A`.
    //
    // The name the rain takes at the gate is dimensioned by this, and the gate
    // is the first thing in the run. Deriving it lazily at the first battle
    // would mean the shape changed halfway through a night, and the whole point
    // of that shape is that you meet it twice and recognise it.
    async primeIdentity(context = {}) {
      if (!enabled()) return null;
      try {
        const primed = await ensureRecord(context);
        return primed?.tokens?.persona?.token || null;
      } catch (_) {
        return null;   // masking unavailable is an ordinary fallback, never a crash
      }
    },
    // The booth is allowed to SAY the separately consented display name while
    // keeping every written and durable surface masked. Return the sanitized
    // value from the runtime-only identity cache; never copy it into the case,
    // debug payload, save callback or an error message.
    async primePersona(context = {}) {
      if (!enabled()) return null;
      try {
        if (!identity) identity = await identityCache.request(settings(), context);
        return identity?.persona?.value || null;
      } catch (_) {
        return null;
      }
    },
    clearRun() { record = null; identity = null; liveLine = null; sessions.clear(); identityCache.clear(); },
    debug: () => ({
      enabled: enabled(),
      caseId: record?.caseId || null,
      identity: identityCache.debug(),
      activeStages: enabled() ? [...sessions.values()].map((entry) => entry.stage).filter(Boolean) : [],
      battleIntents: [...sessions.values()].map((entry) => entry.profileInfluence?.battleIntent || null),
    }),
  };
}
