// The real box's recorded tines, sampled from Seb's broken Clair de Lune
// recording (assets/music-box/note-bank.json). Each entry keeps the tine's
// ACTUAL pitch and detuning, never corrected: that wobble is the box's
// character. Pitches the broken box cannot sing (snapped tines, sheared pins)
// are filled by repitching the nearest recorded tine, never by synthesising a
// new note. Existing notes are played as recorded — no repitch.
export const COASTAL_MUSIC_BOX_NOTE_BANK = Object.freeze({
  sampleRate: 44100,
  source: 'assets/music-box/note-bank.json',
  notes: Object.freeze([
    Object.freeze({ midi: 74, freq: 589.23, cents: 6, file: 'music-box/samples/note_074_+6.wav' }),
    Object.freeze({ midi: 75, freq: 605.99, cents: -46, file: 'music-box/samples/note_075_-46.wav' }),
    Object.freeze({ midi: 76, freq: 664.31, cents: 13, file: 'music-box/samples/note_076_+13.wav' }),
    Object.freeze({ midi: 77, freq: 704.97, cents: 16, file: 'music-box/samples/note_077_+16.wav' }),
    Object.freeze({ midi: 79, freq: 800.53, cents: 36, file: 'music-box/samples/note_079_+36.wav' }),
    Object.freeze({ midi: 80, freq: 810.67, cents: -42, file: 'music-box/samples/note_080_-42.wav' }),
    Object.freeze({ midi: 84, freq: 1040.56, cents: -10, file: 'music-box/samples/note_084_-10.wav' }),
    Object.freeze({ midi: 85, freq: 1114.11, cents: 8, file: 'music-box/samples/note_085_+8.wav' }),
    Object.freeze({ midi: 86, freq: 1191.18, cents: 24, file: 'music-box/samples/note_086_+24.wav' }),
    Object.freeze({ midi: 87, freq: 1236.40, cents: -11, file: 'music-box/samples/note_087_-11.wav' }),
    Object.freeze({ midi: 89, freq: 1375.88, cents: -26, file: 'music-box/samples/note_089_-26.wav' }),
    Object.freeze({ midi: 91, freq: 1553.23, cents: -16, file: 'music-box/samples/note_091_-16.wav' }),
    Object.freeze({ midi: 94, freq: 1847.93, cents: -16, file: 'music-box/samples/note_094_-16.wav' }),
  ]),
});

// A recorded sample whose MIDI is within this many semitones counts as "the box
// plays this note" and must not be repitched. Outside it, the note is missing
// from the recording and gets repitched from the nearest tine.
export const COASTAL_MUSIC_BOX_PRESENT_TOLERANCE = 0.5;

export function coastalMusicBoxNearestSample(midi, bank = COASTAL_MUSIC_BOX_NOTE_BANK) {
  let best = null, bestDistance = Infinity;
  for (const note of bank.notes) {
    const distance = Math.abs(note.midi - midi);
    if (distance < bestDistance) { best = note; bestDistance = distance; }
  }
  return best;
}

// Playback rate that repitches a recorded tine to a target MIDI (equal
// temperament), while a rate of 1 leaves the recorded tine untouched.
export function coastalMusicBoxRepitchRate(targetMidi, sample) {
  return 2 ** ((targetMidi - sample.midi) / 12);
}

// Map one winding event to the voice the audio owner should play. Encoding the
// rule: healthy notes keep their recorded pitch (no repitch = the box's
// character); snapped/sheared notes are filled by repitching the nearest tine.
export function coastalMusicBoxVoiceForEvent(event, bank = COASTAL_MUSIC_BOX_NOTE_BANK) {
  if (!event || typeof event.pitch !== 'number') return null;
  const sample = coastalMusicBoxNearestSample(event.pitch, bank);
  if (!sample) return null;
  const present = Math.abs(sample.midi - event.pitch) <= COASTAL_MUSIC_BOX_PRESENT_TOLERANCE;
  if (event.type === 'pluck') {
    return {
      kind: present ? 'sample' : 'repitched',
      sample,
      playbackRate: present ? 1 : coastalMusicBoxRepitchRate(event.pitch, sample),
      cents: present ? sample.cents : 0,
      pitch: event.pitch, direction: event.direction || 1,
    };
  }
  if (event.type === 'tick') {
    // A snapped tine or sheared pin: a mechanical tick, plus a soft repitched
    // fill of the note the box could not sing (the non-broken state's good bit).
    return {
      kind: 'fill',
      sample,
      playbackRate: coastalMusicBoxRepitchRate(event.pitch, sample),
      cents: 0,
      pitch: event.pitch, direction: event.direction || 1,
    };
  }
  return null;
}
