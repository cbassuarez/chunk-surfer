// Scene stack. The world keeps rendering underneath; scenes layer on top.
//
// A scene is { id, enter?, exit?, update?(dt), render?(), key?(e)->bool,
//              pointer?(e)->bool,
//              blocksInput?:bool, blocksWorld?:bool, tracksMotion?:bool,
//              allowsLook?:bool, suppressesHud?:bool,
//              lookProfile?:string, lensPreset?:string (legacy alias) }
//
// `blocksInput` stops the player walking (dialogue, menus). `blocksWorld`
// additionally freezes world simulation. `sourcePressureLive` is narrower: it
// marks an input-modal Source scene whose world/pressure must continue even
// though the player's locomotion is held.

const stack = [];
const listeners = new Set();
let onLookProfile = () => {};
let appliedLookProfile = null;

export function scenesInit({ applyLookProfile, applyLensPreset } = {}) {
  onLookProfile = applyLookProfile || applyLensPreset || onLookProfile;
  appliedLookProfile = null;
  syncLens();
}


function emitChange(reason, scene = null) {
  for (const fn of listeners) {
    try {
      fn({ reason, scene, depth: stack.length, top: top({ includeOverlay: true }) });
    } catch (err) {
      console.warn('[scenes] change listener failed', err);
    }
  }
}

export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function syncLens() {
  const scene = [...stack].reverse().find((s) => s.lookProfile || s.lensPreset);
  const profile = scene?.lookProfile || scene?.lensPreset || 'explore';
  if (profile === appliedLookProfile) return;
  appliedLookProfile = profile;
  onLookProfile(profile);
}

export function push(scene, params) {
  stack.push(scene);
  scene.enter?.(params);
  syncLens();
  emitChange('push', scene);
  return scene;
}

export function pop() {
  const s = stack.pop();
  s?.exit?.();
  stack[stack.length - 1]?.resume?.();
  syncLens();
  emitChange('pop', s);
  return s;
}

export function remove(sceneOrId) {
  const id = typeof sceneOrId === 'string' ? sceneOrId : sceneOrId?.id;
  const index = typeof sceneOrId === 'object'
    ? stack.indexOf(sceneOrId)
    : stack.findIndex((s) => s.id === id);
  if (index < 0) return null;
  const wasTop = index === stack.length - 1;
  const [s] = stack.splice(index, 1);
  s?.exit?.();
  if (wasTop) stack[stack.length - 1]?.resume?.();
  syncLens();
  emitChange('remove', s);
  return s;
}

export function replace(scene, params) {
  // Replacement is one scene transaction. Calling pop()/push() here used to
  // publish an intermediate `explore` profile, enqueueing a needless material
  // bank switch before the replacement scene's actual look was known.
  while (stack.length) stack.pop()?.exit?.();
  stack.push(scene);
  scene.enter?.(params);
  syncLens();
  emitChange('replace', scene);
  return scene;
}

export function top({ includeOverlay = false } = {}) {
  if (includeOverlay) return stack[stack.length - 1] || null;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!stack[i]?.overlay) return stack[i];
  }
  return null;
}
export function depth() { return stack.length; }
export function has(id) { return stack.some((s) => s.id === id); }

export function blocksInput() { return stack.some((s) => s.blocksInput); }
export function blocksWorld() { return stack.some((s) => s.blocksWorld); }
export function worldPresentation() {
  for (let i=stack.length-1;i>=0;i--) {
    const policy=stack[i]?.worldPresentation;
    if (policy==='visible'||policy==='hidden') return policy;
  }
  return 'visible';
}
export function suppressesHud() { return stack.some((s) => s.suppressesHud); }
export function tracksMotion() { return !!top()?.tracksMotion; }
// A tableau may hold the body while leaving the head alone. This is narrower
// than tracksMotion: it never records locomotion, it only keeps first-person
// pointer/right-stick look alive. A pause overlay on top revokes the lease.
export function allowsLook() { return !!top({ includeOverlay:true })?.allowsLook; }
export function worldView() { return top()?.worldView?.() || null; }

export function update(dt) {
  // A pause overlay freezes authored clocks beneath it as well as the world.
  // Settings opened from pause remain live because they sit above this index.
  const pauseIndex = stack.findIndex((scene) => scene.id === 'pause');
  const start = pauseIndex >= 0 ? pauseIndex : 0;
  // Scenes may complete/remove themselves from update(). Iterate a stable
  // frame snapshot so that shifting the live stack cannot skip the next scene,
  // and a newly-pushed replacement does not inherit the old scene's frame.
  const frameScenes = stack.slice(start);
  for (const scene of frameScenes) {
    if (stack.includes(scene)) scene.update?.(dt);
  }
}

// Render bottom-up so a menu can sit over a dialogue box over the world.
export function render() {
  const frameScenes = [...stack];
  for (const scene of frameScenes) {
    if (stack.includes(scene)) scene.render?.();
  }
}

// Top scene gets first refusal on every key.
export function key(e) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].key?.(e)) return true;
    if (stack[i].blocksInput) return true; // modal: swallow the rest
  }
  return false;
}


export function keyup(e) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].keyup?.(e)) return true;
    if (stack[i].blocksInput) return false;
  }
  return false;
}

// Pointer input is opt-in for behavior, but modal scenes still swallow pointer
// events so a UI click can never become a gameplay pointer-lock request.
export function pointer(e) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].pointer?.(e)) return true;
    if (stack[i].blocksInput) return true;
  }
  return false;
}
