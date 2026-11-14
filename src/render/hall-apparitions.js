import { uiDraw, uiText } from './ui.js';
import { UI_COLOR } from './palette.js';

const bounded = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const point = (x, y) => Object.freeze({x, y});

// Three bodies, three fused chairs, three targetable health pools. Seats stay
// in their original order when a listener leaves; the vacancy is evidence.
export function hallApparitionLayout(members = [], {x = 0, w = 40} = {}) {
  const count = members.length, gap = count > 1 ? Math.min(2, Math.max(0, w) / (count * 8)) : 0;
  const width = Math.max(0, (w - gap * Math.max(0, count - 1)) / Math.max(1, count));
  return members.map((member, index) => ({...member, index, x:x + index * (width + gap), w:width,
    depth:index === 0 ? .13 : index === 2 ? .07 : 0,
    heightScale:index === 0 ? .84 : index === 2 ? .91 : 1}));
}

export function hallApparitionPose(member = {}, {now = 0, reducedMotion = false, watch = 0} = {}) {
  const alive = !member.defeated;
  const motion = reducedMotion || !alive ? 0 : Math.sin(now * .78 + (member.index || 0) * 2.1);
  const attention = bounded(watch, -1, 1) * .018;
  const stoop = member.pose === 'stoop';
  const cue = member.pose === 'arm-out';
  const active = alive && member.acting;
  const guard = alive && member.parryReady;
  const reach = cue && active ? 1 : guard ? .54 : cue ? .22 : 0;
  const lean = (stoop ? .065 : 0) + (active ? .023 : 0);
  const lift = active ? -.012 : 0;
  const breath = motion * .0035;
  const head = point((stoop ? -.055 : .016) + attention + motion * .003,
    (stoop ? .235 : .155) + lift + breath);
  const neck = point(head.x - .005, head.y + .093);
  const shoulderLeft = point(-.23 + lean, .305 + lift + breath);
  const shoulderRight = point(.23 + lean, .315 + lift + breath);
  const hip = point(.015 + lean * .25, .565);
  const elbowLeft = point(stoop ? -.30 : -.27, stoop ? .49 : .465);
  const wristLeft = point(guard ? -.03 : stoop ? -.12 : -.20, guard ? .36 : .56);
  const elbowRight = point(.30 + reach * .075, .475 - reach * .13);
  const wristRight = point(.19 + reach * .37, .56 - reach * .31);
  return Object.freeze({alive, active, guard, cue, motion, reach, head, neck,
    profile:stoop?'return':cue?'cue':'witness',
    shoulderLeft, shoulderRight, hip, elbowLeft, elbowRight, wristLeft, wristRight,
    kneeLeft:point(-.205, .725), kneeRight:point(.235, .74),
    ankleLeft:point(-.22, .92), ankleRight:point(.22, .93),
    headTurn:bounded((member.pose === 'head-turn' ? -.30 : stoop ? .12 : -.12) + attention * 8, -.5, .5)});
}

function polygon(ctx, points, color) {
  if (!points.length) return;
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index][0], points[index][1]);
  ctx.closePath(); ctx.fill();
}

function bone(ctx, from, to, width, color) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.max(.0001, Math.hypot(dx, dy));
  const nx = -dy / length * width, ny = dx / length * width;
  polygon(ctx, [[from.x + nx, from.y + ny], [to.x + nx * .72, to.y + ny * .72],
    [to.x - nx * .72, to.y - ny * .72], [from.x - nx, from.y - ny]], color);
}

