// Scene stack. The world keeps rendering underneath; scenes layer on top.
//
// A scene is { id, enter?, exit?, update?(dt), render?(), key?(e)->bool,
//              blocksInput?:bool, blocksWorld?:bool, lensPreset?:string }
//
// `blocksInput` stops the player walking (dialogue, menus). `blocksWorld`
// additionally freezes world simulation (the hush keeps hunting during
// dialogue unless a scene says otherwise — which is a rule we break exactly
// once, on purpose, in M4).

const stack = [];
let onLensPreset = () => {};

export function scenesInit({ applyLensPreset } = {}) {
  if (applyLensPreset) onLensPreset = applyLensPreset;
}

function syncLens() {
  const preset = [...stack].reverse().find((s) => s.lensPreset)?.lensPreset || 'explore';
  onLensPreset(preset);
}

export function push(scene, params) {
  stack.push(scene);
  scene.enter?.(params);
  syncLens();
  return scene;
}

export function pop() {
  const s = stack.pop();
  s?.exit?.();
  syncLens();
  return s;
}

export function replace(scene, params) {
  while (stack.length) pop();
  return push(scene, params);
}

export function top() { return stack[stack.length - 1] || null; }
export function depth() { return stack.length; }
export function has(id) { return stack.some((s) => s.id === id); }

export function blocksInput() { return stack.some((s) => s.blocksInput); }
export function blocksWorld() { return stack.some((s) => s.blocksWorld); }

export function update(dt) {
  for (const s of stack) s.update?.(dt);
}

// Render bottom-up so a menu can sit over a dialogue box over the world.
export function render() {
  for (const s of stack) s.render?.();
}

// Top scene gets first refusal on every key.
export function key(e) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].key?.(e)) return true;
    if (stack[i].blocksInput) return true; // modal: swallow the rest
  }
  return false;
}
