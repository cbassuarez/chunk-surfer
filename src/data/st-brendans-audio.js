// Physical material, not a second congregation. Source previews retain the
// original upload's CC0 dedication; these are not measurements of our tower.
export const ST_BRENDANS_AUDIO_DIR = 'audio/st-brendans';
export const ST_BRENDANS_AUDIO_SOURCES = Object.freeze([
  Object.freeze({ id: 'timber', title: 'Wood Creak Single V7', author: 'Rudmer_Rotteveel',
    url: 'https://freesound.org/people/Rudmer_Rotteveel/sounds/506662/',
    download: 'https://cdn.freesound.org/previews/506/506662_4921277-hq.mp3',
    licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    audioSHA: 'ca0d99357dec4aee3cbb1a32e0b4ed3d15558fb68c63e8203e52240bf7e5c301',
    provenance: 'Single wooden floorboard creak; adapted as loaded bell-frame timber. Not a bell frame recording.' }),
  Object.freeze({ id: 'rope', title: 'ROPE_GOES_TIGHT.WAV', author: 'dansotak',
    url: 'https://freesound.org/people/dansotak/sounds/137711/',
    download: 'https://cdn.freesound.org/previews/137/137711_2507354-hq.mp3',
    licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    audioSHA: '061831420016afc712c4d1702a2a2bf27324b20e594f1ea104a69573cafc1d76',
    provenance: 'Rope being pulled tight; adapted for the existing swinging apparatus, not continuous idle movement.' }),
  Object.freeze({ id: 'iron', title: 'Metallic creak.wav', author: 'Crinkem',
    url: 'https://freesound.org/people/Crinkem/sounds/481786/',
    download: 'https://cdn.freesound.org/previews/481/481786_3544425-hq.mp3',
    licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    audioSHA: '9b6728d39d6ea0828fc50a78633e6ffae4d0be430b67b135ad117a5e4c3cc8e5',
    provenance: 'A door latch opening, recorded on Sony PCM-A10; adapted as a short bearing/iron contact. Not a tower bearing recording.' }),
  Object.freeze({ id: 'window-wind', title: 'Window Wind.aif', author: 'vuzz',
    url: 'https://freesound.org/people/vuzz/sounds/9097/',
    download: 'https://cdn.freesound.org/previews/9/9097_15898-hq.mp3',
    licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    audioSHA: '0ebfb17b903fadf0e2de7d1f1072b08bb320efc15c8d60114893e050b755cb1e',
    provenance: 'Cold windy night through a small window opening; adapted for the existing belfry louvres. Not a recording of this cathedral.' }),
  Object.freeze({ id: 'stone-field', title: 'rockfall2a.wav', author: 'AlanCat',
    url: 'https://freesound.org/people/AlanCat/sounds/389303/',
    download: 'https://cdn.freesound.org/previews/389/389303_5486695-hq.mp3',
    licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    audioSHA: 'db15885029d027756ef2b90114c202f4837f10a128371f493904b4886818ffcd',
    provenance: 'Rocks cascading down a cliff, recorded with Olympus LS-14; recorder removed background noise in Audacity. Adapted as stone break/debris, not a recorded cathedral demolition.' }),
]);

export const ST_BRENDANS_AUDIO_CLIPS = Object.freeze([
  { id: 'timber-load', source: 'timber', from: 0, to: 1.595, rmsDb: -25, gain: .20 },
  { id: 'iron-contact', source: 'iron', from: 0, to: .396, rmsDb: -27, gain: .12 },
  { id: 'rope-load-a', source: 'rope', from: 1.25, to: 5.35, rmsDb: -28, gain: .13 },
  { id: 'rope-load-b', source: 'rope', from: 13.65, to: 18.2, rmsDb: -29, gain: .12 },
  { id: 'louvre-air-a', source: 'window-wind', from: 16, to: 40, rmsDb: -29, gain: .33 },
  { id: 'louvre-air-b', source: 'window-wind', from: 89, to: 113, rmsDb: -29, gain: .33 },
  { id: 'stone-break', source: 'stone-field', from: 0, to: 2.95, rmsDb: -24, gain: .48 },
].map(clip => Object.freeze({ ...clip, file: `${clip.id}.mp3`, kind: clip.id.startsWith('louvre') ? 'air' : 'mechanism' })));

export const ST_BRENDANS_SOUND = Object.freeze({
  maxSources: 24, maxAmbientSources: 3, cycleSeconds: 137, phaseOffset: 19.3,
  fadeIn: .8, fadeOut: .025, gain: .82, dialogueGain: .55,
  // Room responses are synthetic and finite. No claim of measured acoustics.
  profiles: Object.freeze({
    belfry: Object.freeze({ direct: .95, send: .18, cutoff: 11200, decay: 2.7, structure: .055, wind: 1, delays: [.018, .034, .061] }),
    turret: Object.freeze({ direct: .24, send: .38, cutoff: 1500, decay: 2.0, structure: .07, wind: .22, delays: [.027, .053, .089] }),
    triforium: Object.freeze({ direct: .43, send: .62, cutoff: 4200, decay: 6.1, structure: .065, wind: .28, delays: [.043, .092, .151] }),
    nave: Object.freeze({ direct: .48, send: .72, cutoff: 6200, decay: 7.2, structure: .035, wind: .12, delays: [.051, .113, .179] }),
  }),
});
