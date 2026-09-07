// Authored picture-subtraction rebuses, rendered only into desktop clue windows.
// The letter counts disambiguate each picture without printing its name.
export const PRACTICE_REBUSES = Object.freeze({
  hold: Object.freeze([{ picture:'house', word:'HOUSE', remove:['USE'] }, { picture:'gold', word:'GOLD', remove:['GO'] }]),
  expose: Object.freeze([{ picture:'hexagon', word:'HEXAGON', remove:['H','AGON'] }, { picture:'prose', word:'PROSE', remove:['R'] }]),
  monitor: Object.freeze([{ picture:'moon', word:'MOON', remove:['O'] }, { picture:'editor', word:'EDITOR', remove:['ED'] }]),
  playback: Object.freeze([{ picture:'playing', word:'PLAYING', remove:['ING'] }, { picture:'backbone', word:'BACKBONE', remove:['BONE'] }]),
});

export function drawPracticeRebus(ctx, x, y, w, h, id) {
  if (!ctx) return;
  const [move, side] = String(id || '').split(':');
  const part = PRACTICE_REBUSES[move]?.[side === 'right' ? 1 : 0];
  if (!part) return;
  ctx.save(); ctx.translate(x,y); ctx.scale(w/280,h/280);
  const paper='#dedbc9',ink='#141a19';
  ctx.fillStyle=paper; ctx.fillRect(0,0,280,280);
  ctx.strokeStyle=ink; ctx.fillStyle=ink; ctx.lineWidth=2;
  ctx.strokeRect(9,9,262,262);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const text=(value,px,py,size=16)=>{ctx.font=`bold ${size}px monospace`;ctx.fillText(value,px,py);};
  const path=(points,close=false)=>{ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));if(close)ctx.closePath();ctx.stroke();};
  const circle=(px,py,r)=>{ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.stroke();};
  text(side==='left'?'01 / FIRST PART':'02 / SECOND PART',140,30,13);
  ctx.lineWidth=4;
  if(part.picture==='house'){
    path([[61,112],[140,51],[219,112]]); path([[79,105],[79,174],[201,174],[201,105]]);
    ctx.strokeRect(125,132,29,42);ctx.strokeRect(92,117,21,23);ctx.strokeRect(166,117,21,23);
    path([[181,81],[181,56],[199,56],[199,94]]);
  } else if(part.picture==='gold'){
    // A stamped bullion ingot: the material must be named, then GO removed.
    path([[73,98],[186,98],[212,160],[58,160],[73,98]],true);
    path([[73,98],[94,79],[196,79],[220,135],[212,160]]);path([[186,98],[196,79]]);
    text('Au',132,126,36);text('999.9',143,151,12);
  } else if(part.picture==='hexagon'){
    path(Array.from({length:6},(_,i)=>[140+64*Math.cos(i*Math.PI/3),118+64*Math.sin(i*Math.PI/3)]),true);
  } else if(part.picture==='prose'){
    // The printed word is a proofreading target, not the move name.
    ctx.lineWidth=1;for(let i=0;i<4;i++)path([[61,76+i*28],[219-(i%2)*19,76+i*28]]);
    ctx.fillStyle=paper;ctx.fillRect(65,94,151,47);ctx.fillStyle=ink;text('PROSE',140,120,36);
  } else if(part.picture==='moon'){
    ctx.beginPath();ctx.arc(137,120,60,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=paper;ctx.beginPath();ctx.arc(167,96,52,0,Math.PI*2);ctx.fill();ctx.fillStyle=ink;
    text('*',70,67,24);text('*',214,165,19);text('*',211,75,12);
  } else if(part.picture==='editor'){
    // A marked-up editorial byline supplies the longer word to cut down.
    ctx.lineWidth=1.5;ctx.strokeRect(58,58,164,122);
    for(let i=0;i<3;i++)path([[73,82+i*18],[205-(i%2)*34,82+i*18]]);
    path([[84,79],[96,68],[105,78]]);path([[141,99],[175,95]]);
    text('EDITOR',140,151,29);
  } else if(part.picture==='playing'){
    // Seven blanks constrain the three cards to PLAYING, not CARDS.
    for(let i=0;i<3;i++){
      ctx.save();ctx.translate(102+i*37,119);ctx.rotate((i-1)*.22);
      ctx.fillStyle=paper;ctx.fillRect(-32,-57,65,114);ctx.strokeRect(-32,-57,65,114);
      ctx.fillStyle=ink;text(['J','Q','K'][i],-18,-37,17);
      path([[0,-17],[12,2],[0,21],[-12,2]],true);ctx.fill();ctx.restore();
    }
  } else if(part.picture==='backbone'){
    // The complete vertebral column, with the sacrum anchoring its lower end.
    ctx.lineWidth=3;path([[139,51],[135,73],[144,100],[137,127],[140,157]]);
    for(let i=0;i<6;i++){
      const py=64+i*15,px=140+Math.sin(i*1.1)*5;
      path([[px-11,py-6],[px+11,py-6],[px+15,py+4],[px-14,py+5]],true);
      path([[px-13,py],[px-29,py+5],[px-13,py+4]]);path([[px+13,py],[px+29,py+5],[px+13,py+4]]);
    }
    path([[126,156],[154,156],[140,181]],true);
  }
  ctx.strokeStyle=ink;ctx.lineWidth=1.5;
  const pitch=18,start=140-(part.word.length-1)*pitch/2;
  for(let i=0;i<part.word.length;i++)path([[start+i*pitch-6,207],[start+i*pitch+6,207]]);
  text(`− ${part.remove.join(' − ')}`,140,238,22);
  ctx.restore();
}
