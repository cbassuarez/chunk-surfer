// The selected Red Box: a grey armoured pay-on-answer instrument inside a K6.
// The wet glazing and cast enclosure pass through the world's final shader;
// the close apparatus uses the recorder's full-DPR physical material layer.
// Its fixed number ring sits below a perforated moving finger plate. Geometry
// is shared with the scene's hit tests: regions in UI cells, rotary in CSS px.
import { uiCellMetrics, uiDraw, uiSize } from './ui.js';
import { drawHardwarePrint, drawHardwareScrew } from './hardware-faceplate.js';
import { drawInstrumentPlate, drawInstrumentWell, drawInstrumentGlass } from './instrument-material.js';
import { ROTARY_HOLES, rotaryPulses } from '../game/payphone.js';

const TAU = Math.PI * 2;

// Screen angles, clockwise from three o'clock (y grows downward).
export const ROTARY_STOP_ANGLE = Math.PI / 3;          // four o'clock
export const ROTARY_SPACING = Math.PI / 6.4;
export const rotaryRestAngle = (digit) => ROTARY_STOP_ANGLE - (rotaryPulses(digit) + 1) * ROTARY_SPACING;
export const rotaryTravelAngle = (digit) => (rotaryPulses(digit) + 1) * ROTARY_SPACING;

function hash(n) { let x = (n | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967295; }
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

// ── WHERE THINGS ARE ────────────────────────────────────────────────────────
// Worked out in CSS pixels, so the box keeps its proportions whatever shape the
// cells are, then handed back in cells for the scene.
export function payphoneLayout(size = uiSize(), metrics = uiCellMetrics()) {
  const cols = Math.max(1, size.cols || 1), rows = Math.max(1, size.rows || 1);
  const cw = metrics.cellW || 8, ch = metrics.cellH || 16;
  const W = cols * cw, H = rows * ch;
  const pane = Math.max(24, Math.min(112, W * 0.085));
  const roof = Math.max(25, Math.min(52, H * 0.075));
  const shelfY = H - Math.max(96, Math.min(128, H * 0.18));
  const availableW = Math.max(128, W - pane * 2 - 34);
  // The selected Red Box is a working instrument within the kiosk, rather
  // than a small illustration in a large red wall. Leave room for its vertical
  // receiver at left and the scratched paint at right; preserve its aspect.
  const hH = Math.max(120, Math.min(480, shelfY - roof - 35, availableW / 1.40));
  const hW = hH * 1.12;
  const hx = W / 2 - hW * 0.46;
  const hy = roof + Math.max(12, (shelfY - roof - hH) * 0.42);
  const rel = (fx, fy, fw, fh) => ({ x: hx + fx * hW, y: hy + fy * hH, w: fw * hW, h: fh * hH });
  const shelf = { x: pane + 8, y: shelfY, w: W - pane * 2 - 16, h: Math.max(48, H - shelfY - ch * 2.5) };
  const rightX = hx + hW + 17;
  const bookW = Math.min(330, Math.max(140, shelf.w * .47));
  const bookX = Math.min(hx + hW * .34, shelf.x + shelf.w - bookW - 10);
  const sideScratchW = Math.max(0, W - pane - 12 - rightX);
  const scratchesOnShelf = sideScratchW < 135;
  const px = {
    W, H, pane, roof,
    housing: { x: hx, y: hy, w: hW, h: hH },
    backboard: { x: hx - hW * .17, y: hy - hH * .035, w: hW * 1.20, h: hH * 1.075 },
    instructions: rel(.055, .12, .54, .235),
    slot: rel(.725, .14, .215, .13),
    window: rel(.715, .385, .235, .23),
    flap: rel(.715, .745, .235, .17),
    cradle: rel(-.10, .225, .10, .35),
    handset: rel(-.185, .17, .145, .53),
    // The same scratched clue stays on visible painted iron. A narrow desktop
    // has no readable side strip, so it occupies the ledge left of the book.
    scratches: scratchesOnShelf
      ? { x: shelf.x + 12, y: shelfY + shelf.h*.55, w: Math.max(112, bookX-shelf.x-24), h: Math.max(27,shelf.h*.45), onShelf:true }
      : { x: rightX, y: roof+12+(H-42-roof-12)/6-12, w: sideScratchW, h:(H-42-roof-12)*4/6+24, onShelf:false },
    directory: { x: bookX, y: shelfY + 5, w: bookW, h: Math.max(42, shelf.h - 8) },
    shelf,
  };
  const r = hW * .265;
  const dialPx = { cx: hx + hW * .335, cy: hy + hH * .665, r, hole: r * .72, holeR: r * .115, centre: r * .43 };
  const cells = (b) => ({ x: b.x / cw, y: b.y / ch, w: b.w / cw, h: b.h / ch });
  return {
    cols, rows, cellW: cw, cellH: ch, px, dialPx,
    x: hx / cw, y: hy / ch, w: hW / cw, h: hH / ch,
    dial: { cx: dialPx.cx / cw, cy: dialPx.cy / ch, rCells: r / cw },
    instructions: cells(px.instructions), slot: cells(px.slot), window: cells(px.window), flap: cells(px.flap),
    cradle: cells(px.cradle), handset: cells(px.handset), scratches: cells(px.scratches), directory: cells(px.directory),
    hint: { y: Math.min(rows-1, Math.max(rows-2, Math.ceil((shelfY+shelf.h)/ch+.4))) },
  };
}

// The dial in CSS pixels.
export function dialGeometry(layout = payphoneLayout()) {
  return { ...layout.dialPx, cellW: layout.cellW, cellH: layout.cellH };
}
export const dialAngleAt = (geometry, px, py) => Math.atan2(py - geometry.cy, px - geometry.cx);
// Which finger hole a point is in, with the dial turned by `rotation`, or null.
export function dialHoleAt(geometry, px, py, rotation = 0) {
  for (const digit of ROTARY_HOLES) {
    const a = rotaryRestAngle(digit) + rotation;
    const hx = geometry.cx + Math.cos(a) * geometry.hole, hy = geometry.cy + Math.sin(a) * geometry.hole;
    if (Math.hypot(px - hx, py - hy) <= geometry.holeR * 1.25) return digit;
  }
  return null;
}
export const inCentre = (geometry, px, py) => Math.hypot(px - geometry.cx, py - geometry.cy) <= geometry.centre;

// ── MATERIALS ───────────────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y); ctx.arcTo(x + w, y, x + w, y + h, k); ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k); ctx.arcTo(x, y, x + w, y, k); ctx.closePath();
}
// A pressing into the housing: dark floor, shadow under the upper lip, a caught lower edge.
function recess(ctx, x, y, w, h, d, floor = '#141614', radius = 3) {
  rrect(ctx, x, y, w, h, radius * d); ctx.fillStyle = floor; ctx.fill();
  ctx.save(); rrect(ctx, x, y, w, h, radius * d); ctx.clip();
  const lip = ctx.createLinearGradient(0, y, 0, y + h * 0.35);
  lip.addColorStop(0, 'rgba(0,0,0,.6)'); lip.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lip; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1 * d;
  ctx.beginPath(); ctx.moveTo(x + radius * d, y + h + 0.5 * d); ctx.lineTo(x + w - radius * d, y + h + 0.5 * d); ctx.stroke();
}
function chrome(ctx, x, y, w, h, radius, d) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#f6f6f2'); g.addColorStop(0.42, '#9aa09f'); g.addColorStop(0.55, '#e2e4df'); g.addColorStop(1, '#5e6362');
  rrect(ctx, x, y, w, h, radius); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1 * d; ctx.stroke();
}
function chromeRing(ctx, cx, cy, outer, inner) {
  const g = ctx.createLinearGradient(cx - outer, cy - outer, cx + outer, cy + outer);
  g.addColorStop(0, '#f4f5f1'); g.addColorStop(0.35, '#8a8e8d'); g.addColorStop(0.55, '#dcded9'); g.addColorStop(0.8, '#555a59'); g.addColorStop(1, '#b8bbb6');
  ctx.beginPath(); ctx.arc(cx, cy, outer, 0, TAU); ctx.arc(cx, cy, inner, 0, TAU, true);
  ctx.fillStyle = g; ctx.fill('evenodd');
}

