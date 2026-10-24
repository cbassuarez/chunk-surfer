// Incidental company has no secret identity, personal quest or unwritten
// biography. These roles remain separate from the seven named society members.
const guest=(id,designId,roleLabel,x,y,yaw,height,source,remarks,company={})=>Object.freeze({
  id,designId,roleLabel,name:null,identity:null,backstory:null,
  x,y,yaw,height,source,floor:10,coordinateSpace:'authored-metres',
  mesh:`academic_population_${designId.replaceAll('-','_')}`,
  kind:'npc',subtype:'npc',interactive:true,blocks:false,
  voiceSpeaker:designId==='attendant'?'academic-attendant':'academic-listener',
  sourceLabel:roleLabel.toUpperCase(),
  remarks:Object.freeze(remarks.map(lines=>Object.freeze([...lines]))),
  ...company,
});
const hollow=(id,designId,x,y,yaw,height,source,company={})=>Object.freeze({
  id,designId,roleLabel:null,name:null,identity:null,backstory:null,
  x,y,yaw,height,source,floor:10,coordinateSpace:'authored-metres',
  mesh:`academic_population_${designId.replaceAll('-','_')}`,
  kind:'hollow',subtype:'hollow',interactive:false,blocks:false,voiceSpeaker:null,sourceLabel:null,
  ...company,
});

const circuit=points=>Object.freeze(points.map(([x,y])=>Object.freeze({x,y})));
const company=(groupId,partnerId,extra={})=>({groupId,partnerId,...extra});
const social=(activity,heldProp,extra={})=>({activity,heldProp,...extra});
// Measured crown of the retained gallery GLB: builder crown centre1.17m,
// cross-section top+.038m. This is an actual hand contact, not a lean label.
export const ACADEMIC_POPULATION_RAIL_SUPPORT=Object.freeze({id:'academic-gallery-west-crown',
  x:28.84,y:249.2,height:1.208,side:'R',kind:'rail'});

