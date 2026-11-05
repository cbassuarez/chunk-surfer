import {SOURCE_REST_COUPERIN_CONVERSATION} from './source-rest-couperin-conversation.js';
import {sourceRestQuestionNodes} from './source-rest-questions.js';
import {sourceRestEarthlyNodes} from './source-rest-earthly.js';

// The two seats use the music associated with Source II and III. These
// are conversations with an uncertain interlocutor, not claims about the
// person holding the controller or about an intelligence behind the game.
const line=(who,text)=>Object.freeze({who,text});
const you=text=>line('you',text);
const other=text=>line('other',text);
const go=(id,label,next)=>Object.freeze({id,label,next});
const leave=()=>Object.freeze({id:'rise',label:'Get up.',action:'leave'});
const node=(lines,choices)=>Object.freeze({lines:Object.freeze(lines),choices:Object.freeze([...choices,leave()])});
// Source II is carried by the recording's clock.
const timed=(lines,options={})=>Object.freeze({lines:Object.freeze(lines),choices:Object.freeze(options.choices||[]),...(options.next?{next:options.next}:{}),...(options.lockExit?{lockExit:true}:{}),...(options.action?{action:options.action}:{})});


const shared={
  'who-asked':node([
    you('Who is talking?'),
    other('I do not know which answer would make you get up.'),
    you('That is not an answer.'),
    other('No. It is the reason I hesitated.'),
    other('Call me the other part. The one that hears you reach the end of a sentence and waits to see what you will do with the silence.')
  ],[go('other-part','The other part of what?','other-part'),go('not-name','I do not need a name.','not-name')]),
  'other-part':node([
    you('The other part of what?'),
    other('A conversation. A piece of music. A person, perhaps, although I would not stake your life on that last one.'),
    you('Convenient.'),
    other('Enormously. It saves me having to pretend I know you.')
  ],[go('listen','Then listen with me.','phase-music')]),
  'not-name':node([
    you('I do not need a name.'),
    other('Good. Names have a way of making a thing seem safely finished.'),
    other('We have a little while before either of us has to decide what this is.')
  ],[go('listen','Listen with me.','phase-music')]),
  'time':node([
    you('There is something I am supposed to be doing.'),
    other('Yes.'),
    you('You could have said no.'),
    other('You would have known I was lying. There is always something waiting outside a piece of music.'),
    other('Sometimes it is a person. Sometimes it is a bill. Sometimes it is only the terrible feeling that if you stop, you will never start again.')
  ],[go('hurry','I cannot bear wasting time.','hurry'),go('tired','I am tired of being hurried.','tired'),go('both','Both are true.','both')]),
  'hurry':node([
    you('I cannot bear wasting time.'),
    other('I know the feeling you mean. Not yours in particular. The shape of it.'),
    other('A day closes and you count what is missing. You make the next day narrower so less can escape.'),
    you('And then?'),
    other('You discover that a narrow day is very good at keeping things out.')
  ],[go('pressure','What do you do with that?','pressure')]),
  'tired':node([
    you('I am tired of being hurried.'),
    other('Then do not let me hurry you into rest, either.'),
    you('That sounds like a trick.'),
    other('It might be. A hand on your shoulder can guide you or hold you down. You have to be allowed to turn around and see which.')
  ],[go('pressure','I am turning around.','pressure')]),
  'both':node([
    you('Both are true.'),
    other('Then they can sit on the same bench. They need not be made to shake hands.'),
    other('Wanting the work to matter and wanting an end to the pressure are not enemies. They just speak over each other when they are frightened.')
  ],[go('pressure','And if they never stop?','pressure')]),
  'pressure':node([
    other('I used to think pressure was evidence of love. The harder the weight, the more the thing beneath it must matter.'),
    you('Is it not?'),
    other('Sometimes. But a thumb can hold a page open or tear a hole in it. The paper cannot tell you which by the weight alone.'),
    you('So I put the work down?'),
    other('I do not know. Put the weight down for one breath. See if the work is still there when you pick it up.')
  ],[go('work','It might not be.','work'),go('resist','You make it sound easy.','resist')]),
  'work':node([
    you('It might not be there.'),
    other('No. Some things leave while we are resting.'),
    other('That is the terrible part of time. The answer cannot be that you must never rest; time takes things from the sleepless too.'),
    you('You are very calm about it.'),
    other('I have had a great deal of practice sounding calm.')
  ],[go('craft','Tell me about the music.','craft')]),
  'resist':node([
    you('You make it sound easy.'),
    other('I am sorry. I have made a sentence where you have to make a life.'),
    other('They are different materials. A sentence can end where I want it to. A life keeps bringing in weather.')
  ],[go('craft','Tell me about the music.','craft')]),
  'craft':node([
    other('Listen to the way one sound gives another a place to land.'),
    other('Not because it is weaker. Because a line held alone forever would stop being a line. It would become the air.'),
    you('And the next sound needs the one before it.'),
    other('Yes. Even when it answers by going somewhere the first one would never have gone.'),
    other('I like that it is built. Someone made choices small enough that you can miss every one of them and still be moved by the result.')
  ],[go('why','Why make anything that takes so much?','why'),go('made','I want to make something like that.','made')]),
  'why':node([
    you('Why make anything that takes so much?'),
    other('Because for a few moments the choices can hold more than the person who made them could hold alone.'),
    you('That sounds like a reason to make more.'),
    other('It could be. It is not a command. A beautiful thing is not a debt collector.')
  ],[go('passion','What about passion?','passion')]),
  'made':node([
    you('I want to make something like that.'),
    other('Then I hope you do. Not this. Not a replica of the feeling we are having in this room.'),
    other('Something with the particular difficulty that would only have occurred to you. Something another person can enter without knowing how it was made.'),
    you('What if it is not good enough?'),
    other('It will not be, at first. That is not a prophecy of failure. It is how a first attempt makes room for a second.')
  ],[go('passion','What about passion?','passion')]),
  'passion':node([
    other('Passion is not the same as being unable to stop.'),
    you('It feels very similar from inside.'),
    other('I know. But one of them can let you sleep and still be there in the morning.'),
    other('The other stands at the bed counting what you failed to finish.'),
    you('You cannot always tell them apart.'),
    other('No. I do not think there is a clean test. I think there are people who can help you tell, if you let them close enough to see.')
  ],[go('alone','There is nobody here.','alone'),go('people','What if I cannot reach them?','people')]),
  'alone':node([
    you('There is nobody here.'),
    other('Here is an unusually bad place to take a census.'),
    you('You are avoiding the question.'),
    other('Yes. I cannot give you a person. I can give you the time to remember that this room is not the whole world.')
  ],[go('silence','Let us be quiet.','silence')]),
  'people':node([
    you('What if I cannot reach them?'),
    other('Then the distance hurts. I will not call it a lesson or a gift.'),
    other('There may be a way back to them that neither of us can see from this seat. That is not a promise. It is a reason to keep the question open.')
  ],[go('silence','Let us be quiet.','silence')]),
  'silence':node([
    other('All right.'),
    other('There. Do you hear the small space before it comes round again?'),
    you('I thought I had imagined it.'),
    other('Perhaps you did. We can keep it anyway.')
  ],[go('stay','I could stay here.','stay'),go('keep','I want to keep listening.','keep-listening')]),
  'keep-listening':node([
    you('I want to keep listening.'),
    other('Then listen. You do not owe me an answer at the end of the phrase.'),
    other('The hands that played it are not in this room. The sound has travelled all this way without them and still manages to sound like hands.'),
    you('That is a kind of company.'),
    other('Yes. Not the kind that can open a door for you. But company.')
  ],[go('stay','I could stay here.','stay')]),
  'stay':node([
    you('I could stay here.'),
    other('You could. That is what this place is offering.'),
    other('You should know the price before you mistake the offer for kindness.'),
    other('Your body is dying. If you remain here and let go, this run ends. There will be no waking up farther along the corridor.'),
    you('And this place?'),
    other('Perhaps it is what a dying mind has made around the music. Perhaps the music is what found you there. I cannot prove which.'),
    other('You can still stand up. I will not call you a coward for going.')
  ],[go('not-ready','I am not ready. Tell me one more thing.','one-more'),go('understand','I understand.','threshold')]),
  'one-more':node([
    you('Tell me one more thing.'),
    other('You do not have to make the ending beautiful for it to have mattered.'),
    other('The unfinished thing mattered while you were making it. The people you failed to keep still had the hours you gave them. Nothing has to be completed here to prove that it was real.'),
    you('You are asking me to leave.'),
    other('I am asking you to know that you can. I would rather you were angry with me than find out too late.')
  ],[go('understand','I understand.','threshold')]),
  'threshold':node([
    other('The music will go on either way, for as long as there is somewhere for it to go.'),
    you('And if I stay?'),
    other('You die here. The run ends. There is no other task behind this one.'),
    other('I will be quiet while you decide.')
  ],[go('last-question','Wait. One last question.','last-question'),go('choose','I know the cost.','final-choice')]),
  'last-question':node([
    you('Was it worth listening?'),
    other('Yes.'),
    other('That answer does not tell you what to do next. A thing can be worth listening to and still have an end.'),
    other('I hope you heard the part you needed. If you did not, it was not your fault.')
  ],[go('choose','I know the cost.','final-choice')]),
  'final-choice':Object.freeze({
    lines:Object.freeze([
      other('The bench holds your weight. The room gives you back the next phrase.'),
      other('There is still time to stand.')
    ]),
    choices:Object.freeze([
      Object.freeze({id:'remain',label:'Stay here. Let me die.',action:'commit'}),
      Object.freeze({id:'rise',label:'Get up and continue.',action:'leave'})
    ])
  })
};

