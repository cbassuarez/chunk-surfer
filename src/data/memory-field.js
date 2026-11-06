// THE FIELD. docs/plans/last-minutes.md, section 1a.
//
// One field, one day, five visits, each later in that day and further gone. It is
// the same place every time, and nothing here says whose it is, or that it's his.
//
// The client rejects breath on tape, so every take is a minute of holding it, and
// the field is what comes when he lets it go. He raises the sheet to write up the
// take. He lowers it, and the room has gone.
//
// `stuck` visits have a door. It is a van door, standing in the daisies. It does
// nothing while you keep trying it. A car door can't be opened against the water
// outside it until the pressure equalises, which means the cab has to fill, so it
// gives when you stop. That reads as a fault, as water, and as giving up, and all
// three are meant. Waiting always gets you out, and `maxSeconds` is a hard limit
// whatever you do, because a fault must be fair.

export const MEMORY_FIELD=Object.freeze({
  eye:1.62,walk:2.4,pitch:1.25,maxFrameDelta:.1,
  // The door, in metres, from the middle of its threshold.
  door:Object.freeze({halfWidth:.62,height:2.05,thick:.09,reach:2.5,through:.7}),
  // How long the leaf takes to give, and how long you have before it comes for you.
  swingSeconds:2.4,leaveSeconds:11,
  coverIn:.5,coverOut:1.1,
  // How slowly decay reaches what it can't take back.
  lids:Object.freeze({open:1.15,blinkFrom:.25}),
  // The near field repeats on this square, and the far on a wider one. The repeat
  // is deliberate: failing memory reuses what it has.
  chunk:8,near:6,farChunk:40,far:7,variants:5,
});

// THE ANT. Seb, 2026-11-05: one of the interruptions is him staring at a lonely
// ant crawling a path; in the field, on the second visit. He is down on his
// heels over a paving slab someone left in the grass, and the ant crosses it.
// He watches it with plain, innocent wonder, and he has no idea he is talking
// about himself. Nothing here may say so. It ends when he stops trying to get up,
// or when the ant goes into the grass, whichever comes first, and by
// `maxSeconds` whatever happens, because a fault must be fair.
const antPoint=(x,z)=>Object.freeze([x,z]);
export const MEMORY_FIELD_ANT=Object.freeze({
  eye:.2,pitch:-1.02,standSeconds:1.4,minSeconds:14,quietSeconds:6,maxSeconds:80,
  // Where he is crouched, at the slab's near edge. His eyes follow the ant from here.
  crouch:Object.freeze({x:0,z:-.2}),follow:2.2,
  // The slab, in metres from where he is crouched. Its top is `height` above the soil.
  slab:Object.freeze({x:0,z:-.42,halfX:.31,halfZ:.29,height:.04,yaw:.18}),
  pebble:Object.freeze({x:.055,z:-.405,r:.012}),
  // While he is down the grass nearest the slab is a forest, so it is drawn close.
  patch:1.6,
  // A big ant's length (a wood ant's), and its pace. It stops, feels, and goes
  // on, about two thirds of the time moving.
  length:.012,speed:.03,
  // Its way: out of the grass, across the slab, round the crack and the stone,
  // back on itself twice, and into the grass on the far side.
  path:Object.freeze([antPoint(-.46,-.30),antPoint(-.30,-.33),antPoint(-.18,-.40),antPoint(-.12,-.36),antPoint(-.16,-.33),
    antPoint(-.06,-.44),antPoint(.02,-.47),antPoint(.10,-.52),antPoint(.16,-.50),antPoint(.12,-.46),antPoint(.20,-.55),
    antPoint(.31,-.58),antPoint(.44,-.62)]),
  lines:Object.freeze([
    Object.freeze({at:2,text:'There\'s an ant.'}),
    Object.freeze({at:6,text:'Just the one. You don\'t see them on their own.'}),
    Object.freeze({at:11,text:'Look where it\'s going. Every crack\'s a ravine to it.'}),
    Object.freeze({at:16,text:'And the grass. That\'s a forest. A whole canopy over its head.'}),
    Object.freeze({at:22,text:'Somebody poured this slab. To an ant that\'s an esplanade. Miles of it.'}),
    Object.freeze({at:28,text:'Does it know how small it is?'}),
    Object.freeze({at:33,text:'How easily somebody could step on it. Not even mean to. Not even notice.'}),
    Object.freeze({at:39,text:'Does it know none of this is going anywhere?'}),
    Object.freeze({at:45,text:'I wonder what it makes of Bach. Probably just the ground shaking.'}),
    Object.freeze({at:51,text:'Feelers, step, turn back, step. Over and over.'}),
    Object.freeze({at:56,text:'Is that it choosing? Or is that just what it is?'}),
  ]),
  gone:'There it goes.',
  stood:'Go on, then.',
});

