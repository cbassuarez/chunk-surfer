import * as scenes from './scenes.js';
import {uiDraw,uiInk,uiText,uiSize,uiWrap,uiScrim} from '../render/ui.js';
import {createHitRegions} from '../render/hit-regions.js';
import {makeDocumentScene} from './document.js';
import {createItemInspection} from './item-inspection.js';
import {fieldKitInspection,normalizeFieldKit} from './field-kit.js';
import {TECHNIQUE_DEFS} from './combat-progression.js';
import {OPENING_VEHICLE,openingVehiclePoint} from '../data/opening-vehicle.js';
import {OPENING_CAB_ASSET,OPENING_CAB_PLACEMENT,OPENING_CAB_OBJECTS} from '../data/opening-cab-objects.js';
import {OPENING_CAB_GEOMETRY} from '../data/opening-cab-object-geometry.js';
import {workOrderAccepted} from './work-order-state.js';

export {OPENING_CAB_ASSET};
export const OPENING_CAB_REQUIRED_MESHES=Object.freeze(OPENING_CAB_GEOMETRY.meshes.map(row=>row.mesh));
const PAPER=OPENING_CAB_PLACEMENT.paper;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
const text=v=>typeof v==='string'?v.trim():'';
const list=v=>Array.isArray(v)?v:[];
const ink=(x,y,value,width,options)=>uiInk(x,y,String(value??'').slice(0,Math.max(0,Math.floor(width))),options);
const objectFor=id=>OPENING_CAB_OBJECTS.find(object=>object.id===id)||null;
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
function selectedRows(fieldKit){const kit=kitFor(fieldKit);return OPENING_CAB_GEOMETRY.meshes.filter(row=>chosen(row,kit));}
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
  return OPENING_CAB_OBJECTS.map(object=>{
    let bounds,point;
    if(object.id==='job-papers'){
      point=[PAPER.point[0],PAPER.point[1]+.02,PAPER.point[2]];
      bounds={min:[point[0]-PAPER.halfX,point[1]-.012,point[2]-PAPER.halfZ],max:[point[0]+PAPER.halfX,point[1]+.012,point[2]+PAPER.halfZ]};
    }else if(object.id==='self-check')({bounds,point}=OPENING_CAB_GEOMETRY.targets['self-check']);
    else{const parts=selected.filter(row=>row.objectId===object.id);bounds=boundsFor(parts);point=parts.find(row=>!row.selection?.part||row.selection.part==='body')?.focusPoint||middle(bounds);}
    return{...object,position:openingVehiclePoint(anchor,point),localPoint:[...point],bounds:copy(bounds),meshIds:selected.filter(row=>row.objectId===object.id).map(row=>row.mesh)};
  });
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
  if(!['parked','seated'].includes(frame.phase)||!frame.anchor||!frame.eye||!finite(frame.yaw)||!finite(frame.pitch)||options.ready===false)return null;
  const anchor=frame.anchor,eye=Array.isArray(frame.eye)?{x:frame.eye[0],y:frame.eye[1],z:frame.eye[2]}:frame.eye,
    wx=eye.x-anchor.x,wz=eye.z-anchor.z,c=Math.cos(anchor.yaw),s=Math.sin(anchor.yaw),
    origin=[c*wx+s*wz,eye.y-anchor.y,-s*wx+c*wz-OPENING_VEHICLE.cabinMount[2]],
    relative=frame.yaw-anchor.yaw,direction=[Math.sin(relative)*Math.cos(frame.pitch),Math.sin(frame.pitch),-Math.cos(relative)*Math.cos(frame.pitch)];
  let nearest=null;
  for(const target of openingCabTargets(anchor,options)){
    let t;
    if(target.id==='job-papers'){
      if(direction[1]>=-.025)continue;t=(target.localPoint[1]-origin[1])/direction[1];if(t<=.05||t>=2.5)continue;
      const x=origin[0]+direction[0]*t-PAPER.point[0],z=origin[2]+direction[2]*t-PAPER.point[2],pc=Math.cos(PAPER.yaw),ps=Math.sin(PAPER.yaw);
      if(Math.abs(pc*x+ps*z)>PAPER.halfX+.015||Math.abs(-ps*x+pc*z)>PAPER.halfZ+.015)continue;
    }else t=rayBox(origin,direction,target.bounds);
    if(t!=null&&(!nearest||t<nearest.distance))nearest={type:'inspect',id:target.id,label:target.label,position:target.position,distance:t};
  }
  if(nearest)return nearest;
  const handle=openingVehiclePoint(anchor,[.82,1.17,.30]),dx=handle.x-eye.x,dz=handle.z-eye.z,d=Math.hypot(dx,dz),pitch=Math.atan2(handle.y-eye.y,d);
  if(Math.cos(Math.atan2(dx,-dz)-frame.yaw)>Math.cos(.23)&&Math.abs(pitch-frame.pitch)<.22)return{type:'exit',id:'driver-door',label:'STEP OUT OF THE VAN',position:handle};
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
  return{id:object.id,kind:object.kind,label:object.label,readOnly:true,workOrder:object.kind==='document'?state.workOrder||null:null,
    accepted:workOrderAccepted(flags),instrument,facts:object.kind==='status'?facts:[],techniques:object.kind==='status'?techniques:[],
    notes:object.kind==='notes'?notes:[],destination:object.kind==='notes'?text(state.guidance?.label):'',
    // The mirror is a physical interaction target for the established status
    // convention, not a claim that a live face/reflection is being simulated.
    reflectionSimulated:false};
}

