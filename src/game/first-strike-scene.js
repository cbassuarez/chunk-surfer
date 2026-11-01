import {FIRST_STRIKE as C,normalizeFirstStrikeEntry,firstStrikeFooting,firstStrikeCellAt,firstStrikePieces,firstStrikePiecePose,firstStrikeRouteProjection} from '../data/first-strike.js';
import {uiSize,uiText,uiFill} from '../render/ui.js';
const copy=v=>JSON.parse(JSON.stringify(v)),finite=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f;
const actions={forward:'w',moveForward:'w',move_forward:'w',backward:'s',reverse:'s',moveBackward:'s',move_backward:'s',left:'a',moveLeft:'a',strafeLeft:'a',move_left:'a',right:'d',moveRight:'d',strafeRight:'d',move_right:'d',torch:'f'};
const keysOf=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']),keyOf=e=>actions[e?.controllerAction]||String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const phaseAt=t=>t<6?'recognize':t<35?'clearance':t<42?'settling':'terminal';
export function freshFirstStrike(entryValue){const e=normalizeFirstStrikeEntry(entryValue);return{schema:1,eventId:e.eventId,routeHash:e.routeHash,x:e.origin.x,z:e.origin.z,feet:e.origin.y,yaw:e.yaw,pitch:e.pitch,elapsed:0,phase:'recognize',progress:0,released:[],receipts:[],safeReached:null,outcome:null,completionDelivered:false};}
export function normalizeFirstStrike(value,entryValue){const e=normalizeFirstStrikeEntry(entryValue),fresh=freshFirstStrike(e);if(value?.schema!==1||value.eventId!==e.eventId)return fresh;const ids=new Set(firstStrikePieces(e).map(p=>p.id)),seen=new Set(),elapsed=Math.max(0,Math.min(C.duration,finite(value.elapsed))),outcome=elapsed>=C.duration&&['survived','enclosed'].includes(value.outcome)?value.outcome:null;return{...fresh,x:finite(value.x,fresh.x),z:finite(value.z,fresh.z),feet:finite(value.feet,fresh.feet),yaw:finite(value.yaw,fresh.yaw),pitch:Math.max(-1.3,Math.min(1.3,finite(value.pitch,fresh.pitch))),elapsed,phase:phaseAt(elapsed),progress:Math.max(0,finite(value.progress)),routeHash:String(value.routeHash||fresh.routeHash),released:(Array.isArray(value.released)?value.released:[]).filter(v=>ids.has(v.id)&&!seen.has(v.id)&&(seen.add(v.id),true)&&Number.isFinite(v.at)&&v.at>=0&&v.at<=elapsed+1e-7).map(v=>({id:v.id,at:v.at,mode:v.mode==='hang'?'hang':'fall'})),receipts:[...new Set((Array.isArray(value.receipts)?value.receipts:[]).filter(v=>typeof v==='string'))].slice(-256),safeReached:['clear-edge','shelter'].includes(value.safeReached)?value.safeReached:null,outcome,completionDelivered:!!outcome&&value.completionDelivered===true};}
export function firstStrikeCanStand(entry,state,x,z,pieces=firstStrikePieces(entry)){
 const support=firstStrikeFooting(entry,x,z,state.feet);if(!support)return null;
 if(!entry.plan){const floorHost=firstStrikeCellAt(entry,x,z,state.feet)?.floorHostId;for(const r of state.released){const p=pieces.find(p=>p.id===r.id);if(floorHost&&p?.cells.some(c=>c.ceilingHostId===floorHost))return null;}return support;}
 for(const released of state.released){const piece=pieces.find(p=>p.id===released.id);if(!piece)continue;const pose=firstStrikePiecePose(piece,released.at,state.elapsed,{mode:released.mode});if(pose.y-C.slabThickness>support.y+C.bodyHeight)continue;
  for(const cell of piece.cells)if(x+C.bodyRadius>cell.x-cell.size/2&&x-C.bodyRadius<cell.x+cell.size/2&&z+C.bodyRadius>cell.z-cell.size/2&&z-C.bodyRadius<cell.z+cell.size/2)return null;
 }
 return support;
}
function atTarget(entry,state,target){
 if(!target||Math.abs(state.feet-target.feet)>.4||!firstStrikeFooting(entry,state.x,state.z,state.feet))return false;
 const dx=state.x-target.x,dz=state.z-target.z,radius=Math.max(.1,target.radius-C.bodyRadius);
 if(target.kind==='shelter')return Math.hypot(dx,dz)<=radius;
 const n=target.normal,length=Math.hypot(n?.x||0,n?.z||0);if(length<.5)return Math.hypot(dx,dz)<=radius;
 const nx=n.x/length,nz=n.z/length;
 // The near boundary of the marked region must clear the whole body. Beyond
 // it, ordinary supported walking remains safe; returning inside does not.
 return dx*nx+dz*nz>=-radius+C.bodyRadius&&Math.abs(dx*nz-dz*nx)<=radius;
}
export function firstStrikeSafety(entry,state){if(atTarget(entry,state,entry.safeEdge))return entry.safeEdge.kind==='shelter'?'shelter':'clear-edge';return atTarget(entry,state,entry.shelter)?'shelter':null;}
export function stepFirstStrike(current,entryValue,input={}){
 const entry=normalizeFirstStrikeEntry(entryValue),state=copy(current),events=[],pieces=firstStrikePieces(entry);
 if(input.paused||input.protected||input.assetsReady===false||state.outcome)return{state,events,travel:0};
 if(input.look){state.yaw=finite(input.look.yaw,state.yaw);state.pitch=Math.max(-1.3,Math.min(1.3,finite(input.look.pitch,state.pitch)));}
 let remaining=Math.max(0,Math.min(C.maxFrameDelta,finite(input.dt))),travel=0;
 const receipt=(type,id,position,at=state.elapsed)=>{if(state.receipts.includes(id))return;state.receipts.push(id);events.push({type,id,position,at,age:Math.max(0,state.elapsed-at),gain:1});};
 while(remaining>1e-9){const dt=Math.min(C.fixedStep,remaining);remaining-=dt;const prior=state.elapsed;state.elapsed=Math.min(C.duration,state.elapsed+dt);state.phase=phaseAt(state.elapsed);
  const forward=Math.max(-1,Math.min(1,finite(input.forward))),side=Math.max(-1,Math.min(1,finite(input.side))),length=Math.hypot(forward,side)||1,
   dx=(Math.sin(state.yaw)*forward+Math.cos(state.yaw)*side)/Math.max(1,length)*C.walkSpeed*dt,dz=(-Math.cos(state.yaw)*forward+Math.sin(state.yaw)*side)/Math.max(1,length)*C.walkSpeed*dt;
  const beforeX=state.x,beforeZ=state.z;
  for(const axis of[0,1]){const x=state.x+(axis===0?dx:0),z=state.z+(axis===1?dz:0),support=firstStrikeCanStand(entry,state,x,z,pieces);if(support){state.x=x;state.z=z;state.feet=support.y;}}
  travel+=Math.hypot(state.x-beforeX,state.z-beforeZ);
  state.progress=Math.max(state.progress,firstStrikeRouteProjection(entry,state.x,state.z).progress);
  state.safeReached=firstStrikeSafety(entry,state);if(state.safeReached)receipt('safe-crossing',state.eventId+':safe',{x:state.x,y:state.feet,z:state.z});
  for(const[type,at]of[['strain',.15],['first-strike',1.9],['final-settlement',35]])if(prior<at&&state.elapsed>=at)receipt(type,state.eventId+':'+type,{x:entry.origin.x,y:entry.origin.y+3,z:entry.origin.z},at);
  if(prior<1.9&&state.elapsed>=1.9||prior<35&&state.elapsed>=35){
   const bodyFloor=firstStrikeCellAt(entry,state.x,state.z,state.feet)?.floorHostId;
   const close=pieces.filter(piece=>(entry.plan||!piece.cells.some(c=>c.ceilingHostId===bodyFloor))&&(piece.structuralHost||Math.hypot(piece.x-state.x,piece.z-state.z)<(state.elapsed>=35?28:9))).sort((a,b)=>Math.hypot(a.x-state.x,a.z-state.z)-Math.hypot(b.x-state.x,b.z-state.z)).slice(0,state.elapsed>=35?C.maxPieces:6);
   for(const piece of close)if(!state.released.some(v=>v.id===piece.id)){state.released.push({id:piece.id,at:state.elapsed,mode:'hang'});receipt('joint-hang',state.eventId+':hang:'+piece.id,{x:piece.x,y:piece.ceil,z:piece.z});}
  }
  for(const p of pieces){if(state.elapsed<p.releaseAt||state.released.some(v=>v.id===p.id))continue;
   const bodyFloor=firstStrikeCellAt(entry,state.x,state.z,state.feet)?.floorHostId;if(!entry.plan&&p.cells.some(c=>c.ceilingHostId===bodyFloor))continue;
   // A committed falling slab cannot reach the player's body before landing,
   // even if the player immediately reverses at maximum ordinary walk speed.
   // Future route cells never disappear in front of a clearance decision.
   const safeFar=Math.hypot(state.x-p.x,state.z-p.z)>p.bodyClearance,
    behind=p.projection.progress+3<state.progress,side=p.projection.distance>3.6;
   if(safeFar&&(behind||side)){state.released.push({id:p.id,at:state.elapsed,mode:'fall'});receipt('course-release',state.eventId+':'+p.id,{x:p.x,y:p.ceil,z:p.z});}
  }
  if(state.elapsed>=C.duration){state.phase='terminal';state.outcome=state.safeReached?'survived':'enclosed';receipt('terminal',state.eventId+':terminal',{x:state.x,y:state.feet,z:state.z});break;}
 }
 return{state,events,travel};
}
export function firstStrikeFrame(state,entryValue,presentation={}){const entry=normalizeFirstStrikeEntry(entryValue);return{sequenceId:state.eventId,active:!state.completionDelivered,elapsed:state.elapsed,phase:state.phase,outcome:state.outcome,eye:[state.x,state.feet+C.eyeHeight,state.z],yaw:state.yaw,pitch:state.pitch,safeReached:state.safeReached,released:copy(state.released),dust:Math.max(0,Math.min(1,(state.elapsed-1)/34)),darkness:state.outcome==='enclosed'?1:Math.max(0,Math.min(.72,(state.elapsed-35)/9)),region:entry.region,reducedMotion:!!presentation.reducedMotion,events:[]};}
export function createFirstStrikeScene({entry:entryValue,checkpoint,renderer,audio=null,presentation=()=>({}),onCheckpoint=()=>{},onComplete=()=>false,onTorch=()=>{},onAcceptedTravel=()=>{},onError=()=>{},onTrace=()=>{},onExit=()=>{}}={}){
 if(typeof renderer?.render!=='function')throw Error('First Strike needs its actual construction renderer.');const entry=normalizeFirstStrikeEntry(entryValue);let state=normalizeFirstStrike(checkpoint,entry),ready=false,closed=false,paused=false,leaving=false,error=null,initializing=null,saveAge=0,traceAge=0,drag=null,terminalRendered=false;const keys=new Set();
 const clear=()=>{keys.clear();drag=null;},save=reason=>{const checkpoint=copy(state);onCheckpoint(checkpoint,{reason});return checkpoint;},p=()=>presentation()||{},protectedNow=()=>{const v=p();return!!(paused||v.protected||v.hidden||v.suspended||v.focused===false||v.foreground===false);},live=()=>ready&&!closed&&!error&&renderer.ready?.()!==false;
 function fail(reason){error=String(reason?.message||reason);clear();audio?.stop?.();onError(reason);}
 function complete(){if(leaving||closed||error||!state.outcome||state.completionDelivered||!terminalRendered)return;leaving=true;clear();audio?.stop?.();const checkpoint=save('terminal-before-host-commit');Promise.resolve().then(()=>onComplete({eventId:state.eventId,outcome:state.outcome,safeReached:state.safeReached,checkpoint})).then(ok=>{if(ok===false)throw Error('The failed night has not yet been committed.');state.completionDelivered=true;save('terminal-delivered');}).catch(reason=>{leaving=false;fail(reason);});}
 function apply(input){const result=stepFirstStrike(state,entry,{...input,paused,protected:protectedNow(),assetsReady:live()});state=result.state;if(result.travel>0)onAcceptedTravel(result.travel);const frame=firstStrikeFrame(state,entry,p());frame.events=result.events;audio?.update?.(frame,{...p(),protected:protectedNow(),listener:{x:state.x,y:state.feet+C.eyeHeight,z:state.z,yaw:state.yaw}});if(result.events.length){save('structural-event');for(const event of result.events)onTrace({type:'event',event});}return result;}
 const scene={id:'first-strike',blocksWorld:true,blocksInput:true,suppressesHud:true,worldPresentation:'hidden',handlesEscape:false,lookProfile:'explore',
  get allowsLook(){return live()&&!protectedNow()&&!leaving;},
  initialize(){if(initializing)return initializing;save('preparation');initializing=Promise.all([renderer.initialize?.(),Promise.resolve().then(()=>audio?.ready?.()).catch(()=>false)]).then(([ok])=>{if(closed)return false;if(ok===false)throw Error('The existing span is not ready.');if(entry.route.length<2||Math.hypot(entry.safeEdge.x-entry.origin.x,entry.safeEdge.z-entry.origin.z)<1.5)throw Error('No existing supported clearance route has resolved.');if(state.routeHash!==entry.routeHash)throw Error('The clearance construction changed; reload its saved supported route before resuming.');if(!firstStrikeCanStand(entry,state,state.x,state.z))throw Error('The saved body no longer has its real clearance footing.');ready=true;save('ready');return true;}).catch(reason=>{fail(reason);return false;});return initializing;},
  enter(){void scene.initialize();},update(dt){if(closed||leaving)return;if(!live()||protectedNow()){clear();audio?.stop?.();return;}const step=Math.max(0,Math.min(C.maxFrameDelta,finite(dt)));apply({dt:step,forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),side:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))});saveAge+=step;traceAge+=step;if(saveAge>=.5){saveAge=0;save('body');}if(traceAge>=.1){traceAge=0;onTrace({type:'pose',...copy(state)});}},
  view:()=>({ready:live(),paused,closed,leaving,error,entryKey:entry.routeHash,state:copy(state),frame:firstStrikeFrame(state,entry,p()),focus:null}),serialize:()=>copy(state),checkpoint:()=>save('requested'),
  pause(){if(paused||closed)return;paused=true;clear();audio?.stop?.();save('pause');},resume(){paused=false;clear();},blur(){scene.pause();},suspend(){scene.pause();},
  lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),lookBy(yaw,pitch){if(!scene.allowsLook)return false;apply({dt:0,look:{yaw:state.yaw+finite(yaw),pitch:state.pitch+finite(pitch)}});return true;},setLook(look){if(!scene.allowsLook)return false;apply({dt:0,look});return true;},
  key(e={}){const k=keyOf(e);if(k==='escape'||e.controllerAction==='back'){clear();save('pause-request');return false;}if(closed||leaving||e.ctrlKey||e.metaKey||e.altKey)return true;if(error){if(!e.repeat&&k==='e'){if(state.outcome){error=null;complete();}else{error=null;initializing=null;void scene.initialize();}}return true;}if(!live()||protectedNow())return true;if(!e.repeat&&k==='f'){onTorch();return true;}if(keysOf.has(k)&&!e.repeat)keys.add(k);return true;},keyup(e={}){keys.delete(keyOf(e));return true;},input(name,value=true){const key=actions[name]||name;if(!keysOf.has(key))return false;if(!value)keys.delete(key);else if(live()&&!protectedNow())keys.add(key);return true;},
  pointer(e={}){if(!scene.allowsLook){drag=null;return true;}if(e.type==='pointerdown'&&(e.button===2||e.buttons===2))drag={x:e.clientX,y:e.clientY};if(e.type==='pointerup'||e.type==='pointercancel')drag=null;if(e.type==='pointermove'&&drag){scene.lookBy((e.clientX-drag.x)*.004,-(e.clientY-drag.y)*.003);drag={x:e.clientX,y:e.clientY};}return true;},
  render(){if(closed)return;if(ready)try{if(renderer.render(state,p())===false)throw Error('The failing construction view was interrupted.');if(state.elapsed<9&&!state.outcome){const size=uiSize();uiText(2,Math.max(5,(size.rows||24)-3),'CLEAR THE SPAN · FIND A LOW GREEN LAMP','ui-primary',1,Math.max(20,(size.cols||80)-4));}if(state.outcome){terminalRendered=true;complete();}}catch(reason){ready=false;fail(reason);}if(!ready||error){const size=uiSize(),cols=Math.max(20,size.cols||80),rows=Math.max(8,size.rows||24);uiFill(0,rows-5,cols,5,'#050706');uiText(2,rows-4,error?'THE VIEW IS HELD':'THE SPAN IS RESOLVING','ui-primary',1,cols-4);if(error)uiText(2,rows-2,'[E] RETRY · PAUSE FOR NEW GAME / TITLE','ui-secondary',1,cols-4);}},
  exit(){if(closed)return;closed=true;clear();audio?.stop?.();if(!state.completionDelivered)save('interrupted');renderer.dispose?.();onExit({checkpoint:copy(state)});},
 };return scene;
}
export const makeFirstStrikeScene=createFirstStrikeScene;
