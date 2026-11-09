// The existing last straight reach: a recognisable Lyric interior is stripped
// down to its construction stock. Visual strain does not add walked distance.
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const SOURCE_CONNECTOR_CORRIDOR=freeze({
  version:2,chartId:4,x:-146,startZ:-61,endZ:-92,feet:8.4,length:31,
  floorMinX:-148.6,floorMaxX:-143.4,wallHalfWidth:3.1,ceilingHeight:3.6,
  strainAt:3,strainSeconds:8.4,strainExtendSeconds:2.1,strainHoldUntil:5.6,strainAmplitude:6,warningAt:7,
  warningSeconds:1.2,lowerSeconds:.9,raisedBottom:12.7,
  cabinet:{minX:-148.6,maxX:-146,minZ:-77.3,maxZ:-76.7,height:2.3},
  bypass:{minX:-146,maxX:-143.4,width:2.6,centerX:-144.7},
  anchor:{id:'journey-corridor-service-jamb',x:-146,z:-71,feet:8.4,chartId:4,
    phase:'wrong-return',radius:1.2,earnedBy:'supported-arrival',restoreAt:{x:-146,z:-71,feet:8.4}},
});
export const SOURCE_CONNECTOR_REVIEW_POSES=freeze([
  {id:'ii-corridor-approach',x:-146,z:-60,feet:8.4,chartId:4,yaw:0,pitch:0},
  {id:'ii-corridor-decision',x:-146,z:-73.8,feet:8.4,chartId:4,yaw:0,pitch:-.12},
  {id:'ii-corridor-bypass',x:-144.7,z:-76,feet:8.4,chartId:4,yaw:0,pitch:-.12},
  {id:'ii-corridor-gate',x:-146,z:-91.5,feet:8.4,chartId:4,yaw:-Math.PI/2,pitch:0},
]);
export const SOURCE_CONNECTOR_REVIEW_STATES=freeze({
  approach:{version:2,phase:'dormant',elapsed:0,strainStarted:false,strainElapsed:0,legacyPassed:false,blockedBy:null},
  strain:{version:2,phase:'warning',elapsed:.6,strainStarted:true,strainElapsed:2.1,legacyPassed:false,blockedBy:null},
  lowering:{version:2,phase:'lowering',elapsed:.45,strainStarted:true,strainElapsed:3.4,legacyPassed:false,blockedBy:null},
  settled:{version:2,phase:'settled',elapsed:.9,strainStarted:true,strainElapsed:8.4,legacyPassed:false,blockedBy:null},
});
const C=SOURCE_CONNECTOR_CORRIDOR,defaultState=freeze({version:2,phase:'dormant',elapsed:0,strainElapsed:0,strainStarted:false,legacyPassed:false}),cache=new WeakMap();
export const corridorProgress=p=>C.startZ-(Number(p?.z)||0);
export function corridorStrain(value={}){
  if(!value.strainStarted)return 0;
  // A finished old save stays finished when the longer visual envelope ships.
  const t=value.version===1?clamp(value.strainElapsed,0,3.6)/3.6*C.strainSeconds:clamp(value.strainElapsed,0,C.strainSeconds);
  return t<C.strainExtendSeconds?smooth(t/C.strainExtendSeconds):t<C.strainHoldUntil?1:1-smooth((t-C.strainHoldUntil)/(C.strainSeconds-C.strainHoldUntil));
}
export function corridorDecorProgress(s,value={}){return s+C.strainAmplitude*corridorStrain(value)*Math.sin(Math.PI*s/C.length);}
export function corridorCabinetBox(value={}){
  const phase=value.phase,progress=value.legacyPassed?0:phase==='settled'?1:phase==='lowering'?smooth(clamp(value.elapsed,0,C.lowerSeconds)/C.lowerSeconds):0,
    y=C.raisedBottom+(C.feet-C.raisedBottom)*progress,shift=value.legacyPassed?-(C.cabinet.maxX-C.floorMinX+.3):0;
  return{id:'journey-corridor-cabinet',chartId:4,phase:'wrong-return',region:'wrong-return',role:'furniture',
    minX:C.cabinet.minX+shift,maxX:C.cabinet.maxX+shift,minZ:C.cabinet.minZ,maxZ:C.cabinet.maxZ,
    minY:y,maxY:y+C.cabinet.height,material:'piano-wood',corridor:true,cabinet:true};
}
export function corridorParts(state={}){
  const value=state.corridor&&typeof state.corridor==='object'?state.corridor:defaultState;if(cache.has(value))return cache.get(value);
  const rows=[],box=(id,x0,x1,y0,y1,z0,z1,material,extra={})=>rows.push({id:'journey-corridor-'+id,chartId:4,
    phase:'wrong-return',region:'wrong-return',role:'furniture',minX:x0,maxX:x1,minY:y0,maxY:y1,minZ:z0,maxZ:z1,material,corridor:true,...extra});
  function rememberedBar(side,x,z0,z1,i){
    const inward=side==='west'?1:-1,span=z1-z0,mid=(z0+z1)/2,
      metadata={lyricMemory:true,stockStage:'furnished'};
    // A full counter profile, supported on its own panel, a recessed mirrored
    // back-bar and glasses resting ON the shelf distinguish this from generic
    // nested door frames even under Source's restricted print treatment.
    box(`${side}-counter-panel-${i}`,x-.055,x+.055,C.feet+.06,C.feet+1.06,z0,z1,'piano-wood',metadata);
    const lip=x+inward*.32;
    box(`${side}-counter-top-${i}`,Math.min(x-.08,lip),Math.max(x+.08,lip),C.feet+1.04,C.feet+1.12,z0-.035,z1+.035,'piano-wood',metadata);
    box(`${side}-bar-foot-rail-${i}`,lip-.025,lip+.025,C.feet+.22,C.feet+.27,z0,z1,'worn-metal',metadata);
    const mirrorX=x+inward*.048;
    box(`${side}-back-bar-mirror-${i}`,mirrorX-.012,mirrorX+.012,C.feet+1.72,C.feet+2.65,z0+.23,z1-.23,'dark-metal',{...metadata,backBarMirror:true});
    for(const [end,z]of[['near',z1-.20],['far',z0+.20]])
      box(`${side}-back-bar-stile-${i}-${end}`,x-.07,x+.07,C.feet+1.64,C.feet+2.72,z-.045,z+.045,'piano-wood',metadata);
    for(let k=0;k<5;k++){
      const a=(k/5-.5)*span*.72,b=((k+1)/5-.5)*span*.72,
        top=C.feet+2.72+.20*Math.sin((k+.5)/5*Math.PI);
      box(`${side}-back-bar-crown-${i}-${k}`,x-.085,x+.085,top-.065,top,mid+a,mid+b+.008,'piano-wood',metadata);
    }
    for(let k=0;k<2;k++){
      const cx=x+inward*.062,cz=mid+(k?1:-1)*span*.19;
      box(`${side}-shelf-glass-${i}-${k}`,cx-.03,cx+.03,C.feet+1.64,C.feet+1.80,cz-.03,cz+.03,'glass',
        {...metadata,visualMesh:'connector-glass',restingOn:`journey-corridor-${side}-shelf-${i}`});
    }
  }
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
          rememberedBar(side,x,z0,z1,i);
        }else{
          box(`${side}-lath-${i}`,x-.035,x+.035,C.feet+1.06,C.feet+1.13,z0,z1,'cold-wall');
          box(`${side}-cut-header-${i}`,x-.055,x+.055,C.feet+2.8,C.feet+2.9,z0,z1,'cold-wall');
          // The first stripped bay retains half its actual counter edge. The
          // next is only battens: no second furnished room is introduced.
          if(i===3){
            const mid=(z0+z1)/2;
            box(`${side}-cut-counter-${i}`,x-.075,x+.075,C.feet+1.04,C.feet+1.12,z0,mid,'piano-wood',{lyricMemory:true,stockStage:'stripped'});
            box(`${side}-mirror-backing-${i}`,x-.02,x+.02,C.feet+1.74,C.feet+2.45,z0+.12,mid,'cold-wall',{lyricMemory:true,stockStage:'stripped'});
          }
        }
      }
    }
  }
  const cabinet=corridorCabinetBox(value);rows.push(cabinet);
  // This is recognisable salvaged back-bar furniture, not an unexplained slab.
  // Applied mouldings stay within its old supported footprint; the 1.1m east
  // bypass and both open floor edges are the same physical route as before.
  const cx0=cabinet.minX,cx1=cabinet.maxX,front=cabinet.maxZ,base=cabinet.minY,
    cabinetMeta={cabinet:true,lyricMemory:true,stockStage:'salvage'};
  for(const [side,x]of[['west',cx0+.055],['east',cx1-.055]])
    box(`cabinet-door-stile-${side}`,x-.035,x+.035,base+.06,base+2.23,front,front+.018,'piano-wood',cabinetMeta);
  for(const [name,y]of[['toe',.10],['mid',1.1],['head',2.22]])
    box(`cabinet-door-rail-${name}`,cx0+.055,cx1-.055,base+y-.035,base+y+.035,front,front+.018,'piano-wood',cabinetMeta);
  box('cabinet-handle',cx1-.22,cx1-.195,base+1.13,base+1.33,front+.018,front+.045,'worn-metal',cabinetMeta);
  // A separate static gantry has an explicit load path to the side stock. Its
  // hanging guides attach to the cabinet's top at every accepted motion tick.
  const gantryTop=C.raisedBottom+C.cabinet.height+.2;
  for(const [side,x]of[['west',west],['east',east]])
    box(`hoist-upright-${side}`,x-.07,x+.07,C.feet,gantryTop,C.cabinet.minZ-.08,C.cabinet.minZ+.04,'dark-metal',{suspension:true});
  box('hoist-crossbeam',west-.07,east+.07,gantryTop-.12,gantryTop,C.cabinet.minZ-.10,C.cabinet.minZ+.06,'dark-metal',{suspension:true});
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
