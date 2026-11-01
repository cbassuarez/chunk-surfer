import {SOURCE_REST_SEATS} from './source-rest-seat.js';
import {freshStorm,forceStrike,stormFlash} from './storm.js';
import {makeChannel} from '../audio/thunder-channel.js';
const seat=SOURCE_REST_SEATS[0],unit=n=>Math.max(0,Math.min(1,Number(n)||0));
export const SOURCE_REST_BELLS=Object.freeze([
  {id:'rest-bell-left',sample:'04',note:'D4',frequency:293.6647679174076,audioUrl:'audio/source-rest/bells/rest-bell-d4.wav',audioSeconds:20,position:{x:seat.x-11,y:seat.feet+4.8,z:seat.z-4.4},scale:1.15},
  {id:'rest-bell-right',sample:'06',note:'A3',frequency:220,audioUrl:'audio/source-rest/bells/rest-bell-a3.wav',audioSeconds:20,position:{x:seat.x-12.2,y:seat.feet+5.2,z:seat.z+4.4},scale:1.30},
  {id:'rest-bell-far',sample:'08',note:'D3',frequency:146.8323839587038,audioUrl:'audio/source-rest/bells/rest-bell-d3.wav',audioSeconds:20,position:{x:seat.x-22,y:seat.feet+8.6,z:seat.z+.25},scale:1.75},
].map(row=>Object.freeze({...row,position:Object.freeze(row.position)})));
const bellTimes=[[7.8,0],[12.6,1],[31.9,2],[89.2,1],[133.5,0],[208.5,2],[247.9,0],[330.8,1],[405.6,0],[448.7,2],[484.4,1]];
export const SOURCE_REST_BELL_EVENTS=Object.freeze(bellTimes.map(([at,index],n)=>Object.freeze({
  id:`rest-bell-strike-${n}`,at,bellId:SOURCE_REST_BELLS[index].id,sample:SOURCE_REST_BELLS[index].sample,
  position:SOURCE_REST_BELLS[index].position,note:SOURCE_REST_BELLS[index].note,frequency:SOURCE_REST_BELLS[index].frequency,energy:index===2?.78:.66,
})));
// The game's actual storm envelope and distance law, with a small authored
// progression from weather over the county to a strike beside the refuge.
export const SOURCE_REST_LIGHTNING=Object.freeze([[4,2600],[14,720],[26,180]].map(([at,distance],n)=>{
  const storm=freshStorm({seed:8191+n*127,intensity:1});storm.time=at;
  const strike=forceStrike(storm,{distance});
  return Object.freeze({...strike,id:`rest-judgment-${n}`,at,delay:distance/343,
    bearing:[-.48,.16,-.30][n],strokes:Object.freeze(strike.strokes.map(Object.freeze))});
}));
export function sourceRestJudgmentFrame({clock=0,active=true,progress=0,stormAge=-1,flashMode='full',reducedMotion=false}={}){
  const time=Math.max(0,Number(clock)||0),present=!!active&&unit(progress)<.95;
  const storm=present&&stormAge>=0&&stormAge<54?SOURCE_REST_LIGHTNING.map(event=>({...event,at:time-stormAge+event.at,startedAt:time-stormAge+event.startedAt,thunderAt:time-stormAge+event.thunderAt})):[];
  const flash=stormFlash({time,strikes:storm});
  const bells=SOURCE_REST_BELLS.map(bell=>{
    let angle=0;
    if(present)for(const event of SOURCE_REST_BELL_EVENTS){
      if(event.bellId!==bell.id)continue;const age=time-event.at;
      if(age<-.8||age>9)continue;
      const attack=unit((age+.8)/.8),decay=age<0?1:Math.exp(-age/2.9);
      angle+=Math.cos(age*2.08)*attack*decay*.48;
    }
    if(reducedMotion)angle*=.24;
    return{...bell,angle,clapperAngle:-angle*.46};
  });
  return{clock:time,active:present,flash:flashMode==='off'?0:flash*Math.min(flashMode==='reduced'?.12:1,reducedMotion?.20:1),bells,
    bellEvents:present?SOURCE_REST_BELL_EVENTS:[],flashes:storm,
    thunder:storm.map(event=>({...event,at:event.thunderAt}))};
}

const channels=new Map();
export function sourceRestLightningSegments(judgment,{flashMode='full'}={}){
  if(!judgment?.active||flashMode==='off')return[];
  const result=[];
  for(const event of judgment.flashes||[]){
    const power=stormFlash({time:judgment.clock,strikes:[event]});if(power<.025||event.distance>800)continue;
    let points=channels.get(event.id);if(!points){points=makeChannel(event.seed,event).points;channels.set(event.id,points);}
    // Show the low, real channel beyond the refuge. Its exact seed and ground
    // distance are also what the standard thunder renderer hears.
    const visible=points.filter(p=>p[1]<180),step=Math.max(1,Math.ceil(visible.length/26));
    const world=p=>[seat.x-p[2],seat.feet-18+p[1],seat.z+p[0]];
    for(let k=step;k<visible.length;k+=step)result.push({id:`${event.id}-channel-${k}`,a:world(visible[k-step]),b:world(visible[k]),
      width:(event.distance<200?.18:.30)*(flashMode==='reduced'?.5:1),power,eventId:event.id});
  }
  return result;
}
