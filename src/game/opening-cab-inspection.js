import * as scenes from './scenes.js';
import {uiDraw,uiInk,uiText,uiSize,uiWrap,uiScrim,uiWithClip} from '../render/ui.js';
import {drawLampButton,drawVfdText} from '../render/presentation.js';
import {pressControl,releaseControl,cancelControlScope} from './control-feedback.js';
import {createHitRegions} from '../render/hit-regions.js';
import {makeDocumentScene} from './document.js';
import {createItemInspection} from './item-inspection.js';
import {fieldKitInspection,normalizeFieldKit} from './field-kit.js';
import {TECHNIQUE_DEFS} from './combat-progression.js';
import {OPENING_VEHICLE,openingVehiclePoint} from '../data/opening-vehicle.js';
import {OPENING_CAB_ASSET,OPENING_CAB_PLACEMENT,OPENING_CAB_OBJECTS,OPENING_CAB_VISIBLE_OBJECTS,OPENING_CAB_DRIVER_DOOR,OPENING_CAB_REHEARSAL_NOTES,OPENING_CAB_PAPERS} from '../data/opening-cab-objects.js';
import {OPENING_CAB_GEOMETRY} from '../data/opening-cab-object-geometry.js';
import {workOrderAccepted} from './work-order-state.js';
import {registerBakedPaper} from './paper-assets.js';

export {OPENING_CAB_ASSET};
export const OPENING_CAB_REQUIRED_MESHES=Object.freeze(OPENING_CAB_GEOMETRY.meshes.map(row=>row.mesh));
const PAPER=OPENING_CAB_PLACEMENT.paper;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
const text=v=>typeof v==='string'?v.trim():'';
const list=v=>Array.isArray(v)?v:[];
const ink=(x,y,value,width,options)=>uiInk(x,y,String(value??'').slice(0,Math.max(0,Math.floor(width))),options);
const objectFor=id=>OPENING_CAB_OBJECTS.find(object=>object.id===id)||null;
const visibleIds=new Set(OPENING_CAB_VISIBLE_OBJECTS.map(object=>object.id));
for(const paper of OPENING_CAB_PAPERS)registerBakedPaper({id:paper.id,format:'A4',template:'cab-belonging',
  reproduction:'original',pages:[{path:`assets/opening-cab/${paper.id}.webp`,materialPath:`assets/opening-cab/${paper.id}-material.webp`}]});
const kitFor=normalizeFieldKit;
function chosen(row,kit){
  const s=row.selection||{},id=row.objectId;
  if(id==='recorder'){
    if(s.part==='faceplate')return s.option===(['black','olive'].includes(kit.cosmetics.faceplate)?kit.cosmetics.faceplate:'aluminum');
    if(s.part==='buttons')return s.option===(['signal','sea-glass'].includes(kit.cosmetics.buttons)?kit.cosmetics.buttons:'classic');
    return true;
  }
  if(id==='flashlight')return s.option===kit.flashlight&&(s.part!=='housing'||s.housing===kit.cosmetics.flashlightHousing);
  if(['headphones','microphone'].includes(id))return s.option===kit[id];
  if(id==='amp')return s.option===kit.recorder;
  return true;
}
function selectedRows(fieldKit){const kit=kitFor(fieldKit);return OPENING_CAB_GEOMETRY.meshes.filter(row=>visibleIds.has(row.objectId)&&chosen(row,kit));}
function boundsFor(rows){const min=[Infinity,Infinity,Infinity],max=min.map(()=>-Infinity);for(const row of rows)for(let k=0;k<3;k++){min[k]=Math.min(min[k],row.bounds.min[k]);max[k]=Math.max(max[k],row.bounds.max[k]);}return{min,max};}
const middle=b=>b.min.map((n,k)=>(n+b.max[k])/2);

