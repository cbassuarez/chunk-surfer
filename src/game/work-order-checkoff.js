// THE CHECK-OFF.
//
// docs/plans/work-order.md. After a take he raises sheet 1 of the work order
// and writes on it: the tick and the strike for a clean minute, the note for
// anything else, the slash through the cassette. It happens in the live room.
// The world keeps running (blocksWorld false) while his hands are busy
// (blocksInput true): he can look up, and anything that comes can reach him.
// Any step, interact or Escape lowers the sheet; what he had left to write is
// on it the next time it is looked at.
//
// The sheet comes up close, on the left, and the view follows the pen so the
// line he is writing is large enough to read; the right of the screen stays on
// the room. Reduced motion: no slide or pan, and the marks appear whole.
import {workOrderInkLayout} from './work-order-ink.js';

export const CHECKOFF_PEN_MM_PER_SECOND=58;
export const CHECKOFF_TIMING=Object.freeze({wait:.9,raise:.45,lower:.38,gap:.22,linger:2.4});
// Marks made at the lodge window, before any check-off, are already on the sheet.
const INSTANT=new Set(['shift','issued','signature']);
const smooth=t=>{const k=Math.max(0,Math.min(1,t));return k*k*(3-2*k);};

/**
 * The pen's plan: which marks to write, in order, and how long each takes.
 * Pure, so the pacing can be tested without a canvas.
 */
export function checkoffPlan(marks=[],seenOrder=0){
  const layout=workOrderInkLayout(marks),fresh=layout.filter(m=>m.order>seenOrder&&!INSTANT.has(m.kind)&&m.length>0);
  let at=0;const steps=fresh.map(m=>{const seconds=Math.max(.18,m.length/CHECKOFF_PEN_MM_PER_SECOND),step={order:m.order,kind:m.kind,start:at,seconds};at+=seconds+CHECKOFF_TIMING.gap;return step;});
  return{steps,writing:Math.max(0,at-CHECKOFF_TIMING.gap),lastOrder:layout.length?Math.max(...layout.map(m=>m.order)):seenOrder};
}

/** Where the pen is `t` seconds into writing: the mark it is on and how far. */
export function checkoffPenAt(plan,t){
  for(const step of plan.steps){
    if(t<step.start)return{order:step.order,fraction:0};
    if(t<step.start+step.seconds)return{order:step.order,fraction:(t-step.start)/step.seconds};
  }
  return{order:Infinity,fraction:1};
}

/**
 * The scene. `marks` and `seenOrder` come from the cassette ledger; `drawSheet`
 * draws the page with the given ink (document.js drawPhysicalPage through the
 * paper shader); `onSeen(order)` records how far the sheet has been read so the
 * same marks are never written twice.
 */
/** The centre of each mark, in page millimetres: where the pen is looking. */
export function checkoffFocusPoints(marks=[]){
  return new Map(workOrderInkLayout(marks).map(m=>{const pts=m.strokes.flatMap(s=>s.points);if(!pts.length)return[m.order,null];
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return[m.order,{x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2}];}));
}

export function makeWorkOrderCheckoffScene({marks=[],seenOrder=0,reducedMotion=false,ink,drawSheet,onSeen=()=>{},onClose=()=>{},
  frame=()=>null}={}){
  const plan=checkoffPlan(marks,seenOrder),points=checkoffFocusPoints(marks);
  const target=order=>points.get(order)||points.get(plan.steps.at(-1)?.order)||{x:105,y:150};
  let focus={...target(plan.steps[0]?.order)};
  // He lets the transport click off and says his line before he reaches for it.
  let t=0,phase='waiting',phaseAt=0,closed=false,seenReported=false;
  const reportSeen=()=>{if(seenReported)return;seenReported=true;onSeen(plan.lastOrder);};
  function lower(){if(phase==='lowering'||closed)return;reportSeen();phase='lowering';phaseAt=t;if(reducedMotion)finish();}
  function finish(){if(closed)return;closed=true;reportSeen();onClose();}
  const writingT=()=>phase==='writing'?t-phaseAt:phase==='raising'?0:plan.writing;
  return{
    id:'work-order-checkoff',blocksWorld:false,allowsLook:true,
    // His hands are only busy once the sheet is up.
    get blocksInput(){return !closed&&phase!=='waiting';},
    get handlesEscape(){return !closed&&phase!=='waiting';},
    update(dt){
      if(closed)return;const step=Math.max(0,Math.min(.25,Number(dt)||0));t+=step;
      // The eye follows the pen, a little behind it.
      if(!reducedMotion&&phase==='writing'){const pen=checkoffPenAt(plan,t-phaseAt),want=target(Number.isFinite(pen.order)?pen.order:plan.steps.at(-1)?.order),k=1-Math.exp(-step*4);
        focus={x:focus.x+(want.x-focus.x)*k,y:focus.y+(want.y-focus.y)*k};}
      if(phase==='waiting'&&t>=CHECKOFF_TIMING.wait){phase=reducedMotion?'written':'raising';phaseAt=t;if(reducedMotion)reportSeen();}
      if(phase==='raising'&&t-phaseAt>=CHECKOFF_TIMING.raise){phase='writing';phaseAt=t;}
      if(phase==='writing'&&t-phaseAt>=plan.writing){phase='written';phaseAt=t;reportSeen();}
      if(phase==='written'&&t-phaseAt>=CHECKOFF_TIMING.linger)lower();
      if(phase==='lowering'&&t-phaseAt>=CHECKOFF_TIMING.lower)finish();
    },
    view(){const pen=phase==='writing'?checkoffPenAt(plan,writingT()):{order:Infinity,fraction:1};
      return{id:'work-order-checkoff',phase,pen,focus:{...focus},steps:plan.steps.length,writingSeconds:plan.writing,closed};},
    render(){
      if(closed||phase==='waiting')return;
      const lift=reducedMotion?1:phase==='raising'?smooth((t-phaseAt)/CHECKOFF_TIMING.raise):phase==='lowering'?1-smooth((t-phaseAt)/CHECKOFF_TIMING.lower):1;
      const pen=phase==='writing'?checkoffPenAt(plan,writingT()):phase==='raising'?{order:plan.steps[0]?.order??Infinity,fraction:0}:{order:Infinity,fraction:1};
      drawSheet?.({lift,focus:{...focus},ink:ink?.draw(marks,pen)||null,frame:frame()});
    },
    key(e){
      if(phase==='waiting')return false;
      const k=String(e?.key||'').toLowerCase(),code=e?.code||'';
      // Stepping away, reaching for something or Escape: the sheet goes down.
      if(['escape','e','w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)||/^Key[WASDE]$/.test(code)
        ||['back','interact','confirm'].includes(e?.controllerAction)){lower();return true;}
      return false;
    },
    lower,
  };
}
