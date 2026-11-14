import { drawServiceLockoutTag } from './service-lockout-tag.js';
import { drawHardwareScrew } from './hardware-faceplate.js';
import { drawPatchChannelIcon } from './patch-channel-icons.js';
import { MAX_PINS } from '../game/combat-progression.js';
import { drawElectronicText } from './electronic-text.js';
import { uiBrightness } from './palette.js';
import { channelLcdState, drawPatchLcd, patchLcdColors, skillLcdState } from './patch-lcd.js';
import { drawChannelJack, drawChannelHarness } from './patch-channel-hardware.js';
import { drawFieldPatchCord, fieldPatchCordLength } from './patch-channel-cord.js';

const COLORS = {
  torch:'#d5a251', recorder:'#b66a5c', rig:'#6b9baa',
  nerve:'#8e9f6c', fork:'#ae90ae', radio:'#bc8357',
};
const ORDER = ['torch','recorder','rig','nerve','fork','radio'];
const CREAM = '#ded7c3';
const MUTED = '#9d9a89';
const AMBER = '#f6cb80';
const SCREEN = '#f3ce7f';
const OK = '#bcdf9a';
const FAULT = '#ef8d79';
const JUMPER = '#ca6d4e';
const SANS = '"Hardware Sans", "Helvetica Neue", sans-serif';
const MONO = 'ui-monospace, Menlo, monospace';
const clamp = (value,low,high) => Math.min(high,Math.max(low,value));
const digits = value=>String(value).padStart(2,'0');

// Geometry stays in cells for the case controller, then converts to pixels at
// the faceplate. The standard and guided case pick the same port IDs.
export function channelStripBounds(region,{cellW,cellH}) {
  const width=region.w*cellW;
  const height=region.h*cellH;
  const side=width>=655 && height>=365;
  const widthOfReadout=clamp(width*.26,197,262)/cellW;
  const gap=(side?11:6)/cellH;
  const topInset=2/cellH;
  const gapW=11/cellW;
  const rack=side
    ?{x:region.x,y:region.y+topInset,w:region.w-widthOfReadout-gapW,h:region.h-topInset}
    :{x:region.x,y:region.y+topInset,w:region.w,h:region.h-gap-topInset-clamp(height*.23,84,104)/cellH};
  const detail=side
    ?{x:rack.x+rack.w+gapW,y:rack.y,w:widthOfReadout,h:rack.h}
    :{x:rack.x,y:rack.y+rack.h+gap,w:rack.w,h:region.y+region.h-rack.y-rack.h-gap};
  const trayHeight=(height>=350?clamp(height*.24,84,118):clamp(height*.12,33,43))/cellH;
  const tray=side
    ?{x:detail.x+.38,y:detail.y+detail.h-trayHeight-.18,w:detail.w-.76,h:trayHeight}
    :{x:detail.x+detail.w-Math.min(17,detail.w*.26),y:detail.y+.23,w:Math.min(16.6,detail.w*.255),h:detail.h-.46};
  return {rack,detail,tray,side};
}

export function channelStripGeometry({region,branches,cellW,cellH}) {
  const x=region.x*cellW,y=region.y*cellH,w=region.w*cellW,h=region.h*cellH;
  const header=clamp(h*.062,15,27);
  const step=(h-header-7)/ORDER.length;
  const edge=7;
  const bankW=w-edge*2;
  const labelW=clamp(bankW*.19,82,143);
  const sendW=clamp(bankW*.105,37,64);
  const count=Math.max(1,...branches.map(branch=>branch.entries.length));
  const column=(bankW-labelW-sendW-4)/count;
  const r=clamp(Math.min(step*.108,column*.108),3.35,7);
  const compact=step<50;
  const jackY=step*(step<28?.69:compact?.48:.52);
  const box=(x,y,w,h)=>({x:x/cellW,y:y/cellH,w:w/cellW,h:h/cellH});
  const branchRow=new Map(ORDER.map((id,index)=>[id,index]));
  return branches.map(branch=>{
    const index=branchRow.get(branch.id);
    const left=x+edge,top=y+header+index*step;
    const feedX=left+labelW+sendW*.47;
    const slotsX=left+labelW+sendW;
    return {
      id:branch.id, row:index, box:box(left,top,bankW,step),
      labelWidth:labelW/cellW, sendWidth:sendW/cellW, pitch:column/cellW, slotCount:count,
      sourceX:feedX/cellW,sourceY:(top+jackY)/cellH,sourceH:step/cellH,radius:r/cellH,
      cells:branch.entries.map((entry,i)=>({
        entry, bounds:box(slotsX+i*column,top,column,step),
        socketHeight:jackY/step, inputOffset:.26, outputOffset:.74,
      })),
    };
  });
}

