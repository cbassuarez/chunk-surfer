import {SOURCE_CONTINUATION as C} from '../data/source-continuation.js';

// Authored technical illustrations of the existing counterweight. These are
// not a live game capture, an extra physical route or a new falling hazard.
const INK='#b7d4d6',BACK='#07141d',DARK='#0b212c';
const R=C.catch.hoist.drumRadius,H=C.catch.hoist.drumHeight;
const freeze=Object.freeze;
const point=(x,y,z)=>freeze({x,y,z});
const iso=(p,width,height)=>{
  const scale=Math.min(width/8.6,height/4.85);
  return freeze({x:width*.51+(p.x-p.z)*scale*.8660254,y:height*.72+(p.x+p.z)*scale*.35-p.y*scale});
};

/** Geometry receipt for tests and inspection; coordinates remain local metres. */
export function weightPassesFrameGeometry(phaseIndex,viewIndex,{width=220,height=124}={}){
  if(!Number.isInteger(phaseIndex)||phaseIndex<0||phaseIndex>4||!Number.isInteger(viewIndex)||viewIndex<0||viewIndex>2)return null;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
  const foot=viewIndex===0&&phaseIndex===0?point(0,0,0)
    :viewIndex===0&&phaseIndex===1?point(1.48,-.40,0)
      :viewIndex===1&&phaseIndex===2?point(.35,.65,0):null;
  const support=viewIndex===0?{minX:-2.6,maxX:1,minZ:-1.35,maxZ:1.35,y:0,thickness:.48}
    :viewIndex===1?{minX:-2.7,maxX:-.65,minZ:-1.35,maxZ:1.35,y:0,thickness:.48}
      :{minX:-2.25,maxX:2.1,minZ:-1.5,maxZ:1.5,y:-.2,thickness:.48};
  const drum=foot?freeze({radius:R,height:H,foot,top:point(foot.x,foot.y+H,foot.z),
    screenFoot:iso(foot,width,height),screenTop:iso(point(foot.x,foot.y+H,foot.z),width,height),
    hoops:freeze([.12,.67,1.26].map(y=>y/1.4*H))}):null;
  return freeze({phaseIndex,viewIndex,width,height,drum,support:freeze(support)});
}

