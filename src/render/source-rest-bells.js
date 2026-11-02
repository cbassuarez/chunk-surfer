import {sourceRestJudgmentFrame} from '../game/source-rest-judgment.js';
import {SOURCE_REST_FUNERAL_BELLS} from '../game/source-rest-funeral-director.js';
const box=(a,b,c,d,e,f)=>({p:[a,c,e,b,c,e,b,c,f,a,c,f,a,d,e,b,d,e,b,d,f,a,d,f],i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]});
function join(pieces){const p=[],i=[];for(const g of pieces){const offset=p.length/3;p.push(...g.p);i.push(...g.i.map(n=>n+offset));}return{p,i};}
function lathe(profile,segments=40){
  const p=[],i=[];for(const[r,y]of profile)for(let n=0;n<segments;n++){const a=n/segments*Math.PI*2;p.push(Math.cos(a)*r,y,Math.sin(a)*r);}
  for(let row=0;row<profile.length;row++)for(let n=0;n<segments;n++){
    const a=row*segments+n,b=row*segments+(n+1)%segments,c=((row+1)%profile.length)*segments+n,d=((row+1)%profile.length)*segments+(n+1)%segments;
    i.push(a,b,c,b,d,c);
  }return{p,i};
}
// A continuous outer waist, turned lip and inner sound bow. The mouth is a
// real open cavity, not a capped stack of cylinders or a painted black disc.
const bell=lathe([[.14,-.06],[.28,-.16],[.34,-.29],[.36,-.48],[.40,-.72],[.49,-.99],[.65,-1.25],[.78,-1.37],
  [.80,-1.43],[.77,-1.48],[.69,-1.46],[.65,-1.35],[.55,-1.20],[.42,-.94],[.33,-.66],[.29,-.34],[.23,-.22],[.10,-.16]]);
const clapper=lathe([[.026,-.13],[.026,-1.15],[.11,-1.20],[.15,-1.30],[.12,-1.40],[.055,-1.43],[.025,-1.35]],16);
const frame=join([box(-1.03,-.88,-4.05,.26,-.21,.21),box(.88,1.03,-4.05,.26,-.21,.21),
  box(-1.13,1.13,.12,.32,-.24,.24),box(-1.13,1.13,-3.95,-3.75,-.28,.28),
  box(-1.30,-.72,-4.17,-4.04,-.42,.42),box(.72,1.30,-4.17,-4.04,-.42,.42)]);
const yoke=join([box(-.93,.93,-.06,.11,-.10,.10),box(-.98,-.82,-.12,.17,-.22,.22),box(.82,.98,-.12,.17,-.22,.22)]);
const bronze={material:'worn-metal',base:[.38,.26,.11,1],roughness:.63};
export function sourceRestBellGeometryLibrary(){return{
  'rest-judgment-bell':{...bell,...bronze},
  'rest-judgment-clapper':{...clapper,material:'steel',base:[.12,.15,.14,1],roughness:.78},
  'rest-judgment-frame':{...frame,material:'dark-metal',base:[.055,.075,.070,1],roughness:.9},
  'rest-judgment-yoke':{...yoke,material:'wood',base:[.20,.145,.08,1],roughness:1},
  // A leather pad sits on one face of the clapper ball. It remains fitted on
  // both open and muffled contacts, rather than appearing with each soft hit.
  'rest-judgment-muffle':{...box(-.13,.13,-1.405,-1.18,.115,.19),material:'leather',base:[.105,.070,.045,1],roughness:1},
};}
function pivot(position,angle,scale,yaw=0){const c=Math.cos(angle),s=Math.sin(angle),cy=Math.cos(yaw),sy=Math.sin(yaw);return[
  cy*scale,0,sy*scale,0,-sy*s*scale,c*scale,cy*s*scale,0,-sy*c*scale,-s*scale,cy*c*scale,0,position.x,position.y,position.z,1];}
export function sourceRestBellProps(state,{reducedMotion=false}={}){
  if(!['wrong-return','catch'].includes(state.phase)||(state.chartId??0)!==0)return[];
  const v=state.sourceRestView||{},shared=v.weatherCue?.funeral,
    funeral=shared?.phase===state.phase?shared:null,physical=!!funeral||state.phase==='catch',
    cue=funeral||(state.phase==='wrong-return'?(v.weatherCue?.judgment||sourceRestJudgmentFrame({clock:v.audibleSeconds??v.musicTime??0,progress:v.degradation,reducedMotion}))
      :{bells:SOURCE_REST_FUNERAL_BELLS.catch}),factor=funeral&&reducedMotion?.24:1;
  return cue.bells.flatMap(bell=>['frame','yoke','bell','clapper',...(physical?['muffle']:[])].map(part=>{
    const swing=(Number(bell.angle)||0)*factor,clap=(Number(bell.clapperAngle)||0)*factor,
      angle=part==='bell'||part==='yoke'?swing:part==='clapper'||part==='muffle'?swing+clap:0,m=pivot(bell.position,angle,bell.scale,bell.yaw);
    return{id:`${bell.id}-${part}`,mesh:'rest-judgment-'+part,matrix:m,x:m[12],y:m[13],z:m[14],
      kind:'rest-bell',bellId:bell.id,bellPart:part,chartId:0,decorative:true,structural:false,noShadow:false,cullRadius:7,
      funeral:physical,strikeId:bell.lastStrikeId||null,contact:bell.impact||0,muffled:part==='muffle'};
  }));
}
