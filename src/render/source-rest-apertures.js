// Two bounded views of supplied canonical geometry. No scene ownership, GPU
// readback, invented notes, extra animation clock or downloaded illustration.
export const SOURCE_REST_APERTURES=Object.freeze({width:240,height:160,trianglesPerView:192,maxTriangles:384,maxGeometry:24,maxCandidateTriangles:2048,maxRasterWork:180000,intervalMs:500});
const finite=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),
  sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  unit=v=>{const n=Math.hypot(...v);return n>1e-8?v.map(x=>x/n):[0,0,1];},
  transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]),light=unit([.42,.74,.52]);
const ids=['rest:source','rest:answer'];
let taskChannel=null;
const waiting=[];
function yieldApertureWork(){
  if(globalThis.scheduler?.yield)return globalThis.scheduler.yield();
  // Native WebKit's nested timers have a 4ms floor. A single CPU-only task
  // channel yields to input/paint without stretching each sample by 100 timers.
  if(globalThis.document&&globalThis.MessageChannel){
    if(!taskChannel){taskChannel=new MessageChannel();taskChannel.port1.onmessage=()=>waiting.shift()?.();}
    return new Promise(resolve=>{waiting.push(resolve);taskChannel.port2.postMessage(0);});
  }
  return new Promise(resolve=>setTimeout(resolve,0));
}
function* selectWork(frame){
  const groups=[];let candidates=0;
  const sources=(frame.geometry||[]).slice(0,SOURCE_REST_APERTURES.maxGeometry),quota=Math.max(1,Math.floor(SOURCE_REST_APERTURES.maxCandidateTriangles/Math.max(1,sources.length)));
  for(const g of sources){
    if(!g?.p?.length||!g?.i?.length||g.matrix?.length!==16||!Array.from(g.matrix).every(Number.isFinite))continue;
    const rows=[],vertices=new Map(),point=index=>{if(vertices.has(index))return vertices.get(index);const at=index*3,m=g.matrix,p=g.p;
      const x=p[at],y=p[at+1],z=p[at+2],v=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];vertices.set(index,v);return v;};
    const count=Math.floor(g.i.length/3),step=Math.max(1,count/quota);
    for(let sample=0;sample<Math.min(count,quota)&&candidates<SOURCE_REST_APERTURES.maxCandidateTriangles;sample++,candidates++){
      const n=Math.floor(sample*step)*3;
      const points=[point(g.i[n]),point(g.i[n+1]),point(g.i[n+2])];
      if(points.some(p=>p.length!==3||!p.every(Number.isFinite)))continue;
      const normal=cross(sub(points[1],points[0]),sub(points[2],points[0])),area=Math.hypot(...normal);if(area<1e-9)continue;
      rows.push({points,normal:unit(normal),area,base:Array.from(g.base||[.50,.44,.32,1]),id:String(g.id||'canonical'),role:g.role||''});
    }
    if(rows.length)groups.push(rows);yield;
  }
  return{triangles:groups.flat(),groups,candidates};
}
function* rasterWork(rows,view,w,h,budget){
  const rgba=new Uint8ClampedArray(w*h*4),depth=new Float32Array(w*h).fill(Infinity);
  for(let p=0;p<rgba.length;p+=4){rgba[p]=7;rgba[p+1]=12;rgba[p+2]=12;rgba[p+3]=255;}
  let work=0,drawn=0;
  const focal=Math.min(w,h)*1.02;
  const visible=[];
  for(let rowIndex=0;rowIndex<rows.length;rowIndex++){
    if(rowIndex%64===0)yield;
    const row=rows[rowIndex];
    const projected=row.points.map(p=>{const x=p[0]-view.eye[0],y=p[1]-view.eye[1],z=p[2]-view.eye[2],f=view.forward,r=view.right,u=view.up,d=x*f[0]+y*f[1]+z*f[2];return{x:w*.5+(x*r[0]+y*r[1]+z*r[2])*focal/d,y:h*.5-(x*u[0]+y*u[1]+z*u[2])*focal/d,z:d};});
    if(projected.some(p=>p.z<=.02||!Number.isFinite(p.x+p.y)))continue;
    const[a,b,c]=projected,area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(Math.abs(area)<.03)continue;
    if(Math.max(a.x,b.x,c.x)<0||Math.min(a.x,b.x,c.x)>=w||Math.max(a.y,b.y,c.y)<0||Math.min(a.y,b.y,c.y)>=h)continue;
    const x0=clamp(Math.floor(Math.min(a.x,b.x,c.x)),0,w-1),x1=clamp(Math.ceil(Math.max(a.x,b.x,c.x)),0,w-1),
      y0=clamp(Math.floor(Math.min(a.y,b.y,c.y)),0,h-1),y1=clamp(Math.ceil(Math.max(a.y,b.y,c.y)),0,h-1),box=(x1-x0+1)*(y1-y0+1);
    if(x1<x0||y1<y0)continue;
    visible.push({row,a,b,c,area,x0,x1,y0,y1,box,priority:Math.abs(area)/(1+Math.min(a.z,b.z,c.z)*.005)});
  }
  visible.sort((a,b)=>b.priority-a.priority);visible.length=Math.min(visible.length,SOURCE_REST_APERTURES.trianglesPerView);
  let sliceWork=0,sliceTriangles=0;
  for(const{row,a,b,c,area,x0,x1,y0,y1,box}of visible){
    if(work+box>budget)continue;work+=box;drawn++;
    const shade=.32+.68*Math.abs(dot(row.normal,light)),colour=row.base.slice(0,3).map(v=>Math.pow(clamp(finite(v)*shade,0,1),1/2.2));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const px=x+.5,py=y+.5,u=((b.x-px)*(c.y-py)-(b.y-py)*(c.x-px))/area,
        v=((c.x-px)*(a.y-py)-(c.y-py)*(a.x-px))/area,t=1-u-v;if(u<0||v<0||t<0)continue;
      const z=1/(u/a.z+v/b.z+t/c.z),at=y*w+x;if(z>=depth[at])continue;depth[at]=z;
      // Material-colour input for the established native pane shader. Do not
      // invent a second palette/dither, which would erase the same materials.
      for(let k=0;k<3;k++)rgba[at*4+k]=Math.round(colour[k]*255);
    }
    sliceWork+=box;sliceTriangles++;if(sliceWork>=4000||sliceTriangles>=16){sliceWork=sliceTriangles=0;yield;}
  }
  return{rgba,work,drawn,selected:visible.length};
}
function nest(target,source,w,h,view){
  // The adjacent opening is inside this one, with a conflicting stable up.
  // It returns to real supplied forms; the recursion adds no world geometry.
  const x0=Math.round(w*(view?.39:.23)),y0=Math.round(h*(view?.30:.35)),nw=Math.round(w*.33),nh=Math.round(h*.39);
  for(let y=-2;y<nh+2;y++)for(let x=-2;x<nw+2;x++){
    const at=((y0+y)*w+x0+x)*4;if(at<0||at+3>=target.length)continue;
    if(x<0||y<0||x>=nw||y>=nh){target.set([90,77,54,255],at);continue;}
    const u=x/nw,v=y/nh,sx=Math.min(w-1,Math.floor((view?1-v:u)*w)),sy=Math.min(h-1,Math.floor((view?u:v)*h)),from=(sy*w+sx)*4;
    target[at]=source[from]*.84;target[at+1]=source[from+1]*.84;target[at+2]=source[from+2]*.84;target[at+3]=255;
  }
}
function* apertureWork(frame,{width=240,height=160}={}){
  if(!['wrong-return','catch'].includes(frame?.phase))return null;
  const selected=yield* selectWork(frame);if(!selected.triangles.length)return null;
  const targets=frame.phase==='catch'?['soundboard','manual-bed','case']:['chamber','core','wing'],
    target=index=>selected.groups.find(g=>g[0].role===targets[index])||selected.groups[index%selected.groups.length],
    bounds=group=>{const points=group.flatMap(t=>t.points),min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));return{centre:min.map((v,k)=>(v+max[k])/2),radius:Math.max(.25,Math.hypot(...sub(max,min))*.5)};},
    actual=Array.from(frame.eye||[0,0,0]),up=unit(Array.from(frame.basis?.up||[0,1,0])),right=unit(Array.from(frame.basis?.right||[1,0,0])),
    view=(group,index)=>{const{centre,radius}=bounds(group),radial=unit(sub(actual,centre)),direction=index?unit(radial.map((v,k)=>v*.32+right[k]*.94)):radial;
      let vertical=index?radial:up;const eye=centre.map((v,k)=>v+direction[k]*radius*1.6),forward=unit(sub(centre,eye));if(Math.abs(dot(forward,vertical))>.95)vertical=Math.abs(forward[1])>.95?[0,0,1]:[0,1,0];const r=unit(cross(forward,vertical));return{eye,forward,right:r,up:unit(cross(r,forward))};},
    views=[view(target(0),0),view(target(1),1)],W=clamp(Math.floor(finite(width,240)),32,240),H=clamp(Math.floor(finite(height,160)),24,160),w=Math.ceil(W/2),h=Math.ceil(H/2),images=[];
  yield;
  for(const view of views){images.push(yield* rasterWork(selected.triangles,view,w,h,SOURCE_REST_APERTURES.maxRasterWork/2));yield;}
  const originals=images.map(i=>i.rgba.slice());
  for(let v=0;v<2;v++){const inner=originals[1-v].slice();nest(inner,originals[v],w,h,1-v);nest(images[v].rgba,inner,w,h,v);}
  const frames=images.map((image,index)=>{
    const rgba=new Uint8ClampedArray(W*H*4),pixels=new Uint32Array(rgba.buffer),small=new Uint32Array(image.rgba.buffer);for(let y=0;y<H;y++)for(let x=0;x<W;x++)pixels[y*W+x]=small[Math.min(h-1,Math.floor(y/2))*w+Math.min(w-1,Math.floor(x/2))];
    return{surfaceId:ids[index],width:W,height:H,rgba};
  });
  return{frames,diagnostics:{sourceIds:[...new Set(selected.triangles.map(t=>t.id))],candidateTriangles:selected.candidates,selectedTriangles:images.reduce((s,v)=>s+v.selected,0),rasterWork:images.reduce((s,v)=>s+v.work,0),drawnTriangles:images.reduce((s,v)=>s+v.drawn,0),recursiveDepth:2,sourceSeconds:finite(frame.mediaTime),newWorldGeometry:false}};
}
/** CPU-only exact evaluator, also used for fixed evidence and geometry tests. */
export function sourceRestAperturePair(frame,options={}){
  const work=apertureWork(frame,options);let step;do{step=work.next();}while(!step.done);return step.value;
}
/** Runtime acquisition yields before selection, each view and encoding. It
 * never rasterises both panes within the game's synchronous update call. */
