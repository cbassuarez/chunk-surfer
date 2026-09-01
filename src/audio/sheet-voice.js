// WHAT A PAGE SOUNDS LIKE WHEN YOU HOLD IT UP.
//
// He reads a sheet and hears it. Not played — heard, the way everything in this
// building reaches him: through two floors, too far away, slower than it should
// be, with the top gone off it. It is the same vocabulary playFarSound already
// uses for the surfer's chopped takes (main.js) — heavy lowpass, quiet, panned
// wide, long decay — because it should be ambiguous whether the room is doing
// it or he is.
//
// IT IS A REAL PERFORMANCE. Each sheet carries an eleven-second excerpt of an
// actual person playing or singing it — Ishizaka's piano, a lute, a
// harpsichord, a woman's voice — all public domain, CC0 or CC BY (see
// third_party/licenses/SHEET-MUSIC-AUDIO.md). A synthesised approximation was
// built first and thrown away: four sine partials cannot be a soprano, and the
// whole effect depends on it being unmistakably a human being somewhere else
// in the building.
//
// THE SYNTH IS STILL HERE, as the fallback. A decode is asynchronous and can
// fail — no network on first run, a codec the browser will not take, a headless
// test with no AudioContext — and a page that makes no sound at all when he
// looks at it is worse than a page that makes the wrong sound. So the figure
// plays while the file is still arriving, and instead of it if it never does.
//
// IT IS NOT A MUSIC PLAYER. Eleven seconds and it stops. He is holding a page
// up in a torch beam, not sitting down to a recital.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

// A struck string, decaying. Fewer and gentler partials than the fireball's
// struck metal: this is gut and wood at a distance, not a bell in your face.
// The slight inharmonicity is real — a stiff string's overtones run sharp.
const PARTIALS = Object.freeze([
  Object.freeze({ ratio: 1,      gain: 1,   decay: 1 }),
  Object.freeze({ ratio: 2.003,  gain: .30, decay: .70 }),
  Object.freeze({ ratio: 3.011,  gain: .13, decay: .44 }),
  Object.freeze({ ratio: 4.028,  gain: .05, decay: .26 }),
]);

// How slow, and how far. SECONDS_PER_BEAT is deliberately funereal — every one
// of these pieces except the Bach is a lament, and the ones that are not are
// being played by a building.
export const SHEET_SECONDS_PER_BEAT = .30;
export const SHEET_CUTOFF_HZ = 900;

export const SHEET_AUDIO_BASE = 'audio/sheet-music';