// ── THE PLATE BEHIND ────────────────────────────────────────────────────────
// The rear and sides are the same cellular construction as the world K6:
// three columns, a broad centre light, and six rows. The apparatus has its own
// black steel backing; the enclosure never becomes a solid red wall on entry.
function boothGlazing(L) {
  const P=L.px,top=P.roof+12,bottom=(P.FH||P.H)-42;
  const row=(bottom-top)/6,rearX=P.pane,rearW=P.W-P.pane*2;
  const frame=Math.max(12,Math.min(22,rearW*.026));
  const columns=[0,.2125,.7875,1],panes=[];
  for(let col=0;col<3;col++)for(let r=0;r<6;r++){
    const x=rearX+rearW*columns[col],w=rearW*(columns[col+1]-columns[col]);
    panes.push({x:x+frame*.5,y:top+r*row+frame*.5,w:w-frame,h:row-frame,id:col*6+r,rear:true});
  }
  for(const side of [0,1])for(let r=0;r<6;r++){
    const x=side?P.W-P.pane:0,w=side?(P.FW||P.W)-x:P.pane;
    panes.push({x,y:top+r*row+3.5,w,h:row-7,id:30+side*6+r,rear:false});
  }
  return {panes,top,bottom,row,rearX,rearW,frame,columns};
}
function castRail(ctx,x,y,w,h,d,vertical=false) {
  const g=ctx.createLinearGradient(x,y,vertical?x+w:x,vertical?y:y+h);
  g.addColorStop(0,'#4d1c12');g.addColorStop(.20,'#c7664f');
  g.addColorStop(.46,'#a5412e');g.addColorStop(.85,'#742719');g.addColorStop(1,'#350e08');
  ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
  // Wear is keyed to projecting moulding edges, never scattered primer blobs.
  ctx.strokeStyle='rgba(225,173,121,.60)';ctx.lineWidth=.85*d;
  ctx.beginPath();
  if(vertical){ctx.moveTo(x+w*.22,y+7*d);ctx.lineTo(x+w*.22,y+h-9*d);}
  else{ctx.moveTo(x+7*d,y+h*.22);ctx.lineTo(x+w-9*d,y+h*.22);}
  ctx.stroke();
  for(let i=0;i<7;i++){
    const t=.09+i*.132,len=(3+hash(i*17+Math.floor(x+y))*6)*d;
    ctx.strokeStyle=i%2?'rgba(228,190,145,.42)':'rgba(30,12,7,.55)';ctx.lineWidth=.75*d;
    ctx.beginPath();
    if(vertical){const yy=y+h*t;ctx.moveTo(x+w*.19,yy);ctx.lineTo(x+w*.22,yy+len);}
    else{const xx=x+w*t;ctx.moveTo(xx,y+h*.20);ctx.lineTo(xx+len,y+h*.23);}
    ctx.stroke();
  }
}
function paintWall(ctx,L,d) {
  const P=L.px,W=(P.FW||P.W)*d,H=(P.FH||P.H)*d,G=boothGlazing(L);
  const dark=ctx.createLinearGradient(0,0,0,H);dark.addColorStop(0,'#070b0a');dark.addColorStop(1,'#0e1513');
  ctx.fillStyle=dark;ctx.fillRect(0,0,W,H);
  const top=G.top*d,bottom=G.bottom*d,rx=G.rearX*d,rw=G.rearW*d;
  for(const col of G.columns)castRail(ctx,rx+rw*col-G.frame*d*.5,top,G.frame*d,bottom-top,d,true);
  for(let row=0;row<=6;row++)castRail(ctx,rx,top+row*G.row*d-G.frame*d*.5,rw,G.frame*d,d);
  castRail(ctx,0,bottom,W,H-bottom,d);
  // The K6's upper casting and a small opal practical, above the apparatus.
  const roof=ctx.createLinearGradient(0,0,0,P.roof*d);
  roof.addColorStop(0,'#160d09');roof.addColorStop(1,'#482519');
  ctx.fillStyle=roof;ctx.fillRect(0,0,W,P.roof*d);
  castRail(ctx,0,P.roof*d,W,12*d,d);
  const lx=W*.5,ly=(P.roof-13)*d,lr=Math.min(43*d,W*.040);
  ctx.fillStyle='#11120d';ctx.beginPath();ctx.ellipse(lx,ly,lr+4*d,9*d,0,0,TAU);ctx.fill();
  const opal=ctx.createLinearGradient(0,ly-6*d,0,ly+6*d);
  opal.addColorStop(0,'#fff5d8');opal.addColorStop(.5,'#eee3c1');opal.addColorStop(1,'#b9ae8d');
  ctx.fillStyle=opal;ctx.beginPath();ctx.ellipse(lx,ly,lr,6*d,0,0,TAU);ctx.fill();
}

// Rain is caught by individual recessed lights; the cast grid remains in front.
function paintGlass(ctx,L,d) {
  for(const pane of boothGlazing(L).panes){
    const x=pane.x*d,y=pane.y*d,w=pane.w*d,h=pane.h*d,id=pane.id;
    if(w<=0||h<=0)continue;
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    const glass=ctx.createLinearGradient(x,y,x+w*.6,y+h);
    glass.addColorStop(0,'#101b1b');glass.addColorStop(.55,'#1b2c28');glass.addColorStop(1,'#23312a');
    ctx.fillStyle=glass;ctx.fillRect(x,y,w,h);
    const outside=ctx.createRadialGradient(x+w*.76,y+h*.48,0,x+w*.76,y+h*.48,Math.max(w,h)*.8);
    outside.addColorStop(0,`rgba(181,151,101,${pane.rear ? .15 : .20})`);outside.addColorStop(1,'rgba(181,151,101,0)');
    ctx.fillStyle=outside;ctx.fillRect(x,y,w,h);
    const reflection=ctx.createLinearGradient(x,y,x+w,y+h*.4);
    reflection.addColorStop(0,'rgba(170,188,157,.22)');reflection.addColorStop(.23,'rgba(170,188,157,.02)');reflection.addColorStop(.69,'rgba(170,188,157,0)');reflection.addColorStop(.9,'rgba(170,188,157,.14)');
    ctx.fillStyle=reflection;ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='rgba(190,209,177,.46)';ctx.lineWidth=.85*d;
    ctx.beginPath();ctx.moveTo(x+d,y+h-d);ctx.lineTo(x+d,y+d);ctx.lineTo(x+w-d,y+d);ctx.stroke();
    for(let i=0;i<Math.max(8,Math.ceil(w*h/(850*d*d)));i++){
      const k=id*101+i,bx=x+hash(k*7)*w,by=y+hash(k*13)*h,r=(.45+hash(k*19)*.8)*d;
      ctx.fillStyle='rgba(166,186,174,.24)';ctx.beginPath();ctx.ellipse(bx,by,r*.7,r*1.5,0,0,TAU);ctx.fill();
      ctx.fillStyle='rgba(220,231,207,.46)';ctx.fillRect(bx-r*.25,by-r*.6,.5*d,.7*d);
    }
    ctx.restore();
  }
}

