// BACKGROUND VOICES. Open field recordings of people for four places: the vigil outside
// Ellery, the party on the third floor, the Lyric's bar, and students in the flashbacks.
// tools/chunk_surfer/build-background-voices-audio.mjs downloads exactly this list and
// renders each into a mono loop; credits.js prints from it; licences, and what was turned
// down, are in third_party/licenses/BACKGROUND-VOICES-AUDIO.md. Each is the published
// Freesound HQ MP3 preview, which loses nothing that survives the game's bitcrushing.
//
// The vigil is a polite, middle-class preservation protest: murmur and waiting, never a
// chanting march. No open recording of exactly that exists, so it is two layered crowds.
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const CC0={licence:'CC0 1.0',licenceUrl:'https://creativecommons.org/publicdomain/zero/1.0/'};
const BY3={licence:'CC BY 3.0',licenceUrl:'https://creativecommons.org/licenses/by/3.0/'};
const BY4={licence:'CC BY 4.0',licenceUrl:'https://creativecommons.org/licenses/by/4.0/'};
const source=(id,place,author,title,num,licence,{start=0,seconds=null,note=''}={})=>({
  id,place,author,title,url:`https://freesound.org/people/${author}/sounds/${num}/`,...licence,start,seconds,note,
  changes:`${seconds?`${seconds} s excerpt from ${start} s, `:''}mono, filtered, loudness matched, looped with an equal-power crossfade`,
});

export const BACKGROUND_VOICE_PLACES=freeze({
  vigil:'The vigil outside Ellery',party:'The party on the third floor',bar:'The Lyric',student:'Student flashbacks',
});

export const BACKGROUND_VOICES_AUDIO_SOURCES=freeze([
  source('vigil-menin-gate','vigil','Stitlown','Crowd Waiting Menin Gate 2016.wav',399070,CC0,
    {note:'A large, mostly British crowd waiting for the evening remembrance service at the Menin Gate, Ypres; tagged polite, respectful.'}),
  source('vigil-rotherham-hall','vigil','kwahmah_02','crowd_of_people_in_a_hall.wav',254810,BY3,
    {start:1,seconds:78,note:'A large crowd sheltering from rain at a school summer fair, Rotherham, South Yorkshire. Lo-fi (iPod).'}),
  source('party-london-drinks','party','Cheeseheadburger','Full Drunken Atmos 1.WAV',170479,BY4,
    {note:'A London drinks party, mixed crowd, heavy chatter, lively room. Schoeps CMIT.'}),
  source('party-house-distant','party','SpliceSound','Medium house party walla, ambience, chatter.wav',338114,CC0,
    {note:'A house party heard at a distance: for the party through a floor or a door.'}),
  source('bar-london-pub','bar','mdayalan','London Pub Ambience',398224,CC0,
    {start:420,seconds:90,note:'A busy pub in Primrose Hill, London. Excerpt from the second half, where the music has fallen away; the bartender\'s price call is earlier.'}),
  source('bar-union-bar','bar','fogma','Bar atmosphere - Busy.wav',19869,BY3,
    {start:360,seconds:90,note:'Imperial College Union Bar on a busy night: a student bar.'}),
  source('bar-cambridge-pub','bar','Zac_Gist','noisy_cambridge_pub.wav',457286,CC0,
    {note:'A packed Cambridge pub on a Saturday night, loud enough that people shout: for the peaks.'}),
  source('student-conservatory-warmup','student','leauronz','Room Tone - KCB before practice classical orchestra',728165,CC0,
    {note:'A practice room at the Royal Conservatory of Brussels: student chatter and a snare section warming up.'}),
  source('student-practice-hallway','student','WillLikesSound','College practice room hallway',760084,CC0,
    {note:'A college practice-room corridor: piano, violin, ten or more musicians practising.'}),
  source('student-exeter-atrium','student','lyndseymel','University of Exeter on a windy day.wav',241371,CC0,
    {start:64,seconds:54,note:'Students and staff in the University of Exeter\'s glass-roofed Atrium (the recording\'s second half).'}),
]);

export const backgroundVoicesFile=id=>`audio/background-voices/${id}.mp3`;
export const backgroundVoicesFor=place=>BACKGROUND_VOICES_AUDIO_SOURCES.filter(s=>s.place===place).map(s=>backgroundVoicesFile(s.id));
