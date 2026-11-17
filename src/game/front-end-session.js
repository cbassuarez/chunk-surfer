import {
  FRONT_END_PLATE_PRESETS,
  interpolateFrontEndPlate,
  normalizeFrontEndPlate,
} from '../render/front-end-plate.js';
import { handoffFor } from './run-launch-plan.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const remap = (value, start, end) => (
  clamp01((value - start) / Math.max(0.0001, end - start))
);

export const FRONT_END_STATE = Object.freeze({
  PREPARING: 'preparing',
  CREDITS: 'credits',
  TITLE: 'title',
  CAPTURING: 'capturing',
  PREFLIGHT: 'preflight',
  IRIS_CLOSING: 'iris-closing',
  BLACK: 'black',
  IRIS_OPENING: 'iris-opening',
  LIFTING: 'lifting',
  LIVE: 'live',
  FAILED_SAFE: 'failed-safe',
  DISPOSED: 'disposed',
});

// Shared with the in-conversation transition study. There is no camera travel:
// two exposures find register while the real case leaves, or separate as it
// arrives. Reduced motion keeps a simple, concurrent dissolve.
export function frontEndMenuEnvelope(progress,{direction='leave',reducedMotion=false}={}){
  const clamp=x=>Math.max(0,Math.min(1,Number(x)||0));
  const ease=x=>{const p=clamp(x);return p*p*(3-2*p);};
  const between=(start,end)=>ease((clamp(progress)-start)/(end-start));
  if(reducedMotion){const p=ease(progress),signal=direction==='enter'?p:1-p;return{signal,menuAlpha:signal,hudAlpha:1-signal};}
  if(direction==='enter')return{signal:between(0,.78),menuAlpha:between(.18,.90),hudAlpha:1-between(0,.30)};
  return{signal:1-between(.08,.92),menuAlpha:1-between(0,.42),hudAlpha:between(.48,.98)};
}

export class FrontEndSession {
  constructor({ plan = null, reducedMotion = false } = {}) {
    this.plan = plan;
    this.state = FRONT_END_STATE.PREPARING;
    this.reducedMotion = !!reducedMotion;
    this.cameraReady = false;
    this.cameraExact = !!plan?.exact;
    this.commitLatch = false;
    this.transitionElapsed = 0;
    this.transitionDuration = this.reducedMotion ? 0.30 : 0.72;
    this.menuAlpha = 1;
    this.panelAlpha = 1;
    this.hudAlpha = 0;
    this.inputReady = false;
    this.plate = normalizeFrontEndPlate(FRONT_END_PLATE_PRESETS.credits);
    this.iris = 0;
  }

  setPlan(plan) {
    if (this.state === FRONT_END_STATE.DISPOSED) return false;
    this.plan = plan || null;
    this.cameraExact = !!plan?.exact;
    return true;
  }

  markCameraReady({ exact = this.plan?.exact !== false } = {}) {
    this.cameraReady = true;
    this.cameraExact = !!exact;
    return true;
  }

  failSafe() {
    this.cameraReady = false;
    this.cameraExact = false;
    this.state = FRONT_END_STATE.FAILED_SAFE;
    this.plate = normalizeFrontEndPlate(FRONT_END_PLATE_PRESETS.fallback);
  }

  enterCredits() {
    if (this.state === FRONT_END_STATE.DISPOSED) return false;
    this.state = FRONT_END_STATE.CREDITS;
    this.plate = normalizeFrontEndPlate(FRONT_END_PLATE_PRESETS.credits);
    this.menuAlpha = 1;
    this.hudAlpha = 0;
    return true;
  }

  enterTitle({fromGameplay=false}={}) {
    if (this.state === FRONT_END_STATE.DISPOSED) return false;
    const capture=fromGameplay&&this.cameraReady&&this.cameraExact;
    this.state = capture?FRONT_END_STATE.CAPTURING:FRONT_END_STATE.TITLE;
    this.transitionElapsed=0;
    this.plate = normalizeFrontEndPlate(
      capture?FRONT_END_PLATE_PRESETS.gameplay:this.cameraReady ? FRONT_END_PLATE_PRESETS.title : FRONT_END_PLATE_PRESETS.fallback,
    );
    this.menuAlpha = capture?0:1;
    this.panelAlpha=this.menuAlpha;
    this.hudAlpha = 0;
    return true;
  }

