import { normalizeAcousticEvent } from '../audio/acoustic-events.js';

const event = (kind, levelDb, source = { x: 4, y: 4 }, roomId = 'main_b3') => normalizeAcousticEvent({
  kind,
  source: { kind: 'player', id: 'player' },
  spatial: { roomId, floorId: 'b1', position: source },
  acoustic: levelDb == null ? {} : { levelDb },
  semantics: { audibleToHush: true, playerGenerated: true },
  provenance: { system: 'hush-audio-lab' },
});

export const HUSH_AUDIO_CASES = Object.freeze([
  { id: 'quiet-baseline', label: 'QUIET BASELINE', event: null, hush: { x: 28, y: 4 }, player: { x: 4, y: 4 }, pressure: 'standard' },
  { id: 'walk-same-room', label: 'WALK / SAME ROOM', event: event('footstep_walk'), hush: { x: 18, y: 4 }, player: { x: 4, y: 4 }, pressure: 'standard' },
  { id: 'bag-adjacent', label: 'BAG / ADJACENT ROOM', event: event('bag_rummage', -25, { x: 4, y: 4 }, 'main_b3'), hush: { x: 22, y: 4, roomId: 'b1_corridor' }, player: { x: 4, y: 4 }, pressure: 'standard', occlusionDb: 9 },
  { id: 'radio-lock', label: 'RADIO / LOCK', event: event('radio_squelch'), hush: { x: 26, y: 4 }, player: { x: 4, y: 4 }, pressure: 'standard' },
  { id: 'playful', label: 'PLAYFUL IMITATION', event: event('recorder_transport', -24), hush: { x: 14, y: 4 }, player: { x: 4, y: 4 }, pressure: 'standard', seedAudition: { interest: .58, certainty: .66, agitation: .18, playfulness: .82 } },
  { id: 'near-field', label: 'NEAR FIELD', event: null, hush: { x: 8, y: 4 }, player: { x: 4, y: 4 }, pressure: 'standard' },
  { id: 'engulf', label: 'ENGULF', event: null, hush: { x: 4.8, y: 4 }, player: { x: 4, y: 4 }, pressure: 'standard' },
  { id: 'reduced-effects', label: 'REDUCED EFFECTS', event: null, hush: { x: 5.3, y: 4 }, player: { x: 4, y: 4 }, pressure: 'standard', settings: { hushAudioDistortion: 'reduced', hushSilence: 'reduced', hushHiss: 'reduced', hushLightFlicker: 'reduced', hushSuddenCuts: 'softened' } },
  { id: 'dead-air', label: 'DEAD AIR', event: event('page_turn', -45), hush: { x: 16, y: 4 }, player: { x: 4, y: 4 }, pressure: 'dead-air' },
]);
