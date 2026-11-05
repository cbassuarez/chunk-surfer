import {stepWindLeaves,windLeafProps} from '../world/wind-leaves.js';
import {sourceTideWell,sourceTideWind} from '../game/source-continuation-tides.js';

// The opening's leaves, still in the air when the body reaches either
// Source: the same gust clock carries them, and the same thing whose tide
// pulls the body draws them in, spiralling: into Source II's hole, and up
// toward Source III's black sun. They show which way the pull runs before
// it has gathered under your own feet.
export const SOURCE_LEAVES=Object.freeze({count:40});
/** One field step and its props. `memory` carries the field between frames. */
export function sourceContinuationLeafFrame(state,{origin={x:0,y:0,z:0},memory=null,reducedMotion=false}={}){
  const well=sourceTideWell(state);
  if(!well||reducedMotion)return{props:[],memory:null};
  const time=Number(state.elapsed)||0,wind=sourceTideWind(time),
    next=stepWindLeaves(memory,{key:`${state.phase}:${state.chartId??0}`,time,well,settings:{count:SOURCE_LEAVES.count},wind,
      body:{x:Number(state.x)||0,y:(Number(state.feet)||0)+1.2,z:Number(state.z)||0}});
  return{props:windLeafProps(next,{origin,prefix:'source-continuation-leaf',extra:{chartId:state.chartId??0,region:state.phase,sourceLeaf:true}}),memory:next};
}
