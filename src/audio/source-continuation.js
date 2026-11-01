import {createThresholdGagAudio} from './threshold-gag.js';
import {thresholdGagPose} from '../data/threshold-gag.js';
import {createContinuationMaterialAudio} from './source-continuation-materials.js';
import {createSourceSurroundingsAudio,sourceAcousticCoordinates} from './source-surroundings.js';
import {SOURCE_CONTINUATION as LAYOUT,continuationSupportAt} from '../data/source-continuation.js';
import {createFootContactClock} from './foot-contact.js';

// Physical contact and machinery, through the shared world SFX bus. Recorded
// material follows the same physical origins; synthetic resonances supplement
// its load and contact rather than pretending to be a large room recording.
export const SOURCE_CONTINUATION_AUDIO = Object.freeze({ maxVoices: 10, maxSources: 22, maxCombinedVoices: 19, maxCombinedSources: 31, noiseSeconds: 1.93, hushStrideMetres: 1.18 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const body = state => ({ x: number(state?.x), y: number(state?.feet) + .95, z: number(state?.z) });
const point = (v, fallback) => ({ x: number(v?.x, fallback.x), y: number(v?.y, fallback.y), z: number(v?.z, fallback.z) });
const chartOf = value => number(value?.chartId,0);
const portalEpoch = value => number(value?.portalSerial,number(value?.lastPortal?.serial,number(value?.foldSerial,number(value?.lastFold?.serial))));
const hushFeet = state => ['wrong-return', 'catch'].includes(state?.phase) && (!state.status || state.status === 'active')
  && state?.hush?.active && ['x', 'z', 'feet'].every(key => Number.isFinite(state.hush[key]))
  ? { x: state.hush.x, y: state.hush.feet, z: state.hush.z } : null;

// The host supplies carried first-person yaw in II and fixed screen-north yaw
// in overhead Catch. Both listen from the operator's actual body location.
export function sourceContinuationPlacement(source, state = {},acousticFrame=null,chartId=chartOf(state)) {
  const at=point(source,body(state)),coordinates=sourceAcousticCoordinates(at,state,acousticFrame,{chartId,eyeHeight:.95,includePitch:false});
  const [right,,back]=coordinates.relativeXYZ,horizontal=Math.hypot(right,back),distance=coordinates.distance,front=horizontal>.01?-back/horizontal:1;
  return { distance, pan: clamp(right / Math.max(1.5, horizontal) * .88, -.88, .88),
    gain: coordinates.source?1 / (1 + (distance / 10) ** 1.22):0, cutoff: clamp(6600 / (1 + distance / 19) - Math.max(0, -front) * 1500, 600, 6600) };
}

export function createSourceContinuationAudio({ getAudio = () => null, getMusicAudio = () => null, getReducedMotion = () => false, protectedAudio = () => false, fetcher, urlFor, musicFetcher, musicUrlFor, gagFetcher, gagUrlFor, onFootContact = null, clearFootContacts = () => {} } = {}) {
  const footOwner='source-continuation';
  const footClock=createFootContactClock();
  const gag=createThresholdGagAudio({getAudio,protectedAudio,...(gagFetcher?{fetcher:gagFetcher}:{}),...(gagUrlFor?{urlFor:gagUrlFor}:{})});
  const materials=createContinuationMaterialAudio({getAudio,protectedAudio,...(fetcher?{fetcher}:{}),...(urlFor?{urlFor}:{})});
  // Music owns a separate bounded graph. A pressure release cannot evict a
  // warning, footstep or physical door sound from the existing SFX allocator.
  const surroundings=createSourceSurroundingsAudio({getAudio:getMusicAudio,protectedAudio,...(musicFetcher?{fetcher:musicFetcher}:{}),...(musicUrlFor?{urlFor:musicUrlFor}:{})});
  // The seat owns its streamed performance. This scene coordinates only the
  // shared score and lifecycle; it never creates or disposes that owner.
  let restMusicOwner=null,restMusicHeld=null,restMusicIsolated=false;
  // II retains its whole-world isolation. III's full score can accompany
  // walking: isolate its world only once seated or committed to the ending.
  // Text/interface sounds remain outside this world-audio owner.
  function isolateRestMusic(state){
    if(!restMusicOwner)return false;
    try{
      const music=restMusicOwner.snapshot();
      if(!music?.active||music.failed)return false;
      if(state?.phase==='wrong-return')return !music.phase||music.phase===state.phase;
      return state?.phase==='catch'&&typeof restMusicOwner.supportsPhase==='function'
        &&restMusicOwner.supportsPhase(state.phase)&&(!music.phase||music.phase===state.phase)
        &&!!(music.restActive||music.finishAtEnd);
    }
    catch{return false;}
  }
  function retireRestMusicOutsideII(state){
    if(!state?.phase||state.phase==='wrong-return'||!restMusicOwner)return;
    try{
      // Legacy single-score owners keep their II-only retirement contract.
      if(typeof restMusicOwner.supportsPhase==='function'&&restMusicOwner.supportsPhase(state.phase))return;
      if(restMusicOwner.snapshot()?.active)restMusicOwner.update({active:false});
      surroundings.setRestMusicActive(false);restMusicHeld=null;
    }catch{surroundings.setRestMusicActive(false);}
  }
  function syncRestMusic(hold){
    if(!restMusicOwner)return;
    try{
      if(!hold||restMusicHeld!==true)restMusicOwner.update({active:true,paused:!!hold});
      restMusicHeld=!!hold;
      const music=restMusicOwner.snapshot();
      surroundings.setRestMusicActive(!hold&&!!(music?.playing||(music?.finishAtEnd&&music?.ended)));
    }catch{
      // An unavailable recording must never silence the original score.
      restMusicHeld=true;surroundings.setRestMusicActive(false);
    }
  }
  function detachRestMusic(owner){
    if(!restMusicOwner||owner!==restMusicOwner)return false;
    restMusicOwner=null;restMusicHeld=null;surroundings.setRestMusicActive(false);return true;
  }
  function attachRestMusic(owner){
    if(!owner||typeof owner.update!=='function'||typeof owner.snapshot!=='function')throw Error('A Source rest music owner is required.');
    if(restMusicOwner!==owner){if(restMusicOwner)syncRestMusic(true);restMusicOwner=owner;restMusicHeld=null;surroundings.setRestMusicActive(false);}
    let detached=false;return()=>{if(detached)return false;detached=true;return detachRestMusic(owner);};
  }
  let context = null, destination = null, noiseBuffer = null, mechanism = null, active = false, disposed = false,acousticFrame=null;
  let listener = {}, lastBody = null, lastMachine = null, footTravel = 0, toothTravel = 0, lastFocus = null;
  let focusClock = -Infinity, clock = 0, eventCount = 0, played = 0, skipped = 0, footIndex = 0;
  let lastHush = null, hushTravel = 0, hushStepIndex = 0, hushSteps = 0;
  let hushDiagnostic = { active: false, supported: false, mode: null, source: null };
  let diagnostic = { phase: null, mode: 'silent', source: null, mix: null, mechanicalGain: 0, focus: null };
  const voices = new Set();
  function target(param, value, seconds = .055, immediate = false) {
    if (!param) return;
    if (!immediate && param.setTargetAtTime) param.setTargetAtTime(value, context.currentTime, seconds);
    else if (param.setValueAtTime) param.setValueAtTime(value, context.currentTime);
    else param.value = value;
  }
  function release(v) {
    if (!v || v.dead) return;
    v.dead = true;
    for (const source of v.sources) { source.onended = null; try { source.stop(context?.currentTime || 0); } catch {} }
    for (const node of v.nodes) try { node.disconnect(); } catch {}
    voices.delete(v);
  }
  function silenceWorld() {
    gag.pause();footClock.reset(footOwner);clearFootContacts?.(footOwner);
    materials.stop();
    surroundings.stop();
    for (const v of [...voices]) release(v);
    mechanism = null; active = false; lastBody = lastMachine = lastFocus = lastHush = null; footTravel = toothTravel = hushTravel = 0;
    acousticFrame=null;
    hushDiagnostic = { ...hushDiagnostic, active: false, supported: false, source: null };
    diagnostic = { ...diagnostic, mode: 'silent', mechanicalGain: 0, focus: null };
  }
  function stop() { syncRestMusic(true);silenceWorld();restMusicIsolated=false; }
  function available() {
    if (disposed || protectedAudio()) { if(!disposed)stop(); return false; }
    let pair; try { pair = getAudio(); } catch { stop(); return false; }
    if (!pair?.ctx || pair.ctx.state !== 'running' || !pair.destination) { stop(); return false; }
    if (context !== pair.ctx || destination !== pair.destination) {
      const changedContext = context !== pair.ctx; stop(); context = pair.ctx; destination = pair.destination;
      if (changedContext) noiseBuffer = null;
    }
    return typeof context.createBufferSource === 'function' && typeof context.createOscillator === 'function';
  }
  function noise() {
    if (noiseBuffer) return noiseBuffer;
    const rate = number(context.sampleRate, 48000), length = Math.max(2, Math.floor(rate * SOURCE_CONTINUATION_AUDIO.noiseSeconds));
    noiseBuffer = context.createBuffer(1, length, rate);
    const data = noiseBuffer.getChannelData(0); let seed = 0x28310719, previous = 0;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      previous = previous * .28 + (seed / 0xffffffff * 2 - 1) * .72;
      data[i] = previous * Math.min(1, i / (rate * .006), (length - i - 1) / (rate * .006));
    }
    return noiseBuffer;
  }
  function sourceCount() { let count = 0; for (const voice of voices) count += voice.sources.length; return count; }
  function record(place, gain, kind,chartId=chartOf(listener)) {
    const v = { sources: [], nodes: [], dead: false, place:{...place},chartId, gain, kind, until: Infinity };
    v.own = node => { v.nodes.push(node); return node; };
    v.amp = v.own(context.createGain()); v.lowpass = v.own(context.createBiquadFilter()); v.lowpass.type = 'lowpass';
    v.pan = context.createStereoPanner ? v.own(context.createStereoPanner()) : null;
    v.lowpass.connect(v.amp); if (v.pan) v.amp.connect(v.pan).connect(destination); else v.amp.connect(destination);
    voices.add(v); position(v, true); return v;
  }
  function position(v, immediate = false) {
    const mix = sourceContinuationPlacement(v.place, listener,acousticFrame,v.chartId);
    target(v.amp.gain, v.gain * mix.gain, .065, immediate);
    target(v.lowpass.frequency, mix.cutoff, .07, immediate);
    if (v.pan) target(v.pan.pan, mix.pan, .06, immediate);
    v.mix = mix;
  }
  function layer(v, { hz = null, frequency = 1100, q = .8, gain = 1, duration = null, delay = 0, attack = .006, endHz = null } = {}) {
    const source = v.own(hz === null ? context.createBufferSource() : context.createOscillator());
    v.sources.push(source);
    if (hz === null) { source.buffer = noise(); source.loop = duration === null; }
    else { source.type = 'sine'; source.frequency.value = hz; }
    const filter = v.own(context.createBiquadFilter()), amp = v.own(context.createGain());
    filter.type = hz === null ? 'bandpass' : 'lowpass'; filter.frequency.value = frequency; if (filter.Q) filter.Q.value = q;
    source.connect(filter).connect(amp).connect(v.lowpass);
    const at = context.currentTime + delay;
    amp.gain.setValueAtTime(duration === null ? gain : .00001, context.currentTime);
    if (duration !== null) {
      amp.gain.setValueAtTime(.00001, at); amp.gain.exponentialRampToValueAtTime(Math.max(.00001, gain), at + attack);
      amp.gain.exponentialRampToValueAtTime(.00001, at + Math.max(attack + .005, duration));
      if (hz !== null && endHz !== null) source.frequency.exponentialRampToValueAtTime(endHz, at + duration);
      v.until = Math.max(Number.isFinite(v.until) ? v.until : 0, at + duration + .03);
    }
    source.start(at); if (duration !== null) source.stop(at + duration + .025);
    return { source, amp, filter };
  }
  function strike(place, gain, parts, kind,chartId=chartOf(listener)) {
    // Input events can arrive before the first update. Reserve the one record
    // and two sources needed by the continuing mechanism in that ordering too.
    const reserve = mechanism ? 0 : 1;
    if (voices.size >= SOURCE_CONTINUATION_AUDIO.maxVoices - reserve || sourceCount() + parts.length > SOURCE_CONTINUATION_AUDIO.maxSources - reserve * 2) { skipped++; return false; }
    const v = record(place, gain, kind,chartId), layers = parts.map(part => layer(v, part)); let remaining = layers.length;
    for (const { source } of layers) source.onended = () => { if (--remaining === 0) release(v); };
    played++; return true;
  }
  function mechanismAt(state) {
    if (state.phase === 'catch') return point(state.counterweight, { x: LAYOUT.catch.hoist.start.x, y: LAYOUT.catch.top, z: LAYOUT.catch.hoist.start.z });
    if (Number.isFinite(state.closure?.frontX)) return { x: state.closure.frontX, y: 9.4, z: number(state.closure.frontZ, -12) };
    return { x: 6, y: 3.65, z: number(state.closure?.frontZ, -4.5) };
  }
  function startMechanism(place) {
    const v = record(place, 0, 'mechanism',0);
    v.rub = layer(v, { frequency: 1150, q: 1.8, gain: .7 });
    v.resonance = layer(v, { hz: 93, frequency: 550, gain: .12 });
    return v;
  }
  function event(event, state = listener,presentedFrame=acousticFrame) {
    if(isolateRestMusic(state)){
      if(!restMusicIsolated){silenceWorld();restMusicIsolated=true;}
      return false;
    }
    retireRestMusicOutsideII(state);restMusicIsolated=false;
    if(String(event?.type||'').startsWith('threshold-gag-')){gag.resume();return gag.event(event,state,presentedFrame);}
    if (!available()) return false;
    listener = state || {};acousticFrame=presentedFrame; const type = String(event?.type || '');
    // A real chart crossing is a topology event, not travelled floor distance
    // or an invented stinger. Each actor owns its own stride discontinuity.
    if(type==='portal'||type==='fold'){lastBody=null;footTravel=0;footClock.reset(footOwner);clearFootContacts?.(footOwner);return false;}
    if(type==='hush-portal'||type==='hush-fold'){lastHush=null;hushTravel=0;return false;}
    const machine = mechanismAt(listener), here = body(listener);
    const actor = hushFeet(listener), hushEvent = /^hush-(?:armed|warning|notice|drop|land|recovery|recovered)$/.test(type), hushCapture = type === 'capture' && event.reason === 'hush-pressure';
    if (hushEvent && !actor) return false;
    // The host transforms the Hush with its world. Prefer that authoritative
    // pose to the controller event's untransformed position under a study turn.
    const place = (hushEvent || hushCapture) && actor
      ? { ...actor, y: actor.y + (['hush-land', 'hush-recovered', 'hush-armed', 'hush-warning'].includes(type) ? .03 : .95) }
      : point(event?.position || (Number.isFinite(event?.x) ? event : null),
        /^counterweight|^closure/.test(type) ? machine : type === 'door' && lastFocus ? point(lastFocus.position || lastFocus, here) : here);
    let gain, parts;
    if (type === 'hush-armed' || type === 'hush-warning') {
      gain = .058; parts = [{ frequency: 730, q: .55, gain: .8, duration: .19 }, { hz: 71, endHz: 60, frequency: 380, gain: .55, duration: .32 }];
    } else if (type === 'hush-notice') {
      gain = .044; parts = [{ frequency: 950, q: .65, gain: .8, duration: .48, attack: .06 }, { frequency: 2100, q: 1.2, gain: .22, duration: .21, attack: .03 }];
    } else if (type === 'hush-recovery') {
      gain = .038; parts = [{ frequency: 880, q: 1.2, gain: .7, duration: 1.1, attack: .08 }, { hz: 83, endHz: 141, frequency: 500, gain: .23, duration: .95, attack: .09 }];
    } else if (type === 'hush-recovered') {
      gain = .045; parts = [{ frequency: 390, q: .6, gain: .8, duration: .2 }, { hz: 67, endHz: 54, frequency: 300, gain: .5, duration: .28 }];
    } else if (type === 'hush-drop') {
      gain = .035; parts = [{ frequency: 1500, q: .6, gain: .8, duration: .24, attack: .02 }];
    } else if (type === 'hush-land') {
      gain = .085; parts = [{ frequency: 290, q: .45, gain: .9, duration: .21 }, { hz: 64, endHz: 45, frequency: 340, gain: .7, duration: .46 }];
    } else if (type === 'closure-warning') {
      gain = .055; parts = [{ frequency: 2700, gain: .8, duration: .13 }, { hz: 118, endHz: 103, frequency: 800, gain: .65, duration: .95 }, { hz: 307, frequency: 1300, gain: .2, duration: .4 }];
    } else if (type === 'counterweight-lands') {
      gain = .065; parts = [{ frequency: 380, q: .5, duration: .2 }, { hz: 61, endHz: 48, frequency: 300, gain: .8, duration: .62 }, { hz: 181, frequency: 700, gain: .25, duration: .38 }];
    } else if (type === 'counterweight-warning' || type === 'counterweight-lowering-warning') {
      gain = .047; parts = [{ frequency: 1850, q: 2.1, duration: .12 }, { hz: 231, endHz: 189, frequency: 1200, gain: .34, duration: .65 }, { frequency: 570, gain: .24, duration: .5, attack: .06 }];
    } else if (/^counterweight-(?:moves|return|rewind|hoist|traverse|lower|cycle|turn|strain|release)$/.test(type)) {
      gain = .032; parts = [{ frequency: 2350, q: 2, duration: .11 }, { hz: 393, endHz: 307, frequency: 1500, gain: .25, duration: .33 }];
    } else if (type === 'drop') {
      gain = .030; parts = [{ frequency: 1450, gain: .8, duration: .2, attack: .022 }, { hz: 276, endHz: 183, frequency: 800, gain: .18, duration: .26 }];
    } else if (type === 'land') {
      gain = .038; parts = [{ frequency: 320, q: .45, duration: .18 }, { hz: 84, endHz: 63, frequency: 340, gain: .7, duration: .29 }];
    } else if (type === 'capture') {
      gain = hushCapture ? .068 : .042; parts = [{ frequency: event.reason === 'closing-front' ? 760 : hushCapture ? 540 : 420, q: .5, duration: .27, attack: .014 }, { hz: 73, endHz: 51, frequency: 280, gain: .5, duration: .4 }];
    } else if (type === 'recovered') {
      gain = .020; parts = [{ frequency: 660, q: .45, duration: .42, attack: .07 }, { frequency: 1900, gain: .22, duration: .15 }];
    } else if (type === 'door' || type === 'return' || type === 'complete') {
      gain = .032; parts = [{ frequency: 2400, q: 1.2, duration: .065 }, { hz: event.open === false ? 153 : 167, endHz: 132, frequency: 700, gain: .2, duration: .38 }, { frequency: 630, gain: .35, duration: .48, attack: .035, delay: .04 }];
    } else if (type === 'phase') {
      gain = .023; parts = [{ frequency: 460, q: 2.8, duration: .9, attack: .07 }, { hz: 107, endHz: 93, frequency: 400, gain: .24, duration: 1.1, attack: .09 }];
    } else return false;
    const chartId=(hushEvent||hushCapture)&&actor?chartOf(listener.hush):/^counterweight|^closure/.test(type)?0:number(event?.chartId,chartOf(listener));
    materials.event(event,listener,acousticFrame);
    eventCount++; return strike(place, gain, parts, type,chartId);
  }
  function update({ dt = 0, state, surroundingsState = state, focus = null, paused = false, ready = false,acousticFrame:presentedFrame=null } = {}) {
    if (paused || !ready || !state || !available()) { stop(); return false; }
    retireRestMusicOutsideII(surroundingsState||state);
    syncRestMusic(false);
    if(isolateRestMusic(surroundingsState||state)){
      if(!restMusicIsolated){silenceWorld();restMusicIsolated=true;}
      listener=state;acousticFrame=presentedFrame;
      diagnostic={...diagnostic,phase:state.phase,mode:'rest-recording-only',source:null,mix:null,mechanicalGain:0,focus:null};
      return true;
    }
    restMusicIsolated=false;
    active = true; listener = state;acousticFrame=presentedFrame;
    gag.resume();gag.update(state,acousticFrame,thresholdGagPose(state));
    materials.update(state,acousticFrame);
    // Catch's fixed overhead camera faces raw world north. Its study turn
    // rotates camera and world together, so the raw music listener stays north
    // while retaining the exact shared score clock and source coordinates.
    const surroundingsListener = surroundingsState?.phase === 'catch' ? { ...surroundingsState, yaw: 0, pitch: 0 } : surroundingsState;
    surroundings.update({state:surroundingsListener,ready:true,reducedMotion:!!getReducedMotion(),acousticFrame});
    const delta = clamp(dt, 0, .25); clock += delta;
    for (const voice of [...voices]) if (voice !== mechanism && voice.until <= context.currentTime) release(voice);
    const place = mechanismAt(state), mode = state.phase === 'catch' ? state.counterweight?.active ? state.counterweight.mode || 'warning' : 'tension' : state.closure?.mode || 'dormant';
    mechanism ||= startMechanism(place); mechanism.place = place;
    const warning = mode === 'warning' || mode === 'lowering-warning';
    const winding = /hoist|return|rewind/.test(mode), lowering = mode === 'lowering';
    const moving = ['walking', 'closing', 'falling', 'hoisting', 'returning', 'rewinding', 'traversing', 'lowering'].includes(mode);
    const pulse = .5 + .5 * Math.sin(number(state.elapsed, clock) * (warning ? 3.2 : 9.1));
    let gain = mode === 'dormant' ? 0 : warning ? .007 + .002 * pulse : moving ? .015 + .003 * pulse : .0018;
    if (state.recovery) gain *= .42;
    mechanism.gain = gain;
    target(mechanism.rub.filter.frequency, mode === 'rewinding' ? 2300 : winding ? 1720 : mode === 'traversing' ? 2050 : mode === 'falling' || lowering ? 760 : mode === 'closing' ? 440 : 1190);
    target(mechanism.resonance.source.frequency, mode === 'rewinding' ? 173 : winding ? 147 : mode === 'traversing' ? 121 : mode === 'closing' ? 78 : lowering ? 87 : 93);
    for (const voice of voices) position(voice);
    if (lastMachine?.phase === state.phase && moving) {
      const travel = Math.hypot(place.x - lastMachine.x, place.y - lastMachine.y, place.z - lastMachine.z);
      if (travel < 1.6) toothTravel += travel; else toothTravel = 0;
      if (toothTravel > .64) {
        toothTravel %= .64;
        strike(place, .021, [{ frequency: winding || mode === 'traversing' ? 3100 : 2150, q: 2.1, duration: .055 }, { hz: 387, frequency: 1200, gain: .22, duration: .12 }], 'ratchet',0);
      }
    } else toothTravel = 0;
    lastMachine = { ...place, phase: state.phase };
    const here = body(state), hadBody = lastBody?.phase === state.phase&&lastBody?.runId===state.runId&&lastBody?.chartId===chartOf(state)&&lastBody?.portalEpoch===portalEpoch(state);
    if(typeof onFootContact==='function'){
      const supportedBody=hadBody&&!state.fall&&!state.recovery&&!state.reveal;
      const support=supportedBody?continuationSupportAt(state.x,state.z,state):null;
      const supported=!!support&&Math.abs(support.y-number(state.feet))<.16;
      const travel=hadBody?Math.hypot(here.x-lastBody.x,here.z-lastBody.z):0;
      if(!hadBody)footClock.reset(footOwner);
      if(Number(dt)>0)for(const plant of footClock.update({dt:Number(dt),distance:travel,scene:footOwner,
        supported,teleported:travel>=1.3})){
        footIndex++;
        onFootContact({...plant,owner:footOwner,surface:support.surface?.material||'cold-stone',profile:'physical',
          construction:support.surface?.construction,position:{x:here.x,z:here.z},distanceM:plant.distance,strideM:plant.stride,level:.09,condition:'walk',
          id:`${footOwner}:${state.runId}:${footIndex}`,time:number(state.elapsed,clock)});
      }
      if(!supported&&lastBody)clearFootContacts?.(footOwner);
    }else if (hadBody && !state.fall && !state.recovery && !state.reveal) {
      const travel = Math.hypot(here.x - lastBody.x, here.z - lastBody.z);
      if (travel < 1.3) footTravel += travel; else {footTravel = 0;clearFootContacts?.(footOwner);}
      if (footTravel >= .92) {
        footTravel %= .92; footIndex++;
        strike({ ...here, y: number(state.feet), x: here.x + (footIndex % 2 ? -.11 : .11) }, .019,
          [{ frequency: state.phase === 'catch' ? 430 : state.feet > 2.7 ? 650 : 310, q: .5, duration: .095 }, { hz: footIndex % 2 ? 91 : 97, endHz: 66, frequency: 300, gain: .28, duration: .13 }], 'footstep');
      }
    } else {if(lastBody)clearFootContacts?.(footOwner);footTravel = 0;}
    lastBody = { ...here, phase: state.phase,runId:state.runId,chartId:chartOf(state),portalEpoch:portalEpoch(state) };
    const hush = state.hush, actor = hushFeet(state);
    const supported = !!actor && !hush.fall && !hush.recovery && !['falling','recovering'].includes(hush.mode) && !state.recovery && !state.reveal;
    const sameHush = lastHush?.phase === state.phase && lastHush?.runId === state.runId && lastHush?.id === hush?.id&&lastHush?.chartId===chartOf(hush)&&lastHush?.portalEpoch===portalEpoch(hush);
    if (supported && lastHush?.supported && sameHush) {
      const travel = Math.hypot(actor.x - lastHush.x, actor.y - lastHush.y, actor.z - lastHush.z);
      // Accept physical stairs; discard relocations and vertical correction.
      // Falling has its own explicit drop/landing events, never airborne steps.
      if (travel < 1.3 && Math.abs(actor.y - lastHush.y) < .65) hushTravel += travel; else hushTravel = 0;
      if (hushTravel >= SOURCE_CONTINUATION_AUDIO.hushStrideMetres) {
        hushTravel %= SOURCE_CONTINUATION_AUDIO.hushStrideMetres; hushStepIndex++;
        const side = hushStepIndex % 2 ? -.15 : .15, heading = number(hush.heading);
        const foot = { x: actor.x + Math.cos(heading) * side, y: actor.y + .03, z: actor.z + Math.sin(heading) * side };
        if (strike(foot, hush.armed ? .066 : .052,
          [{ frequency: 900, q: .45, gain: .9, duration: .11 }, { hz: hushStepIndex % 2 ? 69 : 77, endHz: 54, frequency: 400, gain: .52, duration: .17 }], 'hush-footstep',chartOf(hush))) hushSteps++;
      }
    } else hushTravel = 0;
    lastHush = actor ? { ...actor, supported, phase: state.phase, runId: state.runId, id: hush.id,chartId:chartOf(hush),portalEpoch:portalEpoch(hush) } : null;
    hushDiagnostic = { active: !!actor, supported, mode: hush?.mode || null, source: actor ? { ...actor } : null,chartId:chartOf(hush) };
    if (hadBody && focus && !state.fall && !state.recovery && !state.reveal && focus.id !== lastFocus?.id && clock - focusClock > 1.4) {
      const at = point(focus.position || focus, here), drop = focus.type === 'drop';
      strike(at, drop ? .014 : .017, drop
        ? [{ frequency: 1380, q: .6, duration: .18, attack: .03 }]
        : [{ frequency: 2300, q: 2, duration: .045 }, { hz: 427, endHz: 373, frequency: 1500, gain: .22, duration: .18 }], drop ? 'edge-contact' : 'handle-contact');
      focusClock = clock;
    }
    lastFocus = focus;
    diagnostic = { phase: state.phase, mode, source: { ...place }, mix: { ...mechanism.mix }, mechanicalGain: gain, focus: focus?.id || null };
    return true;
  }
  return { event, update, prepare:()=>{gag.resume();return gag.prepare();},gagReady:()=>gag.snapshot().ready,pause: stop, stop,attachRestMusic,detachRestMusic,
    setRestMusicActive:value=>surroundings.setRestMusicActive(value),
    dispose() { stop(); if(restMusicOwner)detachRestMusic(restMusicOwner); gag.dispose();materials.dispose(); surroundings.dispose(); disposed = true; noiseBuffer = null; },
    snapshot: () => ({ active, voices: voices.size, sources: sourceCount(), combinedVoiceBound:voices.size+materials.snapshot().voices, combinedSourceBound:sourceCount()+materials.snapshot().voices, totalVoiceBound:voices.size+materials.snapshot().voices+surroundings.snapshot().voices+gag.snapshot().voices, totalSourceBound:sourceCount()+materials.snapshot().voices+surroundings.snapshot().voices+gag.snapshot().voices, events: eventCount, played, skipped, kind: 'source-continuation',
      ...diagnostic, restMusicIsolated,restMusic:restMusicOwner?.snapshot?.()||null,thresholdGag:gag.snapshot(),hush:{...hushDiagnostic,footsteps:hushSteps}, materials:materials.snapshot(), surroundings:surroundings.snapshot(), layers: [...voices].map(v => ({ kind: v.kind, source: { ...v.place },chartId:v.chartId, mix: { ...v.mix }, gain: v.gain })) }),
  };
}
