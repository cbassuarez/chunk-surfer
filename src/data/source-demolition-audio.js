// A small physical-material bank for one existing Source approach. The source
// descriptions distinguish documentary panel demolition from actual frame
// collapse, and original upload audio from a Freesound preview encoding.
export const SOURCE_DEMOLITION_AUDIO_DIR = 'audio/source-demolition';
export const SOURCE_DEMOLITION_AUDIO_SOURCES = Object.freeze([
  Object.freeze({ id: 'oulu', title: 'Urheilutalo Oulu 20221216', author: 'Estormiz',
    licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    url: 'https://commons.wikimedia.org/wiki/File:Urheilutalo_Oulu_20221216.webm',
    download: 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Urheilutalo_Oulu_20221216.webm',
    sourceFile: 'source.webm', sourceSHA: 'b5187ee659ab82e7db905a154ec3b0de03a2ee686faa3cc527ddf41325666261',
    provenance: 'Original own-work documentary upload, 16 December 2022. Stereo 48 kHz Opus audio retained in the original video. An excavator pulls infill/panels while the curved roof frames remain standing; this is local restraint/peel/debris material, not a recorded global structural collapse. Phone processing and camera distance are unspecified.' }),
  Object.freeze({ id: 'wood-audioninja', title: 'wood-impacts-breaking-stretching.wav', author: 'audioninja001',
    licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    url: 'https://freesound.org/people/audioninja001/sounds/455073/',
    download: 'https://cdn.freesound.org/previews/455/455073_2699264-hq.mp3',
    sourceFile: 'source-preview.mp3', sourceSHA: '419ebf314b064615db0cf3790f4518643d1ad65792f0aaec76ee37ac17fdb33f',
    provenance: 'Uploader records Zoom H5 and Sennheiser MKE600. Licensed HQ MP3 preview; original uncompressed upload requires login and is not held. Discrete wood stress/impact takes with digital gaps; processing history unspecified. Adapted as local timber/fastener failure, not a large building recording.' }),
  Object.freeze({ id: 'stone-field', title: 'rockfall2a.wav', author: 'AlanCat',
    licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    url: 'https://freesound.org/people/AlanCat/sounds/389303/',
    download: 'https://cdn.freesound.org/previews/389/389303_5486695-hq.mp3',
    sourceFile: 'source-preview.mp3', sourceSHA: 'db15885029d027756ef2b90114c202f4837f10a128371f493904b4886818ffcd',
    provenance: 'Olympus LS-14 recording of rocks cascading down a cliff; uploader removed background noise in Audacity. Licensed HQ MP3 preview, not an unprocessed microphone master. A later isolated contact is adapted as local masonry/debris, not building-scale fracture evidence. The separate tower cue uses a disjoint earlier interval of this source.' }),
]);

export const SOURCE_DEMOLITION_AUDIO_CLIPS = Object.freeze([
  Object.freeze({ id: 'restraint', source: 'wood-audioninja', from: 4.1, to: 6.35, rmsDb: -25, gain: .22, file: 'restraint.mp3' }),
  Object.freeze({ id: 'joint-fracture', source: 'wood-audioninja', from: 20.0, to: 22.65, rmsDb: -24, gain: .28, file: 'joint-fracture.mp3' }),
  // One chronological local panel fall and its settling. No second Oulu tail
  // is layered as a supposedly independent roof or spirit performance.
  Object.freeze({ id: 'failure-body', source: 'oulu', from: 23.35, to: 28.85, rmsDb: -26, gain: .92,
    contour: 'recorded-body', file: 'failure-body.mp3' }),
  Object.freeze({ id: 'stone-spall', source: 'stone-field', from: 4.9, to: 6.9, rmsDb: -26, gain: .42, file: 'stone-spall.mp3' }),
]);

export const SOURCE_DEMOLITION_AUDIO = Object.freeze({
  maxVoices: 8, maxResidualVoices: 2, maxEncodedBytes: 1000000, maxDecodedBytes: 8000000,
  maxEventAge: .16, arrivalSpeed: 343, maxArrivalDelay: .32,
  masterGain: .86, consumedTailSeconds: 1.25,
  residualSendGain: .20, residualAttackSeconds: .18,
  // Synthetic short exterior-facade reflection taps; not measured acoustics.
  reflectionSeconds: .19,
});
