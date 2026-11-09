import * as R3 from '../../src/render/r3d.js';
import {createSourceContinuationRenderer} from '../../src/render/source-continuation-renderer.js';
import {freshSourceContinuation} from '../../src/game/source-continuation.js';
import {createSourceContinuationScene} from '../../src/game/source-continuation-scene.js';
import {ARCHIPELAGO_ISLANDS} from '../../src/data/source-continuation-archipelago.js';
import {JOURNEY_PLACES} from '../../src/data/source-continuation-journey.js';

const destination=document.getElementById('destination'),heading=document.getElementById('heading'),status=document.getElementById('status'),hold=document.getElementById('hold'),map=document.getElementById('map');
const places=[{id:'ii-entry',name:'Source II — interlocked storeys',x:0,z:2,feet:0,level:0,chartId:0,phase:'wrong-return'},
  ...JOURNEY_PLACES.map(p=>({...p,...p.arrival,id:p.id,name:'Source II — '+p.name,phase:'wrong-return',level:0})),
  {id:'ii-service-corridor',name:'Source II — service corridor',x:-146,z:-73.8,feet:8.4,level:0,chartId:4,phase:'wrong-return'},
  {id:'iii-service-exit',name:'Source III — service exit',x:-133,z:-92,feet:8.4,level:0,chartId:0,phase:'catch'},
  ...ARCHIPELAGO_ISLANDS.map(p=>({...p,name:'Source III — '+p.name}))];
for(const place of places){const option=document.createElement('option');option.value=place.id;option.textContent=place.name;destination.append(option);}
destination.value='iii-arrival-court';
let initialized=false,scene=null,view=null,loading=false,last=performance.now(),lastStatus=0;
document.getElementById('load').onclick=async()=>{
  if(loading)return;loading=true;status.textContent='Loading production meshes…';
  try{
    if(!initialized){R3.r3dInit(map);initialized=true;}
    scene?.exit();
    const place=places.find(p=>p.id===destination.value),seed=freshSourceContinuation({runId:'map-render-review'});
    const pose={...place,phase:place.phase||'catch',yaw:Number(heading.value),pitch:-.08,status:'active',elapsed:.1};
    const checkpoint={...seed,...pose,lastSafe:{...pose},hush:{...seed.hush,active:false}};
    view=createSourceContinuationRenderer();
    scene=createSourceContinuationScene({checkpoint,renderer:view,onError:error=>{status.textContent=String(error.message||error);}});
    await scene.initialize();status.textContent=place.name+' — production renderer ready';
  }catch(error){status.textContent=String(error.stack||error);}finally{loading=false;}
};
heading.onchange=()=>scene?.setLook({yaw:Number(heading.value),pitch:-.08});
document.addEventListener('keydown',event=>{if(event.target.closest('header'))return;scene?.key(event);});
document.addEventListener('keyup',event=>scene?.keyup(event));
function frame(now){
  const dt=Math.min(.1,(now-last)/1000);last=now;
  if(scene&&!loading){if(!hold.checked)scene.update(dt);scene.render();if(now-lastStatus>1000){lastStatus=now;const state=scene.serialize(),diagnostics=view.diagnostics(),current=scene.view();status.textContent=current.error||`${state.phase} · x ${state.x.toFixed(1)} z ${state.z.toFixed(1)} · feet ${state.feet.toFixed(1)} · ${current.ready?'ready':'loading'}`;}}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