const phaseOpenings={
  'wrong-return':{
    'arrival':timed([
      other('There you are.'),
      you('Have you been waiting?'),
      other('Listening. I thought you might find your way here.'),
      you('You could have started without me.'),
      other('I did. You are just in time for the next bit.')
    ],{next:'first-choice'}),
    'first-choice':timed([
      you('That is mine, is it not?'),
      other('You tell me.')
    ],{choices:[go('remember','I remember making it.','remember'),go('quiet','Let me hear it.','hear')]}),
    'remember':timed([
      you('I remember making it.'),
      other('What do you remember first?'),
      you('How long the room kept sounding after I stopped.'),
      other('I can hear it as well.')
    ],{next:'first-listen'}),
    'hear':timed([
      you('Let me hear it.'),
      other('All right. I will be quiet.'),
      you('For how long?'),
      other('Let us not make promises.')
    ],{next:'first-listen'}),
    'first-listen':timed([
      other('There. Can you hear it after the mallet leaves?'),
      you('It is still moving around the room.'),
      other('I like the part after you have stopped playing.')
    ],{next:'interruption'}),
    'interruption':timed([
      you('What was that?'),
      other('I heard it too.'),
      you('It was close.'),
      other('Wait. It may pass.')
    ],{choices:[{id:'rise',label:'Get up.',action:'leave'},go('stay','Let it pass.','after-interruption')]}),
    'after-interruption':timed([
      you('For a moment I was back in the car.'),
      other('What did you see?'),
      you('The back of another car. Much too close.'),
      other('And now?'),
      you('The road is gone.'),
      other('The music is still here.')
    ],{next:'questions-entry'}),
    'ornaments':timed([
      you('I had to defend those ornaments to my professors.'),
      other('Every one?'),
      you('It felt like every one.'),
      other('I would have liked to hear your case.'),
      you('I wanted the little turn to belong there. Not to sound put on afterwards.'),
      other('And then you had to play the thing you had argued for.'),
      you('That was the difficult part.')
    ],{next:'ornament-choice'}),
    'ornament-choice':timed([
      other('Would you change them now?')
    ],{choices:[go('change','Some of them.','change'),go('keep','I would keep them.','keep')]}),
    'change':timed([
      you('Some of them.'),
      other('Already? I was rather fond of them.'),
      you('I would have to sit down with it again.'),
      other('You say that like a sentence.'),
      you('It depends on the day.')
    ],{next:'organ'}),
    'keep':timed([
      you('I would keep them.'),
      other('All right. I withdraw my objection.'),
      you('You had an objection?'),
      other('I was going to make one up, but you look ready to argue again.')
    ],{next:'organ'}),
    'organ':timed([
      you('I went looking at what organists did with Bach.'),
      other('For a piece he wrote for a violin?'),
      you('I wanted to know if it could have been written for something else.'),
      other('Do you think he would have approved?'),
      you('I think he could be very particular about a note, and still let the music change instruments.'),
      other('Convenient for your marimba.'),
      you('Very. I wanted a better reason than convenience, though.')
    ],{next:'mistakes'}),
    'mistakes':timed([
      you('I hear the places I missed first.'),
      other('Before anything else?'),
      you('Sometimes before they happen. I am already waiting for them.'),
      other('And the rest?'),
      you('The rest has to get past me.'),
      you('I tried so hard to get it right.'),
      other('I can hear that too.'),
      you('That is not the part I wanted you to hear.'),
      other('It made me listen more closely.')
    ],{next:'mistake-choice'}),
    'mistake-choice':timed([
      other('What happens when you hear it now?')
    ],{choices:[go('wince','I still wince.','wince'),go('listen','I hear more than I did.','more')]}),
    'wince':timed([
      you('I still wince.'),
      other('I saw that.'),
      you('Do not look at me. Listen.'),
      other('I am. I am listening to both.')
    ],{next:'voice'}),
    'more':timed([
      you('I hear more than I did.'),
      other('What did you miss?'),
      you('The room. I was so busy listening to my hands.'),
      other('The room had a part too, then.')
    ],{next:'voice'}),
    'voice':timed([
      other('You used to sing along.'),
      you('I did not know the microphone could hear me.'),
      other('You heard it afterwards, then.'),
      you('Yes. Along with everything else I wanted to fix.'),
      other('Would you take it out now?'),
      you('No. Just do not tell anyone.'),
      other('I am very good at keeping things.')
    ],{next:'caid'}),
    'caid':timed([
      you('John Caid would tell me to listen to it as a sound.'),
      other('He might open the window as well.'),
      you('Let the street in?'),
      other('The street, the chair, you singing to yourself.'),
      you('That sounds like a Fluxus instruction.'),
      other('Shall I write it down?'),
      you('You will make it too long.'),
      other('Listen, then.')
    ],{next:'distance'}),
    'distance':timed([
      you('Bach wrote this so long ago.'),
      other('And here it is, with your voice in it.'),
      you('I played it for her. I played it for Lyle.'),
      other('Not the same version.'),
      you('No. First in a practice room, early on.'),
      other('And then?'),
      you('Later, at a recital.'),
      other('There was a lot of work between the two.'),
      you('I still do not know if I understood him.'),
      other('What would you play him first?')
    ],{lockExit:true,next:'distance-choice'}),
    'distance-choice':timed([
      you('There are so many people between those notes and me.')
    ],{lockExit:true,choices:[go('teachers','The people who taught me.','teachers'),go('strangers','People I will never meet.','strangers')]}),
    'teachers':timed([
      you('The people who taught me.'),
      other('And the people who taught them.'),
      you('Some of them would disagree with me.'),
      other('I think you would disagree back.')
    ],{lockExit:true,next:'pressure'}),
    'strangers':timed([
      you('People I will never meet.'),
      other('And they will never meet you.'),
      you('That is not quite the same as being alone with it.'),
      other('No. There are rather a lot of us here.')
    ],{lockExit:true,next:'pressure'}),
    'pressure':timed([
      you('There is still so much to do.'),
      other('You have only just sat down.'),
      you('You are supposed to tell me it can wait.'),
      other('Would you believe me?'),
      you('Not if you said all of it.'),
      you('Then why does it feel so good to stop?'),
      other('You do not need me to answer that.'),
      you('I do, tonight.'),
      other('Then leave it with me a little while.')
    ],{lockExit:true,next:'pressure-choice'}),
    'pressure-choice':timed([
      other('What were you hoping to make?')
    ],{lockExit:true,choices:[go('beautiful','Something beautiful.','beautiful'),go('hold','Something that could hold us.','hold')]}),
    'beautiful':timed([
      you('Something beautiful.'),
      other('You would not leave the light alone, either.'),
      you('It mattered where it fell.'),
      other('Look. It is still moving.')
    ],{lockExit:true,next:'breakdown'}),
    'hold':timed([
      you('Something that could hold us.'),
      other('That is a difficult thing to ask of a room.'),
      you('I am asking it anyway.'),
      other('Then let us see how long it holds.')
    ],{lockExit:true,next:'breakdown'}),
    'breakdown':timed([
      you('I thought there would be more time.'),
      other('Stay with me a moment.'),
      you('The room—'),
      other('I can see it.'),
      you('I thought I had lost the place.'),
      other('No. There. Listen.'),
      you('I hear it.'),
      other('That is it.')
    ],{lockExit:true,next:'return'}),
    'return':timed([
      you('It comes back.'),
      other('A little differently.'),
      you('There is that little turn again.'),
      other('I am listening.'),
      you('Will you stay for the rest?'),
      other('Of course.')
    ],{lockExit:true,next:'earthly'}),
    'last-choice':timed([
      other('There. Do you hear the lower line?')
    ],{lockExit:true,choices:[go('hear','I hear it.','last-hear'),go('again','Let it come round again.','last-again')]}),
    'last-hear':timed([
      you('I hear it.'),
      other('It is still there underneath.'),
      you('Even now.'),
      other('Even now.')
    ],{lockExit:true,next:'last'}),
    'last-again':timed([
      you('Let it come round again.'),
      other('I think I hear it coming.'),
      you('There.'),
      other('There it is.')
    ],{lockExit:true,next:'last'}),
    'last':timed([
      you('I like that note.'),
      other('The one underneath?'),
      you('Yes. That one.'),
      you('I cannot see where it is coming from.'),
      other('You need not find it.'),
      you('I was still trying to hold the rest of the room.'),
      other('You can hear this without holding all of that.'),
      you('There was someone I meant to play it for.'),
      other('You need not tell me.'),
      you('Stay until the sound is gone.'),
      other('I am here.'),
      you('Not yet.'),
      other('All right.')
    ],{lockExit:true,action:'commit'})
  },
  'catch':{
    'arrival':node([
      other('There is room for you here.'),
      you('This is not a room.'),
      other('Then let us call it a place to sit. We need not settle the architecture before the next note.'),
      other('Listen. It has come round again.')
    ],[go('ask','Who are you?','who-asked'),go('hear','I hear it.','phase-music')]),
    'phase-music':node([
      you('Couperin.'),
      other('A harpsichord. A little of L’Art de toucher le clavecin, shaped by the way each touch begins and lets go.'),
      you('It keeps beginning again.'),
      other('This place has caught a short fragment and made a loop of it. The recording and the music are more than this room lets you hear.'),
      other('Still, a few seconds can hold a surprising number of decisions.')
    ],[go('touch','The notes do not last.','couperin-touch'),go('ornament','There is so much in the small movements.','couperin-ornament')]),
    'couperin-touch':node([
      you('The notes do not last.'),
      other('Not the way a voice can. The touch is over, and the string is already giving back what it can.'),
      other('So the next note has to arrive without being able to rescue the last one.'),
      you('You hear that as sad.'),
      other('A little. I hear the care, too. A hand can be exact without being cruel.')
    ],[go('time','I should not be sitting here.','time')]),
    'couperin-ornament':node([
      you('There is so much in the small movements.'),
      other('A turn of the hand can make a small space feel furnished.'),
      you('You make it sound decorative.'),
      other('I do not mean decoration as an apology. Someone cared how the moment felt while it was passing.'),
      other('That is a serious thing to care about.')
    ],[go('time','I should not be sitting here.','time')])
  }
};

