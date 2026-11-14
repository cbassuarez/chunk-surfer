import { assetUrl } from '../platform/paths.js';
import { createStandingTearImpulse, quantizeStandingTearPCM } from './standing-tear-dsp.js';
import { homeValleyMusicCell, homeValleyMusicSpace } from '../game/childhood-valley-music-space.js';
import { HOME_VALLEY_MUSIC_CUES } from './childhood-valley-music-cues.js';

const URL = 'audio/childhood-valley/visee-tannenried-jovanic.mp3';
const GAIN = .66;
const SPLICE_SECONDS = .030;
const CADENCE_RELEASE_SECONDS = .035;
const CADENCE_LOOKAHEAD_SECONDS = .055;
export const HOME_VALLEY_MUSIC_PROFILE = Object.freeze({
  bitDepth: 10, effectiveSampleRate: 26000, ditherSeed: 0x54616e6e, reflectionSeconds: 3.4,
});

export { HOME_VALLEY_MUSIC_CUES };
const FAREWELL = 'montfermeil-release';
const RETURN_REFRAIN = 'montfermeil-refrain';
const RETURN_CELLS = new Set(['fork', 'hamlet', 'commons']);
const CELLS = Object.freeze({
  threshold: 'prelude-open', lane: 'prelude-answer', stop: 'prelude-answer',
  commons: 'allemande-open', east: 'allemande-open', approach: 'allemande-open',
  home: 'allemande-turn', hamlet: 'allemande-answer', fork: 'courante-open',
  timber: 'courante-open', spring: RETURN_REFRAIN, lookout: RETURN_REFRAIN,
});

export function homeValleyScorePhrase(cell, split = false) {
  return cell === 'timber' && split ? 'courante-answer' : CELLS[cell] ?? null;
}

function makePhrase(context, input, id, loop) {
  const [from, to, edits] = HOME_VALLEY_MUSIC_CUES[id];
  const rate = input.sampleRate;
  const start = Math.round(from * rate);
  const end = Math.min(input.length, Math.round(to * rate));
  const overlap = loop ? Math.round(SPLICE_SECONDS * rate) : 0;
  const raw = input.getChannelData(0);
  const length = end - start;
  const pcm = new Float32Array(length);
  pcm.set(raw.subarray(start, end));
  for (let i = 0; i < overlap; i++) {
    const t = (i + 1) / (overlap + 1);
    // Replace the end of the phrase with a short crossfade into its own pickup.
    // The loop wraps to the sample after that pickup, avoiding a double attack.
    const at = end - start - overlap + i;
    pcm[at] = pcm[at] * (1 - t) + raw[start + i] * t;
  }
  const { samples, diagnostics } = quantizeStandingTearPCM(pcm, {
    ...HOME_VALLEY_MUSIC_PROFILE, sampleRate: rate,
  });
  const buffer = context.createBuffer(1, length, rate);
  buffer.getChannelData(0).set(samples);
  const loopStart = overlap / rate;
  // The last samples of a loop already contain its next pickup. Exit before
  // that seam so an outgoing phrase never starts again under the incoming one.
  const lastExit = buffer.duration - 2 * loopStart;
  const cadences = [...edits.map(time => time - from).filter(time => time < lastExit), lastExit];
  return { buffer, cadences, loopStart, diagnostics };
}

function positionAt(voice, now) {
  const { phrase, start, offset, loop } = voice;
  const elapsed = offset + Math.max(0, now - start);
  const end = phrase.buffer.duration;
  if (!loop || elapsed < end) return Math.min(end, elapsed);
  return phrase.loopStart + (elapsed - end) % (end - phrase.loopStart);
}

function nextCadence(voice, now) {
  const { phrase } = voice;
  const at = positionAt(voice, now);
  const next = phrase.cadences.find(cue => cue >= at + CADENCE_LOOKAHEAD_SECONDS);
  if (next !== undefined) return now + next - at;
  if (!voice.loop) return now + Math.max(.015, phrase.buffer.duration - at);
  // If the current cadence is too close to schedule cleanly, use the first
  // authored exit in the following pass through this phrase.
  return now + phrase.buffer.duration - at + phrase.cadences[0] - phrase.loopStart;
}

