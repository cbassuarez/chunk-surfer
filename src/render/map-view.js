// SI–1 survey console. Geometry and live facts come from the canonical model;
// this module only lays out instrument hardware and presents those facts.
import { uiDraw, uiText, uiWrap, uiWithClip } from './ui.js';
import { drawInstrumentWell, drawInstrumentGlass } from './instrument-material.js';
import { drawLampButton, drawVfdText } from './presentation.js';
import { drawPrintedText } from './keycap.js';
import { drawHardwarePrint } from './hardware-faceplate.js';
import { hardwareMotionReduced } from './hardware-material.js';
import { drawArchitecturalMap } from './map-architecture-view.js';
import { mapLayoutFromBag, mapConsoleControls } from './map-layout.js';
import { selectedMapSpace } from '../game/map-navigation.js';
import { mapFloor } from '../game/map-model.js';
import { mapActionRail } from '../game/map-actions.js';
import { fitText } from './fit-text.js';
import { BUILDING_MAP } from '../data/building-map.js';
import { roomHistoryText } from '../data/room-history.js';

const clip = (s, w) => fitText(String(s || ''), Math.max(1, Math.floor(w)));
const deviceRect = (r, {cellW,cellH,dpr}) => ({x:r.x*cellW*dpr,y:r.y*cellH*dpr,w:r.w*cellW*dpr,h:r.h*cellH*dpr,dpr});
const etch = (x,y,text,w,h=.7) => drawPrintedText(x,y,text,{w,h,ink:'#30372e',finish:'etched',darkPanel:false});

export function mapConsoleStatus(model) {
  const policy = model?.policy || {};
  const geometry = !!model?.architecture?.levels?.length;
  const plan = geometry && policy.showMapTopology !== false && policy.showMap !== false;
  const target = policy.showWaypoint !== false && !!model?.waypoint;
  const routeHeightUnknown=policy.showRoute && model?.route?.points?.length>1
    && model.route.points.some(point=>!Number.isFinite(point.height));
  const route = routeHeightUnknown?'ROUTE HEIGHT UNRESOLVED':policy.showRouteStatus
    ? model?.route?.status === 'ok' ? 'NEXT LEG AVAILABLE'
      : model?.route?.status === 'blocked' ? 'NEXT LEG BLOCKED' : 'ROUTE UNRESOLVED'
    : 'ROUTE ASSIST OFF';
  const restricted=policy.showMapTopology===false||policy.showMap===false;
  return {plan,target,route,planLabel:plan?'PLAN LOADED':restricted?'PLAN RESTRICTED':'PLAN UNAVAILABLE'};
}

function well(rect) { uiDraw(m => drawInstrumentWell(m.ctx,{...deviceRect(rect,m),depth:1})); }
function glass(rect) { uiDraw(m => drawInstrumentGlass(m.ctx,{...deviceRect(rect,m),depth:1,reflection:.45,grid:false,reducedMotion:hardwareMotionReduced()})); }

// Fixed annunciator windows have flat recessed lenses, not moving key caps.
// Their printed legends remain visible when the lamp is out. No hit is emitted.
function annunciator(rect,label,lit) {
  uiDraw(({ctx,cellW,cellH,dpr}) => {
    const r=deviceRect(rect,{cellW,cellH,dpr});
    ctx.fillStyle='#424a3e';ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.fillStyle='#080e0a';ctx.fillRect(r.x+dpr,r.y+dpr,r.w-2*dpr,r.h-2*dpr);
    const g=ctx.createLinearGradient(r.x,r.y,r.x,r.y+r.h);
    g.addColorStop(0,lit?'#c4d99c':'#58604d');g.addColorStop(.65,lit?'#e2edb6':'#91977d');g.addColorStop(1,lit?'#9eaf7e':'#616b52');
    ctx.fillStyle=g;ctx.fillRect(r.x+3*dpr,r.y+3*dpr,r.w-6*dpr,r.h-6*dpr);
    ctx.strokeStyle='#e7ebcc70';ctx.lineWidth=.6*dpr;ctx.strokeRect(r.x+3*dpr,r.y+3*dpr,r.w-6*dpr,r.h-6*dpr);
    drawHardwarePrint(ctx,label,r.x+4*dpr,r.y+4*dpr,{width:r.w-8*dpr,height:r.h-8*dpr,color:'#172017',align:'center',finish:'screenprint',dpr,seed:`si1:${label}`});
  });
}