function path(ctx,points,close=true){
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
  if(close)ctx.closePath();
}
function face(ctx,points,fill,stroke=INK,lineWidth=.7){
  path(ctx,points);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
}
function line(ctx,a,b,color=INK,width=.7){
  path(ctx,[a,b],false);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function circlePoints(x,y,z,r,project,n=48){
  return Array.from({length:n},(_,i)=>project({x:x+Math.cos(i/n*Math.PI*2)*r,y,z:z+Math.sin(i/n*Math.PI*2)*r}));
}
function support(ctx,g,project){
  const s=g.support,{minX:a,maxX:b,minZ:c,maxZ:d,y,thickness:t}=s;
  const p=(x,yy,z)=>project({x,y:yy,z});
  // Rear face, two deep edge sections and a broad top surface. The diagonals
  // belong to the physical slab, not a screen overlay or annotation.
  face(ctx,[p(a,y-t,c),p(b,y-t,c),p(b,y,c),p(a,y,c)],'#0a1c28','#385462');
  face(ctx,[p(b,y,c),p(b,y,d),p(b,y-t,d),p(b,y-t,c)],'#102b38','#7cabb6');
  face(ctx,[p(a,y,d),p(b,y,d),p(b,y-t,d),p(a,y-t,d)],'#143341','#9abec6');
  face(ctx,[p(a,y,c),p(b,y,c),p(b,y,d),p(a,y,d)],'#204450','#8fb2bb',.85);
  // Stone/case support courses read at 220 pixels; avoid a fine uniform grid.
  for(let x=a+.42;x<b;x+=.58)line(ctx,p(x,y+.002,c),p(x,y+.002,d),'#416873',.5);
  for(let z=c+.45;z<d;z+=.60)line(ctx,p(a,y+.003,z),p(b,y+.003,z),'#416873',.5);
  // Bracket gussets and their dark cutouts make the support a built object.
  for(const x of[a+.4,b-.28]){
    face(ctx,[p(x,y-t,c+.18),p(x,y-t-1.2,c+.18),p(x,y-t,d-.1)],'#0b2633','#628993',.65);
    line(ctx,p(x,y-t-.18,c+.33),p(x,y-t-.7,c+.33),'#99bcc3',.6);
  }
  // A narrow projecting lip, with its separate underside, makes an unsupported
  // departure legible without an arrow, caption or drawn missing-object box.
  line(ctx,p(b,y+.02,c),p(b,y+.02,d),'#d5e2dc',1.3);
  for(let z=c+.15;z<d;z+=.26)line(ctx,p(b,y-t+.03,z),p(b,y-.06,z+.10),'#496e7a',.45);
}
function cylinder(ctx,foot,radius,height,project,{band=false}={}){
  const segments=48,faces=[];
  for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
    const one={x:foot.x+Math.cos(a)*radius,y:foot.y,z:foot.z+Math.sin(a)*radius};
    const two={x:foot.x+Math.cos(b)*radius,y:foot.y,z:foot.z+Math.sin(b)*radius};
    const light=Math.max(0,Math.cos((a+b)/2+2.3));
    const value=Math.round((band?50:27)+light*(band?66:53));
    faces.push({depth:(one.x+one.z+two.x+two.z)/2,points:[one,two,{...two,y:two.y+height},{...one,y:one.y+height}],
      color:`rgb(${Math.round(value*.70)},${Math.round(value*.98)},${Math.round(value*1.12)})`});
  }
  for(const f of faces.sort((a,b)=>a.depth-b.depth)){
    // A hoop is an annulus around the existing iron body. Drawing a complete
    // filled lid at every band would cut it into a stack of separate discs.
    if(!band||f.depth>=foot.x+foot.z)face(ctx,f.points.map(project),f.color,null);
  }
  const cap=circlePoints(foot.x,foot.y+height,foot.z,radius,project);
  if(!band)face(ctx,cap,'#315d6b','#aac9cd',1.0);
  else{
    const front=Array.from({length:25},(_,i)=>{
      const a=-Math.PI/4+i/24*Math.PI;
      return project({x:foot.x+Math.cos(a)*radius,y:foot.y+height,z:foot.z+Math.sin(a)*radius});
    });
    path(ctx,front,false);ctx.strokeStyle='#c6d6d2';ctx.lineWidth=.85;ctx.stroke();
  }
  // The front half of the bottom rim survives shadow and delineates the bulk.
  const rim=Array.from({length:25},(_,i)=>{
    const a=(-Math.PI/4)+i/24*Math.PI;
    return project({x:foot.x+Math.cos(a)*radius,y:foot.y,z:foot.z+Math.sin(a)*radius});
  });
  path(ctx,rim,false);ctx.strokeStyle=band?'#8eafb9':'#5b8592';ctx.lineWidth=band?.8:.65;ctx.stroke();
}
function drum(ctx,g,project){
  const {foot,radius,height,hoops}=g.drum;
  // Shadow belongs to the mass and disappears with it, not with the receiver.
  const shadow=circlePoints(foot.x,Math.min(0,foot.y)-.005,foot.z,radius*1.25,project);
  face(ctx,shadow,'#08141e',null);
  cylinder(ctx,foot,radius,height,project);
  // Eight restrained vertical iron ribs, each a raised face with a narrow
  // highlight. Front ribs are visible between the three circumferential hoops.
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2;
    if(Math.cos(a)+Math.sin(a)<0)continue;
    const q={x:foot.x+Math.cos(a)*(radius+.005),z:foot.z+Math.sin(a)*(radius+.005)};
    line(ctx,project({...q,y:foot.y+.11}),project({...q,y:foot.y+height-.09}),'#7599a3',1.1);
    line(ctx,project({...q,x:q.x+.025,y:foot.y+.11}),project({...q,x:q.x+.025,y:foot.y+height-.09}),'#102b38',.7);
  }
  for(const y of hoops)cylinder(ctx,{...foot,y:foot.y+y},radius+.018,.075,project,{band:true});
  // Lid seam, recessed central bearing and fasteners give the top a formed
  // surface instead of the flat ellipse of a stock barrel icon.
  const top={...foot,y:foot.y+height+.004};
  const inset=circlePoints(top.x,top.y,top.z,radius*.78,project);
  path(ctx,inset);ctx.strokeStyle='#719ba5';ctx.lineWidth=.65;ctx.stroke();
  face(ctx,circlePoints(top.x,top.y+.005,top.z,radius*.17,project),'#071b27','#c4d9d7',.7);
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2,p=project({x:top.x+Math.cos(a)*radius*.58,y:top.y+.01,z:top.z+Math.sin(a)*radius*.58});
    ctx.beginPath();ctx.arc(p.x,p.y,.75,0,Math.PI*2);ctx.fillStyle='#c2d3ce';ctx.fill();
  }
  const cableTop=project({...top,y:Math.max(4.7,top.y+2.2)}),cableBottom=project(top);
  line(ctx,cableTop,cableBottom,'#acc2c6',.8);
}
function drawWeight(ctx,g){
  const {width:w,height:h}=g,project=p=>iso(p,w,h);
  ctx.fillStyle=BACK;ctx.fillRect(0,0,w,h);
  const shade=ctx.createLinearGradient(0,0,w,h);shade.addColorStop(0,'#153442');shade.addColorStop(1,DARK);
  ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  // Architectural depth behind the near support, in the same projection.
  for(let k=0;k<3;k++){
    const x=-3.7+k*.5;
    line(ctx,project({x,y:-1.3,z:-1.7}),project({x:x+3.2,y:-1.3,z:-1.7}),'#254752',.5);
    line(ctx,project({x,y:-1.3,z:-1.7}),project({x,y:3.7,z:-1.7}),'#254752',.5);
  }
  support(ctx,g,project);
  if(g.drum)drum(ctx,g,project);
  // A quiet enclosing edge belongs to the plate, without labelling the scene.
  ctx.strokeStyle='#365764';ctx.lineWidth=.6;ctx.strokeRect(.5,.5,w-1,h-1);
}
function makeCanvas(documentApi,width,height){
  if(!documentApi?.createElement||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>4096||height>4096)return null;
  const canvas=documentApi.createElement('canvas');if(!canvas)return null;
  canvas.width=Math.round(width);canvas.height=Math.round(height);
  if(typeof canvas.toDataURL!=='function')return null;
  return canvas;
}

