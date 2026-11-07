const SCHUBERT=Object.freeze({
  composer:'Franz Schubert',work:'Fantasia in F minor, D. 940',
  performer:'Awadagin Pratt and Lucy Hattemer',
  licence:'CC BY 3.0 (performance); public-domain government recording',
  licenceUrl:'https://creativecommons.org/licenses/by/3.0/',
  sourceUrl:'https://obamawhitehouse.archives.gov/photos-and-video/video/white-house-workshop-classical-music',
});
const opening=Object.freeze({...SCHUBERT,id:'schubert-opening',
  title:'Fantasia - opening excerpt',path:'audio/opening-cab/schubert-d940-opening.mp3',durationSeconds:85,
});
const diabelli=Object.freeze({
  id:'diabelli-allegro',composer:'Anton Diabelli',title:'Allegro - Op. 149 No. 26',
  work:'Melodious Exercises, Op. 149 No. 26',performer:'PianoMelodyNotes Gabry',
  path:'audio/opening-cab/diabelli-op149-no26.mp3',durationSeconds:79.183946,
  licence:'CC BY 3.0',licenceUrl:'https://creativecommons.org/licenses/by/3.0/',
  sourceUrl:'https://commons.wikimedia.org/wiki/File:Piano-Diabelli_4_mani_op.149_N.26_Allegro.webm',
});
const later=Object.freeze({...SCHUBERT,id:'schubert-later',
  title:'Fantasia - later excerpt',path:'audio/opening-cab/schubert-d940-later.mp3',durationSeconds:322.000907,
});
const archive=Object.freeze({
  id:'apollo8-archive',composer:'NASA mission archive',title:'Apollo 8 - Christmas Eve, 1968',
  work:'Lunar-orbit broadcast, 24 December 1968',
  performer:'William Anders, Jim Lovell and Frank Borman; NASA audio courtesy Kipp Teague',
  path:'audio/opening-cab/apollo8-christmas-eve.mp3',durationSeconds:115.56,
  licence:'NASA historical mission audio - public-domain US government recording',
  licenceUrl:'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  sourceUrl:'https://www.nasa.gov/missions/apollo/part-3-apollo-8-the-far-side/',
});

const couperin=Object.freeze({
  id:'couperin-clavecin',composer:'François Couperin',title:'L’Art de toucher le clavecin',
  work:'L’Art de toucher le clavecin (complete)',performer:'David Joseph Stith',
  instrument:'Harpsichord built by Gerald Self in 2020',
  path:'audio/opening-cab/couperin-clavecin.mp3',durationSeconds:843.157469,
  licence:'CC0 1.0',licenceUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
  sourceUrl:'https://commons.wikimedia.org/wiki/File:Fran%C3%A7ois_Couperin_%22L%27Art_de_toucher_le_Clavecin%22.wav',
});

// Cleared temporary programmes, not the proposed Stravinsky/Sibelius recordings.
// The two Schubert presets are explicitly excerpts of the SAME performance.
export const OPENING_CAB_RADIO_STATIONS=Object.freeze([
  Object.freeze({id:couperin.id,label:'CLAVECIN',source:couperin}),
  Object.freeze({id:opening.id,label:'EVENING DUET',source:opening}),
  Object.freeze({id:diabelli.id,label:'KEYBOARD ROOM',source:diabelli}),
  Object.freeze({id:later.id,label:'LATE DUET',source:later}),
  Object.freeze({id:archive.id,label:'MISSION ARCHIVE',source:archive,link:null}),
]);
export const OPENING_CAB_RADIO_SOURCE=couperin;
export function openingCabRadioCreditLines(){return[
  'Temporary piano-four-hand programmes:',
  `${couperin.composer} - ${couperin.work}; ${couperin.performer}. ${couperin.licence}.`,
  couperin.sourceUrl,couperin.licenceUrl,
  'Franz Schubert - Fantasia in F minor, D. 940: opening and later excerpts of one performance.',
  'Awadagin Pratt and Lucy Hattemer - White House Classical Music Student Workshop, 4 November 2009.',
  `${SCHUBERT.licence}. ${SCHUBERT.licenceUrl}`,
  SCHUBERT.sourceUrl,
  `${diabelli.composer} - ${diabelli.work}; ${diabelli.performer}. ${diabelli.licence}.`,
  diabelli.sourceUrl,diabelli.licenceUrl,
  `${archive.title}. ${archive.performer}.`,
  archive.sourceUrl,archive.licenceUrl,
  'Adapted: excerpting, level adjustment, edge fades and MP3 conversion; mono speaker projection in game.',
  'NASA archive material is historical speech, not a present-day local station or an endorsement.',
];}
