import {academicBouncerLine} from './academic-bouncers.js';
import {academicSocietyLine} from './academic-society.js';

const formal='academic-bouncer-formal',dry='academic-bouncer-dry';
const g=(role,text,extra={})=>Object.freeze({...academicBouncerLine(role,text,extra.performanceCue||'recollect'),
  toActorId:role==='formal'?dry:formal,...extra});
const beat=(id,admission,lines)=>Object.freeze({id,admission,area:'loggia',lines:Object.freeze(lines)});
export const ACADEMIC_BOUNCER_SOCIAL_TIMING=Object.freeze({firstExchange:3.5,quietBetween:22,maxTick:.5});
export const ACADEMIC_BOUNCER_SOCIAL_TOPICS=Object.freeze(['doorwork','register','music','portraits','stay']);

// The learned question and its four-second turn belong exclusively to the
// admission encounter. None of this idle company announces that cue.
export const ACADEMIC_BOUNCER_SOCIAL_BEATS=Object.freeze([
  beat('opening-rota','before',[
    g('formal','Agathe wanted a time for the opening.',{performanceCue:'recollect'}),
    g('dry','Did you give her one?',{performanceCue:'offer',responseCue:'guarded'}),
    g('formal','I gave her a heading.',{performanceCue:'assure',responseCue:'amused'}),
    g('dry','She will enjoy that for hours.',{performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('closing-complaint','before',[
    g('dry','Odette says we are blocking her closing round.',{performanceCue:'recollect'}),
    g('formal','We are receiving.',{performanceCue:'object',responseCue:'guarded'}),
    g('dry','You can receive a complaint.',{performanceCue:'offer',responseCue:'amused'}),
    g('formal','Then we have received her.',{performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('expected-posture','before',[
    g('formal','Stand as though someone is expected.',{performanceCue:'assure'}),
    g('dry','Someone is standing right there.',{performanceCue:'object',responseCue:'guarded'}),
    g('formal','And you could learn from their patience.',{performanceCue:'concede',responseCue:'amused'}),
  ]),
  beat('an-invitation-for-both','after',[
    g('formal','Celeste keeps asking us to sit down.',{performanceCue:'recollect'}),
    g('dry','She means both of us.',{performanceCue:'assure',responseCue:'guarded'}),
    g('formal','And leave the door unattended?',{performanceCue:'object',responseCue:'amused'}),
    g('dry','That is the part she has been trying to explain.',{performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('veras-good-side','after',[
    g('formal','Noe says my profile is wasted on the stair.',{performanceCue:'recollect'}),
    g('dry','He does like a potential customer.',{performanceCue:'object',responseCue:'guarded'}),
    g('formal','He has an eye.',{performanceCue:'assure',responseCue:'amused'}),
    g('dry','On anyone who might compliment him.',{performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('an-irregular-formation','after',[
    g('dry','I could go and see what they are arguing about.',{performanceCue:'offer'}),
    g('formal','You would miss an entrance.',{performanceCue:'object',responseCue:'guarded'}),
    g('dry','You would miss me missing it.',{performanceCue:'concede',responseCue:'amused'}),
    g('formal','I dislike an irregular formation.',{performanceCue:'assure',responseCue:'settle'}),
  ]),
  beat('hugh-odette-closing','after',[
    g('dry','Odette. Are we open or closed?',{toActorId:'odette',performanceCue:'offer'}),
    Object.freeze(academicSocietyLine('odette','You are in the way.',{toActorId:dry,performanceCue:'assure',responseCue:'guarded'})),
    g('dry','At last. A definite answer.',{toActorId:'odette',performanceCue:'concede',responseCue:'amused'}),
  ]),
  beat('hugh-agathe-category','after',[
    Object.freeze(academicSocietyLine('agathe','Staff are not included in the guest total.',{toActorId:dry,performanceCue:'assure'})),
    g('dry','Vera will be devastated. She has practised looking expected.',{toActorId:'agathe',performanceCue:'recollect',responseCue:'guarded'}),
    Object.freeze(academicSocietyLine('agathe','I could add a category.',{toActorId:dry,performanceCue:'offer',responseCue:'amused'})),
    g('dry','Please do not. She will make us dress for it.',{toActorId:'agathe',performanceCue:'object',responseCue:'settle'}),
  ]),
]);

export function academicBouncerSocialBeatLines(beat,state={}){
  const topics=new Set(state.topics||[]);
  if(beat.id==='opening-rota'&&topics.has('register'))return[
    g('formal','Our visitor has now heard about the register.',{performanceCue:'assure'}),
    g('dry','Agathe will want an acknowledgment.',{performanceCue:'object',responseCue:'amused'}),
    g('formal','She can use our visitor\'s expression.',{performanceCue:'concede',responseCue:'settle'}),
  ];
  if(beat.id==='an-invitation-for-both'&&topics.has('stay'))return[
    g('dry','We could accept Celeste\'s invitation together.',{performanceCue:'offer'}),
    g('formal','We are together.',{performanceCue:'assure',responseCue:'guarded'}),
    g('dry','You make a compelling case for staying on the stair.',{performanceCue:'concede',responseCue:'amused'}),
  ];
  if(beat.id==='veras-good-side'&&topics.has('portraits'))return[
    g('formal','I have explained why Noe cannot have my profile.',{performanceCue:'recollect'}),
    g('dry','She would have to stop watching the entrance.',{performanceCue:'assure',responseCue:'guarded'}),
    g('formal','And you would have to stop improving the explanation.',{performanceCue:'object',responseCue:'amused'}),
  ];
  return beat.lines.map(line=>({...line}));
}

const topic=(id,text)=>({text,goto:id,bouncerTopic:id});
const back=()=>[{text:'ask something else',goto:'start'},{text:'leave them to the door',goto:'leave'}];
const node=(lines,choices)=>({speaker:'VERA / HUGH',lines,...(choices?{choices}:{})});
const player=text=>({who:'me',voiceSpeaker:'me',sourceLabel:'YOU',text,say:false});

export function academicBouncerSocialDialogue(state={},{societyState={}}={}){
  societyState=societyState&&typeof societyState==='object'?societyState:{};
  const asked=new Set(state.topics||[]),returning=(state.conversations||0)>0;
  const last=[...(state.topics||[])].at(-1);
  let opening=[g('formal','You need not repeat the welcome. It was heard the first time.',{toPlayer:true,performanceCue:'assure'}),
    g('dry','That is more than we can say for most welcomes.',{performanceCue:'concede',responseCue:'amused'})];
  if(returning){
    const returned={
      doorwork:[g('formal','We are still at the part before good evening.',{performanceCue:'recollect'}),g('dry','It has excellent job security.',{performanceCue:'concede',responseCue:'amused'})],
      register:[g('formal','Agathe still refuses to count us twice.',{performanceCue:'object'}),g('dry','Vera calls that a staffing issue.',{performanceCue:'concede',responseCue:'amused'})],
      music:[g('formal','Hugh is still defending the wrong notes.',{performanceCue:'object'}),g('dry','They give Sabine something to love.',{performanceCue:'assure',responseCue:'guarded'})],
      portraits:[g('formal','My profile remains unavailable.',{performanceCue:'assure'}),g('dry','Noe will have to console himself with the other side.',{performanceCue:'concede',responseCue:'amused'})],
      stay:[g('formal','We are both still here.',{performanceCue:'assure'}),g('dry','She makes it sound like a triumph of procedure.',{performanceCue:'concede',responseCue:'amused'})],
    };
    opening=returned[last]||[g('dry','Back through the door. You do make our duties look possible.',{toPlayer:true,performanceCue:'offer'}),
      g('formal','A familiar entrance is still an entrance.',{performanceCue:'assure',responseCue:'settle'})];
  }
  const musicContext=societyState.consent==='lent'
    ?[player('Emile is using my voice.'),g('dry','You have heard him with living air, then.',{toPlayer:true,performanceCue:'recollect'}),
      g('formal','Celeste will have heard him too.',{performanceCue:'assure',responseCue:'guarded'}),
      g('dry','I should like to hear her review. Sabine would be furious.',{performanceCue:'concede',responseCue:'amused'})]
    :societyState.topics?.sabine?.includes('reviews')
      ?[player('Sabine has been explaining her reviews.'),g('dry','She has? We have been waiting a long time.',{toPlayer:true,performanceCue:'offer'}),
        g('formal','She once called our welcome overextended.',{performanceCue:'object',responseCue:'amused'}),
        g('dry','Vera thought it was a compliment. There was a long evening after that.',{performanceCue:'concede',responseCue:'settle'})]
      :[g('dry','Emile leaves something wrong in the music. It gives the room an excuse to keep talking.',{performanceCue:'recollect'}),
        g('formal','You like the arguments.',{performanceCue:'object',responseCue:'guarded'}),
        g('dry','I like the part where Celeste decides we are all having a good time.',{performanceCue:'assure',responseCue:'amused'})];
  const nodes={
    start:node(opening,[topic('doorwork','why keep opening the reception?'),topic('register','what do Odette and Agathe make of you?'),
      topic('music',societyState.consent==='lent'?'Emile is using my voice.':societyState.topics?.sabine?.includes('reviews')?'Sabine has been explaining her reviews.':'what do you like about the company here?'),topic('portraits','does everyone have to pass your inspection?'),
      topic('stay','would either of you rather go inside?'),{text:'leave them to the door',goto:'leave'}]),
    doorwork:node(asked.has('doorwork')?[
      g('dry','The beginning is her favourite part.',{performanceCue:'assure'}),
      g('formal','He says that as though beginnings were plentiful.',{performanceCue:'object',responseCue:'guarded'}),
      g('dry','No. I say it because I notice.',{performanceCue:'concede',responseCue:'settle'}),
    ]:[g('formal','A room ought to notice when someone enters it.',{performanceCue:'assure'}),
      g('dry','She practises the welcome when there is nobody to hear it.',{performanceCue:'recollect',responseCue:'amused'}),
      g('formal','You hear it.',{performanceCue:'object',responseCue:'guarded'}),
      g('dry','Yes. I have become an extremely difficult audience.',{performanceCue:'concede',responseCue:'amused'})],back()),
    register:node(asked.has('register')?[
      g('formal','Odette closes. Agathe counts. Someone must receive the discrepancy.',{performanceCue:'assure'}),
      g('dry','You can see why she enjoys this job.',{performanceCue:'concede',responseCue:'amused'}),
    ]:[g('formal','Agathe wants everyone accounted for. Odette wants everyone to know where the door is.',{performanceCue:'recollect'}),
      g('dry','Neither trusts us to finish a sentence.',{performanceCue:'object',responseCue:'amused'}),
      g('formal','Odette does trust you with the landing.',{performanceCue:'assure',responseCue:'guarded'}),
      g('dry','She trusts me to notice when you are standing in it.',{performanceCue:'concede',responseCue:'amused'})],back()),
    music:node(asked.has('music')&&societyState.consent!=='lent'&&!societyState.topics?.sabine?.includes('reviews')?[
      g('dry','A little bad music. Some very good objections.',{performanceCue:'recollect'}),
      g('formal','Hugh will stay for an objection long after the music has stopped.',{performanceCue:'object',responseCue:'amused'}),
      g('dry','You have never left me short of one.',{performanceCue:'concede',responseCue:'settle'}),
    ]:musicContext,back()),
    portraits:node(asked.has('portraits')?[
      g('formal','Noe may inspect whichever side of my face he can see from the gallery.',{performanceCue:'assure'}),
      g('dry','She means none of it. It is a very small concession.',{performanceCue:'concede',responseCue:'amused'}),
    ]:[g('formal','Lucien wears that jacket as though it were an answer.',{performanceCue:'recollect'}),
      g('dry','It is. Noe keeps asking a different question with a pencil.',{performanceCue:'assure',responseCue:'amused'}),
      g('formal','Noe offered to draw my profile. He said I have a decisive line.',{performanceCue:'offer',responseCue:'guarded'}),
      g('dry','You have been repeating it ever since.',{performanceCue:'object',responseCue:'amused'}),
      g('formal','A useful professional opinion bears repeating.',{performanceCue:'concede',responseCue:'settle'})],back()),
    stay:node(asked.has('stay')?[
      g('dry','I am quite comfortable where I can hear her.',{performanceCue:'assure'}),
      g('formal','That could be almost anywhere on this floor.',{performanceCue:'object',responseCue:'amused'}),
      g('dry','I know. I selected my post carefully.',{performanceCue:'concede',responseCue:'settle'}),
    ]:[g('dry','Celeste asks both of us. Vera keeps answering for the door.',{performanceCue:'recollect'}),
      g('formal','Someone should be here when a person arrives alone.',{performanceCue:'assure',responseCue:'guarded'}),
      g('dry','And when no one arrives?',{performanceCue:'offer',responseCue:'amused'}),
      g('formal','You are not alone, are you?',{performanceCue:'concede',responseCue:'settle'}),
      g('dry','No. A remarkably successful arrangement.',{performanceCue:'assure',responseCue:'amused'})],back()),
    leave:node([g('formal','Mind the last turn if you are going down.',{toPlayer:true,performanceCue:'assure'}),
      g('dry','She will want to see your next entrance.',{toPlayer:true,performanceCue:'offer',responseCue:'amused'})]),
  };
  return{id:'academic-bouncer-society',nodes};
}
