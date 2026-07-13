//
//  bindings.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Binding labels and the persistent controller map. Keyboard bindings remain
// authored (the game uses code + key for layout/remote-input tolerance); pad
// buttons are genuinely remappable at runtime.

const DEFAULT_BINDINGS = Object.freeze({
  move: 'WASD / ARROWS',
  quiet: 'SHIFT',
  light: 'F',
  bag: 'B',
  recorder: 'R',
  interact: 'E',
  mark: 'SPACE',
  playback: 'P',
  menu: 'ESC',
  confirm: 'ENTER / SPACE',
  read: 'ENTER',
  back: 'ESC',
});

const PAD_DEFAULTS = Object.freeze({
  quiet: 'button4',
  light: 'button3',
  bag: 'button2',
  recorder: 'button7',
  interact: 'button0',
  playback: 'button1',
  menu: 'button9',
  confirm: 'button0',
  back: 'button1',
});

const PAD_NAMES = Object.freeze({
  button0: 'A / CROSS', button1: 'B / CIRCLE', button2: 'X / SQUARE', button3: 'Y / TRIANGLE',
  button4: 'LB / L1', button5: 'RB / R1', button6: 'LT / L2', button7: 'RT / R2',
  button8: 'VIEW / SHARE', button9: 'MENU / OPTIONS', button10: 'L3', button11: 'R3',
  button12: 'D-PAD UP', button13: 'D-PAD DOWN', button14: 'D-PAD LEFT', button15: 'D-PAD RIGHT',
  button16: 'HOME', button17: 'TOUCHPAD',
});
const PAD_GROUPS = Object.freeze([
  ['quiet','light','bag','recorder','interact','playback','menu'],
  ['confirm','back','menu'],
]);

let padBindings = { ...PAD_DEFAULTS };

export function setControllerBindings(next = {}) {
  padBindings = { ...PAD_DEFAULTS };
  for (const action of Object.keys(PAD_DEFAULTS)) {
    const token = next?.[action];
    if (/^button\d+$/.test(token || '')) padBindings[action] = token;
  }
  return controllerBindings();
}

export function setControllerBinding(action, token) {
  if (!(action in PAD_DEFAULTS) || !/^button\d+$/.test(token || '')) return false;
  const old=padBindings[action];
  for(const group of PAD_GROUPS){
    if(!group.includes(action))continue;
    const conflict=group.find((peer)=>peer!==action&&padBindings[peer]===token);
    if(conflict)padBindings[conflict]=old;
  }
  padBindings[action] = token;
  return true;
}

export function resetControllerBindings() {
  padBindings = { ...PAD_DEFAULTS };
  return controllerBindings();
}

export function controllerBindings() { return { ...padBindings }; }
export function controllerToken(action) { return padBindings[action] || null; }

export function controllerBindingLabel(action) {
  if (action === 'move') return 'LEFT STICK / D-PAD';
  return PAD_NAMES[controllerToken(action)] || String(controllerToken(action) || 'UNBOUND').toUpperCase();
}

export function bindingLabel(action) {
  return DEFAULT_BINDINGS[action] || String(action || '').toUpperCase();
}

export function formatBindingTip(text) {
  return String(text || '').replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, action) => bindingLabel(action));
}