// Every dynamic object passes through the ordinary world prop render and final
// dither. Mesh vertices and focus bounds use the same cab-local metre space.
export function openingCabInstances(anchor,{paperIndex=-1,fieldKit}={}){
  if(!anchor)return[];
  const paper=openingVehiclePoint(anchor,PAPER.point),yaw=anchor.yaw+PAPER.yaw,c=Math.cos(yaw)*PAPER.scale,s=Math.sin(yaw)*PAPER.scale;
  const rows=[{id:'opening:job-paper',mesh:'loose_note',x:paper.x,y:paper.y,z:paper.z,
    matrix:[c,0,s,0,0,PAPER.scale,0,0,-s,0,c,0,paper.x,paper.y,paper.z,1],paperIndex,zone:anchor.zone,structural:false,cullRadius:.7}];
  const origin=openingVehiclePoint(anchor,[0,0,0]),ca=Math.cos(anchor.yaw),sa=Math.sin(anchor.yaw),matrix=[ca,0,sa,0,0,1,0,0,-sa,0,ca,0,origin.x,origin.y,origin.z,1];
  for(const row of selectedRows(fieldKit))rows.push({id:'opening:cab:'+row.mesh,mesh:row.mesh,matrix:[...matrix],x:origin.x,y:origin.y,z:origin.z,
    zone:anchor.zone,structural:false,cullRadius:2,objectId:row.objectId});
  return rows;
}

export function openingCabTargets(anchor,{fieldKit}={}){
  if(!anchor)return[];
  const selected=selectedRows(fieldKit);
  return OPENING_CAB_VISIBLE_OBJECTS.map(object=>{
    let bounds,point;
    if(object.id==='job-papers'){
      point=[PAPER.point[0],PAPER.point[1]+.02,PAPER.point[2]];
      bounds={min:[point[0]-PAPER.halfX,point[1]-.012,point[2]-PAPER.halfZ],max:[point[0]+PAPER.halfX,point[1]+.012,point[2]+PAPER.halfZ]};
    }else if(object.id==='self-check')({bounds,point}=OPENING_CAB_GEOMETRY.targets['self-check']);
    else if(object.id==='radio'){bounds=OPENING_CAB_PLACEMENT.radio.bounds;point=OPENING_CAB_PLACEMENT.radio.point;}
    else{const parts=selected.filter(row=>row.objectId===object.id);bounds=boundsFor(parts);point=parts.find(row=>!row.selection?.part||row.selection.part==='body')?.focusPoint||middle(bounds);}
    return{...object,position:openingVehiclePoint(anchor,point),localPoint:[...point],bounds:copy(bounds),meshIds:object.id==='radio'?['opening_drive_radio']:selected.filter(row=>row.objectId===object.id).map(row=>row.mesh)};
  });
}
export function openingCabDoorTarget(anchor){
  if(!anchor)return null;
  return{type:'exit',id:OPENING_CAB_DRIVER_DOOR.id,label:OPENING_CAB_DRIVER_DOOR.label,
    position:openingVehiclePoint(anchor,OPENING_CAB_DRIVER_DOOR.point),
    localPoint:[...OPENING_CAB_DRIVER_DOOR.point],bounds:copy(OPENING_CAB_DRIVER_DOOR.bounds),
    meshIds:[OPENING_CAB_DRIVER_DOOR.mesh]};
}
function rayBox(origin,direction,bounds){
  let enter=0,leave=2.5;
  for(let k=0;k<3;k++){
    // A small surface tolerance makes a thin microphone selectable without
    // turning its whole case or a gap between instruments into a hit region.
    const pad=k===1?.008:.010,lo=bounds.min[k]-pad,hi=bounds.max[k]+pad;
    if(Math.abs(direction[k])<1e-8){if(origin[k]<lo||origin[k]>hi)return null;continue;}
    let a=(lo-origin[k])/direction[k],b=(hi-origin[k])/direction[k];if(a>b)[a,b]=[b,a];enter=Math.max(enter,a);leave=Math.min(leave,b);if(enter>leave)return null;
  }
  return enter>.05&&enter<2.5?enter:null;
}

