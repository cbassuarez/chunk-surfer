// A presentation of the owning conversation clock, never a second cutscene.
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const RADIO_CHANNELS = 16;
export const RADIO_DESK_CHANNEL = 2;
export const RADIO_HIDDEN_CHANNEL = 13;
export const RADIO_CHANNEL_SETTLE = 1.4;

export function radioContactFrame(view = {}, { reducedMotion = false } = {}) {
  const radio = view.radio || {}, instrument = radio.instrument || {};
  const time = Math.max(0, Number(radio.time) || 0), age = Math.max(0, Number(radio.age) || 0);
  const stage = radio.stage || 'live', dead = !!radio.dead || ['break', 'after'].includes(stage);
  const interaction = instrument.interaction || { id: null, pressure: 0 };
  // Authored 'you' is an inner thought; only 'me' is offered as spoken speech.
  const speaking = String(view.who).toLowerCase() === 'me' && !view.pending && !!view.typing;
  const fault = !!radio.keyStuck || ['decision', 'reseat', 'still', 'break', 'after'].includes(stage);
  const loose = !!radio.seamRevealed || ['decision', 'reseat', 'still', 'break', 'after'].includes(stage);
  const pressing = interaction.id === 'ptt' ? interaction.pressure : 0;
  const keyAge = Number.isFinite(radio.keyAge) ? radio.keyAge : 1;
  const sinking = reducedMotion ? 1 : smooth(keyAge / .16);
  const withdrawal = reducedMotion ? 1 : smooth((keyAge - .16) / .25);
  const ptt = dead ? pressing : fault ? sinking : Math.max(pressing, speaking ? 1 : 0);
  const thumb = fault ? 1 - withdrawal : Math.max(pressing, speaking ? 1 : 0);
  const commitPressure = clamp((Number(radio.hold) || 0) / .65);
  const selectedReseat = view.pending?.options?.[view.pending.index]?.goto === 'reseat';
  const reseating = stage === 'reseat' ? smooth(age / .65) : selectedReseat ? commitPressure : 0;
  const batteryGap = !loose ? 0 : stage === 'reseat' ? 1 - reseating : stage === 'still' ? 1 : dead ? .75 : 1;
  const handAction = loose ? 'battery' : ['channel', 'volume'].includes(interaction.id) ? interaction.id : 'idle';
  const handPressure = handAction === 'battery' ? reseating : interaction.pressure;
  const channel = Math.max(1, Math.min(RADIO_CHANNELS, Math.round(instrument.channel || RADIO_DESK_CHANNEL)));
  const receiving = !dead && channel === RADIO_DESK_CHANNEL && !view.pending && ['radio', 'martin'].includes(String(view.who).toLowerCase());
  const carrier = dead ? 'off' : instrument.eggPlaying ? 'rx' : fault && stage !== 'reseat' ? 'weak' : speaking ? 'tx' : receiving ? 'rx' : 'off';
  return { time, stage, age, raise: reducedMotion ? 1 : smooth(time / .55), ptt, thumb,
    channel, volume: instrument.volume ?? .75, batteryGap, batteryPress: reseating,
    handAction, handPressure, dead, carrier, reducedMotion: !!reducedMotion, interaction,
    release: stage === 'after' ? (reducedMotion ? 1 : smooth(age / .8)) : 0 };
}