function paintBackboardAndHousing(ctx, L, d) {
  const P = L.px, board = P.backboard, body = P.housing;
  const B = b => ({x:b.x*d,y:b.y*d,w:b.w*d,h:b.h*d,dpr:d});
  drawInstrumentPlate(ctx,{...B(board),finish:'black',seed:'red-box-backboard',
    screwRadius:5*d,screwInset:10*d});
  // A thick armoured pressing, not a glowing display. Its side and lower
  // return stay behind the exact satin-metal face used by the recorder.
  const x=body.x*d,y=body.y*d,w=body.w*d,h=body.h*d;
  const depth=Math.max(4,body.w*.018)*d;
  rrect(ctx,x+depth,y+3*d,w,h,8*d);ctx.fillStyle='#353d39';ctx.fill();
  drawInstrumentPlate(ctx,{...B(body),finish:'aluminum',seed:'red-box-armoured-705',
    fasteners:false});
  ctx.save();rrect(ctx,x+2*d,y+2*d,w-4*d,h-4*d,4*d);ctx.clip();
  ctx.fillStyle='rgba(30,43,39,.07)';ctx.fillRect(x,y,w,h);
  // Wear follows service edges and the cash-door seam; no animated noise is
  // laid over the material or required print.
  const seam=x+w*.666;
  ctx.fillStyle='#26302a99';ctx.fillRect(seam,y+h*.085,1.5*d,h*.89);
  ctx.fillStyle='#e0e2d24d';ctx.fillRect(seam+1.5*d,y+h*.085,.7*d,h*.89);
  for(let i=0;i<28;i++){
    const yy=y+h*(.11+hash(i*17)*.83),xx=hash(i*19)>.5?x+3*d:x+w-4*d;
    ctx.strokeStyle=hash(i*23)>.5?'rgba(235,237,214,.19)':'rgba(29,37,30,.20)';
    ctx.lineWidth=.55*d;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx+(hash(i*29)-.5)*8*d,yy+2*d);ctx.stroke();
  }
  ctx.restore();
  const hoodH=h*.078;
  drawInstrumentPlate(ctx,{x,y:y-2*d,w,h:hoodH,dpr:d,fasteners:false,seed:'red-box-hood'});
  ctx.fillStyle='rgba(4,12,8,.20)';ctx.fillRect(x+3*d,y+hoodH,w-6*d,2*d);
  drawHardwarePrint(ctx,'POST OFFICE TELEPHONES',x+16*d,y+hoodH*.12,
    {width:w-32*d,height:hoodH*.7,align:'center',color:'#30392e',finish:'etched',dpr:d,darkPanel:false});
  for(const [fx,fy] of [[0,0],[1,0],[0,1],[1,1]]){
    drawHardwareScrew(ctx,x+(fx?w-13*d:13*d),y+(fy?h-13*d:hoodH+12*d),5*d,
      {seed:`red-box:${fx}:${fy}`,dpr:d,darkPanel:false});
  }
}

