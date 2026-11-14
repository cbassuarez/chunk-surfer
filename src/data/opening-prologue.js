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
  ['whole',{seconds:9,wheels:[1,1,1],open:24,moon:0,eye:[90,61,-6]}],
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
// The first chosen act, including refusal, has its own poses. None borrows the
// filed history's eye-count or inherits a later fall.
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
  kept:{...keyed.whole,seconds:7,eye:[86,65,-10],target:[80,70.5,-16],radius:1.2,shut:1},
  refused:{...keyed.whole,seconds:4,shut:1},
});

const line=(who,text,extra={})=>({who,text,voice:false,say:false,...extra});
// The other is heard (Seb, 2026-11-05): its lines are spoken, in its own
// voice (`other` in src/audio/sam-voice.js). Narration and his own replies stay
// on the page.
const d=text=>line('direction',text,{signalRole:'unattributed'}),o=text=>line('unknown',text,{signalRole:'unattributed',voice:true,voiceSpeaker:'other'}),y=text=>line('me',text,{signalRole:'human'});
const say=(text,go)=>({text:`"${text}"`,goto:go});
const mum=(go,text='(say nothing)')=>({text,goto:go});
const fate=(text,go)=>({...say(text,go),hideWhenAsked:true});
const back={goto:'fate',stage:'fate',fate:true};
const ask=(text,go)=>({...say(text,go),hideWhenAsked:true});
const action=(text,go)=>({...mum(go,text),hideWhenAsked:true});