// Separate world objects. No paper hit opens an equipment category, and no
// instrument can switch to another object while its close-up owns the view.
export function openingCabFocus(frame={},options={}){
  if(!['parked','seated'].includes(frame.phase)||!frame.anchor||!frame.eye||!finite(frame.yaw)||!finite(frame.pitch))return null;
  const anchor=frame.anchor,eye=Array.isArray(frame.eye)?{x:frame.eye[0],y:frame.eye[1],z:frame.eye[2]}:frame.eye,
    wx=eye.x-anchor.x,wz=eye.z-anchor.z,c=Math.cos(anchor.yaw),s=Math.sin(anchor.yaw),
    origin=[c*wx+s*wz,eye.y-anchor.y,-s*wx+c*wz-OPENING_VEHICLE.cabinMount[2]],
    relative=frame.yaw-anchor.yaw,direction=[Math.sin(relative)*Math.cos(frame.pitch),Math.sin(frame.pitch),-Math.cos(relative)*Math.cos(frame.pitch)];
  let nearest=null;
  for(const target of openingCabTargets(anchor,options).filter(target=>options.ready!==false||target.id==='radio')){
    let t;
    if(target.id==='job-papers'){
      if(direction[1]>=-.025)continue;t=(target.localPoint[1]-origin[1])/direction[1];if(t<=.05||t>=2.5)continue;
      const x=origin[0]+direction[0]*t-PAPER.point[0],z=origin[2]+direction[2]*t-PAPER.point[2],pc=Math.cos(PAPER.yaw),ps=Math.sin(PAPER.yaw);
      if(Math.abs(pc*x+ps*z)>PAPER.halfX+.015||Math.abs(-ps*x+pc*z)>PAPER.halfZ+.015)continue;
    }else t=rayBox(origin,direction,target.bounds);
    if(t!=null&&(!nearest||t<nearest.distance))nearest={type:'inspect',id:target.id,label:target.label,position:target.position,distance:t};
  }
  if(nearest)return nearest;
  const handle=openingCabDoorTarget(anchor),distance=rayBox(origin,direction,handle.bounds);
  if(distance!=null)return{...handle,distance};
  return null;
}

export function openingCabInspectionModel(value={},id='job-papers'){
  const state=value&&typeof value==='object'?value:{},object=objectFor(id)||objectFor('job-papers'),flags=state.flags||{},recordist=state.recordist||{},build=state.build||{};
  const facts=[];
  if(finite(recordist.composure))facts.push(['COMPOSURE',finite(recordist.composureCeiling)?`${recordist.composure} / ${recordist.composureCeiling}`:String(recordist.composure)]);
  if(finite(recordist.injuries))facts.push(['INJURIES',String(Math.max(0,Math.floor(recordist.injuries)))]);
  if(finite(build.unspent))facts.push(['SPARE LEADS',String(Math.max(0,Math.floor(build.unspent)))]);
  const techniques=TECHNIQUE_DEFS.filter(t=>list(build.techniques).includes(t.id)).map(t=>({id:t.id,label:t.label,detail:t.detail,branch:t.branch,tier:t.tier}));
  const notes=list(state.journal).map(entry=>({id:text(entry.id),title:text(entry.title),summary:text(entry.summary),next:text(entry.next),outcome:text(entry.closure?.text)||text(entry.outcome),state:text(entry.status?.label)||text(entry.state)}));
  let instrument=null;
  if(object.kind==='instrument'){
    const entry=fieldKitInspection(state.fieldKit,object.group),equipmentFacts=entry.facts.filter(f=>f?.[0]!=='BATTLE'&&f?.[0]!=='POSITION');
    if(object.id==='recorder'){
      if(finite(recordist.battery))equipmentFacts.push(['FIELD CELL',`${Math.round(Math.max(0,Math.min(1,recordist.battery))*100)}%`]);
      if(typeof recordist.monitoring==='boolean')equipmentFacts.push(['MONITOR',recordist.monitoring?'ON':'OFF']);
      if(typeof recordist.recording==='boolean')equipmentFacts.push(['TRANSPORT',recordist.recording?'RECORDING':'STOPPED']);
    }
    instrument={...entry,sourceId:entry.id,facts:equipmentFacts,battleCapable:false};
  }
  const document=object.id==='job-papers'?state.workOrder||null:OPENING_CAB_PAPERS.find(paper=>paper.id===object.documentId)||null,
    radio=object.kind==='radio'?state.cabRadio||{}:null;
  return{id:object.id,kind:object.kind,label:object.label,readOnly:object.kind!=='radio',workOrder:object.id==='job-papers'?document:null,document,
    accepted:workOrderAccepted(flags),instrument,facts:object.kind==='status'?facts:[],techniques:object.kind==='status'?techniques:[],
    notes:object.kind==='notes'?notes:[],rehearsalNotes:object.kind==='notes'?[...OPENING_CAB_REHEARSAL_NOTES]:[],destination:object.kind==='notes'?text(state.guidance?.label):'',
    radio:radio?{on:typeof radio.on==='boolean'?radio.on:null,playing:radio.playing===true,station:text(radio.station),programme:text(radio.programme),
      volume:finite(radio.volume)?Math.round(Math.max(0,Math.min(1,radio.volume))*100):null,
      selectedStation:text(radio.selectedStation),stations:list(radio.stations).filter(station=>text(station?.id)).map(station=>({id:text(station.id),label:text(station.label),programme:text(station.programme)}))}:null,
    // The mirror is a physical interaction target for the established status
    // convention, not a claim that a live face/reflection is being simulated.
    reflectionSimulated:false};
}