function fill(ctx,x,y,w,h,color) {
  if(w<=0||h<=0)return;
  ctx.fillStyle=color;
  ctx.fillRect(x,y,w,h);
}
function gradient(ctx,y,h,stops) {
  const paint=ctx.createLinearGradient(0,y,0,y+Math.max(1,h));
  for(const [at,color] of stops)paint.addColorStop(at,color);
  return paint;
}
function ink(ctx,value,x,y,max,size,{color=CREAM,mono=false,align='left',weight=600}={}) {
  if (!value || max<4) return;
  ctx.font=`${weight} ${size}px ${mono?MONO:SANS}`;
  ctx.textBaseline='middle';
  ctx.textAlign=align;
  ctx.fillStyle=color;
  ctx.fillText(value,x,y,max);
}
function etched(ctx,value,x,y,max,size,options={}) {
  ink(ctx,value,x,y+.7,max,size,{...options,color:'#10120e'});
  ink(ctx,value,x,y,max,size,options);
}
function fastener(ctx,x,y,seed,r=2.9) {
  drawHardwareScrew(ctx,x,y,r,{seed,darkPanel:true,dpr:1});
}
function body(ctx,x,y,w,h){
  fill(ctx,x,y,w,h,'#151713');
  fill(ctx,x+1,y+1,w-2,h-2,gradient(ctx,y,h,[[0,'#646760'],[.04,'#3c403b'],[.36,'#2c302c'],[.89,'#252924'],[1,'#676658']]));
  fill(ctx,x+2,y+2,w-4,1,'#91907c');
  fill(ctx,x+2,y+h-2,w-4,1,'#101310');
}
function paintRack(ctx,rack,channels,nodes,selectedId) {
  body(ctx,rack.x,rack.y,rack.w,rack.h);
  fill(ctx,rack.x+3,rack.y+3,rack.w-6,2,'#a7905c');
  if(!channels.length)return;
  const top=Math.min(...channels.map(c=>c.box.y));
  const headingY=(rack.y+top)/2+1;
  const titleSize=clamp((top-rack.y)*.5,7,11);
  etched(ctx,'PATCH MATRIX',rack.x+12,headingY+1,rack.w*.44,titleSize,{weight:700});
  etched(ctx,'4417-C   /   FIELD PATCH SYSTEM',rack.x+rack.w-12,headingY+1,rack.w*.48,titleSize*.84,{align:'right',mono:true,color:MUTED});
  for(const channel of channels){
    const {box:b,source,labelWidth,sendWidth,pitch,slotCount}=channel;
    const compact=b.h<50;
    const color=COLORS[channel.id];
    const left=b.x;
    const y=b.y;
    const shelf=source.y+(compact?2:4);
    const right=left+b.w;
    fill(ctx,left,y,b.w,b.h-1,gradient(ctx,y,b.h,[[0,'#4a4d45'],[.13,'#3a3e38'],[.51,'#292e2a'],[1,'#1d211e']]));
    // A recessed trough under the jack plane carries the cable bend.
    fill(ctx,left+labelWidth+1,shelf,b.w-labelWidth-2,y+b.h-shelf-2,gradient(ctx,shelf,y+b.h-shelf,[
      [0,'#151914'],[.17,'#1a1e18'],[.70,'#20241b'],[.96,'#2e3225'],[1,'#131710'],
    ]));
    fill(ctx,left+labelWidth+1,shelf-1,b.w-labelWidth-2,1,'#626050');
    fill(ctx,left,y+b.h-2,b.w,1,'#131711');
    fill(ctx,left,y+b.h-1,b.w,1,'#5b5d4e');
    fill(ctx,left+2,y+3,2,Math.max(3,b.h-8),color);
    fill(ctx,left+labelWidth,y+3,1,b.h-7,'#626151');
    const lcdWidth=compact ? clamp(b.h*.69,20,31) : 39;
    const lcdHeight=lcdWidth*.77;
    const cy=y+b.h*.48;
    const badge=channelLcdState(channel.id,channel.cells.map(cell=>cell.entry),selectedId);
    drawPatchLcd(ctx,left+9+lcdWidth/2,cy,lcdWidth,lcdHeight,{branch:channel.id,...badge});
    const tx=left+lcdWidth+(compact?14:19);
    const nameWidth=left+labelWidth-tx-8;
    etched(ctx,channel.label,tx,cy-(compact?0:5),nameWidth,compact?8.9:12.8,{weight:700});
    if(!compact)etched(ctx,'CH '+digits(channel.row+1),tx,cy+10,nameWidth,8,{mono:true,color:MUTED});
    const labelY=y+(b.h<28?4.6:compact?6.5:11);
    const sendInk=b.h<41?8:9;
    etched(ctx,'SEND',source.x,labelY,sendWidth-4,sendInk,{align:'center',mono:true,color:MUTED});
    // A single drilled extrusion. Only its unused end is covered by a blank.
    if (channel.cells.length<slotCount) {
      const slotX=left+labelWidth+sendWidth+channel.cells.length*pitch;
      const width=right-slotX-4;
      fill(ctx,slotX+2,y+3,width,shelf-y-4,'#272d28');
      fill(ctx,slotX+2,y+3,width,1,'#4d5148');
      if(width>43&&b.h>54) fastener(ctx,right-12,y+12,`strip:blank:${channel.id}`,1.8);
    }
    if(!compact)fastener(ctx,right-5,y+b.h-8,`strip:${channel.id}:right`,2.1);
  }
  for(const node of nodes) {
    const {bounds:b,input,outPosition,entry}=node;
    const compact=b.h<50;
    const selected=node.id===selectedId;
    const state=skillLcdState(entry);
    const shallow=b.h<28;
    const labelY=b.y+(shallow?4.6:compact?6.5:11);
    const size=shallow?8.3:compact?clamp(b.w*.13,7.3,9.9):clamp(b.w*.13,9,12.1);
    const branchColor=entry.circuitBend?JUMPER:COLORS[node.branch];
    if(selected) {
      fill(ctx,b.x+2,b.y+2,b.w-4,shallow?8:compact?10:18,'#6a5b3f');
      fill(ctx,b.x+3,b.y+2,b.w-6,1,'#bc9e62');
      fill(ctx,b.x+3,b.y+(shallow?9:compact?11:19),b.w-6,1,'#9b824f');
    }
    const mark=entry.special?'special':entry.active?'manual':null;
    const showMark=mark&&b.w>64;
    if(showMark)drawPatchChannelIcon(ctx,mark,b.x+8,labelY,8,{color:selected?AMBER:branchColor});
    const labelW=b.w-(showMark?18:7);
    etched(ctx,entry.label,b.x+(showMark?14:4),labelY,labelW,size,{
      color:selected? '#fff1ca' : state==='locked'?'#b4b1a0':CREAM,weight:selected?700:600,
    });
    const clearWidth=Math.abs(outPosition.x-input.x)-input.r-outPosition.r-3;
    if (entry.circuitBend) {
      if (!shallow) fill(ctx,b.x+2,labelY+6,b.w-4,1,'#a05744');
      if (!compact) etched(ctx,'SEAL CUT',b.x+b.w/2,input.y-input.r-6,b.w*.4,7.6,{align:'center',mono:true,color:'#e1a784'});
    }
    const meterWidth=Math.min(shallow ? b.h*.56 : compact ? 19 : 28,clearWidth);
    drawPatchLcd(ctx,(input.x+outPosition.x)/2,input.y,meterWidth,meterWidth*.78,{
      branch:node.branch,glyph:entry.techniqueId,state,
    });
    if(!entry.circuitBend && b.h>=62 && b.w>=50) {
      etched(ctx,digits(entry.tier),(input.x+outPosition.x)/2,input.y-input.r-5,b.w*.20,6.7,{
        mono:true,align:'center',color:'#c4ad78',
      });
    }
    if(entry.circuitBend && b.h>=36) {
      etched(ctx,'A',outPosition.x,outPosition.y-outPosition.r-6,11,7,{align:'center',mono:true});
      etched(ctx,'B',input.x,input.y-input.r-6,11,7,{align:'center',mono:true});
    } else if(b.h>=54) {
      etched(ctx,'IN',input.x,input.y-input.r-5,b.w*.25,6.7,{mono:true,align:'center',color:MUTED});
      etched(ctx,'OUT',outPosition.x,outPosition.y-outPosition.r-5,b.w*.28,6.7,{mono:true,align:'center',color:MUTED});
    } else if(b.h>=38 && b.w>=63) {
      etched(ctx,'I',input.x-input.r-5,input.y,6,6.4,{mono:true,align:'center',color:MUTED});
      etched(ctx,'O',outPosition.x+outPosition.r+5,outPosition.y,6,6.4,{mono:true,align:'center',color:MUTED});
    }
  }
}

