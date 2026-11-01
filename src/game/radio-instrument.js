import { RADIO_CHANNELS, RADIO_DESK_CHANNEL, RADIO_HIDDEN_CHANNEL, RADIO_CHANNEL_SETTLE } from '../render/radio-contact-performance.js';
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));

// Mechanical input and receive-only discovery. The conversation remains the
// sole owner of speech, transmission, contact choices and permanent failure.
export function createRadioInstrument({ onControl, onVolume, onTuneAway, onEgg,
  canEgg = () => false, eggHeard = () => false } = {}) {
  let channel = RADIO_DESK_CHANNEL, volume = .75, time = 0, changedAt = 0;
  let interaction = null, held = false, until = 0, pending = false, attempted = false, played = false;
  let suspended = false, disposed = false, generation = 0, needsRelease = false, wasDead = false;
  function press(id, { hold = false, direction } = {}) {
    if (disposed || suspended) return false;
    if (needsRelease) onControl?.('release', { id: interaction });
    interaction = id; held = hold; until = time + .12;
    onControl?.(id === 'channel' ? 'channel' : id === 'battery' ? 'battery' : 'press', { id, ...(direction == null ? {} : { direction }) });
    needsRelease = !['channel', 'battery'].includes(id);
    return true;
  }
  function release() {
    if (held && needsRelease) { onControl?.('release', { id: interaction }); needsRelease = false; }
    held = false;
  }
  function tune(direction, allowed) {
    if (!allowed || disposed || suspended) { onControl?.('denied'); return false; }
    press('channel', { direction }); channel = (channel - 1 + (direction < 0 ? -1 : 1) + RADIO_CHANNELS) % RADIO_CHANNELS + 1;
    changedAt = time; attempted = false; generation++; pending = false; played = false;
    onTuneAway?.(); return true;
  }
  function adjustVolume(direction) {
    if (disposed || suspended) return false;
    press('volume'); volume = clamp(Math.round((volume + (direction < 0 ? -.25 : .25)) * 4) / 4);
    onVolume?.(volume); if (!volume) { generation++; pending = false; played = false; onTuneAway?.(); }
    return true;
  }
  return {
    press, release, tune, adjustVolume,
    update(dt, { quiet = false, dead = false } = {}) {
      if (disposed || suspended) return;
      time += Math.max(0, Math.min(.1, Number(dt) || 0));
      if (!held && time >= until) { if (needsRelease) onControl?.('release', { id: interaction }); needsRelease = false; interaction = null; }
      if (dead) { if (!wasDead) { generation++; pending = false; played = false; onTuneAway?.(); } wasDead = true; return; }
      if (!quiet || volume === 0 || channel !== RADIO_HIDDEN_CHANNEL || attempted || pending || played
        || eggHeard() || time - changedAt < RADIO_CHANNEL_SETTLE || !canEgg()) return;
      attempted = true; pending = true; const ticket = generation;
      let request;
      try { request = onEgg?.(); } catch (_) { pending = false; return; }
      Promise.resolve(request).then(started => {
        if (disposed || suspended || ticket !== generation) return;
        pending = false; played = !!started;
      }).catch(() => { if (ticket === generation) pending = false; });
    },
    eggEnded() { played = false; },
    suspend() { release(); needsRelease = false; suspended = true; generation++; pending = false; played = false; interaction = null; onTuneAway?.(); },
    resume() { if (!disposed) suspended = false; },
    stop() { if (disposed) return; this.suspend(); disposed = true; },
    view() { return { channel, volume, eggPlaying: played, interaction: { id: interaction, pressure: interaction && (held || time < until) ? 1 : 0 } }; },
  };
}
