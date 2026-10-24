import { ZONE } from '../data/floorplan/legend.js';
import { SOURCE_DEMOLITION as PLAN } from '../data/source-demolition.js';
import { ST_BRENDANS_PRESENCE_MESH } from '../data/st-brendans-presences.js';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number(x)||0));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a));return u*u*(3-2*u);};
const hash=(i,s=0)=>{let h=Math.imul(i+31,0x45d9f3b)^Math.imul(s+71,0x27d4eb2d);h=Math.imul(h^(h>>>16),0x45d9f3b);return((h^(h>>>16))>>>0)/4294967296;};
function multiply(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
function matrix({x=0,y=0,z=0,yaw=0,sx=1,sy=sx,sz=sx}={}){const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1]);}
function quaternionTR(p,q){
  const[x,y,z,w]=q,xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z;
  return new Float32Array([1-2*(yy+zz),2*(xy+wz),2*(xz-wy),0,2*(xy-wz),1-2*(xx+zz),2*(yz+wx),0,2*(xz+wy),2*(yz-wx),1-2*(xx+yy),0,...p,1]);
}
export function sourceDemolitionPose(track,time,sampleHz=12){
  if(!track?.translations?.length||!track?.rotations?.length)return null;
  const exact=clamp(time,0,(track.translations.length-1)/sampleHz)*sampleHz,i=Math.floor(exact),j=Math.min(i+1,track.translations.length-1),t=exact-i;
  const a=track.rotations[i],b=track.rotations[j],sign=a.reduce((v,x,k)=>v+x*b[k],0)<0?-1:1;
  const q=a.map((x,k)=>mix(x,b[k]*sign,t)),length=Math.hypot(...q)||1;
  return{translation:track.translations[i].map((x,k)=>mix(x,track.translations[j][k],t)),rotation:q.map(x=>x/length)};
}
const placed=(id,mesh,m,extra={})=>({id,mesh,matrix:m,zone:ZONE.sourceSpace,structural:true,noShadow:true,noReflection:true,sourceStructure:'source-demolition',...extra});

