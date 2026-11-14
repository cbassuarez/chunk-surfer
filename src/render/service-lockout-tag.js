import { rand } from './paper.js';

const W = 154;
const H = 74;
const edge = [
  [9,3], [132,2], [147,5], [145,15], [151,21], [148,30], [150,33],
  [145,38], [149,39], [146,44], [149,49], [143,51], [145,55],
  [140,58], [142,62], [134,68], [118,69], [116,71], [100,70],
  [82,72], [68,70], [41,72], [17,70], [10,66], [2,53], [3,17],
];
const lettering = {
  D: [[.4,14],[.7,1.3],[3.7,1],[7.1,2.9],[8,6.7],[7.4,11.1],[4,13.8],[.4,14]],
  O: [[6.6,1.4],[3.7,.9],[1.1,3],[.4,7.4],[1.5,12.5],[4.1,14],[7,12.7],[8.1,8.4],[7.6,3.4],[6.6,1.4]],
  N: [[.6,14.1],[1,1.2],[7.9,13.8],[8.4,.8]],
  T: [[.2,2],[9.1,1.2],null,[4.7,1.9],[4.3,14]],
  L: [[1.2,.8],[.7,13.8],[8.2,13.4]],
  I: [[.5,1.4],[5.1,1.1],null,[2.9,1.5],[2.5,13.7],null,[.3,13.9],[5,13.6]],
  K: [[1.4,.8],[.8,14],null,[8.5,.8],[1.2,8],[8.6,13.7]],
};
let image;

function outline(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.closePath();
}

