// The Surfer's unavoidable cast: game code becomes a short, playable piece of
// the night and the recorder is the only way back out. No dialogue explains
// this. The code slab, lossy old room, playerShadow and transport do the work.

import { uiFill, uiLine, uiSize, uiText } from '../render/ui.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';

export const SOURCE_REPRISE_BPM = 168;
export const SOURCE_REPRISE_RETURN_BEATS = 4;
export const SOURCE_REPRISE_RETURN_SECONDS = SOURCE_REPRISE_RETURN_BEATS * 60 / SOURCE_REPRISE_BPM;
export const SOURCE_REPRISE_JUMPSCARE_SECONDS = .24;
export const SOURCE_REPRISE_RECOGNITION_SECONDS = .72;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const text = (value) => String(value || '');
const point = (value) => Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y))
  ? { x:Number(value.x), y:Number(value.y) }
  : null;
const RECONSTRUCTION_FAULTS = Object.freeze([
  'ROOM HASH MISMATCH',
  'POSE GAP',
  'FRAME DROP',
  'GEOMETRY SUBSTITUTE',
  'ACTOR ID COLLISION',
  'TAKE CRC INVALID',
]);
const MOVEMENT_CORRUPTION = Object.freeze({
  'call-site': { base:.13, cap:86 },
  'borrowed-body': { base:.40, cap:61 },
  'final-clause': { base:.68, cap:36 },
});

function movementDirection(event = {}) {
  const action = String(event.controllerAction || '');
  if (action === 'move_up') return 1;
  if (action === 'move_down') return -1;
  const key = String(event.code || event.key || '').toLowerCase();
  if (['arrowup', 'keyw', 'w'].includes(key)) return 1;
  if (['arrowdown', 'keys', 's'].includes(key)) return -1;
  return 0;
}

function isRecord(event = {}) {
  const key = String(event.code || event.key || '').toLowerCase();
  return key === 'keyr' || key === 'r' || event.controllerAction === 'record';
}

function normalizeFrame(value, fallback = {}) {
  const at = point(value) || point(fallback);
  if (!at) return null;
  return {
    ...at,
    floorH:Number.isFinite(Number(value?.floorH)) ? Number(value.floorH) : Number(fallback?.floorH) || 0,
    roomId:text(value?.roomId || fallback?.roomId),
    renderGroup:text(value?.renderGroup || fallback?.renderGroup),
    spaceId:text(value?.spaceId || fallback?.spaceId || 'conservatory'),
    yaw:Number.isFinite(Number(value?.yaw)) ? Number(value.yaw) : Number(fallback?.yaw) || 0,
  };
}

function routeFor(plan = {}) {
  const movement = MOVEMENT_CORRUPTION[plan.id] || MOVEMENT_CORRUPTION['final-clause'];
  const segments = Array.isArray(plan.segments) ? plan.segments : [];
  return segments.map((segment, index) => {
    const supplied = (Array.isArray(segment.frames) ? segment.frames : [])
      .map((frame) => normalizeFrame(frame, { roomId:segment.roomId }))
      .filter(Boolean);
    const mark = normalizeFrame(segment.mark || segment.locus || supplied.at(-1), supplied.at(-1) || {
      roomId:segment.roomId,
    });
    const frames = [...supplied];
    if (mark && (!frames.length || Math.hypot(frames.at(-1).x - mark.x, frames.at(-1).y - mark.y) > .05)) frames.push(mark);
    // Sparse evidence is visibly worse, and later movements cannot look cleaner
    // merely because they happen to have more samples. Even the first reprise
    // tops out below 100: this is compiled from a route, never restored from one.
    const evidenceIntegrity = segment.fallback || supplied.length === 0
      ? 18
      : Math.round(clamp(32 + supplied.length / 96 * 54, 32, 86));
    const corruption = clamp(movement.base + index * .045, 0, .92);
    const integrity = Math.max(8, Math.min(evidenceIntegrity, movement.cap - index * 3));
    return {
      ...segment,
      index,
      frames,
      mark,
      integrity,
      corruption,
      reconstruction:'lossy',
      // Twelve deliberate presses at most per recovered place. It is a played
      // return to the mark, not a movie and not the whole game back-to-back.
      steps:clamp(Math.ceil(Math.max(1, frames.length) / 8), 4, 12),
    };
  });
}

