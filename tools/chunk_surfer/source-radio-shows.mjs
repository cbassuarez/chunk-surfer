// Continuous performer scripts. These replace the sparse bulletin treatment;
// none of the names below are members of the game's principal cast.
export const radioShowRoles={
 MICK:'LAST ORDERS host. A talented, obnoxious local shock jock. Quick, partisan about trivial things, delighted by his own bad argument. Let Bev win. Earn the fear by first being funny.',
 BEV:'LAST ORDERS producer. Dry, faster than Mick and willing to puncture him. Usually off-mic or on a cheaper desk microphone. Later she is the first person to take the fault seriously.',
 VERA:'WHO IS THE BASTARD? presenter. A breezy, appalling radio magistrate who awards certainty instead of good advice. Enjoy the callers; do not sound like a villain.',
 RON:'An adult phone-in caller with a genuine petty grievance. Exact, stubborn, accidentally funny. Later the facts become physically impossible, while he keeps trying to describe them accurately.',
 MAGDA:'A second adult caller, nominally the other side of Ron’s dispute. Unflustered and practical. Record on a different telephone perspective; no spooky voice or resemblance to Sarah.',
 JUNE:'THE THIRD PROGRAMME presenter. Smooth, precise, amused despite herself. She can keep an arts interview on air through almost anything, until she cannot.',
 FENN:'Doctor Fenn, an extravagantly confident composer. Never wink at the joke. Every absurd procurement problem is a serious artistic choice. His first genuine fear is quiet and plain.',
 LEN:'The arts outside-broadcast technician. An ordinary working adult, close to the actual mechanism. Few lines, each concrete. Do not play an oracle or explain what Source is.'
};
const S=(role,text,note='')=>({role,text,note});
const FX=(text,seconds,note='')=>({role:'SOUND',text,note,seconds,signalRole:'unattributed'});
const blocks={
 service:[
 ['The pothole phone-in',[
 S('MICK','Tonight: potholes. Not the council. You. I saw a man brake for a pothole and I thought: that is how they win.'),
 S('BEV','Who wins?'),
 S('MICK','The hole. You have rewarded the hole with attention. My father drove a Morris straight through a flooded underpass. Never complained.'),
 S('BEV','Was he in it?'),
 S('MICK','Eventually. We got him out. Listen, people have become soft. Everyone wants a road beneath every single wheel.'),
 S('BEV','Four is the current recommendation.'),
 S('MICK','You buy an off-road vehicle and then write to the council because you have briefly gone off the road.'),
 S('BEV','That is quite good.'),
 S('MICK','Thank you. Put that on the website. A bit of give. That is what a road needs. A bit of give.'),
 S('BEV','Local service notice: surface water on the unlit access road. Take care on the bridge.'),
 S('MICK','There. Useful. Have we satisfied the licence?'),
 S('BEV','No. You called the mayor a speed bump.'),
 S('MICK','And traffic has improved enormously since he took office.')
 ],'Commercial late-night talk. Quick cross-talk, one short sting between the service notice and the punchline; no long beds separating sentences.'],
 ['The apology you have not made',[
 S('MICK','A clarification. The mayor is not a speed bump. A speed bump has occasionally slowed down a property developer.'),
 S('BEV','You are making it worse.'),
 S('MICK','I have received a text saying, “Mick, the road outside my house has started moving.” Good. Finally, a public service that comes to you.'),
 S('BEV','We have had six of those.'),
 S('MICK','Six roads?'),
 S('BEV','Six identical texts. Same spelling mistake. Different numbers.'),
 S('MICK','People coordinate. Look at the residents’ parking association. Thirty-seven people, one personality.'),
 S('BEV','There is an apology in the running order.'),
 S('MICK','I have not apologised.'),
 S('BEV','It is your voice.'),
 S('MICK','Play it.'),
 S('MICK','I am sorry. I thought there was still road under it.','A separate pickup, sincere and unperformed. This is a recorded insert, not Mick changing character mid-sentence.'),
 S('MICK','What was that from?'),
 S('BEV','It says tomorrow.'),
 S('MICK','Well, take it out. I am not doing tomorrow’s apology on today’s money.')
 ],'The apology is an unmistakable edit. Keep the ordinary desk sound before and after it. No sting tells the listener what to think.'],
 ['A bit of give',[
 S('MICK','We have a council statement. “The surface is responding within acceptable limits.” That is also what my first wife said about the mattress.'),
 S('BEV','There is more.'),
 S('MICK','“Drivers are advised not to stop on the soft section.” Bev, I have never deliberately stopped on a soft section in my life.'),
 S('BEV','Can you stop doing jokes for a second?'),
 S('MICK','That has been suggested by much better people than you.'),
 S('BEV','The traffic camera is not rain. Look at the white line.'),
 S('MICK','It is a camera fault.'),
 S('BEV','The paint goes in with it.'),
 S('MICK','With what?'),
 S('BEV','When the surface moves. The line goes in. Then it comes back.'),
 S('MICK','A bit of give. We said that. We were very clear.'),
 S('BEV','Mick. Put your feet on the floor.'),
 S('MICK','Why?'),
 S('BEV','Tell me what it feels like.'),
 S('MICK','We are going to a break.'),
 S('BEV','We have just had one.'),
 S('MICK','Then people know what to expect.')
 ],'The show is still trying to be a show. The producer describes one concrete movement; do not read out a list of the game’s monsters.'],
 ['The laugh gets ahead',[
 S('MICK','Welcome back. We are not taking any more calls about the road. You have a steering wheel. Participate.'),
 S('BEV','They cannot hear you in the building.'),
 S('MICK','Which building?'),
 S('BEV','Here. The monitors are off. You are only coming through the wall.'),
 S('MICK','That is the other studio.'),
 S('BEV','The other studio is a cupboard. You complained when they put it there.'),
 S('MICK','I complain about many things. That is the format.'),
 S('BEV','Do not say the next bit.'),
 S('MICK','What next bit?'),
 S('BEV','The bit about the mayor.'),
 S('MICK','I was not going to—'),
 S('BEV','Listen.'),
 FX('[Mick’s exact earlier laugh, before the joke.]',1.8,'Reuse the ordinary performance. Leave space to actually hear it; do not ask Mick to imitate an evil version.'),
 S('MICK','That is my laugh.','He recognises an off-mic replay. Do not laugh while saying this line.'),
 S('BEV','I know.'),
 S('MICK','I have not said the joke.'),
 S('BEV','I know.'),
 S('MICK','Pull the fader down.'),
 S('BEV','It is down.'),
 S('MICK','Then stop watching it. Come round here. Bring your chair. No, leave the chair. Just come round.')
 ],'Before “That is my laugh”, insert the exact laugh recorded after an ordinary earlier joke. It is programme material and goes silent with radio OFF.'],
 ['The last useful thing',[
 S('MICK','If you are still on the road, this is the useful part. No clever stuff. Find somewhere solid to pull in. Do not follow somebody else’s lights just because they look confident.'),
 S('BEV','Do not give directions.'),
 S('MICK','That was not directions. That was advice. I have done advice for eleven years.'),
 S('BEV','You told a man to concrete his neighbour’s pond.'),
 S('MICK','It was a boundary dispute. We do not have to finish every argument tonight.'),
 S('BEV','The door is open.'),
 S('MICK','Good. Leave it.'),
 S('BEV','It is open underneath.'),
 S('MICK','Right. All right. Get your coat.'),
 S('BEV','You are still on.'),
 S('MICK','I know. Let them have the music.'),
 S('BEV','Which music?'),
 S('MICK','Anything with an end.'),
 S('BEV','Mick?'),
 S('MICK','I am here. Come towards my voice. Slowly. There is no prize for being first.')
 ],'Retain the two people and their frayed comic rhythm. No actor speaks as HUSH. A short failed station sting may follow; no hidden line survives the receiver being switched off.']
 ],
 company:[
 ['Who is the bastard?',[
 S('VERA','Who Is the Bastard? Our nightly public service. You give us a complicated human situation; I solve it in twelve seconds. Ron, what has the little sod done?'),
 S('RON','I lent my neighbour a ladder. He will not give it back.'),
 S('VERA','Bastard. Next.'),
 S('RON','I have not finished.'),
 S('VERA','You will have to make him better quite quickly.'),
 S('RON','He says I can have it when he has finished the wall.'),
 S('VERA','How long is the wall?'),
 S('RON','That is the question, Vera. It is longer than it was.'),
 S('VERA','They do that while you build them. That is almost the point.'),
 S('RON','It has gone across my drive.'),
 S('VERA','Now we have a bastard. A developing bastard. Has he blocked you in?'),
 S('RON','No. He has blocked himself in.'),
 S('VERA','Then sit in your car and enjoy justice. Most of us have to wait until Christmas for that.'),
 S('RON','He wants me to pass him the ladder.'),
 S('VERA','Through the wall?'),
 S('RON','Over it.'),
 S('VERA','Ron. I may need thirteen seconds.')
 ],'A real phone-in pace: interruptions, delight in the details, tiny reactions. The host is bad at moral judgement, not bad at radio.'],
 ['The other side',[
 S('VERA','We have Magda, who says she is on the other side of Ron’s wall. Magda, have you taken his ladder?'),
 S('MAGDA','No. I have my own ladder. He keeps putting his through my kitchen.'),
 S('RON','It is not a kitchen. It is the side passage.'),
 S('MAGDA','Then why is my cooker in it?'),
 S('VERA','Strong question. Ron?'),
 S('RON','It was not there yesterday.'),
 S('VERA','Was the rest of the house?'),
 S('RON','Most of it.'),
 S('MAGDA','I told him not to move the door.'),
 S('RON','It is my door.'),
 S('MAGDA','It is on my side.'),
 S('VERA','I am going to stop you both. A door is famously on two sides. It is one of its main features.'),
 S('MAGDA','Not this one.'),
 S('VERA','Ron, have you made a one-sided door? Because that is bigger than a neighbour dispute. That is Dragons’ Den.'),
 S('RON','I just want the ladder.'),
 S('VERA','I know. It is the only thing in this story with an agreed length.')
 ],'Keep each caller’s telephone room distinct. The impossible geography grows out of a petty, enjoyable argument; nobody announces a supernatural event.'],
 ['A demonstration',[
 S('VERA','For listeners joining us: Ron has lent a ladder, Magda has gained a kitchen, and I am paid the same regardless. Ron, open the door.'),
 S('RON','Which side?'),
 S('VERA','Your side. We have had this.'),
 S('RON','It opens into her kitchen.'),
 S('MAGDA','No. It opens into his hall.'),
 S('VERA','That sounds like a normal door having a very difficult evening.'),
 S('RON','I can see my coat. It is on the peg.'),
 S('VERA','Good. Put it on. Get out. Think about the ladder in the morning.'),
 S('RON','It is still on me.'),
 S('VERA','What is?'),
 S('RON','The coat.'),
 S('MAGDA','He is not joking now.'),
 S('VERA','Ron, there are two coats. People own similar coats. That is how shops work.'),
 S('RON','It has got my hand in the pocket.'),
 S('VERA','Take your hand out.'),
 S('RON','Which one?'),
 S('VERA','All right. Nobody move anything for a moment. Especially the door.')
 ],'First genuine loss of the host’s certainty. Ron describes the visible detail plainly; no ghost effect on his voice.'],
 ['The hold line',[
 S('VERA','We are taking Ron off air for a moment. Stay on the line, Ron. We will get somebody who is actually qualified.'),
 S('RON','Do not put me on hold.'),
 S('VERA','I can still hear you.'),
 S('RON','There is somebody on it.'),
 S('VERA','On what?'),
 S('RON','The music. Under the music. He keeps trying to say the end of something.'),
 S('MAGDA','That is not the music. It is next to him.'),
 S('VERA','Magda, where are you standing?'),
 S('MAGDA','On the other side.'),
 S('VERA','Of the wall?'),
 S('MAGDA','Of Ron.'),
 S('RON','I can hear your chair, Vera.'),
 S('VERA','You are listening to the radio.'),
 S('RON','No. When you lean back. I can hear the little wheel on the tile.'),
 S('VERA','I am going to stand up.'),
 S('RON','Please do not. There is not room.'),
 S('VERA','There is nobody under my desk.'),
 S('RON','I did not say under.')
 ],'The hold sting is original programme audio. Reuse one real chair-wheel sound in two incompatible perspectives. Do not add an identifiable extra voice.'],
 ['An inadequate verdict',[
 S('VERA','Ron. I cannot see what you can see. I should not have asked you to open anything.'),
 S('RON','Can you stay on?'),
 S('VERA','Yes.'),
 S('MAGDA','Do not tell him yes unless you can.'),
 S('VERA','I am not leaving the desk.'),
 S('RON','It is only my arm in the coat now.'),
 S('VERA','Keep looking at something that is actually in the room with you. The ladder. Can you see the ladder?'),
 S('RON','It is coming through.'),
 S('VERA','Good. Let it. Leave it alone.'),
 S('RON','It keeps coming.'),
 S('MAGDA','It is longer on this side.'),
 S('VERA','I know. All right. We are not solving that tonight. We are going to count the rungs. You count them. I will stay here.'),
 S('RON','One. Two. Three.'),
 S('VERA','Yes.'),
 S('RON','One. Two. Three.'),
 S('VERA','Ron?'),
 S('RON','I have not gone back to the beginning.'),
 S('VERA','I know. Keep talking.')
 ],'No outcome or death is declared. The presenter finally listens instead of judging. The loop may retain the unresolved call; the player can leave the frequency.']
 ],
 music:[
 ['The municipal commission',[
 S('JUNE','The Third Programme. Tonight, Doctor Fenn’s new work for car park, amplified shopping trolley and the last available viola. Doctor, is it music?'),
 S('FENN','That is not a useful question.'),
 S('JUNE','It is the useful question on a music programme.'),
 S('FENN','The listener is invited to bring their own definition.'),
 S('JUNE','And a pound coin, I understand.'),
 S('FENN','The trolley deposit is a separate conversation.'),
 S('JUNE','The Arts Committee has bought six hundred metres of cable. Where does the audience sit?'),
 S('FENN','In the work.'),
 S('JUNE','There are no chairs.'),
 S('FENN','We did not want the usual barriers.'),
 S('JUNE','You have kept the vehicle barrier.'),
 S('FENN','It is a tuned barrier. Len, demonstrate.'),
 S('LEN','It will only go up if I validate the ticket.'),
 S('JUNE','Splendid. An instrument that has retained a job.'),
 S('FENN','You will hear a very long suspended note.'),
 S('LEN','That is the motor. It is stuck.'),
 S('JUNE','Then we shall hear it in full.')
 ],'A confident, ridiculous live arts interview. Play the actual small trolley/coin/barrier-motor sounds, with deadpan reaction space under one second.'],
 ['Audience development',[
 S('JUNE','We are back with Doctor Fenn. The barrier is still raised, which the programme describes as a refusal of closure.'),
 S('FENN','Correct.'),
 S('LEN','It is down.'),
 S('FENN','Also correct. It is a live work.'),
 S('JUNE','You promised an encounter with the scale of public space. How big is the car park?'),
 S('FENN','It varies with attendance.'),
 S('JUNE','No one has come.'),
 S('FENN','Then we should be very intimate.'),
 S('LEN','I cannot see the far wall.'),
 S('JUNE','A lighting problem?'),
 S('LEN','I could see it when we put the microphones out.'),
 S('FENN','The room is answering the work.'),
 S('JUNE','The room is council property. Has anyone told them?'),
 S('LEN','June, the cable has gone tight.'),
 S('JUNE','We bought six hundred metres.'),
 S('LEN','I know. I am holding the end.'),
 S('FENN','Beautiful. Do not disturb that.'),
 S('JUNE','Doctor. We may have to distinguish the composition from the insurance claim.')
 ],'The joke’s physical premises remain audible. There is no spooky station identification between turns.'],
 ['A resonant interior',[
 S('JUNE','You have asked the viola player to stop. Is that the end of the piece?'),
 S('FENN','No. It is the beginning of listening.'),
 S('JUNE','Very economical. We have had a musician here since four.'),
 S('LEN','He has stopped.'),
 S('JUNE','We can hear that.'),
 S('LEN','No. The man has stopped. The note has not.'),
 S('FENN','A resonant interior.'),
 S('JUNE','How long should the resonance last?'),
 S('FENN','It is difficult to assign a limit.'),
 S('LEN','The wall moves when it gets louder.'),
 S('JUNE','Which wall?'),
 S('LEN','All of that side. Where the bays were.'),
 S('FENN','Nobody touch it.'),
 S('JUNE','I think we have established audience participation is optional.'),
 S('LEN','It is wet on the cable.'),
 S('JUNE','There is a leak.'),
 S('LEN','It is coming out where the cable goes in.'),
 S('FENN','Take your hand off it, Len.'),
 S('JUNE','Doctor, is that an artistic instruction?'),
 S('FENN','No.')
 ],'The held note is an original instrument/speaker resonance, not a human scream or a named character’s music. First fear arrives on the last plain “No.”'],
 ['The work continues without its author',[
 S('JUNE','We are having a technical difficulty. You may still be able to hear the work.'),
 S('LEN','Do not call it that.'),
 S('FENN','Disconnect the amplifier.'),
 S('LEN','I have.'),
 S('JUNE','The lights have gone out at that end.'),
 S('FENN','I can see.'),
 S('LEN','No. They are inside it.'),
 S('JUNE','Len, come back to the microphone.'),
 S('LEN','I am at the microphone.'),
 S('JUNE','Not that one. The one beside me.'),
 S('FENN','There was only one.'),
 S('JUNE','There is one beside me.'),
 S('LEN','That is the end of the cable.'),
 S('JUNE','I am holding it.'),
 S('LEN','Let it go.'),
 S('JUNE','It is not pulling.'),
 S('LEN','I know. It is waiting for you to pull.'),
 S('FENN','We should leave the equipment.'),
 S('JUNE','Yes. I think that would be a useful conclusion to the work.'),
 S('LEN','June. That is not a door handle.'),
 S('JUNE','Then what have I got hold of?')
 ],'The last question receives a short tactile movement, not a monster answer. Retain real adults in a real acoustic space that has become impossible.'],
 ['Continuity announcement',[
 S('JUNE','We are going to leave the microphones here. If you can hear this, the programme has not finished. We are leaving.'),
 S('FENN','It follows the cable.'),
 S('LEN','Leave the cable.'),
 S('JUNE','Doctor, put the ticket down. Give Len your hand.'),
 S('FENN','I have not got a ticket.'),
 S('JUNE','Then what is that in your hand?'),
 S('FENN','The end of the barrier.'),
 S('LEN','Let it go.'),
 S('FENN','It is coming through my hand.'),
 S('JUNE','Len. There is a car going past.'),
 S('LEN','Do not wave. Come this way.'),
 S('JUNE','The driver cannot possibly see us from there.'),
 S('FENN','Then we are not in the car park.'),
 S('JUNE','No. Perhaps not.'),
 S('LEN','One more step. Mind the—'),
 S('JUNE','Len?'),
 S('FENN','Leave it. Leave the bloody thing.'),
 S('JUNE','We apologise for the interruption.','A continuity pickup from the ordinary studio perspective; dry professionalism, no audible fear.'),
 S('JUNE','The following programme was recorded before this evening.')
 ],'The continuity edit is brutally ordinary. Do not disclose who got out. No song or HUSH explanation follows. Radio OFF still wins immediately.']
 ]
};
const stationIdentity={service:{title:'LAST ORDERS',description:'Commercial late-night talk: road rage, bad arguments, local politics, an excellent producer and a host who cannot stop digging.'},company:{title:'WHO IS THE BASTARD?',description:'A raucous moral phone-in. A borrowed ladder and an atrocious neighbour dispute become an impossible shared room.'},music:{title:'THE THIRD PROGRAMME',description:'Pompous arts broadcasting: a municipal car-park commission, procurement stupidity and an outside broadcast that acquires an interior.'}};
const extra={
 service:[
 [S('BEV','You drive eight hundred yards to buy a newspaper.'),S('MICK','That is different. There is a hill.'),S('BEV','You park on the pavement.'),S('MICK','To keep the road clear. I think about other people.'),S('BEV','Only if they are in the way.')],
 [S('BEV','We could save a lot of money if you apologised in advance.'),S('MICK','That would imply a lack of confidence in the programme.'),S('BEV','It would imply you had listened to it.'),S('MICK','I am too busy making it. Some of us work here.')],
 [S('MICK','If it is subsidence, ask the council. If it is art, ask the council for twice as much.'),S('BEV','They have stopped answering.'),S('MICK','Standard procedure.'),S('BEV','Every extension. The same sound. Not a recorded message.'),S('MICK','Do not put it through.')],
 [S('BEV','I can hear the kettle in the cupboard.'),S('MICK','It has not worked since February.'),S('BEV','It is boiling.'),S('MICK','Unplug it.'),S('BEV','I am not going in there.'),S('MICK','Fine. Nobody goes in there. We can do one programme without tea.')],
 [S('BEV','There are coats on the other side.'),S('MICK','Take mine. The big one.'),S('BEV','I cannot see where they are hanging from.'),S('MICK','Then leave them. I do not need the coat. I am not coming back for a coat.')]
 ],
 company:[
 [S('VERA','Have you asked for it politely?'),S('RON','Yes.'),S('VERA','Well, there is your mistake. We cannot begin at the final stage of a British dispute. You need six months of not quite saying hello, then a note nobody signs.')],
 [S('VERA','Is anybody in this conversation paying rent?'),S('MAGDA','I am.'),S('RON','So am I.'),S('VERA','Same landlord?'),S('MAGDA','Different landlords.'),S('VERA','Excellent. We can establish legal ownership by asking which one refuses to fix the boiler. That normally identifies him immediately.')],
 [S('VERA','Is there somebody else in the coat?'),S('RON','I cannot see the head.'),S('VERA','Do not go any closer.'),S('MAGDA','Tell him to stop looking through.'),S('RON','I am not looking through. I can see it from this side as well.')],
 [S('VERA','Can either of you put the phone down and leave?'),S('MAGDA','He can.'),S('RON','She is holding my sleeve.'),S('MAGDA','That is not your sleeve.'),S('VERA','Magda, whatever you are holding, let go of it.'),S('MAGDA','I did. Before you asked.')],
 [S('RON','If I put the phone down, will you still be there?'),S('VERA','I will stay on this line.'),S('RON','That is not what I asked.'),S('VERA','No. It is not. Keep it in your hand. We can do this without finding out.')]
 ],
 music:[
 [S('JUNE','How much of the commission went on the viola?'),S('FENN','We borrowed it.'),S('JUNE','And the performer?'),S('FENN','He receives exposure.'),S('LEN','He has asked whether we can at least close the shutter.'),S('JUNE','So he has received exposure. Promptly, for once.')],
 [S('JUNE','If the building has changed size, does the committee need to know?'),S('FENN','It was in the proposal.'),S('JUNE','Under which heading?'),S('FENN','Audience development.'),S('JUNE','I thought that meant more people.'),S('FENN','That is a very narrow understanding of more.'),S('LEN','The exit sign is smaller now.')],
 [S('JUNE','The player would like his instrument back.'),S('FENN','He has it.'),S('LEN','He has the bow.'),S('JUNE','Where is the rest?'),S('LEN','It is under the surface. You can still see where he put his hand.'),S('FENN','Tell him not to reach for it.')],
 [S('JUNE','I have taken the headphones off.'),S('LEN','Good.'),S('JUNE','I can hear it better.'),S('LEN','June, I need you to keep looking at me.'),S('FENN','The light on the barrier has turned.'),S('LEN','That is not the way out. Neither of you go towards that light.')],
 [S('LEN','The ticket machine has printed again.'),S('JUNE','Do not validate anything. Leave it.'),S('FENN','That is not paper.'),S('LEN','I know. Do not touch it.'),S('JUNE','Doctor, can you turn your hand over?'),S('FENN','Not without turning the barrier.')]
 ]
};
// Insert only after completed beats; a percentage splice broke comic answers
// and made the presenters recognise danger before the callers described it.
const anchors={
 service:['Four is the current recommendation.','People coordinate. Look at the residents’ parking association. Thirty-seven people, one personality.','We have a council statement. “The surface is responding within acceptable limits.” That is also what my first wife said about the mattress.','I complain about many things. That is the format.','Right. All right. Get your coat.'],
 company:['They do that while you build them. That is almost the point.','Most of it.','All right. Nobody move anything for a moment. Especially the door.','Of Ron.','I am not leaving the desk.'],
 music:['The trolley deposit is a separate conversation.','I know. I am holding the end.','I think we have established audience participation is optional.','I know. It is waiting for you to pull.','It is coming through my hand.']
};
for(const [station,rows]of Object.entries(blocks))rows.forEach((row,i)=>{const at=row[1].findIndex(t=>t.text===anchors[station][i]);if(at<0)throw Error('Missing editorial anchor '+station+':'+i);row[1].splice(at+1,0,...extra[station][i]);});
// A short, audible held-note tail is part of the scene, not an empty bed.
blocks.music[2][1].push(FX('[The note continues. Nobody speaks.]',1.2));
export function continuousRadioProgrammes(){
 const phases=['ordinary','discrepancy','recognition','contradiction','arrival'];
 return Object.entries(blocks).flatMap(([station,rows])=>rows.map(([title,turns,edit],phase)=>{
  const words=t=>t.trim().split(/\s+/).length,total=turns.filter(t=>t.role!=='SOUND').reduce((n,t)=>n+words(t.text),0),gap=.12,fixed=turns.reduce((n,t)=>n+(t.seconds||0),0),available=68.2-gap*(turns.length-1)-fixed;let cursor=.35;
  const cues=turns.map((turn,i)=>{const start=cursor,end=start+(turn.seconds||available*words(turn.text)/total);cursor=end+gap;return{id:`${station}-${phases[phase]}-${String(i+1).padStart(2,'0')}`,performanceId:`${station}-${phases[phase]}-${String(i+1).padStart(2,'0')}`,start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),speaker:turn.role,text:turn.text,direction:turn.note,signalRole:turn.signalRole||'human'};});
  return{name:`${station}-${phases[phase]}`,station,phase:phases[phase],label:title,show:stationIdentity[station].title,showDescription:stationIdentity[station].description,durationSeconds:72,loop:true,temporary:false,url:`/assets/source-drive/radio/masters/${station}-${phases[phase]}.wav`,cues,edit,bed:'Continuous scene: keep connected breaths, interruptions and low studio/telephone/location sound under the exchange. No alternating speech-island/empty-bed pattern. Any tiny editorial gaps are for a natural breath, not an interstitial.',wordCount:total,plannedWordsPerMinute:Math.round(total/(68.2/60))};
 }));
}
export const continuousRadioSessionNotes=[
 {id:'last-orders-connected-master',roles:['MICK','BEV'],direction:'Record all five passages as one connected show. Mick is skilled enough to be entertaining and silly enough to become trapped by his own persona. Bev is a comic equal. He has to surrender the performance before he can help her. Export isolated dialogue and an uncut reference with real overlaps.',beats:[['ACTION','Record the ordinary desk banter at full pace. Leave actual spaces for a tiny sting, paper/cup movement and a producer interruption.'],['ACTION','After a successful ordinary joke, capture a genuinely involuntary Mick laugh. Also record the future apology as a plain sincere pickup. These are editorial inserts, not scary impressions.'],['ACTION','On later passages, keep attempting the professional rhythm. Do not begin in a whispered horror register. The change is the failure of the format.']]},
 {id:'who-is-the-bastard-connected-master',roles:['VERA','RON','MAGDA'],direction:'Record a continuous bad-advice phone-in. Establish why somebody would keep listening before making the domestic space impossible. Vera finally stops giving verdicts and stays with a caller. Ron and Magda are fictional adult callers, entirely separate from the principal game cast.',beats:[['ACTION','Keep the hosts’ interruptions, callers talking across one another, quick laughs and petty irritation in the uncut reference.'],['ACTION','Record a short original hold sting, one chair caster/contact sound and the same sound from close floor level. The editor reuses the identical object event.'],['ACTION','Count the final rungs as actual counting, not a trance. Vera’s final response should be the first thing she has said without trying to win.']]},
 {id:'third-programme-connected-master',roles:['JUNE','FENN','LEN'],direction:'Record a pompous live arts interview that becomes a concrete location emergency. Fenn believes every stupid thing he says until the last syllable of “No.” June keeps the broadcast together. Len only describes practical facts he can touch.',beats:[['ACTION','Record a trolley wheel, coin/ticket mechanism, struggling barrier motor, a short original viola note and location tone as clean separate stems.'],['ACTION','Keep the held-note source separate: it is not Sarah’s piano and not a human cry. Let the mechanical rhythm and acoustic space mutate downstream.'],['ACTION','Record the final continuity announcement in the ordinary studio perspective as a separate clean pickup. Its abrupt professionalism supplies the cut.']]}
];
