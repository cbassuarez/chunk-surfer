import { CONSERVATORY_RIFT_ENTRANCES, CONSERVATORY_RIFT_LABEL, conservatoryRiftOption } from '../data/conservatory-rift.js';

const KIND = 'conservatory-rift', VERSION = 1, BAR = 1.04;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, finite(value, lo)));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const wrap = value => Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
const siteOf = (id, sites) => {
  const site = sites?.[id];
  if (!site?.camera || !site.spawn) throw Error(`The rift site has not resolved: ${id}`);
  return site;
};
const pose = value => ({ x: finite(value.x), z: finite(value.z), feet: finite(value.feet, 4.8), yaw: wrap(value.yaw), pitch: clamp(value.pitch, -Math.PI / 2, 1.3) });

/** Presentation-only trace. No recorder, Contact, inventory or world mutation. */
export function freshConservatoryRift({ optionId = 'bad-bar', runId = '', returnPose = null, sites } = {}) {
  const option = conservatoryRiftOption(optionId), site = siteOf(option.id, sites);
  return { kind: KIND, version: VERSION, optionId: option.id, runId: String(runId), status: 'active', phase: 'entry',
    elapsed: 0, phaseElapsed: 0, pose: pose(site.spawn), returnPose: clone(returnPose), held: false,
    playedSeconds: 0, performances: 0, releases: 0, distance: 0, leftEnsemble: false, heardPaper: false,
    doorOpen: Object.fromEntries((site.doors || []).map(door => [door.id, true])), doorChanges: [],
    token: { x: CONSERVATORY_RIFT_ENTRANCES[0], z: .5 }, marks: [], issuedMarks: [], completed: false, returnReceipt: null };
}

export function normalizeConservatoryRift(value, options = {}) {
  const base = freshConservatoryRift({ ...options, optionId: options.optionId ?? value?.optionId });
  if (value?.kind !== KIND || value.version !== VERSION || value.optionId !== base.optionId
    || options.runId != null && String(options.runId) !== String(value.runId)) return base;
  const stages = ['entry','embodied','leak','return'];
  const state = { ...base, elapsed: clamp(value.elapsed,0,1e8), phaseElapsed: clamp(value.phaseElapsed,0,1e8),
    phase: stages.includes(value.phase) ? value.phase : 'entry', pose: pose(value.pose || base.pose),
    returnPose: clone(value.returnPose ?? base.returnPose), held: !!value.held,
    playedSeconds: clamp(value.playedSeconds,0,1e8), performances: clamp(Math.floor(finite(value.performances)),0,999),
    releases: clamp(Math.floor(finite(value.releases)),0,999), distance: clamp(value.distance,0,1e8),
    leftEnsemble: !!value.leftEnsemble, heardPaper: !!value.heardPaper,
    token: { x: clamp(value.token?.x,0,1), z: clamp(value.token?.z,0,1) },
    marks: [...new Set((value.marks || []).filter(index => Number.isInteger(index) && index >= 0 && index < 4))],
    issuedMarks: [...new Set((value.issuedMarks || []).filter(index => Number.isInteger(index) && index >= 0 && index < 4))],
    doorChanges: [...new Set((value.doorChanges || []).filter(id => Object.hasOwn(base.doorOpen,id)))],
    doorOpen: Object.fromEntries(Object.keys(base.doorOpen).map(id => [id,value.doorOpen?.[id] !== false])) };
  if (state.phase === 'return') {
    const earned=state.optionId==='bad-bar'?state.performances>=2:state.optionId==='after-company'?state.leftEnsemble&&state.heardPaper:state.marks.length>=3;
    state.completed = !!value.completed && earned; state.status = 'completed';
    state.returnReceipt = { id: `${state.runId}:${KIND}:${state.optionId}:return`, delivered: !!value.returnReceipt?.delivered };
  }
  return state;
}