/** Five phases at 0/4/5.5/7.3/10s; only the empty receiver is reused. */
export function createWeightPassesFrames({documentApi=globalThis.document,width=220,height=124}={}){
  try{
    let receiver=null;
    const rows=[];
    for(let phase=0;phase<5;phase++){
      const row=[];
      for(let view=0;view<3;view++){
        if(view===2&&receiver){row.push(receiver);continue;}
        const canvas=makeCanvas(documentApi,width,height),ctx=canvas?.getContext?.('2d',{alpha:false});if(!ctx)return null;
        drawWeight(ctx,weightPassesFrameGeometry(phase,view,{width:canvas.width,height:canvas.height}));
        const data=canvas.toDataURL('image/png');if(!String(data).startsWith('data:image/'))return null;
        if(view===2)receiver=data;row.push(data);
      }
      rows.push(freeze(row));
    }
    return freeze(rows);
  }catch{return null;}
}

function cropFrame(source,center,width,height,documentApi){
  const output=makeCanvas(documentApi,width,height),ctx=output?.getContext?.('2d',{alpha:false});if(!ctx)return null;
  const sourceW=Number(source?.width),sourceH=Number(source?.height);
  if(!(sourceW>0&&sourceH>0))return null;
  let sw=sourceW*.5,sh=sw*height/width;
  if(sh>sourceH){sh=sourceH;sw=sh*width/height;}
  const sx=(sourceW-sw)*center,sy=(sourceH-sh)*.5;
  ctx.drawImage(source,sx,sy,sw,sh,0,0,width,height);
  const data=output.toDataURL('image/png');return String(data).startsWith('data:image/')?data:null;
}

/**
 * Coherent, overlapping, aspect-preserving crops of actual presented canvases.
 * A first sample can establish a baseline but cannot invent a contradiction.
 * The caller owns sampling old/new views and registering their opaque tokens.
 */
export function captureRoomMediaFrames(canvas,{previousCanvas=null,documentApi=canvas?.ownerDocument||globalThis.document,width=220,height=124}={}){
  try{
    if(!canvas||!(canvas.width>0&&canvas.height>0))return null;
    const baseline=previousCanvas||canvas;
    if(!(baseline.width>0&&baseline.height>0))return null;
    const snapshotFrames=[0,.5,1].map(center=>cropFrame(baseline,center,width,height,documentApi));
    if(snapshotFrames.some(data=>!data))return null;
    const contradictionFrame=previousCanvas?cropFrame(canvas,.5,width,height,documentApi):null;
    if(previousCanvas&&!contradictionFrame)return null;
    return freeze({snapshotFrames:freeze(snapshotFrames),contradictionFrame});
  }catch{return null;}
}
