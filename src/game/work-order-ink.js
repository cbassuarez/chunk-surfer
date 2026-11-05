// HIS MARKS ON SHEET 1, AS PEN STROKES.
//
// The cassette ledger records what he wrote (src/game/cassette-ledger.js); this
// turns each mark into biro strokes in page millimetres, on the boxes and rules
// the bake printed from the same geometry (src/data/work-order-sheet.js). Pure,
// so the live ink texture, the check-off animation and a baked preview all
// draw the same lines.
//
// Positions depend only on marks that came before, never on later ones: a
// stroke already on the paper never moves.
import {layoutRecordistHand} from '../data/recordist-hand.js';
import {WORK_ORDER_SHEET as SHEET,workOrderNoteSlot} from '../data/work-order-sheet.js';

export const WORK_ORDER_BIRO=Object.freeze({color:'#22384a',opacity:.93});
const W=Object.freeze({note:.28,label:.24,tick:.42,strike:.36,slash:.40,ring:.34,signature:.32,written:.28});

function seeded(seed){let s=0;for(const c of String(seed))s=(Math.imul(s,31)+c.charCodeAt(0))>>>0;
  return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const polyline=(points,width)=>({points,width});
const handStrokes=(text,x,y,h,seed,width)=>layoutRecordistHand(text,{x,y,h,seed}).strokes.map(points=>polyline(points,width));
function tick(x,y,s,seed){const r=seeded(seed),j=()=>(r()-.5)*s*.08;
  return[polyline([[x+s*.12+j(),y+s*.52+j()],[x+s*.42+j(),y+s*.92+j()],[x+s*1.12+j(),y-s*.18+j()]],W.tick)];}
function strike(x0,x1,y,seed){const r=seeded(seed);return[polyline([[x0-1,y+(r()-.5)*.8],[(x0+x1)/2,y+(r()-.5)*.9],[x1+1.5,y-.6+(r()-.5)*.8]],W.strike)];}
function slash(box,seed){const r=seeded(seed);return[polyline([[box.x+box.w*.12+(r()-.5),box.y+box.h*.92],[box.x+box.w*.9+(r()-.5),box.y+box.h*.1]],W.slash)];}
function cross(x,y,s,seed){const r=seeded(seed),j=()=>(r()-.5)*.6;
  return[polyline([[x-.6+j(),y-.4+j()],[x+s+.6+j(),y+s+.4+j()]],W.strike),polyline([[x+s+.6+j(),y-.4+j()],[x-.6+j(),y+s+.4+j()]],W.strike)];}
function ring(cx,cy,rx,ry,seed){const r=seeded(seed),n=24,points=[];
  for(let i=0;i<=n+2;i++){const t=i/n*Math.PI*2+.4,k=1+(r()-.5)*.08+i*.004;points.push([cx+Math.cos(t)*rx*k,cy+Math.sin(t)*ry*k]);}
  return[polyline(points,W.ring)];}
function squiggle(x,y,seed){const r=seeded(seed),points=[[x,y+2]];
  for(let i=1;i<=46;i++){const t=i/46;points.push([x+t*30,y+2-Math.sin(t*Math.PI*7.3)*(2.6-t*1.6)*(.8+r()*.4)+Math.sin(t*3)*.6]);}
  return[polyline(points,W.signature),polyline([[x+2,y+4.2],[x+31,y+3.4]],W.signature*.9)];}
const lengthOf=strokes=>strokes.reduce((sum,{points})=>sum+points.slice(1).reduce((a,p,i)=>a+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0),0);

/** Every mark, in order, with its strokes and their total length in mm. */
export function workOrderInkLayout(marks=[]){
  const notes=new Map(),ticks=new Map(),strikes=new Map(),labels=new Map(),labelAt=new Map(),out=[];
  const room=id=>SHEET.rooms.find(r=>r.roomId===id)||null,box=n=>SHEET.cassettes.find(c=>c.n===n)||null;
  const bump=(map,key)=>{const k=map.get(key)||0;map.set(key,k+1);return k;};
  let firstStore=null;
  for(const mark of [...marks].sort((a,b)=>a.order-b.order)){
    const id=String(mark.id),seed=id;let strokes=[];
    if(mark.kind==='shift'){const s=SHEET.shifts.find(x=>x.id===mark.shift);if(s)strokes=tick(s.tick.x,s.tick.y,s.tick.size,seed);
      // A custom shift has no printed box: he writes it in above the four.
      else strokes=handStrokes('CUSTOM SHIFT',SHEET.shiftHeading.x+112,SHEET.shiftHeading.y-3.2,3,seed,W.note);}
    else if(mark.kind==='issued'){
      strokes=handStrokes(String(mark.text??mark.n??''),SHEET.issued.writeX,SHEET.issued.y-3.2,3,seed,W.note);
      const last=box(mark.n),next=box(mark.n+1);
      if(last&&next){const x=(last.x+last.w+next.x)/2;strokes.push(polyline([[x,last.y-1.6],[x+.2,last.y+last.h+1.6]],W.strike));}
    }
    else if(mark.kind==='signature')strokes=[...squiggle(SHEET.received.signatureX,SHEET.received.y-5.2,seed),
      ...handStrokes(String(mark.time||''),SHEET.received.timeWriteX,SHEET.received.y-3.6,2.8,`${seed}:time`,W.note)];
    else if(mark.kind==='note'){const r=room(mark.roomId);if(r){const slot=workOrderNoteSlot(r,bump(notes,r.roomId));strokes=handStrokes(mark.text,slot.x,slot.y,slot.h,seed,W.note);}}
    else if(mark.kind==='tick'){const r=room(mark.roomId);if(r){const k=bump(ticks,r.roomId),t=r.tick;
      // A room ticked again after it was erased gets its new tick in the margin.
      strokes=tick(k?Math.max(1,t.x-6.4*k):t.x,t.y,t.size,seed);}}
    else if(mark.kind==='strike'){const r=room(mark.roomId);if(r){const k=bump(strikes,r.roomId);strokes=strike(r.strike.x0,r.strike.x1,r.strike.y+k*1.3,seed);}}
    else if(mark.kind==='untick'){const r=room(mark.roomId);if(r){const k=Math.max(0,(ticks.get(r.roomId)||1)-1),t=r.tick;
      strokes=cross(k?Math.max(1,t.x-6.4*k):t.x,t.y,t.size,seed);}}
    else if(mark.kind==='slash'){const b=box(mark.n);if(b)strokes=slash(b,seed);}
    else if(['cassette-label','ring'].includes(mark.kind)){const b=box(mark.n);if(b){
      const text=String(mark.text||''),k=bump(labels,b.n),h=2.2,x=b.x+.4,y=b.y+b.h+1.4+k*3.1;
      labelAt.set(`${b.n}:${text}`,{x,y,h,width:layoutRecordistHand(text,{h}).width});
      if(mark.kind==='ring')strokes.push(...ring(b.x+b.w/2,b.y+b.h/2,b.w*.66,b.h*.78,seed));
      strokes.push(...handStrokes(text,x,y,h,`${seed}:label`,W.label));
    }}
    else if(mark.kind==='label-strike'){const at=labelAt.get(`${mark.n}:${mark.text}`);
      if(at)strokes=[polyline([[at.x-.5,at.y+at.h*.55],[at.x+at.width+.4,at.y+at.h*.45]],W.label*1.2)];}
    else if(mark.kind==='store-written'){const b=box(mark.n);if(b){firstStore??=b;strokes=handStrokes(String(mark.text||'B3'),b.x+2.4,b.y+2.2,3,seed,W.written);}}
    else if(mark.kind==='store-note'){const b=firstStore||box(SHEET.cassettes.length-1);
      strokes=handStrokes(String(mark.text||''),b.x,b.y+b.h+1.4+3.1,2.2,seed,W.label);}
    out.push({id,order:mark.order,kind:mark.kind,strokes,length:lengthOf(strokes)});
  }
  return out;
}

/**
 * What is on the paper at this moment of the check-off: everything before
 * `order`, and `fraction` of the mark at `order`, drawn as the pen moves.
 * With no order given, every mark is finished.
 */
export function workOrderInkStrokesAt(layout,{order=Infinity,fraction=1}={}){
  const out=[];
  for(const mark of layout){
    if(mark.order<order){out.push(...mark.strokes);continue;}
    if(mark.order>order)break;
    let budget=Math.max(0,Math.min(1,fraction))*mark.length;
    for(const {points,width} of mark.strokes){
      if(budget<=0)break;const drawn=[points[0]];
      for(let i=1;i<points.length&&budget>0;i++){
        const [ax,ay]=points[i-1],[bx,by]=points[i],len=Math.hypot(bx-ax,by-ay);
        if(len<=budget){drawn.push(points[i]);budget-=len;}else{const t=budget/len;drawn.push([ax+(bx-ax)*t,ay+(by-ay)*t]);budget=0;}
      }
      if(drawn.length>1)out.push({points:drawn,width});
    }
  }
  return out;
}

/** The same strokes as SVG lines on the biro layer, for a baked preview. */
export function workOrderInkSvg(strokes){
  const {color,opacity}=WORK_ORDER_BIRO,f=v=>Number(v).toFixed(3);
  return `<g data-process="biro">${strokes.flatMap(({points,width})=>points.slice(1).map((b,i)=>
    `<line x1="${f(points[i][0])}" y1="${f(points[i][1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${width}"/>`)).join('')}</g>`;
}