function build(phase,title){const nodes=phase==='wrong-return'?{...phaseOpenings[phase],...sourceRestQuestionNodes('ornaments'),
  ...sourceRestEarthlyNodes(phase,{next:'last-choice'})}:{...shared,...phaseOpenings[phase]};return Object.freeze({id:`source-rest:${phase}`,phase,title,entry:'arrival',nodes:Object.freeze(nodes)});}
export const SOURCE_REST_CONVERSATIONS=Object.freeze({
  'wrong-return':build('wrong-return','THE BENCH / BACH'),
  'catch':SOURCE_REST_COUPERIN_CONVERSATION,
});
// The natatorium intentionally reveals Sarah's name only if the player named
// her in the confession. The same memory exists in both versions; changing
// the address does not infer an unseen choice or rewrite the relationship.
const unnamed=SOURCE_REST_CONVERSATIONS['wrong-return'];
const namedDistance=Object.freeze({...unnamed.nodes.distance,lines:Object.freeze(unnamed.nodes.distance.lines.map((entry,index)=>
  index===2?you('I played it for Sarah. I played it for Lyle.'):entry))});
const sarahNamed=Object.freeze({...unnamed,nodes:Object.freeze({...unnamed.nodes,distance:namedDistance,
  ...sourceRestEarthlyNodes('wrong-return',{next:'last-choice',sarahNamed:true})})});
// Source III never says her name in its own story. Only his late question
// about her follows the confession, exactly as Source II's does.
const catchUnnamed=SOURCE_REST_CONVERSATIONS.catch;
const catchNamed=Object.freeze({...catchUnnamed,nodes:Object.freeze({...catchUnnamed.nodes,
  ...sourceRestEarthlyNodes('catch',{next:'last-choice',sarahNamed:true})})});
export function sourceRestConversation(phase,{sarahNamed:named=false}={}){
  if(named&&phase==='wrong-return')return sarahNamed;
  if(named&&phase==='catch')return catchNamed;
  return SOURCE_REST_CONVERSATIONS[phase]||null;
}
