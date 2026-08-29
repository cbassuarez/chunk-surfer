import { compileFireballCastPlan, validateFireballCastPlan } from '../game/window-channel.js';

const MOVEMENTS=Object.freeze({
  natatorium:['room','voice','hold'],hall:['seated','attention','applause'],practice:['instrument','player','score'],
  chapel:['room','recordist','surfer','contract','source'],'source-final':['call-site','borrowed-body','final-clause'],
});

export function buildWindowChoreographyLabCases(){
  const cases=[];
  for(const [battleId,movements] of Object.entries(MOVEMENTS))for(const [movementIndex,movementId] of movements.entries())for(const reducedMotion of [false,true]){
    const plan=compileFireballCastPlan({battleId,movementId,movementIndex,intentId:`${battleId}:lab`,intentKind:'broadcast',castSequence:0,reducedMotion});
    cases.push(Object.freeze({id:`${battleId}:${movementId}:${reducedMotion?'reduced':'full'}`,battleId,movementId,movementIndex,reducedMotion,plan}));
  }
  return Object.freeze(cases);
}

export function choreographyLabSummary(cases=buildWindowChoreographyLabCases()){
  const valid=cases.filter((entry)=>validateFireballCastPlan(entry.plan));
  return Object.freeze({cases:cases.length,valid:valid.length,maxSurfaces:Math.max(0,...valid.map((entry)=>entry.plan.rayCount)),modalPhases:0,mainWindowMutations:0});
}