const setPhase = (state, phase, events) => {
  if (state.phase === phase || state.phase === 'return') return;
  state.phase = phase; state.phaseElapsed = 0; events.push({ type: 'phase', phase });
};
const finish = (state, events) => {
  const understood = state.phase === 'leak';
  setPhase(state,'return',events); state.status = 'completed'; state.completed = understood; state.held = false;
  state.returnReceipt = { id: `${state.runId}:${KIND}:${state.optionId}:return`, delivered: false };
  events.push({ type: 'return', complete: understood, receipt: clone(state.returnReceipt), returnPose: clone(state.returnPose) });
};

function walk(state, input, dt, site, events) {
  const old = { ...state.pose }, turn = clamp(finite(input.turn),-1,1);
  state.pose.yaw = Number.isFinite(input.lookYaw) ? wrap(input.lookYaw) : wrap(state.pose.yaw + turn * dt * 1.8);
  state.pose.pitch = clamp(input.lookPitch ?? state.pose.pitch,-1.25,1.25);
  const forward = clamp(finite(input.forward),-1,1), side = clamp(finite(input.side),-1,1), norm = Math.max(1,Math.hypot(forward,side));
  const dx = (Math.sin(state.pose.yaw)*forward + Math.cos(state.pose.yaw)*side)*dt*2.2/norm;
  const dz = (-Math.cos(state.pose.yaw)*forward + Math.sin(state.pose.yaw)*side)*dt*2.2/norm;
  const steps = Math.max(1,Math.ceil(Math.hypot(dx,dz)/.06));
  const attempt = (x,z) => { if (site.canOccupy && !site.canOccupy(x,z,state)) return false; state.pose.x=x;state.pose.z=z;return true; };
  for (let i=0;i<steps;i++) if (!attempt(state.pose.x+dx/steps,state.pose.z+dz/steps)) {
    attempt(state.pose.x+dx/steps,state.pose.z);attempt(state.pose.x,state.pose.z+dz/steps);
  }
  const distance = Math.hypot(state.pose.x-old.x,state.pose.z-old.z); state.distance += distance;
  if (distance > .001) events.push({type:'move',distance,pose:clone(state.pose)});
}