export async function sourceRestAperturePairAsync(frame,{yieldTask=yieldApertureWork,isCurrent=()=>true,...options}={}){
  const work=apertureWork(frame,options);let step;
  do{await yieldTask();if(!isCurrent())return null;step=work.next();}while(!step.done);return step.value;
}
export function sourceRestOwnedFramesValid(frames,surfaceIds=['rest:source','rest:answer']){
  return Array.isArray(frames)&&frames.length>0&&frames.length<=2&&new Set(frames.map(f=>f.surfaceId)).size===frames.length&&frames.every(frame=>{
    if(!surfaceIds.includes(frame.surfaceId)||typeof frame.dataUrl!=='string'||frame.dataUrl.length>230400||!frame.dataUrl.startsWith('data:image/png;base64,'))return false;
    try{const s=atob(frame.dataUrl.slice(22));if(s.length<33||Array.from(s.slice(0,8),v=>v.charCodeAt(0)).join(',')!=='137,80,78,71,13,10,26,10'||s.slice(12,16)!=='IHDR')return false;const n=at=>((s.charCodeAt(at)*16777216+s.charCodeAt(at+1)*65536+s.charCodeAt(at+2)*256+s.charCodeAt(at+3))>>>0);return n(16)>0&&n(16)<=240&&n(20)>0&&n(20)<=160;}catch{return false;}
  });
}
export function encodeSourceRestAperturePair(pair,{documentApi=globalThis.document}={}){
  if(!pair||!documentApi?.createElement)return null;
  try{return pair.frames.map(frame=>{const canvas=documentApi.createElement('canvas');canvas.width=frame.width;canvas.height=frame.height;const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('No CPU canvas');const image=context.createImageData(frame.width,frame.height);image.data.set(frame.rgba);context.putImageData(image,0,0);return{surfaceId:frame.surfaceId,dataUrl:canvas.toDataURL('image/png')};});}catch{return null;}
}
export async function encodeSourceRestAperturePairAsync(pair,{yieldTask=yieldApertureWork,isCurrent=()=>true,...options}={}){
  if(!pair)return null;const frames=[];
  for(const frame of pair.frames){await yieldTask();if(!isCurrent())return null;const encoded=encodeSourceRestAperturePair({frames:[frame]},options);if(!encoded)return null;frames.push(encoded[0]);}
  return frames;
}
