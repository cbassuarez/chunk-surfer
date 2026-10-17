// A finite correction to the existing contact performances. Five rest-bound
// bodies supply the tissue; this is the sole owner of permanent joint origins
// and the force travelling through them. No separate clock, seed, or root.
import { BUS_WOMAN_RIG } from '../data/bus-woman-rig.js';
import { busWomanWrongOriginReturn } from '../data/bus-woman-wrong-origin.js';
import { BUS_WOMAN_CLIPS, busWomanPose, busWomanDescriptor } from './bus-woman-performance.js';

const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0));
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, n) => a.map(v => v * n);
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const unit = a => mul(a, 1 / (Math.hypot(...a) || 1));
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const qmul = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const inverse = q => [-q[0], -q[1], -q[2], q[3]];
const axis = (v, angle) => [...mul(unit(v), Math.sin(angle / 2)), Math.cos(angle / 2)];
const rotate = (v, q) => { const t = mul(cross(q.slice(0, 3), v), 2); return add(v, add(mul(t, q[3]), cross(q.slice(0, 3), t))); };
const qmix = (a, b, t) => unit(a.map((v, i) => v + ((dot(a, b) < 0 ? -b[i] : b[i]) - v) * t));
const between = (a, b) => { a = unit(a); b = unit(b); const d = dot(a, b); return d < -.99999 ? [...unit(cross(a, Math.abs(a[0]) < .8 ? [1,0,0] : [0,1,0])), 0] : unit([...cross(a,b), 1+d]); };
const ease = t => { t = clamp(t); return t*t*(3-2*t); };
const ramp = (t, a, b) => ease((t-a)/(b-a));
const pulse = (t, a, peak, release) => ramp(t, a, peak) * (1-ramp(t, peak, release));
const bones = new Map(BUS_WOMAN_RIG.map(bone => [bone.name, bone]));
const bone = name => bones.get(name);
const point = (joint, name, p) => add(joint.translation, rotate(sub(p, bone(name).head), joint.rotation));

function curve(t, keys) {
  for (let i=1; i<keys.length; i++) if (t <= keys[i][0]) {
    const [a, v] = keys[i-1], [b, w] = keys[i];
    return v + (w-v) * ease((t-a)/(b-a));
  }
  return keys.at(-1)[1];
}