function wrapLines(ctx, text, max, fontSize) {
  ctx.font=`500 ${fontSize}px ${SANS}`;
  const words=String(text||'').trim().split(/\s+/);
  const lines=[];
  let line='';
  for(const word of words){
    const next=line?`${line} ${word}`:word;
    if(line && ctx.measureText(next).width>max){ lines.push(line);line=word; }
    else line=next;
  }
  if(line)lines.push(line);
  return lines;
}
function glass(ctx,x,y,w,h) {
  fill(ctx,x,y,w,h,'#131710');
  fill(ctx,x+1,y+1,w-2,h-2,'#686858');
  fill(ctx,x+3,y+3,w-6,h-6,gradient(ctx,y,h,[[0,'#10190f'],[.44,'#151f15'],[1,'#0e150d']]));
  fill(ctx,x+3,y+h-3,w-6,1,'#919077');
}

function paintTray(ctx,t,pins,returnHover,active,side) {
  const lift=returnHover?AMBER:active?'#c4b384':'#797865';
  fill(ctx,t.x,t.y,t.w,t.h,'#10130e');
  fill(ctx,t.x+1,t.y+1,t.w-2,t.h-2,gradient(ctx,t.y,t.h,[[0,lift],[.12,'#42453a'],[.3,'#23281e'],[.87,'#1f251b'],[1,'#656550']]));
  fill(ctx,t.x+4,t.y+t.h-5,t.w-8,2,returnHover?AMBER:'#7d7758');
  const magazine=side && t.h>=81 && t.w>=150;
  const middle=magazine?t.y+13:t.y+t.h*(side?.48:.75);
  drawPatchChannelIcon(ctx,'spare',t.x+17,middle,Math.min(16,t.h*.35),{color:returnHover?AMBER:CREAM});
  etched(ctx,'RETURN TO SPARES',t.x+31,middle,t.w-43,clamp(t.h*.28,9,11),{color:returnHover?AMBER:CREAM});
  if (!magazine) return;

  // The removable plugs in the stowage comb are the actual spare count.
  // The dark pockets remain empty while leads are fitted to the matrix.
  const wellX=t.x+7,wellY=t.y+26,wellW=t.w-14,wellH=t.h-34;
  fill(ctx,wellX,wellY,wellW,wellH,'#0e1410');
  fill(ctx,wellX+1,wellY+1,wellW-2,wellH-2,gradient(ctx,wellY,wellH,[
    [0,'#090d0a'],[.2,'#1a201a'],[.87,'#1a211b'],[1,'#4d4d3b'],
  ]));
  const pitch=(wellW-12)/MAX_PINS;
  const socketY=wellY+Math.min(27,wellH*.45);
  const h=Math.min(36,wellH-14);
  for (let i=0;i<MAX_PINS;i++) {
    const cx=wellX+6+pitch*(i+.5);
    const width=Math.min(13,pitch*.57);
    const top=socketY-h*.35;
    const spare=i>=pins.spent && i<pins.spent+pins.unspent;
    const unissued=i>=pins.earned;
    fill(ctx,cx-width/2-2,top-2,width+4,h+5,'#090e0b');
    fill(ctx,cx-width/2-1,top+1,width+2,h,'#252a21');
    if (spare) {
      fill(ctx,cx-1.8,top,3.6,h*.34,'#afab91');
      fill(ctx,cx-1.8,top+h*.13,3.6,1,'#262b25');
      fill(ctx,cx-width/2,top+h*.31,width,h*.4,'#777967');
      fill(ctx,cx-width/2+1.5,top+h*.34,1,h*.32,'#c7c5aa');
      fill(ctx,cx-width/2,top+h*.57,width,2,'#be9354');
      fill(ctx,cx-width*.28,top+h*.70,width*.56,h*.30,'#414638');
      fill(ctx,cx-width*.28,top+h*.81,width*.56,1,'#101710');
    } else if (!unissued) {
      fill(ctx,cx-width/2+1,top+h*.48,width-2,2,'#565641');
    }
    etched(ctx,digits(i+1),cx,wellY+wellH-6,pitch,7.2,{align:'center',mono:true,color:spare?AMBER:MUTED});
  }
}

