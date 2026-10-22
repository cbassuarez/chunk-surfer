import {VOICE_PROFILES} from './sam-voice.js';
// Pub dialogue uses the existing voiced `unknown` channel with a named source.
// These room voices do not add another synthesizer or a persistent sound bed.
const profiles={iona:[1.00,165,4400],mavis:[1.10,210,4700],ed:[.91,115,3600],bert:[.89,110,3900],
  farah:[1.06,185,4900],nell:[.98,175,4000],arthur:[.94,125,3700]};
for(const [id,[rate,hp,lp]] of Object.entries(profiles))VOICE_PROFILES[`pub-${id}`]={rate,hp,lp,gain:.92};
