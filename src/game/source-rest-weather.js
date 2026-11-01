import {SOURCE_REST_SEATS} from './source-rest-seat.js';
import {sourceRestWeatherCue} from './source-rest-weather-score.js';
import {windAt} from '../world/wind.js';
import {leafShape} from '../world/leaf-species.js';
import {sourceRestLightningSegments} from './source-rest-judgment.js';
const seat=SOURCE_REST_SEATS[0],clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const hash=n=>{const v=Math.sin(n*91.173+37.421)*43758.5453;return v-Math.floor(v);};

// Project the existing game's rain/leaves/sheets into real world depths
// beyond the alcove window. Only roof drainage and puddles need local models.
export function sourceRestWeather(state,{reducedMotion=false,flashMode='full'}={}){
  if(state?.phase!=='wrong-return'||(state.chartId??0)!==seat.chartId)return null;
  const view=state.sourceRestView||{},clock=[view.audibleSeconds,view.musicTime,state.elapsed].find(n=>typeof n==='number'&&Number.isFinite(n)),
    cue=view.weatherCue||sourceRestWeatherCue({seated:!!view.seatId,progress:view.degradation,audibleSeconds:clock,reducedMotion}),
    time=Math.max(0,Number(cue.clock)||0),gust=reducedMotion?0:(windAt(time,{depth:.8})-1)*cue.windStrength,
    presence=Math.max(cue.rain,cue.drips,cue.wetness,cue.sheets,cue.leaves),streaks=[],roof=[],ripples=[],wet=[],objects=[];
  for(const[pIndex,particle]of(cue.particles||[]).entries()){
    const depth=clamp(particle.depth),distance=2.55+(1-depth)*16,x=seat.x-distance,
      z=seat.z+(particle.x-.5)*(6+(1-depth)*15),y=seat.feet+4.4-particle.y*6.4,
      size=particle.size*7.8,kind=particle.kind;
    if(kind==='rain'){
      const direction=particle.reverse?-1:1,length=Math.max(.18,size),lean=particle.vx*(particle.wind||1)/Math.max(.05,Math.abs(particle.vy));
      streaks.push({id:`rest-weather-standard-rain-${pIndex}`,a:[x,y,z],b:[x+.025,y+direction*length,z-direction*lean*length],
        width:(.012+depth*.008)*Math.max(.35,particle.visibility),layer:Math.min(2,Math.floor((1-depth)*3)),standard:true,reverse:!!particle.reverse});
    }else if(kind==='sheets'||kind==='leaves'){
      objects.push({id:`rest-weather-standard-${kind}-${pIndex}`,mesh:kind==='sheets'?'rest-weather-sheet':'rest-weather-leaf-'+leafShape(particle.form).id,
        x,y,z,size:Math.max(.16,size),yaw:particle.spin,roll:Math.sin(particle.phase)*.38,kind,standard:true});
    }
  }
  const drip=clamp(cue.drips),wetness=clamp(cue.wetness);
  for(let k=0;k<Math.ceil(12*drip);k++){
    const p=(hash(k+311)+time*.16)%1,z=seat.z-.25+(hash(k+79)-.5)*1.80,x=seat.x+.22-p*1.30,y=seat.feet+2.52-p*.25;
    roof.push({id:`rest-weather-roof-${k}`,a:[x,y,z],b:[x+.15,y+.028,z+.01],width:.009*drip,kind:'roof'});
  }
  for(let k=0;k<Math.ceil(6*drip);k++){
    const p=(hash(k+419)+time*.79)%1,z=seat.z-.25+(hash(k+507)-.5)*1.80,y=seat.feet+2.31-p*2.20;
    roof.push({id:`rest-weather-eave-${k}`,a:[seat.x-1.14,y,z],b:[seat.x-1.13,y+.055,z],width:.018*drip,kind:'eave'});
  }
  for(let k=0;k<Math.ceil(9*wetness);k++){
    const x=seat.x-2.4-hash(k+601)*2.1,z=seat.z+(hash(k+703)-.5)*.70,phase=(hash(k+827)+time*.42)%1;
    wet.push({id:`rest-weather-wet-${k}`,x,y:seat.feet+.046,z,sx:(.33+hash(k+931)*.26)*wetness,sz:(.24+hash(k+1013)*.16)*wetness});
    if(cue.ripples>.01)ripples.push({id:`rest-weather-ripple-${k}`,x,y:seat.feet+.052,z,radius:(.035+phase*.21)*clamp(cue.ripples),strength:(1-phase)*cue.ripples});
  }
  const waterY=cue.flood?.active?cue.flood.waterY:-Infinity;
  // Rain strikes the shared coastal surface; it never continues falling
  // through the fish or an underwater cabin as an unrelated screen effect.
  const aboveWater=rows=>rows.flatMap(row=>{
    const a=[...row.a],b=[...row.b];if(Math.max(a[1],b[1])<=waterY)return[];
    if(Math.min(a[1],b[1])<waterY){const t=(waterY-a[1])/(b[1]-a[1]),hit=a.map((n,k)=>n+(b[k]-n)*t);
      if(a[1]<waterY)a.splice(0,3,...hit);else b.splice(0,3,...hit);}
    return[{...row,a,b}];
  });
  if(waterY>seat.feet+.06){ripples.length=0;wet.length=0;}
  return{time,gust,presence,streaks:aboveWater(streaks),roof:aboveWater(roof),ripples,wet,objects,cue,reducedMotion,
    lightning:sourceRestLightningSegments(cue.judgment,{flashMode})};
}
