// Source III's own listening conversation. The caller owns the full recording,
// acoustic/electronic revoicing, audible clock, bodily loss and ending.
// These are language choices; none selects a mix, instrument or musical result.
import {sourceRestQuestionNodes} from './source-rest-questions.js';
const line=(who,text)=>Object.freeze({who,text,voice:false,say:false});
const you=text=>line('you',text),other=text=>line('other',text);
const go=(id,label,next)=>Object.freeze({id,label,next});
const leave=()=>Object.freeze({id:'rise',label:'Get up.',action:'leave'});
const timed=(lines,{choices=[],next,locked=false,action}={})=>Object.freeze({lines:Object.freeze(lines),choices:Object.freeze(choices),
  ...(next?{next}:{}),...(locked?{lockExit:true}:{}),...(action?{action}:{})});
const choice=(lines,options,{locked=false}={})=>timed(lines,{choices:locked?options:[...options,leave()],locked});

// Normalized narrative cue floors, not locations in a repeatedly restarted
// excerpt. The full Source III performance has its own cumulative audio clock.
export const SOURCE_REST_COUPERIN_CUES=Object.freeze({arrival:0,'guitar-etudes':.13,harpsichord:.27,
  recording:.41,revoicing:.56,return:.76,last:.96});

const nodes={
  arrival:timed([
    other('You can hear it from here.'),
    you('Couperin.'),
    other('Yes.'),
    you('I was not expecting that.'),
    other('There is a place beside you. You need not look at me.')
  ],{next:'arrival-choice'}),
  'arrival-choice':choice([
    other('Shall we listen?')
  ],[go('play','Let it play.','settle'),go('while','Only for a while.','a-while')]),
  settle:timed([
    you('Let it play.'),
    other('All right.'),
    you('Do you know this one?'),
    other('Enough to be glad you stopped.'),
    you('That is not quite what I asked.'),
    other('I know. I was trying not to talk over it.')
  ],{next:'questions-entry'}),
  'a-while':timed([
    you('Only for a while.'),
    other('Then I will not ask how long.'),
    you('I have not decided.'),
    other('Good.'),
    you('You sound pleased with yourself.'),
    other('I found somewhere to sit. It is not a small achievement here.')
  ],{next:'questions-entry'}),
  'guitar-etudes':timed([
    you('I kept wondering about the guitar études.'),
    other('What about them?'),
    you('Why those, on the marimba? Why not go to the harpsichord?'),
    other('You could have chosen an easier question.'),
    you('I thought it was a practical one.'),
    other('They are the ones that get you.'),
    you('I only meant to bring something back.')
  ],{next:'borrow-choice'}),
  'borrow-choice':choice([
    other('What were you hoping to carry?')
  ],[go('use','Something I could use.','borrow'),go('hear','Something I had not heard.','missing')]),
  borrow:timed([
    you('Something I could use.'),
    other('On the marimba.'),
    you('Yes. I had not planned very far past that.'),
    other('How far did the plan last?'),
    you('Long enough to get me to the keyboard.'),
    other('It did its job, then.')
  ],{next:'harpsichord'}),
  missing:timed([
    you('Something I had not heard.'),
    other('Did you find it?'),
    you('I do not think I could call it one thing.'),
    other('Then do not.'),
    you('I am still preparing an answer.'),
    other('I was not examining you. I was interested.')
  ],{next:'harpsichord'}),
  harpsichord:timed([
    you('At first the harpsichord was a way back to the marimba.'),
    other('And then?'),
    you('It kept giving me something else to listen to.'),
    other('Did you go back?'),
    you('I kept going back. I kept bringing something different.'),
    other('You have not lost the way, then.'),
    you('Sometimes I forget which way I meant.'),
    other('We have a little room before the next thing. Use it.')
  ],{next:'touch-choice'}),
  'touch-choice':choice([
    other('What do you want to take with you now?')
  ],[go('sound','The sound.','carry-sound'),go('attention','The attention.','carry-attention')]),
  'carry-sound':timed([
    you('The sound.'),
    other('All of it?'),
    you('As much as I can.'),
    other('You will have your hands full.'),
    you('They were full before.'),
    other('Yes. I should have noticed.')
  ],{next:'recording'}),
  'carry-attention':timed([
    you('The attention.'),
    other('What are you listening for?'),
    you('How much can happen before a sound is gone.'),
    other('Shall I be quiet?'),
    you('Not all the time.'),
    other('That is a relief.')
  ],{next:'recording'}),
  recording:timed([
    other('And then there were microphones.'),
    you('I wanted to keep some of it.'),
    other('Did that make it easier?'),
    you('It made it possible to listen again.'),
    other('And again.'),
    you('Yes.'),
    other('I am not complaining.'),
    you('Neither am I. Not exactly.')
  ],{next:'recording-choice'}),
  'recording-choice':choice([
    other('What do you hear when you go back?')
  ],[go('room','Things I missed in the room.','room'),go('waiting','I keep waiting for the note to land.','waiting')]),
  room:timed([
    you('Things I missed in the room.'),
    other('Small things?'),
    you('Things I stopped noticing because they were always there.'),
    other('You could leave some of them in.'),
    you('I know.'),
    other('You do not have to choose which ones tonight.')
  ],{next:'electronics'}),
  waiting:timed([
    you('I keep waiting for the note to land.'),
    other('Is it late?'),
    you('Sometimes I am early.'),
    other('Then we can wait for it.'),
    you('You make that sound easy.'),
    other('I can sit here. That is the easy part.')
  ],{next:'electronics'}),
  electronics:timed([
    you('There was another way I wanted to hear it.'),
    other('Through the electronics.'),
    you('Yes. A revoicing. Not a correction.'),
    other('I did not think you were correcting it.'),
    you('I wanted it to be able to change, and still know where I was.'),
    other('Do you?'),
    you('I can follow it.'),
    other('Then let us do that.')
  ],{next:'threshold-choice'}),
  'threshold-choice':choice([
    other('Would you like to get up?'),
    you('I could still hear it from there.'),
    other('Yes.'),
    you('Then why does it matter where I am?'),
    other('You do not have to give me a reason.')
  ],[go('finish','Let it finish.','revoicing')]),
  revoicing:timed([
    you('Let it finish.'),
    other('All right.'),
    you('There. That is the other sound.'),
    other('Do you want to choose between them?'),
    you('No.'),
    other('Good. I was hoping we could hear both.'),
    you('I can still find my way through it.'),
    other('Take your time.')
  ],{locked:true,next:'material'}),
  material:timed([
    you('It does not sound like wood now.'),
    other('No.'),
    you('But I know where the hands would go.'),
    other('You need not see them.'),
    you('I thought I needed a reason for every change.'),
    other('Would you like to tell me one?'),
    you('Not yet. I want to hear this.')
  ],{locked:true,next:'material-choice'}),
  'material-choice':choice([
    other('What is holding it together?')
  ],[go('line','The line is still there.','line'),go('space','It is the space around it.','space')],{locked:true}),
  line:timed([
    you('The line is still there.'),
    other('Yes.'),
    you('I am listening for where it breathes.'),
    other('Shall I count?'),
    you('Please do not.'),
    other('All right.')
  ],{locked:true,next:'unfinished-sentence'}),
  space:timed([
    you('It is the space around it.'),
    other('Too much?'),
    you('No. I wanted to leave it somewhere to go.'),
    other('Well, here it is.'),
    you('I was not thinking of this place.'),
    other('I know.')
  ],{locked:true,next:'unfinished-sentence'}),
  'unfinished-sentence':timed([
    you('I was saying something.'),
    other('About the sound.'),
    you('Yes.'),
    other('You can leave it there.'),
    you('I have not finished.'),
    other('I know. I am not going anywhere.')
  ],{locked:true,next:'return'}),
  return:timed([
    other('You said you were going to bring something back.'),
    you('I remember.'),
    other('To the marimba.'),
    you('I think I brought more than I meant to.'),
    other('There is room.'),
    you('Is there?'),
    other('For this.')
  ],{locked:true,next:'last-choice'}),
  'last-choice':choice([
    other('What shall we keep?')
  ],[go('beginning','The way it begins.','beginning'),go('release','The way it lets go.','letting-go')],{locked:true}),
  beginning:timed([
    you('The way it begins.'),
    other('All right.'),
    you('I think that is what I was after.'),
    other('Go on.'),
    you('No. Listen.'),
    other('I am listening.')
  ],{locked:true,next:'last'}),
  'letting-go':timed([
    you('The way it lets go.'),
    other('All right.'),
    you('It does not have to be much.'),
    other('No.'),
    you('A little more room, perhaps.'),
    other('Here.')
  ],{locked:true,next:'last'}),
  last:timed([
    you('I cannot tell where the edge of it is.'),
    other('The note?'),
    you('The room.'),
    other('Leave the room a moment.'),
    you('Will I still know when it ends?'),
    other('We can listen for the space after it.'),
    you('Do not count.'),
    other('No.'),
    you('There it is.'),
    other('Yes.'),
    you('Leave it there.')
  ],{locked:true,action:'commit'})
};

export const SOURCE_REST_COUPERIN_CONVERSATION=Object.freeze({id:'source-rest:catch',phase:'catch',title:'THE BENCH / COUPERIN',
  entry:'arrival',timed:true,cues:SOURCE_REST_COUPERIN_CUES,nodes:Object.freeze({...nodes,...sourceRestQuestionNodes('guitar-etudes',{phase:'catch'})})});
