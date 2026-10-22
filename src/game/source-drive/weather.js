// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
// Isolated weather mechanics. No narrative escalation or control failure lives
// here. Simulation time, rain/snow profiles and the user wiper switch are
// owned by the study; stopping the van does not stop rain landing on its glass.
export const WEATHER_GRID=Object.freeze({width:48,height:32});
export const DRIVE_PANE=Object.freeze({left:-.79,right:.79,bottomY:1.30,topY:2.16,bottomZ:-1.17,topZ:-.77});
export const WIPER_TILT_X=Math.atan2(DRIVE_PANE.topZ-DRIVE_PANE.bottomZ,DRIVE_PANE.topY-DRIVE_PANE.bottomY);
const STEP=1/120,TAU=Math.PI*2,CYCLE=2.62,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const numeric=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
const paneLength=Math.hypot(DRIVE_PANE.topY-DRIVE_PANE.bottomY,DRIVE_PANE.topZ-DRIVE_PANE.bottomZ);
const cellPoints=Array.from({length:WEATHER_GRID.width*WEATHER_GRID.height},(_,i)=>[
 DRIVE_PANE.left+(i%WEATHER_GRID.width+.5)/WEATHER_GRID.width*(DRIVE_PANE.right-DRIVE_PANE.left),
 (Math.floor(i/WEATHER_GRID.width)+.5)/WEATHER_GRID.height*paneLength]);
