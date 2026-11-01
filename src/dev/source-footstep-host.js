import { MATERIAL, CELL } from '../data/floorplan/legend.js';
import { CHUNK_SURF_GOD_PRESET, PRE_TAPE_GOD_STOPS } from '../game/chunk-surf-god.js';
import { SOURCE_PRE_TAPE, SOURCE_TIERS } from '../data/source-level.js';
import { OUTSKIRTS_BUS_PASSAGE as BUS } from '../data/outskirts-bus-passage.js';
import { SOURCE_BRAIDED_DIVIDE, sourceDivideZ } from '../data/source-braided-divide.js';
import { freshSourceIV } from '../game/source-iv.js';

// Explicit starts in existing production geometry. No locomotion is supplied
// by this adapter, and the capture UI refuses staging during a recording.
export function createSourceFootstepHost(host) {
  const stages = [
    ['field','Compiled field'],['locked','Compiled final rise'],
    ['glazed','Empty approach'],['erased','Horizon tape'],['body','Living bus corridor'],
    ['II','Source II physical floor'],['IV','Source IV white walk'],
  ].map(([id,label])=>({id,label}));
  function codePoint(material) {
    const runtime=host.runtime(),geometry=runtime.geometry,origin=host.getPose();
    const floor=geometry.cellAt(origin.x,origin.y)?.floor;
    let best=null;
    for(let radius=0;radius<=48;radius+=2)for(let dx=-radius;dx<=radius;dx+=2)for(let dy=-radius;dy<=radius;dy+=2){
      if(radius&&Math.abs(dx)!==radius&&Math.abs(dy)!==radius)continue;
      const x=origin.x+dx,y=origin.y+dy,cell=geometry.cellAt(x,y);
      if(!cell||cell.solid||cell.material!==material||!Number.isFinite(cell.floor)||Math.abs(cell.floor-floor)>.6)continue;
      let run=0;
      for(let k=1;k<=40;k++){
        const next=geometry.cellAt(x,y-k);
        if(!next||next.solid||next.material!==material||Math.abs(next.floor-cell.floor)>.6)break;
        run++;
      }
      const score=run*4-Math.hypot(dx,dy)*.05;
      if(!best||score>best.score)best={x,y,yaw:0,pitch:-.22,score};
      if(run===40)return best;
    }
    if(!best)throw Error('No supported production cell of the requested code terrain was found.');
    return best;
  }
  async function bodyStart(){
    await host.warmBody();
    const stop=PRE_TAPE_GOD_STOPS.find(value=>value.id==='pre-tape-bus-aisle');
    await host.enterPreTape(stop.depth,stop.label);
    const runtime=host.runtime(),bus=runtime.outskirtsPiece(`r${BUS.pass}-bus`);
    if(!bus)throw Error('The authored bus is unavailable.');
    const state=runtime.state(),pose=host.getPose(),c=BUS.bodyPassage,
      ground=SOURCE_TIERS.find(tier=>tier.id==='outskirts').height;
    const point=(x,z,origin=bus)=>({x:(origin.x+x*Math.cos(origin.yaw)+z*Math.sin(origin.yaw))/CELL-.5,
      y:(origin.z-x*Math.sin(origin.yaw)+z*Math.cos(origin.yaw))/CELL-.5});
    const align=local=>{const p=point(...local);return{x:pose.x+Math.round(p.x-pose.x),y:pose.y+Math.round(p.y-pose.y)};};
    const interior={active:true,origin:{x:bus.x+c.pocketOffsetMetres,y:ground+BUS.floor,z:bus.z,yaw:bus.yaw},
      returnPose:align(c.insideReturn),outsidePose:align(c.outside),busPose:{x:bus.x,z:bus.z,yaw:bus.yaw,ground},
      enteredAt:0,walkCheckpoint:0,stepIndex:0};
    state.outskirtsExperience={...state.outskirtsExperience,clock:30,busStage:3,
      busTransit:{...state.outskirtsExperience.busTransit,version:1,doorOpened:true,entered:true,close:true,exited:false,
        doorAt:0,enteredAt:0,trapAt:1,tryAt:2,recoilAt:3,openAt:4,interior}};
    const at={...point(0,2,interior.origin),yaw:Math.PI-bus.yaw,pitch:-.12};
    await host.activate(state,at);
    host.place(at);
    if(!host.runtime().busInteriorFrame?.()?.active)throw Error('The saved bus corridor did not acquire its real geometry.');
  }
  return {
    stages,snapshot:host.snapshot,captureAudio:host.captureAudio,ensureAudio:host.ensureAudio,
    getCanvases:host.getCanvases,captureMetadata:host.captureMetadata,
    async stage(id){
      await host.prepare();
      if(id==='field'){
        await host.enterPreset(CHUNK_SURF_GOD_PRESET.ALL_INSIGHTS);
        host.place(codePoint(MATERIAL.sourceField));
      }else if(id==='locked'){
        await host.enterPreset(CHUNK_SURF_GOD_PRESET.ALL_INSIGHTS);
        const runtime=host.runtime(),state=runtime.state(),o=state.landscapeOrigin;
        const at={x:o.x,y:o.y+sourceDivideZ(148)/CELL,yaw:Math.PI,pitch:-.22};
        state.sourceDivide={...state.sourceDivide,feet:SOURCE_BRAIDED_DIVIDE.upper,falling:false,fallVelocity:0};
        await host.activate(state,at);host.place(at);
      }else if(id==='glazed')await host.enterPreTape(Math.round(SOURCE_PRE_TAPE.stillLength*.55),'footstep empty approach');
      else if(id==='erased')await host.enterHorizon(32,'footstep horizon tape');
      else if(id==='body')await bodyStart();
      else if(id==='II')await host.beginII();
      else if(id==='IV')await host.beginIV(freshSourceIV({runId:host.getRunId(),returnPose:host.getPose()}));
      else throw Error('Unknown Source listening section.');
      await host.ready();
      return host.snapshot();
    },
  };
}