function paintInstructions(ctx, L, d, lines = []) {
  const p = L.px.instructions, x = p.x * d, y = p.y * d, w = p.w * d, h = p.h * d;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3 * d; ctx.shadowOffsetY = 1.5 * d;
  const enamel = ctx.createLinearGradient(0, y, 0, y + h);
  enamel.addColorStop(0, '#f2eddc'); enamel.addColorStop(1, '#d7cfb8');
  rrect(ctx, x, y, w, h, 5 * d); ctx.fillStyle = enamel; ctx.fill();
  ctx.restore();
  const band = h * 0.27;
  ctx.save(); rrect(ctx, x, y, w, h, 5 * d); ctx.clip();
  ctx.fillStyle = '#22305e'; ctx.fillRect(x, y, w, band);
  // Chipped: the enamel gone to black iron at the corners and along an edge.
  for (let i = 0; i < 7; i += 1) {
    const edge = hash(i * 29);
    const cx = x + (edge < 0.5 ? hash(i * 31) * w : (hash(i * 31) > 0.5 ? w - 2 * d : 2 * d));
    const cy = y + (edge < 0.5 ? (hash(i * 37) > 0.5 ? h - 1.5 * d : 1.5 * d) : hash(i * 37) * h);
    ctx.fillStyle = 'rgba(40,28,20,.8)'; ctx.beginPath(); ctx.ellipse(cx, cy, (1.5 + hash(i * 41) * 3) * d, (1 + hash(i * 43) * 2) * d, hash(i) * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
  printInstructionText(ctx, L, d, lines);
}
function printInstructionText(ctx, L, d, lines = []) {
  const p = L.px.instructions, x = p.x * d, y = p.y * d, w = p.w * d, h = p.h * d, band = h * 0.27;
  drawHardwarePrint(ctx, 'PAY ON ANSWER', x, y + band * 0.18, { width: w, height: band * 0.64, align: 'center', color: '#efe9d6', dpr: d, darkPanel: true });
  const rowH = (h - band - h * 0.06) / Math.max(1, lines.length);
  lines.forEach((line, i) => {
    drawHardwarePrint(ctx, `${i + 1}  ${line}`, x + w * 0.06, y + band + h * 0.03 + i * rowH + rowH * 0.12, { width: w * 0.88, height: rowH * 0.76, color: '#1d2952', dpr: d, darkPanel: false });
  });
}

function paintSlotAndPressings(ctx, L, d) {
  const X = (v) => v * d;
  const s = L.px.slot, x = X(s.x), y = X(s.y), w = X(s.w), h = X(s.h);
  recess(ctx, x, y, w, h, d, '#5c6265');
  const ex = x + w * 0.07, ey = y + h * 0.28, ew = w * 0.6, eh = h * 0.44;
  chrome(ctx, ex, ey, ew, eh, eh * 0.5, d);
  rrect(ctx, ex + ew * 0.1, ey + eh * 0.38, ew * 0.8, eh * 0.24, eh * 0.12); ctx.fillStyle = '#030303'; ctx.fill();
  const lr = Math.min(w * 0.085, h * 0.2);
  chromeRing(ctx, x + w * 0.84, y + h * 0.5, lr * 1.5, lr * 0.98);
  printPressingLabels(ctx, L, d, 'slot');

  const win = L.px.window;
  drawInstrumentWell(ctx,{x:X(win.x),y:X(win.y),w:X(win.w),h:X(win.h),dpr:d,depth:1});

  const f = L.px.flap, fx = X(f.x), fy = X(f.y), fw = X(f.w), fh = X(f.h);
  recess(ctx, fx, fy, fw, fh, d, '#070808', 6);
  const cup = ctx.createRadialGradient(fx + fw / 2, fy + fh * 0.9, 0, fx + fw / 2, fy + fh * 0.9, fw * 0.7);
  cup.addColorStop(0, 'rgba(90,95,95,.25)'); cup.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cup; ctx.fillRect(fx, fy, fw, fh);
  printPressingLabels(ctx, L, d, 'flap');
}
function printPressingLabels(ctx, L, d, which = 'both') {
  const print = (b, text) => drawHardwarePrint(ctx, text, b.x * d, (b.y + b.h) * d + 3 * d, { width: b.w * d, height: 11 * d, color: '#101314', align: 'center', dpr: d, darkPanel: false });
  if (which !== 'flap') print(L.px.slot, 'INSERT MONEY');
  if (which !== 'slot') print(L.px.flap, 'RETURN');
}

// The switch hook on the side of the box: two chrome forks and the plunger, up,
// because the handset is not on it.
function paintCradle(ctx, L, d) {
  const c = L.px.cradle, x = c.x * d, y = c.y * d, w = c.w * d, h = c.h * d;
  const bx = x + w * 0.55, bw = w * 0.45;
  const cast = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  cast.addColorStop(0, '#2a2d2f'); cast.addColorStop(1, '#45494b');
  rrect(ctx, bx, y, bw, h, 3 * d); ctx.fillStyle = cast; ctx.fill();
  drawHardwareScrew(ctx, bx + bw * 0.55, y + h * 0.12, 3 * d, { seed: 'hook:a', dpr: d });
  drawHardwareScrew(ctx, bx + bw * 0.55, y + h * 0.88, 3 * d, { seed: 'hook:b', dpr: d });
  for (const fy of [y + h * 0.28, y + h * 0.72]) {
    const t = h * 0.1;
    chrome(ctx, x + w * 0.04, fy - t / 2, bw * 0.2 + (bx - x - w * 0.04), t, t / 2, d);
    chrome(ctx, x + w * 0.04, fy - t * 1.8, t, t * 1.8, t / 2, d);
  }
  chrome(ctx, x + w * 0.3, y + h * 0.36, w * 0.14, h * 0.28, 2 * d, d);
}

function paintDialBase(ctx, L, d) {
  const G = L.dialPx, cx = G.cx * d, cy = G.cy * d, r = G.r * d;
  const well = ctx.createRadialGradient(cx, cy - r * 0.08, r * 0.95, cx, cy, r * 1.22);
  well.addColorStop(0, 'rgba(0,0,0,.6)'); well.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = well; ctx.beginPath(); ctx.arc(cx, cy, r * 1.22, 0, TAU); ctx.fill();
  chromeRing(ctx, cx, cy, r * 1.07, r * 0.985);
  const ring = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.3, r * 0.2, cx, cy, r);
  ring.addColorStop(0, '#f3eedd'); ring.addColorStop(1, '#d9d1bb');
  ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(cx, cy, r * 0.985, 0, TAU); ctx.fill();
  for (const digit of ROTARY_HOLES) {
    const a = rotaryRestAngle(digit);
    const fontH=Math.max(12*d,r*.145),fontW=fontH*1.1;
    drawHardwarePrint(ctx,digit,cx+Math.cos(a)*G.hole*d-fontW/2,cy+Math.sin(a)*G.hole*d-fontH/2,
      {width:fontW,height:fontH,align:'center',color:'#20281f',finish:'screenprint',dpr:d,darkPanel:false});
  }
}

// Each card line only as wide as the circle is at its height, so none runs off the card.
function printCard(ctx, L, d, card = []) {
  const G = L.dialPx, cx = G.cx * d, cy = G.cy * d, cr = G.centre * d;
  const rowH = cr * 1.36 / Math.max(1, card.length);
  card.forEach((line, i) => {
    const top = cy - cr * 0.68 + i * rowH + rowH * 0.1, mid = top + rowH * 0.4 - cy;
    const half = Math.sqrt(Math.max(0, cr * cr - (Math.abs(mid) + rowH * 0.4) ** 2)) * 0.86;
    if (half > 4 * d) drawHardwarePrint(ctx, line, cx - half, top, { width: half * 2, height: rowH * 0.8, align: 'center', color: '#27241f', finish: 'faceplate', dpr: d, darkPanel: false });
  });
}
// Keyed grooves catch the lamp on their lower wall. In a wide view the
// numbers follow exposed red crossbars; compact desktop uses the black ledge
// beside the book. Both visible marks open the same complete authored clues.
function paintScratches(ctx,L,d,entries=[]) {
  const s=L.px.scratches;
  if(s.w<30||!entries.length)return;
  const selected=s.onShelf
    ? [entries.find(entry=>entry.whose==='van'),entries.find(entry=>/DON'T/.test(entry.text))].filter(Boolean)
    : entries.slice(0,5);
  const G=boothGlazing(L);
  ctx.save();ctx.beginPath();ctx.rect(s.x*d,s.y*d,s.w*d,s.h*d);ctx.clip();
  selected.forEach((entry,i)=>{
    const deep=/DON'T/.test(entry.text);
    let size=(s.onShelf?Math.min(12,s.h*.43):Math.min(15,G.frame*.67))*d;
    const font=px=>`700 ${px}px "Courier New", monospace`;
    ctx.font=font(size);const maxW=(s.w-9)*d,measured=ctx.measureText(entry.text).width;
    if(measured>maxW){size*=maxW/measured;ctx.font=font(size);}
    const tx=(s.x+4)*d;
    const mid=s.onShelf?(s.y+s.h*(i+.5)/selected.length)*d:(G.top+(i+1)*G.row)*d;
    ctx.save();ctx.translate(tx,mid+size*.34);ctx.rotate((hash(i*13)-.5)*.018);
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.fillStyle='rgba(214,206,174,.55)';ctx.fillText(entry.text,0,.75*d);
    ctx.fillStyle=s.onShelf?'#040804':'#210604';ctx.fillText(entry.text,0,-.65*d);
    ctx.fillStyle=deep?'#b4ad99':'#9a9c86';ctx.fillText(entry.text,0,0);
    if(deep){
      const width=ctx.measureText(entry.text).width;
      ctx.strokeStyle='rgba(188,187,159,.6)';ctx.lineWidth=.65*d;
      ctx.beginPath();ctx.moveTo(0,size*.17);ctx.lineTo(width*.98,size*.15);ctx.stroke();
    }
    ctx.restore();
  });
  ctx.restore();
}

function paintShelfAndBook(ctx, L, d, directory = {}) {
  const P = L.px, s = P.shelf, x = s.x * d, y = s.y * d, w = s.w * d, h = s.h * d;
  const front = y + h * 0.55, lip = h * 0.45;
  const below = ctx.createLinearGradient(0, front + lip, 0, P.H * d);
  below.addColorStop(0, 'rgba(0,0,0,.6)'); below.addColorStop(1, 'rgba(0,0,0,.85)');
  ctx.fillStyle = below; ctx.fillRect(x, front + lip, w, (P.FH || P.H) * d - front - lip);
  const top = ctx.createLinearGradient(0, y, 0, front);
  top.addColorStop(0, '#1c1d1d'); top.addColorStop(1, '#353736');
  ctx.beginPath(); ctx.moveTo(x + w * 0.02, y); ctx.lineTo(x + w * 0.98, y); ctx.lineTo(x + w, front); ctx.lineTo(x, front); ctx.closePath();
  ctx.fillStyle = top; ctx.fill();
  const lipG = ctx.createLinearGradient(0, front, 0, front + lip);
  lipG.addColorStop(0, '#3f4140'); lipG.addColorStop(1, '#0f1010');
  ctx.fillStyle = lipG; ctx.fillRect(x, front, w, lip);
  ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(x, front, w, d);
  for (let i = 0; i < 30; i += 1) {
    ctx.fillStyle = 'rgba(200,195,185,.12)';
    ctx.fillRect(x + hash(i * 17) * w, front + hash(i * 19) * lip * 0.4, (4 + hash(i * 23) * 20) * d, d);
  }

  // The phone book, open where somebody left it.
  const b = P.directory, bx = b.x * d, by = b.y * d, bw = b.w * d, bh = b.h * d;
  const t0 = by, t1 = by + bh * 0.9;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8 * d; ctx.shadowOffsetY = 3 * d;
  ctx.beginPath(); ctx.moveTo(bx + bw * 0.04, t0); ctx.lineTo(bx + bw * 0.96, t0); ctx.lineTo(bx + bw, t1); ctx.lineTo(bx, t1); ctx.closePath();
  ctx.fillStyle = '#b9a441'; ctx.fill();
  ctx.restore();
  const page = (left) => {
    const g = bx + bw * 0.5;
    ctx.beginPath();
    if (left) { ctx.moveTo(bx + bw * 0.07, t0 + bh * 0.05); ctx.lineTo(g, t0 + bh * 0.1); ctx.lineTo(g, t1 - bh * 0.03); ctx.lineTo(bx + bw * 0.035, t1 - bh * 0.05); }
    else { ctx.moveTo(g, t0 + bh * 0.1); ctx.lineTo(bx + bw * 0.93, t0 + bh * 0.05); ctx.lineTo(bx + bw * 0.965, t1 - bh * 0.05); ctx.lineTo(g, t1 - bh * 0.03); }
    ctx.closePath();
    const shade = ctx.createLinearGradient(left ? bx : g, 0, left ? g : bx + bw, 0);
    shade.addColorStop(left ? 0 : 1, '#efe9d6'); shade.addColorStop(left ? 1 : 0, '#bdb59f');
    ctx.fillStyle = shade; ctx.fill();
  };
  page(true); page(false);
  // The surviving page contains the actual authored listings. It is a
  // directory that must be read and dialled, not a menu of hidden hot links.
  const pageX=bx+bw*.57,pageW=bw*.34;
  drawHardwarePrint(ctx,directory.surname||'',pageX,t0+bh*.06,
    {width:pageW,height:Math.max(8*d,bh*.15),color:'#2c2b22',finish:'screenprint',dpr:d,darkPanel:false});
  const entries=(directory.listed||[]).slice(0,2),rowH=bh*.32;
  entries.forEach((entry,i)=>{
    const parts=String(entry.text||'').split(/\s*\.{2,}\s*/),name=parts[0],number=parts.slice(1).join(' ');
    const yy=t0+bh*.25+i*rowH;
    drawHardwarePrint(ctx,name,pageX,yy,
      {width:pageW,height:Math.max(8*d,rowH*.40),color:'#38352c',finish:'faceplate',dpr:d,darkPanel:false});
    drawHardwarePrint(ctx,number,pageX,yy+rowH*.41,
      {width:pageW,height:Math.max(10*d,rowH*.50),color:'#1e211a',finish:'screenprint',dpr:d,darkPanel:false});
  });
  if (directory.torn) {
    // The absent leaf leaves a rough stub at the spine. The intact facing
    // page still has two ordinary Ashworth entries, as in the source data.
    const g=bx+bw*.5;
    ctx.beginPath();ctx.moveTo(g,t0+bh*.10);
    for(let k=0;k<=16;k++)ctx.lineTo(g-bw*(k%2?.052:.024)-hash(k*13)*bw*.014,lerp(t0+bh*.10,t1-bh*.03,k/16));
    ctx.lineTo(g,t1-bh*.03);ctx.closePath();ctx.fillStyle='#f5f0e0';ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=.7*d;ctx.stroke();
    for(let k=0;k<11;k++){
      const yy=t0+bh*(.16+k*.058);
      ctx.strokeStyle='rgba(114,103,75,.17)';ctx.lineWidth=.6*d;
      ctx.beginPath();ctx.moveTo(g-bw*.028,yy);ctx.lineTo(g-bw*(.045+hash(k*31)*.012),yy+1.2*d);ctx.stroke();
    }
  }
  const gutter = ctx.createLinearGradient(bx + bw * 0.46, 0, bx + bw * 0.54, 0);
  gutter.addColorStop(0, 'rgba(0,0,0,0)'); gutter.addColorStop(0.5, 'rgba(0,0,0,.28)'); gutter.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gutter; ctx.fillRect(bx + bw * 0.46, t0, bw * 0.08, t1 - t0);
  // The chain, from the spine to the ring at the back of the shelf.
  const c0 = { x: bx + bw * 0.5, y: t0 + bh * 0.05 }, c1 = { x: bx - bw * 0.1, y: y + h * 0.1 };
  const links = 10;
  for (let k = 0; k < links; k += 1) {
    const t = (k + 0.5) / links;
    const lx = lerp(c0.x, c1.x, t), ly = lerp(c0.y, c1.y, t) + Math.sin(t * Math.PI) * bh * 0.25;
    const ang = Math.atan2(c1.y - c0.y, c1.x - c0.x);
    ctx.strokeStyle = k % 2 ? '#c9ccc7' : '#7d817f'; ctx.lineWidth = 1.8 * d;
    ctx.beginPath(); ctx.ellipse(lx, ly, bw * 0.03, k % 2 ? bw * 0.008 : bw * 0.014, ang, 0, TAU); ctx.stroke();
  }
  chromeRing(ctx, c1.x, c1.y, 5 * d, 3 * d);
}

// ── THE PLATE IN FRONT ──────────────────────────────────────────────────────
// The handset's armoured cord, off the side of the box and up past his face,
// out of focus as it comes close; and the dark at the edges of the picture.
function paintCord(ctx, L, d) {
  const P = L.px, h = P.housing;
  const p0 = { x: (h.x + 2) * d, y: (h.y + h.h * 0.62) * d };
  const p1 = { x: (h.x - h.w * 0.22) * d, y: (h.y + h.h * 1.06) * d };
  const p2 = { x: (h.x - h.w * 0.78) * d, y: (h.y + h.h * 0.58) * d };
  const p3 = { x: -P.W * 0.04 * d, y: -P.H * 0.03 * d };
  const at = (t) => {
    const u = 1 - t;
    return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
  };
  const widthAt = (t) => lerp(6, 27, t ** 2.2) * d;
  const blurAt = (t) => (t > 0.6 ? (t - 0.6) * 24 * d : 0);
  const canBlur = 'filter' in ctx;
  let prev = at(0);
  ctx.lineCap = 'round';
  for (let i = 1; i <= 150; i += 1) {
    const t = i / 150, p = at(t);
    if (canBlur) ctx.filter = blurAt(t) ? `blur(${blurAt(t).toFixed(1)}px)` : 'none';
    ctx.strokeStyle = '#141617'; ctx.lineWidth = widthAt(t);
    ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    prev = p;
  }
  let travelled = 0; prev = at(0);
  for (let i = 1; i <= 900; i += 1) {
    const t = i / 900, p = at(t);
    travelled += Math.hypot(p.x - prev.x, p.y - prev.y);
    const width = widthAt(t);
    if (travelled >= width * 0.4) {
      travelled = 0;
      const ang = Math.atan2(p.y - prev.y, p.x - prev.x) + Math.PI / 2;
      if (canBlur) ctx.filter = blurAt(t) ? `blur(${blurAt(t).toFixed(1)}px)` : 'none';
      ctx.strokeStyle = 'rgba(205,210,208,.5)'; ctx.lineWidth = Math.max(d, width * 0.11);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, width * 0.5, width * 0.16, ang, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = Math.max(d, width * 0.08);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, width * 0.5, width * 0.16, ang, 0.1, Math.PI * 0.9); ctx.stroke();
    }
    prev = p;
  }
  if (canBlur) ctx.filter = 'none';
  chromeRing(ctx, p0.x, p0.y, 9 * d, 5 * d);
}
// On the hook the vertical receiver is a separate black moulding over two
// chrome forks. When lifted it leaves the forks empty and the cord comes up
// past the caller; no second handset is painted into the instrument face.
function drawHandset(ctx,L,d,handset='up') {
  if(handset!=='hook'&&handset!=='down'){paintCord(ctx,L,d);return;}
  const b=L.px.handset,h=L.px.housing;
  const x=b.x*d,y=b.y*d,w=b.w*d,hh=b.h*d,cx=x+w*.54;
  const p0={x:(h.x+2)*d,y:(h.y+h.h*.64)*d};
  const p1={x:cx,y:y+hh*.92};
  ctx.save();ctx.lineCap='round';
  const path=()=>{ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.bezierCurveTo(p0.x-32*d,y+hh*1.57,cx-34*d,y+hh*1.46,p1.x,p1.y);};
  path();ctx.strokeStyle='#0a100c';ctx.lineWidth=7*d;ctx.stroke();
  path();ctx.strokeStyle='#58615666';ctx.lineWidth=1.1*d;ctx.stroke();
  // Separate rings of armouring, stable on the suspended curve.
  for(let i=1;i<68;i++){
    const t=i/68,u=1-t;
    const px=u*u*u*p0.x+3*u*u*t*(p0.x-32*d)+3*u*t*t*(cx-34*d)+t*t*t*p1.x;
    const py=u*u*u*p0.y+3*u*u*t*(y+hh*1.57)+3*u*t*t*(y+hh*1.46)+t*t*t*p1.y;
    ctx.strokeStyle=i%2?'#81877a66':'#080d0b';ctx.lineWidth=.65*d;
    ctx.beginPath();ctx.ellipse(px,py,3.5*d,1.3*d,-.3,Math.PI*.1,Math.PI*.95);ctx.stroke();
  }
  ctx.shadowColor='#020503b3';ctx.shadowBlur=8*d;ctx.shadowOffsetX=4*d;ctx.shadowOffsetY=5*d;
  const gripX=x+w*.30,gripW=w*.43;
  const grip=ctx.createLinearGradient(gripX,0,gripX+gripW,0);
  grip.addColorStop(0,'#080d0b');grip.addColorStop(.13,'#626b58');grip.addColorStop(.30,'#333e31');grip.addColorStop(.66,'#192318');grip.addColorStop(1,'#070d08');
  rrect(ctx,gripX,y+hh*.13,gripW,hh*.74,w*.18);ctx.fillStyle=grip;ctx.fill();
  ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(162,172,140,.43)';ctx.lineWidth=.7*d;
  ctx.beginPath();ctx.moveTo(gripX+gripW*.17,y+hh*.23);ctx.lineTo(gripX+gripW*.17,y+hh*.76);ctx.stroke();
  for(const cy of [y+hh*.13,y+hh*.87]){
    const head=ctx.createRadialGradient(cx-w*.17,cy-w*.18,0,cx,cy,w*.53);
    head.addColorStop(0,'#586050');head.addColorStop(.30,'#2f382e');head.addColorStop(.68,'#111a12');head.addColorStop(1,'#050b07');
    ctx.fillStyle=head;ctx.beginPath();ctx.ellipse(cx,cy,w*.48,w*.44,0,0,TAU);ctx.fill();
    ctx.fillStyle='#131d13';ctx.beginPath();ctx.ellipse(cx,cy+w*.035,w*.35,w*.30,0,0,TAU);ctx.fill();
    ctx.strokeStyle='#76816c50';ctx.lineWidth=.65*d;ctx.beginPath();ctx.ellipse(cx,cy,w*.43,w*.38,0,Math.PI*1.1,Math.PI*1.8);ctx.stroke();
    for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++){
      if(row*row+col*col>5)continue;
      ctx.fillStyle='#030904';ctx.beginPath();ctx.arc(cx+col*w*.10,cy+row*w*.09,w*.021,0,TAU);ctx.fill();
    }
  }
  ctx.restore();
}
function paintVignette(ctx, L, d) {
  const W = (L.px.FW || L.px.W) * d, H = (L.px.FH || L.px.H) * d;
  const g = ctx.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.max(W, H) * 0.74);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

const art = { key: null, back: null, front: null, hardware:null };
const surface = (w, h) => {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};
function ensureArt(L, d, view) {
  const w = Math.max(1, Math.round((L.px.FW || L.px.W) * d)), h = Math.max(1, Math.round((L.px.FH || L.px.H) * d));
  const fontReady=typeof document==='undefined'||!document.fonts?.check?'headless':
    [400,600].map(weight=>document.fonts.check(`${weight} 12px "Hardware Sans"`)).join(':');
  const key = JSON.stringify([w,h,d,L.cellW,L.cellH,L.cols,L.rows,fontReady,view.scratches,view.directory,view.instructions]);
  if (art.key === key) return art;
  art.back = surface(w, h); art.front = surface(w, h); art.hardware=surface(w,h); art.key = key;
  const b = art.back.getContext('2d');
  paintWall(b, L, d);
  paintGlass(b, L, d);
  const hardware=art.hardware.getContext('2d');
  paintBackboardAndHousing(hardware,L,d);
  paintInstructions(hardware,L,d,view.instructions||[]);
  paintSlotAndPressings(hardware,L,d);
  paintCradle(hardware,L,d);
  paintDialBase(hardware,L,d);
  paintShelfAndBook(hardware,L,d,view.directory||{});
  // The keyed inscription is a readable physical clue, like apparatus ink.
  // Its cast support stays in the world tableau; the grooves stay full-DPR.
  paintScratches(hardware,L,d,view.scratches||[]);
  const f = art.front.getContext('2d');
  paintVignette(f, L, d);
  return art;
}
// THROUGH THE GAME'S OWN LOOK. With a sink (main hands r3d's), the booth is
// painted onto a canvas of its own and given to the renderer, which prints it
// through the final pixel-mesh/post chain. The close physical apparatus is a
// full-DPR overlay, like the recorder: metal, plastic and ink never acquire a
// CRT grille or phosphor glow. Both layers use the same authored geometry.
let tableauSink = null, tableau = null;
export function setPayphoneTableauSink(sink = null) { tableauSink = typeof sink === 'function' ? sink : null; return !!tableauSink; }
// Let the pictures go when he steps out of the box.
export function releasePayphoneArt() {
  art.key = null; art.back = null; art.front = null;art.hardware=null;
  tableau = null;
  try { tableauSink?.(null); } catch (_) {}
}

// ── WHAT MOVES ──────────────────────────────────────────────────────────────
function drawRainAndBars(ctx,L,d,t) {
  const P=L.px,G=boothGlazing(L);
  for(const pane of G.panes){
    const x=pane.x*d,y0=pane.y*d,w=pane.w*d,h=pane.h*d;
    if(w<=0||h<=0)continue;
    ctx.save();ctx.beginPath();ctx.rect(x,y0,w,h);ctx.clip();
    for(let i=0;i<5;i++){
      const k=pane.id*17+i,cycle=(hash(k*5)*1.3+t*(.055+hash(k*3)*.08))%1.3;
      const y=y0+(cycle-.15)*h,len=(8+hash(k*7)*29)*d,bx=x+hash(k*11)*w;
      const sway=Math.sin(y*.011/d+k)*1.3*d;
      const g=ctx.createLinearGradient(0,y-len,0,y);g.addColorStop(0,'rgba(180,202,190,0)');g.addColorStop(1,'rgba(200,220,197,.46)');
      ctx.strokeStyle=g;ctx.lineWidth=.7*d;ctx.beginPath();ctx.moveTo(bx,y-len);ctx.lineTo(bx+sway,y);ctx.stroke();
      ctx.fillStyle='rgba(225,235,209,.55)';ctx.beginPath();ctx.ellipse(bx+sway,y,.65*d,1.2*d,0,0,TAU);ctx.fill();
    }
    ctx.restore();
  }
  // Close side stiles and rails provide the oblique return of the cellular
  // walls, rather than a second unrelated grid over the rear construction.
  for(const side of [0,1]){
    const x=(side?P.W-P.pane:0)*d,w=(side?(P.FW||P.W)-(P.W-P.pane):P.pane)*d;
    for(let row=0;row<=6;row++)castRail(ctx,x,(G.top+row*G.row-3.5)*d,w,7*d,d);
    const pw=P.pane*d*.24,px=side?x:x+w-pw;
    castRail(ctx,px,0,pw,(P.FH||P.H)*d,d,true);
  }
}

function drawDialPlate(ctx, L, d, rotation, card = []) {
  const G = L.dialPx, cx = G.cx * d, cy = G.cy * d, r = G.r * d, hr = G.holeR * d;
  const holes = ROTARY_HOLES.map((digit) => {
    const a = rotaryRestAngle(digit) + rotation;
    return { x: cx + Math.cos(a) * G.hole * d, y: cy + Math.sin(a) * G.hole * d };
  });
  const platePath = () => {
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.93, 0, TAU);
    for (const hole of holes) { ctx.moveTo(hole.x + hr, hole.y); ctx.arc(hole.x, hole.y, hr, 0, TAU, true); }
    ctx.moveTo(cx+G.centre*d,cy);ctx.arc(cx,cy,G.centre*d,0,TAU,true);
  };
  // The plate's shadow falls through the holes onto the number ring.
  ctx.save();
  for (const hole of holes) {
    ctx.save(); ctx.beginPath(); ctx.arc(hole.x, hole.y, hr, 0, TAU); ctx.clip();
    const s = ctx.createLinearGradient(0, hole.y - hr, 0, hole.y + hr);
    s.addColorStop(0, 'rgba(0,0,0,.45)'); s.addColorStop(0.45, 'rgba(0,0,0,0)');
    ctx.fillStyle = s; ctx.fillRect(hole.x - hr, hole.y - hr, hr * 2, hr * 2);
    ctx.restore();
  }
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6 * d; ctx.shadowOffsetY = 2 * d;
  platePath();
  const plate = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 0.95);
  plate.addColorStop(0, '#4c4f51'); plate.addColorStop(0.55, '#1c1e1f'); plate.addColorStop(1, '#090a0a');
  ctx.fillStyle = plate; ctx.fill('evenodd');
  ctx.restore();
  // The holes' milled walls: a dark upper edge, a caught lower one.
  for (const hole of holes) {
    ctx.lineWidth = hr * 0.16;
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.arc(hole.x, hole.y, hr * 0.94, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(hole.x, hole.y, hr * 1.02, 0.25, Math.PI - 0.25); ctx.stroke();
  }
  // The roof lamp in the lacquer: it does not turn with the plate.
  ctx.save(); platePath(); ctx.clip('evenodd');
  const spec = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.6, 0, cx - r * 0.25, cy - r * 0.6, r * 0.55);
  spec.addColorStop(0, 'rgba(255,240,215,.2)'); spec.addColorStop(1, 'rgba(255,240,215,0)');
  ctx.fillStyle = spec; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1.5 * d;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.925, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();

  // The card, under celluloid, in a chrome ring.
  const cr = G.centre * d;
  const cardG = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr);
  cardG.addColorStop(0, '#f6f2e3'); cardG.addColorStop(1, '#ddd5bf');
  ctx.fillStyle = cardG; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill();
  // Each line only as wide as the circle is at its height, so none runs off the card.
  printCard(ctx, L, d, card);
  const gloss = ctx.createLinearGradient(cx - cr, cy - cr, cx + cr * 0.2, cy + cr * 0.2);
  gloss.addColorStop(0, 'rgba(255,255,255,.26)'); gloss.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill();
  chromeRing(ctx, cx, cy, cr * 1.06, cr * 0.98);

  // The finger stop.
  const a = ROTARY_STOP_ANGLE, sx0 = cx + Math.cos(a) * r * 1.02, sy0 = cy + Math.sin(a) * r * 1.02;
  const sx1 = cx + Math.cos(a) * r * 0.8, sy1 = cy + Math.sin(a) * r * 0.8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = r * 0.075;
  ctx.beginPath(); ctx.moveTo(sx0 + 2 * d, sy0 + 3 * d); ctx.lineTo(sx1 + 2 * d, sy1 + 3 * d); ctx.stroke();
  const stop = ctx.createLinearGradient(sx0 - r * 0.05, sy0 - r * 0.05, sx0 + r * 0.05, sy0 + r * 0.05);
  stop.addColorStop(0, '#f4f5f1'); stop.addColorStop(0.5, '#8d9190'); stop.addColorStop(1, '#d6d8d3');
  ctx.strokeStyle = stop; ctx.lineWidth = r * 0.06;
  ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.stroke();
}

