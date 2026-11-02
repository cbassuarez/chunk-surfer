// Shared public provenance, kept small: the 3,202 score MIDI events remain in
// the separate prepared manifest rather than being bundled into credits.
export const SOURCE_REST_COUPERIN_SOURCE=Object.freeze({
  id:'source-rest-couperin-full',
  composer:'François Couperin',
  title:'L’Art de toucher le clavecin (complete)',
  performer:'David Joseph Stith',
  instrument:'Harpsichord built by Gerald Self in 2020',
  recorded:'2021-01-27',
  licence:'CC0 1.0',
  licenceUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
  sourceUrl:'https://commons.wikimedia.org/wiki/File:Fran%C3%A7ois_Couperin_%22L%27Art_de_toucher_le_Clavecin%22.wav',
  sourceDownloadUrl:'https://upload.wikimedia.org/wikipedia/commons/transcoded/5/5c/Fran%C3%A7ois_Couperin_%22L%27Art_de_toucher_le_Clavecin%22.wav/Fran%C3%A7ois_Couperin_%22L%27Art_de_toucher_le_Clavecin%22.wav.mp3',
  sourceSha256:'f9a9f0cefd38a4b7742f25e7636f88830b8a8ceed41167da7193426d0f80ae3a',
  sourceBytes:23385412,
  sourceDuration:843.157120181406,
  asset:Object.freeze({
    url:'audio/source-rest/couperin/couperin-revoiced-pair.mp3',
    manifestUrl:'audio/source-rest/couperin/couperin-revoicing.json',
    sha256:'908c1b5d2bd37f644baab797f9e47ea9fa7b34ec6422087aca86f6b0a9c42495',
    manifestSha256:'c5c4253bcbda346efda2387465316174669db5d60ec7a9a7d2ac0995bb5e3d1a',
    bytes:20238381,sampleRate:32000,channels:2,sampleCount:26981039,duration:843.15746875,
    layout:Object.freeze(['human mono downmix','new note synthesis']),
  }),
  revoicing:Object.freeze({
    attribution:'Electronic revoicing created for Chunk Surfer from a user-edited score-based arrangement.',
    method:'Native Live render of the edited MIDI arrangement, using score-based timing and user-adjusted pitch.',
    noteCandidates:3202,
    timing:'Performance-aligned timing and irregularities retained; user-adjusted pitch, with no added error stingers.',
    limitation:'Score-MIDI alignment and some ornaments are approximate; the stereo electronic render is folded to mono and transcoded from MP3.',
  }),
});

export function sourceRestCouperinCreditLines(){
  const s=SOURCE_REST_COUPERIN_SOURCE;
  return [`${s.composer} — ${s.title} — ${s.performer} (${s.licence})`,
    s.revoicing.attribution,s.revoicing.timing,
    'Score MIDI transcription: Nicolas Sceaux / Mutopia Project (CC BY 2.5); adapted and aligned.',
    'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=907',
    'https://creativecommons.org/licenses/by/2.5/',s.sourceUrl,s.licenceUrl];
}