export function serviceTagBounds(detail, tray, side, { cellW, cellH }) {
  if (side) {
    const w = Math.min(detail.h * cellH >= 415 ? 146 : 100, tray.w * cellW - 16);
    const h = w * .48;
    return { x:tray.x+12/cellW, y:tray.y-(h+16)/cellH, w:w/cellW, h:h/cellH };
  }
  const width = Math.max(1, (tray.x-detail.x) * cellW);
  const w = Math.min(111,width*.37);
  const h = Math.min(w*.48,detail.h*cellH-23);
  return { x:tray.x-(w+10)/cellW, y:detail.y+8/cellH, w:w/cellW, h:h/cellH };
}

export function patchInstrumentState(pins, drag) {
  const edited = pins.pending > 0 || pins.pulled > 0;
  const matched = !!(drag?.targetId && drag.valid && !drag.returnHover);
  const fault = !!(drag?.targetId && !drag.valid && !drag.returnHover);
  const changes = [pins.pending && `+${pins.pending} NEW`, pins.pulled && `-${pins.pulled} PULLED`].filter(Boolean);
  const message = drag?.returnHover ? 'RELEASE TO RETURN'
    : fault ? 'NO ROUTE'
      : matched ? 'RELEASE TO PATCH'
        : drag?.returnable ? 'CHOOSE INPUT OR SPARES'
          : drag ? 'CHOOSE AN INPUT'
          : edited ? 'CLOSE CASE TO APPLY' : '';
  return { edited, matched, fault, changes: changes.join(' / '), message };
}