const snowLanding=cellPoints.map(p=>.030+.025*Math.pow(Math.abs(p[0])/.79,3)+.045*(1-p[1]/paneLength));
// Fixed pane samples precompute their blade angle/radius. A moving sweep then
// touches only its thin angular band; no per-frame trig per glass cell.
const wipeCells=[-.52,.45].map(pivot=>cellPoints.flatMap((p,index)=>{const dx=p[0]-pivot,r=Math.hypot(dx,p[1]);if(r<.285||r>.605)return[];const along=Math.sqrt(Math.max(0,r*r-.035*.035)),angle=Math.atan2(p[1],dx)-Math.atan2(along,-.035),tipDistance=Math.max(.31-along,along-.58,0);return[{index,r,angle,tipDistance,margin:.025/r}];}));
export function createDriveWeather({rain=.62,extinction=.0055,initialWetness=.36,seed=8147,fog=0,snow=0,whiteout=0,initialSnow=0}={}){
 return{schema:1,seed:Math.floor(numeric(seed,8147)),timeSec:0,rain:clamp(numeric(rain,.26),0,1),extinction:clamp(numeric(extinction,.0035),0,.05),
  fog:clamp(numeric(fog,0),0,1),snow:clamp(numeric(snow,0),0,1),whiteout:clamp(numeric(whiteout,0),0,1),
  roadWetness:.55,wind:[1.5,-.35],cloud:.82,gust:.5,shelter:0,load:{value:0,release:0,squall:.18,water:0,anatomy:0,aftermath:0},wiperPhase:0,wiperMoving:false,wiperRequested:false,remainder:0,revision:0,
  grid:Array(cellPoints.length).fill(clamp(numeric(initialWetness,.25),0,1)),snowGrid:Array(cellPoints.length).fill(clamp(numeric(initialSnow,0),0,1))};
}
export function driveWiperPose(state){const sweep=.55+.87*Math.cos(state.wiperPhase);return{angles:[-sweep,sweep],tiltX:WIPER_TILT_X,moving:state.wiperMoving,phase:state.wiperPhase};}
export function stepDriveWeather(state,{dt=0,timeSec=state.timeSec,paused=false,rain=state.rain,extinction=state.extinction,wipers=state.wiperRequested,speed=0,wind=state.wind,cloud=state.cloud,gust=state.gust,shelter=state.shelter,load=state.load,fog=state.fog,snow=state.snow,whiteout=state.whiteout}={}){
 if(state?.schema!==1||!Array.isArray(state.grid)||state.grid.length!==cellPoints.length)throw Error('Unsupported driving weather state');
 if(paused)return state;
 if(!state.snowGrid)state.snowGrid=Array(cellPoints.length).fill(0);
 if(!Array.isArray(state.snowGrid)||state.snowGrid.length!==cellPoints.length)throw Error('Unsupported driving snow state');
 state.rain=clamp(numeric(rain,state.rain),0,1);state.extinction=clamp(numeric(extinction,state.extinction),0,.05);state.wiperRequested=!!wipers;
 state.fog=clamp(numeric(fog,0),0,1);state.snow=clamp(numeric(snow,0),0,1);state.whiteout=clamp(numeric(whiteout,0),0,1);
 state.wind=[clamp(numeric(wind?.[0],1.5),-8,8),clamp(numeric(wind?.[1],-.35),-8,8)];state.cloud=clamp(numeric(cloud,.82),0,1);state.gust=clamp(numeric(gust,.5),0,1);state.shelter=clamp(numeric(shelter,0),0,1);
 state.load=Object.fromEntries(['value','release','squall','water','anatomy','aftermath'].map(k=>[k,clamp(numeric(load?.[k],0),0,1)]));
 state.timeSec=Math.max(state.timeSec,numeric(timeSec,state.timeSec));state.remainder+=clamp(numeric(dt,0),0,2);
 while(state.remainder>=STEP-1e-10){
  state.remainder=Math.max(0,state.remainder-STEP);
  const oldPose=driveWiperPose(state),wasMoving=state.wiperMoving;
  if(state.wiperRequested)state.wiperMoving=true;
  if(state.wiperMoving){state.wiperPhase+=TAU/CYCLE*STEP;if(state.wiperPhase>=TAU){state.wiperPhase-=TAU;if(!state.wiperRequested){state.wiperPhase=0;state.wiperMoving=false;}}}
  const pose=driveWiperPose(state);
  // The tyre/road reservoir is deliberately slow. It cannot dry instantly when
  // the current rain intensity changes or because the player stops driving.
  state.roadWetness+=(state.rain>.01?(.28+.65*state.rain-state.roadWetness):(.06-state.roadWetness))*(1-Math.exp(-STEP/(state.rain>.01?35:180)));
  const deposition=state.rain*(1-state.shelter*.86)*(.055+.025*clamp(Math.abs(numeric(speed,0))/16,0,1)),drying=state.rain<.01?.0012:.00015,rewet=1-Math.exp(-deposition*STEP);
  for(let i=0;i<state.grid.length;i++){
   let wet=state.grid[i];wet+=(.9-wet)*rewet;wet=Math.max(0,wet-drying*STEP);
   state.grid[i]=clamp(wet,0,1);
   // Snow is a second, conserved pane reservoir, not a screen-space frost
   // vignette. It lands while stationary, gathers below the blade parking
   // line and on the windward margin, then melts slowly back into the glass.
   const frozen=state.snowGrid[i];if(state.snow>.001||frozen>0){
    const windward=clamp(.5+cellPoints[i][0]*state.wind[0]*.10,0,1),landing=state.snow*(1-state.shelter*.94)*(snowLanding[i]+.018*windward)*(1+.35*clamp(Math.abs(numeric(speed,0))/16,0,1));
    const melt=state.snow<.03?.006:(.0005+.0015*state.rain),melted=Math.min(frozen,melt*STEP);
    state.snowGrid[i]=clamp(frozen+(.94-frozen)*(1-Math.exp(-landing*STEP))-melted,0,1);
    state.grid[i]=clamp(state.grid[i]+melted*.72,0,1);
   }
  }
  if(state.wiperMoving||wasMoving)for(let k=0;k<2;k++){
   const lo=Math.min(pose.angles[k],oldPose.angles[k]),hi=Math.max(pose.angles[k],oldPose.angles[k]);
   for(const point of wipeCells[k]){if(point.angle<lo-point.margin||point.angle>hi+point.margin)continue;
    const angularDistance=Math.max(lo-point.angle,point.angle-hi,0)*point.r,distance=Math.hypot(angularDistance,point.tipDistance),clear=1-clamp((distance-.009)/.015,0,1),wet=state.grid[point.index];
    // Finite blade width and a soft sampled border retain the material arc.
    state.grid[point.index]=wet*(1-clear)+Math.min(wet,.014)*clear;
    const frozen=state.snowGrid[point.index];state.snowGrid[point.index]=frozen*(1-clear)+Math.min(frozen,.018)*clear;
   }
  }
  state.revision++;
 }
 return state;
}
function rigidInverse(body,mount){const m=body||[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t=[m[12],m[13],m[14]],r=[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0,0,0,0,1];
 r[12]=-(r[0]*t[0]+r[4]*t[1]+r[8]*t[2])-mount[0];r[13]=-(r[1]*t[0]+r[5]*t[1]+r[9]*t[2])-mount[1];r[14]=-(r[2]*t[0]+r[6]*t[1]+r[10]*t[2])-mount[2];return r;}
export function driveWeatherFrame(state,{bodyMatrix=null,cabinMount=[0,0,-1.6],headlamps=[]}={}){
 const pose=driveWiperPose(state),data=Uint8Array.from(state.grid,w=>Math.round(w*255));
 return{active:true,schema:1,timeSec:state.timeSec,seed:state.seed,rain:state.rain,extinction:state.extinction,roadWetness:state.roadWetness,
  fog:state.fog||0,snow:state.snow||0,whiteout:state.whiteout||0,
  wind:state.wind||[1.5,-.35],cloud:state.cloud??.82,gust:state.gust??.5,shelter:state.shelter||0,load:{...state.load},groundY:bodyMatrix?.[13]??0,
  worldToCabin:rigidInverse(bodyMatrix,cabinMount),pane:{...DRIVE_PANE},wetness:{...WEATHER_GRID,data,snowData:Uint8Array.from(state.snowGrid||Array(cellPoints.length).fill(0),w=>Math.round(w*255)),revision:state.revision,owner:state.grid},
  wiperAngles:pose.angles,wiperTiltX:pose.tiltX,wiperMoving:pose.moving,
  headlamps:headlamps.slice(0,2).map(l=>({x:l.x,y:l.y,z:l.z,intensity:l.intensity||0})),
  scope:'Authored rain, depth-integrated fog and snow; not measured precipitation, optical glass, headlamp photometry or a historical vehicle specification'};
}
export function serializeDriveWeather(state){return JSON.stringify(state);}
export function restoreDriveWeather(serialized){const state=typeof serialized==='string'?JSON.parse(serialized):structuredClone(serialized);if(state?.schema!==1||!Array.isArray(state.grid)||state.grid.length!==cellPoints.length||state.grid.some(v=>!Number.isFinite(v)||v<0||v>1)||![state.timeSec,state.rain,state.extinction,state.wiperPhase,state.remainder,state.roadWetness].every(Number.isFinite))throw Error('Unsupported driving weather checkpoint');
 if(state.snowGrid===undefined)state.snowGrid=Array(cellPoints.length).fill(0);
 if(!Array.isArray(state.snowGrid)||state.snowGrid.length!==cellPoints.length||state.snowGrid.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Unsupported driving snow checkpoint');
 for(const key of ['fog','snow','whiteout'])state[key]=clamp(numeric(state[key],0),0,1);return state;}