export function openingCabInspectionLayout({cols=80,rows=30}={}){
  cols=Math.max(20,cols||80);rows=Math.max(12,rows||30);
  const x=Math.max(1,Math.floor(cols*.075)),y=1,w=cols-x*2,h=rows-3;
  return{x,y,w,h,body:{x:x+2,y:y+3,w:w-4,h:Math.max(2,h-6)},footer:{x:x+2,y:y+h-1,w:w-4}};
}

export function makeOpeningCabInspectionScene({id='job-papers',getState=()=>({}),onClose=()=>{},makeReader=makeDocumentScene,makeInspection=createItemInspection}={}){
  const object=objectFor(id)||objectFor('job-papers');let scroll=0,closed=false,reader=null,readerId=null,inspection=null,inspectionKey=null;
  const hits=createHitRegions();let pointerPress=null;
  const model=()=>openingCabInspectionModel(getState(),object.id);
  function close(){if(closed)return;closed=true;inspection?.dispose?.();inspection=null;scenes.remove(scene);onClose();}
  function paper(m){if(!m.workOrder)return null;if(readerId!==m.workOrder.id){reader=makeReader(m.workOrder,{id:'opening-cab-work-order-preview',reservedTopRows:2,onRequestClose:close,onSceneClose:()=>{},onSceneTurn:()=>{}});readerId=m.workOrder.id;reader?.enter?.();}return reader;}
  function instrument(m){const entry=m.instrument,key=JSON.stringify(entry);if(entry&&inspectionKey!==key){inspection?.dispose?.();inspection=makeInspection(entry);inspectionKey=key;}return inspection;}
  function regions(){const l=openingCabInspectionLayout(uiSize());hits.reset();hits.add({id:'cab-object:close',label:'RETURN TO CAB',x:l.footer.x,y:l.footer.y,w:Math.min(24,l.footer.w),h:1.4,onClick:close});return l;}
  function lines(m){
    if(m.kind==='status')return[...m.facts.map(([a,b])=>`${a}   ${b}`),'','PATCHED TECHNIQUES',...m.techniques.flatMap(t=>[t.label,t.detail,'']),...(!m.techniques.length?['No leads patched.']:[])];
    return[...(m.destination?['NEXT',m.destination,'']:[]),...m.notes.flatMap(n=>[n.title.toUpperCase(),n.summary,...(n.next?[n.next]:[]),...(n.outcome?[n.outcome]:[]),'']),...(!m.notes.length?['Nothing else noted.']:[])];
  }
  const scene={id:'opening-cab-inspection',blocksInput:true,blocksWorld:true,freezesBelow:true,suppressesHud:true,handlesEscape:true,allowsLook:false,worldPresentation:'visible',lookProfile:'calm',
    enter(){const m=model();if(m.kind==='document')paper(m);},
    update(dt){if(!closed&&object.kind==='document')reader?.update?.(Math.max(0,Number(dt)||0));},
    view(){const m=model();regions();return{id:object.id,objectId:object.id,kind:object.kind,closed,scroll,readOnly:true,model:copy(m),paper:reader?.view?.()||null,hitRegions:hits.view()};},
    key(e={}){
      if(closed)return true;e.preventDefault?.();const k=String(e.key||e.code||'').toLowerCase().replace(/^key/,''),action=e.controllerAction;
      if(e.repeat&&(['e','escape'].includes(k)||['interact','back'].includes(action)))return true;
      if(k==='e'||action==='interact'){close();return true;}
      if(k==='escape'||action==='back'){if(object.kind==='document'&&reader?.view?.().reading)reader.key(e);else close();return true;}
      if(k==='tab'||/^(?:digit)?[1-9]$/.test(k)||['tabNext','tabPrev'].includes(action))return true;
      const m=model();if(object.kind==='document'){paper(m)?.key?.(e);return true;}
      if(object.kind==='instrument'){instrument(m)?.key?.(e);return true;}
      const down=k==='arrowdown'||k==='s'||action==='selectDown',up=k==='arrowup'||k==='w'||action==='selectUp';
      if(down)scroll++;else if(up)scroll=Math.max(0,scroll-1);else if(k==='pagedown')scroll+=6;else if(k==='pageup')scroll=Math.max(0,scroll-6);return true;
    },
    keyup(){return true;},
    pointer(e={}){
      if(closed)return true;regions();if(e.type==='pointercancel'||e.type==='lostpointercapture'){pointerPress=null;inspection?.pointer?.(e);return true;}
      const hit=hits.hit(e.cellX,e.cellY);if(e.type==='pointerdown'&&(e.button==null||e.button===0)){pointerPress=hit?{id:hit.id,pointerId:e.pointerId}:null;if(!hit)inspection?.pointer?.(e);}
      else if(e.type==='pointerup'){const pressed=pointerPress;pointerPress=null;if(pressed&&pressed.id===hit?.id&&pressed.pointerId===e.pointerId)hit.onClick?.();else inspection?.pointer?.(e);}else inspection?.pointer?.(e);return true;
    },
    render(){
      if(closed)return;const m=model(),l=regions();
      if(m.kind==='document'&&paper(m)){reader.render();uiText(l.x,1,m.accepted?'4417-C / WORK ORDER':'4417-C / BEFORE CHECK-IN','ui-label',.85,l.w);uiText(l.footer.x,l.footer.y,'E RETURN TO CAB','ui-label',.85,l.footer.w);return;}
      uiScrim(m.kind==='status'?.76:.84);
      uiDraw(({ctx,cellW,cellH,dpr})=>{
        const x=l.x*cellW*dpr,y=l.y*cellH*dpr,w=l.w*cellW*dpr,h=l.h*cellH*dpr;
        ctx.save();ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=20*dpr;ctx.shadowOffsetY=5*dpr;
        ctx.fillStyle=m.kind==='notes'?'#d8cfb8':'#151b18';ctx.fillRect(x,y,w,h);ctx.shadowColor='transparent';ctx.strokeStyle=m.kind==='notes'?'rgba(72,62,43,.25)':'rgba(168,180,160,.2)';ctx.lineWidth=dpr;ctx.strokeRect(x+.5*dpr,y+.5*dpr,w-dpr,h-dpr);
        if(m.kind==='notes'){ctx.fillStyle='#233d43';ctx.fillRect(x-5*dpr,y,5*dpr,h);ctx.strokeStyle='rgba(65,81,95,.15)';for(let row=l.body.y;row<l.footer.y;row++){ctx.beginPath();ctx.moveTo(x+cellW*dpr,(row+1)*cellH*dpr);ctx.lineTo(x+w-cellW*dpr,(row+1)*cellH*dpr);ctx.stroke();}}
        ctx.restore();
      });
      const color=m.kind==='notes'?'#463d2d':'#c5c9b9';
      ink(l.x+2,l.y+.5,m.kind==='notes'?'NOTEBOOK':m.kind==='status'?'CHECK YOURSELF':m.instrument?.title||'INSTRUMENT',l.w-4,{color,weight:'bold'});
      if(m.kind==='instrument'){
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
    exit(){closed=true;pointerPress=null;inspection?.dispose?.();inspection=null;},
  };return scene;
}
