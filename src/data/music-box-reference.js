// One recorded instrument in both scenes. These times are audio transport
// seconds, not the old piano-arrangement clock. See the asset provenance for
// the limits of the offline analysis; no particular broken part is inferred.
export const MUSIC_BOX_REFERENCE = Object.freeze({
  file: 'music-box/clair-de-lune-worn.wav',
  durationSeconds: 46.3,
  sourceStartSeconds: 65,
  sourceEndSeconds: 111.3,
  // The short memo includes the phone touching a counter. Its individual
  // contacts are not safe to relabel as the winding key without correlation.
  keyContactFile: null,
  keyContactSeconds: 0,
  releaseFile: 'music-box/release-tonal-slip.wav',
  releaseSeconds: .62,
  rattleFile: 'music-box/handling-rattle.wav',
  rattleSeconds: .6,
  maxEncodedBytes: 12_000_000,
  maxDecodedSeconds: 50,
  gain: .82,
  // Intentional pauses come from the source and player action. There is no
  // authored clutch-slip timetable or synthesized replacement melody.
  faultCues: Object.freeze([]),
});

export const MUSIC_BOX_REFERENCE_SECONDS = MUSIC_BOX_REFERENCE.durationSeconds;
