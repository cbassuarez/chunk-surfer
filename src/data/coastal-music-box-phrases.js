// The full phrase playthroughs extracted from Seb's broken Clair de Lune
// recording (assets/music-box/phrase-bank.json). Each phrase is one complete
// wind→play→run-down of the box's tune, ~15-17 s, captured whole so the
// keepsake can replay the actual recording at crank-controlled speed rather
// than rebuild the tune from one-shots. The per-note one-shots in
// coastal-music-box-notes.js remain for slams and muddled broken bits.
export const COASTAL_MUSIC_BOX_PHRASE_BANK = Object.freeze({
  sampleRate: 44100,
  source: 'assets/music-box/phrase-bank.json',
  phrases: Object.freeze([
    Object.freeze({ id: 'phrase_1', file: 'music-box/phrases/phrase_1.wav', seconds: 15.7 }),
    Object.freeze({ id: 'phrase_2', file: 'music-box/phrases/phrase_2.wav', seconds: 14.4 }),
    Object.freeze({ id: 'phrase_3', file: 'music-box/phrases/phrase_3.wav', seconds: 15.9 }),
    Object.freeze({ id: 'phrase_4', file: 'music-box/phrases/phrase_4.wav', seconds: 17.0 }),
    Object.freeze({ id: 'phrase_5', file: 'music-box/phrases/phrase_5.wav', seconds: 16.4 }),
  ]),
});

// The recorded phrase is the box's actual tune length; the in-game score model
// spans CLAIR_DE_LUNE_SCORE_SECONDS. This maps one to the other for varispeed
// playback: score position -> phrase position, and crank rate -> playback rate.
import { CLAIR_DE_LUNE_SCORE_SECONDS } from './clair-de-lune-music-box.js';

export function coastalMusicBoxPhraseScale(phraseSeconds, scoreSeconds = CLAIR_DE_LUNE_SCORE_SECONDS) {
  return phraseSeconds / scoreSeconds;
}

// Score position (in the in-game 0..SCORE timebase) -> phrase position seconds.
export function coastalMusicBoxPhrasePosition(score, phraseSeconds, scoreSeconds = CLAIR_DE_LUNE_SCORE_SECONDS) {
  const scale = coastalMusicBoxPhraseScale(phraseSeconds, scoreSeconds);
  return (Number.isFinite(score) ? score : 0) * scale;
}

// Crank rate (score seconds per second) -> phrase playbackRate, so that a full
// crank through the score plays the phrase once at the recorded speed.
export function coastalMusicBoxPhraseRate(scoreRate, phraseSeconds, scoreSeconds = CLAIR_DE_LUNE_SCORE_SECONDS) {
  return (Number.isFinite(scoreRate) ? scoreRate : 0) * coastalMusicBoxPhraseScale(phraseSeconds, scoreSeconds);
}