function chair(ctx, empty) {
  polygon(ctx, [[-.345,.235],[-.30,.205],[.29,.215],[.355,.25],[.33,.62],[-.32,.61]], '#382322');
  polygon(ctx, [[-.28,.26],[.26,.27],[.28,.565],[-.27,.56]], '#241d1e');
  polygon(ctx, [[-.235,.28],[.225,.29],[.245,.55],[-.235,.54]], empty ? '#271d1c' : '#332528');
  polygon(ctx, [[-.35,.56],[.31,.57],[.37,.655],[-.29,.65]], '#342624');
  polygon(ctx, [[-.29,.58],[.29,.59],[.30,.62],[-.27,.62]], '#4a3535');
  polygon(ctx, [[-.31,.62],[-.25,.64],[-.28,.965],[-.325,.965]], '#302b27');
  polygon(ctx, [[.29,.63],[.345,.64],[.31,.975],[.267,.97]], '#302b27');
  polygon(ctx, [[-.37,.43],[-.31,.43],[-.29,.61],[-.345,.61]], '#4b3b31');
  polygon(ctx, [[.325,.445],[.38,.45],[.35,.64],[.295,.63]], '#4b3b31');
  bone(ctx, point(-.31,.26), point(-.32,.55), .007, '#76695a');
  bone(ctx, point(.32,.28), point(.325,.56), .007, '#76695a');
  if (empty) polygon(ctx, [[-.18,.36],[-.045,.41],[.06,.52],[.19,.58],[.14,.67],[-.12,.60],[-.19,.47]], '#151b1b');
}

function hand(ctx, wrist, outward, raised) {
  const sign = outward < 0 ? -1 : 1;
  polygon(ctx, [[wrist.x-.036,wrist.y-.017],[wrist.x+.025,wrist.y-.024],
    [wrist.x+.042,wrist.y+.019],[wrist.x-.024,wrist.y+.029]], '#a5a89b');
  for (let finger = 0; finger < 4; finger++) {
    const start = point(wrist.x + sign * (.005 + finger * .011), wrist.y - .012 + finger * .006);
    const end = point(start.x + sign * (.022 + finger * .003), start.y - (raised ? .052 - finger * .006 : -.018));
    bone(ctx, start, end, .0045, finger % 2 ? '#8a9085' : '#b8bcad');
  }
  bone(ctx, point(wrist.x-.02,wrist.y+.005), point(wrist.x-.052,wrist.y+.025), .008, '#858d82');
}

function head(ctx, pose) {
  const {x, y} = pose.head, turn = pose.headTurn;
  const width=pose.profile==='cue'?.079:pose.profile==='return'?.103:.089;
  ctx.fillStyle = '#b6bcad'; ctx.beginPath();
  ctx.moveTo(x-width,y-.043);
  ctx.bezierCurveTo(x-width,y-.111,x+width*.80,y-.118,x+width,y-.044);
  ctx.bezierCurveTo(x+width*1.05,y+.011,x+width*.68,y+.071,x+.014,y+.082);
  ctx.bezierCurveTo(x-.037,y+.072,x-width*.89,y+.027,x-width,y-.043);
  ctx.closePath(); ctx.fill();
  polygon(ctx, [[x+.004,y-.097],[x+width*.86,y-.060],[x+width,y-.008],[x+.050,y+.061],
    [x+.012,y+.078],[x+.020,y+.009]], '#717e75');
  ctx.fillStyle = pose.profile==='return'?'#626c67':'#1b2424'; ctx.beginPath(); ctx.moveTo(x-width,y-.035);
  if(pose.profile==='witness'){
    ctx.bezierCurveTo(x-width*1.10,y-.103,x+width*.84,y-.115,x+width,y-.037);
    ctx.lineTo(x+width*.76,y-.043);
    ctx.bezierCurveTo(x+.035,y-.094,x-.035,y-.090,x-width*.74,y-.038);
  }else{
    ctx.bezierCurveTo(x-width*1.25,y-.115,x+width*.81,y-.138,x+width*1.02,y-.037);
    ctx.bezierCurveTo(x+.028,y-.086,x-.048,y-.056,x-width,y-.035);
  }
  ctx.closePath(); ctx.fill();
  if(pose.profile==='return'){
    polygon(ctx,[[x-width,y-.035],[x-width*1.13,y+.058],[x-.070,y+.099],[x-.065,y+.010]],'#515d57');
    polygon(ctx,[[x+width*.87,y-.040],[x+width*1.10,y+.064],[x+.057,y+.095],[x+.069,y+.005]],'#414e48');
  }
  const eyeX = x + turn * .07;
  bone(ctx, point(eyeX-.053,y-.006), point(eyeX-.009,y-.010), .008, '#202d2a');
  bone(ctx, point(eyeX+.010,y-.012), point(eyeX+.039,y-.005), .006, '#27352f');
  bone(ctx, point(eyeX-.050,y+.012), point(eyeX-.021,y+.019), .003, '#7f8c7c');
  polygon(ctx, [[eyeX+.015,y-.012],[eyeX+.041,y+.025],[eyeX+.010,y+.030]], '#59695f');
  polygon(ctx,[[eyeX-.022,y+.047],[eyeX+.022,y+.044],[eyeX+.014,y+.055],[eyeX-.016,y+.055]],'#45564d');
  bone(ctx, point(x-width*.84,y-.002), point(x-width*.69,y+.035), .009, '#7e8d7f');
  if(pose.profile==='witness'){
    bone(ctx,point(x-.045,y-.046),point(x+.033,y-.049),.002,'#8c9988');
    bone(ctx,point(x-.045,y-.034),point(x+.025,y-.037),.002,'#8c9988');
  }
}

