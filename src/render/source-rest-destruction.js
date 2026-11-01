import {SOURCE_REST_SEATS} from '../game/source-rest-seat.js';
import {SOURCE_REST_PERFORMANCE} from '../data/source-rest-performance.js';
import {sourceRestDestructionFragments} from './source-rest-destruction-models.js';
import {sourceRestBodyPose} from './source-rest-body.js';

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
export function applySourceRestDestruction(input,{cue,time=0,seat=SOURCE_REST_SEATS[0],origin={x:0,y:0,z:0},reducedMotion=false,canLeave=true}={}){
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
      if(part.angelAssemblyId){
        // A wheel, its eyes and the two rooted wings are one bearing group.
        // The first wheel keeps the damaged core turning. The other two fail
        // at authored moments inside the second human-marked hard passage.
        const wheel=Number(part.wheelId),fractureAt=wheel===1?at(second,.35):wheel===2?at(second,.70):Infinity;
        if(now>=fractureAt&&damage>.1){
          const motion=trajectory('rest-angel-bearing-'+wheel,now-fractureAt,reducedMotion),pivot=part.cubePivot||[part.x,part.y,part.z],
            group=multiply(translation(...pivot),multiply(motion.matrix,translation(...pivot.map(n=>-n)))),
            movedPart=multiply(group,matrixOf(part));
          props.push(positionPart(part,movedPart,{restAffliction:true,restDetached:true,fractureAt,fractureState:motion.state}));
          moved.push(part.id);if(motion.state==='falling')falling++;if(motion.state==='fallen')fallen++;
        }else props.push(part);
        continue;
      }
      if(part.cubieId||part.noteKind==='note-cube-core'){
        // Paired shell/chamber pieces remain one mechanical member. The core
        // and most of the lattice keep playing while damaged members fall.
        if(!part.cubieId){props.push(part);continue;}
        const key=String(part.cubieId),weight=hash(key),breakAt=weight<.24?at(first,.20+weight*2):weight<.60?at(second,.12+(weight-.24)*1.8):Infinity;
        if(now>=breakAt&&damage>.1){const motion=trajectory(key,now-breakAt,reducedMotion);
          props.push(positionPart(part,movedMatrix(matrixOf(part),motion),{restAffliction:true,restDetached:true,fractureAt:breakAt,fractureState:motion.state}));
          moved.push(part.id);if(motion.state==='falling')falling++;if(motion.state==='fallen')fallen++;
        }else props.push(part);
        continue;
      }
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
  return{props,debris,body,diagnostics:{active:true,damage,pain,fracturedStructures:fractured.length,fracturedIds:fractured,detachedStructures:moved.length,detachedIds:moved,
    fragments:debris.length,bodyParts:body.length,falling,fallen,protectedIds,physicalCollisionChanged:false,lateShelterDamage:!canLeave&&moved.some(id=>id.includes('ceiling')||id.includes('window')),
    time:now,reducedMotion,scope:'Depth-tested rendered fragments and a seated body; no world support, quest, injury or saved collision state is changed.'}};
}
