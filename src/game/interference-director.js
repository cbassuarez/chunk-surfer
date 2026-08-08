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

const STAGE = Object.freeze({
  'practice-room-hush': 'foreshadow',
  'recording-2': 'recognition',
  'pre-recording-4': 'control',
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

  function sidecarPayload(stage, state = 'MONITOR RETURN') {
    const showExact = settings().vfdText !== false;
    return {
      state,
      operator: showExact ? identity?.persona?.value || 'OPERATOR UNRESOLVED' : record?.tokens?.persona?.token || 'OPERATOR MASKED',
      host: stage === 'recognition' ? 'WITHHELD' : showExact ? identity?.hostname?.value || 'HOST UNRESOLVED' : record?.tokens?.hostname?.token || 'HOST MASKED',
      input: stage === 'recognition' ? 'WITHHELD' : showExact ? identity?.mic?.value || 'INPUT UNRESOLVED' : record?.tokens?.mic?.token || 'INPUT MASKED',
      annotation: stage === 'handoff' ? 'I KNOW WHICH WINDOW YOU KEEP RETURNING TO.' : '',
    };
  }

  function lineFor(stage, variant = 0) {
    if (stage === 'foreshadow') return 'UNREGISTERED MONITOR RETURN / OPERATOR RESOLUTION WITHHELD';
    if (stage === 'recognition') {
      const tag = identity?.persona?.source === 'steam' ? 'STEAM PERSONA' : identity?.persona?.source === 'os' ? 'LOCAL OPERATOR' : 'OPERATOR';
      const display = settings().vfdText !== false
        ? identity?.persona?.value || 'UNRESOLVED'
        : record?.tokens?.persona?.token || 'OPERATOR MASKED';
      return [
        `${tag} PATH RESOLVED: ${display}`,
        `RETURN ADDRESS CONFIRMED / ${tag}: ${display}`,
        `OPERATOR ON THIS CHANNEL: ${display}`,
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

  async function impact(session, event = {}) {
    if (!enabled() || !session.stage || session.stage === 'foreshadow' || session.stage === 'recognition') return null;
    const kind = WINDOW_KIND[event.kind] || null;
    if (!kind) return null;
    const perfect = !!event.perfect || !!event.parried;
    if (perfect) {
      session.perfectCounters += 1;
      session.windowEvents.push(`reject:${kind}`);
      if (windowEnabled()) await effects?.reject?.({ ...sidecarPayload(session.stage, 'SIGNAL REJECTED'), kind, inputLocked: true, token: session.effectToken });
      return 'rejected';
    }
    session.missedResponses += Math.max(0, Number(event.received) || 0) > 0 ? 1 : 0;
    session.windowEvents.push(kind);
    if (windowEnabled()) await effects?.apply?.(kind, {
      ...sidecarPayload(session.stage),
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
      const payload = sidecarPayload(session.stage, 'OPERATOR RESOLVED');
      if (windowEnabled()) await effects?.apply?.('broadcast', {
        ...payload,
        stage: session.stage,
        inputLocked: true,
        token: session.effectToken,
        title: `AUDIOCORP / ${payload.operator}`,
      });
    } else if (session.stage === 'handoff') {
      session.windowEvents.push('sidecar:handoff');
      const firstPass = session.phaseBreaks === 1;
      const payload = sidecarPayload(session.stage, firstPass ? 'AUDIOCORP DIAGNOSTIC' : 'CONTESTED HANDOFF');
      if (windowEnabled()) await effects?.apply?.('broadcast', {
        ...payload,
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

  function forBattle(encounterId, battleId = encounterId) {
    const stage = interferenceStageForBattle(encounterId, battleId);
    const key = `${encounterId}:${battleId}`;
    const session = {
      key, encounterId, battleId, stage,
      actionIds: [], windowEvents: [], perfectCounters: 0, missedResponses: 0, phaseBreaks: 0, variant: 0,
    };
    sessions.set(key, session);
    return {
      active: () => enabled() && !!stage,
      enter: () => enter(session),
      impact: (event) => impact(session, event),
      phaseBreak: () => phaseBreak(session),
      action: (id) => { if (id) session.actionIds.push(String(id).slice(0, 64)); },
      finish: (result, metrics) => finish(session, result, metrics),
      influence: () => session.profileInfluence || profileInfluence(getProfileState(), { enabled: false }),
      line: () => liveLine && liveLine.until > Date.now() ? { ...liveLine } : null,
      statusLine: () => effects?.statusLine?.() || '',
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