export function stepConservatoryRift(value, input = {}, { sites } = {}) {
  const state = normalizeConservatoryRift(value,{sites,optionId:value?.optionId,runId:value?.runId});
  const events = [], site = siteOf(state.optionId,sites), dt = clamp(input.dt,0,.25);
  if (state.status === 'completed' || input.paused || input.hidden || input.renderReady === false) return {state,events};
  state.elapsed += dt; state.phaseElapsed += dt;
  if (input.stop) { finish(state,events); return {state,events}; }
  if (state.optionId === 'bad-bar') {
    if (Number.isFinite(input.lookYaw)) state.pose.yaw = wrap(input.lookYaw);
    if (Number.isFinite(input.lookPitch)) state.pose.pitch = clamp(input.lookPitch,-1.2,.65);
    const held = !!input.held;
    if (held && !state.held) events.push({type:'live-start',source:'student',quotes:'rehearsal'});
    if (held) {
      const before = Math.floor(state.playedSeconds/BAR); state.playedSeconds += dt;
      const after = Math.floor(state.playedSeconds/BAR);
      if (after > before) {
        state.performances += after-before; events.push({type:'bar',channel:'live',pass:state.performances});
        if (state.performances === 1) {setPhase(state,'embodied',events);events.push({type:'correction',hz:444,quotes:'rehearsal'});}
        if (state.performances >= 2) setPhase(state,'leak',events);
      }
    }
    if (!held && state.held) {
      state.releases++; events.push({type:'live-stop'});
      if (state.performances) events.push({type:'reference-continues',channel:'reference',quotes:'rehearsal'});
    }
    state.held = held;
    // The host maps S to a physical stand/retreat, never a secret success key.
    if (input.forward < -.5) finish(state,events);
  } else if (state.optionId === 'after-company') {
    walk(state,input,dt,site,events);
    if (!state.leftEnsemble && state.pose.x < 63.1) {
      state.leftEnsemble=true;setPhase(state,'embodied',events);events.push({type:'company-departed'});
    }
    if (input.interact) {
      const door = (site.doors||[]).filter(value => Math.hypot(value.x-state.pose.x,value.z-state.pose.z) <= 1.65)
        .sort((a,b)=>Math.hypot(a.x-state.pose.x,a.z-state.pose.z)-Math.hypot(b.x-state.pose.x,b.z-state.pose.z))[0];
      if (door) {
        // A body in the leaf's clearance cannot shut it through itself.
        const closing = state.doorOpen[door.id] !== false;
        if (!closing || Math.abs(state.pose.x-door.x) > .32) {
          state.doorOpen[door.id]=!closing;
          if (!state.doorChanges.includes(door.id))state.doorChanges.push(door.id);
          events.push({type:'door',id:door.id,open:!closing});
        }
      }
    }
    if (!state.heardPaper && state.leftEnsemble && site.paper && Math.hypot(state.pose.x-site.paper.x,state.pose.z-site.paper.z) < 2) {
      state.heardPaper=true;setPhase(state,'leak',events);events.push({type:'reference-ahead',quotes:'rehearsal'});
    }
    if (site.arrival && Math.hypot(state.pose.x-site.arrival.x,state.pose.z-site.arrival.z) < 1) finish(state,events);
  } else {
    state.token.x = clamp(input.mark?.x ?? state.token.x + clamp(finite(input.side),-1,1)*dt*.4,0,1);
    state.token.z = clamp(input.mark?.z ?? state.token.z - clamp(finite(input.forward),-1,1)*dt*.4,0,1);
    if (input.interact) {
      const index=CONSERVATORY_RIFT_ENTRANCES.findIndex(x=>Math.hypot(state.token.x-x,state.token.z-.5)<.12);
      if (index>=0 && !state.marks.includes(index)) {
        state.marks.push(index);events.push({type:'mark',index,channel:'live',quotes:'rehearsal'});
        if (state.marks.length>=1)setPhase(state,'embodied',events);
        if (state.marks.length>=2) {
          const next=[0,1,2,3].find(value=>!state.marks.includes(value));
          if (next!=null&&!state.issuedMarks.includes(next)){state.issuedMarks.push(next);events.push({type:'issued-mark',index:next,channel:'reference'});}
        }
        if (state.marks.length>=3)setPhase(state,'leak',events);
      }
    }
    if(input.forward<-.5&&state.token.z>=.97)finish(state,events);
  }
  return { state, events };
}

export function conservatoryRiftFrame(value,{sites}={}) {
  const state=normalizeConservatoryRift(value,{sites,optionId:value?.optionId,runId:value?.runId}),site=siteOf(state.optionId,sites);
  const stage=['entry','embodied','leak','return'].indexOf(state.phase),leak=state.phase==='leak'?Math.min(1,.3+state.phaseElapsed*.25):state.phase==='return'&&state.completed?1:0;
  const camera=state.optionId==='after-company'
    ?{eye:[state.pose.x,state.pose.feet+1.62,state.pose.z],yaw:state.pose.yaw,pitch:state.pose.pitch}
    :state.optionId==='bad-bar'?{...site.camera,yaw:state.pose.yaw,pitch:state.pose.pitch}:clone(site.camera);
  const mark=index=>({index,x:CONSERVATORY_RIFT_ENTRANCES[index],z:.5});
  return {kind:KIND,optionId:state.optionId,title:conservatoryRiftOption(state.optionId).title,phase:state.phase,
    status:state.status,elapsed:state.elapsed,phaseElapsed:state.phaseElapsed,progress:stage/3,leak,camera,feet:state.pose.feet,
    pose:clone(state.pose),held:state.held,performances:state.performances,leftEnsemble:state.leftEnsemble,heardPaper:state.heardPaper,
    token:{...state.token,active:state.optionId==='fifth-chair'},marks:state.marks.map(mark),issuedMarks:state.issuedMarks.map(mark),
    miniature:state.optionId==='fifth-chair'?{board:clone(site.board),scale:.09,studentChair:4}:null,
    doorOpen:{...state.doorOpen},doorOverrides:(site.doors||[]).map(door=>({id:door.id,fraction:state.doorOpen[door.id]===false?0:1})),
    label:stage>=2?clone(CONSERVATORY_RIFT_LABEL):null,caption:null,gameplayHud:[],
    audio:{live:state.held||state.optionId!=='bad-bar'&&stage<2,reference:stage>=1,
      liveHz:440,referenceHz:444,anticipation:stage>=2?.18:0,
      liveSource:clone(site.liveSource),referenceSource:clone(site.referenceSource),
      ensembleDoorOpen:state.doorOpen['practice-east-4']!==false},
    completed:state.completed,returnReceipt:clone(state.returnReceipt),returnPose:clone(state.returnPose)};
}

