// BEFORE THE VAN, A LONG BLINK. It plays once at the start of a real new night and
// nothing in it is saved. Narration, and a conversation with the thing from the
// listening seats, before it has had any practice at sounding calm: the same
// `other`, who also opens the bench with "There you are." It is never named and it
// confirms no cause; everything it knows about Ellery is on paper somewhere in the
// building, and the words on paper are quoted as they are filed.
// Doctrine: docs/story-doctrine.md. Runs on game/conversation.js, like every talk.
import {OPENING_OVERTURE_SHOTS} from './opening-overture.js';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const clamp=(value,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(value)||0));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const tower=OPENING_OVERTURE_SHOTS.find(row=>row.id==='tower');

// Where things have got to by each point in the talk. Each only says what changed.
// `seconds` is how long the change takes, and the talk does not wait for it. It
// starts above everything, looking up and away, where there is nothing to see but
// the hole. It goes to look at the school when the talk turns to the school.
const steps=[
  ['dark',{seconds:.01,hole:[80,70.5,-16],eye:[88,62,-8],target:[80,70.5,-16],radius:1,rain:0,music:.6,stream:0,wheels:[0,0,0],falls:[0,0,0],open:0,shut:0,moon:0,veil:0}],
  ['woken',{seconds:4,wheels:[.3,0,0],open:2}],
  ['inner',{seconds:7,wheels:[1,0,0],open:8,eye:[88.3,61.8,-7.7]}],
  ['middle',{seconds:7,wheels:[1,.8,0],open:16,eye:[88.8,61.5,-7.2]}],
  ['whole',{seconds:9,wheels:[1,1,1],open:24,moon:1,eye:[90,61,-6]}],
  ['ellery',{seconds:26,hole:[80,10,-16],eye:[64,1.4,-40],target:[80,8,-6],rain:1,music:.8}],
  ['school',{seconds:14,eye:[63,1.4,-42]}],
  ['boy',{seconds:9,shut:1,eye:[64,1.6,-39],target:[80,8,-7]}],
  ['notice',{seconds:10,eye:[66,1.8,-36],target:[80,8.5,-9]}],
  ['roll',{seconds:14,shut:17,eye:[68,2,-33],target:[80,9,-12]}],
  ['fate0',{seconds:16,hole:[80,24,-16],eye:[66,16,-32],target:[80,24,-16],radius:1.3,stream:.6,rain:.6}],
  ['fate1',{seconds:11,shut:18,hole:[80,42,-16],eye:[72,34,-34],target:[80,42,-16],radius:1.5,stream:1,rain:.2}],
  ['fate2',{seconds:11,shut:19,falls:[0,0,1],hole:[80,58,-16],eye:[88,50,-32],target:[80,58,-16],radius:1.8,rain:0}],
  ['fate3',{seconds:11,shut:20,hole:[80,70.5,-16],eye:[94,62,-24],target:[80,70.5,-16],radius:2.2}],
  ['fate4',{seconds:11,shut:21,falls:[0,1,1],eye:[93,62,-14],radius:2.7}],
  ['fate5',{seconds:11,shut:22,eye:[91,62.2,-11],radius:3.3}],
  ['fate6',{seconds:11,shut:23,radius:3.8}],
  ['last',{seconds:9,shut:24,falls:[1,1,1],moon:0,stream:0,hole:[80,70.5,-16],eye:[90,62.5,-9],target:[80,70.5,-16],radius:5,rain:0,music:.35}],
  ['gone',{seconds:5,veil:1,radius:7,music:0}],
];
const keyed={};let running=null;
for(const[id,change]of steps){running={...running,...change};keyed[id]=running;}
// The optional interval has its own poses. It can return to the same question
// without advancing the filed history's eye-count or inheriting a later fall.
Object.assign(keyed,{
  interval:{...keyed.whole,seconds:7,eye:[90,62,-6],target:[80,70.5,-16],radius:1.15},
  counted:{...keyed.whole,seconds:5,eye:[89,63,-7],radius:1.2,shut:23},
  unseen:{...keyed.whole,seconds:4,eye:[89,63,-7],radius:1.2,shut:24},
  near:{...keyed.whole,seconds:8,eye:[83.8,67.7,-12.2],radius:1.2,shut:23},
  grip:{...keyed.whole,seconds:7,eye:[87,64,-9],radius:1.3,shut:1},
  held:{...keyed.whole,seconds:4,eye:[87,64,-9],radius:1.3,shut:3},
  released:{...keyed.whole,seconds:5,eye:[91,62,-5],radius:1.1,shut:0},
  averted:{...keyed.whole,seconds:6,eye:[90,62,-6],target:[103,61,5],radius:1.15},
  margin:{...keyed.roll,seconds:8,eye:[69,2.3,-31],target:[80,9,-10],radius:1.15},
});