/** Clock time and clip time stay distinct: the actor can stop and try again. */
export function busWomanWrongOriginFrame(mode = 'wait', seconds = 0, options = {}) {
  if (!Object.hasOwn(BUS_WOMAN_CLIPS, mode)) throw new Error('Unknown bus woman performance '+mode);
  const remembered = busWomanWrongOriginReturn(options.stretch ?? options.repeat);
  const secondsClamped = clamp(seconds, 0, BUS_WOMAN_CLIPS[mode]);
  const t = secondsClamped, r = remembered.restraint;
  let time = t, guarding = .10*r, chosen = 'supported', authoredSearch;
  if (mode === 'search') {
    // One interrupted closure, one reduced retry, then a real withdrawal.
    const attempt = curve(t, [[0,0],[.34,.34],[.68,.68],[.98,.68],[1.24,.94],[1.44,.78],[1.72,.99],[2.05,1.75],[2.4,2.4],[2.7,2.7],[6,6]]);
    time = t + (attempt-t)*r;
    guarding += r*pulse(t,.20,.72,2.45);
    chosen = t<.68?'test':t<.98?'stop':t<1.44?'retry':t<2.4?'withdraw':'spare-hand';
    if(remembered.stage>=3){
      // The second reach is physically smaller, rather than a time warp that
      // crosses the original full insertion on its way to the clip endpoint.
      const retry=.72-(remembered.stage-3)*.08;
      const reach=curve(t,[[0,0],[.20,0],[.68,1],[1.28,1],[1.72,.25],[1.98,.25],[2.45,retry],[2.78,retry],[3.55,0],[6,0]]);
      authoredSearch={rightSearch:reach,leftSearch:0,rightInsert:0,leftInsert:0,lean:.009+.022*reach,headYaw:.035*reach};
      time=t;
      guarding=r*curve(t,[[0,.10],[.20,.85],[.68,.95],[1.28,.95],[1.72,1],[1.98,1],[2.45,.75],[2.78,.75],[3.55,.10],[6,.10]]);
      chosen=t<.20?'brace-before-hand':t<.68?'test':t<1.28?'stop':t<1.72?'protective-withdrawal':t<1.98?'counterbrace':t<2.45?'smaller-retry':t<2.78?'small-hold':t<3.55?'withdraw':'spare-hand';
    }
  } else if (mode === 'receive') {
    // Hesitation is before the single paper becomes visible. Store/release
    // thresholds stay .90 and 2.95 seconds, matching the simulation's receipt.
    const careful = curve(t, [[0,0],[.22,.22],[.43,.22],[.9,.9],[1.45,1.45],[2.45,2.45],[2.95,2.95],[4,4]]);
    time = t<.9 ? t+(careful-t)*r : t;
    guarding += r*pulse(t,0,.42,1.6);
    chosen = t<.43?'prepare':t<.9?'accept':t<2.95?'carry-carefully':'release';
  } else if (mode === 'ready') {
    const careful = curve(t, [[0,0],[.18,.18],[.32,.18],[.55,.55],[2,2]]);
    time = t<.55 ? t+(careful-t)*r : t;
    guarding += r*pulse(t,0,.30,1.3);
    chosen = t<.55?'prepare':t<1.2?'draw':'spare-fingers';
  } else if (mode.startsWith('acknowledge')) {
    const careful = curve(t, [[0,0],[.26,.26],[.55,.38],[.94,.38],[1.6,1.5],[2.4,2.4]]);
    time = t+(careful-t)*r;
    guarding += r*pulse(t,0,.48,1.8);
    chosen = t<.48?'brace-before-look':t<.94?'stop':'smaller-look';
  } else if (mode.startsWith('step')) {
    // Foot timing is sacred: navigation already supplies the supported 18 cm.
    guarding += r*pulse(t,0,.18,.8);
    chosen = 'guard-through-supported-step';
  }
  const handTest = !options.reducedMotion && options.aboard && remembered.stretch===1 && mode==='wait'
    ? pulse(t,.35,.95,1.45)+.35*pulse(t,1.8,2.15,2.6) : 0;
  const handLook = !options.reducedMotion && options.aboard && remembered.stretch===1 && mode==='wait'
    ? pulse(t,.45,1.25,2.6) : 0;
  if(handTest>0)chosen=t<1.45?'unexpected-hand-test':'smaller-hand-test';
  const breath = options.reducedMotion ? 0 : .003*remembered.transmission
    *curve(t, [[0,0],[.45,.35],[1.15,0],[1.65,.8],[2.45,.12],[4,0],[6,0]])
    *(1-ramp(t,BUS_WOMAN_CLIPS[mode]-.3,BUS_WOMAN_CLIPS[mode]));
  if (options.reducedMotion) { time=t; guarding=.10*r; chosen='supported-hold'; authoredSearch=undefined; }
  return { remembered, mode, seconds:t, time, guarding, breath, chosen, handTest, handLook, authoredSearch };
}