function drawSlotLamp(ctx, L, d, { lit = false, tape = false } = {}) {
  const s = L.px.slot, x = s.x * d, y = s.y * d, w = s.w * d, h = s.h * d;
  if (tape) {
    // The tape's edge, standing out of a slot it should not fit.
    const ex = x + w * 0.07, ew = w * 0.6, ey = y + h * 0.28, eh = h * 0.44;
    ctx.fillStyle = '#d9d2c1'; ctx.fillRect(ex + ew * 0.12, ey + eh * 0.2, ew * 0.76, eh * 0.3);
    ctx.fillStyle = '#b7372a'; ctx.fillRect(ex + ew * 0.12, ey + eh * 0.38, ew * 0.76, eh * 0.12);
  }
  const lx = x + w * 0.84, ly = y + h * 0.5, lr = Math.min(w * 0.085, h * 0.2);
  const lens = ctx.createRadialGradient(lx - lr * 0.3, ly - lr * 0.3, 0, lx, ly, lr);
  if (lit) { lens.addColorStop(0, '#fff4e4'); lens.addColorStop(0.35, '#ff5a36'); lens.addColorStop(1, '#8e1706'); }
  else { lens.addColorStop(0, '#7a2a20'); lens.addColorStop(0.5, '#4a0f0a'); lens.addColorStop(1, '#210604'); }
  ctx.fillStyle = lens; ctx.beginPath(); ctx.arc(lx, ly, lr, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(lx - lr * 0.35, ly - lr * 0.4, lr * 0.22, 0, TAU); ctx.fill();
  if (lit) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(lx, ly, lr, lx, ly, lr * 9);
    glow.addColorStop(0, 'rgba(255,80,45,.45)'); glow.addColorStop(1, 'rgba(255,80,45,0)');
    ctx.fillStyle = glow; ctx.fillRect(lx - lr * 9, ly - lr * 9, lr * 18, lr * 18);
    ctx.restore();
  }
}