function person(ctx, pose) {
  if (!pose.alive) return;
  const cloth=pose.profile==='return'?['#222a30','#344149','#4c585a']
    :pose.profile==='cue'?['#292925','#3d3c34','#5c5c4e']:['#1b2525','#303b38','#47564d'];
  const leftHip = point(pose.hip.x-.13,pose.hip.y), rightHip = point(pose.hip.x+.13,pose.hip.y);
  bone(ctx, leftHip, pose.kneeLeft, .09, cloth[0]);
  bone(ctx, rightHip, pose.kneeRight, .09, cloth[1]);
  bone(ctx, pose.kneeLeft, pose.ankleLeft, .053, '#192525');
  bone(ctx, pose.kneeRight, pose.ankleRight, .054, '#273431');
  polygon(ctx, [[-.265,.89],[-.18,.90],[-.13,.955],[-.305,.965],[-.32,.944]], '#0d1717');
  polygon(ctx, [[.17,.90],[.25,.91],[.32,.955],[.315,.977],[.16,.967]], '#101b1a');
  const a=pose.shoulderLeft,b=pose.shoulderRight,n=pose.neck;
  polygon(ctx, [[a.x,a.y],[n.x-.045,n.y],[n.x+.045,n.y],[b.x,b.y],
    [pose.hip.x+.17,pose.hip.y],[pose.hip.x+.03,pose.hip.y+.035],
    [pose.hip.x-.17,pose.hip.y]], cloth[1]);
  polygon(ctx, [[a.x,a.y],[n.x-.045,n.y],[pose.hip.x-.012,pose.hip.y+.015],
    [pose.hip.x-.17,pose.hip.y]], cloth[0]);
  polygon(ctx, [[n.x-.045,n.y],[n.x+.048,n.y],[pose.hip.x+.032,.46]], '#9aab99');
  if(pose.profile==='return'){
    polygon(ctx,[[n.x-.085,n.y+.005],[n.x+.070,n.y+.012],[pose.hip.x+.065,.46],
      [pose.hip.x+.005,.50],[n.x-.023,n.y+.058]],'#685e51');
    polygon(ctx,[[pose.hip.x-.13,.54],[pose.hip.x+.15,.55],[.31,.79],[-.29,.78]],cloth[0]);
  }else polygon(ctx, [[n.x-.025,n.y+.025],[n.x+.016,n.y+.028],[pose.hip.x+.02,.42],
    [pose.hip.x-.007,.45]], '#303d34');
  bone(ctx, pose.neck, pose.head, .036, '#8d9c8c');
  bone(ctx, pose.shoulderLeft, pose.elbowLeft, .055, cloth[0]);
  bone(ctx, pose.elbowLeft, pose.wristLeft, .044, cloth[1]);
  bone(ctx, pose.shoulderRight, pose.elbowRight, .057, cloth[1]);
  bone(ctx, pose.elbowRight, pose.wristRight, .042, cloth[2]);
  hand(ctx, pose.wristLeft, -1, pose.guard);
  hand(ctx, pose.wristRight, 1, pose.reach>.5);
  // Wood continues through cloth at the wrists and spine. It is a chair that
  // cannot be put down, rather than a separate prop floating behind the body.
  bone(ctx, point(-.325,.47), pose.wristLeft, .013, '#6b6350');
  bone(ctx, point(.33,.49), point(pose.hip.x+.13,.55), .014, '#6b6350');
  head(ctx, pose);
}

