// Shared public provenance, kept small: the 9,153 candidate events remain in
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
    sha256:'d2e43c31c04d69572cf70222fdfc63056b87081b6f218426a756c5ba085d97e9',
    manifestSha256:'15f358c1b55c30ba3c880cc132a439722e139068030827513f824aa29fa8bacb',
    bytes:20238381,sampleRate:32000,channels:2,sampleCount:26981028,duration:843.157125,
    layout:Object.freeze(['human mono downmix','new note synthesis']),
  }),
  revoicing:Object.freeze({
    attribution:'Electronic revoicing created for Chunk Surfer from inferred performance notes.',
    method:'Independent additive/FM voices at inferred performed onsets and durations; no copied waveform in the electronic stem.',
    noteCandidates:9153,
    timing:'Performed timing and irregularities retained; no grid quantization, pitch correction or added error stingers.',
    limitation:'Automatic note candidates can omit, split or merge notes and misread octaves, partials or ornament durations. Not musician-validated.',
  }),
});

export function sourceRestCouperinCreditLines(){
  const s=SOURCE_REST_COUPERIN_SOURCE;
  return [`${s.composer} — ${s.title} — ${s.performer} (${s.licence})`,
    s.revoicing.attribution,s.revoicing.timing,s.sourceUrl,s.licenceUrl];
}