/** Four reproducible review beats, reached by the same actions as playable scenes. */
export function candidateStudyFrame(optionId,beatIndex=0,sites) {
  let state=freshConservatoryRift({optionId,runId:'rift-study',sites});const target=clamp(Math.floor(beatIndex),0,3);
  const apply=input=>{state=stepConservatoryRift(state,input,{sites}).state;};
  if (target>=1) {
    if(state.optionId==='bad-bar'){for(let i=0;i<6;i++)apply({dt:.2,held:true});apply({held:false});}
    else if(state.optionId==='fifth-chair'){apply({interact:true,mark:{x:.18,z:.5}});apply({interact:true,mark:{x:.39,z:.5}});}
    else {
      const points=siteOf(state.optionId,sites).authoredRoute||[];
      const walkTo=point=>{for(let i=0;i<200&&Math.hypot(state.pose.x-point.x,state.pose.z-point.z)>.04;i++){
        const dx=point.x-state.pose.x,dz=point.z-state.pose.z,d=Math.hypot(dx,dz);apply({dt:Math.min(.1,d/2.2),forward:1,lookYaw:Math.atan2(dx,-dz)});
      }};
      for(const point of points.slice(1,5))walkTo(point);
    }
  }
  if(target>=2){
    if(state.optionId==='bad-bar'){for(let i=0;i<6;i++)apply({dt:.2,held:true});apply({dt:.2,held:false});}
    else if(state.optionId==='fifth-chair')apply({interact:true,mark:{x:.61,z:.5}});
    else {for(const point of (siteOf(state.optionId,sites).authoredRoute||[]).slice(5,7)){
      for(let i=0;i<200&&Math.hypot(state.pose.x-point.x,state.pose.z-point.z)>.04;i++){
        const dx=point.x-state.pose.x,dz=point.z-state.pose.z,d=Math.hypot(dx,dz);apply({dt:Math.min(.1,d/2.2),forward:1,lookYaw:Math.atan2(dx,-dz)});
      }
    }
      // The review performs the same look input available during play: the
      // recovered part is below eye level beside the route, not the wall at
      // the end of the last walking segment.
      const paper=siteOf(state.optionId,sites).paperView;
      if(paper){const dx=paper.x-state.pose.x,dz=paper.z-state.pose.z;
        apply({lookYaw:Math.atan2(dx,-dz),lookPitch:Math.atan2(paper.y-(state.pose.feet+1.62),Math.hypot(dx,dz))});}
    }
    for(let i=0;i<5;i++)apply({dt:.2});
  }
  if(target>=3){
    if(state.optionId==='bad-bar')apply({forward:-1});
    else if(state.optionId==='fifth-chair'){for(let i=0;i<8&&state.phase!=='return';i++)apply({dt:.2,forward:-1});}
    else {
      for(const point of (siteOf(state.optionId,sites).authoredRoute||[]).slice(7)){
        for(let i=0;i<200&&state.phase!=='return'&&Math.hypot(state.pose.x-point.x,state.pose.z-point.z)>.04;i++){
          const dx=point.x-state.pose.x,dz=point.z-state.pose.z,d=Math.hypot(dx,dz);apply({dt:Math.min(.1,d/2.2),forward:1,lookYaw:Math.atan2(dx,-dz)});
        }
      }
    }
  }
  return {...conservatoryRiftFrame(state,{sites}),studyState:clone(state),studyBeat:target};
}