export function createSheetVoice({ getAudio = null, gain = .13, fetchAudio = null } = {}) {
  let ctx = null;
  let master = null;
  let tail = null;
  let stopAt = 0;
  const buffers = new Map();   // audio id -> AudioBuffer
  const pending = new Set();   // audio ids currently decoding

  function rig() {
    const next = getAudio?.();
    if (!next?.ctx) return null;
    if (ctx !== next.ctx || !master) {
      ctx = next.ctx;
      master = ctx.createGain();
      master.gain.value = Math.max(0, Number(gain) || 0);
      // THE ROOM IT IS COMING FROM, WHICH IS NOT THIS ONE.
      //
      // A short feedback delay is a cheap corridor: enough repeats to smear the
      // note into the next one so the line arrives as a wash rather than as
      // eight identifiable events. Lowpassed inside the loop, so each pass
      // loses more top and the tail walks further away as it goes.
      tail = ctx.createDelay(1.2);
      tail.delayTime.value = .19;
      const feedback = ctx.createGain();
      feedback.gain.value = .42;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 620;
      const wet = ctx.createGain();
      wet.gain.value = .55;
      tail.connect(damp); damp.connect(feedback); feedback.connect(tail);
      damp.connect(wet); wet.connect(master);
      master.connect(next.destination || ctx.destination);
    }
    return { ctx, master, tail };
  }

  // Fetch and decode once per piece, then keep it. Five 88KB files is a third
  // of a megabyte, so nothing here is worth evicting.
  function load(id) {
    if (!id || buffers.has(id) || pending.has(id)) return;
    const audio = rig();
    if (!audio) return;
    const get = fetchAudio || ((url) => fetch(url).then((response) => response.arrayBuffer()));
    pending.add(id);
    Promise.resolve(get(`${SHEET_AUDIO_BASE}/${id}.mp3`))
      .then((bytes) => audio.ctx.decodeAudioData(bytes))
      .then((buffer) => { buffers.set(id, buffer); })
      // A page that will not decode falls back to its figure forever, quietly.
      .catch(() => {})
      .finally(() => pending.delete(id));
  }

  // The recording, put where the synth would have been: through the same
  // lowpass, the same wandering pan, the same corridor delay. Slowed, because
  // everything in this building reaches him slower than it left.
  function playBuffer(buffer, { level = 1, rate = .92 } = {}) {
    const audio = rig();
    if (!audio || !buffer) return 0;
    const at = Math.max(audio.ctx.currentTime + .05, stopAt);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(rate, at);

    const tone = audio.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(SHEET_CUTOFF_HZ, at);
    tone.Q.value = .5;
    // A little high-pass as well: distance takes the bottom off too, and
    // without this a piano through a wall is all boom and no tune.
    const thin = audio.ctx.createBiquadFilter();
    thin.type = 'highpass';
    thin.frequency.setValueAtTime(150, at);

    const amp = audio.ctx.createGain();
    const life = buffer.duration / Math.max(.2, rate);
    amp.gain.setValueAtTime(.0001, at);
    amp.gain.exponentialRampToValueAtTime(Math.max(.0002, clamp01(level)), at + .9);
    amp.gain.setValueAtTime(Math.max(.0002, clamp01(level)), at + life - 1.6);
    amp.gain.exponentialRampToValueAtTime(.0001, at + life);

    const place = audio.ctx.createStereoPanner();
    // Off to one side and staying there. It is in a room, and the room is not
    // this one.
    place.pan.setValueAtTime((Math.random() < .5 ? -1 : 1) * .55, at);

    src.connect(thin); thin.connect(tone); tone.connect(amp); amp.connect(place);
    place.connect(audio.master); place.connect(audio.tail);
    src.start(at);
    src.stop(at + life + .1);
    stopAt = at + life;
    return life;
  }

  function pluck(hz, { at = 0, level = 1, seconds = 1.4, pan = 0 } = {}) {
    const audio = rig();
    if (!audio || !(hz > 0)) return false;
    const life = Math.max(.12, Number(seconds) || 1.4);

    // Far things have no top. This is the same filter position playFarSound
    // uses, for the same reason.
    const tone = audio.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(SHEET_CUTOFF_HZ, at);
    tone.frequency.exponentialRampToValueAtTime(320, at + life);
    tone.Q.value = .5;

    const place = audio.ctx.createStereoPanner();
    place.pan.setValueAtTime(Math.max(-1, Math.min(1, Number(pan) || 0)), at);
    tone.connect(place);
    place.connect(audio.master);
    place.connect(audio.tail);

    for (const partial of PARTIALS) {
      const osc = audio.ctx.createOscillator();
      const amp = audio.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hz * partial.ratio, at);
      // A page that has been in an empty building for three weeks is not in
      // tune. A few cents of drift per note, never enough to name.
      osc.detune.setValueAtTime((Math.random() * 2 - 1) * 9, at);
      const peak = Math.max(.0002, partial.gain * clamp01(level));
      // Softened attack: a struck string heard through a wall has had its
      // transient eaten by the wall. This is what stops it sounding like a
      // synth in the room with you.
      amp.gain.setValueAtTime(.0001, at);
      amp.gain.exponentialRampToValueAtTime(peak, at + .045);
      amp.gain.exponentialRampToValueAtTime(.0001, at + life * partial.decay);
      osc.connect(amp); amp.connect(tone);
      osc.start(at);
      osc.stop(at + life * partial.decay + .06);
    }
    return true;
  }

  return {
    // Warm a piece before he can ask for it — called when a sheet is picked
    // up, so looking at it in the case later is instant.
    prepare(audioId) { load(audioId); return buffers.has(audioId); },
    // Play a sheet. The recording if it is here, the figure if it is not.
    playSheet(sheet, { level = 1 } = {}) {
      const id = sheet?.audio || '';
      if (id) {
        const buffer = buffers.get(id);
        if (buffer) return playBuffer(buffer, { level });
        // Not decoded yet: start it, and cover the gap with the figure. The
        // next look gets the real thing.
        load(id);
      }
      return this.play(sheet?.hz ? sheet : null, { level });
    },
    // Play one sheet's figure. Returns how long it will sound for, so the
    // caller can hold the page open at least that long.
    play(sheetMotif, { level = 1, spread = .5 } = {}) {
      const audio = rig();
      const notes = sheetMotif?.hz || [];
      if (!audio || !notes.length) return 0;
      // Never on top of the last one: a second read while the first is still
      // ringing would stack into a chord nobody wrote.
      const now = audio.ctx.currentTime;
      const start = Math.max(now + .08, stopAt);
      let cursor = 0;
      notes.forEach(({ hz, beats }, index) => {
        const seconds = Math.max(.9, beats * SHEET_SECONDS_PER_BEAT * 2.6);
        pluck(hz, {
          at: start + cursor,
          // The line fades as it goes, the way something walking away does.
          level: clamp01(level) * (.9 - index * .055),
          seconds,
          // Never centred — it is not in front of him. Wanders across the line.
          pan: Math.sin(index * 1.7) * clamp01(spread) * .85,
        });
        cursor += beats * SHEET_SECONDS_PER_BEAT;
      });
      stopAt = start + cursor + 2.2;
      return stopAt - now;
    },
    // Silence anything ringing. Used when the case closes on him.
    stop() {
      if (!master || !ctx) return false;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.exponentialRampToValueAtTime(.0001, now + .35);
      master.gain.setValueAtTime(Math.max(0, Number(gain) || 0), now + .4);
      stopAt = 0;
      return true;
    },
  };
}