const line=(who,text,extra={})=>({who,text,voice:false,say:false,...extra});
const d=text=>line('direction',text,{signalRole:'unattributed'}),o=text=>line('unknown',text,{signalRole:'unattributed'}),y=text=>line('me',text,{signalRole:'human'});
const say=(text,go)=>({text:`"${text}"`,goto:go});
const mum=(go,text='(say nothing)')=>({text,goto:go});
const fate=(text,go)=>({...say(text,go),hideWhenAsked:true});
const back={goto:'fate',stage:'fate',fate:true};
const ask=(text,go)=>({...say(text,go),hideWhenAsked:true});
const action=(text,go)=>({...mum(go,text),hideWhenAsked:true});

const nodes={
  // ── the blink ────────────────────────────────────────────────────────────────
  start:{stage:'dark',lines:[
    d('You have been driving for a long time. It is raining on the road. The wipers go.'),
    d('You blink.'),
    d('It is a long blink.'),
    d('Your thumb is resting on the seam of the steering wheel. You can feel the join in the leather.'),
  ],goto:'there'},
  there:{stage:'woken',lines:[
    o('There you are.'),
    d('It is not a voice. It arrives the way a room arrives when the fridge cuts out.'),
    o('I kept your place.'),
  ],choices:[say('Who is that?','who'),say('I\'m driving.','driving'),mum('quiet')]},
  who:{stage:'inner',lines:[
    y('Who is that?'),
    o('Nobody you would have on the form. I keep late hours. I have been the cough in a slow movement, and the string that goes in the last eight bars.'),
    o('I have been the chair that creaks on the only good take. I am very well thought of. Nobody has ever once asked me to leave.'),
  ],goto:'look'},
  driving:{stage:'inner',lines:[
    y('I\'m driving.'),
    o('You are! Beautifully. Both hands. This will not take a moment. It never takes a moment; that is what I like about it.'),
    d('The wipers have not come back across. You notice that they have not come back across.'),
  ],goto:'look'},
  quiet:{stage:'inner',lines:[
    d('You say nothing. You are good at it. It is on your invoice.'),
    o('Oh, you are the new one. Good. Do not start talking now, you would only have to stop again at the door.'),
  ],goto:'look'},
  // ── the interval ─────────────────────────────────────────────────────────────
  look:{stage:'interval',lines:[
    d('You can see it now, or it has let you. A hole in nothing, and round it three wheels that have torn away from one another and gone on turning. The wheels are full of eyes.'),
    o('Before the job. Shall we see what you can keep still?'),
  ],revisitLines:[
    d('Your hands have not moved. The eyes have.'),
    o('Still here. You may ask another, or we can get on with the job.'),
  ],choices:[
    ask('What am I looking at?','interval-eyes'),
    ask('I\'m keeping my hands on the wheel.','interval-wheel'),
    action('(look away)','interval-avert'),
    {...mum('interval-silent'),hideWhenAsked:true},
    say('Ask me about the job.','job'),
  ]},
  'interval-eyes':{stage:'counted',lines:[
    y('What am I looking at?'),
    o('I do not think I am on your side of that question.'),
    d('You count twenty-four eyes. Twenty-three close. The last seems nearer than the wheel that carries it.'),
    o('There. One each. I will not look away if you do not.'),
  ],choices:[say('You first.','interval-first'),mum('interval-meet','(hold its gaze)')]},
  'interval-first':{stage:'unseen',lines:[
    y('You first.'),
    o('Oh, I can.'),
    d('The last eye goes dark. You still feel watched from exactly there.'),
    o('Now what were you going to do about the job?'),
  ],goto:'look'},
  'interval-meet':{stage:'near',lines:[
    d('For a moment there is no room to look beside it. Your own eye begins to water.'),
    o('You can hold a look. Good. A minute is longer than that.'),
  ],goto:'look'},
  'interval-wheel':{stage:'grip',lines:[
    y('I\'m keeping my hands on the wheel.'),
    d('You can still feel the seam under your thumb. The thumb is steady. The seam makes one complete turn.'),
    o('Keep the hands. They are yours. The position is the doubtful part.'),
  ],choices:[mum('interval-hold','(tighten your grip)'),mum('interval-release','(open your hands)')]},
  'interval-hold':{stage:'held',lines:[
    d('Three eyes close, one after another. The seam stops moving. You have not moved your hands.'),
    o('That will do. You can keep a position. They will like that about you.'),
  ],goto:'look'},
  'interval-release':{stage:'released',lines:[
    d('You spread your fingers. The seam stays against your thumb anyway.'),
    o('Excellent. You are not doing it, then.'),
  ],goto:'look'},
  'interval-avert':{stage:'averted',lines:[
    d('You turn from the wheels. The dark is exactly as deep on this side.'),
    o('Better? I can wait. The road cannot.'),
  ],choices:[mum('interval-wait','(keep looking away)'),mum('interval-return','(look back)')]},
  'interval-wait':{stage:'averted',lines:[
    d('You wait for something to arrive at the edge of your sight. Nothing does.'),
    o('You are remarkably good at this. Are you sure this is your first night?'),
  ],goto:'look'},
  'interval-return':{stage:'interval',lines:[
    d('The wheels are where you left them. You have the unpleasant thought that you have come back on a different side.'),
  ],goto:'look'},
  'interval-silent':{stage:'unseen',lines:[
    d('You give it no answer. The eyes shut in order, as though a name is being read against each one.'),
    o('No. That was not empty. You were waiting for me to fill it.'),
    d('You stop waiting. You cannot tell whether that is different.'),
    o('Keep that one. You may need it in a room.'),
  ],goto:'look'},
  // ── the job ──────────────────────────────────────────────────────────────────
  job:{stage:'whole',lines:[
    y('Ask me about the job.'),
    o('Tell me about the job. Go on. I love how people tell it.'),
  ],choices:[say('Five rooms. A clean minute of each.','job-rooms'),say('Four hundred quid.','job-money'),say('It\'s just a job.','job-just')]},
  'job-rooms':{stage:'whole',lines:[
    y('Five rooms. A clean minute of each.'),
    o('With nothing in it.'),
    y('With nothing in it. A studio, the pool, the concert hall, the practice wing and the chapel.'),
  ],goto:'job-sheet'},
  'job-money':{stage:'whole',lines:[
    y('Four hundred quid.'),
    o('To stand very still in five rooms and not be there. I have known people do it for nothing. I have known people do it for years.'),
  ],goto:'job-sheet'},
  'job-just':{stage:'whole',lines:[
    y('It\'s just a job.'),
    o('It is a lovely job. They ring a man who does not ask, and he does not ask. That is why they have your number.'),
  ],goto:'job-sheet'},
  'job-sheet':{stage:'whole',lines:[
    d('The sheet is on the passenger seat, or it was. Ellery Conservatoire of Music, condemned. One night. Demolition begins 06:00 Thursday. Bring a light.'),
    d('One clean minute of each, with nothing in it. No handling noise, no clothing, no breath.'),
    o('No breath! Read me the next bit. I could hear it all night. I do.'),
    d('If you can hear yourself on the take, the take is not the room, and we will not accept it.'),
    o('Who wants a minute of an empty room, do you suppose?'),
  ],choices:[say('The client. W. Ellery Holdings.','client'),say('I don\'t ask.','no-ask')]},
  client:{stage:'whole',lines:[
    y('The client. W. Ellery Holdings.'),
    o('And who signed for them?'),
    d('The signature is illegible. The authorising officer\'s field is blank under every carbon.'),
    o('There. Now you have asked, and it cost you nothing. It is a very old firm.'),
  ],goto:'last-one'},
  'no-ask':{stage:'whole',lines:[
    y('I don\'t ask.'),
    o('No. Neither did the last one.'),
  ],goto:'last-one'},
  'last-one':{stage:'whole',lines:[
    d('The prior contractor delivered four accepted room tones. The packet was settled for four. The account remains open.'),
  ],choices:[say('What happened to the fifth?','fifth'),say('What happened to him?','him'),say('Not my problem.','not-mine')]},
  fifth:{stage:'whole',lines:[
    y('What happened to the fifth?'),
    o('It is still undelivered. It is a very patient invoice. "When five clean minutes are received, the account is satisfied." That is the one sentence on the sheet I would call sincere.'),
  ],goto:'ellery'},
  him:{stage:'whole',lines:[
    y('What happened to him?'),
    o('He is nearly finished. Ask him. He has been nearly finished for some time.'),
  ],goto:'ellery'},
  'not-mine':{stage:'whole',lines:[
    y('Not my problem.'),
    o('No. It is your job. There is a difference, and you have about eight hours to find out what it is.'),
  ],goto:'ellery'},
  // ── the school ───────────────────────────────────────────────────────────────
  ellery:{stage:'ellery',lines:[
    o('You have not asked what it was. They never do. Have a look.'),
    d('There is a below, it turns out. Wet tarmac, railings, a tree somebody planted on purpose. A long front with its power off.'),
    o('Public baths, to begin with. 1912, blue tile, people went in to get clean. Then a school bought the baths, and the pub, and half the street.'),
    o('It never stopped being about getting clean.'),
  ],choices:[say('What kind of school?','school'),say('Did you go there?','attended'),mum('school-quiet')]},
  school:{stage:'school',lines:[y('What kind of school?')],goto:'school-told'},
  attended:{stage:'school',lines:[
    y('Did you go there?'),
    o('I attended. Every lesson, every night, every year, the best seat in the house. You will not find me on a register. I have looked.'),
  ],goto:'school-told'},
  'school-quiet':{stage:'school',lines:[d('You keep quiet. It tells you anyway.')],goto:'school-told'},
  'school-told':{stage:'school',lines:[
    o('They take a child who can hear, and they correct it. Reference listening. The same bar, the same recording, the same small fault. Again. Again.'),
    o('Until you can hear a wrong note through a wall, in your sleep, in your mother saying your name.'),
    d('You have worked with people who came out of Ellery. They flinch at fridges.'),
    o('One of them got very good. That is how it starts. He could hear everything. And one term he stopped coming down to lessons.'),
  ],choices:[say('What happened to him?','boy'),say('What was his name?','boy-name')]},
  'boy-name':{stage:'school',lines:[
    y('What was his name?'),
    o('Now that is a question. Nobody asks it. It is the only thing in that building still correctly filed, and you will not get it from me.'),
  ],goto:'boy-told'},
  boy:{stage:'school',lines:[y('What happened to him?')],goto:'boy-told'},
  'boy-told':{stage:'boy',lines:[
    o('He is missing. Look, it says so.'),
    d('The public register says MISSING, in a clean hand.'),
    o('The body is a separate matter. They took that out of a chamber room on the third floor.'),
    d('Recovery entered on the internal sheet. External register to retain MISSING. Medical finding: not attached.'),
    o('And the others knew. They are musicians. You cannot hide a missing boy from people who can hear which floor he is not on.'),
  ],goto:'notice'},
  notice:{stage:'notice',lines:[
    d('A notice went up. It is the one clear thing anybody there ever wrote down.'),
    d('Acknowledge that his body was recovered here. Until that acknowledgment is made, we will not rehearse or perform. We will not play over what happened.'),
  ],choices:[say('Good for them.','good'),say('What did the school say?','office')]},
  good:{stage:'notice',lines:[
    y('Good for them.'),
    o('Is it not? Every room in the place silent, for the first time since it opened. You have no idea how lovely that was.'),
  ],goto:'tower'},
  office:{stage:'notice',lines:[
    y('What did the school say?'),
    d('RECEIVED BY THE OFFICE. NO REPLY FILED.'),
    o('They are still not answering. It is the longest piece anyone has ever performed there.'),
  ],goto:'tower'},
  tower:{stage:'roll',lines:[
    o('So nobody played. Some stopped eating. And some went up the tower, to the ringing room, where it is quiet.'),
    d('Transfer receipts. Students\' bodies, removed from the ringing room. The names checked against the register.'),
    d('Cause of death: not entered on this copy. Rehearsal status: suspended.'),
    o('"Refusal to rehearse is not a medical finding." Somebody sat down and typed that.'),
  ],choices:[say('Did you do that?','did'),say('Why are you telling me?','why'),mum('tower-quiet')]},
  did:{stage:'roll',lines:[
    y('Did you do that?'),
    o('Look at me. I am a hole. I have never so much as lifted a bow.'),
    y('That isn\'t a no.'),
    o('No, it is not. They told me you were cheap. They did not say you were quick.'),
  ],goto:'margin'},
  why:{stage:'roll',lines:[
    y('Why are you telling me?'),
    o('Because by midnight you will be standing in those rooms, being paid to hear nothing. Somebody ought to tell you what you will be hearing nothing of.'),
  ],goto:'margin'},
  'tower-quiet':{stage:'roll',lines:[
    d('You say nothing. You have a professional reason.'),
    o('That is it. That is exactly what they all did. You will fit right in.'),
  ],goto:'margin'},
  margin:{stage:'margin',lines:[
    d('The school tips by a few degrees. Your hands have corrected for a bend you cannot see.'),
    o('Good. You are still driving.'),
    o('Do you want me to put the next bit back where it was?'),
  ],choices:[say('What next bit?','margin-next'),say('Leave the road alone.','margin-road'),mum('margin-quiet')]},
  'margin-next':{stage:'margin',lines:[
    y('What next bit?'),
    o('The bit where you decide to go in. People are very particular about the order.'),
  ],goto:'fate'},
  'margin-road':{stage:'margin',lines:[
    y('Leave the road alone.'),
    o('I have not touched it. You brought the bend with you.'),
    d('Nothing in the picture straightens. You keep your hands where the road would need them.'),
  ],goto:'fate'},
  'margin-quiet':{stage:'margin',lines:[
    d('You keep the small correction in your hands.'),
    o('I will put you down as still driving. That gives us something to start from.'),
  ],goto:'fate'},
  // ── you ──────────────────────────────────────────────────────────────────────
  fate:{stage:'fate',lines:[
    o('Now. You. I have been looking forward to you.'),
    d('More of the eyes have turned this way than you would have thought it had left.'),
    o('I have seen this night a good many ways. They are all very well made. Ask me one.'),
  ],revisitLines:[o('Another?')],choices:[
    fate('I\'ll finish the job and go home.','f-home'),
    fate('Then I stop whatever this is.','f-seal'),
    fate('Somebody will help me.','f-help'),
    fate('There\'s always another way out.','f-door'),
    fate('I could get the last one out.','f-carry'),
    fate('I could just stop, and listen.','f-bench'),
    say('Is there one where I\'m all right?','f-none'),
    say('That\'s enough.','f-enough'),
  ]},
  'f-home':{...back,lines:[
    y('I\'ll finish the job and go home.'),
    o('You might! A car park. Morning. Nothing wrong with the light at all. A cup of coffee the guard gave you, gone cold.'),
    o('Then you listen back to your five clean minutes, and you hear what is on them, and somebody in an office tells you it was the coffee.'),
    o('Believe them, if you like. Say you slept through all of it. I would let you.'),
  ]},
  'f-seal':{...back,lines:[
    y('Then I stop whatever this is.'),
    o('You can. There is a screen in the chapel. You put your hand on it, you finish what he could not say, and you keep your hand there.'),
    o('It closes. It works, even. You are on the inside of it when it does, and the last thing to go out is your own torch.'),
  ]},
  'f-help':{...back,lines:[
    y('Somebody will help me.'),
    o('Somebody will. There is a man on the gate, and he is kind, and I am not being funny. He tries. They file it under what he tried.'),
    o('It is the same ending, with a witness.'),
  ]},
  'f-door':{...back,lines:[
    y('There\'s always another way out.'),
    o('There is! It is not on the drawings. It is grey, and it opens, and you are so pleased.'),
    o('I will not spoil what is behind it. There is a great deal more of it than you would think, and then another grey door.'),
  ]},
  'f-carry':{...back,lines:[
    y('I could get the last one out.'),
    o('You would, too. On your back, down the service road, into the morning, the two of you.'),
    o('He will thank you. Do listen to who is doing the thanking.'),
  ]},
  'f-bench':{...back,lines:[
    y('I could just stop, and listen.'),
    o('There is a bench. I would like that. There is a piece I want you to hear. You are hearing it now, and you have not asked.'),
    o('You sit. It holds your weight. There is no waking up farther along the corridor, and you will not mind as much as you should.'),
  ]},
  'f-none':{stage:'last',lines:[
    y('Is there one where I\'m all right?'),
    d('All of the eyes that are left look at you.'),
    o('Who knows? Nothing is ever for certain.'),
    o('You could always just drive off. People have. They never write.'),
  ],goto:'off'},
  'f-enough':{stage:'last',lines:[
    y('That\'s enough.'),
    o('It is. You have a bend coming up.'),
  ],goto:'off'},
  off:{stage:'last',lines:[
    o('Last thing. When you are in there, with the red light on and the needle sat at nothing: hold your breath.'),
    o('You will want the practice.'),
    d('With all the eyes shut, the hole is the only thing that still seems to be looking.'),
    o('When it gets quiet, do not hurry to be the next thing in it.'),
  ],goto:'wipers'},
  wipers:{stage:'gone',lines:[
    d('The wipers come back across.'),
    d('You are nearly there. You have been nearly there for some time.'),
    d('Your thumb is still on the seam. You do not remember checking which side of it.'),
  ],goto:'card'},
  card:{stage:'gone',card:['21:38','DEMOLITION 06:00','8 HOURS REMAIN'],seconds:6.5,lines:[line('direction','',{signalRole:'unattributed'})]},
};
// The text-review and replay systems know a line by its source id.
for(const[id,node]of Object.entries(nodes))for(const[collection,rows]of[['line',node.lines],['return',node.revisitLines||[]]])rows.forEach((row,k)=>{row.sourceId=`opening-prologue:${id}:${collection}:${k}`;});