export function sourceDemolitionInstances(frame,{
  geometry,motion,reducedMotion=false,reducedDread=false,effectsMode='full',suppressActors=false,
}={}){
  if(!frame?.visible||!frame.anchored||frame.released||!geometry||!motion)return [];
  const origin=frame.origin,parent=matrix({...origin,yaw:PLAN.yaw}),out=[];
  const dark=effectsMode!=='off'&&!suppressActors&&frame.blackness>.99;
  if(dark){
    const p=PLAN.pocket,height=40.8,margin=.4;
    // Actual opaque geometry enclosing a finite part of the same road. This
    // does not change the camera, framebuffer exposure, floor or movement.
    // The simulation body uses cell centres while the eye may carry a small
    // walking offset. Keep its finite enclosure beyond that offset, including
    // below the unchanged support floor when looking directly down.
    const m=matrix({x:frame.roadOrigin.x,y:PLAN.floor-margin+height/2,z:frame.roadOrigin.z-(p.from+p.to)/2,
      sx:p.halfWidth*2+margin*2,sy:height,sz:p.to-p.from+margin*2});
    return[placed('source-demolition:void',geometry.darkMesh,m,{structural:false,apparitionVariant:13,sourceStructure:'source-demolition-void'})];
  }
  out.push(placed('source-demolition:retained',geometry.staticMesh,parent));
  for(const part of geometry.parts){
    // Reduced motion uses the two authored endpoints at staggered release
    // times. It retains the same losses and openings without falling motion.
    const time=!frame.committed?0:reducedMotion||effectsMode==='off'
      ?frame.elapsed>=(part.releaseTime??part.startTime+.45)+1?geometry.duration:0:Math.min(geometry.duration,frame.elapsed);
    const pose=sourceDemolitionPose(motion.tracks[part.mesh],time,geometry.sampleHz);
    if(pose)out.push(placed(`source-demolition:${part.id}`,part.mesh,multiply(parent,quaternionTR(pose.translation,pose.rotation))));
  }
  if(effectsMode==='off'||suppressActors||!frame.committed||frame.released)return out;
  const subdued=reducedMotion||reducedDread||effectsMode==='reduced';
  const emitters=geometry.emitters||[],meshes=Object.values(ST_BRENDANS_PRESENCE_MESH),count=subdued?40:96;
  const curtainCount=32,streamCount=count-curtainCount,columns=8,rows=4;
  if(!emitters.length)return out;
  for(let i=0;i<count;i++){
    const curtain=i>=streamCount,curtainIndex=i-streamCount;
    const row=curtain?Math.floor(curtainIndex/columns):0,column=curtain?curtainIndex%columns:0;
    const e=emitters[i%emitters.length],base=Math.max(PLAN.releaseFrom,e.availableAt);
    // The first four remain separate enough to read as people leaving a real
    // opening. The held bank then forms within the first release, rather than
    // waiting until the walking body has already passed a shallow curtain.
    const birth=base+(curtain?row*.10+column*.065:i<4?i*.13:hash(i,5)*(subdued?.65:1.35));
    if(frame.elapsed<birth)continue;
    const local=e.position||e.center;
    // Existing apparition meshes are authored from their feet. Put the torso,
    // rather than the feet, at the measured centre of the vacated panel.
    // Leave room behind the seated/braced knees even when their fixed travel
    // heading turns them across the recess. The measured acoustic source and
    // actual released aperture remain at the authored centre.
    const point=[local[0]-.2,local[1]-.9,local[2],1];
    const start=[0,1,2].map(r=>parent[r]*point[0]+parent[4+r]*point[1]+parent[8+r]*point[2]+parent[12+r]);
    const travel=clamp((frame.elapsed-birth)/(curtain?.58+hash(i,21)*.17:1.05+hash(i,21)*.55));
    // All destinations are fixed to the road. A head turn cannot attract,
    // rotate or restage the stream; retreat can outrun its advancing front.
    const span=PLAN.pocket.halfWidth*2,spacing=span/columns;
    // Four fixed depth bands occupy the place being lost. Alternate their
    // columns so a gap shows another held silhouette farther into the field.
    // Source-family geometry supplies the trace; no volume faces the camera.
    const across=curtain
      ?-PLAN.pocket.halfWidth+(column+.5)*spacing+(row%2?spacing*.45:0)+(hash(i,8)-.5)*.16
      :(hash(i,8)-.5)*span*.88;
    const targetX=frame.roadOrigin.x+across;
    const targetAlong=curtain
      ?PLAN.pocket.from+.6+row*(PLAN.pocket.to-PLAN.pocket.from-1.2)/(rows-1)
      :PLAN.pocket.from+2+hash(i,19)*(PLAN.pocket.to-PLAN.pocket.from-4);
    const targetZ=frame.roadOrigin.z-targetAlong;
    const groundward=curtain&&curtainIndex%4===0;
    // The pressure has no shared human foot line. Some strips rake along the
    // unseen support; others start or finish above it at unequal heights.
    const targetY=PLAN.floor+(curtain
      ?groundward?-.15+hash(i,13)*.3:-1.65+hash(i,13)*1.9
      :-.7+hash(i,13)*1.8);
    const t=reducedMotion?(travel>.55?1:0):travel;
    // Human anatomy belongs to the aperture for a fraction of a second. What
    // escapes ceases to carry a whole person: it becomes a thin, leaning plane
    // of broken pressure, with its traces passing through one another in depth.
    // Reduced motion keeps the endpoint and omits the travel/morph entirely.
    if(reducedMotion&&t===0)continue;
    const age=frame.elapsed-birth,wisp=reducedMotion?1:smooth(.09,.43,age);
    const human=.92+hash(i,12)*.20;
    const sx=mix(human,curtain?3.0+hash(i,14)*2.3:.55+hash(i,14)*.8,wisp);
    const sy=mix(human,curtain?2.1+hash(i,22)*1.4:1.5+hash(i,22)*1.6,wisp);
    const sz=mix(human,.12+hash(i,23)*.28,wisp);
    const bend=Math.sin(Math.PI*t);
    const x=mix(start[0],targetX,t)+bend*(hash(i,1)-.5)*1.4;
    const y=mix(start[1],targetY,t)+bend*(.25+hash(i,2)*.65);
    const z=mix(start[2],targetZ,t);
    const yaw=Math.atan2(targetX-start[0],-(targetZ-start[2]))+(hash(i,16)-.5)*(.38+1.1*wisp);
    const roll=wisp*(groundward?(hash(i,26)>.5?1:-1)*(1.18+hash(i,27)*.25):(hash(i,26)-.5)*1.6);
    const pitch=wisp*(hash(i,28)-.5)*(groundward?.45:1.25);
    const rx=quaternionTR([0,0,0],[Math.sin(pitch/2),0,0,Math.cos(pitch/2)]);
    const rz=quaternionTR([0,0,0],[0,0,Math.sin(roll/2),Math.cos(roll/2)]);
    const form=multiply(matrix({x,y,z,yaw}),multiply(rz,rx));
    for(let axis=0;axis<3;axis++){form[axis]*=sx;form[4+axis]*=sy;form[8+axis]*=sz;}
    form[4]+=wisp*(hash(i,24)-.5)*1.9;
    form[6]+=wisp*(hash(i,25)-.5)*1.25;
    const density=mix(.15,curtain?.72:.48,wisp)+clamp(frame.consumption)*.22;
    out.push(placed(`source-demolition:spirit-${i}`,meshes[i%meshes.length],form,{
      // The private shader treats alpha as pressure density. It tears actual
      // family geometry and never emits light or applies the lit-body tag.
      structural:false,apparitionVariant:14,emissive:[0,0,0,Math.min(.96,density)],sourceStructure:'source-demolition-spirit',
      sourceDemolitionRole:curtain?'curtain':'stream',sourceDemolitionEmitter:e.id,sourceDemolitionBirth:birth,
    }));
  }
  return out;
}

export function sourceDemolitionLights(frame){
  if(!frame?.visible||!frame.anchored||frame.blackness>.99||frame.released)return [];
  const o=frame.origin,level=frame.committed?1-.82*clamp((frame.elapsed-7.5)/8):1;
  // Two fixed work-light sources reveal the familiar fabric. Their falloff
  // collapses with the supply; no actor creates a lamp or a shadow map.
  return[
    {id:'source-demolition:work-west',kind:'fitting',x:o.x-10,y:PLAN.floor+5,z:o.z+13,color:[.63,.72,.78],intensity:8*level,radius:42,penetration:1,castsShadow:false},
    {id:'source-demolition:work-east',kind:'fitting',x:o.x+25,y:PLAN.floor+9,z:o.z+8,color:[.86,.76,.57],intensity:5*level,radius:38,penetration:1,castsShadow:false},
  ];
}
