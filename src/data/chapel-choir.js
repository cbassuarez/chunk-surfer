import { createChapelChoirScore } from '../audio/chapel-choir-score.js';

export const CHAPEL_CHOIR_AUDIO_DIR = 'audio/chapel-choir';
export const CHAPEL_CHOIR_SOURCE = Object.freeze({
  title: 'Kyrie — Missa Sicut lilium inter spinas',
  composer: 'Giovanni Pierluigi da Palestrina', performer: 'The Tudor Consort',
  licence: 'CC BY 3.0', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  url: 'https://freemusicarchive.org/music/The_Tudor_Consort/Renaissance_influences_-_Pizzetti_Messa_di_Requiem__Palestrina_Missa_Sicut_lilium_inter_spinas/02_Kyrie_-_Missa_Sicut_lilium_inter_spinas/',
  download: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/The_Tudor_Consort/Renaissance_influences_-_Pizzetti_Messa_di_Requiem__Palestrina_Missa_Sicut_lilium_inter_spinas/The_Tudor_Consort_-_02_-_Palestrina_-_Kyrie_-_Missa_Sicut_lilium_inter_spinas.mp3',
  originalSHA256: '9aba8d0c204a8c705b5a52c0f056a492df267834349026e57cfc7ef66733dd68',
  // The five-part score was first published in 1590. The recording is one
  // ensemble mix, not five isolated singers and certainly not six stems.
  scoreParts: 'SATTB', sourceKind: 'ensemble-mix', independentParts: 0,
  cut: Object.freeze({ from: 0, to: 80.1 }), duration: 88,
  changes: 'First Kyrie section excerpted (0–80.1 s), downmixed to mono, raised 3 dB, boundary fades and 7.9 s quiet; split into continuous and gain-modulated spatial paths with procedural room reflections. No voice separation, pitch shift or copied performers.',
});

// An original progression, not Marcoll's missing DC automation or a replica
// of his composition. The return to unity precedes the recorded cadence and
// existing room decay (~78.8s). Interior timings are authored, not a claim of
// score-aligned transcription; musician/listener validation remains pending.
export const CHAPEL_CHOIR_SCORE = createChapelChoirScore({ duration: CHAPEL_CHOIR_SOURCE.duration,
  stages: [
    { label: 'continuity', weight: 16, rateHz: 2, width: .7, depth: 0 },
    { label: 'interruption', weight: 16, rateHz: [2, 8], width: [.7, .35], depth: [0, 1] },
    { label: 'dense modulation', weight: 20, rateHz: [8, 140], width: [.35, .18], depth: 1 },
    { label: 'held fragmentation', weight: 10, rateHz: [140, 70], width: [.18, .5], depth: 1 },
    { label: 'recovery', weight: 10, rateHz: [70, 2], width: [.5, .7], depth: [1, 0] },
    { label: 'cadence and breathing space', weight: 16, rateHz: 2, width: .7, depth: 0 },
  ],
});