export function openingCabInspectionLayout({cols=80,rows=30}={}){
  cols=Math.max(20,cols||80);rows=Math.max(12,rows||30);
  const x=Math.max(1,Math.floor(cols*.075)),y=1,w=cols-x*2,h=rows-3;
  return{x,y,w,h,body:{x:x+2,y:y+3,w:w-4,h:Math.max(2,h-6)},footer:{x:x+2,y:y+h-1,w:w-4}};
}

export function openingCabRadioLayout({cols=80,rows=30}={},radio={},enabled=true){
  cols=Math.max(20,Number(cols)||80);rows=Math.max(12,Number(rows)||30);
  const w=Math.min(74,cols-2),h=Math.min(13,rows-3),x=(cols-w)/2,y=(rows-h)/2,
    panel={x,y,w,h,body:{x:x+2,y:y+2,w:w-4,h:h-5},footer:{x:x+2,y:y+h-1,w:w-4}},
    keyH=1.2,actionY=panel.footer.y-2.4,presetY=actionY-keyH-.3,gap=.35,stations=list(radio.stations),
    presetW=(panel.body.w-Math.max(0,stations.length-1)*gap)/Math.max(1,stations.length),
    selected=radio.selectedStation||radio.station,
    presets=stations.map((station,index)=>({id:'cab-radio:preset:'+station.id,stationId:station.id,
      x:panel.body.x+index*(presetW+gap),y:presetY,w:presetW,h:keyH,label:station.label||String(index+1),code:String(index+1),
      enabled:enabled&&!!station.id,selected:station.id===selected,action:{type:'station',id:station.id}})),
    actionW=(panel.body.w-2*gap)/3,
    actions=[{id:'cab-radio:power',label:'POWER',code:'SPACE',action:{type:'power'},lit:radio.on===true,color:'blue'},
      {id:'cab-radio:volume-down',label:'VOL −',code:'S / ↓',action:{type:'volume',delta:-.1}},
      {id:'cab-radio:volume-up',label:'VOL +',code:'W / ↑',action:{type:'volume',delta:.1}}]
      .map((control,index)=>({...control,x:panel.body.x+index*(actionW+gap),y:actionY,w:actionW,h:keyH,enabled}));
  return{panel,readout:{x:panel.body.x,y:y+1.4,w:panel.body.w,h:presetY-y-1.65},presets,actions,
    controls:[...presets,...actions],hint:{x:panel.body.x,y:panel.footer.y-1.0,w:panel.body.w}};
}