function drawTapeWindow(ctx, L, d, view) {
  const b = L.px.window, inset = 4 * d;
  const ix = b.x * d + inset, iy = b.y * d + inset, iw = b.w * d - inset * 2, ih = b.h * d - inset * 2;
  ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
  ctx.fillStyle = '#0d0b09'; ctx.fillRect(ix, iy, iw, ih);
  if (view.window) {
    const ratio = view.creditFull > 0 ? clamp01(view.credit / view.creditFull) : 0.5;
    const rMax = Math.min(iw * 0.2, ih * 0.34), hub = rMax * 0.34, cy = iy + ih * 0.57;
    const reels = [[ix + iw * 0.28, hub + (rMax - hub) * ratio, 1], [ix + iw * 0.72, hub + (rMax - hub) * (1 - ratio), -1]];
    ctx.strokeStyle = '#3d2819'; ctx.lineWidth = 1.5 * d;
    ctx.beginPath(); ctx.moveTo(reels[0][0], cy + reels[0][1]); ctx.lineTo(ix + iw * 0.5, iy + ih * 0.97); ctx.lineTo(reels[1][0], cy + reels[1][1]); ctx.stroke();
    const angle = Number(view.window.angle) || 0;
    for (const [rx, rr, dir] of reels) {
      ctx.fillStyle = '#3a2619'; ctx.beginPath(); ctx.arc(rx, cy, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,170,.09)'; ctx.lineWidth = d; ctx.beginPath(); ctx.arc(rx, cy, rr * 0.8, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ddd5c1'; ctx.beginPath(); ctx.arc(rx, cy, hub, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(rx, cy); ctx.rotate(angle * dir * (rMax / Math.max(hub, rr)));
      ctx.fillStyle = '#1a1714';
      for (let k = 0; k < 6; k += 1) { ctx.rotate(TAU / 6); ctx.fillRect(hub * 0.38, -hub * 0.08, hub * 0.34, hub * 0.16); }
      ctx.restore();
      ctx.fillStyle = '#0d0b09'; ctx.beginPath(); ctx.arc(rx, cy, hub * 0.34, 0, TAU); ctx.fill();
    }
    const lh = ih * 0.24;
    ctx.fillStyle = '#e8e1cd'; ctx.fillRect(ix + iw * 0.08, iy + ih * 0.05, iw * 0.84, lh);
    ctx.fillStyle = '#b7372a'; ctx.fillRect(ix + iw * 0.08, iy + ih * 0.05 + lh * 0.8, iw * 0.84, lh * 0.2);
    drawHardwarePrint(ctx, String(view.window.label || ''), ix + iw * 0.1, iy + ih * 0.05 + lh * 0.05, { width: iw * 0.8, height: lh * 0.72, align: 'center', color: '#1c1a17', finish: 'faceplate', dpr: d, darkPanel: false });
  }
  ctx.restore();
  drawInstrumentGlass(ctx,{x:ix,y:iy,w:iw,h:ih,dpr:d,depth:1,reflection:.45,reducedMotion:!!view.reducedMotion});
}

function drawReturn(ctx, L, d, item) {
  const f = L.px.flap, x = f.x * d, y = f.y * d, w = f.w * d, h = f.h * d;
  const ix = x + w * 0.16, iy = y + h * 0.45, iw = w * 0.68, ih = h * 0.42;
  if (item === 'tape') {
    ctx.fillStyle = '#d9d3c2'; rrect(ctx, ix, iy, iw, ih, 2 * d); ctx.fill();
    ctx.fillStyle = '#b7372a'; ctx.fillRect(ix + iw * 0.06, iy + ih * 0.2, iw * 0.88, ih * 0.32);
    ctx.fillStyle = '#2a2420'; ctx.fillRect(ix + iw * 0.25, iy + ih * 0.62, iw * 0.5, ih * 0.2);
  } else if (item === 'key') {
    const g = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    g.addColorStop(0, '#f0d78a'); g.addColorStop(0.5, '#a9832f'); g.addColorStop(1, '#e2c16a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ix + ih * 0.45, iy + ih * 0.5, ih * 0.38, 0, TAU); ctx.fill();
    ctx.fillRect(ix + ih * 0.75, iy + ih * 0.42, iw - ih * 0.8, ih * 0.16);
    ctx.fillRect(ix + iw * 0.78, iy + ih * 0.55, iw * 0.06, ih * 0.22); ctx.fillRect(ix + iw * 0.9, iy + ih * 0.55, iw * 0.06, ih * 0.3);
    ctx.fillStyle = '#070808'; ctx.beginPath(); ctx.arc(ix + ih * 0.45, iy + ih * 0.5, ih * 0.14, 0, TAU); ctx.fill();
  } else if (item === 'page') {
    ctx.save(); ctx.translate(ix + iw / 2, iy + ih / 2); ctx.rotate(-0.12);
    ctx.fillStyle = '#e9e3d0'; ctx.fillRect(-iw * 0.35, -ih * 0.5, iw * 0.7, ih);
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(-iw * 0.35, -ih * 0.02, iw * 0.7, d);
    ctx.restore();
  }
  // The flap itself, hinged at the top, over whatever is in there.
  const lip = h * 0.34;
  const g = ctx.createLinearGradient(0, y, 0, y + lip);
  g.addColorStop(0, '#eff0ec'); g.addColorStop(0.5, '#979b9a'); g.addColorStop(1, '#5d6160');
  rrect(ctx, x + 2 * d, y + 2 * d, w - 4 * d, lip, 5 * d); ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x + 4 * d, y + 2 * d + lip, w - 8 * d, 2 * d);
}

function drawHover(ctx, L, d, hover, hole = null) {
  if (!hover && hole == null) return;
  ctx.save();
  // A physical edge cue, not a lamp or emissive halo. Hover never changes
  // the payment indicator, and these small marks leave the object readable.
  ctx.strokeStyle = 'rgba(224,223,199,.82)';
  ctx.lineWidth = 1.2 * d; ctx.shadowBlur = 0;
  const arcs = (x, y, r) => {
    ctx.beginPath(); ctx.arc(x, y, r, -.55, .12); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, Math.PI-.55, Math.PI+.12); ctx.stroke();
  };
  const G = L.dialPx;
  if (hole != null) {
    const a = rotaryRestAngle(hole);
    arcs((G.cx + Math.cos(a)*G.hole)*d, (G.cy + Math.sin(a)*G.hole)*d, G.holeR*1.17*d);
  } else if (hover === 'dial' || hover === 'card') {
    arcs(G.cx*d, G.cy*d, (hover === 'dial' ? G.r*1.1 : G.centre*1.1)*d);
  } else if (L.px[hover]) {
    const b=L.px[hover],x=(b.x-3)*d,y=(b.y-3)*d,w=(b.w+6)*d,h=(b.h+6)*d;
    const n=Math.min(9*d,w*.18,h*.18);
    for(const [cx,cy,sx,sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){
      ctx.beginPath();ctx.moveTo(cx,cy+sy*n);ctx.lineTo(cx,cy);ctx.lineTo(cx+sx*n,cy);ctx.stroke();
    }
  }
  ctx.restore();
}

// view: { handset:'hook'|'up', rotation, card, instructions, scratches, directory, slotLit, slot:'tape'|null,
//         window:{label, turning, angle}|null, credit, creditFull, flap, hover, time, reducedMotion }
export function drawPayphone(view = {}, size = uiSize()) {
  const L = payphoneLayout(size);
  uiDraw(({ ctx, dpr }) => {
    const d = dpr || 1;
    // The canvas runs up to a cell past the last whole row and column.
    L.px.FW = Math.max(L.px.W, (ctx.canvas?.width || 0) / d);
    L.px.FH = Math.max(L.px.H, (ctx.canvas?.height || 0) / d);
    const t = view.reducedMotion ? 0 : Number(view.time) || 0;
    ctx.save();
    const plates = ensureArt(L, d, view);
    const paintBooth = (target) => {
      target.drawImage(plates.back, 0, 0);
      drawRainAndBars(target, L, d, t);
      target.drawImage(plates.front, 0, 0);
      // The roof lamp's rare dip belongs to the enclosure, not the apparatus.
      if (!view.reducedMotion) {
        const dip = Math.max(0, Math.sin(t*23.1)*Math.sin(t*3.7+1.3)-.93)*6;
        if (dip>0) { target.fillStyle=`rgba(0,0,0,${Math.min(.2,dip*.2)})`; target.fillRect(0,0,L.px.FW*d,L.px.FH*d); }
      }
    };
    if (tableauSink) {
      const w=Math.max(1,ctx.canvas.width),h=Math.max(1,ctx.canvas.height);
      if (!tableau || tableau.width!==w || tableau.height!==h) tableau=surface(w,h);
      const tctx=tableau.getContext('2d');
      tctx.setTransform(1,0,0,1,0,0);tctx.clearRect(0,0,w,h);
      paintBooth(tctx);tableauSink(tableau);
    } else paintBooth(ctx);
    // Same clear, physical overlay as the recorder: all hardware and its ink
    // remain together at device resolution rather than only reprinting text.
    ctx.drawImage(plates.hardware,0,0);
    drawDialPlate(ctx,L,d,Number(view.rotation)||0,view.card||[]);
    drawSlotLamp(ctx,L,d,{lit:!!view.slotLit,tape:view.slot==='tape'});
    drawTapeWindow(ctx,L,d,view);
    drawReturn(ctx,L,d,view.flap||null);
    drawHandset(ctx,L,d,view.handset||'up');
    drawHover(ctx, L, d, view.hover, view.hoverHole || null);
    // A dark band under the one line of instruction, so it can be read.
    const hy = (L.hint.y - 0.4) * L.cellH * d;
    ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(0, hy, L.px.FW * d, L.cellH * 1.8 * d);
    ctx.restore();
  });
  return L;
}