export const ACADEMIC_FLOOR_GUESTS=Object.freeze([
  guest('academic-guest-piano','listener','listener by the piano',5.8,242.2,Math.PI,1.81,'male',[
    ['It is the pause I come for.','When they begin again, I go on listening.'],
    ['You can leave a pause alone.'],
  ],company('chamber','academic-guest-turning-page',social('talk','cup'))),
  guest('academic-guest-landing','attendant','visitor on the landing',14.5,277,0,1.68,'female',[
    ['They ask whether we are still open.','I keep telling them the stair is.'],
    ['Mind your step. The last turn catches everyone.'],
  ],company('reception','odette',social('drink','cup'))),
  guest('academic-guest-window','listener','smoker at the gallery rail',28.3,249.2,Math.PI/2,1.81,'male',[
    ['They are discussing the likeness.','I am giving it room to disagree.'],
    ['The rail is steady. That is more than I ask of most company.'],
  ],company('north-gallery','lucien',social('lean','cigarette',{support:ACADEMIC_POPULATION_RAIL_SUPPORT}))),
  guest('academic-guest-programme','attendant','visitor warming a cup',17,272.1,Math.PI,1.68,'female',[
    ['The cup is warm.','I am taking my time with that.'],
    ['You need not finish everything you are given.'],
  ],company('reception','odette',social('drink','cup'))),
  guest('academic-guest-threshold','attendant','visitor holding the threshold',17.3,277.2,-Math.PI/2,1.64,'female',[
    ['There is room. There is always another person saying there is room.','Come in before they begin counting again.'],
    ['The welcome takes longer than the evening.'],
  ],company('reception','academic-guest-last-chair',social('talk','glass',{width:.96}))),
  guest('academic-guest-last-chair','listener','visitor keeping a place',16.2,277.6,1.9,1.86,'male',[
    ['I am keeping a place.','No, I could not tell you who for. It has been a very long pause.'],
    ['You can stand here. Just do not promise to stay.'],
  ],company('reception','academic-guest-threshold',social('drink','glass',{width:1.04}))),
  guest('academic-guest-hours','attendant','visitor watching the welcome',17.5,274,-2.4,1.74,'female',[
    ['They have nearly finished opening.','That is what everyone says when they arrive.'],
    ['Those two are arguing about the same minute. We have gone on without it.'],
  ],company('reception','agathe',social('talk','cup',{width:.98}))),
  guest('academic-guest-interval','listener','listener outside the chamber',10.2,250.2,-Math.PI/2,1.75,'male',[
    ['We leave room for him to begin again.','There is usually someone halfway through an objection.'],
    ['Wait until the wings loosen. There is no need to keep their time.'],
  ],company('corridor','emile',social('drink','glass',{width:.96}))),
  guest('academic-guest-turning-page','attendant','smoker beside the piano',6.7,243.2,-.73,1.60,'female',[
    ['I asked him to begin again.','He asked which beginning. We are listening while he decides.'],
    ['You are allowed to leave before the ending.'],
  ],company('chamber','academic-guest-piano',social('smoke','cigarette',{width:1.03}))),
  guest('academic-guest-second-bell','attendant','listener at the chamber wall',13.7,244.5,-2.4,1.77,'female',[
    ['She tells the story differently when he interrupts.','I think that is why she lets him.'],
    ['The company is kind. The ceiling has other ideas.'],
  ],company('chamber','celeste',social('drink','glass',{width:.94}))),
  guest('academic-guest-quiet-index','attendant','listener cradling a cup',11.8,243.4,Math.PI,1.70,'female',[
    ['We disagree about which part was the beginning.','It helps when the musician will answer back.'],
    ['I think she was listening before he started.'],
  ],company('chamber','academic-guest-doorway',social('drink','cup',{width:1.02}))),
  guest('academic-guest-doorway','listener','listener making room for the music',14.7,246.2,-Math.PI/2,1.88,'male',[
    ['I liked the unfinished phrase.','It left me somewhere to put the years.'],
    ['No, I am not waiting for the ending. I am waiting for him to stop improving it.'],
  ],company('chamber','academic-guest-quiet-index',social('talk','cup',{width:.96}))),
  guest('academic-guest-hem','listener','smoker under the high ceiling',12.6,242.3,Math.PI,1.73,'male',[
    ['Everyone leaves a little space above them in here.','You learn to keep the smoke away from the company.'],
    ['The empty ones have the best manners.'],
  ],company('chamber','academic-guest-quiet-index',social('smoke','cigarette',{width:1.06}))),
  guest('academic-guest-fold','attendant','visitor carrying a cup between rooms',14.9,242.8,Math.PI,1.66,'female',[
    ['He has been choosing the last word since I came in.','We have started another conversation beside him.'],
    ['You can join either one. Neither has finished.'],
  ],company('chamber','academic-guest-hem',social('talk','cup',{width:.96,
    route:circuit([[14.9,242.8],[15.5,244.5],[18.5,244.5],[21,244.5],[23,244.5]]),
    routeMode:'shuttle',routeGroupIds:Object.freeze(['chamber','north-gallery']),routePartnerId:'academic-guest-window',
    requiresRouteClear:true,socialStop:8,speed:.32}))),
  guest('academic-guest-balcony','listener','smoker outside the chamber',9.8,252.2,-Math.PI/2,1.83,'male',[
    ['There are more of us than there were a moment ago.','The empty ones make a good audience.'],
    ['The ones without faces still turn towards the company.'],
  ],company('corridor','academic-hollow-corridor',social('smoke','cigarette',{width:1.04}))),
  guest('academic-guest-refrain','attendant','listener returning to the same tune',13.6,247.4,-Math.PI/2,1.63,'female',[
    ['We keep arriving at the same part.','I like who is here when it comes around.'],
    ['That late visitor is not listening to the music. Give them room.'],
  ],company('chamber','celeste',social('drink','glass',{width:.97}))),
  guest('academic-guest-late-light','attendant','visitor under the last light',14.1,278.2,1.8,1.72,'female',[
    ['You have caught us between things.','That is when everybody is here.'],
    ['Do not mistake being expected for being obliged.'],
  ],company('reception','academic-guest-last-chair',social('talk','cup',{width:1.03}))),
  guest('academic-guest-repeated-hour','listener','visitor keeping the empty company',8.7,254.4,1.8,1.78,'male',[
    ['They do not interrupt.','It is possible to become fond of that.'],
    ['Stay for the company. Leave when you choose.'],
  ],company('corridor','academic-hollow-studio',social('talk','cup',{width:.95}))),
]);
export const ACADEMIC_FLOOR_HOLLOWS=Object.freeze([
  hollow('academic-hollow-corridor','hollow-coat',8.65,252.2,Math.PI/2,1.78,'male',{groupId:'corridor',partnerId:'academic-guest-balcony'}),
  hollow('academic-hollow-gallery','unfinished-visitor',24.3,244.7,Math.PI/2,1.69,'female',{groupId:'north-gallery',partnerId:'lucien',regard:true}),
  hollow('academic-hollow-loggia','hollow-coat',17.6,278.5,-Math.PI/2,1.78,'male',{groupId:'reception',partnerId:'academic-guest-last-chair'}),
  hollow('academic-hollow-studio','hollow-coat',10.25,254.1,-Math.PI/2,1.78,'male',{groupId:'corridor',partnerId:'academic-guest-repeated-hour'}),
  hollow('academic-hollow-return','unfinished-visitor',5.6,246.6,0,1.69,'female',{groupId:'chamber',partnerId:'academic-guest-turning-page',regard:true}),
  hollow('academic-hollow-west-bank','hollow-coat',29.7,244.7,-Math.PI/2,1.78,'male',{groupId:'north-gallery',partnerId:'noe'}),
  hollow('academic-hollow-east-bank','hollow-coat',27.7,247.7,-Math.PI/2,1.78,'male',{groupId:'north-gallery',partnerId:'lucien'}),
  // Only the parent's separate, explicit late-guest encounter may control this
  // variant's attention. This controller never relocates or arms any hollow.
  hollow('academic-hollow-late-guest','unfinished-visitor',28.2,246.4,-Math.PI/2,1.69,'female',{groupId:'north-gallery',partnerId:'noe',dreadVariant:true}),
]);
export const ACADEMIC_FLOOR_POPULATION=Object.freeze([...ACADEMIC_FLOOR_GUESTS,...ACADEMIC_FLOOR_HOLLOWS]);
const GUESTS_BY_ID=new Map(ACADEMIC_FLOOR_GUESTS.map(actor=>[actor.id,actor]));

