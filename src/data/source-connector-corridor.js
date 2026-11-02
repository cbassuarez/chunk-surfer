// The existing last straight reach, not another room or another route.
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const SOURCE_CONNECTOR_CORRIDOR=freeze({
  version:1,chartId:4,x:-146,startZ:-61,endZ:-92,feet:8.4,length:31,
  floorMinX:-147.1,floorMaxX:-144.9,wallHalfWidth:2.6,ceilingHeight:3.6,
  strainAt:3,strainSeconds:3.6,strainAmplitude:3.5,warningAt:7,
  warningSeconds:1.2,lowerSeconds:.9,raisedBottom:12.7,
  cabinet:{minX:-147.1,maxX:-146,minZ:-77.3,maxZ:-76.7,height:2.3},
  bypass:{minX:-146,maxX:-144.9,width:1.1,centerX:-145.45},
  anchor:{id:'journey-corridor-service-jamb',x:-146,z:-71,feet:8.4,chartId:4,
    phase:'wrong-return',radius:1.2,earnedBy:'supported-arrival',restoreAt:{x:-146,z:-71,feet:8.4}},
});
export const SOURCE_CONNECTOR_REVIEW_POSES=freeze([
  {id:'ii-corridor-approach',x:-146,z:-60,feet:8.4,chartId:4,yaw:0,pitch:0},
  {id:'ii-corridor-decision',x:-146,z:-73.8,feet:8.4,chartId:4,yaw:0,pitch:-.12},
  {id:'ii-corridor-bypass',x:-145.45,z:-76,feet:8.4,chartId:4,yaw:0,pitch:-.12},
  {id:'ii-corridor-gate',x:-146,z:-91.5,feet:8.4,chartId:4,yaw:-Math.PI/2,pitch:0},
]);
export const SOURCE_CONNECTOR_REVIEW_STATES=freeze({
  approach:{version:1,phase:'dormant',elapsed:0,strainStarted:false,strainElapsed:0,legacyPassed:false,blockedBy:null},
  strain:{version:1,phase:'warning',elapsed:.6,strainStarted:true,strainElapsed:1.6,legacyPassed:false,blockedBy:null},
  lowering:{version:1,phase:'lowering',elapsed:.45,strainStarted:true,strainElapsed:2.4,legacyPassed:false,blockedBy:null},
  settled:{version:1,phase:'settled',elapsed:.9,strainStarted:true,strainElapsed:3.6,legacyPassed:false,blockedBy:null},
});
const C=SOURCE_CONNECTOR_CORRIDOR,defaultState=freeze({version:1,phase:'dormant',elapsed:0,strainElapsed:0,strainStarted:false,legacyPassed:false}),cache=new WeakMap();
export const corridorProgress=p=>C.startZ-(Number(p?.z)||0);
export function corridorStrain(value={}){
  if(!value.strainStarted)return 0;const t=clamp(value.strainElapsed,0,C.strainSeconds);
  return t<1.2?smooth(t/1.2):t<2?1:1-smooth((t-2)/1.6);
}
export function corridorDecorProgress(s,value={}){return s+C.strainAmplitude*corridorStrain(value)*Math.sin(Math.PI*s/C.length);}
export function corridorCabinetBox(value={}){
  const phase=value.phase,progress=value.legacyPassed?0:phase==='settled'?1:phase==='lowering'?smooth(clamp(value.elapsed,0,C.lowerSeconds)/C.lowerSeconds):0,
    y=C.raisedBottom+(C.feet-C.raisedBottom)*progress,shift=value.legacyPassed?-2.6:0;
  return{id:'journey-corridor-cabinet',chartId:4,phase:'wrong-return',region:'wrong-return',role:'furniture',
    minX:C.cabinet.minX+shift,maxX:C.cabinet.maxX+shift,minZ:C.cabinet.minZ,maxZ:C.cabinet.maxZ,
    minY:y,maxY:y+C.cabinet.height,material:'piano-wood',corridor:true,cabinet:true};
}
export function corridorParts(state={}){
  const value=state.corridor&&typeof state.corridor==='object'?state.corridor:defaultState;if(cache.has(value))return cache.get(value);
  const rows=[],box=(id,x0,x1,y0,y1,z0,z1,material,extra={})=>rows.push({id:'journey-corridor-'+id,chartId:4,
    phase:'wrong-return',region:'wrong-return',role:'furniture',minX:x0,maxX:x1,minY:y0,maxY:y1,minZ:z0,maxZ:z1,material,corridor:true,...extra});
  const ribs=Array.from({length:11},(_,i)=>i*3),west=C.x-C.wallHalfWidth,east=C.x+C.wallHalfWidth;
  for(let i=0;i<ribs.length;i++){
    const s=ribs[i],z=C.startZ-corridorDecorProgress(s,value),warm=s<9,material=warm?'piano-wood':'cold-wall';
    for(const [side,x]of[['west',west],['east',east]]){
      // The authored route enters from the west at z-61. This first bay is
      // an actual side opening, not a visual panel over the retained path.
      if(side==='west'&&i===0)continue;
      box(`${side}-post-${i}`,x-.075,x+.075,C.feet,C.feet+3.6,z-.09,z+.09,material);
      if(warm){
        // The Lyric's counter/rail proportions survive as construction stock.
        box(`${side}-rail-${i}`,x-.13,x+.13,C.feet+1.06,C.feet+1.14,z-.19,z+.19,'worn-metal');
        box(`${side}-capital-${i}`,x-.13,x+.13,C.feet+2.73,C.feet+2.84,z-.16,z+.16,'piano-wood');
      }
    }
    if(s<28)box(`roof-rib-${i}`,west-.075,east+.075,C.feet+3.6,C.feet+3.74,z-.09,z+.09,material);
    if(i<ribs.length-1&&s<19){
      const end=C.startZ-corridorDecorProgress(ribs[i+1],value),z0=Math.min(z,end)+.10,z1=Math.max(z,end)-.10;
      for(const [side,x]of[['west',west],['east',east]]){
        if(side==='west'&&i===0)continue;
        if(s<9){
          box(`${side}-wainscot-${i}`,x-.04,x+.04,C.feet+.06,C.feet+.94,z0,z1,'piano-wood');
          box(`${side}-shelf-${i}`,x-.13,x+.13,C.feet+1.56,C.feet+1.64,z0,z1,'piano-wood');
          box(`${side}-cornice-${i}`,x-.075,x+.075,C.feet+3.1,C.feet+3.32,z0,z1,'piano-wood');
        }else{
          box(`${side}-lath-${i}`,x-.035,x+.035,C.feet+1.06,C.feet+1.13,z0,z1,'cold-wall');
          box(`${side}-cut-header-${i}`,x-.055,x+.055,C.feet+2.8,C.feet+2.9,z0,z1,'cold-wall');
        }
      }
    }
  }
  const cabinet=corridorCabinetBox(value);rows.push(cabinet);
  // Its visible suspension gives warning and a physical origin for the move.
  for(const x of[cabinet.minX+.12,cabinet.maxX-.12])box(`cabinet-guide-${x}`,x-.025,x+.025,cabinet.maxY,C.raisedBottom+C.cabinet.height+.2,C.cabinet.minZ-.055,C.cabinet.minZ-.015,'dark-metal');
  const result=freeze(rows);cache.set(value,result);return result;
}
export const corridorCollisionSolids=(state={})=>Number.isInteger(state.chartId)&&state.chartId!==4?[]:corridorParts(state);
export function corridorNavigationKey(state={}){
  const v=state?.corridor;if(!v||v.legacyPassed)return'clear';
  // Material movement outside the supported slab never changes ground graph
  // topology. Rebuild only when the cabinet enters the standing body volume;
  // accepted movement still checks its exact current box every fixed tick.
  const b=corridorCabinetBox(v);return b.minY>=C.feet+1.94?'clear':'blocked';
}
