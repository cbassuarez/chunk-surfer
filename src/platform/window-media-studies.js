import {compileWindowCompositionPlan} from './window-composition.js';

// These are presentations of existing encounters. No builder owns movement,
// dialogue, Contact, a checkpoint or the lifetime of the host scene.
export const STUDY_EVENTS=Object.freeze({
  RETAINED_RELEASE:'retained:release',
  RETAINED_OCCUPY:'retained:occupy',
});
export const QUORUM_TIMES=Object.freeze({second:5000,third:8000,duration:18000});
export const ROOM_BETWEEN_TIMES=Object.freeze({contradiction:6000,retireSides:12000,duration:16000});
export const WEIGHT_PASSES_TIMES=Object.freeze([0,4000,5500,7300,10000]);
export const WEIGHT_PASSES_DURATION=16000;

const corners=Object.freeze([{x:.08,y:.15},{x:.92,y:.15},{x:.08,y:.85},{x:.92,y:.85}]);
const row=Object.freeze([{x:.08,y:.86},{x:.50,y:.86},{x:.92,y:.86}]);
const fullCrop=Object.freeze({x:0,y:0,w:1,h:1});
const snapshot=token=>({kind:'snapshot',token});
const video=assetId=>({kind:'video',assetId});
const assignment=(content,{crop=fullCrop,phaseOffsetMs=0}={})=>({content,crop,phaseOffsetMs,...(content.kind==='video'?{clockMode:'source'}:{})});
const assign=(assignments,{reducedMotion=false}={})=>({type:'assign',assignments,transition:reducedMotion?'cut':'dissolve',durationMs:reducedMotion?0:180});
const at=(id,atMs,operations)=>({id,atMs,operations});
const on=(id,event,operations)=>({id,event,operations});

function tokensOf(value,length,name){
  if(!Array.isArray(value)||value.length!==length||value.some(token=>typeof token!=='string'||!token.startsWith('snapshot-'))){
    throw new Error(`${name} requires ${length} snapshot tokens`);
  }
  return [...value];
}
function pane(id,content,initial,{crop=fullCrop,phaseOffsetMs=0,shader='violet-dither',width=220,height=124,description=''}={}){
  return{id,content,entry:initial,initial,target:{anchorX:initial.x,anchorY:initial.y},crop,phaseOffsetMs,...(content.kind==='video'?{clockMode:'source'}:{}),
    width,height,shader,draggable:false,sensitivity:'none',faultScale:1,description};
}
function plan(id,{surfaces,cues,durationMs,epochMs=Date.now(),reducedMotion=false,flashMode='full',sceneId='source:standing-tear'}={}){
  return compileWindowCompositionPlan({
    compositionId:`study:${id}`,sceneId,purpose:'source-study',epochMs,reducedMotion,flashMode,
    surfaces,score:{durationMs,loop:false,cues},completion:{mode:'nonblocking'},foldDurationMs:1,
    // The relation is the disturbance. A decoder-failure effect would make its
    // cause harder to distinguish from buffering or an accidentally lost pane.
    fault:{profile:'violet-dither',intensity:0,seed:0,cadenceMs:900},
    formation:{mode:'study',durationMs:1,staggerMs:0},
  });
}

/**
 * Three phases of one coherent performance become a unison. The fourth keeps
 * its own phase, optionally as a distinct filmed response rather than a claim
 * that unrelated footage documents another member of the same ensemble.
 */
export function quorumCompositionPlan({assetId='performance-capture',independentAssetId=assetId,phaseOffsetsMs=[0,650,1350,2150],
  crop=fullCrop,epochMs=Date.now(),reducedMotion=false,flashMode='full',sceneId}={}){
  if(!Array.isArray(phaseOffsetsMs)||phaseOffsetsMs.length!==4||phaseOffsetsMs.some(value=>!Number.isFinite(value)||value<0))throw new Error('Quorum requires four finite nonnegative phase offsets');
  if(new Set(phaseOffsetsMs).size!==4)throw new Error('Quorum requires four initially distinct phases');
  const ids=['quorum:a','quorum:b','quorum:c','quorum:d'];
  const content=video(assetId),leader=assignment(content,{crop,phaseOffsetMs:phaseOffsetsMs[0]});
  const surfaces=ids.map((id,index)=>pane(id,index===3?video(independentAssetId):content,corners[index],{crop,phaseOffsetMs:phaseOffsetsMs[index],
    description:index===3&&independentAssetId!==assetId?'Independent filmed response, outside the shared performance':'One recorded performance, a separate phase'}));
  const cues=[
    at('quorum-second-adopts',QUORUM_TIMES.second,[assign({[ids[1]]:leader},{reducedMotion})]),
    at('quorum-third-adopts',QUORUM_TIMES.third,[assign({[ids[2]]:leader},{reducedMotion})]),
  ];
  return plan('quorum',{surfaces,cues,durationMs:QUORUM_TIMES.duration,epochMs,reducedMotion,flashMode,sceneId});
}

/**
 * The player's real release stops their performed image; its reference keeps
 * time. The apparatus pane is another crop of that same documented performance,
 * or an explicitly supplied still. It does not invent a working tape machine.
 *
 * The host emits RELEASE only for live-stop(reason:'release'), never pause or
 * blur. OCCUPY is a later authored beat, measured on the host's active clock.
 */