function braceShoulder(pose, load, guarding, remembered) {
  const upper = bone('upperarm_R'), lower = bone('forearm_R');
  const source = pose.joints.upperarm_R.translation;
  const wrist = pose.joints.hand_R.translation;
  const bodyRotation=pose.joints.spine_upper.rotation;
  const origin=rotate(remembered.origin.shoulder,bodyRotation);
  const late=remembered.stage>=3;
  const pull=unit(sub(wrist,add(source,origin)));
  const dynamic=late ? add(mul(pull,.024*load),rotate([-.005*guarding,.018*guarding,.006*guarding],bodyRotation))
    : [.014*load, -.011*load+.008*guarding, -.008*load+.010*guarding];
  const shoulder=add(add(source,origin),dynamic);
  const first = Math.hypot(...sub(upper.tail,upper.head)), second = Math.hypot(...sub(lower.tail,lower.head));
  const direction = unit(sub(wrist,shoulder));
  const distance = clamp(Math.hypot(...sub(wrist,shoulder)),Math.abs(first-second)+1e-7,first+second-1e-7);
  const along = (first*first-second*second+distance*distance)/(2*distance);
  const pole = [.85,-.30,-.16], side = unit(sub(pole,mul(direction,dot(pole,direction))));
  const elbow = add(add(shoulder,mul(direction,along)),mul(side,Math.sqrt(Math.max(0,first*first-along*along))));
  const end = add(shoulder,mul(direction,distance));
  pose.joints.upperarm_R = { translation:shoulder, rotation:between(sub(upper.tail,upper.head),sub(elbow,shoulder)) };
  pose.joints.forearm_R = { translation:elbow, rotation:between(sub(lower.tail,lower.head),sub(end,elbow)) };
  const clavicle = bone('clavicle_R'), at=pose.joints.clavicle_R.translation;
  pose.joints.clavicle_R.rotation = between(sub(clavicle.tail,clavicle.head),sub(shoulder,at));
  const hand = pose.contacts.find(contact=>contact.kind==='hand'&&contact.side==='R');
  Object.assign(hand,{shoulder,elbow,error:Math.hypot(...sub(end,wrist))});
  return {source,origin: add(source,origin),shoulder,elbow,wrist};
}

function spareFingers(pose, release) {
  const hand = pose.joints.hand_R;
  for (const finger of ['middle','ring','little']) {
    let next = point(hand,'hand_R',bone(finger+'_R').head);
    for (const suffix of ['','_mid','_tip']) {
      const name=finger+suffix+'_R', b=bone(name), rotation=qmix(pose.joints[name].rotation,hand.rotation,release);
      pose.joints[name]={translation:next,rotation};
      next=add(next,rotate(sub(b.tail,b.head),rotation));
    }
    const contact=pose.contacts.find(c=>c.kind==='finger'&&c.side==='R'&&c.finger===finger);
    Object.assign(contact,{target:next,point:next,error:0});
  }
}

function testHand(pose, amount) {
  if(!amount)return;
  const hand=pose.joints.hand_R;
  const index=bone('index_tip_R'),axisDirection=sub(index.tail,bone('hand_R').head);
  const across=sub(bone('little_R').head,bone('index_R').head),normal=unit(cross(axisDirection,across));
  const bend=rotate(unit(cross(axisDirection,normal)),hand.rotation);
  for(const finger of ['thumb','index','middle','ring','little']){
    let next=point(hand,'hand_R',bone(finger+'_R').head);
    for(const [segment,suffix] of ['', '_mid','_tip'].entries()){
      const name=finger+suffix+'_R',b=bone(name),scale=finger==='thumb'?.45:1;
      const rotation=qmul(axis(bend,amount*[.16,.25,.15][segment]*scale),pose.joints[name].rotation);
      pose.joints[name]={translation:next,rotation};next=add(next,rotate(sub(b.tail,b.head),rotation));
    }
    Object.assign(pose.contacts.find(c=>c.kind==='finger'&&c.side==='R'&&c.finger===finger),{target:next,point:next,error:0});
  }
}

