import {createWindowMediaEncounters} from '../game/window-media-encounters.js';
import {quorumCompositionPlan,retainedTakeCompositionPlan,roomBetweenCompositionPlan,weightPassesCompositionPlan} from './window-media-studies.js';
import {createWeightPassesFrames,captureRoomMediaFrames} from '../render/window-media-owned-frames.js';

// Adapter only: observed scene facts -> passive media. It never owns the world,
// an input lease, a checkpoint, a threat, a release or consent to Contact.
export function createWindowMediaEncounterPresentation({
  director,effects,documentApi=globalThis.document,getCanvas=()=>null,
  getSettings=()=>({}),onTrace=()=>{},makeWeightFrames=createWeightPassesFrames,makeRoomFrames=captureRoomMediaFrames,
}={}){
  let owner=null,wanted=null,job=null,preparingKey=null,tail=Promise.resolve(),previousCanvas=null,disposed=false,ownerGeneration=0;
  const history=[];
  const trace=value=>{history.push(value);if(history.length>180)history.shift();try{onTrace(value);}catch{}};
  const options=()=>{const settings=getSettings()||{};return{reducedMotion:!!settings.reducedMotion,flashMode:settings.flashMode||'full'};};
  const current=command=>!disposed&&owner===command.owner&&wanted?.key===command.key;
  function snapshotPackage(frames){
    const map=new Map(),tokens=[];
    const register=data=>{
      if(!String(data||'').startsWith('data:image/'))throw Error('Media frame unavailable');
      if(map.has(data))return map.get(data);
      const token=effects?.registerSnapshot?.(data);if(!token)throw Error('Media frame registration failed');
      map.set(data,token);tokens.push(token);return token;
    };
    try{return{frames:frames.map(row=>Array.isArray(row)?row.map(register):register(row)),tokens};}
    catch(error){effects?.releaseSnapshots?.(tokens);throw error;}
  }
  function build(command){
    const settings=options();
    if(command.study==='quorum')return{plan:quorumCompositionPlan({...settings,assetId:'performance-capture',independentAssetId:'mimosa-response'}),tokens:[]};
    if(command.study==='retained')return{plan:retainedTakeCompositionPlan({...settings,assetId:'performance-capture',
      // Preserve a complete performed image in both source and reference.
      // The third pane is its actual recording horn, never an invented reel.
      apparatusCrop:{x:.025,y:.16,w:.475,h:.5}}),tokens:[]};
    if(command.study==='room'){
      const frames=makeRoomFrames(getCanvas(),{previousCanvas,documentApi});
      if(!frames?.contradictionFrame||frames.contradictionFrame===frames.snapshotFrames?.[1])return null;
      const pack=snapshotPackage([...frames.snapshotFrames,frames.contradictionFrame]);
      try{return{plan:roomBetweenCompositionPlan({...settings,snapshotTokens:pack.frames.slice(0,3),contradictionToken:pack.frames[3]}),tokens:pack.tokens};}
      catch(error){effects?.releaseSnapshots?.(pack.tokens);throw error;}
    }
    if(command.study==='weight'){
      const frames=makeWeightFrames({documentApi});if(!frames)return null;
      const pack=snapshotPackage(frames);
      try{return{plan:weightPassesCompositionPlan({...settings,phaseTokens:pack.frames}),tokens:pack.tokens};}
      catch(error){effects?.releaseSnapshots?.(pack.tokens);throw error;}
    }
    return null;
  }
  async function retire(key){
    try{await director?.endStudy?.(key);}
    finally{if(job?.key===key){const tokens=job.tokens;job=null;effects?.releaseSnapshots?.(tokens);}}
  }
  function command(value){
    if(disposed)return;
    if(value.type==='show'){wanted={...value};preparingKey=value.key;}
    else if(value.type==='end'&&wanted?.key===value.key){wanted=null;if(preparingKey===value.key)preparingKey=null;}
    trace({type:'command',...value});
    const generation=ownerGeneration;
    tail=tail.then(async()=>{
      if(value.type==='end'){await retire(value.key);return;}
      if(generation!==ownerGeneration||!current(value)){if(preparingKey===value.key)preparingKey=null;return;}
      if(value.type==='event'){
        director?.compositionEvent?.(value.event);return;
      }
      if(job&&job.key!==value.key)await retire(job.key);
      let pack;
      try{pack=build(value);}catch(error){if(preparingKey===value.key)preparingKey=null;trace({type:'unavailable',study:value.study,error:String(error?.message||error)});return;}
      if(!pack){if(preparingKey===value.key)preparingKey=null;trace({type:'unavailable',study:value.study,reason:'No distinct owned frames'});return;}
      if(!current(value)){effects?.releaseSnapshots?.(pack.tokens);return;}
      job={key:value.key,study:value.study,tokens:pack.tokens,preparing:true,presented:false};
      try{
        const result=await director?.beginStudy?.(pack.plan,{key:value.key,isCurrent:()=>current(value)});
        if(current(value)&&job?.key===value.key){
          job.preparing=false;job.presented=!!result;trace({type:'presented',study:value.study,key:value.key,available:!!result,native:!!result?.native});
          if(!result)await retire(value.key);
        }
        else await retire(value.key);
      }catch(error){
        trace({type:'presentation-error',study:value.study,error:String(error?.message||error)});await retire(value.key);
      }finally{if(preparingKey===value.key)preparingKey=null;}
    }).catch(error=>trace({type:'delivery-error',error:String(error?.message||error)}));
    return tail;
  }
  const model=createWindowMediaEncounters({onCommand:command,onTrace:value=>trace(value)});
  function copyCurrentFrame(){
    try{
      const source=getCanvas();if(!source?.width||!source?.height||!documentApi?.createElement)return null;
      const canvas=documentApi.createElement('canvas');canvas.width=Math.min(640,source.width);canvas.height=Math.max(1,Math.round(canvas.width*source.height/source.width));
      const context=canvas.getContext('2d',{alpha:false});if(!context)return null;
      context.drawImage(source,0,0,canvas.width,canvas.height);return canvas;
    }catch{return null;}
  }
  function update({owner:nextOwner=null,frame=null,traces=[],dt=0,held=false}={}){
    if(disposed)return;
    if(nextOwner!==owner){
      if(owner)model.end(owner);
      ownerGeneration++;owner=nextOwner;wanted=null;preparingKey=null;previousCanvas=null;
      if(owner)model.begin(owner,{elapsed:frame?.elapsed,referenceStarted:!!frame?.referenceStarted});
    }
    if(owner)director?.holdComposition?.(!!held);
    if(!owner)return;
    // The continuation's real frame is sampled after rendering, before queued
    // trace poses can request Weight. Standing Tear has its separate live-stop
    // contract; it must not acquire a fabricated refuge or release here.
    if(owner==='source-continuation'&&frame)model.observeSafety(owner,frame);
    for(const item of traces)model.observe(owner,item);
    // Only a genuinely earlier rendered frame can establish the room's prior
    // adjacency. Freeze a copy, not a pointer to a live WebGL canvas.
    if(owner==='source-continuation'&&frame?.phase==='wrong-return'&&frame.ready!==false&&!previousCanvas)previousCanvas=copyCurrentFrame();
    model.tick(Math.min(.1,Math.max(0,Number(dt)||0)),{paused:!!held||preparingKey!==null||!!job?.preparing,hidden:false});
  }
  function stop(){
    if(owner)model.end(owner);ownerGeneration++;owner=null;wanted=null;preparingKey=null;previousCanvas=null;
    const heldJob=job;if(heldJob)tail=tail.then(()=>retire(heldJob.key));
    return tail;
  }
  return{update,stop,whenIdle:()=>tail,
    snapshot:()=>({owner,preparing:preparingKey!==null||!!job?.preparing,presentation:job?{key:job.key,study:job.study,presented:job.presented}:null,
      model:model.snapshot(),history:[...history]}),
    dispose(){const result=stop();disposed=true;return result;},
  };
}