export function retainedTakeCompositionPlan({assetId='performance-capture',
  sourceCrop=fullCrop,referenceCrop=sourceCrop,apparatusCrop=sourceCrop,apparatusToken=null,
  referencePhaseOffsetMs=0,epochMs=Date.now(),reducedMotion=false,flashMode='full',sceneId}={}){
  if(!Number.isFinite(referencePhaseOffsetMs)||referencePhaseOffsetMs<0)throw new Error('Retained Take requires a finite nonnegative reference phase');
  const source='retained:source',reference='retained:reference',apparatus='retained:apparatus';
  const surfaces=[
    pane(source,video(assetId),corners[0],{crop:sourceCrop,description:'Performed action'}),
    pane(reference,video(assetId),corners[2],{crop:referenceCrop,phaseOffsetMs:referencePhaseOffsetMs,description:'Retained reference of the same action'}),
    pane(apparatus,apparatusToken?snapshot(tokensOf([apparatusToken],1,'Retained apparatus')[0]):video(assetId),corners[3],
      {crop:apparatusCrop,shader:apparatusToken?'terminal':'violet-dither',description:'The performance apparatus'}),
  ];
  const cues=[
    on('retained-performed-action-released',STUDY_EVENTS.RETAINED_RELEASE,[{type:'freeze',targets:[source,apparatus]}]),
    on('retained-reference-occupies-apparatus',STUDY_EVENTS.RETAINED_OCCUPY,[
      {type:'hide',targets:[apparatus]},
      // Reduced footage is paused at a selected source pose. A single later
      // reference pose makes its independence perceptible without autoplay or
      // moving its window; the source and apparatus retain their stopped pose.
      ...(reducedMotion?[assign({[reference]:assignment(video(assetId),{crop:referenceCrop,phaseOffsetMs:referencePhaseOffsetMs+3500})},{reducedMotion:true})]
        :[{type:'geometry',targets:[reference],geometry:{anchorX:corners[3].x,anchorY:corners[3].y},durationMs:280}]),
    ]),
  ];
  return plan('retained',{surfaces,cues,durationMs:120000,epochMs,reducedMotion,flashMode,sceneId});
}

/** Three owned views first agree; only their middle acquires the wrong room. */
export function roomBetweenCompositionPlan({snapshotTokens,contradictionToken,epochMs=Date.now(),reducedMotion=false,flashMode='full',sceneId='source:continuation'}={}){
  const tokens=tokensOf(snapshotTokens,3,'Room Between');
  const [contradiction]=tokensOf([contradictionToken],1,'Room contradiction');
  if(contradiction===tokens[1])throw new Error('Room contradiction must differ from the matched middle view');
  const ids=['room:left','room:middle','room:right'];
  const surfaces=ids.map((id,index)=>pane(id,snapshot(tokens[index]),row[index],{shader:'terminal',description:'Matched owned view of the same architecture'}));
  const cues=[
    at('room-middle-contradiction',ROOM_BETWEEN_TIMES.contradiction,[assign({[ids[1]]:assignment(snapshot(contradiction))},{reducedMotion})]),
    at('room-neighbours-retire',ROOM_BETWEEN_TIMES.retireSides,[{type:'hide',targets:[ids[0],ids[2]]}]),
  ];
  return plan('room',{surfaces,cues,durationMs:ROOM_BETWEEN_TIMES.duration,epochMs,reducedMotion,flashMode,sceneId});
}

/**
 * Five coherent time samples, each containing above/support/below views of the
 * same owned object. The final two samples leave the receiver empty: there is
 * deliberately no lower-arrival assignment or new hazard in this score.
 */
export function weightPassesCompositionPlan({phaseTokens,epochMs=Date.now(),reducedMotion=false,flashMode='full',sceneId='source:continuation'}={}){
  if(!Array.isArray(phaseTokens)||phaseTokens.length!==WEIGHT_PASSES_TIMES.length)throw new Error('Weight Passes requires five three-view phases');
  const phases=phaseTokens.map((tokens,index)=>tokensOf(tokens,3,`Weight phase ${index}`));
  const receiver=phases[0][2];
  if(phases.some(tokens=>tokens[2]!==receiver))throw new Error('Weight Passes must retain the same empty receiving view');
  if(phases[0][0]===phases[2][0]||phases[0][1]===phases[2][1])throw new Error('Weight Passes requires a departure above and a crossing at the support');
  if(phases[2][1]===phases[3][1])throw new Error('Weight Passes requires the support to empty after crossing');
  const ids=['weight:above','weight:support','weight:below'];
  const surfaces=ids.map((id,index)=>pane(id,snapshot(phases[0][index]),row[index],{shader:'terminal',description:'The same object, its support and receiving position'}));
  const cues=phases.slice(1).map((tokens,index)=>at(`weight-phase-${index+1}`,WEIGHT_PASSES_TIMES[index+1],[
    // Explicit assignments preserve object identity. No relay samples a stale
    // initial frame and no delayed codec frame stands in for a missing arrival.
    {...assign(Object.fromEntries(ids.slice(0,2).map((id,i)=>[id,assignment(snapshot(tokens[i]))])),{reducedMotion}),transition:'cut',durationMs:0},
  ]));
  return plan('weight',{surfaces,cues,durationMs:WEIGHT_PASSES_DURATION,epochMs,reducedMotion,flashMode,sceneId});
}
