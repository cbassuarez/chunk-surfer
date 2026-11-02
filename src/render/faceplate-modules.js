// One physical FN–12 belongs to the visible device stack. Panels borrow its
// reserved content area; they do not manufacture new clocks or hidden-world
// telemetry. The host supplies one canonical current-run snapshot per frame.
import {uiPhysicalSize,uiSetLayoutSize,uiWithLayoutSize,uiDrawHardware} from './ui.js';
import {drawMinimap,drawMinimapInset} from './minimap.js';
import {drawNavigatorClock} from './navigator-clock.js';
import {drawNavigatorTelemetry} from './navigator-telemetry.js';
import {drawInstrumentPlate,drawInstrumentWell,drawInstrumentGlass} from './instrument-material.js';
import {drawHardwarePrint} from './hardware-faceplate.js';
import {beginFaceplateModuleState,claimFaceplateModulePaint,faceplateModuleStatus} from './faceplate-module-state.js';

export {faceplateModuleStatus} from './faceplate-module-state.js';

// Layout remains installed after paint so keyboard pagination and pointer
// hitboxes use precisely the dimensions the panel was rendered against. This
// changes no pixel/cell transform. Call every frame, including disabled frames.
export function beginFaceplateModuleFrame(snapshot={},size=uiPhysicalSize()){
  const frame=beginFaceplateModuleState(snapshot,size);
  uiSetLayoutSize(frame.enabled?frame.layout.contentSize:null);
  return faceplateModuleStatus();
}

const physical=(box,{cellW,cellH,dpr})=>({x:box.x*cellW*dpr,y:box.y*cellH*dpr,w:box.w*cellW*dpr,h:box.h*cellH*dpr,dpr});
const unresolvedMap=()=>({player:{resolved:false,position:null,floorId:null},floors:[],spaces:[],contacts:[]});
function paintCompact(frame){
  const {layout,context}=frame;
  uiDrawHardware(metrics=>{
    drawInstrumentPlate(metrics.ctx,{...physical(layout.territory,metrics),seed:'fn12-common',screwRadius:2.3*metrics.dpr});
    drawInstrumentWell(metrics.ctx,{...physical(layout.map,metrics),depth:.8});
    const box=physical(layout.identity,metrics);
    drawHardwarePrint(metrics.ctx,'AUDIOCORP FN-12',box.x,box.y,{width:box.w,height:box.h,
      color:'#333830',finish:'etched',darkPanel:false,dpr:metrics.dpr*Math.min(1,metrics.cellH/20)});
  });
  drawMinimapInset(context.map||unresolvedMap(),{bounds:layout.map,now:context.now,
    radius:context.radius,navigationVisible:context.map?context.navigationVisible:false,mapStatus:context.mapStatus||'NO FIX',
    mischief:context.mischief,apparitions:context.apparitions});
  uiDrawHardware(metrics=>drawInstrumentGlass(metrics.ctx,{...physical(layout.map,metrics),depth:.8}));
  drawNavigatorTelemetry(layout.lcd,context.telemetry,{nowMs:context.now,paused:context.held});
  if(context.nightClock)drawNavigatorClock(layout.clockHousing,context.nightClock,{identity:false});
}

export function endFaceplateModuleFrame(){
  const frame=claimFaceplateModulePaint();
  if(!frame)return faceplateModuleStatus();
  uiWithLayoutSize(frame.layout.physicalSize,()=>{
    const {context,layout}=frame;
    if(layout.mode==='bottom')paintCompact(frame);
    else drawMinimap(context.map||unresolvedMap(),{module:true,bounds:layout.navigator,now:context.now,
      radius:context.radius,navigationVisible:context.map?context.navigationVisible:false,mapStatus:context.mapStatus||'NO FIX',
      source:context.source,telemetry:context.telemetry,mischief:context.mischief,apparitions:context.apparitions});
  });
  return faceplateModuleStatus();
}