function routePose(segment, step) {
  const frames = segment?.frames || [];
  if (!frames.length) return null;
  if (frames.length === 1) return { ...frames[0] };
  const scaled = clamp(step / Math.max(1, segment.steps), 0, 1) * (frames.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(frames.length - 1, Math.ceil(scaled));
  const mix = scaled - lo;
  const a = frames[lo], b = frames[hi];
  return {
    x:a.x + (b.x - a.x) * mix,
    y:a.y + (b.y - a.y) * mix,
    floorH:a.floorH + (b.floorH - a.floorH) * mix,
    roomId:b.roomId || a.roomId,
    renderGroup:b.renderGroup || a.renderGroup,
    spaceId:b.spaceId || a.spaceId || 'conservatory',
    yaw:a.yaw + (b.yaw - a.yaw) * mix,
  };
}

function projectedPose(segment, step, box) {
  const frames = segment?.frames || [];
  const frame = routePose(segment, step);
  if (frame && frames.length > 1) {
    const xs = frames.map((entry) => entry.x);
    const ys = frames.map((entry) => entry.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return {
      x:Math.round(box.x + clamp((frame.x - minX) / Math.max(.01, maxX - minX), 0, 1) * Math.max(1, box.w - 1)),
      y:Math.round(box.y + clamp((frame.y - minY) / Math.max(.01, maxY - minY), 0, 1) * Math.max(1, box.h - 1)),
    };
  }
  const progress = clamp(step / Math.max(1, segment?.steps), 0, 1);
  return { x:Math.round(box.x + progress * Math.max(1, box.w - 1)), y:box.y + Math.floor(box.h / 2) };
}

function segmentLabel(segment, roomLabel) {
  if (segment?.kind === 'recording-room') return roomLabel(segment.roomId).toUpperCase();
  if (segment?.kind === 'battle-space') return `${text(segment.id).replace('battle:', '')} / FIGHT`.toUpperCase();
  if (segment?.kind === 'hush-contact') return 'FIRST CONTACT';
  if (segment?.kind === 'source-threshold') return 'SOURCE THRESHOLD';
  return text(segment?.kind || 'record mark').replaceAll('-', ' ').toUpperCase();
}

export function makeSourceRepriseScene({
  plan,
  roomLabel = (id) => text(id).replaceAll('_', ' '),
  worldBacked = false,
  reducedMotion = false,
  reducedFlash = false,
  onDryClick = () => {},
  onSeam = () => {},
  onShadowFrame = () => {},
  onCommit = () => {},
  onDone = () => {},
  onExit = () => {},
} = {}) {
  const route = routeFor(plan);
  let phase = 'cast';
  let elapsed = 0;
  let segmentIndex = 0;
  let step = 0;
  let dryClick = 0;
  let committed = false;
  let returned = false;
  let exited = false;
  let heldDirection = 0;
  let walkAccumulator = 0;
  let seamFlash = 0;

  const segment = () => route[Math.min(segmentIndex, Math.max(0, route.length - 1))] || null;
  const atMark = () => phase === 'armed';
  const fault = () => RECONSTRUCTION_FAULTS[
    (segmentIndex * 3 + Math.floor(elapsed * (reducedMotion ? 2 : 7))) % RECONSTRUCTION_FAULTS.length
  ];
  const pose = () => routePose(segment(), step);
  const shadowPose = () => {
    const current = segment();
    if (!current) return null;
    const ahead = phase === 'recognition' || phase === 'armed'
      ? current.steps
      : Math.min(current.steps, step + Math.max(1, Math.round(current.steps * .2)));
    const frame = routePose(current, ahead);
    if (!frame) return null;
    const turn = phase === 'recognition'
      ? clamp(elapsed / SOURCE_REPRISE_RECOGNITION_SECONDS, 0, 1)
      : phase === 'armed' ? 1 : 0;
    return { ...frame, yaw:frame.yaw + Math.PI * turn, sourceResolve:turn };
  };
  const syncShadow = () => onShadowFrame(shadowPose());

  function armOrAdvance() {
    const current = segment();
    if (!current) { phase = 'recognition'; elapsed = 0; syncShadow(); return; }
    if (step < current.steps) return;
    if (segmentIndex < route.length - 1) {
      const from = current;
      segmentIndex += 1;
      step = 0;
      elapsed = 0;
      seamFlash = reducedFlash ? .16 : .28;
      onSeam({ from:from.id || '', to:segment()?.id || '', index:segmentIndex, corruption:segment()?.corruption || 0 });
      syncShadow();
      return;
    }
    phase = 'recognition';
    elapsed = 0;
    syncShadow();
  }

  function pressRecord() {
    if (!atMark() || committed) {
      dryClick = .16;
      onDryClick();
      return true;
    }
    committed = true;
    phase = 'jumpscare';
    elapsed = 0;
    onShadowFrame(null);
    // The checkpoint write happens before the scare. If the process dies on
    // the next frame, reload resumes the target movement rather than replaying
    // an already-completed coercion.
    onCommit({ id:plan?.id || '', returnSeconds:SOURCE_REPRISE_RETURN_SECONDS });
    return true;
  }

  function walk(direction) {
    step = clamp(step + direction, 0, segment()?.steps || 0);
    syncShadow();
    armOrAdvance();
  }

  return {
    id:`source-reprise:${plan?.id || 'unknown'}`,
    blocksInput:true,
    blocksWorld:true,
    tracksMotion:true,
    allowsLook:true,
    suppressesHud:true,
    worldPresentation:worldBacked ? 'visible' : 'hidden',

    enter() { syncShadow(); },
    exit() {
      if (exited) return;
      exited = true;
      onShadowFrame(null);
      onExit({ id:plan?.id || '', completed:returned });
    },

    worldView() {
      const current = pose() || segment()?.mark;
      if (!worldBacked || !current) return null;
      return {
        x:current.x,
        y:current.y,
        floorH:current.floorH,
        roomId:current.roomId || segment()?.roomId || '',
        suppressActors:true,
        sensoryProfile:'source-reprise',
      };
    },

    view() {
      const current = segment();
      return {
        id:plan?.id || '',
        phase,
        segmentIndex,
        segmentCount:route.length,
        segment:current ? { ...current, frames:[...current.frames] } : null,
        step,
        steps:current?.steps || 0,
        shadowStep:current ? Math.min(current.steps, step + Math.max(1, Math.round(current.steps * .2))) : 0,
        pose:pose(),
        shadowPose:shadowPose(),
        atMark:atMark(),
        committed,
        reconstruction:'lossy',
        integrity:current?.integrity || 0,
        corruption:current?.corruption || MOVEMENT_CORRUPTION[plan?.id]?.base || .7,
        fault:fault(),
        seamFlash,
        elapsed,
      };
    },

    update(dt) {
      const delta = Math.max(0, Number(dt) || 0);
      elapsed += delta;
      dryClick = Math.max(0, dryClick - delta);
      seamFlash = Math.max(0, seamFlash - delta);
      if (phase === 'traverse' && heldDirection) {
        walkAccumulator += delta;
        while (walkAccumulator >= .18 && phase === 'traverse') {
          walkAccumulator -= .18;
          walk(heldDirection);
        }
      }
      if (phase === 'cast' && elapsed >= .72) { phase = 'unfold'; elapsed = 0; }
      else if (phase === 'unfold' && elapsed >= .62) {
        phase = route.length ? 'traverse' : 'recognition';
        elapsed = 0;
        syncShadow();
      } else if (phase === 'recognition') {
        syncShadow();
        if (elapsed >= SOURCE_REPRISE_RECOGNITION_SECONDS) { phase = 'armed'; elapsed = 0; syncShadow(); }
      } else if (phase === 'jumpscare' && elapsed >= SOURCE_REPRISE_JUMPSCARE_SECONDS) { phase = 'rupture'; elapsed = 0; }
      // R starts one four-beat count shared with the score. The white-frame
      // scare occupies its head; it is not added on top of the four beats.
      else if (phase === 'rupture' && elapsed >= SOURCE_REPRISE_RETURN_SECONDS - SOURCE_REPRISE_JUMPSCARE_SECONDS && !returned) {
        returned = true;
        onDone({ id:plan?.id || '' });
      }
    },

    key(event) {
      if (isRecord(event)) return pressRecord();
      if (phase !== 'traverse') return true;
      const direction = movementDirection(event);
      if (!direction) return true;
      heldDirection = direction;
      if (!event.repeat) { walkAccumulator = 0; walk(direction); }
      return true;
    },

    keyup(event) {
      if (movementDirection(event)) {
        heldDirection = 0;
        walkAccumulator = 0;
        return true;
      }
      return false;
    },

    pointer() {
      if (phase === 'armed') pressRecord();
      else if (phase === 'traverse') walk(1);
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      const pulse = Math.floor(elapsed * (reducedMotion ? 4 : 18)) % 2;
      const current = segment();
      const label = segmentLabel(current, roomLabel);
      const takeNumber = current?.takeOrdinal || current?.index + 1 || 1;

      if (phase === 'cast') {
        uiFill(0, 0, cols, rows, 'rgba(1,2,3,0.99)');
        const progress = clamp(elapsed / .72, 0, 1);
        const slabW = Math.max(28, Math.min(cols - 4, Math.floor(cols * .66)));
        const slabX = Math.round(cols + 2 - progress * (cols * .5 + slabW * .5));
        const slabY = Math.max(2, Math.floor(rows * .23));
        uiFill(slabX, slabY, slabW, Math.max(9, Math.floor(rows * .42)), 'rgba(214,214,199,0.94)');
        uiText(slabX + 2, slabY + 1, 'SOURCE.throw(game.code)', 'ui-danger');
        uiText(slabX + 2, slabY + 3, `recordAction("${text(plan?.id || 'reprise')}")`, 'ui-ink');
        uiText(slabX + 2, slabY + 5, `roll({ take:${takeNumber}, room:"${text(current?.roomId || 'unknown')}" })`, 'ui-ink');
        uiText(slabX + 2, slabY + 7, `return playerShadow // ${label}`, 'ui-danger');
        uiText(Math.max(1, slabX - 3), slabY + 2, '///', 'ui-danger', .8);
        return;
      }
      if (phase === 'jumpscare') {
        uiFill(0, 0, cols, rows, reducedFlash ? 'rgba(224,224,211,0.92)' : 'rgba(248,248,235,0.995)');
        const face = pulse || reducedMotion ? ['██    ██', '  ████  ', '██ ██ ██', ' SOURCE '] : ['  ████  ', '██ ██ ██', '  ████  ', 'SURFER()'];
        face.forEach((line, index) => uiText(Math.floor((cols - line.length) / 2), Math.floor(rows / 2) - 2 + index, line, 'ui-danger'));
        return;
      }
      if (phase === 'rupture') {
        uiFill(0, 0, cols, rows, 'rgba(1,2,3,0.99)');
        const beat = Math.min(SOURCE_REPRISE_RETURN_BEATS - 1, Math.floor(elapsed / (60 / SOURCE_REPRISE_BPM)));
        uiText(Math.floor(cols / 2) - 6, Math.floor(rows / 2), `${'■'.repeat(beat + 1)}${'□'.repeat(SOURCE_REPRISE_RETURN_BEATS - beat - 1)}`, 'ui-danger');
        const stride = reducedMotion ? 6 : 3;
        for (let y = 2; y < rows - 2; y += stride) uiLine((y + beat * 7) % Math.max(1, cols), y, cols - 1, y, 'rgba(255,70,45,0.20)');
        return;
      }

      // The code unfolds into an actual room underneath this layer. The first
      // reprise is almost intact; later movements leave more rejected geometry,
      // doubled labels and code fragments over the same recognisable props.
      if (!worldBacked) uiFill(0, 0, cols, rows, 'rgba(1,2,3,0.99)');
      if (phase === 'unfold') {
        const cover = 1 - clamp(elapsed / .62, 0, 1);
        uiFill(0, 0, cols, rows, `rgba(1,2,3,${(.12 + cover * .86).toFixed(3)})`);
        const tearY = Math.floor(rows * (.28 + clamp(elapsed / .62, 0, 1) * .34));
        uiText(1, tearY, `${'\\/ '.repeat(Math.ceil(cols / 3)).slice(0, cols - 2)}`, 'ui-danger', .42);
      }

      const header = text(plan?.id || 'source').replaceAll('-', ' ').toUpperCase();
      uiFill(0, 0, cols, 5, 'rgba(1,2,3,0.80)');
      uiFill(0, rows - 5, cols, 5, 'rgba(1,2,3,0.84)');
      uiText(2, 1, `SOURCE // ${header}`, 'ui-danger');
      uiText(Math.max(2, cols - 32), 1, 'RECOMPILED / NON-IDENTICAL', 'ui-secondary', .82);
      uiText(2, 3, `${String(segmentIndex + 1).padStart(2, '0')}/${String(Math.max(1, route.length)).padStart(2, '0')}  ${label} // ${current?.integrity || 0}%`, 'ui-primary');
      uiText(Math.max(2, cols - fault().length - 2), 3, fault(), 'ui-danger', pulse ? .94 : .62);

      const corruption = current?.corruption || .7;
      const glitchCount = reducedMotion ? Math.max(1, Math.round(corruption * 3)) : Math.max(1, Math.round(corruption * 8));
      for (let index = 0; index < glitchCount; index += 1) {
        const row = 6 + ((index * 11 + segmentIndex * 7 + Math.floor(elapsed * (reducedMotion ? 2 : 9))) % Math.max(1, rows - 13));
        const width = Math.max(8, Math.floor(cols * (.08 + corruption * .14)));
        const left = (index * 19 + segmentIndex * 13) % Math.max(1, cols - width);
        uiFill(left, row, width, 1 + (index % 2), `rgba(255,42,35,${(.04 + corruption * .12).toFixed(3)})`);
        uiText(left, row, (index % 2 ? 'NULL_GEOMETRY//' : 'FRAME_REJECTED//').slice(0, width), 'ui-danger', .20 + corruption * .28);
      }
      if (corruption > .3) uiText(4 + (segmentIndex * 9) % Math.max(1, cols - label.length - 8), 6 + segmentIndex * 3, label, 'ui-blue', .12 + corruption * .18);
      if (corruption > .6) uiText(Math.max(2, cols - 34), Math.max(7, rows - 9), `recordAction(${takeNumber}) != history`, 'ui-danger', .42);

      if (seamFlash > 0) {
        uiFill(0, Math.floor(rows * .42), cols, 3, 'rgba(255,70,45,0.25)');
        uiText(Math.max(2, Math.floor((cols - 31) / 2)), Math.floor(rows * .42) + 1, 'SEGMENT RECOMPILE // CRC FAIL', 'ui-danger');
      }

      if (phase === 'recognition') {
        const resolve = clamp(elapsed / SOURCE_REPRISE_RECOGNITION_SECONDS, 0, 1);
        const collision = resolve < .55 ? 'PLAYER SHADOW' : resolve < .9 ? 'PLAYER SHADOW // SOURCE' : 'SOURCE';
        uiFill(Math.max(0, Math.floor(cols * .31)), Math.floor(rows * .44), Math.floor(cols * .38), 3, 'rgba(1,2,3,0.76)');
        uiText(Math.floor((cols - collision.length) / 2), Math.floor(rows * .44) + 1, collision, resolve > .5 ? 'ui-danger' : 'ui-blue');
      }

      const transport = phase === 'armed'
        ? 'SOURCE COPY  /  PLAY >  /  ● PUNCH IN'
        : phase === 'recognition'
          ? 'SOURCE COPY  /  PLAY >  /  ACTOR ID COLLISION'
          : 'SOURCE COPY  /  PLAY >  /  REC LOCKED';
      uiText(2, rows - 4, transport, phase === 'armed' ? 'ui-amber' : 'ui-secondary', phase === 'armed' ? 1 : .68);
      const action = activeInputPromptDevice() === 'controller'
        ? promptLine([{ action:'record', label:'PUNCH IN' }])
        : '[R] PUNCH IN';
      if (phase === 'armed') uiText(Math.max(2, cols - action.length - 2), rows - 4, action, pulse ? 'ui-danger' : 'ui-amber');
      else if (phase === 'traverse') uiText(Math.max(2, cols - 25), rows - 4, '[W/S] FOLLOW THE SHADOW', 'ui-secondary', .76);
      if (dryClick > 0) uiText(Math.floor(cols / 2) - 3, rows - 2, '—click—', 'ui-secondary', .45);

      // Text-only fallback retains a traversable route if the 3D room is not
      // available (tests, WebGL failure, or an incomplete legacy save).
      if (!worldBacked && current) {
        const box = { x:4, y:6, w:Math.max(12, cols - 8), h:Math.max(6, rows - 13) };
        const body = projectedPose(current, step, box);
        const shadow = projectedPose(current, Math.min(current.steps, step + 2), box);
        uiText(shadow.x, shadow.y, '◇', 'ui-blue', .72);
        uiText(body.x, body.y, '◆', 'ui-primary');
      }
    },
  };
}
