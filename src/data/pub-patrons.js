const speaker=(id,name,text)=>({who:'unknown',voiceSpeaker:`pub-${id}`,sourceLabel:name.toUpperCase(),text});
const question=(text)=>({who:'you',text});
const questions={mavis:'Why are you staying?',ed:'What happened on the last shift?',bert:'Are those glasses finished with?',farah:'What is Iona like?',nell:'Did you hear the bells?',arthur:'Why is it called The Lyric?'};
const topic=(text,goto)=>({text,goto,hideWhenAsked:true});
const leave=()=>({text:'Leave them to their evening.'});
const people={
  mavis:{name:'Mavis Bell',first:'They have taken our stop off the board. Ed says that means we can stop waiting. I say they could have told the bus.',again:'Still no bus. Considerably better seating.',
    subject:'Ask about the old bus route.',answer:['Forty-eight. You could get the last chord of the concert and still catch it if you left through the side doors.','The conductor used to wait for the violin cases. I know, because I was the conductor.'],
    second:'Ask why she is staying.',reply:'Iona has been bringing tea to the people outside. I thought she could do with somebody keeping an eye on her for a change.'},
  ed:{name:'Ed Mercer',first:'Mind that chair. One short leg. Mavis has a folded timetable under it and will have to catch the bus standing up.',again:'She has put another timetable under it. Service is improving.',
    subject:'Ask whether he works at Ellery.',answer:['Used to clean it. Nights. They left the lights on for me, mostly.','Everybody remembers the performances. I remember what they left under the seats. You learn a different building.'],
    second:'Ask about the last shift.',reply:'They asked us to leave the cups. Furniture, cables, half a biscuit: take it out. Cups: leave those. Nobody could tell me why.'},
  bert:{name:'Bert Hales',first:'That is a six. She says it is a five. You look like a man paid to identify a thing without changing it.',again:'We have agreed it is a six. We have not agreed whose six.',
    subject:'Look at the dominoes.',answer:['Proper bone. My father brought them home in a tobacco tin.','Farah says she remembers buying them in Woolworths. We have never needed to settle that.'],
    second:'Ask about the empty glasses.',reply:'I kept meaning to take those back. Every time I stood up she said it was my turn.'},
  farah:{name:'Farah Nouri',first:'Do not adjudicate. He likes an audience more than he likes being right.',again:'He is thinking. We may be here some time.',
    subject:'Ask how long they have played here.',answer:['Long enough to remember when the conservatoire people came in after the recitals. Everybody apologising for being loud.','Then the students started bringing their own music. Then they stopped coming. The tables outlast a great deal.'],
    second:'Ask about Iona.',reply:'She will give you a job if you stand still. It is how she makes sure nobody stands by themselves.'},
  nell:{name:'Nell Sayer',first:'I have finished work. If you want anything sensible said, try somebody who has slept.',again:'Still off duty. That is not a complaint.',
    subject:'Ask about the people outside.',answer:['I came to make sure the older ones had somewhere to warm up. Then I got tired of deciding who counted as older.','The door is there. Iona has left it on the latch. That seems a better arrangement.'],
    second:'Ask whether she heard the bells.',reply:'I felt the table move, then the glass. The sound came last. Arthur has stopped saying it is the buses.'},
  arthur:{name:'Arthur Pike',first:'There used to be a piano where that stool is. It had one good note. People were surprisingly inventive with it.',again:'Same stool. Same missing piano.',
    subject:'Ask what became of the piano.',answer:['They lent it to the school for a week. In 1987.','Iona says she is making a list. Every time I ask, the list has acquired something smaller and more urgent.'],
    second:'Ask about the pub.',reply:'The Lyric. Not the Lyrics. One is an intention; the other would oblige us to remember the words.'},
};
export function pubPatronConversation(actorId,{revisited=false}={}){
  const id=String(actorId||'').replace('pub-patron-',''),person=people[id];if(!person)return null;
  const l=text=>speaker(id,person.name,text),choices=[topic(person.subject,'history'),topic(person.second,'tonight'),leave()];
  return{slate:`THE LYRIC / ${person.name.toUpperCase()}`,startAt:revisited?'again':'start',tree:{
    start:{speaker:person.name.toUpperCase(),lines:[l(person.first)],choices},
    again:{speaker:person.name.toUpperCase(),lines:[l(person.again)],choices},
    history:{speaker:person.name.toUpperCase(),lines:person.answer.map(l),goto:revisited?'again':'start'},
    tonight:{speaker:person.name.toUpperCase(),lines:[question(questions[id]),l(person.reply)],goto:revisited?'again':'start'},
  }};
}
export const PUB_OVERHEARDS=Object.freeze([
  [speaker('bert','Bert Hales','Your move.'),speaker('farah','Farah Nouri','It was my move when you began that story.')],
  [speaker('mavis','Mavis Bell','They used to wait for the violin cases.'),speaker('ed','Ed Mercer','You have said.'),speaker('mavis','Mavis Bell','Somebody ought to.')],
  [speaker('arthur','Arthur Pike','That is the bells.'),speaker('nell','Nell Sayer','I know.')],
  [speaker('iona','Iona Reed','Whose coat is on the spare chair?'),speaker('farah','Farah Nouri','It is a spare coat. Leave it somewhere to sit.')],
  [speaker('iona','Iona Reed','There is soup if you are staying.'),speaker('nell','Nell Sayer','It would be a shame to disappoint the soup.')],
  [speaker('mavis','Mavis Bell','Take your scarf off before you roast.'),speaker('ed','Ed Mercer','I am only just getting the street out of it.')],
  [speaker('farah','Farah Nouri','Leave him the heel. He likes the heel.'),speaker('bert','Bert Hales','Only when everybody else wants it.')],
  [speaker('iona','Iona Reed','Tea for the ones at the rail?'),speaker('arthur','Arthur Pike','On the tray. There is a clean towel under it.')],
  [speaker('nell','Nell Sayer','Who has been warming my gloves?'),speaker('mavis','Mavis Bell','They were nearest the stove. We had to put something on the chair.')],
]);