function stroke(ctx, points, color, width) {
  ctx.beginPath();
  let start = true;
  for (const point of points) {
    if (!point) { start = true; continue; }
    const [x,y] = point;
    if (start) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    start = false;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function marker(ctx) {
  ctx.save();
  ctx.translate(34,30);
  ctx.scale(1.02,1.14);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let x = 0;
  for (const [index, letter] of [...'DO NOT LINK'].entries()) {
    if (letter === ' ') { x += 4.5; continue; }
    ctx.save();
    ctx.translate(x,[0,.3,-.3,.7][index % 4]);
    ctx.rotate([-.046,.023,-.017,.036][index % 4]);
    stroke(ctx,lettering[letter],'rgba(80,28,21,.37)',2.8);
    stroke(ctx,lettering[letter],index % 3 ? '#4a211b' : '#391e18',1.75);
    ctx.restore();
    x += letter === 'I' ? 6.8 : 10.2;
  }
  ctx.restore();
}

function drawPaper(ctx) {
  const next = rand(192083);
  ctx.save();
  ctx.translate(1.6,3);
  outline(ctx,edge);
  ctx.fillStyle = 'rgba(6,8,5,.73)';
  ctx.fill();
  ctx.restore();

  outline(ctx,edge);
  const stock = ctx.createLinearGradient(15,0,140,78);
  stock.addColorStop(0,'#a99068');
  stock.addColorStop(.24,'#d9c8a4');
  stock.addColorStop(.59,'#e6d8b9');
  stock.addColorStop(.85,'#c6ae85');
  stock.addColorStop(1,'#977858');
  ctx.fillStyle = stock;
  ctx.fill();

  ctx.save();
  ctx.clip();
  const thumb = ctx.createRadialGradient(127,62,1,124,61,27);
  thumb.addColorStop(0,'rgba(82,51,27,.47)');
  thumb.addColorStop(1,'rgba(82,51,27,0)');
  ctx.fillStyle = thumb;
  ctx.fillRect(92,32,60,43);
  const fold = [[108,1],[104,16],[107,31],[104,51],[108,73]];
  stroke(ctx,fold.map(([x,y])=>[x-1,y]),'rgba(252,240,204,.59)',1.55);
  stroke(ctx,fold,'rgba(98,71,44,.32)',.7);
  stroke(ctx,[[144,37],[139,48],[130,57],[134,68]],'rgba(96,67,41,.45)',.9);
  outline(ctx,[[148,48],[141,57],[133,67],[135,60],[140,53]]);
  ctx.fillStyle = '#e9dab7';
  ctx.fill();

  ctx.save();
  ctx.translate(35,12);
  ctx.rotate(-.034);
  ctx.fillStyle = '#8d3127';
  ctx.fillRect(0,0,44,12);
  ctx.font = 'bold 9px sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e8cfaa';
  ctx.fillText('DANGER',3,9,38);
  ctx.restore();

  marker(ctx);
  ctx.font = '7.8px monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#4b3929';
  ctx.fillText('CONTACTS A–B',35,60);
  stroke(ctx,[[34,62],[65,61.5],[100,62.8]],'rgba(91,62,39,.49)',.65);

  // Short fibres interrupt the stamp and marker, with abrasion concentrated
  // across the fold and the edge that gets handled.
  for (let i=0;i<1250;i++) {
    const x=next()*W, y=next()*H;
    const pale=next()>.43;
    ctx.fillStyle=pale?'rgba(239,220,179,.19)':'rgba(79,59,35,.13)';
    ctx.fillRect(x,y,.35+next()*1.45,.22+next()*.48);
  }
  for (let i=0;i<43;i++) {
    const x=101+next()*8, y=4+next()*65;
    ctx.fillStyle='rgba(231,212,175,.42)';
    ctx.fillRect(x,y,.3+next()*1.4,.26+next()*.65);
  }
  stroke(ctx,edge.slice(4,16),'#e6cda3',.85);
  for (let i=0;i<23;i++) {
    const [x,y]=edge[5+Math.floor(next()*10)];
    const fy=y+(next()-.5)*2.5;
    stroke(ctx,[[x-2,fy],[x+next()*2.2,fy+(next()-.5)*1.6]],'#d2b790',.38+next()*.35);
  }
  ctx.restore();

  const eye = ctx.createLinearGradient(11,25,26,43);
  eye.addColorStop(0,'#ead3a1');
  eye.addColorStop(.42,'#897348');
  eye.addColorStop(.72,'#58452b');
  eye.addColorStop(1,'#b6a276');
  for (const [r,color] of [[8.6,'rgba(65,45,23,.34)'],[7,eye],[4.15,'#292318'],[3.05,'#171713']]) {
    ctx.beginPath();
    ctx.ellipse(19,34,r,r*.88,-.22,0,Math.PI*2);
    ctx.fillStyle=color;
    ctx.fill();
  }
}

export function drawServiceLockoutTag(ctx, {x,y,w,h}, {tied=false}={}) {
  if (!(w>0 && h>0)) return;
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(w/W,h/H);

  if (!image && typeof document !== 'undefined') {
    image=document.createElement('canvas');
    image.width=W*3;
    image.height=(H+5)*3;
    const cached=image.getContext('2d');
    cached.scale(3,3);
    drawPaper(cached);
  }
  if (image) ctx.drawImage(image,0,0,W,H+5);
  else drawPaper(ctx);

  if (tied) {
    // The folded tag is tethered to a screw beside the panel, with the tail
    // going through the eyelet. The reading view shows the same loose tail.
    const cord=[[-6,23],[-1,23],[6,25],[12,29],[18,35],[21,34],[18,29],[12,25],[5,21],[0,20],[-6,21]];
    ctx.lineCap='round';
    ctx.lineJoin='round';
    stroke(ctx,cord.map(([cx,cy])=>[cx+.75,cy+1.35]),'rgba(11,10,6,.69)',2.8);
    stroke(ctx,cord,'#695c42',2);
    stroke(ctx,cord.map(([cx,cy])=>[cx,cy-.36]),'#b9a884',.67);
    ctx.beginPath();
    ctx.arc(-6,22,2.35,0,Math.PI*2);
    ctx.fillStyle='#ac9c78';
    ctx.fill();
    stroke(ctx,[[-7.35,22.9],[-4.6,21.25]],'#5f5544',.72);
  } else {
    stroke(ctx,[[19,34],[17,29],[13,26],[10,26]],'#746249',1.8);
  }
  ctx.restore();
}