  backdropAffinity() {
    if (!this.cameraReady || !this.cameraExact) {
      return this.plan?.affinity ? { ...this.plan.affinity, exact: false } : null;
    }
    return this.plan?.affinity || null;
  }

  affinity() {
    return this.backdropAffinity();
  }

  handoff(destination) {
    return handoffFor({ backdrop: this.backdropAffinity(), destination });
  }

  beginLift() {
    if (this.state === FRONT_END_STATE.LIFTING || this.state === FRONT_END_STATE.LIVE) {
      return false;
    }
    this.state = FRONT_END_STATE.LIFTING;
    this.liftFromPlate={...this.plate};
    this.liftFromAlpha=this.menuAlpha;
    this.transitionElapsed = 0;
    this.commitLatch = true;
    this.inputReady = false;
    return true;
  }

  beginIrisClose() {
    if (this.state === FRONT_END_STATE.IRIS_CLOSING) return false;
    this.state = FRONT_END_STATE.IRIS_CLOSING;
    this.commitLatch = true;
    this.iris = 0;
    return true;
  }

  setBlack() {
    this.state = FRONT_END_STATE.BLACK;
    this.iris = 1;
  }

  markBlack() {
    this.setBlack();
  }

  beginIrisOpen() {
    this.state = FRONT_END_STATE.IRIS_OPENING;
    this.iris = 1;
  }

  markLive() {
    this.state = FRONT_END_STATE.LIVE;
    this.plate = normalizeFrontEndPlate(FRONT_END_PLATE_PRESETS.gameplay);
    this.menuAlpha = 0;
    this.panelAlpha = 0;
    this.hudAlpha = 1;
    this.inputReady = true;
  }

  update(dt = 0) {
    const step = Math.max(0, Number(dt) || 0);
    if (this.state !== FRONT_END_STATE.LIFTING&&this.state!==FRONT_END_STATE.CAPTURING) return this.snapshot();

    this.transitionElapsed += step;
    const t = clamp01(this.transitionElapsed / Math.max(0.001, this.transitionDuration));
    if(this.state===FRONT_END_STATE.CAPTURING){
      const envelope=frontEndMenuEnvelope(t,{direction:'enter',reducedMotion:this.reducedMotion});
      this.plate=interpolateFrontEndPlate(FRONT_END_PLATE_PRESETS.gameplay,FRONT_END_PLATE_PRESETS.title,envelope.signal);
      this.menuAlpha=this.panelAlpha=envelope.menuAlpha;
      this.hudAlpha=0;this.inputReady=false;
      if(t>=1)this.state=FRONT_END_STATE.TITLE;
      return this.snapshot();
    }
    const envelope=frontEndMenuEnvelope(t,{reducedMotion:this.reducedMotion});
    this.menuAlpha = this.liftFromAlpha*envelope.menuAlpha;
    this.panelAlpha = this.menuAlpha;
    this.plate = interpolateFrontEndPlate(
      this.liftFromPlate,
      FRONT_END_PLATE_PRESETS.gameplay,
      1-envelope.signal,
    );
    this.hudAlpha = envelope.hudAlpha;
    this.inputReady = t >= 0.90;

    if (t >= 1) this.markLive();
    return this.snapshot();
  }

  dispose() {
    this.state = FRONT_END_STATE.DISPOSED;
    this.cameraReady = false;
    this.inputReady = false;
  }

  snapshot() {
    return {
      state: this.state,
      planKind: this.plan?.kind || null,
      cameraReady: this.cameraReady,
      cameraExact: this.cameraExact,
      affinity: this.backdropAffinity(),
      plate: { ...this.plate },
      menuAlpha: this.menuAlpha,
      panelAlpha: this.panelAlpha,
      hudAlpha: this.hudAlpha,
      inputReady: this.inputReady,
      iris: this.iris,
      committed: this.commitLatch,
    };
  }
}
