/* Authored menu phosphor study. Coordinates are CSS pixels at UI scale 1.
 * No photographs, shaded models, dithering, or runtime source-image sampling.
 * A: fixed orthogonal links. B: binary square dot matrix. C: chamfered bars.
 * Every transition changes addresses/duty only; anode geometry is immutable.
 */
window.VFDStudy = (() => {
  const W=680,H=572;
  const names=['Path register','Night ledger','Relay atlas'];
  const colors=['#ffcf74','#96ebd0','#d6e8a6'];
  const ids=['continue','new-run','archive','return-index','transfer-room','settings','about','quit'];
  const labels=['CONTINUE','NEW GAME','ARCHIVE','ENDINGS','FIELD REPLAYS','SETTINGS','ABOUT','QUIT'];
  const durations=[480,600,420];
  const captions={
    'new-run':['FRESH ORIGIN','BLANK NIGHT','START NEW NIGHT'],
    continue:['SAVED POSITION','MARKED PLACE','RESUME SAME NIGHT'],
    archive:['FILED RECORDS','PROFILE FILES','RECORD BANK'],
    'return-index':['OUTCOME INDEX','OUTCOME INDEX','TERMINAL INDEX'],
    'transfer-room':['REVISIT','SCENES + MEDIA','REPLAY CIRCUIT'],
    settings:['FOUR CONTROL GROUPS','FOUR CONTROL GROUPS','CONTROL ROUTING'],
    about:['CREDITS + INFORMATION','CREDITS + INFORMATION','CREDITS + INFORMATION'],
    quit:['CLOSE APPLICATION','CLOSE APPLICATION','CLOSE APPLICATION']
  };
  const help={
    continue:['RESUME THE ACTIVE NIGHT.','RETURN TO ITS SAVED STATE.'],
    'new-run':['START A NEW NIGHT.','PREPARE YOUR SHIFT IN THE VAN.'],
    archive:['COMPLETION / DISCOVERIES / RETURNS','INCLUDES FILED RECORDINGS.'],
    'return-index':['REACHED OUTCOMES + UNREACHED HINTS.','REVIEW THE ENDING INDEX.'],
    'transfer-room':['REVISIT SCENES OR PLAY SOURCE MEDIA.','REPLAYS LEAVE THE NIGHT UNCHANGED.'],
    settings:['AUDIO / DISPLAY / CONTROLS / ACCESS','ADJUST THE GAME. KEEP YOUR NIGHT.'],
    about:['CREDITS AND GAME INFORMATION.',''],
    quit:['CLOSE CHUNK SURFER.','']
  };
  const profiles={
    first:{active:false,history:false,returns:false,filed:false},
    saved:{active:true,history:true,returns:false,filed:false},
    filed:{active:true,history:true,returns:true,filed:true},
    completed:{active:false,history:true,returns:true,filed:true},
    documents:{active:false,history:true,returns:false,filed:true}
  };
  function menu(profile='filed',desktop=true){
    const p=profiles[profile]||profiles.first;
    return ids.filter(id=>id==='continue'?p.active:id==='archive'?p.history:id==='return-index'?p.returns:id==='transfer-room'?p.returns||p.filed:id==='quit'?desktop:true);
  }
  const label=id=>labels[ids.indexOf(id)]||id;
  const rect=(x,y,w,h,level=1,onset=0)=>({x,y,w,h,level,onset});
  function glyphs(text,x,y,pitch=2,level=1,onset=0,capacity=text.length){
    const out=[];
    [...text.toUpperCase().padEnd(capacity,' ')].forEach((ch,i)=>{
      const rows=ASSETS.font[ch]||ASSETS.font['?'];
      rows.forEach((bits,r)=>{for(let c=0;c<5;c++)out.push(rect(x+i*6*pitch+c*pitch,y+r*pitch,pitch*.72,pitch*.72,bits&(1<<(4-c))?level:0,onset));});
    });return out;
  }
  // A: the entire, non-overlapping anode artwork is a fixed 16 x 13 lattice.
  // Node pads 6 x 6. Bridges 11 x 3. Pitch 20. Clearances never below 2 px.
  function links(id){
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
  // Binary art authoring on a logical matrix. All primitives have hard edges.
  // Alpha is an addressing tier, never an approximation of surface shading.
  function matrixSource(id,hybrid=false){
    const c=document.createElement('canvas');c.width=120;c.height=104;
    const g=c.getContext('2d',{willReadFrequently:true});
    let tier=1;
    const ink=(v=1)=>{tier=v;g.strokeStyle=g.fillStyle=`rgba(255,255,255,${v})`;};
    const fill=(x,y,w,h,v=1)=>{ink(v);g.fillRect(x,y,w,h);};
    const stroke=(x,y,w,h,v=1,lw=2)=>{ink(v);g.lineWidth=lw;g.strokeRect(x,y,w,h);};
    const path=(pts,v=1,lw=2,closed=false)=>{ink(v);g.lineWidth=lw;g.lineJoin='miter';g.lineCap='butt';g.beginPath();g.moveTo(...pts[0]);pts.slice(1).forEach(p=>g.lineTo(...p));if(closed)g.closePath();g.stroke();};
    const text=(s,x,y,p=1,v=1)=>glyphs(s,x,y,p,v).filter(r=>r.level).forEach(r=>fill(r.x,r.y,Math.max(1,r.w),Math.max(1,r.h),v));
    if(!hybrid){
      if(id==='new-run'||id==='continue'){
        path([[24,7],[86,7],[101,22],[101,96],[24,96]],.70,2,true);
        path([[86,7],[86,22],[101,22]],.70,2);
        [21,37,53,69,85].forEach(y=>stroke(17,y,3,3,.42,1));
        text(id==='new-run'?'NEW NIGHT':'SAME NIGHT',33,20,1,.9);
        [39,54,69,84].forEach(y=>path([[34,y],[90,y]],.18,1));
        if(id==='new-run'){
          stroke(31,33,9,11,1,2);path([[43,39],[58,39]],.8,2);
        }else{
          [39,54,69].forEach((y,i)=>{path([[36,y],[82-i*9,y]],.7,2);fill(28,y-2,3,3,.8);});
          path([[105,74],[93,74],[93,88],[105,88]],1,3);path([[43,84],[65,84]],1,2);
        }
      }else if(id==='settings'){
        [17,40,63,86].forEach((y,i)=>{text(['A','D','C','X'][i],6,y-3,1,.65);path([[22,y],[110,y]],.40,2);const x=[64,91,48,75][i];stroke(x-4,y-7,8,14,1,2);});
      }else if(id==='archive'){
        [0,1,2].forEach(i=>{stroke(20+i*6,16+i*10,79,62,.42+i*.15,2);});
        text('WORK',41,50,1,.9);text('FINDS',41,64,1,.9);text('RETURNS',41,78,1,.9);
        stroke(13,10,41,8,.65,2);
      }else if(id==='return-index'){
        path([[12,51],[49,51],[49,19],[86,19]],.7);path([[49,51],[86,51]],.65);path([[49,51],[49,83],[86,83]],.6);
        [19,51,83].forEach((y,i)=>{stroke(87,y-9,19,18,i===0?1:.5,2);if(!i)fill(92,y-4,9,8,.9);});
      }else if(id==='transfer-room'){
        stroke(8,13,47,63,.65);stroke(21,31,21,45,1);path([[12,56],[19,56]],.5);path([[44,56],[51,56]],.5);
        stroke(65,13,47,42,.65);path([[69,47],[80,33],[90,42],[98,27],[108,47]],.8);fill(72,22,4,4,.8);
        path([[106,66],[106,87],[21,87],[21,80]],1,2);path([[15,85],[21,79],[27,85]],1,2);
        text('SCENES',10,4,1,.6);text('MEDIA',70,4,1,.6);
      }else if(id==='about'){
        stroke(18,9,86,86,.65,2);text('CHUNK',33,25,1.5,1);text('SURFER',33,40,1.5,1);text('CREDITS',30,65,1,.7);text('GAME INFO',30,80,1,.7);
      }else if(id==='quit'){
        path([[77,10],[17,10],[17,94],[77,94]],.6,2);path([[55,51],[109,51]],1,3);path([[95,37],[109,51],[95,65]],1,3);
      }
    }else{
      // C: big planar contours and a stable contact spine. Deliberately no
      // stippled fills: the elongated cells are the physical shape language.
      if(id==='new-run'||id==='continue'){
        path([[12,66],[12,25],[71,25],[98,42],[98,83],[39,83],[12,66]],.75,3);
        path([[12,25],[39,42],[98,42]],.55,3);path([[39,42],[39,83]],.55,3);
        path([[4,80],[31,97],[108,97]],.4,3);
        if(id==='new-run'){
          path([[18,58],[27,64]],1,4);path([[4,40],[4,56]],1,3);path([[4,40],[10,44]],1,3);
        }else{
          [51,62,73].forEach((y,i)=>path([[48,y],[85-i*7,y]],.85,3));
          path([[4,50],[4,73],[26,87],[39,87]],1,4);path([[29,81],[39,87],[29,92]],1,3);
        }
      }else if(id==='settings'){
        [15,38,61,84].forEach((y,i)=>{
          path([[6,y+6],[18,y+6],[28,y],[109,y]],.5,3);
          const x=[62,88,48,76][i];path([[x-5,y-6],[x+5,y-6],[x+5,y+6],[x-5,y+6]],1,3,true);
        });
      }else if(id==='archive'){
        [17,42,67].forEach((y,i)=>{
          path([[12,y],[91,y],[108,y+12],[108,y+27],[29,y+27],[12,y+15],[12,y]],.52+i*.14,3);
          path([[12,y],[29,y+12],[108,y+12]],.45,2);path([[60,y+18],[78,y+18]],1,3);
        });
      }else if(id==='return-index'){
        path([[8,53],[35,53],[57,31],[57,10]],.65,3);path([[35,53],[91,53]],.65,3);path([[35,53],[57,75],[57,96]],.65,3);
        [10,53,96].forEach((y,i)=>{const x=i===1?99:57;path([[x-9,y],[x,y-7],[x+9,y],[x,y+7],[x-9,y]],i===0?1:.55,3);if(!i)fill(x-4,y-2,8,4,1);});
      }else if(id==='transfer-room'){
        path([[9,68],[9,24],[52,24],[72,38],[72,82],[29,82],[9,68]],.7,3);path([[29,82],[29,44],[52,44],[52,82]],1,3);
        path([[80,26],[108,26],[108,55],[80,55],[80,26]],.8,3);path([[80,52],[90,41],[99,48],[106,38]],.8,3);
        path([[108,68],[108,97],[29,97],[16,88]],1,3);path([[16,96],[16,88],[26,88]],1,3);
      }else if(id==='about'){
        path([[22,9],[80,9],[100,23],[100,94],[42,94],[22,80],[22,9]],.65,3);path([[22,9],[42,23],[100,23]],.50,3);
        [41,56,71,84].forEach((y,i)=>path([[49,y],[85-i%2*11,y]],i===0?1:.65,3));
      }else if(id==='quit'){
        path([[74,12],[17,12],[17,83],[37,96],[74,96]],.6,3);path([[17,12],[37,25],[37,96]],.4,2);
        path([[59,54],[111,54]],1,4);path([[93,37],[111,54],[93,71]],1,4);
      }
    }
    return g.getImageData(0,0,120,104).data;
  }
  const artCache=new Map();
  function art(direction,id){
    const key=direction+id;if(artCache.has(key))return artCache.get(key);
    let out;
    if(direction===0)out=links(id);
    else{
      const data=matrixSource(id,direction===2),cols=direction===1?120:40,rows=direction===1?104:32;
      const px=320/cols,py=256/rows;out=[];
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        // Nearest logical sample of deliberately binary source geometry.
        const xx=Math.min(119,Math.floor((x+.5)*120/cols)),yy=Math.min(103,Math.floor((y+.5)*104/rows));
        let alpha=data[(yy*120+xx)*4+3]/255;
        // A small footprint test keeps 3 px contours connected on the coarse
        // bar bank without assigning any brightness from coverage or shading.
        if(direction===2){let a=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)a=Math.max(a,data[((yy+dy)*120+xx+dx)*4+3]||0);alpha=a/255;}
        const level=alpha>.85?1:alpha>.60?.65:alpha>.30?.40:alpha>.1?.18:0;
        out.push({...rect(x*px,y*py,direction===1?1.6:px*.80,direction===1?1.6:py*.46,level),bar:direction===2,group:Math.min(3,Math.floor(y/rows*4)),
          onset:direction===1?(id==='continue'?.06+Math.min(y/104,.7)*.3:x/120*.3):(x/40+y/32)*.10});
      }
    }
    artCache.set(key,out);return out;
  }
  function translated(shapes,x,y,scale=1){return shapes.map(s=>({...s,x:x+s.x*scale,y:y+s.y*scale,w:s.w*scale,h:s.h*scale}));}
  function shapePath(g,s){
    if(s.bar){const k=Math.min(s.w,s.h)*.32;g.beginPath();g.moveTo(s.x+k,s.y);g.lineTo(s.x+s.w-k,s.y);g.lineTo(s.x+s.w,s.y+s.h/2);g.lineTo(s.x+s.w-k,s.y+s.h);g.lineTo(s.x+k,s.y+s.h);g.lineTo(s.x,s.y+s.h/2);g.closePath();g.fill();}
    else g.fillRect(s.x,s.y,s.w,s.h);
  }
  function levelAt(s,t,direction,id){
    if(t===Infinity)return s.level;
    const u=t/durations[direction];
    if(id==='settings'){
      // Locate each category in turn, without moving any settings thumb.
      const row=s.group||0;
      if(u<row*.14)return s.level*.35;
    }
    // Retained history is already there when Continue is selected. The saved
    // marker receives the entry sequence; history is never re-created.
    if(id==='continue'&&s.level<=.65)return s.level;
    // Spread authored address groups across the entry interval. These are
    // firmware-like selection sequences, not phosphor response simulations.
    const onset=s.onset*[2.2,2.7,4.4][direction];
    if(u<onset)return s.level*.22;
    return s.level;
  }
  const layer=document.createElement('canvas');layer.width=W;layer.height=H;const lg=layer.getContext('2d');
  function phosphor(g,shapes,{direction=0,id='new-run',time=Infinity,mode='final'}={}){
    const fullMask=mode==='mask',off=mode==='unlit',glow=mode==='final';
    // Dormant material is neutral reflected light, not a faint emitted copy.
    g.fillStyle=fullMask?'#779181':'#66735c';g.globalAlpha=fullMask?.60:off?.38:.04;
    const dormant=new Map();for(const s of shapes){const key=[s.x,s.y,s.w,s.h].map(v=>Math.round(v*10000)).join(',')+','+(s.bar?1:0);if(!dormant.has(key))dormant.set(key,s);}
    for(const s of dormant.values())shapePath(g,s);g.globalAlpha=1;
    if(off||fullMask)return;
    lg.clearRect(0,0,W,H);
    for(const s of shapes){const a=levelAt(s,time,direction,id);if(a<=0)continue;lg.fillStyle=colors[direction];lg.globalAlpha=Math.round(a*16)/16;shapePath(lg,s);}lg.globalAlpha=1;
    if(glow){g.save();g.globalAlpha=.23;g.filter='blur(2.1px)';g.drawImage(layer,0,0);g.globalAlpha=.08;g.filter='blur(5px)';g.drawImage(layer,0,0);g.restore();}
    g.drawImage(layer,0,0);
  }
  const imageCache={};
  const ready=Promise.all(['plate','glass','background'].map(key=>new Promise(resolve=>{const img=new Image();img.onload=()=>{imageCache[key]=img;resolve();};img.src=ASSETS[key];})));
  function drawShell(canvas){canvas.width=W;canvas.height=H;const g=canvas.getContext('2d');g.clearRect(0,0,W,H);g.drawImage(imageCache.plate,0,0);g.drawImage(imageCache.glass,0,0);}
  function placement(direction){
    return direction===1?{menuY:202,row:30,artX:300,artY:148}:
      direction===2?{menuY:166,row:32,artX:303,artY:159}:{menuY:165,row:32,artX:300,artY:157};
  }
  function draw(canvas,state){
    const {direction=0,profile='filed',selected='continue',mode='final',time=Infinity,desktop=true,confirm=false}=state;
    canvas.width=W;canvas.height=H;const g=canvas.getContext('2d');g.clearRect(0,0,W,H);
    if(imageCache.plate)g.drawImage(imageCache.plate,0,0);
    const p=placement(direction),list=menu(profile,desktop),sh=[];
    if(direction===0){
      sh.push(...glyphs('CHUNK SURFER',54,85,3.2,1));
      sh.push(...glyphs(profiles[profile].active?'A NIGHT IS IN PROGRESS':'START A NIGHT',54,121,1.6,.70,0,25));
    }else if(direction===1){
      sh.push(...glyphs('CHUNK',54,83,4,1),...glyphs('SURFER',54,122,4,1));
    }else{
      sh.push(...glyphs('CHUNK SURFER',301,85,3.6,1));
      sh.push(...glyphs('SELECT',54,115,1.7,.58));
    }
    Array.from({length:8},(_,i)=>list[i]).forEach((id,i)=>{
      const y=p.menuY+i*p.row,on=id===selected;
      const tier=on?1:.66;
      if(direction===0){sh.push(rect(53,y-2,5,17,on?1:0),rect(65,y-5,29,2,on?.8:0),rect(65,y+17,29,2,on?.8:0));}
      if(direction===2){sh.push(rect(54,y-5,11,3,on?1:0),rect(54,y-5,3,9,on?1:0),rect(244,y+15,11,3,on?1:0),rect(252,y+8,3,9,on?1:0));}
      if(direction===1){for(let row=-1;row<8;row++)for(let col=-1;col<13*6;col++)sh.push(rect(68+col*1.8,y+row*1.8,1.8*.72,1.8*.72,0));}
      if(on&&direction===1){
        // Discrete luminous inverse cells; knockout glyphs do not emit.
        const text=label(id),pitch=1.8,x=68;
        const pixels=new Set(glyphs(text,x,y,pitch).filter(r=>r.level).map(r=>`${Math.round((r.x-x)/pitch)},${Math.round((r.y-y)/pitch)}`));
        for(let row=-1;row<8;row++)for(let col=-1;col<text.length*6;col++)if(!pixels.has(`${col},${row}`))sh.push(rect(x+col*pitch,y+row*pitch,pitch*.72,pitch*.72,.95));
      }else sh.push(...glyphs(id?label(id):'',68,y,1.8,tier,0,13));
    });
    const picture=translated(art(direction,selected),p.artX,p.artY);
    phosphor(g,picture,{direction,id:selected,time,mode});
    const title=captions[selected][direction];
    sh.push(...glyphs(title,300,430,1.65,.9,0,31));
    sh.push(...glyphs(selected==='settings'?'A   D   C   X':'',301,136,1.6,.7,0,13));
    let lines=[...help[selected]];
    if(selected==='new-run'&&profiles[profile].active)lines[1]='REPLACES ACTIVE NIGHT. PROFILE KEPT.';
    if(confirm)lines=['START NEW RUN? PRESS ENTER AGAIN','REPLACES ACTIVE NIGHT. PROFILE KEPT.'];
    sh.push(...glyphs(lines[0],54,468,1.65,.92,0,38),...glyphs(lines[1],54,489,1.6,.75,0,38));
    // Text/selection are current on the input frame; only the picture sequences.
    phosphor(g,sh,{direction,id:selected,time:Infinity,mode});
    if(mode==='final'||mode==='unlit')if(imageCache.glass)g.drawImage(imageCache.glass,0,0);
    return {list,placement:p,pictureBounds:{x:p.artX,y:p.artY,w:320,h:256}};
  }
  function proof(canvas,direction,id,time=Infinity){
    canvas.width=340;canvas.height=308;const g=canvas.getContext('2d');g.fillStyle='#0b160f';g.fillRect(0,0,340,308);
    // Render directly with no filter; no cover glass, no halo, no shading.
    phosphor(g,translated(art(direction,id),10,8),{direction,id,time,mode:'raw'});
    phosphor(g,glyphs(captions[id][direction],12,280,1.5,.85),{direction,id,mode:'raw'});
  }
  return {W,H,names,colors,ids,label,profiles,menu,durations,help,art,draw,drawShell,proof,ready,placement};
})();
