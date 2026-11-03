import {SOURCE_REST_SEATS,sourceRestEyePosition} from '../game/source-rest-seat.js';
import {sourceRestHorizonSchedule,sourceRestHorizonInfall} from '../game/source-rest-horizon.js';
import {SOURCE_REST_PERFORMANCE} from '../data/source-rest-performance.js';
import {sourceRestDestructionFragments,sourceRestDestructionPostBatch} from './source-rest-destruction-models.js';
import {sourceRestBodyPose} from './source-rest-body.js';
import {sourceRestMistakeStructure,SOURCE_REST_MISTAKE_STRUCTURE} from '../game/source-rest-affliction.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const hash=value=>{let n=2166136261;for(const ch of String(value))n=Math.imul(n^ch.charCodeAt(0),16777619);return(n>>>0)/4294967296;};
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);return a[r]*b[c*4]+a[r+4]*b[c*4+1]+a[r+8]*b[c*4+2]+a[r+12]*b[c*4+3];});
const translation=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const scale=(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
function rotation(x,y,z){const a=identity(),b=identity(),c=identity();a[5]=Math.cos(x);a[6]=Math.sin(x);a[9]=-Math.sin(x);a[10]=Math.cos(x);
  b[0]=Math.cos(y);b[2]=-Math.sin(y);b[8]=Math.sin(y);b[10]=Math.cos(y);c[0]=Math.cos(z);c[1]=Math.sin(z);c[4]=-Math.sin(z);c[5]=Math.cos(z);return multiply(a,multiply(b,c));}
const matrixOf=p=>p.matrix?Array.from(p.matrix):multiply(translation(p.x||0,p.y||0,p.z||0),multiply(rotation(p.rotationX||0,p.yaw||0,p.rotationZ||0),scale(p.sx||1,p.sy||1,p.sz||1)));
const passages=SOURCE_REST_PERFORMANCE.annotations.filter(a=>a.type==='grueling');
const at=(passage,fraction)=>passage.start+(passage.end-passage.start)*clamp(fraction);
const fullMesh=name=>'source-continuation-rest-break-'+name;

function trajectory(id,age,reducedMotion){
  if(age<0)return{matrix:identity(),state:'intact'};
  const seed=hash(id),angle=seed*Math.PI*2;
  if(reducedMotion)return{matrix:multiply(translation(Math.cos(angle)*.65,-2.1-seed*2.2,Math.sin(angle)*.65),rotation(.19*(seed-.5),0,.19*(.5-seed))),state:'detached'};
  const t=Math.min(4.5,age),speed=.42+hash(id+'speed')*1.35,
    dx=Math.cos(angle)*speed*t,dy=(.32+seed*.55)*t-2.7*t*t,dz=Math.sin(angle)*speed*t;
  return{matrix:multiply(translation(dx,dy,dz),rotation((seed-.45)*t*1.9,(hash(id+'yaw')-.5)*t*1.4,(.6-seed)*t*1.8)),state:age<2.7?'falling':'fallen'};
}
function positionPart(part,matrix,extra={}){return{...part,...extra,matrix:new Float32Array(matrix),x:matrix[12],y:matrix[13],z:matrix[14]};}
function movedMatrix(base,motion){
  // Tumble around this piece's own centre. A world rotation multiplied by
  // the full parent transform would incorrectly orbit it around world zero.
  const orientation=Array.from(base);orientation[12]=orientation[13]=orientation[14]=0;
  const moved=multiply(motion.matrix,orientation);for(let n=0;n<3;n++)moved[12+n]+=base[12+n];return moved;
}
function seatedBody(cue,time,seat,origin,reducedMotion){
  return sourceRestBodyPose({cue,seat,origin,reducedMotion}).parts;
}

const transformed=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
function mistakeStructure(input,{cue,seat,origin,reducedMotion,effectsMode='full',reducedDread=false}){
  const score=sourceRestMistakeStructure(cue),reveals=input.filter(p=>p.restPlace&&String(p.mesh).endsWith('rest-oak')&&/window-reveal--?1$/.test(p.id)).sort((a,b)=>a.z-b.z),
    posts=input.filter(p=>p.restPlace&&String(p.mesh).endsWith('rest-oak')&&/loggia-post--?1$/.test(p.id)).sort((a,b)=>a.z-b.z),carriers=[...reveals,...posts].slice(0,SOURCE_REST_MISTAKE_STRUCTURE.carriers),
    replaced=new Map(),pieces=sourceRestDestructionFragments('post'),impacts=[],chips=[],calm=reducedMotion||effectsMode==='off'||reducedDread;
  let cracked=0,detached=0;
  for(let index=0;index<carriers.length;index++){
    const post=carriers[index],damage=score.posts[index];if(!damage.hits)continue;
    const base=matrixOf(post),out=[],stage=Math.min(7,Math.floor(damage.wear/2)),meta={restAffliction:true,restPlace:true,restMistake:true,restMistakeCarrier:post.id,
      decorative:true,structural:false,noShadow:true,region:post.region,chartId:post.chartId};
    const batch=sourceRestDestructionPostBatch(post.id,stage),clock=Number.isFinite(cue.unwrappedTime)?cue.unwrappedTime:Number(cue.time)||0,
      settled=damage.failures.filter(row=>calm||clock-row.at>=1.05).length;
    if(!stage)out.push(post);
    else if(batch){
      out.push(positionPart({...meta,id:post.id+':mistake-remainder',mesh:batch.remainder,cullRadius:3,restSurvivingPost:true},base));
      if(settled){const rubble=sourceRestDestructionPostBatch(post.id,settled);out.push(positionPart({...meta,id:post.id+':mistake-rubble',mesh:rubble.rubble,
        restFracture:true,restDetached:true,fracturedFrom:post.id,fractureState:'fallen',batchedSections:settled,cullRadius:3},translation(base[12],base[13],base[14])));}
    }
    if(stage)for(const piece of pieces){
      const id=post.id+':mistake-section:'+piece.index,release=damage.failures.find(row=>row.section===piece.index),centre=multiply(base,translation(...piece.center));
      if(batch&&(!release||calm||clock-release.at>=1.05))continue;
      let m=centre,state='intact';
      if(release){
        const age=Math.max(0,clock-release.at),seed=hash(batch?batch.canonicalId+':mistake-section:'+piece.index:id),t=calm?1:clamp(age/1.05),ease=t*t*(3-2*t),
          turn=rotation(.12*ease,seed*.35*ease,Math.PI*.5*ease),orientation=Array.from(base);orientation[12]=orientation[13]=orientation[14]=0;
        m=multiply(turn,orientation);
        // Bound the current oriented fragment, including during its roll.
        // Clamping only its centre would bury the lower half in the floor.
        const extent=piece.halfExtents,verticalRadius=Math.abs(m[1])*extent[0]+Math.abs(m[5])*extent[1]+Math.abs(m[9])*extent[2],
          ground=(Number(origin.y)||0)+seat.feet+verticalRadius+.008,
          fallenY=Math.max(ground,centre[13]+.12*age-3.5*age*age);
        m[12]=centre[12]+.10*ease;m[13]=calm?ground:fallenY;m[14]=centre[14]+(seed-.5)*.16*ease;
        state=t<1?'falling':'fallen';
      }else{m=centre;}
      out.push(positionPart({...meta,id,mesh:piece.mesh,restFracture:true,fracturedFrom:post.id,fractureState:state,
        ...(release?{restDetached:true,fractureAt:release.at}:{}),cullRadius:3},m));
    }
    detached+=stage;
    // A closed dark joint becomes an open, jagged fracture. Once a section
    // has left, that actual missing timber carries the crack without another
    // permanent overlay/instance competing with the finite return view.
    if(!stage){const mesh=fullMesh('post-crack-7');out.push(positionPart({...meta,id:post.id+':mistake-crack',mesh,cullRadius:3,restCrack:true},base));}cracked++;
    replaced.set(post,out);
  }
  const quiet=effectsMode==='off'||reducedDread,pose=sourceRestBodyPose({cue,seat,origin,reducedMotion});
  if(!quiet)for(const event of score.events){
    const post=carriers[event.targetIndex];if(!post)continue;
    const base=matrixOf(post),side=event.targetIndex%2,body=pose.contacts[side],start=transformed(base,[.48,Math.max(.18,1-event.stage*.1),0]),
      contact=event.severity>=2&&event.targetIndex<2&&!!body&&cue.embodied===true&&(cue.bodyProgress??1)>.95,
      target=contact?body.wrist:transformed(base,[.85,.04,side?.7:-.7]),age=event.age,hit=SOURCE_REST_MISTAKE_STRUCTURE.contactSeconds;
    let point;
    if(age<=hit){const t=clamp(age/hit);point=start.map((n,k)=>n+(target[k]-n)*t);point[1]+=(reducedMotion?0:Math.sin(Math.PI*t)*.14);}
    else{const t=age-hit;point=[target[0]+t*.21,target[1]+t*.32-3.5*t*t,target[2]+(side?1:-1)*t*.25];point[1]=Math.max((Number(origin.y)||0)+seat.feet+.014,point[1]);}
    if(reducedMotion&&!(contact&&age>=hit&&age<hit+.20))continue;
    const m=multiply(translation(...(reducedMotion?target:point)),multiply(rotation(reducedMotion?0:age*2.5,event.index,age*.7),scale(.027,.095,.025))),id='source-rest-mistake-chip:'+event.id;
    chips.push(positionPart({id,mesh:fullMesh('splinter'),restAffliction:true,restPlace:true,restMistake:true,restMistakeChip:true,restMistakeCarrier:post.id,
      decorative:true,structural:false,noShadow:true,region:post.region,chartId:post.chartId,cullRadius:2},m));
    if(contact&&age>=hit&&age<hit+.20)impacts.push({id:'source-rest-material:'+event.id,annotationId:event.annotationId,
      sourceClock:event.at+hit,phase:seat.phase,contact:true,point:[...target],chipId:id,carrierId:post.id,bodyPart:body.id,
      legibility:'world-space hand contact; visibility still requires current camera and actual submitted geometry'});
  }
  return{props:input.flatMap(p=>replaced.get(p)||[p]).concat(chips),diagnostics:{mistakeCarriers:carriers.length,mistakeCracked:cracked,
    mistakeDetached:detached,mistakeChips:chips.length,mistakeImpacts:impacts,mistakeDamagePersistent:true,
    mistakeInstances:[...replaced.values()].reduce((n,p)=>n+p.length,0)+chips.length,mistakeMaximumInstances:32,
    mistakeBatching:'exact surviving sections and exact settled oak share one mesh per post; only falling sections are independent'}};
}

function catchDecline(input,{cue,time,seat,origin,reducedMotion,canLeave}){
  const now=Math.max(0,Number.isFinite(cue.unwrappedTime)?cue.unwrappedTime:Number(time)||Number(cue.time)||0),progress=clamp(cue.progress),damage=clamp(cue.destruction),
    physicalOrigin={x:Number(origin.x)||0,y:Number(origin.y)||0,z:Number(origin.z)||0},
    bodyCue={...cue,pain:0,facultyLoss:canLeave?0:clamp(cue.facultyLoss),strain:clamp(cue.strain)*(canLeave?.25:1)},
    body=seatedBody(bodyCue,now,seat,physicalOrigin,reducedMotion).map(p=>({...p,id:p.id.replace('rest-affliction-','rest-catch-affliction-'),
      region:'catch',chartId:seat.chartId,restAfflictionSource:'couperin'})),props=[],moved=[],protectedIds=[];
  let falling=0,fallen=0;
  for(const part of input){
    const id=String(part.id||''),panel=id.includes('catch-rest-lid-panel-'),outerRib=/catch-rest-lid-rib--?0\.84$/.test(id),drip=id.endsWith('catch-rest-drip-edge'),
      instrument=!!part.restHarpsichordWear,target=part.restPlace&&part.region==='catch'&&(panel||outerRib||drip||instrument),
      protectedSupport=part.physicalKind==='surface'||part.playerBody||part.restSeatDetail||part.role==='rest-seat'||part.doorId;
    if(protectedSupport||!target||canLeave){props.push(part);if(protectedSupport||target&&canLeave)protectedIds.push(id);continue;}
    // No invented performer mistakes: the actual late conversation releases
    // a few whole lid members. Its posts, central ribs and usable support stay.
    const releaseProgress=(instrument?.70:panel?.66:outerRib?.77:.86)+hash(id)*.06;
    if(progress<releaseProgress||damage<=0){props.push(part);continue;}
    const motion=trajectory('couperin:'+id,(progress-releaseProgress)*90,reducedMotion),base=matrixOf(part);
    let m;
    if(instrument&&Array.isArray(part.restHarpsichordCenter)){
      // Instrument batches share the actual seat origin. A released lid piece
      // tumbles about its own timber centre, not around the player's body.
      const pivot=part.restHarpsichordCenter,world=[0,1,2].map(k=>base[k]*pivot[0]+base[k+4]*pivot[1]+base[k+8]*pivot[2]+base[k+12]);
      m=multiply(translation(...world),multiply(motion.matrix,multiply(translation(...world.map(n=>-n)),base)));
    }else m=movedMatrix(base,motion);
    props.push(positionPart(part,m,{restAffliction:true,restAfflictionSource:'couperin',restDetached:true,restCatchWear:true,
      releaseProgress,fractureState:motion.state}));
    moved.push(id);if(motion.state==='falling')falling++;else fallen++;
  }
  return{props,debris:[],body,diagnostics:{active:true,source:'couperin',damage,pain:0,mistakeCount:0,syntheticMistakeAudio:false,
    fracturedStructures:0,fracturedIds:[],detachedStructures:moved.length,detachedIds:moved,fragments:0,bodyParts:body.length,falling,fallen,protectedIds,
    physicalCollisionChanged:false,lateShelterDamage:!canLeave&&moved.length>0,time:now,reducedMotion,
    scope:'Narrative-led Couperin strain and authored lid members; no invented mistakes, audio, injury, support or saved-state changes.'}};
}

/** A transient rendering layer. The actual controller/collision descriptors
 * remain authoritative, including while these hallucinated structures fall. */
export function applySourceRestDestruction(input,{cue,time=0,seat=SOURCE_REST_SEATS[0],origin={x:0,y:0,z:0},reducedMotion=false,canLeave=true,effectsMode='full',reducedDread=false,horizon=null}={}){
  const empty={props:input,debris:[],body:[],diagnostics:{active:false,fracturedStructures:0,fragments:0,bodyParts:0,physicalCollisionChanged:false}};
  if(!cue?.active)return empty;
  if(seat?.phase==='catch'){
    // The Chaconne's annotation report never leaks into the other ending.
    if(cue.mistakeSource!=='none: no Couperin performance report'||cue.syntheticMistakeAudio!==false)return empty;
    return catchDecline(input,{cue,time,seat,origin,reducedMotion,canLeave});
  }
  const now=Math.max(0,Number.isFinite(cue.unwrappedTime)?cue.unwrappedTime:Number(time)||Number(cue.time)||0),damage=clamp(cue.destruction),pain=clamp(cue.pain),
    props=[],debris=[],body=seatedBody(cue,now,seat,{x:Number(origin.x)||0,y:Number(origin.y)||0,z:Number(origin.z)||0},reducedMotion),fractured=[],moved=[],protectedIds=[];
  const first=passages[0],second=passages[1];let falling=0,fallen=0;
  function fragments(part,family,start,fraction=.85){
    const pieces=sourceRestDestructionFragments(family);if(!pieces.length||debris.length+pieces.length>72)return false;
    const base=matrixOf(part),physical=part.physicalKind==='solid'&&part.physicalBounds;
    let parent=base;
    if(physical){const bounds=part.physicalBounds,size=bounds.min.map((v,k)=>bounds.max[k]-v);parent=multiply(base,multiply(translation(0,-size[1]/2,0),scale(...size)));}
    for(const piece of pieces){
      const id=part.id+':fracture:'+piece.index,breakAt=start+(family==='oculus'?(first.end-first.start)*fraction*hash(id):1.8*hash(id)),age=now-breakAt,
        local=multiply(parent,translation(...piece.center)),motion=trajectory(id,age,reducedMotion),
        // World gravity is applied outside the parent's incompatible gravity.
        m=movedMatrix(local,motion);
      if(motion.state==='falling')falling++;if(motion.state==='fallen')fallen++;
      debris.push(positionPart({id,mesh:piece.mesh,decorative:true,structural:false,noShadow:true,region:'wrong-return',chartId:seat.chartId,
        restAffliction:true,restFracture:true,fracturedFrom:part.id,fractureAt:breakAt,fractureState:motion.state,cullRadius:4},m));
    }
    fractured.push(part.id);return true;
  }
  for(const part of input){
    const id=String(part.id||''),seed=hash(id),isNote=!!part.restNoteArchitecture,
      protectedSupport=part.physicalKind==='surface'||part.playerBody||part.restSeatDetail||id.includes('prop-source-rest-ii');
    if(protectedSupport){props.push(part);protectedIds.push(id);continue;}
    const family=String(part.mesh||'').match(/rest-note-(oculus|grand-return|vault|window|stair|return|landing|bridge)$/)?.[1];
    if(isNote){
      // A newly performed note is a fresh attempt to build in the ruins, not
      // a structure that inexplicably fell before that note was ever played.
      if(part.articulation){
        const cycle=Math.max(0,Math.floor((now+.000001)/Math.max(1,cue.duration||716.397868))),
          releaseAt=cycle*(cue.duration||716.397868)+(part.onset||0)+(part.noteDuration||0)+.08;
        if(cue.strain>.3&&part.phase==='decay'&&now>=releaseAt&&fragments(part,family,releaseAt))continue;
        if((pain>.005||cue.strain>.05)&&!reducedMotion){
          const m=multiply(translation(pain*.025*(seed-.5),pain*.035+cue.strain*.018*Math.sin(now*13+seed*6),0),matrixOf(part));
          props.push(positionPart(part,m,{restAffliction:true,restPainRattle:true,restRebuilt:true}));
        }else props.push({...part,restRebuilt:true});
        continue;
      }
      const principal=family==='oculus',flight=family==='grand-return'&&id.endsWith('floor-return'),pitched=[62,69].includes(part.midi),
        fractureAt=principal?at(first,.12):flight?at(second,.12):pitched?at(first,.20+.65*seed):seed<.44?at(first,.10+seed/.44*.85):at(second,(seed-.44)/.56*.88);
      if(damage>.01&&now>=fractureAt&&(principal||flight||pitched)&&fragments(part,family,fractureAt,principal?.65:.85))continue;
      if(damage>.01&&now>=fractureAt){const motion=trajectory(id,now-fractureAt,reducedMotion),m=movedMatrix(matrixOf(part),motion);props.push(positionPart(part,m,{restAffliction:true,restDetached:true,fractureAt,fractureState:motion.state}));moved.push(id);if(motion.state==='falling')falling++;if(motion.state==='fallen')fallen++;continue;}
      if(pain>.005&&!reducedMotion){const m=multiply(translation(0,pain*.018*(seed-.5),pain*.028*(seed-.5)),matrixOf(part));props.push(positionPart(part,m,{restAffliction:true,restPainRattle:true}));continue;}
      props.push(part);continue;
    }
    // Never take away the usable shelter before the authored leaving gate.
    const shelter=part.restPlace&&(id.includes('ceiling-panel-')||id.includes('ceiling-rib-')||id.includes('window-head')||id.includes('west-head'));
    if(shelter&&canLeave){props.push(part);protectedIds.push(id);continue;}
    if(shelter&&!canLeave&&damage>.35&&now>=at(second,.08+seed*.65)){
      const fractureAt=at(second,.08+seed*.65);
      if((id.includes('window-head')||id.includes('west-head'))&&fragments(part,'board',fractureAt))continue;
      const motion=trajectory(id,now-fractureAt,reducedMotion);props.push(positionPart(part,movedMatrix(matrixOf(part),motion),{restAffliction:true,restDetached:true,fractureAt,fractureState:motion.state}));moved.push(id);continue;
    }
    props.push(part);
  }
  const mistakes=mistakeStructure(props,{cue,seat,origin,reducedMotion,effectsMode,reducedDread}),
    tides=horizonTides(mistakes.props,{cue,horizon,seat,origin});
  return{props:tides.props,debris,body,diagnostics:{active:true,damage,pain,fracturedStructures:fractured.length,fracturedIds:fractured,detachedStructures:moved.length,detachedIds:moved,
    fragments:debris.length,bodyParts:body.length,falling,fallen,protectedIds,physicalCollisionChanged:false,lateShelterDamage:!canLeave&&moved.some(id=>id.includes('ceiling')||id.includes('window')),
    time:now,reducedMotion,...mistakes.diagnostics,...tides.diagnostics,scope:'Finite world-anchored wooden failures and contact evidence; support/collision unchanged. Actual bounded composure is committed separately after a visible embodied impact; no lasting injury.'}};
}

// The horizon takes what the marked recording breaks outside the room. Each
// mistake releases one small fitting or pillar section; each grueling passage
// releases the outside architecture nearest the hole first. Released props
// keep their rest matrix: the prop vertex program pulls every vertex along
// its own infall path, so only the release clock is decided here.
const HORIZON_SMALL=/cypress|water-light|lamp|lantern|handle|wear/,HORIZON_PILLAR=/pier|stringer|column|jamb|tower|post/;
const HORIZON_PASSAGE=[{share:.3,until:.85,anchor:1.9},{share:.3,until:.85,anchor:1.5},{share:1,until:.62,anchor:1.3}];
const canonicalId=id=>String(id||'').split(':through:')[0];
function horizonEligible(part,eye,view){
  const id=String(part.id||'');
  if(id.includes(':through:')||part.physicalKind||part.continuation||part.architecturalJoint||part.restPlace||part.restBody||part.playerBody
    ||part.restSeatDetail||part.restBell||part.doorId||part.role||part.portalDestination||part.portalClipPlanes||part.restReturnDestination
    ||part.restMemory||part.restWeather||part.restFlood||part.chunkFault||part.catchRim||part.restAffliction||String(part.mesh).endsWith('rest-water'))return false;
  if(!part.restVista&&!part.restRouteComposition&&!part.restSky&&part.region!=='wrong-return')return false;
  const d=[part.x-eye[0],part.y-eye[1],part.z-eye[2]],along=d[0]*view[0]+d[1]*view[1]+d[2]*view[2];
  return along>4&&Math.hypot(...d)<70;
}
function horizonTides(input,{cue,horizon,seat,origin}){
  if(!horizon?.active||seat?.phase!=='wrong-return')return{props:input,diagnostics:{horizonTides:0}};
  const schedule=sourceRestHorizonSchedule(cue?.duration),clock=horizon.clock,o=[Number(origin.x)||0,Number(origin.y)||0,Number(origin.z)||0],
    eye=sourceRestEyePosition(seat).map((v,k)=>v+o[k]),view=horizon.centre.map((v,k)=>v-eye[k]),length=Math.hypot(...view);
  for(let k=0;k<3;k++)view[k]/=length;
  const candidates=input.filter(p=>horizonEligible(p,eye,view)),byId=new Map(),order=(a,b)=>hash(a.id+':horizon')-hash(b.id+':horizon');
  const small=candidates.filter(p=>HORIZON_SMALL.test(p.id)).sort(order),pillars=candidates.filter(p=>!HORIZON_SMALL.test(p.id)&&HORIZON_PILLAR.test(p.id)).sort(order);
  // Small fittings and pillar sections answer individual mistakes in a stable
  // hashed order; most mistakes take a fitting, every fourth a pillar.
  let s=0,q=0;
  for(const row of schedule.mistakes){
    if(row.index===0)continue;
    const prefer=row.index%4===3?'pillar':'small',pick=prefer==='pillar'?(pillars[q]?pillars[q++]:small[s++]):(small[s]?small[s++]:pillars[q++]);
    if(!pick)break;
    byId.set(pick.id,{release:row.time,anchor:prefer==='pillar'?1.3:1,kick:prefer==='pillar'?.25:.5,mistake:row.id});
  }
  // Horizontal distance survives the late vertical recession, so the passage
  // assignment never reorders as the vista sinks.
  const rest=candidates.filter(p=>!byId.has(p.id)).map(p=>({p,d:Math.hypot(p.x-horizon.centre[0],p.z-horizon.centre[2])}))
    .sort((a,b)=>a.d-b.d||order(a.p,b.p));
  let cursor=0;
  HORIZON_PASSAGE.forEach((plan,index)=>{
    const passage=schedule.passages[index];if(!passage)return;
    const count=index===HORIZON_PASSAGE.length-1?rest.length-cursor:Math.round(rest.length*plan.share),group=rest.slice(cursor,cursor+count);cursor+=count;
    group.forEach(({p},rank)=>byId.set(p.id,{release:passage.start+passage.span*plan.until*Math.pow(rank/Math.max(1,group.length-1),.9),anchor:plan.anchor,kick:0,passage:index}));
  });
  // Once whole fittings run out, a mistake chips a stone block off a vista
  // structure the horizon has not yet taken. Only chips in flight exist.
  const quarries=candidates.filter(p=>UNIT_BOX.test(String(p.mesh))&&String(p.mesh).endsWith('rest-stone')),chips=[];
  for(const row of schedule.mistakes){
    if(row.index===0||[...byId.values()].some(t=>t.mistake===row.id)||row.time>clock)continue;
    const open=quarries.filter(p=>!(byId.get(p.id)?.release<=row.time));if(!open.length)continue;
    const source=open[Math.floor(hash(row.id+':quarry')*open.length)],m=matrixOf(source),u=hash(row.id+':u')-.5,w=hash(row.id+':w')-.5,
      size=.32+.38*hash(row.id+':size'),tall=row.index%4===3,top=transformed(m,[u*.8,1,w*.8]),
      local=multiply(translation(...top),multiply(rotation(0,hash(row.id+':yaw')*6.283,0),scale(size,size*(tall?2.6:.7),size)));
    chips.push({...source,id:source.id+':mistake-chip:'+row.index,matrix:new Float32Array(local),x:local[12],y:local[13],z:local[14],cullRadius:2,
      horizonChip:true,horizonTide:{release:row.time,anchor:1,kick:.6,mistake:row.id}});
  }
  const released=new Set([...byId].filter(([,t])=>clock>=t.release).map(([id])=>id)),props=[];let consumed=0,pulling=0;
  for(const part of [...input,...chips]){
    const id=String(part.id||'');
    if(id.includes(':through:')&&released.has(canonicalId(id)))continue;
    const tide=part.horizonChip?part.horizonTide:byId.get(id);if(!tide){props.push(part);continue;}
    const pieces=clock>=tide.release?horizonSegments(part):[part];
    for(const piece of pieces){
      if(clock>=tide.release){
        // Drop a piece once even its far side has crossed the horizon.
        const m=piece.matrix,reach=Math.max(Number(piece.cullRadius)||0,Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10])),
          toward=[m[12]-horizon.centre[0],m[13]-horizon.centre[1],m[14]-horizon.centre[2]],r=Math.max(.001,Math.hypot(...toward)),
          far=[0,1,2].map(k=>horizon.centre[k]+toward[k]/r*(r+reach));
        if(sourceRestHorizonInfall(far,tide,horizon).consumed){consumed++;continue;}
        pulling++;
      }
      // A pulled piece has no stable shadow-map pose; the shadow pass skips it.
      props.push({...piece,noShadow:true,horizonTide:{release:tide.release,anchor:tide.anchor,kick:tide.kick,seed:hash(piece.id+':tide'),hidden:false}});
    }
  }
  return{props,diagnostics:{horizonTides:byId.size,horizonChips:chips.length,horizonPulling:pulling,horizonConsumed:consumed,horizonCandidates:candidates.length}};
}
// Rest dressing boxes are unit cubes standing on their origin. A long one is
// cut into short exact segments while it is pulled, so each segment follows
// its own infall and a wall or island curls into a stream.
const UNIT_BOX=/rest-(stone|green|oak|copper|light-strip)$/;
function horizonSegments(part){
  const m=matrixOf(part);if(!UNIT_BOX.test(String(part.mesh)))return[part];
  const lengths=[0,1,2].map(a=>Math.hypot(m[a*4],m[a*4+1],m[a*4+2])),axis=lengths.indexOf(Math.max(...lengths)),count=Math.min(10,Math.ceil(lengths[axis]/2.5));
  if(count<2)return[part];
  return Array.from({length:count},(_,j)=>{
    const offset=axis===1?j/count:-.5+(j+.5)/count,q=Array.from(m);
    for(let k=0;k<3;k++){q[12+k]+=m[axis*4+k]*offset;q[axis*4+k]=m[axis*4+k]/count;}
    return{...part,id:part.id+':horizon-'+j,matrix:new Float32Array(q),x:q[12],y:q[13],z:q[14],cullRadius:Math.max(2,lengths[axis]/count)};
  });
}