export const ACADEMIC_FLOOR_POPULATION_GROUPS=Object.freeze([
  {id:'reception',namedActors:['odette','agathe'],actors:['academic-guest-threshold','academic-guest-last-chair']},
  {id:'chamber',namedActors:['celeste','sabine'],actors:['academic-guest-piano','academic-guest-turning-page']},
  {id:'north-gallery',namedActors:['lucien','noe'],actors:['academic-guest-window','academic-guest-fold']},
  {id:'corridor',namedActors:['emile'],actors:['academic-guest-interval','academic-guest-balcony']},
].map(group=>Object.freeze({...group,namedActors:Object.freeze(group.namedActors),actors:Object.freeze(group.actors),
  members:Object.freeze(ACADEMIC_FLOOR_POPULATION.filter(actor=>actor.groupId===group.id).map(actor=>actor.id))})));
export const ACADEMIC_FLOOR_POPULATION_TIMING=Object.freeze({firstExchange:8,quietBetween:24,maxTick:.1,walkPause:1.4,turnSpeed:.75});
const populationLine=(actorId,text,toActorId,cue='offer')=>{
  const actor=GUESTS_BY_ID.get(actorId);
  return Object.freeze({who:'unknown',actorId,text,toActorId,voiceSpeaker:actor.voiceSpeaker,
    sourceLabel:actor.sourceLabel,performanceCue:cue,responseCue:'attend'});
};
export const ACADEMIC_FLOOR_POPULATION_BEATS=Object.freeze([
  Object.freeze({id:'room-for-one-more',groupId:'reception',lines:Object.freeze([
    populationLine('academic-guest-threshold','There is room for one more.','academic-guest-last-chair'),
    populationLine('academic-guest-last-chair','You said that when I came in. I believed you.','academic-guest-threshold','concede'),
  ])}),
  Object.freeze({id:'the-chair-can-wait',groupId:'chamber',lines:Object.freeze([
    populationLine('academic-guest-piano','Shall we keep the chair?','academic-guest-turning-page'),
    populationLine('academic-guest-turning-page','Keep it. They have never asked us to stop.','academic-guest-piano','assure'),
  ])}),
  Object.freeze({id:'a-likeness-that-answers',groupId:'north-gallery',lines:Object.freeze([
    populationLine('academic-guest-window','Is there room for your cup?','academic-guest-fold'),
    populationLine('academic-guest-fold','Only if we leave a space for the empty company.','academic-guest-window','offer'),
  ])}),
  Object.freeze({id:'the-company-listens',groupId:'corridor',lines:Object.freeze([
    populationLine('academic-guest-interval','They have not said a word.','academic-guest-balcony'),
    populationLine('academic-guest-balcony','They are listening. Let them.','academic-guest-interval','assure'),
  ])}),
]);

export function academicFloorPopulationDialogue(actorId,state={}){
  const actor=GUESTS_BY_ID.get(actorId);if(!actor)return null;
  const completed=Number.isFinite(state.remarks?.[actorId])?Math.max(0,Math.trunc(state.remarks[actorId])):0;
  const lines=actor.remarks[completed%actor.remarks.length].map(text=>({
    who:'unknown',text,actorId:actor.id,voiceSpeaker:actor.voiceSpeaker,sourceLabel:actor.sourceLabel,
  }));
  return{id:`academic-floor-population:${actor.id}`,actorId:actor.id,
    nodes:{start:{speaker:actor.sourceLabel,lines}}};
}
