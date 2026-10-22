import { ACADEMIC_SOCIETY_CHARACTER_DESIGNS as DESIGNS } from './academic-society-character-design.js';

// Authored metre coordinates on the existing +10m academic floor. These are
// people in accessible rooms, never substitute busts or newly unlocked rooms.
const actor=(id,x,y,yaw,location,gesture)=>Object.freeze({id,name:DESIGNS[id].name,
  mesh:DESIGNS[id].mesh,height:DESIGNS[id].height,source:DESIGNS[id].source,
  x,y,yaw,floor:10,location,gesture,voiceSpeaker:`society-${id}`,sourceLabel:DESIGNS[id].name.toUpperCase(),
  coordinateSpace:'authored-metres',blocks:false});
export const ACADEMIC_SOCIETY_ACTORS=Object.freeze([
  actor('odette',14.5,274.5,0,'academic-loggia','quiet'),
  actor('emile',8.6,250.5,.745,'academic-corridor','argument'),
  actor('celeste',12.2,246.6,-2.396,'academic-chamber','welcome'),
  actor('lucien',25.6,246.2,-Math.PI/2,'academic-gallery','folded'),
  actor('agathe',16.4,275.5,-1.086,'academic-loggia','register'),
  actor('noe',26.6,244.2,-2.678,'academic-gallery','portrait'),
  actor('sabine',11,247.5,-2.467,'academic-chamber','verdict'),
]);
export const ACADEMIC_SOCIETY_TIMING=Object.freeze({firstExchange:2.5,quietBetween:10,
  retryQuiet:4,repriseQuiet:24,maxAmbientAttempts:2,pendingSeconds:90,attentionSeconds:6.5,
  maxTick:.5,earshot:8,loanSeconds:12,secondLoanPulseAt:5,maxLoanPulses:2});
export const ACADEMIC_SOCIETY_RELATIONSHIPS=Object.freeze([
  Object.freeze({from:'celeste',to:'emile',relation:'She keeps inviting him back; she will not let his unfinished music turn hospitality into possession.'}),
  Object.freeze({from:'emile',to:'celeste',relation:'He heckles her old stories because he is frightened of hearing her finish one without him.'}),
  Object.freeze({from:'odette',to:'lucien',relation:'She brought him upstairs, then learned that an invitation does not entitle her to his company.'}),
  Object.freeze({from:'lucien',to:'odette',relation:'He trusts her practical care and is learning to disagree without having to leave.'}),
  Object.freeze({from:'lucien',to:'emile',relation:'He knows how persuasive a familiar voice can be and makes the conditions of borrowing explicit.'}),
  Object.freeze({from:'odette',to:'agathe',relation:'She enjoys Agathe\'s exactness, then reminds her of every kindness she left off the form.'}),
  Object.freeze({from:'agathe',to:'odette',relation:'She calls Odette\'s closing ritual irregular, but depends on it to give the evening a shape.'}),
  Object.freeze({from:'lucien',to:'noe',relation:'He likes being seen as a person who might answer back, and makes the vain portraitist earn each compliment.'}),
  Object.freeze({from:'noe',to:'lucien',relation:'His favourite difficult sitter refuses the noble expression he used to sell; their argument makes better company than a finished likeness.'}),
  Object.freeze({from:'sabine',to:'emile',relation:'She called him promising twice and delights in how carefully he remembers; she would rather hear his uneven music than a perfect silence.'}),
  Object.freeze({from:'emile',to:'sabine',relation:'He insists her opinion has never mattered, although he can recite both notices she wrote about him.'}),
  Object.freeze({from:'celeste',to:'sabine',relation:'She welcomes the critic\'s wit and refuses to let hospitality become a performance to be graded.'}),
  Object.freeze({from:'sabine',to:'celeste',relation:'She admires how Celeste runs the evening while claiming nobody is in charge; teasing her is half the reason she stays.'}),
]);
const BY_ID=Object.fromEntries(ACADEMIC_SOCIETY_ACTORS.map(person=>[person.id,person]));
export const ACADEMIC_SOCIETY_PERFORMANCE_CUES=Object.freeze(['offer','assure','interrupt','object','concede','recollect','refuse']);
export const ACADEMIC_SOCIETY_RESPONSE_CUES=Object.freeze(['attend','amused','guarded','settle']);
const defaultPerformance={celeste:'offer',emile:'recollect',odette:'assure',lucien:'refuse',agathe:'recollect',noe:'offer',sabine:'recollect'};
export function academicSocietyLine(actorId,text,extra={}){
  const person=BY_ID[actorId];if(!person)throw Error(`Unknown academic society actor: ${actorId}`);
  return {who:'unknown',actorId,name:person.name,voiceSpeaker:person.voiceSpeaker,
    sourceLabel:person.sourceLabel,text,performanceCue:defaultPerformance[actorId],responseCue:'attend',...extra};
}
const l=academicSocietyLine;
const beat=(id,area,lines,extra={})=>Object.freeze({id,area,lines:Object.freeze(lines.map(Object.freeze)),...extra,
  ...(Array.isArray(extra.attentionActors)?{attentionActors:Object.freeze([...extra.attentionActors])}:{})});
