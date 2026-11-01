// Describe only contamination actually recorded on the take. The speaker cue
// is written to the same tape as the heard source and survives tape reloads.
const B3_SPEAKER_CUE = 'b3.speaker.';

export function takeContaminationLabel(take) {
  if (!take?.contaminated) return null;
  const recordedSources = Array.isArray(take.contaminationSources)
    ? take.contaminationSources : null;
  const heardSpeaker = (take.discrete || []).some(event =>
    typeof event?.cueId === 'string' && event.cueId.startsWith(B3_SPEAKER_CUE));
  const speaker = heardSpeaker || !!recordedSources?.includes('b3-speakers');
  // Before source attribution existed, mains was the only dirty-take cause.
  // A speaker cue proves a new source, but cannot prove a second mains source.
  const mains = recordedSources ? recordedSources.includes('mains') : !speaker;
  const labels = [mains && 'MAINS HUM', speaker && 'SPEAKER BLEED'].filter(Boolean);
  return labels.join(' · ') || 'CONTAMINATED';
}

export function describeTakeContamination(contamination, circuitLabel = id => id) {
  const labels = (Array.isArray(contamination?.circuits) ? contamination.circuits : [])
    .map(id => circuitLabel(id)).filter(Boolean);
  if (Array.isArray(contamination?.sources) && contamination.sources.includes('b3-speakers'))
    labels.push('the studio speakers');
  return [...new Set(labels)].join(' and ') || 'unwanted sound';
}

// Explicit metadata distinguishes mains+speaker from speaker alone on reload;
// previously saved dirty takes remain readable without retroactive invention.
export function takeContaminationSources(contamination) {
  const sources = [];
  if (Array.isArray(contamination?.circuits) && contamination.circuits.length) sources.push('mains');
  if (Array.isArray(contamination?.sources) && contamination.sources.includes('b3-speakers')) sources.push('b3-speakers');
  return sources;
}