function lcdText(ctx, value, x, y, w, size, color = SCREEN) {
  if (!value || w < 4) return;
  drawElectronicText(ctx, value, x, y, {
    mode: 'lcd', fontSize: size, cellWidth: size * .77, maxWidth: w,
    color, alpha: Math.min(1, Math.max(.66, uiBrightness())), lcdGlow: false,
  });
}

function witness(ctx, x, y, name, lit, color, compact = false) {
  fill(ctx,x,y-3,8,6,'#0a100d');
  fill(ctx,x+1,y-2,6,4,lit ? color : '#34392d');
  if (lit) fill(ctx,x+2,y-2,4,.9,'#f7e6b2');
  etched(ctx,name,x+12,y,compact?34:43,compact?7.6:8.1,{color:lit?CREAM:MUTED,mono:true});
}

function witnesses(ctx,x,y,w,state,compact = false) {
  const gap = w / 3;
  witness(ctx,x,y,'EDIT',state.edited,AMBER,compact);
  witness(ctx,x+gap,y,'MATCH',state.matched,OK,compact);
  witness(ctx,x+gap*2,y,'FAULT',state.fault,FAULT,compact);
}

function inventoryCells(ctx,x,y,w,pins) {
  const step = w / MAX_PINS;
  for(let i=0;i<MAX_PINS;i++){
    const color=i<pins.spent?'#badb94':i<pins.spent+pins.unspent?'#edc579':'#323c31';
    fill(ctx,x+i*step,y,step-3,5,'#080f0a');
    fill(ctx,x+i*step+1,y+1,step-5,3,color);
  }
}

function drawTestContact(ctx,{x,y,r},ready,live) {
  const size=Math.max(3.5,r*.78);
  fill(ctx,x-size-2,y-size-2,size*2+4,size*2+4,ready?'#a05744':'#18130e');
  fill(ctx,x-size,y-size,size*2,size*2,'#80694d');
  fill(ctx,x-size+1,y-size+1,size*2-2,size*2-2,live?'#e0ac69':'#baa480');
  fill(ctx,x-size+1,y-.7,size*2-2,1.4,'#494032');
}

function paintRegister(ctx, x, y, w, pins, signal) {
  glass(ctx,x,y,w,43);
  lcdText(ctx,`FITTED ${digits(pins.spent)}    SPARE ${digits(pins.unspent)}`,x+8,y+11,w-16,11);
  inventoryCells(ctx,x+8,y+20,w-16,pins);
  lcdText(ctx,signal.changes,x+8,y+34,w-16,9.4);
}