export function paintHallApparitions(ctx, roster, {x=0,y=0,w=400,h=180,now=0,
  reducedMotion=false,watch=0,dim=1}={}) {
  if (!roster?.members?.length || !(w>0) || !(h>0)) return [];
  const members=hallApparitionLayout(roster.members,{x,w});
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  for (const member of members) {
    const pose=hallApparitionPose(member,{now,reducedMotion,watch});
    const figureH=h*member.heightScale*.94,figureW=Math.min(member.w*.70,figureH*.67);
    const cx=member.x+member.w*.5,top=y+h*member.depth;
    const floorY=Math.min(y+h-1,top+figureH*.965);
    const tone=member.acting?UI_COLOR.danger:member.parryReady?UI_COLOR.blue:member.targeted?UI_COLOR.amber:UI_COLOR.secondary;
    ctx.globalAlpha=bounded(dim,0,1)*(member.defeated?.42:.82);
    ctx.fillStyle='#080d0d';ctx.beginPath();ctx.ellipse(cx,floorY,figureW*.52,Math.max(1,h*.024),0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#435046';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(member.x+member.w*.08,floorY+2);ctx.lineTo(member.x+member.w*.91,floorY-2);ctx.stroke();
    ctx.save();ctx.translate(cx,top);ctx.scale(figureW,figureH);chair(ctx,member.defeated);person(ctx,pose);ctx.restore();
    if (member.primary || member.acting || member.parryReady) {
      const reach=member.w*.29,depth=Math.max(2,h*.045);
      ctx.globalAlpha=bounded(dim,0,1)*(member.acting?1:.86);ctx.strokeStyle=tone;ctx.lineWidth=member.acting?2:1;
      ctx.beginPath();ctx.moveTo(cx-reach,floorY-depth);ctx.lineTo(cx-reach,floorY+depth*.3);
      ctx.lineTo(cx+reach,floorY+depth*.3);ctx.lineTo(cx+reach,floorY-depth);ctx.stroke();
    }
  }
  ctx.restore();
  return members;
}

export function drawHallApparitions(roster, {x=0,y=0,w=40,h=8,now=0,reducedMotion=false,watch=0,dim=1,captions=true}={}) {
  if (!roster?.members?.length || !(w>0) || !(h>0)) return;
  const captionRows=captions?(h>=5?1.75:1.35):0,artH=captions?Math.max(.8,h-captionRows):h;
  uiDraw(({ctx,dpr,cellW,cellH})=>paintHallApparitions(ctx,roster,{x:x*cellW*dpr,y:y*cellH*dpr,
    w:w*cellW*dpr,h:artH*cellH*dpr,now,reducedMotion,watch,dim}));
  if(!captions)return;
  for (const member of hallApparitionLayout(roster.members,{x,w})) {
    const role=member.defeated?'ui-secondary':member.acting?'ui-danger':member.parryReady?'ui-blue':member.targeted?'ui-amber':'ui-primary';
    const number=String(member.label||'').match(/\d+$/)?.[0]||String(member.index+1).padStart(2,'0');
    const width=Math.max(1,Math.floor(member.w-.6));
    const identity=`${member.primary?'▸ ':''}${number} ${member.seat||''}`;
    const state=member.defeated?'RELEASED':member.acting?'ACTING':member.parryReady?'PARRY READY':`${member.health}/${member.maxHealth}`;
    uiText(member.x+.3,y+artH+.08,identity.slice(0,width),role,dim*(member.defeated?.45:.88));
    uiText(member.x+.3,y+artH+.87,state.slice(0,width),role,dim*(member.defeated?.35:.74));
  }
}