function drawSelection(model,nav,layout,status) {
  const s=selectedMapSpace(nav,model),r=layout.detail;
  well(r);
  uiWithClip(r,()=>{
    if(model.offlineReason){uiText(r.x+.7,r.y+.25,clip('NO SURVEY LINK',r.w-1.4),'ui-secondary',.8);return;}
    const name=s?.label||'NO SPACE SELECTED';
    if(layout.mode==='compact') {
      uiText(r.x+.7,r.y+.12,clip(name,r.w*.6),'ui-primary',.94);
      const fact=s?.objective ? s.objective.recorded?'TAKE RECORDED':'TAKE OUTSTANDING' : s?.unknown?'UNIDENTIFIED':s?.visited?'VISITED':'NOT VISITED';
      const info=`${mapFloor(model,nav.floorId)?.label||'UNKNOWN'} · ${fact}`;
      if(layout.dense)uiText(r.x+r.w*.6,r.y+.12,clip(mapFloor(model,nav.floorId)?.label||'UNKNOWN',r.w*.4-.7),'ui-secondary',.9);
      else uiText(r.x+.7,r.y+.95,clip(info,r.w-1.4),'ui-secondary',.85);
    } else {
      uiText(r.x+.8,r.y+.25,'SELECTED SPACE','ui-secondary',.68);
      const scale=r.h>5?1.35:.95,lines=uiWrap(name,Math.max(4,Math.floor((r.w-1.6)/scale))).slice(0,2);
      lines.forEach((line,i)=>drawVfdText(r.x+.8,r.y+1.1+i*1.05,line,{scale,max:r.w-1.6,role:'ui-primary',alpha:1}));
      if(r.h>5)uiText(r.x+.8,r.y+3.6,clip(mapFloor(model,nav.floorId)?.label||'UNKNOWN',r.w-1.6),'ui-secondary',.9);
      if(r.h>6)uiText(r.x+.8,r.y+r.h-2.1,clip(status.route,r.w-1.6),'ui-secondary',.8);
      if(r.h>3.8) {
        const fact=s?.objective?s.objective.recorded?'TAKE RECORDED':'TAKE OUTSTANDING':s?.unknown?'UNIDENTIFIED':s?.visited?'VISITED':'NOT VISITED';
        uiText(r.x+.8,r.y+r.h-1.05,clip(fact,r.w-1.6),'ui-secondary',.88);
      }
    }
  });
  glass(r);
}