function paintReadout(ctx,detail,tray,side,selected,upstream,pins,labels,drag,dragSource,dragTarget,note) {
  const d=detail;
  const signal=patchInstrumentState(pins,drag);
  body(ctx,d.x,d.y,d.w,d.h);
  const inset=8;
  const x=d.x+inset,y=d.y+inset;
  const right=side?d.x+d.w-inset:(note?.bounds.x ?? tray.x)-8;
  const available=right-x;

  if (side) {
    etched(ctx,'PATCH CONTROL',x,y+4,available,10.2,{weight:700});
    fastener(ctx,right-1,y+4,'register-screw',2.4);
    witnesses(ctx,x,y+20,available,signal);
    paintRegister(ctx,x,y+29,available,pins,signal);
  }

  if (selected) {
    const [color] = patchLcdColors(selected.branch);
    const label=labels[selected.branch]||selected.branch.toUpperCase();
    const address=selected.circuitBend?'SEAL CUT':labels[selected.branch]||selected.branch.toUpperCase();
    const mode=selected.circuitBend?'UNAPPROVED':selected.special?'SPECIAL':selected.active?'ACTION':'ALWAYS ON';
    const meta=skillLcdState(selected);
    const state={patched:'FITTED',pending:'UNSAVED',ready:'OPEN',locked:'UNAVAILABLE',pulled:'PULLED'}[meta];
    const route=selected.owned
      ?`PULL TO FREE ${selected.pulls?.length||1} ${selected.pulls?.length>1?'LEADS':'LEAD'}`
      :selected.enabled?'NEEDS ONE SPARE LEAD':selected.blockedBy;
    const feed=dragSource || (selected.circuitBend?'EXPOSED CONTACT A':upstream ? `${upstream.label} OUT` : `${label} SEND`);
    const destination=drag?.returnHover ? 'SPARES'
      : dragTarget ? (dragTarget.circuitBend?'CONTACT B':`${dragTarget.label} IN`)
        : drag ? '—' : selected.circuitBend?'CONTACT B':`${selected.label} IN`;
    const left=x+7;
    const width=available-14;
    const line=side?y+79:y;
    const bottom=side?(note?.bounds.y ?? tray.y)-6:d.y+d.h-5;
    const tint=meta==='patched'?OK:meta==='locked'?FAULT:AMBER;
    if (side) {
      const tall=bottom-line>=220;
      const header=line+(tall?23:15);
      const badgeWidth=tall?34:24;
      const titleY=line+(tall?56:37);
      const detailY=titleY+(tall?24:15);
      const desc=wrapLines(ctx,selected.detail,width,tall?11.7:10.5);
      const lensEnd=Math.min(bottom-(note&&!tall?47:54),detailY+(tall?4:3)*13);
      const rows=Math.max(0,Math.floor((lensEnd-detailY-8)/13)+1);
      glass(ctx,x,line,available,lensEnd-line);
      drawPatchLcd(ctx,left+badgeWidth/2,header,badgeWidth,badgeWidth*.78,{
        branch:selected.branch,glyph:selected.techniqueId,state:meta,
      });
      lcdText(ctx,address,left+badgeWidth+7,header-(tall?6:4),width-badgeWidth-8,tall?11:9.2,color);
      lcdText(ctx,`${mode} / ${state}`,left+badgeWidth+7,header+(tall?8:6),width-badgeWidth-8,9,tint);
      lcdText(ctx,selected.label,left,titleY,width,tall?17:13,color);
      desc.slice(0,rows).forEach((text,index)=>ink(ctx,index===rows-1&&desc.length>rows?text+'…':text,
        left,detailY+13*index,width,tall?11.7:10.5,{color:'#ded8bf',weight:500}));

      const routeTop=lensEnd+(tall?24:13);
      const routeHeight=Math.min(bottom-routeTop,tall?88:68);
      const returnCount=drag?.returnCount || 0;
      const returnText=returnCount ? `${returnCount} ${returnCount===1?'LEAD':'LEADS'} BACK` : '';
      const message=signal.fault ? drag.reason || signal.message : signal.message;
      const action=drag ? message : route;
      const condition=drag ? (drag.returnHover || !drag.targetId ? returnText : '') : message || selected.toolStatus;
      etched(ctx,'PATCH LEAD',x,routeTop-6,available,8.8,{mono:true,color:CREAM});
      glass(ctx,x,routeTop,available,routeHeight);
      if (signal.fault) {
        lcdText(ctx,action,left,routeTop+11,width,10,FAULT);
        lcdText(ctx,feed,left,routeTop+25,width,10,color);
        lcdText(ctx,`> ${destination}`,left,routeTop+39,width,10,color);
      } else if (tall) {
        lcdText(ctx,feed,left,routeTop+13,width,11,color);
        lcdText(ctx,`> ${destination}`,left,routeTop+28,width,11,color);
        lcdText(ctx,action,left,routeTop+46,width,10,signal.matched?OK:tint);
      } else {
        lcdText(ctx,`${feed} > ${destination}`,left,routeTop+11,width,9.7,color);
        lcdText(ctx,action,left,routeTop+24,width,9.2,signal.matched?OK:tint);
      }
      if (condition && routeHeight>47) lcdText(ctx,condition,left,routeTop+(tall?63:42),width,9.3);
      if (!drag && selected.toolStatus && message && routeHeight>72) {
        lcdText(ctx,selected.toolStatus,left,routeTop+76,width,9.3);
      }
      if (!drag && selected.pulls?.length>1 && bottom-routeTop-routeHeight>=31) {
        const legendY=routeTop+routeHeight+15;
        etched(ctx,'ON WITHDRAWAL',x,legendY,available,8.6,{mono:true});
        const warnings=wrapLines(ctx,selected.pulls.join(' / '),available,10.3);
        const limit=Math.max(0,Math.floor((bottom-legendY-9)/12));
        warnings.slice(0,limit).forEach((warning,index)=>ink(ctx,warning,x,legendY+12+index*12,available,10.3,{color:AMBER}));
      }
    } else {
      glass(ctx,x,line,available,bottom-line);
      const badgeWidth=available<420?20:24;
      const top=line+11;
      drawPatchLcd(ctx,left+badgeWidth/2,top,badgeWidth,badgeWidth*.75,{
        branch:selected.branch,glyph:selected.techniqueId,state:meta,
      });
      lcdText(ctx,`${address}  ${selected.label} / ${state}`,left+badgeWidth+5,top,width-badgeWidth-5,10.4,color);
      if (!note) lcdText(ctx,`${feed} > ${destination}`,left,top+13,width,9.5,color);
      const statusY=bottom-9;
      const descriptionY=top+(note?15:26);
      const desc=wrapLines(ctx,selected.detail,width,10.1);
      const maxLines=Math.min(2,Math.max(0,Math.floor((statusY-descriptionY-9)/11)+1));
      desc.slice(0,maxLines).forEach((text,index)=>ink(ctx,
        index===maxLines-1&&desc.length>maxLines?text+'…':text,left,descriptionY+index*11,width,10.1,{color:'#ded8bf',weight:500}));
      const statusText = (signal.fault && drag.reason) || signal.message || route;
      lcdText(ctx,statusText,left,statusY,width,9.3,signal.fault?FAULT:signal.matched?OK:tint);
    }
  }

  if (note) {
    const tag=note.bounds;
    drawServiceLockoutTag(ctx,tag,{tied:true});
    const promptY=tag.y+tag.h+(side?7:9);
    ink(ctx,note.prompt,tag.x+tag.w/2,promptY,tag.w,8.6,{align:'center',mono:true,color:'#c6bfaa'});
  }
  paintTray(ctx,tray,pins,!!drag?.returnHover,!!drag?.rerouteId,side);
  if (!side) {
    const tx=tray.x+7,tw=tray.w-14;
    lcdText(ctx,`SPARE ${digits(pins.unspent)}   FITTED ${digits(pins.spent)}`,tx,tray.y+10,tw,9);
    witnesses(ctx,tx,tray.y+21,tw,signal,true);
    lcdText(ctx,signal.changes,tx,tray.y+32,tw,8.5);
  }
}