export const ACADEMIC_SOCIETY_BEATS=Object.freeze([
  beat('odette-arrival','loggia',[
    l('odette','Still warm. You cannot have been here very long.',{toPlayer:true}),
  ],{once:true}),
  beat('the-tuesday-argument','pair',[
    l('celeste','As I was saying—',{toActorId:'emile',performanceCue:'recollect'}),
    l('emile','You were saying it on Tuesday.',{toActorId:'celeste',performanceCue:'interrupt',responseCue:'amused'}),
    l('celeste','And you interrupted it on Tuesday. We have both kept our part.',{toActorId:'emile',performanceCue:'assure',responseCue:'settle'}),
  ]),
  beat('the-empty-seat','pair',[
    l('emile','You have left the good chair empty.',{toActorId:'celeste',performanceCue:'object'}),
    l('celeste','For whoever comes next.',{toActorId:'emile',performanceCue:'offer',responseCue:'guarded'}),
    l('emile','Still ambitious, then.',{toActorId:'celeste',performanceCue:'concede',responseCue:'amused'}),
  ]),
  beat('the-rest','pair',[
    l('celeste','You may finish the piece without finishing the evening.',{toActorId:'emile',performanceCue:'assure',responseCue:'guarded'}),
    l('emile','You would all start getting your coats.',{toActorId:'celeste',performanceCue:'object'}),
    l('celeste','Emile. None of us has been cold for years.',{toActorId:'emile',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('lucien-rehearsal','gallery',[
    l('lucien','No. I said I would think about it.',{performanceCue:'refuse'}),
    l('lucien','That ought to be a whole answer.',{performanceCue:'assure'}),
  ],{once:true}),
  beat('odette-keys','loggia',[
    l('odette','Closing time. I still say it. They still take no notice.',{performanceCue:'recollect'}),
  ]),
  beat('the-borrowing','pair',[
    l('emile','A little air would improve the evening.',{toActorId:'celeste',performanceCue:'offer',responseCue:'guarded'}),
    l('celeste','Ask before you borrow it.',{toActorId:'emile',performanceCue:'refuse',responseCue:'settle'}),
    l('emile','Lucien has been giving you lessons.',{toActorId:'celeste',performanceCue:'concede',responseCue:'amused'}),
  ]),
  beat('the-name-column','loggia',[
    l('agathe','One arrival. Shall I put a name to it?',{toActorId:'odette',performanceCue:'offer'}),
    l('odette','You could begin with good evening.',{toActorId:'agathe',performanceCue:'assure',responseCue:'guarded'}),
    l('agathe','Good evening is very difficult to alphabetise.',{toActorId:'odette',performanceCue:'object',responseCue:'amused'}),
    l('odette','You will enjoy the challenge.',{toActorId:'agathe',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('the-closing-list','loggia',[
    l('odette','We are closed.',{toActorId:'agathe',performanceCue:'assure'}),
    l('agathe','Then why is everyone still here?',{toActorId:'odette',performanceCue:'object',responseCue:'amused'}),
    l('odette','Staff.',{toActorId:'agathe',performanceCue:'concede',responseCue:'amused'}),
    l('agathe','A very generous staffing arrangement.',{toActorId:'odette',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('the-unflattering-profile','gallery',[
    l('noe','Do not improve your expression. I have almost understood the old one.',{toActorId:'lucien',performanceCue:'offer',responseCue:'guarded'}),
    l('lucien','Was it so bad?',{toActorId:'noe',performanceCue:'object',responseCue:'amused'}),
    l('noe','It was entirely yours. That is much more troublesome.',{toActorId:'lucien',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('a-portrait-with-room','gallery',[
    l('lucien','You used to make everyone look important.',{toActorId:'noe',performanceCue:'recollect'}),
    l('noe','They paid extra for it.',{toActorId:'lucien',performanceCue:'concede',responseCue:'amused'}),
    l('lucien','What do you charge now?',{toActorId:'noe',performanceCue:'offer',responseCue:'guarded'}),
    l('noe','An honest compliment. Business has been dreadful.',{toActorId:'lucien',performanceCue:'object',responseCue:'amused'}),
  ]),
  beat('the-word-promising','pair',[
    l('sabine','Promising.',{toActorId:'emile',performanceCue:'recollect',responseCue:'guarded'}),
    l('emile','I have not played anything.',{toActorId:'sabine',performanceCue:'object',responseCue:'amused'}),
    l('sabine','Then there is still every chance of improvement.',{toActorId:'emile',performanceCue:'concede',responseCue:'guarded'}),
    l('celeste','Sabine. Let him have a little unexamined air.',{toActorId:'sabine',performanceCue:'assure',responseCue:'settle'}),
  ]),
  beat('an-uneven-evening','pair',[
    l('celeste','Have you enjoyed yourself?',{toActorId:'sabine',performanceCue:'offer'}),
    l('sabine','Unevenly. A little too much repetition. An arresting silence in the middle.',{toActorId:'celeste',performanceCue:'recollect',responseCue:'amused'}),
    l('celeste','I shall take that as a yes.',{toActorId:'sabine',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('the-spare-cup','loggia',[
    l('odette','Do not put that cup away. Agathe has not finished objecting.',{toActorId:'agathe',performanceCue:'assure'}),
    l('agathe','I had finished. I was deciding whether to begin again.',{toActorId:'odette',performanceCue:'object',responseCue:'amused'}),
    l('odette','Then it is still your cup.',{toActorId:'agathe',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('the-borrowed-pencil','loggia',[
    l('agathe','I have lent you the same pencil three times.',{toActorId:'odette',performanceCue:'object'}),
    l('odette','And each time you have known exactly where it was.',{toActorId:'agathe',performanceCue:'assure',responseCue:'amused'}),
    l('agathe','That is not the principle of lending.',{toActorId:'odette',performanceCue:'refuse'}),
    l('odette','It is how we manage it here.',{toActorId:'agathe',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('a-place-still-warm','loggia',[
    l('agathe','The next arrival has not cooled down.',{toActorId:'odette',performanceCue:'recollect',responseCue:'guarded'}),
    l('odette','Then leave a little space around them.',{toActorId:'agathe',performanceCue:'refuse',responseCue:'settle'}),
    l('agathe','I was going to keep the space.',{toActorId:'odette',performanceCue:'offer'}),
    l('odette','Keep it empty.',{toActorId:'agathe',performanceCue:'assure',responseCue:'guarded'}),
  ],{outsider:true,attentionActors:['odette','agathe'],minVisitBeats:2}),
  beat('the-wrong-total','loggia',[
    l('agathe','My total changes whenever our visitor takes a breath.',{toActorId:'odette',performanceCue:'object',responseCue:'guarded'}),
    l('odette','Then stop counting for a moment.',{toActorId:'agathe',performanceCue:'refuse'}),
    l('agathe','I can stop writing. That is a different thing.',{toActorId:'odette',performanceCue:'recollect',responseCue:'guarded'}),
  ],{outsider:true,attentionActors:['odette','agathe'],minVisitBeats:3}),
  beat('the-last-good-evening','loggia',[
    l('odette','Good evening.',{toActorId:'agathe',performanceCue:'offer'}),
    l('agathe','You have said that already.',{toActorId:'odette',performanceCue:'object',responseCue:'amused'}),
    l('odette','I enjoyed the first one.',{toActorId:'agathe',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('a-second-opinion','pair',[
    l('emile','Sabine, tell her a repetition can be necessary.',{toActorId:'sabine',performanceCue:'offer'}),
    l('sabine','A repetition can be necessary.',{toActorId:'emile',performanceCue:'concede',responseCue:'amused'}),
    l('celeste','That was generous of you both.',{toActorId:'sabine',performanceCue:'assure',responseCue:'settle'}),
  ]),
  beat('the-unpaid-review','pair',[
    l('sabine','You have still not thanked me for the second review.',{toActorId:'emile',performanceCue:'object'}),
    l('emile','I have quoted it for years.',{toActorId:'sabine',performanceCue:'recollect',responseCue:'amused'}),
    l('sabine','I accept that as payment.',{toActorId:'emile',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('counting-the-breaths','pair',[
    l('emile','There. Again. Between the phrases.',{toActorId:'celeste',performanceCue:'recollect',responseCue:'guarded'}),
    l('celeste','Our visitor is breathing. Leave it alone.',{toActorId:'emile',performanceCue:'refuse'}),
    l('sabine','It does make the silence feel rather occupied.',{toActorId:'celeste',performanceCue:'recollect',responseCue:'guarded'}),
  ],{outsider:true,attentionActors:['celeste','emile','sabine'],minVisitBeats:2}),
  beat('the-seat-that-waits','pair',[
    l('celeste','The good chair can stay empty.',{toActorId:'emile',performanceCue:'assure'}),
    l('emile','It is making everybody look at it.',{toActorId:'celeste',performanceCue:'object',responseCue:'guarded'}),
    l('sabine','No. They are looking at the person still standing.',{toActorId:'emile',performanceCue:'recollect',responseCue:'guarded'}),
  ],{outsider:true,attentionActors:['celeste','emile','sabine'],minVisitBeats:3}),
  beat('a-little-unexamined-air','pair',[
    l('sabine','An excellent evening. I shall not explain why.',{toActorId:'celeste',performanceCue:'concede'}),
    l('celeste','There is an experiment worth repeating.',{toActorId:'sabine',performanceCue:'offer',responseCue:'amused'}),
    l('emile','I should like that in writing.',{toActorId:'sabine',performanceCue:'object'}),
    l('sabine','You would only preserve it.',{toActorId:'emile',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('the-difficult-button','gallery',[
    l('noe','Hold still. The face was easier than that button.',{toActorId:'lucien',performanceCue:'object'}),
    l('lucien','The button has no opinion of you.',{toActorId:'noe',performanceCue:'assure',responseCue:'amused'}),
    l('noe','I had noticed the difference.',{toActorId:'lucien',performanceCue:'concede',responseCue:'settle'}),
  ]),
  beat('an-unprofitable-compliment','gallery',[
    l('lucien','That is a very good likeness.',{toActorId:'noe',performanceCue:'offer'}),
    l('noe','You have not looked.',{toActorId:'lucien',performanceCue:'object',responseCue:'guarded'}),
    l('lucien','I was trying out being agreeable.',{toActorId:'noe',performanceCue:'concede',responseCue:'amused'}),
    l('noe','Try looking. I might enjoy it more.',{toActorId:'lucien',performanceCue:'assure',responseCue:'settle'}),
  ]),
  beat('the-moving-sitter','gallery',[
    l('noe','Our visitor will not stay the same shape.',{toActorId:'lucien',performanceCue:'object',responseCue:'guarded'}),
    l('lucien','They are only shifting their weight.',{toActorId:'noe',performanceCue:'assure'}),
    l('noe','Yes. I had forgotten how much of it there used to be.',{toActorId:'lucien',performanceCue:'recollect',responseCue:'guarded'}),
  ],{outsider:true,attentionActors:['noe','lucien'],minVisitBeats:2}),
  beat('the-unfinished-outline','gallery',[
    l('lucien','Do not finish the outline around them.',{toActorId:'noe',performanceCue:'refuse'}),
    l('noe','I have not begun.',{toActorId:'lucien',performanceCue:'object',responseCue:'guarded'}),
    l('lucien','Then keep that part.',{toActorId:'noe',performanceCue:'assure',responseCue:'settle'}),
  ],{outsider:true,attentionActors:['noe','lucien'],minVisitBeats:3}),
  beat('room-for-a-disagreement','gallery',[
    l('noe','You disagree with everything I say.',{toActorId:'lucien',performanceCue:'object'}),
    l('lucien','Not everything.',{toActorId:'noe',performanceCue:'refuse',responseCue:'amused'}),
    l('noe','Good. I was hoping you would say that.',{toActorId:'lucien',performanceCue:'concede',responseCue:'settle'}),
  ]),

]);

export const ACADEMIC_SOCIETY_TOPICS=Object.freeze({
  celeste:Object.freeze(['company','emile','need','firstevening','sabine','rules']),
  emile:Object.freeze(['music','celeste','need','audience','sabine','silence']),
  odette:Object.freeze(['keys','company','need','agathe','lastnight','returning']),
  lucien:Object.freeze(['company','emile','need','noe','name','likeness']),
  agathe:Object.freeze(['names','odette','mistake','need','missing']),
  noe:Object.freeze(['portraits','lucien','unfinished','need','lastline']),
  sabine:Object.freeze(['reviews','emile','listening','need','verdict']),
});
const n=(actorId,lines,choices=null)=>({speaker:BY_ID[actorId].name.toUpperCase(),
  lines:lines.map(line=>typeof line==='string'?l(actorId,line):line),...(choices?{choices}:{})});
const topic=(actorId,id,text)=>({text,goto:id,societyTopic:`${actorId}:${id}`});
const back=()=>[{text:'ask something else',goto:'start'},{text:'leave them to their evening',goto:'leave'}];
const act=(text,goto,societyAction)=>({text,goto,societyAction});
const direction=text=>({who:'direction',text});

// These are memories of completed exchanges, not guesses about choices that
// were highlighted and then cancelled. Each person keeps their own subject.
function returnOpening(actorId,state,asked){
  const consent=state.consent||'unasked';
  if(actorId==='celeste'){
    if(consent==='lent')return 'He is still using your voice. The way out is still yours.';
    if(consent==='declined')return 'You need not bring anything for us. The chair is not a bargain.';
    if(['withdrawn','left','expired'].includes(consent))return 'Your own voice again. Let us keep the rest of the evening that way.';
    if(asked.has('rules'))return 'Sabine has not marked the evening yet. I am choosing to call that progress.';
    if(asked.has('firstevening'))return 'I still think an empty room is worse than an untidy evening.';
    if(asked.has('sabine'))return 'She is listening for the moment she can call this an improvement. I shall try to disappoint her.';
    if(asked.has('emile'))return 'He is still pretending not to listen. I have left him room to do it.';
    if(asked.has('need'))return 'The phrase is unfinished. You may still come and go.';
    if(asked.has('company'))return 'The chair stayed empty. An invitation ought to survive a departure.';
    return 'You found your way back. A good room should manage that much.';
  }
  if(actorId==='emile'){
    if(consent==='lent')return 'Still here. I have your breath, not your whole evening. I remember the distinction.';
    if(consent==='declined')return 'You owe this room nothing. There. I can say it without making an objection.';
    if(consent==='withdrawn')return 'It is your voice again. I should have stopped before you needed to ask.';
    if(consent==='left')return 'You went downstairs. The room did not end. She is making rather a lot of that.';
    if(consent==='expired')return 'The breath ran out. The silence was mine to finish. I did not much enjoy that.';
    if(asked.has('silence'))return 'I tried hearing the pause as a rest. It has an irritating amount to recommend it.';
    if(asked.has('sabine'))return 'She used the word promising again. Do not look pleased. It is a dangerous word.';
    if(asked.has('audience'))return 'No applause yet. I can still imagine that it would have been thunderous.';
    if(asked.has('music'))return 'The last phrase is still missing. You heard where it should have been.';
    if(asked.has('celeste'))return 'She has not asked me to stop interrupting. I am trying not to mistake that for permission to go on forever.';
    if(asked.has('need'))return 'You have not decided. I am leaving the question where it was.';
    return 'You again. She will call that proof that I have not driven everyone away.';
  }
  if(actorId==='odette'){
    if(consent==='left')return 'You went down with your own breath. Now you have come up of your own accord. Good.';
    if(consent==='declined')return 'You still sound like yourself. There is no admission price.';
    if(asked.has('returning'))return 'The door is still where it was. A surprisingly useful sort of welcome.';
    if(asked.has('lastnight'))return 'Agathe says I have made closing time sound festive. She means it as a criticism.';
    if(asked.has('agathe'))return 'She has not asked your name twice. She will want that achievement noticed.';
    if(asked.has('need'))return 'Lucien came upstairs himself. I have been practising leaving it at that.';
    if(asked.has('keys'))return 'Still carrying them. Still not a way into the studios.';
    if(asked.has('company'))return 'They are where I said. You need not make a round of us to be welcome.';
    return 'The landing is still clear. I try to keep one thing that way.';
  }
  if(actorId==='agathe'){
    if(asked.has('missing'))return 'The blank line is still there. I am leaving it blank on purpose. That is different from losing it.';
    if(asked.has('mistake'))return 'I used to be proud that I never made a mistake. Odette remembers several.';
    if(asked.has('odette'))return 'She calls this keeping the floor open. I call it a very irregular register.';
    if(asked.has('names'))return 'I remember faces without writing them down. It is an untidy pleasure.';
    if(asked.has('need'))return 'Seven regulars, eight opinions. No. I am not counting you unless you ask.';
    return 'Back again. That is the nicest sort of discrepancy.';
  }
  if(actorId==='noe'){
    if(asked.has('lastline'))return 'I am leaving the final line alone. Anyone can make a picture busier.';
    if(asked.has('lucien'))return 'He says I have improved his nose. I have told him to take it up with his parents.';
    if(asked.has('unfinished'))return 'An unfinished face can still look back at you. That ought to count for something.';
    if(asked.has('portraits'))return 'You have the same expression. Either you remember me or I have made no impression at all.';
    if(asked.has('need'))return 'He said I make people look as if they have something to say. I am trying to receive it without improving the sentence.';
    return 'You came back. Excellent. From this side, I look considerably more distinguished.';
  }
  if(actorId==='sabine'){
    if(asked.has('verdict'))return 'I have withheld my verdict. Nobody has thanked me nearly enough.';
    if(asked.has('listening'))return 'There is an interesting little silence here. I am trying not to ruin it by calling it interesting.';
    if(asked.has('emile'))return 'He heard us discussing him. It is the most attentive he has been all evening.';
    if(asked.has('reviews'))return 'I have decided this evening is uneven. That is why I have stayed.';
    if(asked.has('need'))return 'He has still not played the last phrase. It is becoming a remarkably durable entertainment.';
    return 'Ah. A repeat audience. Emile will find that unbearable.';
  }
  if(consent==='lent')return 'You can ask for it back here. You do not have to carry the request all the way to him.';
  if(consent==='declined')return 'You kept your voice. They are still pleased to see you. Remember both things.';
  if(consent==='withdrawn')return 'You asked for it back. You are still welcome. That is how it should work.';
  if(['left','expired'].includes(consent))return 'You sound like yourself. You did not have to stay for their sake.';
  if(asked.has('likeness'))return 'Noe thinks I am beginning to resemble myself. He says it as if he deserves some credit.';
  if(asked.has('noe'))return 'He has stopped objecting to the shape of my ear. We get on quite well.';
  if(asked.has('name'))return 'Lucien. You need not say it as if you are trying to keep me here.';
  if(asked.has('need'))return 'Nobody has come to fetch me. It is a good evening.';
  if(asked.has('company'))return 'The doorway is still there. It helps to know that company leaves room for a way out.';
  if(asked.has('emile'))return 'He is still listening for a living breath. That does not oblige you to supply one.';
  return 'You came back. I am getting used to that meaning a choice.';
}

/** A familiar social subject changes only after the player completes it. */
export function academicSocietyBeatLines(beat,state={}){
  if(beat.id==='the-name-column'&&state.topics?.agathe?.includes('names'))return [
    l('agathe','I explained the blank line to our visitor.',{toActorId:'odette',performanceCue:'recollect'}),
    l('odette','Did you leave it blank?',{toActorId:'agathe',performanceCue:'offer',responseCue:'guarded'}),
    l('agathe','I can be both exact and hospitable. It takes concentration.',{toActorId:'odette',performanceCue:'concede',responseCue:'amused'}),
  ];
  if(beat.id==='the-unflattering-profile'&&state.topics?.noe?.includes('portraits'))return [
    l('noe','I have admitted to our visitor that I used to sell noble faces.',{toActorId:'lucien',performanceCue:'recollect'}),
    l('lucien','That explains why you find mine so difficult.',{toActorId:'noe',performanceCue:'object',responseCue:'amused'}),
    l('noe','I find yours interesting. Please do not make me say it twice.',{toActorId:'lucien',performanceCue:'concede',responseCue:'settle'}),
  ];
  if(beat.id==='a-portrait-with-room'&&state.topics?.noe?.includes('need'))return [
    l('noe','Something to say. That was a good thing to find in a face.',{toActorId:'lucien',performanceCue:'recollect',responseCue:'guarded'}),
    l('lucien','I meant it.',{toActorId:'noe',performanceCue:'assure',responseCue:'settle'}),
    l('noe','Yes. That is what makes it difficult to answer elegantly.',{toActorId:'lucien',performanceCue:'concede',responseCue:'amused'}),
  ];
  if(beat.id==='the-word-promising'&&state.topics?.sabine?.includes('reviews'))return [
    l('sabine','I have been explaining my reviews.',{toActorId:'emile',performanceCue:'recollect',responseCue:'guarded'}),
    l('emile','At last. I waited years for an explanation.',{toActorId:'sabine',performanceCue:'object',responseCue:'amused'}),
    l('sabine','You might have asked. You were so busy preserving the newspaper.',{toActorId:'emile',performanceCue:'concede',responseCue:'settle'}),
  ];
  if(beat.id==='the-borrowing'&&state.consent==='declined')return [
    l('emile','I could ask somebody else.',{toActorId:'celeste',performanceCue:'object',responseCue:'guarded'}),
    l('celeste','Or you could let a guest be a guest.',{toActorId:'emile',performanceCue:'refuse'}),
    l('emile','Yes. I heard the distinction.',{toActorId:'celeste',performanceCue:'concede',responseCue:'settle'}),
  ];
  if(beat.id==='the-borrowing'&&['withdrawn','left','expired'].includes(state.consent))return [
    l('emile','It sounded as if the room had begun again.',{toActorId:'celeste',performanceCue:'recollect'}),
    l('celeste','It had company. That is smaller. Try to be glad of it.',{toActorId:'emile',performanceCue:'assure',responseCue:'settle'}),
    l('emile','I am trying.',{toActorId:'celeste',performanceCue:'concede'}),
  ];
  if(beat.id==='the-rest'&&state.topics?.emile?.includes('music'))return [
    l('celeste','You told our visitor where the last phrase belongs.',{toActorId:'emile',performanceCue:'assure',responseCue:'guarded'}),
    l('emile','Explaining a thing is not the same as managing it.',{toActorId:'celeste',performanceCue:'object'}),
    l('celeste','No. But you let somebody hear the gap.',{toActorId:'emile',performanceCue:'concede',responseCue:'settle'}),
  ];
  return beat.lines;
}

/** Local hubs. A choice is tentative until the presenter finishes. */
export function academicSocietyDialogue(actorId,state={}){
  if(!BY_ID[actorId])return null;
  const met=(state.met?.[actorId]||0)>0,consent=state.consent||'unasked',lent=consent==='lent';
  const asked=new Set(state.topics?.[actorId]||[]);
  const opening=(first,introduction)=>[met?returnOpening(actorId,state,asked):first,
    ...(!met?[introduction]:[])];
  let nodes;
  if(actorId==='celeste')nodes={
    start:n(actorId,opening('You need not stand in the doorway. That is what it was built for, but you need not.',
      'Celeste Vaurin. Do come in.'),[
      topic(actorId,'company','what is happening up here?'),topic(actorId,'emile','you and Emile know each other well'),
      topic(actorId,'need','what are you waiting for?'),topic(actorId,'firstevening','how did these evenings begin?'),
      topic(actorId,'sabine','does Sabine approve of this?'),{text:'leave her to the conversation',goto:'leave'},
    ]),
    company:n(actorId,asked.has('company')?['A little company. You need not make it useful.']:[
      'An evening. Odette opens it, Emile prevents it ending, and Lucien reminds us that he was invited rather than collected.',
      'The school forgot what these rooms were for. We have had time to disagree with it.',
    ],back()),
    emile:n(actorId,asked.has('emile')?['We have kept the argument longer than we kept our lives. I will not let him make a cage of it.']:[
      'He thinks that finishing a piece means admitting there will not be another one.',
      l('emile','I can hear you.',{toActorId:'celeste',performanceCue:'interrupt',responseCue:'amused'}),
      l('celeste','I was hoping you could.',{toActorId:'emile',performanceCue:'assure',responseCue:'settle'}),
    ],back()),
    need:n(actorId,asked.has('need')?['For him to finish it. Not for you to finish it for him.']:[
      'For him to finish the phrase. Not for us. For himself.',
      'And for a visitor to leave because they have somewhere to go, rather than because we have made staying unbearable.',
    ],back()),
    firstevening:n(actorId,asked.has('firstevening')?['I asked whether anybody was still there. Emile complained about the draught. It was a start.']:[
      'At first I thought I was alone. Then somebody on the landing said the room was cold.',
      l('emile','It was. Hospitality does not mend a window.',{toActorId:'celeste',performanceCue:'interrupt',responseCue:'amused'}),
      l('celeste','That was the first thing he said to me after we died. I knew it was him.',{toActorId:'emile',performanceCue:'recollect',responseCue:'settle'}),
      'Odette supplied a closing time. Agathe supplied a list. It began to resemble a terrible committee. I have been rather happy with it.',
    ],[topic(actorId,'rules','so who is in charge?'),...back()]),
    rules:n(actorId,asked.has('rules')?['Odette has the keys, Agathe has the numbers, Sabine has the last word. I keep the chair.']:[
      'Nobody. I have made a considerable effort to keep it that way.',
      l('sabine','She says that in the voice she uses when she is in charge.',{toActorId:'celeste',performanceCue:'interrupt',responseCue:'amused'}),
      l('celeste','Only because you keep trying to review the refreshments.',{toActorId:'sabine',performanceCue:'object',responseCue:'amused'}),
      l('sabine','A disappointing absence of refreshments. An excellent absence of speeches.',{toActorId:'celeste',performanceCue:'concede',responseCue:'settle'}),
    ],back()),
    sabine:n(actorId,asked.has('sabine')?['She has stayed. With Sabine, that is more useful than approval.']:[
      'Sabine has never approved of an evening before it is over. It saves her the embarrassment of enjoying it too soon.',
      l('sabine','I am enjoying it at exactly the appropriate speed.',{toActorId:'celeste',performanceCue:'object',responseCue:'amused'}),
      l('celeste','You see? Even pleasure must pass an examination.',{toActorId:'sabine',performanceCue:'assure',responseCue:'settle'}),
    ],back()),
    leave:n(actorId,[lent?'He is using your voice. You may ask for it back. Hospitality is not a claim.':'Leave the chair where it is. Someone else may want it.']),
  };
  if(actorId==='emile')nodes={
    start:n(actorId,opening('If she has told you I am rehearsing, she is being charitable.',
      'Emile Ronce. There. You can tell her I introduced myself.'),[
      topic(actorId,'music','what are you playing?'),topic(actorId,'celeste','why do you interrupt her?'),
      topic(actorId,'need','what is missing?'),topic(actorId,'audience','do you miss an audience?'),
      topic(actorId,'sabine','what did Sabine write about you?'),
      ...(lent?[act('take my voice back','withdraw','withdraw')]:[]),
      {text:'leave him to it',goto:'leave'},
    ]),
    music:n(actorId,asked.has('music')?['The pause before the last phrase. It is a very accommodating pause.']:[
      'Something we used to sing before anybody thought to ask whether it was worth recording.',
      'Celeste knows the upper part. I know where she used to breathe. The silence keeps arriving in the right place.',
    ],back()),
    celeste:n(actorId,asked.has('celeste')?['She could finish the story without me. She leaves the interruption there. I do notice.']:[
      'Because I know what comes next.',
      'And because she still lets me. There are evenings when that is the only invitation I can bear to accept.',
    ],back()),
    audience:n(actorId,asked.has('audience')?['An audience can go home. A reputation is much less considerate.']:[
      'I miss the moment before they decide whether they like you. Every possibility is still there. Even the ridiculous ones.',
      l('sabine','He particularly misses applause that has not yet had the opportunity to disappoint him.',{toActorId:'emile',performanceCue:'interrupt',responseCue:'guarded'}),
      l('emile','I was capable of being appreciated.',{toActorId:'sabine',performanceCue:'object',responseCue:'amused'}),
      l('sabine','Occasionally. It made the other nights quite exciting.',{toActorId:'emile',performanceCue:'concede',responseCue:'settle'}),
    ],[topic(actorId,'silence','what happens if nobody applauds?'),...back()]),
    silence:n(actorId,asked.has('silence')?['Perhaps it can be a rest. I dislike how sensible that sounds.']:[
      'Then you discover whether anybody was listening, or merely waiting for permission to move.',
      'Celeste used to leave a little silence before she clapped. I hated it. I trusted it more than anybody else in the room.',
      l('celeste','You can have that much silence now. You need not keep the whole room waiting inside it.',{toActorId:'emile',performanceCue:'assure',responseCue:'settle'}),
    ],back()),
    sabine:n(actorId,asked.has('sabine')?['Promising. I have had years to become furious about one adjective.']:[
      'Promising. She called me promising. Twice. I was forty-three.',
      l('sabine','The first time I meant it. The second time I wondered whether he had noticed the first.',{toActorId:'emile',performanceCue:'interrupt',responseCue:'guarded'}),
      l('emile','I kept both notices.',{toActorId:'sabine',performanceCue:'object',responseCue:'amused'}),
      l('sabine','Of course you did. You were always a serious reader.',{toActorId:'emile',performanceCue:'concede',responseCue:'settle'}),
    ],back()),
    need:n(actorId,consent==='unasked'?[
      'A little living air. You will hear your own voice from my mouth. Yours can stay shut.',
      l('celeste','He may ask for it back here, or through Lucien, or simply go downstairs. You will not make it sound like a promise.',{toActorId:'emile',performanceCue:'refuse',responseCue:'settle'}),
      l('emile','One breath. You need not stay to hear what I make of it.',{toPlayer:true,performanceCue:'offer'}),
    ]:[consent==='declined'?'Your voice is your own. I did hear the no.':lent?'I know. One breath, not the whole evening.':'It was good to hear the room carry living air. I should have left it at that.'],
    consent==='unasked'?[
      act('lend one breath — hear my voice from his mouth','lend','lend'),
      act('keep my voice','decline','decline'),...back(),
    ]:back()),
    lend:n(actorId,[l(actorId,'Listen, then. You do not have to sing.',{performanceCue:'offer'})]),
    decline:n(actorId,[l(actorId,'It was only a—',{performanceCue:'object'}),l('celeste','He heard you.',{toActorId:'emile',performanceCue:'refuse',responseCue:'settle'})]),
    withdraw:n(actorId,[l(actorId,'Already? We were just getting to know the sound of you.',{performanceCue:'object'}),l('celeste','He said back.',{toActorId:'emile',performanceCue:'refuse',responseCue:'settle'})]),
    leave:n(actorId,[lent?'You are not obliged to sound so convincing. I could listen to you all evening.':'You need not clap. It will only encourage me.']),
  };
  if(actorId==='odette')nodes={
    start:n(actorId,opening('Mind the last turn of the stair. People come up looking behind them and miss the room in front.',
      'Odette Marchal. I used to close this floor. Now I open the evening.'),[
      topic(actorId,'keys','why keep the keys?'),topic(actorId,'company','who are the others?'),
      topic(actorId,'need','what do you need?'),topic(actorId,'agathe','why is Agathe counting us?'),
      topic(actorId,'lastnight','what was your last closing time?'),{text:'continue along the floor',goto:'leave'},
    ]),
    keys:n(actorId,asked.has('keys')?['Weight is a habit. Some of us keep the outline.']:[
      'They have not opened anything since they stopped having weight. Do not mistake them for a way into the studios.',
      'Celeste likes a closing ceremony. I say we are closed, Emile objects, and then we get on with the evening.',
    ],back()),
    company:n(actorId,asked.has('company')?['The chamber, its doorway, and the gallery walk. Company ought to leave room between people.']:[
      'Celeste in the chamber room. Emile is the objection just outside it. You will see them before you need to ask.',
      'Lucien is through the little vestibule, on the gallery walk. He likes being able to hear a room without being in the middle of it.',
    ],back()),
    need:n(actorId,asked.has('need')?['To leave the invitation alone once I have offered it. The keys are easier to put down.']:[
      'To stop introducing Lucien as someone I brought here. He came up the stair himself.',
      'An invitation is a nice thing. It grows teeth if you keep reminding somebody they accepted it.',
    ],back()),
    agathe:n(actorId,asked.has('agathe')?['Because a number can be made to balance. People are a worse habit.']:[
      'She likes a list that agrees with the world. We have become a very irritating world.',
      l('agathe','I have never called you irritating on a form.',{toActorId:'odette',performanceCue:'object',responseCue:'amused'}),
      l('odette','No. You used to put irregular attendance.',{toActorId:'agathe',performanceCue:'recollect',responseCue:'guarded'}),
      l('agathe','That was a precise description.',{toActorId:'odette',performanceCue:'concede',responseCue:'settle'}),
    ],back()),
    lastnight:n(actorId,asked.has('lastnight')?['The lamps were the last thing. I remember being annoyed that somebody had left one burning.']:[
      'I checked the rooms, touched every handle and said good night to a stairwell. An ordinary closing. I liked ordinary closings.',
      'I do not remember dying nearly as clearly as I remember one lamp still burning upstairs. That is the sort of person I was.',
      l('agathe','You also remembered who was afraid of the dark. You left that out.',{toActorId:'odette',performanceCue:'interrupt',responseCue:'settle'}),
      l('odette','A lamp is easier to account for.',{toActorId:'agathe',performanceCue:'concede',responseCue:'attend'}),
    ],[topic(actorId,'returning','is that why you keep the way clear?'),...back()]),
    returning:n(actorId,asked.has('returning')?['A clear landing. A light left on. I can still manage the shape of that.']:[
      'I cannot make an evening safe merely by calling it open. I can make the stair easy to find.',
      'If you come back, let it be because you liked somebody. A welcome is a poor thing to turn into a debt.',
    ],back()),
    leave:n(actorId,[consent==='left'?'You went down with your own breath. Good. Come and go that way.':'Keep your coat. You still feel the cold.']),
  };
  if(actorId==='lucien'){
    const voiceChoice=lent?act('take my voice back','withdraw','withdraw')
      :consent==='unasked'?{text:'what does lending a voice mean?',goto:'voice'}
        :{text:'about the voice',goto:'settled'};
    nodes={
      start:n(actorId,opening('Lucien Vey. If they said Odette brought me, I did walk up the stair.',
        'I like them. I am trying to make that different from owing them.'),[
        topic(actorId,'company','why stay out here?'),topic(actorId,'emile','what does Emile want?'),
        topic(actorId,'need','what do you want?'),topic(actorId,'noe','why is Noe studying your face?'),
        topic(actorId,'name','did you know each other before?'),voiceChoice,
        ...(consent==='unasked'?[act('I do not want to lend my voice','decline','decline')]:[]),
        {text:'leave him his quiet',goto:'leave'},
      ]),
      company:n(actorId,asked.has('company')?['I can go back in when I miss them. That is better than having to escape.']:[
        'In there, a silence gets filled for you. Out here I can hear where I would have put an answer.',
        'Odette has stopped coming to fetch me. That was kind of her. It took me a while to recognise it.',
      ],back()),
      emile:n(actorId,asked.has('emile')?['He wants a breath. Let him ask for that, and hear your answer. Nothing more is smuggled inside it.']:[
        'Your breath, for a phrase. He misses hearing living air in a room that still remembers how to carry it.',
        'He means that. He may also make your voice sound as though you have decided to stay. Those are not the same permission.',
      ],back()),
      need:n(actorId,asked.has('need')?['To say no and come back. So far, the room has managed both.']:[
        'To say no once, and still be welcome the next evening.',
        'They are learning. I do not want you to think the worst thing about a person is the whole person.',
      ],back()),
      noe:n(actorId,asked.has('noe')?['He says my profile resists him. I have decided to enjoy that.']:[
        'He thinks he can make me look less worried by leaving a line out. I suspect the line is important.',
        l('noe','You have a very difficult ear. It suggests you have heard everything before.',{toActorId:'lucien',performanceCue:'object',responseCue:'amused'}),
        l('lucien','I live with Emile. I have.',{toActorId:'noe',performanceCue:'concede',responseCue:'amused'}),
        l('noe','There. That expression. Entirely uncooperative. Excellent.',{toActorId:'lucien',performanceCue:'offer',responseCue:'settle'}),
      ],[topic(actorId,'likeness','do you like the way he sees you?'),...back()]),
      likeness:n(actorId,asked.has('likeness')?['He makes me look as if I might answer back. I like that much.']:[
        'A little. He used to make everybody look noble. I never knew where to put myself in a noble face.',
        l('noe','I was being paid. Nobility is much easier to sell than a man waiting for the tram.',{toActorId:'lucien',performanceCue:'recollect',responseCue:'amused'}),
        l('lucien','I would have liked the tram picture.',{toActorId:'noe',performanceCue:'assure',responseCue:'settle'}),
      ],back()),
      name:n(actorId,asked.has('name')?['No. They know me now. I am trying to let that be enough.']:[
        'No. I thought that made me an interruption. They all had names for one another before I arrived.',
        'Noe asked mine, got it wrong, and said the wrong one suited the drawing better. It was the first time I laughed up here.',
        l('noe','Lucien. I know it perfectly well. Lucian was simply a better composition.',{toActorId:'lucien',performanceCue:'object',responseCue:'amused'}),
        l('lucien','He has been apologising like that ever since.',{toActorId:'noe',performanceCue:'concede',responseCue:'settle'}),
      ],back()),
      voice:n(actorId,[
        'Emile will speak with your voice from his own mouth. You will still be able to walk and say where you are going.',
        'If he makes it sound as if you have promised to stay, you have not. Ask him or me for it back, or go downstairs. Either is enough.',
        'It is all right to want to hear it. It is just as all right not to.',
      ],[
        {text:'I will decide in front of Emile',goto:'leave'},act('keep my voice','decline','decline'),
        {text:'leave it undecided',goto:'leave'},
      ]),
      decline:n(actorId,['No explanation needed. You may still sit with us.']),
      withdraw:n(actorId,['Back, then. You do not need a better reason.']),
      settled:n(actorId,[consent==='declined'?'You said no. That does not need improving.':'You came back in your own voice. I am glad.'],back()),
      leave:n(actorId,['You can find your way back. You do not have to promise.']),
    };
  }
  if(actorId==='agathe')nodes={
    start:n(actorId,opening('One more. No, do not apologise. It is what arrivals are for.',
      'Agathe Morel. The registers were mine. Odette insists this is an evening rather than a department.'),[
      topic(actorId,'names','do you need my name?'),topic(actorId,'odette','do you and Odette always argue?'),
      topic(actorId,'mistake','were the registers always right?'),topic(actorId,'need','what would make a good evening for you?'),
      {text:'leave her to the landing',goto:'leave'},
    ]),
    names:n(actorId,asked.has('names')?['No. I know where to leave a line blank. I do not have to lose the page.']:[
      'Need? No. Want? A little. A name gives an arrival a place. I used to believe that was the same as making somebody welcome.',
      l('odette','You also used to demand a fee before you learned to say good morning.',{toActorId:'agathe',performanceCue:'interrupt',responseCue:'guarded'}),
      l('agathe','I said good morning perfectly clearly. The fee was due.',{toActorId:'odette',performanceCue:'object',responseCue:'amused'}),
      'There is a blank line for you. It is an invitation. I am trying to enjoy the blank part.',
    ],[topic(actorId,'missing','what happens to the names that are missing?'),...back()]),
    missing:n(actorId,asked.has('missing')?['A missing name can mean somebody chose a different room. I like that explanation best.']:[
      'They used to mean illness, missed lessons, a letter nobody wanted to write. I was very good at putting the reason in the margin.',
      'Now a blank can mean that somebody has not arrived. Or has gone somewhere I do not know. It is difficult to file the difference.',
      l('odette','You could leave the reason to them.',{toActorId:'agathe',performanceCue:'assure',responseCue:'settle'}),
      l('agathe','Yes. You make it sound so easy to mislay a whole person.',{toActorId:'odette',performanceCue:'concede',responseCue:'attend'}),
    ],back()),
    odette:n(actorId,asked.has('odette')?['We agree on the important things. We disagree to discover what they are.']:[
      'She remembers every crooked latch and every frightened student. I remember which names were entered twice. Between us we were nearly a useful institution.',
      l('odette','She corrected a notice while the roof leaked through it.',{toActorId:'agathe',performanceCue:'recollect',responseCue:'amused'}),
      l('agathe','It was still misspelled after it dried.',{toActorId:'odette',performanceCue:'object',responseCue:'amused'}),
      'I like knowing she will say we are closed. It gives me something reliable to object to.',
    ],back()),
    mistake:n(actorId,asked.has('mistake')?['The same number of people is not the same set of people. I can hear Odette saying it before she opens her mouth.']:[
      'The numbers always balanced. For years I mistook that for being right.',
      'Two sisters had the same initials. I gave one the other one\'s attendance for a term. One was praised for diligence. The other learned to forge a signature.',
      l('odette','You corrected it.',{toActorId:'agathe',performanceCue:'assure',responseCue:'guarded'}),
      l('agathe','I corrected the register. I never found a suitable column for the rest.',{toActorId:'odette',performanceCue:'concede',responseCue:'settle'}),
    ],back()),
    need:n(actorId,asked.has('need')?['An evening that adds up without my having to count it. Also a scandal small enough to be pleasant.']:[
      'The regulars present, nobody missing, and one piece of news I can pretend I was not waiting for.',
      'Noe says he once made a duke look intelligent. Sabine says she knows which duke. Neither will tell me. It is an intolerably good story.',
      l('odette','So you would like a little company.',{toActorId:'agathe',performanceCue:'assure',responseCue:'guarded'}),
      l('agathe','Correct company. There is a distinction.',{toActorId:'odette',performanceCue:'object',responseCue:'amused'}),
    ],back()),
    leave:n(actorId,['Good evening. There. Before anything else. You may tell Odette.']),
  };
  if(actorId==='noe')nodes={
    start:n(actorId,opening('You have stopped in an interesting place. Most people wait to be told where to stand.',
      'Noe Bellot. Portraits and lithographs. Weddings and funerals. I learned not to put the last two on the same card.'),[
      topic(actorId,'portraits','what sort of portraits did you make?'),topic(actorId,'lucien','why Lucien?'),
      topic(actorId,'unfinished','does anything here get finished?'),topic(actorId,'need','what are you after tonight?'),
      {text:'leave the two of them to it',goto:'leave'},
    ]),
    portraits:n(actorId,asked.has('portraits')?['Respectable people, made slightly more respectable. An excellent trade. Not always an excellent picture.']:[
      'The sort people could hang above a mantelpiece without explaining themselves. A fine jaw, an upright posture, no hint of indigestion.',
      'I could make a frightened man look commanding. After a while all my sitters looked faintly under arrest. People called it a school.',
      l('lucien','Was it?',{toActorId:'noe',performanceCue:'offer',responseCue:'guarded'}),
      l('noe','It was a reliable income. Critics have founded schools on less.',{toActorId:'lucien',performanceCue:'concede',responseCue:'amused'}),
    ],back()),
    lucien:n(actorId,asked.has('lucien')?['He will not improve his face to make my job easier. That is a useful sort of friend.']:[
      'He does not want to look like an ancestor. An excellent quality in somebody already dead.',
      l('lucien','I would settle for looking as if I knew where to put my hands.',{toActorId:'noe',performanceCue:'object',responseCue:'amused'}),
      l('noe','Everyone would. That is why portraitists can charge money.',{toActorId:'lucien',performanceCue:'assure',responseCue:'amused'}),
      'And he answers me. When you have spent a career being praised by people who only liked the frame, an answer is a luxury.',
    ],back()),
    unfinished:n(actorId,asked.has('unfinished')?['A finished picture has to survive without the explanation. I was very fond of explanations.']:[
      'Sometimes I think we all came here with the last line still in our hands. Emile has made a career of not putting his down.',
      'Mine is usually around the mouth. One more mark and the person looks like me trying to explain them. One less and they are allowed a little privacy.',
      l('lucien','Then leave the mark out.',{toActorId:'noe',performanceCue:'assure',responseCue:'guarded'}),
      l('noe','A devastatingly economical solution. You see why I keep him.',{toActorId:'lucien',performanceCue:'concede',responseCue:'amused'}),
    ],[topic(actorId,'lastline','how would you know the last line was right?'),...back()]),
    lastline:n(actorId,asked.has('lastline')?['If the picture could look back without needing me to defend it. I should like to see that once.']:[
      'I used to wait for the sitter to say it looked exactly like them. A perfect method for learning which of us was the better liar.',
      'Now I think I would know if I could bear to stop defending it. Leave a little room between my intention and their face.',
      l('lucien','You could begin by not defending my ear.',{toActorId:'noe',performanceCue:'object',responseCue:'amused'}),
      l('noe','Your ear needs all the friends it can get.',{toActorId:'lucien',performanceCue:'concede',responseCue:'amused'}),
    ],back()),
    need:n(actorId,asked.has('need')?['He meant it. I shall try to resist asking whether he is quite sure.']:[
      'An honest compliment. Not a kind one. I have had a great many kind ones. They are lovely and difficult to spend.',
      l('lucien','You make people look as if they have something to say.',{toActorId:'noe',performanceCue:'assure',responseCue:'settle'}),
      l('noe','That was almost alarmingly well chosen.',{toActorId:'lucien',performanceCue:'concede',responseCue:'amused'}),
      l('lucien','I have heard you ask for it before.',{toActorId:'noe',performanceCue:'object',responseCue:'amused'}),
    ],back()),
    leave:n(actorId,['Go on, then. You were much more convincing before you knew you were being looked at.']),
  };
  if(actorId==='sabine')nodes={
    start:n(actorId,opening('You have arrived before the final phrase. We are all making a considerable success of that.',
      'Sabine Artaud. I wrote about music. They have allowed me to stay in spite of it.'),[
      topic(actorId,'reviews','what made a good review?'),topic(actorId,'emile','did you admire Emile?'),
      topic(actorId,'listening','can you listen without judging?'),topic(actorId,'need','what would you like to hear tonight?'),
      {text:'leave her to the music that is not playing',goto:'leave'},
    ]),
    reviews:n(actorId,asked.has('reviews')?['A precise sentence about something that actually happened. You would be astonished how few reviews manage that.']:[
      'The artist should recognise the evening, even while wishing I had gone to a different one. Readers should hear enough of it to disagree.',
      l('emile','And promising? Where did that leave the reader?',{toActorId:'sabine',performanceCue:'interrupt',responseCue:'amused'}),
      l('sabine','With a reason to buy another ticket. You are welcome.',{toActorId:'emile',performanceCue:'concede',responseCue:'guarded'}),
      'I was not always fair. Sometimes a fine sentence arrived before the performance had supplied a reason for it. It was difficult to throw away a fine sentence.',
    ],[topic(actorId,'verdict','which mattered more, being right or being read?'),...back()]),
    verdict:n(actorId,asked.has('verdict')?['Being read. I wish I could make the admission sound more original.']:[
      'Being read. At first. Then being feared. Then, occasionally, being right. I am trying to reverse the order without pretending I never enjoyed the first two.',
      l('celeste','You could begin with an evening nobody needs a verdict on.',{toActorId:'sabine',performanceCue:'assure',responseCue:'guarded'}),
      l('sabine','You make leisure sound like a rather exacting discipline.',{toActorId:'celeste',performanceCue:'object',responseCue:'amused'}),
    ],back()),
    emile:n(actorId,asked.has('emile')?['Yes. Otherwise I would have forgotten him. Do not tell him how much of the answer that is.']:[
      'Of course. You do not keep arguing with a performance you found entirely empty. He could make a room lean forward without noticing it had done so.',
      l('emile','There. Put that in writing.',{toActorId:'sabine',performanceCue:'interrupt',responseCue:'amused'}),
      l('sabine','I did. You cut out the paragraph before it and brooded over the adjective.',{toActorId:'emile',performanceCue:'object',responseCue:'guarded'}),
      l('emile','The adjective was promising.',{toActorId:'sabine',performanceCue:'recollect',responseCue:'amused'}),
      l('sabine','I am glad we have not forgotten the text.',{toActorId:'emile',performanceCue:'concede',responseCue:'settle'}),
    ],back()),
    listening:n(actorId,asked.has('listening')?['I can listen before I judge. There is a little more space in that sentence.']:[
      'I can. Briefly. Then I find a word for what I have heard, and the word starts getting in the way.',
      'Celeste has the most irritating habit of enjoying things without first deciding whether enjoyment is justified.',
      l('celeste','You are welcome to join me.',{toActorId:'sabine',performanceCue:'offer',responseCue:'guarded'}),
      l('sabine','I am. Very unevenly.',{toActorId:'celeste',performanceCue:'concede',responseCue:'amused'}),
    ],back()),
    need:n(actorId,asked.has('need')?['A bad performance with one marvellous moment. It gives everybody something different to remember.']:[
      'Something a little bad. Something with one passage so alive that the rest becomes an argument worth having.',
      l('emile','A generous ambition for my evening.',{toActorId:'sabine',performanceCue:'object',responseCue:'amused'}),
      l('sabine','A perfect performance ends the conversation. You have always been much better company than that.',{toActorId:'emile',performanceCue:'assure',responseCue:'guarded'}),
      l('celeste','There is a compliment in it. I would take it before she revises the sentence.',{toActorId:'emile',performanceCue:'assure',responseCue:'settle'}),
    ],back()),
    leave:n(actorId,['An interesting entrance. I shall try to leave the exit unreviewed.']),
  };
  return {id:`academic-society:${actorId}`,actorId,nodes};
}

export function academicSocietyLoanLines(index=0){
  return index===0?[
    direction('Emile opens his mouth. The voice is yours. Your own mouth is shut.'),
    {who:'me',voiceSpeaker:'me',actorId:'emile',name:BY_ID.emile.name,sourceLabel:BY_ID.emile.sourceLabel,text:'There is no hurry.',performanceCue:'offer'},
    l('emile','Listen to that. The room still knows what to do with a breath.'),
  ]:[
    {who:'me',voiceSpeaker:'me',actorId:'emile',name:BY_ID.emile.name,sourceLabel:BY_ID.emile.sourceLabel,text:'I should be here.',performanceCue:'offer'},
    l('celeste','That is not what he agreed to.',{toActorId:'emile',performanceCue:'refuse',responseCue:'settle'}),
  ];
}