export function makeOpeningCabInspectionScene({id='job-papers',getState=()=>({}),onClose=()=>{},onCabRadioAction=null,makeReader=makeDocumentScene,makeInspection=createItemInspection}={}){
  const object=objectFor(id)||objectFor('job-papers');let scroll=0,closed=false,reader=null,readerId=null,inspection=null,inspectionKey=null;
  const hits=createHitRegions();let pointerPress=null,radioFocus=null;
  const model=()=>openingCabInspectionModel(getState(),object.id);
  function close(){if(closed)return;closed=true;cancelControlScope('cab-radio:');inspection?.dispose?.();inspection=null;scenes.remove(scene);onClose();}
  function paper(m){const doc=m.document||m.workOrder;if(!doc)return null;if(readerId!==doc.id){reader=makeReader(doc,{id:'opening-cab-'+doc.id+'-preview',reservedTopRows:2,onRequestClose:close,onSceneClose:()=>{},onSceneTurn:()=>{}});readerId=doc.id;reader?.enter?.();}return reader;}
  function instrument(m){const entry=m.instrument,key=JSON.stringify(entry);if(entry&&inspectionKey!==key){inspection?.dispose?.();inspection=makeInspection(entry);inspectionKey=key;}return inspection;}
  function radioAction(action,controlId=null){
    if(closed||object.kind!=='radio'||typeof onCabRadioAction!=='function')return false;
    if(controlId)pressControl(controlId,{held:false});
    try{return onCabRadioAction({...action})!==false;}catch{return false;}
  }
  function regions(){
    const layout=object.kind==='radio'?openingCabRadioLayout(uiSize(),model().radio,typeof onCabRadioAction==='function'):null,
      l=layout?.panel||openingCabInspectionLayout(uiSize());hits.reset();
    hits.add({id:'cab-object:close',label:'RETURN TO CAB',x:l.footer.x,y:l.footer.y,w:Math.min(24,l.footer.w),h:1.4,onClick:close});
    for(const control of layout?.controls||[])hits.add({...control,disabled:!control.enabled,onClick:()=>radioAction(control.action)});
    return l;
  }
  function lines(m){
    if(m.kind==='status')return[...m.facts.map(([a,b])=>`${a}   ${b}`),'','PATCHED TECHNIQUES',...m.techniques.flatMap(t=>[t.label,t.detail,'']),...(!m.techniques.length?['No leads patched.']:[])];
    if(m.kind==='radio')return['POWER   '+(m.radio.on===true?'ON':m.radio.on===false?'OFF':'—'),
      ...(m.radio.station?['STATION   '+m.radio.station]:[]),...(m.radio.volume==null?[]:['VOLUME   '+m.radio.volume+'%']),
      '',m.radio.playing?'NOW PLAYING':m.radio.on?'WAITING FOR SIGNAL':'',m.radio.programme];
    return['REHEARSAL',...m.rehearsalNotes.flatMap(line=>[line,'']),
      ...(m.notes.length?['TONIGHT',...m.notes.flatMap(n=>[n.title.toUpperCase(),n.summary,...(n.next?[n.next]:[]),...(n.outcome?[n.outcome]:[]),''])]:[]),
      ...(m.destination?['NEXT',m.destination]:[])];
  }
  const scene={id:'opening-cab-inspection',blocksInput:true,blocksWorld:true,freezesBelow:true,suppressesHud:true,handlesEscape:true,allowsLook:false,worldPresentation:'visible',lookProfile:'calm',
    enter(){const m=model();if(m.kind==='document')paper(m);},
    update(dt){if(!closed&&object.kind==='document')reader?.update?.(Math.max(0,Number(dt)||0));},
    view(){const m=model();regions();return{id:object.id,objectId:object.id,kind:object.kind,closed,scroll,readOnly:m.readOnly,model:copy(m),paper:reader?.view?.()||null,hitRegions:hits.view()};},
    key(e={}){
      if(closed)return true;e.preventDefault?.();const k=String(e.key||e.code||'').toLowerCase().replace(/^key/,''),action=e.controllerAction;
      if(e.ctrlKey||e.metaKey||e.altKey)return true;
      if(e.repeat&&(['e','escape'].includes(k)||['interact','back'].includes(action)))return true;
      if(k==='e'||action==='interact'){close();return true;}
      if(k==='escape'||action==='back'){if(object.kind==='document'&&reader?.view?.().reading)reader.key(e);else close();return true;}
      if(object.kind==='radio'){
        if(e.repeat)return true;
        const m=model(),stations=m.radio.stations,index=Number(k.replace(/^digit/,''))-1;
        if(/^(?:digit)?[1-9]$/.test(k)&&stations[index])radioAction({type:'station',id:stations[index].id},'cab-radio:preset:'+stations[index].id);
        else if(['a','arrowleft'].includes(k)||action==='selectLeft')radioAction({type:'station',delta:-1},'cab-radio:tune');
        else if(['d','arrowright'].includes(k)||action==='selectRight')radioAction({type:'station',delta:1},'cab-radio:tune');
        else if(['w','arrowup'].includes(k)||action==='selectUp')radioAction({type:'volume',delta:.1},'cab-radio:volume-up');
        else if(['s','arrowdown'].includes(k)||action==='selectDown')radioAction({type:'volume',delta:-.1},'cab-radio:volume-down');
        else if([' ','space'].includes(k)||action==='confirm')radioAction({type:'power'},'cab-radio:power');
        return true;
      }
      if(k==='tab'||/^(?:digit)?[1-9]$/.test(k)||['tabNext','tabPrev'].includes(action))return true;
      const m=model();if(object.kind==='document'){paper(m)?.key?.(e);return true;}
      if(object.kind==='instrument'){instrument(m)?.key?.(e);return true;}
      const down=k==='arrowdown'||k==='s'||action==='selectDown',up=k==='arrowup'||k==='w'||action==='selectUp';
      if(down)scroll++;else if(up)scroll=Math.max(0,scroll-1);else if(k==='pagedown')scroll+=6;else if(k==='pageup')scroll=Math.max(0,scroll-6);return true;
    },
    keyup(){return true;},
    pointer(e={}){
      if(closed)return true;regions();if(e.type==='pointercancel'||e.type==='lostpointercapture'){pointerPress=null;cancelControlScope('cab-radio:');inspection?.pointer?.(e);return true;}
      const hit=hits.hit(e.cellX,e.cellY);if(e.type==='pointermove')radioFocus=hit?.id||null;
      if(e.type==='pointerdown'&&(e.button==null||e.button===0)){pointerPress=hit&&!hit.disabled?{id:hit.id,pointerId:e.pointerId}:null;if(pointerPress?.id.startsWith('cab-radio:'))pressControl(pointerPress.id);if(!hit)inspection?.pointer?.(e);}
      else if(e.type==='pointerup'){const pressed=pointerPress;pointerPress=null;if(pressed?.id.startsWith('cab-radio:'))releaseControl(pressed.id);if((e.button==null||e.button===0)&&pressed&&pressed.id===hit?.id&&pressed.pointerId===e.pointerId&&!hit.disabled)hit.onClick?.();else inspection?.pointer?.(e);}else inspection?.pointer?.(e);return true;
    },
    render(){
      if(closed)return;const m=model(),l=regions();
      if(m.kind==='document'&&paper(m)){reader.render();uiText(l.x,1,m.id==='job-papers'?(m.accepted?'4417-C / WORK ORDER':'4417-C / BEFORE CHECK-IN'):m.document.title.toUpperCase(),'ui-label',.85,l.w);uiText(l.footer.x,l.footer.y,'E RETURN TO CAB','ui-label',.85,l.footer.w);return;}
      uiScrim(m.kind==='status'?.76:.84);
      uiDraw(({ctx,cellW,cellH,dpr})=>{
        const x=l.x*cellW*dpr,y=l.y*cellH*dpr,w=l.w*cellW*dpr,h=l.h*cellH*dpr;
        ctx.save();ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=20*dpr;ctx.shadowOffsetY=5*dpr;
        ctx.fillStyle=m.kind==='notes'?'#d8cfb8':'#151b18';ctx.fillRect(x,y,w,h);ctx.shadowColor='transparent';ctx.strokeStyle=m.kind==='notes'?'rgba(72,62,43,.25)':'rgba(168,180,160,.2)';ctx.lineWidth=dpr;ctx.strokeRect(x+.5*dpr,y+.5*dpr,w-dpr,h-dpr);
        if(m.kind==='notes'){ctx.fillStyle='#233d43';ctx.fillRect(x-5*dpr,y,5*dpr,h);ctx.strokeStyle='rgba(65,81,95,.15)';for(let row=l.body.y;row<l.footer.y;row++){ctx.beginPath();ctx.moveTo(x+cellW*dpr,(row+1)*cellH*dpr);ctx.lineTo(x+w-cellW*dpr,(row+1)*cellH*dpr);ctx.stroke();}}
        ctx.restore();
      });
      const color=m.kind==='notes'?'#463d2d':'#c5c9b9';
      ink(l.x+2,l.y+.5,m.kind==='notes'?'NOTEBOOK':m.kind==='status'?'CHECK YOURSELF':m.kind==='radio'?'RADIO':m.instrument?.title||'INSTRUMENT',l.w-4,{color,weight:'bold'});
      if(m.kind==='radio'){
        const radio=m.radio,r=openingCabRadioLayout(uiSize(),radio,typeof onCabRadioAction==='function'),selected=radio.stations.find(station=>station.id===(radio.selectedStation||radio.station)),
          title=selected?.label||radio.station||'RECEIVER',programme=radio.programme||selected?.programme||'',status=radio.on===false?'POWER OFF':radio.playing?'PLAYING':radio.on?'TUNING':'SIGNAL UNKNOWN';
        uiWithClip(r.readout,()=>{
          drawVfdText(r.readout.x,r.readout.y,title,{role:'ui-primary',scale:1,alpha:radio.on===false?.4:.95});
          const rows=uiWrap(programme,Math.floor(r.readout.w));rows.slice(0,Math.max(1,Math.floor(r.readout.h)-2)).forEach((line,i)=>uiText(r.readout.x,r.readout.y+1+i,line,'ui-primary',.9));
          if(r.readout.h>=3)uiText(r.readout.x,r.readout.y+r.readout.h-1,`${status}${radio.volume==null?'':' · '+radio.volume+'%'}`,'ui-secondary',.78);
        });
        for(const control of r.controls)drawLampButton(control.x,control.y,control.w,control.h,{controlId:control.id,
          legend:control.w<7&&control.stationId?control.code:control.label,code:control.w<7?'':control.code,
          color:control.color||'white',finish:control.color?'lens':'opaque',enabled:control.enabled,focused:radioFocus===control.id,
          latched:!!control.selected,lit:control.stationId?control.selected&&radio.on===true:!!control.lit});
        ink(r.hint.x,r.hint.y,'A / D TUNE',r.hint.w,{color:'#929b8d'});
      }else if(m.kind==='instrument'){
        const entry=m.instrument,wide=l.body.w>=50,portrait={x:l.body.x,y:l.body.y,w:wide?Math.floor(l.body.w*.49):l.body.w,h:Math.max(2,wide?l.body.h:Math.min(7,l.body.h*.45))};
        instrument(m)?.draw?.(portrait,{active:!scenes.isFrozen(scene)});
        let y=wide?l.body.y:portrait.y+portrait.h+.5,x=wide?portrait.x+portrait.w+2:l.body.x,w=wide?l.body.w-portrait.w-2:l.body.w;
        for(const line of[entry?.description,...(entry?.facts||[]).map(f=>f.join(' / '))].filter(Boolean))for(const row of uiWrap(line,w))if(y<l.body.y+l.body.h)uiInk(x,y++,row,{color});
        ink(l.footer.x,l.footer.y-1,'DRAG / ARROWS ROTATE · R RESET',l.footer.w,{color:'#929b8d'});
      }else{
        const rows=lines(m).flatMap(v=>v?uiWrap(v,l.body.w):['']),capacity=Math.max(1,Math.floor(l.body.h));scroll=Math.min(scroll,Math.max(0,rows.length-capacity));
        rows.slice(scroll,scroll+capacity).forEach((line,i)=>ink(l.body.x,l.body.y+i,line,l.body.w,{color}));
      }
      ink(l.footer.x,l.footer.y,'E RETURN TO CAB',l.footer.w,{color});
    },
    suspend(){pointerPress=null;radioFocus=null;cancelControlScope('cab-radio:');},
    blur(){pointerPress=null;radioFocus=null;cancelControlScope('cab-radio:');},
    exit(){closed=true;pointerPress=null;cancelControlScope('cab-radio:');inspection?.dispose?.();inspection=null;},
  };return scene;
}