export const OPENING_PROLOGUE=freeze({version:4,propRange:320,entry:'start',signalRole:'unattributed',keys:keyed,nodes});

const POSITIONS=new Set(['eye','target','hole']),SKIP=new Set(['seconds']);
function between(from,to,t,reducedMotion){
  const u=ease(t),out={};
  for(const name of Object.keys(to)){
    if(SKIP.has(name))continue;
    const a=from[name],b=to[name],k=reducedMotion&&POSITIONS.has(name)?1:u;
    out[name]=Array.isArray(b)?b.map((v,n)=>mix(a[n],v,k)):mix(a,b,k);
  }
  return out;
}
/** Where the picture is. It goes where the talk last pointed it, in its own time,
 * and never holds the talk up. With reduced motion a move is a cut. */
export function createOpeningPrologueStage({reducedMotion=false}={}){
  const keys=OPENING_PROLOGUE.keys;
  let from=keys.dark,to=keys.dark,local=0,clock=0,id='dark';
  const now=()=>between(from,to,clamp(local/Math.max(.01,to.seconds)),reducedMotion);
  const stage={
    to(key){if(!keys[key]||key===id)return false;from=now();to=keys[key];id=key;local=0;return true;},
    advance(dt){const step=Math.max(0,Number(dt)||0);clock+=step;local+=step;},
    snap(){local=Math.max(.01,to.seconds);},
    id:()=>id,time:()=>clock,
    view(){
      const s=now(),eye=reducedMotion?s.eye:[s.eye[0]+.3*Math.sin(clock*.11),s.eye[1]+.18*Math.sin(clock*.07),s.eye[2]+.3*Math.cos(clock*.09)],
        d=s.target.map((v,k)=>v-eye[k]);
      return{...s,eye,time:clock,yaw:Math.atan2(d[0],-d[2]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2]))};
    },
  };
  return stage;
}
// What the renderer needs to stand somewhere real for the length of it.
export const OPENING_PROLOGUE_SET=freeze({renderGroup:tower.renderGroup,floorH:tower.floorH,set:tower.set,renderSetId:'school',observerSpace:tower.observerSpace||null,observerAt:tower.observerAt||null,windowPolicy:tower.windowPolicy,windowId:tower.windowId||null,lightingOverride:tower.staging?.lightingOverride||undefined,lightScales:tower.staging?.lightScales||undefined});
