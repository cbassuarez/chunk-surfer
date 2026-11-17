// Path register: authored fixed-anode artwork and menu geometry.
// The route is symbolic; its nodes never encode a real room or progress count.
// Address timing is an artistic firmware sequence, not phosphor persistence.
export const PATH_REGISTER_DURATION = 480;
export const PATH_REGISTER_QUANTUM = 20;
export const PATH_REGISTER_CONFIRM = 'START NEW RUN? PRESS ENTER AGAIN';
export const PATH_REGISTER_COPY = Object.freeze({
  'new-run': {caption:'FRESH ORIGIN',lines:['START A NEW NIGHT.','PREPARE YOUR SHIFT IN THE VAN.']},
  continue: {caption:'SAVED POSITION',lines:['RESUME THE ACTIVE NIGHT.','RETURN TO ITS SAVED STATE.']},
  archive: {caption:'FILED RECORDS',lines:['COMPLETION / DISCOVERIES / RETURNS','INCLUDES FILED RECORDINGS.']},
  'return-index': {caption:'OUTCOME INDEX',lines:['REACHED OUTCOMES + UNREACHED HINTS.','REVIEW THE ENDING INDEX.']},
  'transfer-room': {caption:'REVISIT',lines:['REVISIT SCENES OR PLAY SOURCE MEDIA.','REPLAYS LEAVE THE NIGHT UNCHANGED.']},
  settings: {caption:'FOUR CONTROL GROUPS',lines:['AUDIO / DISPLAY / CONTROLS / ACCESS','ADJUST THE GAME. KEEP YOUR NIGHT.']},
  about: {caption:'CREDITS + INFORMATION',lines:['CREDITS AND GAME INFORMATION.','']},
  quit: {caption:'CLOSE APPLICATION',lines:['CLOSE CHUNK SURFER.','']},
});
const rect = (x,y,w,h,level=1,onset=0) => ({x,y,w,h,level,onset});
function buildArt(id){
    const cells=new Map();
    function set(key,s){const old=cells.get(key);if(!old||old.level<s.level)cells.set(key,s);}
    for(let y=0;y<13;y++)for(let x=0;x<16;x++){
      const px=10+x*20,py=8+y*20;
      set(`n${x},${y}`,rect(px-3,py-3,6,6,0));
      if(x<15)set(`h${x},${y}`,rect(px+5,py-1.5,10,3,0));
      if(y<12)set(`v${x},${y}`,rect(px-1.5,py+5,3,10,0));
    }
    const node=(x,y,l=1,t=0)=>set(`n${x},${y}`,rect(7+x*20,5+y*20,6,6,l,t));
    function line(x1,y1,x2,y2,l=.5,t=0){
      if(x1!==x2&&y1!==y2)throw Error('Link lattice requires orthogonal edges');
      const n=Math.abs(x2-x1)+Math.abs(y2-y1),dx=Math.sign(x2-x1),dy=Math.sign(y2-y1);
      for(let k=0;k<=n;k++){
        const x=x1+k*dx,y=y1+k*dy;node(x,y,l,t+k*.02);
        if(k<n){const key=dx?`h${Math.min(x,x+dx)},${y}`:`v${x},${Math.min(y,y+dy)}`;
          const s=cells.get(key);set(key,{...s,level:l,onset:t+k*.02});}
      }
    }
    const box=(x,y,w,h,l=.65,t=0)=>{line(x,y,x+w,y,l,t);line(x+w,y,x+w,y+h,l,t+.025);line(x+w,y+h,x,y+h,l,t+.05);line(x,y+h,x,y,l,t+.075);};
    const path=(pts,l,t=0)=>pts.slice(1).forEach((p,i)=>line(...pts[i],...p,l,t+i*.055));
    if(id==='new-run'||id==='continue'){
      const route=[[2,10],[2,7],[6,7],[6,4],[11,4],[11,2],[14,2]];
      path(route,.18,0);
      if(id==='new-run'){
        box(1,9,2,2,1,0);node(2,10,1,0);
        line(2,8,2,7,.55,.19);line(2,7,4,7,.38,.25);
      }else{
        path(route.slice(0,5),.50,0);
        box(8,3,2,2,1,.04);node(9,4,1,0);
        line(11,4,11,2,.70,.20);line(11,2,13,2,.70,.30);
      }
    }else if(id==='settings'){
      [2,5,8,11].forEach((y,i)=>{line(2,y,14,y,.38,0);box([7,11,5,9][i]-1,y-1,2,2,1,i*.09);});
    }else if(id==='archive'){
      [1,5,9].forEach((y,i)=>{box(2,y,11,3,.64,i*.08);line(6,y+1,9,y+1,1,i*.08+.05);node(3,y+2,.65,i*.08);});
    }else if(id==='return-index'){
      line(2,6,7,6,.65);line(7,2,7,10,.6);
      [2,6,10].forEach((y,i)=>{line(7,y,12,y,.55,.10+i*.065);box(12,y-1,2,2,i===0?1:.45,.17+i*.065);if(i===0)node(13,y,1,.17);});
    }else if(id==='transfer-room'){
      box(1,1,12,7,.65);box(5,3,4,5,1,.12);line(2,6,4,6,.4);line(10,6,12,6,.4);
      box(3,10,9,2,.65,.12);line(14,3,14,10,.48,.20);line(13,10,14,10,.6,.25);line(1,10,2,10,.9,.30);line(1,9,1,11,.9,.32);
    }else if(id==='about'){
      box(3,1,9,11,.60);line(5,3,10,3,1,.04);line(5,5,10,5,.45,.12);line(5,7,9,7,.45,.20);line(5,9,10,9,.45,.28);node(4,3,1);
    }else if(id==='quit'){
      path([[9,1],[2,1],[2,11],[9,11]],.60);line(7,6,14,6,1,.08);path([[12,4],[14,4],[14,8],[12,8]],.70,.18);
    }
    return [...cells.values()].map(s=>({...s,group:Math.min(3,Math.floor(s.y/64))}));
  }