const visit=row=>Object.freeze({walk:true,cloud:.6,sunScale:1,tunnel:0,door:null,jumper:null,wheel:null,minSeconds:0,quietSeconds:0,tries:Object.freeze([]),lines:Object.freeze([]),...row});
export const MEMORY_FIELD_VISITS=Object.freeze([
  // One breath. No hands yet. The eyes open into it, and it's gone.
  visit({id:'first',kind:'breath',walk:false,maxSeconds:3.6,day:.1,sunAlt:.33,sunAz:.18,decayTo:0,
    bag:Object.freeze({mode:'snag',x:-7.5,z:-15,scale:.9})}),
  // Nothing wrong with it. It ends by itself, and you weren't ready. Far out there is
  // something white, too small to be anything.
  // It opens on the ant. Once he is up, the rest of it is the wander it always was.
  visit({id:'second',kind:'wander',maxSeconds:38,day:.36,sunAlt:.46,sunAz:.3,decayTo:.08,ant:MEMORY_FIELD_ANT,
    door:Object.freeze({x:16,z:-210}),
    bag:Object.freeze({mode:'drift',x:-30,z:-40,scale:1}),
    lines:Object.freeze([{at:7,text:'Warm.'},{at:21,tell:0}])}),
  // The white thing was a door. It won't, and the day has got on.
  visit({id:'third',kind:'stuck',minSeconds:22,maxSeconds:70,quietSeconds:7,day:.6,sunAlt:.34,sunAz:.1,decayTo:.62,
    door:Object.freeze({x:3,z:-24}),
    bag:Object.freeze({mode:'hang',x:-5,z:-18,scale:1.05}),
    jumper:Object.freeze({x:-13.2,z:-27}),wheel:Object.freeze({x:9,z:-30}),
    tries:Object.freeze(['It\'s stuck.','Come on.','The handle\'s fine.','It isn\'t locked.']),
    lines:Object.freeze([{at:40,tell:1}]),
    release:'There.'}),
  // Near, and later. It looks worse the longer you stay.
  visit({id:'fourth',kind:'stuck',minSeconds:34,maxSeconds:85,quietSeconds:11,day:.82,sunAlt:.2,sunAz:.04,sunScale:1.7,cloud:.45,decayTo:1,
    door:Object.freeze({x:.5,z:-7}),
    bag:Object.freeze({mode:'attend',x:-3,z:-9,scale:1.7}),
    jumper:Object.freeze({x:-13.2,z:-12}),wheel:Object.freeze({x:3.2,z:-4.5}),
    tries:Object.freeze(['Something\'s holding it.','It isn\'t the door.','Push. Wait. Push.','All the weight of it.','I\'m not doing this right.']),
    lines:Object.freeze([{at:18,tell:2}]),
    release:'All right.'}),
  // The last door. The sun is behind it, and there is more sun than there was. The
  // field closes on it from outside, because a closing field closes on what is bright.
  visit({id:'fifth',kind:'stuck',last:true,minSeconds:26,maxSeconds:75,quietSeconds:14,day:1,sunAlt:.085,sunAz:0,sunScale:5.5,cloud:.3,tunnel:.86,decayTo:.8,
    door:Object.freeze({x:0,z:-5.5}),
    bag:Object.freeze({mode:'presence',x:-2.6,z:-6.4,scale:5.5}),
    jumper:Object.freeze({x:-13.2,z:-8}),wheel:Object.freeze({x:2.4,z:-3.4}),
    tries:Object.freeze(['I know.','I know. I\'m trying.','I can hear it.']),
    release:'Oh.'}),
]);
export const MEMORY_FIELD_VISIT=Object.freeze(Object.fromEntries(MEMORY_FIELD_VISITS.map(row=>[row.id,row])));
export const memoryFieldFlag=id=>`memory.field.${id}`;

// Which visit a counted take owes. The third never lands between the third take and
// the crash, because a visible cause reads as intended (six-loop). Reduce Dread never
// crashes, so it gets its visit here; otherwise it comes on the door after the loop.
export function memoryFieldForTake(takes,{reduceDread=false}={}){
  if(takes===1)return'first';
  if(takes===2)return'second';
  if(takes===3&&reduceDread)return'third';
  if(takes===4)return'fourth';
  return null;
}

// HIS OWN WORDS FOR IT. hypoxia.js draws one of these per run and calls it the tell:
// aircrew learn their own symptom order because it is consistent for one person and
// useless as a general description. He gets it wrong in a different way each night.
// He sounds content, because the alarm is on a separate circuit from the danger.
export const HYPOXIA_TELL_LINES=Object.freeze({
  fingers:Object.freeze(['Pins and needles. Gripping the thing too hard.','Can\'t feel the ends of my fingers. Doesn\'t matter.','My hands are fine. They\'re somebody\'s.']),
  warmth:Object.freeze(['It\'s warmer in here than it should be.','Somebody\'s been kind with the heating.','I don\'t mind the cold any more.']),
  sweetness:Object.freeze(['Something sweet at the back of my throat.','Pear drops. Why pear drops.','It\'s lovely, actually.']),
  lightness:Object.freeze(['Stood up too fast.','Head\'s gone light. Good light.','I could go on like this.']),
  yawn:Object.freeze(['Long night.','God, I could sleep.','I\'ll just sit for a second. In a bit.']),
});