export function drawChannelStripBay(surface,tree,{labels,selectedId,pins,patchDrag,hovered,lifted,returnHover,notePrompt}) {
  const {ctx,dpr,cellW,cellH}=surface;
  const rect=b=>({x:b.x*cellW,y:b.y*cellH,w:b.w*cellW,h:b.h*cellH});
  const point=s=>({x:s.x*cellW,y:s.y*cellH,r:s.rY*cellH});
  const rack=rect(tree.strip.rack);
  const channels=tree.channels.map((c,i)=>({
    ...c,box:rect(c.box),source:point(tree.sources[i]),labelWidth:c.labelWidth*cellW,
    sendWidth:c.sendWidth*cellW,pitch:c.pitch*cellW,label:labels[c.id]||c.id.toUpperCase(),
  }));
  const byBranch=new Map(channels.map(channel=>[channel.id,channel]));
  const nodes=tree.nodes.map(node=>({...node,bounds:rect(node.bounds),input:point(node.input),
    output:node.output&&point(node.output),outPosition:point(node.outPosition)}));
  const entriesById=new Map(nodes.map(node=>[node.id,node.entry]));
  const selected=entriesById.get(selectedId);
  const upstream=selected?.lead ? nodes.find(node=>node.branch===selected.branch&&node.entry.tier===selected.lead.fromTier)?.entry : null;
  const sourceEntry=patchDrag && nodes.find(node=>node.id===patchDrag.from.skillId)?.entry;
  const dragSource=patchDrag && (patchDrag.from.id.startsWith('terminal:')?'EXPOSED CONTACT A':sourceEntry ? `${sourceEntry.label} OUT` : `${labels[patchDrag.from.branch]} SEND`);
  const dragTarget=patchDrag?.targetId && tree.inputs.find(socket=>socket.id===patchDrag.targetId);
  const targetEntry=dragTarget && entriesById.get(dragTarget.skillId);
  const liftedEntry=lifted && entriesById.get(lifted.skillId);
  const anchor=new Map();
  const note=selected?.circuitBend && notePrompt && !patchDrag
    ? {bounds:rect(serviceTagBounds(tree.detail,tree.returnZone,tree.strip.side,{cellW,cellH})),prompt:notePrompt} : null;
  const bankRoots=new Map(channels.map(channel=>[channel.id,nodes.filter(node=>node.branch===channel.id&&!node.entry.lead)]));
  const harness=(branch,skillId)=>{
    const {source}=byBranch.get(branch);
    const targets=bankRoots.get(branch);
    const i=targets.findIndex(node=>node.id===skillId);
    const count=targets.length;
    return {...source,captive:true,exitY:source.y+source.r*.66,lane:Math.max(0,i),laneCount:Math.max(1,count)};
  };
  const drawLead=(cable,end,opts={})=>{
    const bank=byBranch.get(cable.branch);
    const from=anchor.get(cable.id);
    if(!from)return;
    drawFieldPatchCord(ctx,from,end,{
      color:entriesById.get(cable.skillId)?.circuitBend?JUMPER:COLORS[cable.branch],radius:end.r||from.r,seed:cable.id,
      gutterY:bank.box.y+bank.box.h-3,lane:from.lane,laneCount:from.laneCount,...opts,
    });
  };

  ctx.save();
  ctx.scale(dpr,dpr);
  paintRack(ctx,rack,channels,nodes,selectedId);
  for(const channel of channels){
    const {source}=channel;
    drawChannelHarness(ctx,source.x,source.y,source.r,{
      color:COLORS[channel.id],available:pins.unspent>0,selected:patchDrag?.from.id===`supply:${channel.id}`,
    });
  }
  for(const node of nodes){
    if (node.entry.circuitBend) {
      drawTestContact(ctx,node.outPosition,false,patchDrag?.from.id===node.feed.id || node.installed);
      drawTestContact(ctx,node.input,patchDrag?.compatibleIds?.includes(node.id),node.installed);
      continue;
    }
    const common={color:node.entry.circuitBend?JUMPER:COLORS[node.branch],ready:node.entry.enabled,selected:node.id===selectedId};
    drawChannelJack(ctx,node.input.x,node.input.y,node.input.r,{
      ...common,compatible:patchDrag?.compatibleIds?.includes(node.id)||hovered?.skillId===node.id,
      occupied:!!node.output && lifted?.skillId!==node.id,
    });
    const out=node.outPosition;
    drawChannelJack(ctx,out.x,out.y,out.r,{
      ...common,cap:!node.output,outlet:true,selected:patchDrag?.from.id===`output:${node.id}`,
    });
  }
  for(const cable of tree.cables){
    const from=cable.from.id.startsWith('supply:')?harness(cable.branch,cable.skillId):point(cable.from);
    anchor.set(cable.id,from);
    if(patchDrag?.rerouteId===cable.to.techniqueId || tree.reseating?.id===cable.to.techniqueId)continue;
    const end=point(cable.to);
    const seat=tree.seating?.id===cable.to.techniqueId?tree.seating.progress:1;
    end.depth=.67+.33*seat;
    const {box:b,labelWidth}=byBranch.get(cable.branch);
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x+labelWidth,b.y+3,b.w-labelWidth,b.h-4);
    ctx.clip();
    drawLead(cable,end);
    ctx.restore();
  }
  paintReadout(ctx,rect(tree.detail),rect(tree.returnZone),tree.strip.side,selected,upstream,pins,labels,patchDrag,dragSource,targetEntry,note);
  if(tree.reseating){
    const {id,from,progress}=tree.reseating;
    const cable=tree.cables.find(item=>item.to.techniqueId===id);
    if(cable){
      const start=anchor.get(cable.id),end=point(cable.to);
      const x=from.x*cellW,y=from.y*cellH;
      drawLead(cable,{...end,x:x+(end.x-x)*progress,y:y+(end.y-y)*progress,depth:Math.max(0,(progress-.68)/.32)},{
        held:true,compatible:progress>.68,restLength:fieldPatchCordLength(start,end,{radius:end.r,seed:cable.id,lane:start.lane,laneCount:start.laneCount}),
      });
    }
  }
  if(patchDrag?.from && patchDrag.to){
    const boundary=rect(tree);
    ctx.beginPath();ctx.rect(boundary.x,boundary.y,boundary.w,boundary.h);ctx.clip();
    const original=tree.cables.find(cable=>cable.to.techniqueId===patchDrag.rerouteId);
    const from=original?anchor.get(original.id)
      :patchDrag.from.id.startsWith('supply:')?harness(patchDrag.from.branch,hovered?.skillId):point(patchDrag.from);
    const compatible=!returnHover&&!!hovered;
    const pointer=patchDrag.displayTo||patchDrag.to;
    const end=compatible?point(hovered)
      :returnHover?{x:pointer.x*cellW,y:pointer.y*cellH,r:from.r,angle:.25,depth:.48}
        :lifted&&!patchDrag.moved?{...point(lifted),angle:0,depth:.27}
        :{x:pointer.x*cellW,y:pointer.y*cellH,r:from.r};
    const seed=original?.id||patchDrag.from.id;
    const restLength=original?fieldPatchCordLength(from,point(original.to),{
      radius:from.r,seed,lane:from.lane,laneCount:from.laneCount,
    }):clamp(rack.w*.24,65,205);
    drawFieldPatchCord(ctx,from,end,{
      color:targetEntry?.circuitBend||liftedEntry?.circuitBend?JUMPER:COLORS[patchDrag.from.branch],radius:end.r,seed,held:true,compatible,restLength,
      lane:from.lane,laneCount:from.laneCount,
      swing:clamp((patchDrag.to.x-pointer.x)*cellW/24,-1,1),
    });
  }
  ctx.restore();
}