function immediate(param, value, when) {
  param.cancelScheduledValues(when);
  param.setValueAtTime(value, when);
}

export function createHomeValleyMusic({ getAudio, fetcher = (...args) => fetch(...args), urlFor = assetUrl } = {}) {
  let context, destination, output, impulse, input, loading, error, generation = 0;
  let current, incoming, retiring, fadingTail, parked, cell, lastPlacement, finaleStarted = false;
  let reachedLookout = false, returnVisit = null;
  let target = null, desiredFinale = false, held = false, requested = null, placementsAt = -Infinity, mixAt = -Infinity;
  const phrases = new Map();

  function disposeVoice(voice) {
    if (!voice) return;
    voice.source.onended = null;
    try { voice.source.stop(); } catch {}
    for (const node of voice.nodes) node.disconnect();
    voice.reverb.buffer = null;
  }

  function markStarted(voice) {
    if (voice.id === FAREWELL) finaleStarted = true;
    if (voice.id === RETURN_REFRAIN && !voice.loop) returnVisit ??= { cell: voice.cell, finished: false };
  }

  function hold() {
    held = true;
    if (!context) return;
    const now = context.currentTime;
    if (incoming && incoming.start <= now) {
      disposeVoice(current);
      current = incoming;
      incoming = null;
      markStarted(current);
    }
    if (current) {
      const offset = positionAt(current, now);
      if (returnVisit && current.id === RETURN_REFRAIN && !current.loop && offset >= current.phrase.buffer.duration)
        returnVisit.finished = true;
      parked = { id: current.id, cell: current.cell, offset, loop: current.loop };
    }
    if (output) immediate(output.gain, 0, now);
    for (const voice of [current, incoming, retiring, fadingTail]) disposeVoice(voice);
    current = incoming = retiring = fadingTail = null;
  }

  function stop() {
    hold();
    generation++;
    loading?.abort();
    loading = input = error = parked = requested = cell = lastPlacement = null;
    output?.disconnect();
    context = destination = output = impulse = null;
    target = null; desiredFinale = finaleStarted = false;
    reachedLookout = false;
    returnVisit = null;
    placementsAt = mixAt = -Infinity;
    phrases.clear();
  }

  function prepare() {
    const pair = getAudio?.();
    if (!pair?.context || !pair.destination) return false;
    if (context && (context !== pair.context || destination !== pair.destination)) stop();
    if (context) return true;
    ({ context, destination } = pair);
    output = context.createGain();
    output.gain.value = held ? 0 : 1;
    output.connect(destination);
    const owner = context, token = generation, controller = new AbortController();
    loading = controller;
    void (async () => {
      try {
        const response = await fetcher(urlFor(URL), { signal: controller.signal });
        if (!response.ok) throw Error(`Valley music HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 3_000_000) throw Error('Valley music exceeds its encoded budget');
        const decoded = await owner.decodeAudioData(bytes);
        if (token !== generation) return;
        if (decoded.numberOfChannels !== 1 || Math.abs(decoded.duration - HOME_VALLEY_MUSIC_CUES[FAREWELL][1]) > .18) {
          throw Error('Valley music master does not match its cue sheet');
        }
        input = decoded;
      } catch (cause) {
        if (token === generation) error = String(cause?.message || cause);
      } finally {
        if (token === generation) loading = null;
      }
    })();
    return true;
  }

  function place(voice, pose, now, first = false) {
    const placement = homeValleyMusicSpace(voice.cell, pose);
    if (!placement) return;
    const set = (param, value) => {
      if (first) param.setValueAtTime(value, now);
      else param.setTargetAtTime(value, now, .095);
    };
    set(voice.level.gain, GAIN * placement.gain);
    set(voice.filter.frequency, placement.lowpassHz);
    // Both paths inherit the source's distance, bearing and wall loss.
    set(voice.wet.gain, placement.wet * .52);
    const [x, y, z] = placement.position;
    const { yaw = 0, pitch = 0, floorY = 0, eyeHeight = 1.62 } = pose;
    const dx = x - pose.x, dz = z - pose.z, dy = y - floorY - eyeHeight;
    const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const relative = [right, dy * Math.cos(pitch) - forward * Math.sin(pitch),
      -forward * Math.cos(pitch) - dy * Math.sin(pitch)];
    if (voice.pan?.positionX) {
      for (const [index, axis] of ['positionX', 'positionY', 'positionZ'].entries()) set(voice.pan[axis], relative[index]);
    } else if (voice.pan?.setPosition) voice.pan.setPosition(...relative);
    else if (voice.pan?.pan) set(voice.pan.pan, placement.pan);
    voice.placement = placement;
    if (voice === current || (first && !current)) lastPlacement = placement;
  }

  function startVoice(spec, start, offset, pose, fade) {
    const { id, cell: sourceCell, loop } = spec;
    const key = loop ? id : id + '/once';
    if (!phrases.has(key)) phrases.set(key, makePhrase(context, input, id, loop));
    const phrase = phrases.get(key);
    const source = context.createBufferSource(), envelope = context.createGain(), level = context.createGain();
    const filter = context.createBiquadFilter(), wetFilter = context.createBiquadFilter();
    const reverb = context.createConvolver(), wet = context.createGain();
    const pan = context.createPanner?.() || context.createStereoPanner?.();
    source.buffer = phrase.buffer; source.loop = loop;
    source.loopStart = phrase.loopStart; source.loopEnd = phrase.buffer.duration;
    filter.type = wetFilter.type = 'lowpass';
    filter.Q.value = .35; wetFilter.frequency.value = 2300; wetFilter.Q.value = .2;
    if (pan && 'panningModel' in pan) {
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.rolloffFactor = 0;
    }
    impulse ||= createStandingTearImpulse(context, { decaySeconds: HOME_VALLEY_MUSIC_PROFILE.reflectionSeconds });
    reverb.normalize = false; reverb.buffer = impulse;
    source.connect(envelope).connect(filter).connect(level);
    level.connect(pan || output);
    if (pan) pan.connect(output);
    // Colour and narrow the reflections without promoting them above the direct path.
    (pan || level).connect(wetFilter).connect(reverb).connect(wet).connect(output);
    const nodes = [source, envelope, level, filter, pan, wetFilter, reverb, wet].filter(Boolean);
    const voice = { id, cell: sourceCell, loop, start, offset, phrase, source, envelope, level, filter, reverb, wet, pan, nodes };
    envelope.gain.value = 0;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(1, start + fade);
    place(voice, pose, context.currentTime, true);
    source.start(start, Math.min(offset, phrase.buffer.duration - 1 / phrase.buffer.sampleRate));
    return voice;
  }

  function cancelIncoming(now) {
    if (incoming?.releasesCurrent && current) {
      const envelope = current.envelope.gain;
      const gain = Math.min(1, (incoming.start - now) / CADENCE_RELEASE_SECONDS);
      if (envelope.cancelAndHoldAtTime) envelope.cancelAndHoldAtTime(now);
      else immediate(envelope, gain, now);
      if (gain < 1) envelope.linearRampToValueAtTime(1, now + CADENCE_RELEASE_SECONDS);
    }
    disposeVoice(incoming);
    incoming = null;
  }

  function advance(now) {
    if (fadingTail && fadingTail.until <= now) { disposeVoice(fadingTail); fadingTail = null; }
    if (retiring && retiring.until <= now) { disposeVoice(retiring); retiring = null; }
    if (!incoming || incoming.start > now) return;
    if (retiring) {
      const end = now + .09;
      disposeVoice(fadingTail);
      retiring.wet.gain.cancelAndHoldAtTime?.(now);
      retiring.wet.gain.linearRampToValueAtTime(0, end);
      fadingTail = retiring;
      fadingTail.until = end;
    }
    retiring = current;
    if (retiring) {
      const end = incoming.cadence ? now : now + .21;
      if (!incoming.cadence) {
        if (retiring.envelope.gain.cancelAndHoldAtTime) retiring.envelope.gain.cancelAndHoldAtTime(now);
        else immediate(retiring.envelope.gain, 1, now);
        retiring.envelope.gain.linearRampToValueAtTime(0, end);
      }
      retiring.source.stop(end);
      retiring.until = end + HOME_VALLEY_MUSIC_PROFILE.reflectionSeconds;
    }
    current = incoming;
    incoming = null;
    markStarted(current);
  }

  function update({ realm = null, pause = false, protectedAudio = false, finale = false } = {}) {
    if (!realm?.home?.eligible || realm.stage !== 'inside') {
      if (context || target) stop();
      return;
    }
    if (pause || protectedAudio) {
      if (!held) hold();
      return;
    }
    held = false;
    if (!prepare() || error) return;
    if (context.state !== 'running') {
      if (current || incoming || retiring) hold();
      return;
    }
    const now = context.currentTime;
    if (output.gain.value !== 1) immediate(output.gain, 1, now);
    const pose = { ...realm.pose, eyeHeight: realm.eyeHeight };
    if (now - placementsAt >= .08) {
      cell = homeValleyMusicCell(pose, cell);
      placementsAt = now;
    }
    if (!cell) {
      target = null;
      hold();
      return;
    }
    advance(now);
    reachedLookout ||= cell === 'lookout';
    desiredFinale ||= finale;
    if (returnVisit && current?.id === RETURN_REFRAIN && !current.loop
      && positionAt(current, now) >= current.phrase.buffer.duration) returnVisit.finished = true;
    // On descent, keep the one-shot at the place it began. Walking away lets
    // the terrain and distance swallow the music as the final notes ring.
    const returning = !desiredFinale && (returnVisit
      ? !returnVisit.finished || returnVisit.cell === cell
      : reachedLookout && RETURN_CELLS.has(cell));
    const id = desiredFinale ? FAREWELL : returning ? RETURN_REFRAIN : homeValleyScorePhrase(cell, realm.homeState?.activities?.split);
    const loop = !desiredFinale && !returning;
    const sourceCell = returning && returnVisit ? returnVisit.cell : cell;
    target = { id, cell: sourceCell, loop };
    if (!input) return;
    if (current && !current.loop && now > current.start + current.phrase.buffer.duration - current.offset + HOME_VALLEY_MUSIC_PROFILE.reflectionSeconds) {
      disposeVoice(current); current = null;
    }
    if (requested?.id !== id || requested?.cell !== sourceCell || requested?.loop !== loop) {
      cancelIncoming(now);
      requested = target;
    }
    const resume = parked?.id === id && parked.loop === loop;
    const alreadyStarted = (desiredFinale && finaleStarted) || (returning && returnVisit?.finished);
    if (!incoming && !(current?.id === id && current.cell === sourceCell && current.loop === loop)
      && (!alreadyStarted || resume)) {
      const samePhrase = current?.id === id && current.loop === loop;
      const cadence = current && !samePhrase && !desiredFinale;
      const at = cadence ? nextCadence(current, now) : now + (samePhrase || desiredFinale ? .04 : .015);
      const offset = resume ? parked.offset : samePhrase ? positionAt(current, at) : 0;
      if (offset < (phrases.get(loop ? id : id + '/once')?.buffer.duration ?? Infinity)) {
        incoming = startVoice(target, at, offset, pose, samePhrase || resume ? .19 : .012);
        if (cadence) {
          incoming.cadence = true;
          const envelope = current.envelope.gain;
          if (current.loop || at < current.start + current.phrase.buffer.duration - current.offset) {
            incoming.releasesCurrent = true;
            const release = Math.max(now, at - CADENCE_RELEASE_SECONDS);
            envelope.setValueAtTime(1, release);
            envelope.linearRampToValueAtTime(0, at);
          }
        }
      }
      parked = null;
      advance(now);
    }
    if (now - mixAt >= .08) {
      for (const voice of [current, incoming, retiring]) if (voice) place(voice, pose, now);
      mixAt = now;
    }
  }

  function snapshot() {
    const active = current || incoming;
    return { cell, phrase: active?.id ?? null, wanted: target?.id ?? null, pending: incoming?.id ?? null,
      ready: !!input, loading: !!loading, held, error: error ?? null, finale: desiredFinale,
      playing: !!(active && !held && (active.loop || positionAt(active, context.currentTime) < active.phrase.buffer.duration)),
      offset: active ? positionAt(active, context.currentTime) : parked?.offset ?? null,
      live: [current, incoming, retiring, fadingTail].filter(Boolean).length,
      placement: active?.placement ?? lastPlacement ?? null, dsp: active?.phrase.diagnostics ?? null };
  }
  return { update, hold, stop, snapshot };
}