export function drawMapView({model,nav,bagLayout,now=0}) {
  const layout=mapLayoutFromBag(bagLayout),status=mapConsoleStatus(model);
  const offline=!!model.offlineReason;
  const controls=mapConsoleControls(layout,model,nav).map(c=>offline?{...c,enabled:false,lit:false}:c);
  well(layout.mapWindow);
  const selected=selectedMapSpace(nav,model);
  const file=nav.roomFile&&nav.roomFile.spaceId===selected?.id?roomHistoryText(selected):[];
  let drawing;
  if(file.length&&!offline){
    const v=layout.mapViewport,lines=file.flatMap(text=>[...uiWrap(text,Math.max(8,Math.floor(v.w))), '']);
    const capacity=Math.max(1,Math.floor(v.h)-1),pages=Math.ceil(lines.length/capacity);
    const page=Math.max(0,Math.min(pages-1,nav.roomFile.page||0));
    const attached=!!selected.objective?.notes?.length,buttonW=v.w/(attached?3:2);
    uiWithClip(v,()=>{
      lines.slice(page*capacity,(page+1)*capacity).forEach((line,i)=>uiText(v.x,v.y+i,line,'ui-primary',.94));
      ['‹ PREV','NEXT ›',...(attached?['OPEN SHEET']:[])].forEach((label,i)=>
        uiText(v.x+buttonW*i,v.y+v.h-1,clip(label,buttonW-1),'ui-secondary',.82));
    });
    drawing={projectedPoints:{},geometryAvailable:true,filePages:pages,filePage:page,hits:[
      {id:'bag:map:file-prev',kind:'map-control',action:'file-prev',x:v.x,y:v.y+v.h-1,w:buttonW,h:1},
      {id:'bag:map:file-next',kind:'map-control',action:'file-next',x:v.x+buttonW,y:v.y+v.h-1,w:buttonW,h:1},
      ...(attached?[{id:'bag:map:file-document',kind:'map-control',action:'file-document',x:v.x+buttonW*2,y:v.y+v.h-1,w:buttonW,h:1}]:[]),
    ]};
  }else drawing=offline?{hits:[],projectedPoints:{},geometryAvailable:false}:drawArchitecturalMap({model,nav,viewport:layout.mapViewport,now});
  const header=layout.progressRail,legend=layout.legendRail;
  if(!layout.dense)uiText(header.x,header.y,clip('ELLERY / SI–1 SURVEY',header.w*.58),'ui-secondary',.9);
  const progress=`${model.progress?.done||0}/${model.progress?.total||0} TAKES`;
  if(!layout.dense&&!offline)uiText(header.x+Math.max(0,header.w-progress.length),header.y,progress,'ui-secondary',.9);
  if(!layout.dense&&!offline)uiText(legend.x,legend.y,clip(file.length?`ROOM FILE · PAGE ${drawing.filePage+1}/${drawing.filePages}`:'▲ YOU   ◇ ROOM   ◆ TARGET',legend.w),'ui-secondary',.9);
  if(!file.length&&!layout.dense&&!offline&&legend.w>48)uiText(legend.x+legend.w-20,legend.y,'ORTHO / CUTAWAY','ui-secondary',.8);
  if(offline){
    const v=layout.mapViewport;
    uiText(v.x+1,v.y+1,clip('SURVEY INDICATOR OFFLINE',v.w-2),'ui-amber',.96);
    uiWrap(model.offlineReason,Math.max(8,Math.floor(v.w-2))).slice(0,Math.max(1,Math.floor(v.h-3)))
      .forEach((line,i)=>uiText(v.x+1,v.y+2.5+i,line,'ui-secondary',.9));
  }else if(!status.plan) {
    const v=layout.mapViewport;
    uiText(v.x+1,v.y+1,clip(model.fault||status.planLabel,v.w-2),'ui-amber',.96);
    uiText(v.x+1,v.y+2.2,clip(model.policy?.showMapTopology===false?'THIS SHIFT DOES NOT ISSUE A PLAN':'NO COMPILED SURVEY DATA',v.w-2),'ui-secondary',.9);
  }
  glass(layout.mapWindow);

  if(!layout.dense)for(const [i,label] of ['FLOOR SELECT','PROJECTION','POSITION / VIEW'].entries()) {
    const g=layout.groups[i];etch(g.x,g.y,label,g.w);
  }
  const ag=layout.groups[3],gap=.35,lw=(ag.w-gap)/2;
  if(layout.mode==='wide')etch(ag.x,ag.y,'INDICATION',ag.w);
  const ay=ag.y+(layout.mode==='wide'?.6:0);
  if(!layout.dense){
    annunciator({x:ag.x,y:ay,w:lw,h:ag.keyH},'PLAN',status.plan);
    annunciator({x:ag.x+lw+gap,y:ay,w:lw,h:ag.keyH},'TARGET',status.target);
  }
  drawSelection(model,nav,layout,status);
  for(const c of controls) drawLampButton(c.x,c.y,c.w,c.h,{controlId:c.id,legend:c.label,color:c.color,
    enabled:c.enabled,lit:c.lit,latched:false,focused:nav.focusedControlId===c.id,finish:c.color==='white'?'opaque':'lens'});
  const actions=mapActionRail(selectedMapSpace(nav,model),{roomFile:!!file.length,floorCount:model.floors?.length||1,width:bagLayout.actionRail?.w,consoleFocused:!!nav.focusedControlId,offline});
  return {...drawing,layout,selected:selectedMapSpace(nav,model),actions,status,
    hits:offline?[]:[...(!file.length?[{id:'bag:map:viewport',kind:'map-pan',...layout.mapViewport}]:[]),...(drawing.hits||[]),...controls]};
}

// The hardware remains present without its item; no invented values, targets,
// live lamps or usable controls imply a link that the player does not have.
export function drawMapOffline({bagLayout,reason,now=0}){
  return drawMapView({bagLayout,now,nav:{},model:{floors:BUILDING_MAP.floors,spaces:[],
    policy:{showMap:false,showWaypoint:false},offlineReason:reason}});
}