function supportedLowerBody(pose, seconds) {
  if (seconds == null || pose.mode.startsWith('step')) return;
  const step=busWomanPose('step',seconds), progress=step.frame.stepProgress;
  // The ordinary gait's small vertical load transfer carries torso, real
  // pockets and both attachments together. Only the feet resist the saved
  // horizontal root advance; a receipt can therefore continue during a step.
  const shift=[0,-.027*Math.sin(Math.PI*progress),0];
  for(const joint of Object.values(pose.joints))joint.translation=add(joint.translation,shift);
  for(const contact of pose.contacts)for(const key of ['target','point','shoulder','elbow'])if(contact[key])contact[key]=add(contact[key],shift);
  for(const attachment of Object.values(pose.attachments))for(const key of ['translation','grip'])attachment[key]=add(attachment[key],shift);
  for(const [side,s] of [['L',-1],['R',1]]){
    const thigh=bone('thigh_'+side),shin=bone('shin_'+side),foot=bone('foot_'+side),toe=bone('toe_'+side);
    const hip=pose.joints[thigh.name].translation,target=step.joints[foot.name].translation;
    const first=Math.hypot(...sub(thigh.tail,thigh.head)),second=Math.hypot(...sub(shin.tail,shin.head));
    const distance=clamp(Math.hypot(...sub(target,hip)),Math.abs(first-second)+1e-7,first+second-1e-7),direction=unit(sub(target,hip));
    const along=(first*first-second*second+distance*distance)/(2*distance),pole=[s*.12,0,-1];
    const sideward=unit(sub(pole,mul(direction,dot(pole,direction))));
    const knee=add(add(hip,mul(direction,along)),mul(sideward,Math.sqrt(Math.max(0,first*first-along*along))));
    const ankle=add(hip,mul(direction,distance));
    pose.joints[thigh.name]={translation:hip,rotation:between(sub(thigh.tail,thigh.head),sub(knee,hip))};
    pose.joints[shin.name]={translation:knee,rotation:between(sub(shin.tail,shin.head),sub(ankle,knee))};
    pose.joints[foot.name]={translation:ankle,rotation:[0,0,0,1]};
    pose.joints[toe.name]={translation:add(toe.head,sub(ankle,foot.head)),rotation:[0,0,0,1]};
    Object.assign(pose.contacts.find(c=>c.kind==='foot'&&c.side===side),{target,point:ankle,error:Math.hypot(...sub(ankle,target))});
  }
}

function receiveEntry(pose, authored, options) {
  const from=options.receiveFrom;
  if (pose.mode!=='receive' || authored.seconds>=.43-1e-9 || options.reducedMotion
    || !['acknowledge','step'].includes(from?.mode)) return;
  const prior=busWomanWrongOriginPose(from.mode,from.seconds+authored.seconds,{
    stretch:options.stretch ?? options.repeat,acknowledgeYaw:options.acknowledgeYaw,
    supportStepSeconds:options.supportStepSeconds,
  });
  const weight=ease(authored.seconds/.43);
  // The useful hand, real pocket and both accessories keep their exact receive
  // path. Only the previous gaze yields into the anticipatory .43s brace.
  for(const name of ['neck','head','jaw']){
    const current=pose.joints[name],before=prior.joints[name];
    current.translation=before.translation.map((v,i)=>v+(current.translation[i]-v)*weight);
    current.rotation=qmix(before.rotation,current.rotation,weight);
  }
}