const nodes={
  // ── the blink ────────────────────────────────────────────────────────────────
  start:{stage:'dark',lines:[
    d("You have been on this motorway for quite some time. It's been raining on the road for longer, and it's been of no surprise to you. The last few weeks have been a gray mass of dull weather. The wipers go."),
    d('You blink.'),
    d('It is a long blink, you think.'),
    d('Your thumb rests on the seam of the steering wheel; you can feel the join in the leather.'),
  ],goto:'there'},
  there:{stage:'woken',lines:[
    o('There you are.'),
    d('A deep voice bellows from outside the van, but you can hear it so, so well. It comes at you the way a room fades into earshot when the fridge cuts out.'),
    o("I have been waiting for you to get here. I have been waiting for ages. What took you so long?"),
  ],choices:[say('Who is that?','who'),say('I\'m driving.','driving'),mum('quiet')]},
  who:{stage:'inner',lines:[
    y('Who is that?'),
    o("Nobody you would know, and everyone you've ever met. I keep late hours. I have been the cough in a slow movement, and the string that goes in the last eight bars. I am the sound that leaves your breath as you think of them."),
    o('I have been the chair that creaks on the only good take. I am very much thought about; rarely ever acknowledged.'),
  ],goto:'look'},
  driving:{stage:'inner',lines:[
    y('I\'m driving.'),
    o('You are! Beautifully. Both hands, ten and two!'),
    d('The wipers move so beautifully; they glide across the windscreen, and you can feel the rhythm of the blades as they pass over the glass.'),
  ],goto:'look'},
  quiet:{stage:'inner',lines:[
    d('You say nothing. You\'re pretty good at it.'),
    o('Good. Do not start talking now. You would only have to stop again at the door.'),
    d('At some point you will have to stop pretending you\'re not seeing things.'),
  ],goto:'look'},
  // ── the interval ─────────────────────────────────────────────────────────────
  look:{stage:'interval',lines:[
    d('Three wheels have torn away from one another and gone on turning, round a hole in nothing. The wheels are full of eyes, full of eyes, full of eyes eyes eyes eye see youyouyouyouyouyouyouyou.'),
    o('Before you reach your destination, I want to play a game. Are yourhands on the wheel?'),
  ],revisitLines:[
    d('Your hands have not moved. The eyes have.'),
    o('Still here. You may ask another, or we can get on with the job.'),
  ],choices:[
    ask('What am I looking at?','interval-eyes'),
    ask('I\'m keeping my hands on the wheel.','interval-wheel'),
    action('(look away)','interval-avert'),
    {...mum('interval-silent'),hideWhenAsked:true},
    action('(refuse the game)','interval-refuse'),
  ]},
  'interval-refuse':{stage:'refused',openingAct:'refuse',lines:[
    y('No. I am not playing a game for you.'),
    o('Of course not. Keep your hands where you want them. I will keep mine where I want \'em.'),
    d('One eye shuts. The wheels go on turning.'),
  ],goto:'kept'},
  'interval-eyes':{stage:'counted',lines:[
    y('What am I looking at?'),
    o('I do\'nt think you\'d want the answer to that question.'),
    d('You count twenty-four eyes. Twenty-three close. The last seems nearer than the wheel that carries it.'),
    o('Holy...'),
  ],choices:[say('You first.','interval-first'),mum('interval-meet','(hold its gaze)')]},
  'interval-first':{stage:'unseen',openingAct:'refuse',lines:[
    y('You first.'),
    o('Oh, I can.'),
    d('The last eye goes dark. You still feel watched from exactly there.'),
    o('Now what were you going to do about the job?'),
  ],goto:'kept'},
  'interval-meet':{stage:'near',openingAct:'gaze',lines:[
    d('For a moment there is no room to look beside it. Your own eye begins to water.'),
    o('You can hold a look. Good. A minute is longer than that.'),
  ],goto:'kept'},
  'interval-wheel':{stage:'grip',lines:[
    y('I\'m keeping my hands on the wheel.'),
    d('You can still feel the seam under your thumb. As your vision blurs every now and then (maybe the tear in your eye, maybe something else) you use that seam to guide you back to the roadway.'),
    o('And somehow it simply won\'t make a difference, I\'m sorry to say.'),
    y('What? But I\'m doing so well!'),
    o('That you are. But sometimes it is not enough. You can keep your hands on the wheel, and you can keep your eyes on the road, and still somehow the road gives out, and still somehow the job is not complete, and somehow your love is not who you thought they were, and somehow it all comes crashing down. It\'s all rather unfortunate; it usually is.'),
  ],choices:[mum('interval-hold','(tighten your grip)'),mum('interval-release','(open your hands)')]},
  'interval-hold':{stage:'held',openingAct:'grip',lines:[
    d('Three eyes close, one after another. The seam stops moving. You have not moved your hands in what seems like an eternity.'),
  ],goto:'kept'},
  'interval-release':{stage:'released',openingAct:'release',lines:[
    d('You splay your fingers around the wheel. The seam stays against your thumb anyway. There\'s not much keeping you awake but the road, the radio, and the giant talking hole in the sky. As it is, even this combo is not enough to keep you from drifting.'),
    o('Eyes, my dear. You have to keep your eyes on the road.'),
  ],goto:'kept'},
  'interval-avert':{stage:'averted',lines:[
    d('You turn from the wheels. The dark is exactly as deep on this side.'),
    o('Better? I can wait. The road cannot.'),
  ],choices:[mum('interval-wait','(keep looking away)'),mum('interval-return','(look back)')]},
  'interval-wait':{stage:'averted',openingAct:'avert',lines:[
    d('You wait for something to arrive at the edge of your sight. Nothing does.'),
    o('You are remarkably good at this. Are you sure this is your first night?'),
  ],goto:'kept'},
  'interval-return':{stage:'interval',openingAct:'return',lines:[
    d('The wheels are where you left them. You have the unpleasant thought that you have come back on a different side.'),
  ],goto:'kept'},
  'interval-silent':{stage:'unseen',openingAct:'silence',lines:[
    d('You give it no answer. The eyes shut in order, as though a name is being read for each one.'),
    o('For someone heading off to such quiet grounds, I advise you to use your words. You\'ll face some time without being able to speak.'),
  ],goto:'kept'},
  kept:{stage:'kept',lines:[
    d('The wheels go on turning. One eye has stayed shut; for every minute that passes, its steadfastness in staying closed frightens you more and more.'),
    o('If it\'s any indication of your commitment to the job, I\'d say you\'re doing very well.'),
  ],goto:'job'},
  // ── the job ──────────────────────────────────────────────────────────────────
  job:{stage:'whole',lines:[
    y('Ask me about the job.'),
    o('Tell me about the job. Go on, I love how people tell it.'),
  ],choices:[say('Five rooms. One clean minute of each.','job-rooms'),say('Well, it\'s four hundred quid.','job-money'),say('It\'s just a job, like any other.','job-just')]},
  'job-rooms':{stage:'whole',lines:[
    y('Five rooms. One clean minute of each.'),
    o('With nothing in it.'),
    y('With nothing in it. A basement studio, the pool, the concert hall, one of the practice rooms in the practice wing and the chapel. Kinda creepy old school, but I\'ve been dying to hear the reverb in the pool.'),
  ],goto:'job-sheet'},
  'job-money':{stage:'whole',lines:[
    y('Well, it\'s four hundred quid.'),
    o('To stand very still in five rooms and not make a sound. I have seen many people do it for nothing, known people do it for years.'),
  ],goto:'job-sheet'},
  'job-just':{stage:'whole',lines:[
    y('It\'s just a job, like any other.'),
    o('It is a lovely job. They ring up a person whose whole job is to listen and stand still. But you\'re known in the business, or so I see; your recordings are pristine, beautifully empty. Practically zero extra noise. That\'s why they\'ve your number.'),
  ],goto:'job-sheet'},
  'job-sheet':{stage:'whole',lines:[
    d('The sheet sits in the passenger seat. Ellery Conservatoire of Music, condemned. Demolition begins 06:00 Thursday. Bring a light.'),
    d('One clean minute of each, with nothing in it. No handling noise, no clothing, no breath.'),
    o('No breath, can you believe it! Read me the next bit. I could hear it all night. I love it.'),
    d('If you can hear yourself on the take, that\'s not the room, and we won\'t accept it.'),
    o('Who wants a minute of an empty room, d\'you suppose?'),
  ],goto:'last-one'},
  client:{stage:'whole',lines:[
    y('Who signed for W. Ellery Holdings?'),
    o('A good question.'),
    d('The signature is illegible. The authorising officer\'s field is blank under every carbon.'),
    o('There. Now you have asked, and it cost you nothing. It is a very old firm.'),
  ],goto:'file'},
  'no-ask':{stage:'whole',lines:[
    y('I don\'t ask.'),
    o('No you don\'t. Neither did the last one.'),
  ],goto:'file'},
  'last-one':{stage:'whole',lines:[
    d('The prior contractor delivered four accepted room tones; the verdict remains open on what happened to the fifth take, but it\'s the reason you\'re here, driving to this posh, derelict school for less than the cost of one of their students\' weekly allowance.'),
  ],goto:'ellery'},
  fifth:{stage:'whole',lines:[
    y('What happened to the fifth?'),
    o('Who knows? Or maybe I do know, and just won\'t tell you. If you see a cow in the road which happens to be cardboard, but there was a cow behind it, does it matter that the first cow was cardboard?'),
  ],goto:'file'},
  him:{stage:'whole',lines:[
    y('What happened to him?'),
    o('Well, that would be quite the spoiler now, wouldn\'t it?'),
  ],goto:'file'},
  'not-mine':{stage:'whole',lines:[
    y('Not my problem.'),
    o('No, but it soon might just be.'),
  ],goto:'file'},
  // ── the school ───────────────────────────────────────────────────────────────
  ellery:{stage:'ellery',lines:[
    o('You have not asked what it was. They never do. Have a look.'),
    d('There is a below, it turns out. Wet tarmac, railings, a tree somebody planted on purpose. A long front with its power off.'),
    o('Public baths, to begin with. Over a century old, with this beautiful aqua tile (you\'ll seriously love it), people went in to get clean. Then a school bought the baths, and the pub came with it, and so half the street.'),
    o('It never stopped being about getting clean.'),
  ],choices:[say('What kind of school?','school'),say('Did you go there?','attended'),mum('school-quiet')]},
  // The short account belongs to the encounter. Details remain a voluntary
  // inquiry, and every answer comes back here without reciting that account.
  file:{stage:'school',lines:[
    o('I\'ve got more. You can ask, or leave it there.'),
  ],revisitLines:[o('What else?')],choices:[
    ask('Who signed for the client?','client'),ask('What happened to the fifth room?','fifth'),
    ask('What happened to the last recordist?','him'),ask('What happened to the boy?','boy'),
    ask('What was his name?','boy-name'),ask('What happened in the tower?','tower'),
    ask('I don\'t ask.','no-ask'),ask('Not my problem.','not-mine'),
    say('What does that leave me to hear?','hearing'),
  ]},
  hearing:{stage:'notice',lines:[
    y('What does that leave me to hear?'),
    o('By midnight you will be standing in those rooms, being paid to hear nothing. Somebody ought to tell you what you will be hearing nothing of.'),
  ],goto:'margin'},
  'hearing-quiet':{stage:'notice',lines:[
    d('You say nothing. The notice has not been answered. Your work order has.'),
    o('Five clean minutes. You see the difficulty.'),
  ],goto:'margin'},
  school:{stage:'school',lines:[y('What kind of school?')],goto:'school-told'},
  attended:{stage:'school',lines:[
    y('Did you go there?'),
    o('I attended. Every lesson, every night, every year, the best seat in the house. You will not find me on a register. I have looked.'),
  ],goto:'school-told'},
  'school-quiet':{stage:'school',lines:[d('You keep quiet. It tells you anyway.')],goto:'school-told'},
  'school-told':{stage:'school',lines:[
    o('They take a child with a dream of being a musician, a performer, dancer, harpsichordist, composer, revolutionary ... and correct it. Reference listening, over and over and over and over. Again. Again. Another sonata, another mistake, another recording. The same bar, the same small fault, until their ears begin to scream for silence. Again. Again. More exercises, more method books, more practice, more lessons, more listening, until their fingers are bent and their hands are twisted and their eyes are red and their ears can\'t stop hearing every little perturbation in the world. Again. Again. Again. Again. Again.'),
    o('Until you can hear a wrong note through a wall, in your sleep, in your mother saying your name.'),
    d('You have worked with people who came out of Ellery. They flinch at fridges, and they can all tell you what note their toilet flushes produce.'),
    o('One got very good. He could hear everything. Then he stopped coming down to lessons. He stopped eating. He just kept... listening. Harder and harder, until his body became nothing, and he became sound itself.'),
  ],goto:'coverup'},
  coverup:{stage:'boy',lines:[
    o('The classmates say the boy was recovered from a chamber room upstairs, but the public account of the incident tells a different story.'),
    d('Recovery entered on the internal sheet. External register to retain MISSING. Medical finding: inconclusive.'),
    o('The others knew. They would not dare play over it with sounds of practice or performance. They, too, fell silent. It was the quietest period in the building since its construction. At first, some outlets thought the students were postmodernists trying to make a statement with a new performance art piece, and then some of them broke their vows and ran to the news.'),
  ],goto:'notice'},
  'boy-name':{stage:'school',lines:[
    y('What was the kid\'s name?'),
    o('The other students decided to call him nothing, out of respect for his initial vow of silence.'),
  ],goto:'file'},
  boy:{stage:'school',lines:[y('What happened to the boy?')],goto:'boy-told'},
  'boy-told':{stage:'boy',lines:[
    o('He is missing. Look, the official school report says so.'),
    d('The public register says MISSING, its telex type likely rushed in a series of quick communiques to the public.'),
    o('The recovered body is a separate matter. They took that out of a chamber room on the third floor.'),
    d('Recovery entered on the internal sheet. External register to retain MISSING. Medical finding: inconclusive.'),
    o('And the others knew. They are musicians. You cannot hide a missing boy from people who can hear which floor he is not practicing on.'),
  ],goto:'file'},
  notice:{stage:'notice',lines:[
    d('The students collectively put up a poster denouncing the school administration, demanding that the school acknowledge that the boy\'s body was recovered from the ringing room.'),
    d('Acknowledge that his body was recovered here. Until that acknowledgment is made, we will not rehearse or perform. We will not play over what happened.'),
    d('The school, in turn, hired a firm to represent their best interests. Following their suggestions, the administration pushed the issue over the summer and into the fall, using meetings and the endless proposal of scheme after scheme, forcing the students to forget about the issue and quietly return to their studies. Most students who cared deeply ended up graduating that summer, and those who remained were haunted by the silence. The school has not acknowledged that the boy\'s body was recovered from the ringing room.'),
  ],choices:[say('Good for them for trying.','good'),say('What did the school say?','office'),
    say('What else is in the file?','file'),say('What does that leave me to hear?','hearing'),mum('hearing-quiet')]},
  good:{stage:'notice',lines:[
    y('Good for them for trying.'),
    o('Is it not? Every room in the place silent, for the first time since it opened. You have no idea how lovely that was.'),
  ],goto:'file'},
  office:{stage:'notice',lines:[
    y('What did the school say?'),
    o('They are still not answering. It is the longest piece anyone has ever performed there; the school administration had always wanted a performance they can rest their legacy on, and in the handling of this incident, it found one.'),
  ],goto:'file'},
  tower:{stage:'roll',lines:[
    o('So nobody played. Some stopped eating. And some went up the tower, to the ringing room, where it was most quiet for some time. Out of respect for the boy, the student bellringers of both the school chapel and the surrounding cathedral towers refused to ring the square\'s bells.'),
    d('Transfer receipts. Students\' bodies, removed from the ringing room en masse. Administration had a last-minute meeting internally to discuss enrollment after this incident; they found that losing 5% of your enrollment in one go is not ideal for the c-suite, and something had to be done. Out goes another press release, and another firm was hired to revamp the school\'s image. A new logo was proposed.'),
    d('You should have seen the internal memoranda on the subject. The school\'s lawyers have their own special 1.5m cubed little compartment in hell.'),
    o('"Refusal to rehearse is not a medical finding." Somebody seriously sat down and typed that.'),
  ],choices:[say('Did you do that?','did'),say('Why are you telling me?','why'),mum('tower-quiet')]},
  did:{stage:'roll',lines:[
    y('Did you do that?'),
    o('Look at me. I am a hole. I have never so much as lifted a bow.'),
    y('That isn\'t a no.'),
    o('It is not. They told me you were cheap. They did not say you were quick.'),
  ],goto:'file'},
  why:{stage:'roll',lines:[
    y('Why are you telling me?'),
    o('Because by midnight you will be standing in those rooms, being paid to hear nothing. Somebody ought to tell you what you will be hearing nothing of, whose legacy you will be standing on, and what it cost them to become atoms of air in your little recording. You deserve to know where you stand in all of this.'),
  ],goto:'file'},
  'tower-quiet':{stage:'roll',lines:[
    d('You say nothing. You have a professional reason.'),
    o('That is it. That is exactly what they all did. Looks like you\'ll fit right in.'),
  ],goto:'file'},
  margin:{stage:'margin',lines:[
    d('The road dips. Your hands have corrected for a bend you cannot see.'),
    o('Good. You are still driving.'),
    o('Do you want me to put the next bit back where it was?'),
  ],choices:[say('What next bit?','margin-next'),say('Leave the road alone.','margin-road'),mum('margin-quiet')]},
  'margin-next':{stage:'margin',lines:[
    y('What next bit?'),
    o('The next bit up the road. Or we can play another game.'),
  ],goto:'fate'},
  'margin-road':{stage:'margin',lines:[
    y('Please leave the road alone.'),
    o('Alright, me, the floating hole in the sky, will leave the road alone.'),
    d('Nothing straightens. You think you should keep your hands where the road might need them.'),
  ],goto:'fate'},
  'margin-quiet':{stage:'margin',lines:[
    d('You keep the small correction in your hands.'),
    o('I will put you down as still driving. That gives us something to start from.'),
  ],goto:'fate'},
  // ── you ──────────────────────────────────────────────────────────────────────
  fate:{stage:'fate',lines:[
    o('Now. On you. I have been looking forward to you.'),
    d('More of the eyes have turned this way than you would have thought it had left.'),
    o('I have seen this night a good many ways. They are all very well made. Ask me one.'),
  ],revisitLines:[o('Another?')],choices:[
    fate('The one where I finish the job and go home.','f-home'),
    fate('The one where I stop whatever this is.','f-seal'),
    fate('The one where somebody helps me.','f-help'),
    fate('The one where there\'s  another way out.','f-door'),
    fate('The one where I get the last recorder out.','f-carry'),
    fate('The one where I just stop and listen.','f-bench'),
    say('Is there one where I\'m all right?','f-none'),
    say('That\'s enough.','f-enough'),
  ]},
  'f-home':{...back,lines:[
    y('I\'ll finish the job and go home.'),
    o('You might! A car park. Morning. Nothing wrong with the light at all. A cup of coffee the guard gave you, gone cold.'),
    o('You might listen back. Five clean minutes. Perhaps there is something on them. Perhaps you have just learned to hear it.'),
    o('A perfectly ordinary morning. I would hate to be the one who made you doubt it.'),
  ]},
  'f-seal':{...back,lines:[
    y('Then I stop whatever this is.'),
    o('You might. Suppose it closes. Suppose it works, even. People do like a job that stays done.'),
    o('You would be on the inside, mind. Your own torch would be the last thing to go out.'),
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
    o('You would, too. Down the service road, into the morning, the two of you.'),
    o('He will thank you. Do listen to who is doing the thanking.'),
  ]},
  'f-bench':{...back,lines:[
    y('I could just stop, and listen.'),
    o('There is a bench. I would like that. There is a piece I want you to hear.'),
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
    o('Last thing. In there, take your time. It\'s not worth it if you don\'t enjoy it. I hope you enjoy it.'),
    o('I can\'t tell you everything here, I just can\'t. But I\'ll tell you it was beautiful. It was beautiful, and it was quiet, and it was the best thing you\'ve ever heard.'),
    d('All the eyes shut. The hole still seems to be looking.'),
    o('When it gets quiet, give yourself in for a moment. Bathe in the silence.'),
  ],goto:'wipers'},
  wipers:{stage:'gone',lines:[
    d('The wipers come back across.'),
    d('You are nearly there. You have been nearly there for some time.'),
    d('Your thumb is still on the seam. You\'re wearing in the leather more and more with every rub of the joinery.'),
  ],goto:'card'},
  card:{stage:'gone',card:['21:38','DEMOLITION 06:00','8 HOURS REMAIN'],seconds:6.5,lines:[line('direction','',{signalRole:'unattributed'})]},
};
// Meaning and legacy pose names are separate. The connected camera/score can
// follow the conversation's intent without an optional file answer at 'whole'
// sending the observer back above the building. All existing pose keys remain
// available to independent tools and reduced-motion presentation.
const semanticPhases={
  road:['start'],
  recognition:['there','who','driving','quiet','look','interval-refuse','interval-eyes','interval-first','interval-meet',
    'interval-wheel','interval-hold','interval-release','interval-avert','interval-wait','interval-return','interval-silent',
    'kept','job','job-rooms','job-money','job-just','job-sheet','last-one'],
  ellery:['client','no-ask','fifth','him','not-mine','ellery','file','hearing','hearing-quiet','school','attended',
    'school-quiet','school-told','coverup','boy-name','boy','boy-told','notice','good','office','tower','did','why','tower-quiet'],
  personal:['margin','margin-next','margin-road','margin-quiet','fate','f-home','f-seal','f-help','f-door','f-carry','f-bench','f-none','f-enough','off'],
  return:['wipers','card'],
};
for(const[semanticPhase,ids]of Object.entries(semanticPhases))for(const id of ids)nodes[id].semanticPhase=semanticPhase;
// The text-review and replay systems know a line by its source id.
for(const[id,node]of Object.entries(nodes))for(const[collection,rows]of[['line',node.lines],['return',node.revisitLines||[]]])rows.forEach((row,k)=>{row.sourceId=`opening-prologue:${id}:${collection}:${k}`;});

export const OPENING_PROLOGUE=freeze({version:6,propRange:320,entry:'start',signalRole:'unattributed',keys:keyed,nodes});

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
