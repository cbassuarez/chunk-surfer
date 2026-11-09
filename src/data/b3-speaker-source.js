import source from './b3-speaker-source.json' with {type:'json'};
import legacy from './b3-speaker-legacy.json' with {type:'json'};

export const B3_SPEAKER_MUSIC=Object.freeze(source);
// Existing physical tapes keep the programme they actually captured.
export const B3_SPEAKER_LEGACY_MUSIC=Object.freeze(legacy);
export const b3SpeakerMusicCreditLines=()=>[
  B3_SPEAKER_MUSIC.credit,
  B3_SPEAKER_MUSIC.sourceUrl,
  B3_SPEAKER_MUSIC.licenceUrl,
  B3_SPEAKER_MUSIC.changes,
  'Archived B3 takes — previous speaker programme:',
  B3_SPEAKER_LEGACY_MUSIC.credit,
  B3_SPEAKER_LEGACY_MUSIC.sourceUrl,
  B3_SPEAKER_LEGACY_MUSIC.licenceUrl,
  B3_SPEAKER_LEGACY_MUSIC.changes,
];