/** The pose remains useful: thumb/index, real pocket, paper, bag and feet survive. */
export function busWomanWrongOriginPose(mode = 'wait', seconds = 0, options = {}) {
  const authored = busWomanWrongOriginFrame(mode,seconds,options), { remembered, time, guarding, breath, handTest, handLook }=authored;
  const yaw = (options.acknowledgeYaw ?? .26)*(1-remembered.restraint*.28);
  const pose = busWomanPose(mode,time,{...options,acknowledgeYaw:yaw,authoredSearch:authored.authoredSearch});
  supportedLowerBody(pose,options.supportStepSeconds);
  testHand(pose,handTest);
  if (remembered.transmission===0) {
    receiveEntry(pose,authored,options);
    return {...pose,wrongOrigin:{...authored,load:0,contraction:0}};
  }
  const grip = pose.contacts.find(c=>c.kind==='hand'&&c.side==='R').pinch;
  const look = mode.startsWith('acknowledge')||mode.startsWith('step') ? Math.abs(pose.frame.headYaw)/.6 : 0;
  // Active squeeze relaxes into a maintained two-finger contact; turning the
  // other end of the same route also draws on it. Never an unrelated twitch.
  const late=remembered.stage>=3;
  // Paper gives the action a purpose. Maintaining its exact thumb/index pinch
  // does not require repeating the fruitless search's whole-hand contraction.
  const paper=mode==='receive'||mode==='ready'||mode==='ticket-wait'||mode.endsWith('-ticket');
  const paperEconomy=late&&paper ? (mode==='receive' ? 1-.66*ramp(time,.20,.84) : .34) : 1;
  const contraction = grip*(1-remembered.restraint*.62)*paperEconomy+handTest;
  const load = options.reducedMotion ? remembered.transmission*.08 : remembered.transmission*clamp(contraction+look*.70-guarding*.18);
  const chest=pose.joints.chest,neck=pose.joints.neck,head=pose.joints.head,jaw=pose.joints.jaw;
  const chestTurn=qmul(axis([0,0,1],late?-.115*load+.035*guarding:-.055*load),axis([1,0,0],breath));
  chest.rotation=qmul(chest.rotation,chestTurn);
  const towardHand=unit(sub(pose.joints.hand_R.translation,neck.translation));
  const neckShift=late?add(mul(towardHand,.020*load),[-.006*guarding,.004*guarding,.004*guarding]):[.009*load-.003*guarding,-.004*load+.002*guarding,-.009*load+.002*guarding];
  const neckTurn=qmul(qmul(axis([0,0,1],(late?-.18:-.10)*load+(late?.065:.035)*guarding),axis([1,0,0],.06*load-.025*guarding-.13*handLook)),axis([0,1,0],-.05*handLook));
  const headTurn=qmul(neckTurn,axis([1,0,0],-.17*handLook));
  const headBefore=[...head.translation],headShift=add(neckShift,sub(rotate(sub(head.translation,neck.translation),neckTurn),sub(head.translation,neck.translation)));
  neck.translation=add(neck.translation,neckShift);neck.rotation=qmul(neck.rotation,neckTurn);
  head.translation=add(head.translation,headShift);head.rotation=qmul(head.rotation,headTurn);
  const jawLoad=load*remembered.jaw;
  const jawOrigin=rotate(remembered.origin.jaw,head.rotation);
  const jawTraction=late?mul(unit(sub(pose.joints.hand_R.translation,jaw.translation)),Math.min(.020,.035*jawLoad)):[.017*jawLoad,-.022*jawLoad,-.008*jawLoad];
  jaw.translation=add(add(add(head.translation,rotate(sub(jaw.translation,headBefore),headTurn)),jawOrigin),jawTraction);
  jaw.rotation=qmul(qmul(jaw.rotation,headTurn),qmul(axis([0,0,1],(late?-.20:-.16)*jawLoad),axis([1,0,0],(late?.025:.07)*jawLoad)));
  const shoulder=braceShoulder(pose,load,guarding,remembered);
  spareFingers(pose,remembered.restraint*grip*.82);
  receiveEntry(pose,authored,options);
  return {...pose,wrongOrigin:{...authored,load,contraction,paperEconomy,shoulderOrigin:shoulder.origin,jawOrigin,jawTraction}};
}

/** character-asset applies additive local translations and post rotations.
 * Canonical bus-woman joints are flat under an identity root, so absolute-rest
 * deltas preserve the independently solved contacts in every render pass. */
export function busWomanWrongOriginDescriptor(mode = 'wait', seconds = 0, options = {}) {
  const authored=busWomanWrongOriginFrame(mode,seconds,options);
  if (authored.remembered.transmission===0 && options.supportStepSeconds==null && !options.receiveFrom) return busWomanDescriptor(mode,authored.time,options);
  const original=busWomanPose(mode,authored.time),changed=busWomanWrongOriginPose(mode,seconds,options),joints={};
  const delta=(a,b)=>({translation:sub(b.translation,a.translation),rotation:qmul(inverse(a.rotation),b.rotation)});
  for(const name of Object.keys(original.joints))joints['bus_woman_'+name]=delta(original.joints[name],changed.joints[name]);
  for(const name of ['bag','ticket'])joints['bus_woman_'+name+'_joint']=delta(original.attachments[name],changed.attachments[name]);
  return {clip:'bus_woman_'+mode.replaceAll('-','_'),time:authored.time,loop:false,joints};
}