const artCache = new Map();
export function pathRegisterArt(id) {
  const action = PATH_REGISTER_COPY[id] ? id : 'new-run';
  if (!artCache.has(action)) artCache.set(action,Object.freeze(buildArt(action).map(Object.freeze)));
  return artCache.get(action);
}

export function pathRegisterLevel(shape, time, id) {
  if (time === Infinity || time >= PATH_REGISTER_DURATION) return shape.level;
  const u = Math.max(0,time) / PATH_REGISTER_DURATION;
  if (id === 'settings' && u < shape.group * .14) return shape.level * .35;
  if (id === 'continue' && shape.level <= .65) return shape.level;
  return u < shape.onset * 2.2 ? shape.level * .22 : shape.level;
}

export function createPathRegisterMotion(initialId) {
  let id = initialId, changedAt = -Infinity, startedAt = -Infinity;
  const settle = () => { startedAt = -Infinity; };
  return {
    select(next, now, reduced = false) {
      if (next === id) return false;
      const rapid = now - changedAt < 100;
      id = next; changedAt = now; startedAt = reduced || rapid ? -Infinity : now;
      return true;
    },
    settle,
    time(now, {reduced = false, visible = true} = {}) {
      if (reduced || !visible || now - startedAt >= PATH_REGISTER_DURATION) settle();
      return startedAt === -Infinity ? Infinity : Math.floor(Math.max(0,now-startedAt)/PATH_REGISTER_QUANTUM)*PATH_REGISTER_QUANTUM;
    },
  };
}

export function pathRegisterCopy(id, {activeRun=false,confirm=false}={}) {
  const copy = PATH_REGISTER_COPY[id] || PATH_REGISTER_COPY['new-run'];
  const lines = [...copy.lines];
  if (id === 'new-run' && activeRun) lines[1] = 'REPLACES ACTIVE NIGHT. PROFILE KEPT.';
  if (id === 'new-run' && confirm) lines[0] = PATH_REGISTER_CONFIRM;
  return {...copy,lines};
}

// Pixel geometry is relative to the existing aperture, never the bezel.
// At the canonical size this reproduces the approved 680 x 572 review case.
// Small output sizes enlarge the ROM instead of shrinking labels below 11 px.
export function pathRegisterLayout(aperture, {cellW=8.45,cellH=20,displayScale=1}={},
  {itemCount=0,selected=0,scroll=0}={}) {
  const unit = cellH / 20, width = aperture.w * cellW, height = aperture.h * cellH;
  const outputScale = Math.max(.1,Number(displayScale)||1);
  const pad = 32*unit, minPitch = 11/7/outputScale;
  const labelPitch = Math.max(1.8*unit,minPitch), helpPitch = Math.max(1.65*unit,minPitch);
  const menuWidth = Math.max(211*unit,30*unit+78*labelPitch);
  const rowStep = Math.max(32*unit,7*labelPitch+16*unit);
  const menuY = 112*unit, menuTop = menuY-8*unit;
  const helpStep = Math.max(21*unit,9*helpPitch);
  const helpY = height-19*unit-7*helpPitch-helpStep;
  const visible = Math.max(1,Math.min(itemCount,Math.floor((helpY-16*unit-menuTop)/rowStep)));
  let start = Math.max(0,Math.min(scroll,itemCount-visible));
  if (selected < start) start = selected;
  if (selected >= start+visible) start = selected-visible+1;
  const artX = Math.max(278*unit,pad-3*unit+menuWidth+24/outputScale);
  const profilePitch = Math.max(1.6*unit,minPitch);
  const artY = Math.max(104*unit,68*unit+7*profilePitch+24*unit), captionPitch = helpPitch;
  const artWidth = Math.max(1,Math.min(320*unit,width-pad-artX,
    (helpY-artY-17*unit-16*captionPitch)/.8));
  const artScale = artWidth/320;
  const rows = Array.from({length:visible},(_,row)=>({
    index:start+row,x:pad+14*unit,y:menuY+row*rowStep,
    hit:{x:(aperture.x*cellW+pad-3*unit)/cellW,
      y:(aperture.y*cellH+menuTop+row*rowStep)/cellH,w:menuWidth/cellW,h:rowStep/cellH},
  }));
  return {x:aperture.x*cellW,y:aperture.y*cellH,width,height,unit,pad,labelPitch,helpPitch,helpStep,helpY,
    title:{x:pad,y:32*unit,pitch:3.2*unit}, profile:{x:pad,y:68*unit,pitch:profilePitch},
    rows,start,visible,menuWidth,rowStep,menuY,art:{x:artX,y:artY,w:artWidth,h:artWidth*.8,scale:artScale},
    caption:{x:artX,y:artY+artWidth*.8+17*unit,pitch:captionPitch,capacity:Math.max(1,Math.floor(artWidth/(6*captionPitch)))},
    categories:{x:artX+unit,y:artY-21*unit,pitch:Math.max(1.6*unit,minPitch)},
    selectionHeight:Math.max(17*unit,7*labelPitch+4*unit),
    helpCapacity:Math.floor((width-pad*2)/(6*helpPitch)),
  };
}

export function pathRegisterWrap(text, capacity) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length+word.length+1>capacity) { lines.push(line); line=''; }
    line += (line?' ':'')+word;
  }
  if (line) lines.push(line);
  return lines;
}
