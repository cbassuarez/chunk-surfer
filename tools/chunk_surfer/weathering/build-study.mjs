// Task-local, deterministic condition maps on the actual modular door geometry.
// Never writes the production pack. All distances and field widths below are metres.
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
const out='artifacts/weathering-study';fs.mkdirSync(out,{recursive:true});
const source='public/assets/conservatory-doors.glb',bytes=fs.readFileSync(source),jl=bytes.readUInt32LE(12);let J=JSON.parse(bytes.subarray(20,20+jl)),B=bytes.subarray(28+jl);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Retain the existing photographed timber structure. These are processed CC0
// material albedos, not documentary condition photographs or height measurements.
const woodPhotos={};
for(const[name,file,tileM,alongX]of[['oak','door_oak_veneer_01_diff.jpg',1.8,false],['dark','door_dark_wood_diff.jpg',2,true]]){
 const path='tools/chunk_surfer/assets/doors/polyhaven/'+file,raw=await sharp(path).removeAlpha().raw().toBuffer({resolveWithObject:true}),linear=new Float32Array(raw.data.length),mean=[0,0,0];
 for(let i=0;i<raw.data.length;i++){const c=raw.data[i]/255;linear[i]=c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);mean[i%3]+=linear[i]/(raw.data.length/3);}
 const levels=[{data:linear,width:raw.info.width,height:raw.info.height}];
 while(levels.at(-1).width>32){const p=levels.at(-1),w=p.width/2,h=p.height/2,d=new Float32Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=0;k<3;k++)d[(y*w+x)*3+k]=[0,1,2,3].reduce((s,q)=>s+p.data[(((y*2+(q>>1))*p.width)+x*2+(q%2))*3+k],0)*.25;levels.push({data:d,width:w,height:h});}
 woodPhotos[name]={path,sha256:sha(fs.readFileSync(path)),tileM,alongX,levels,mean};
}
function woodPhoto(name,across,along,seed,density){const p=woodPhotos[name],u=(p.alongX?along:across)/p.tileM+seed*.137,v=(p.alongX?across:along)/p.tileM+seed*.079,lod=Math.max(0,Math.min(p.levels.length-1,Math.log2(p.levels[0].width/(p.tileM*density)))),lo=Math.floor(lod),hi=Math.min(lo+1,p.levels.length-1),f=lod-lo,sample=level=>{const q=p.levels[level],x=((u%1+1)%1)*q.width-.5,y=((v%1+1)%1)*q.height-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,at=(a,b,k)=>q.data[(((b+q.height)%q.height)*q.width+(a+q.width)%q.width)*3+k];return[0,1,2].map(k=>(at(ix,iy,k)*(1-fx)+at(ix+1,iy,k)*fx)*(1-fy)+(at(ix,iy+1,k)*(1-fx)+at(ix+1,iy+1,k)*fx)*fy);},a=sample(lo),b=sample(hi);return a.map((c,k)=>(c*(1-f)+b[k]*f)/Math.max(.001,p.mean[k]));}
// A documented quiet swatch of the existing processed material retains the
// intact paint's colour, relief directions and roughness together. Its existing
// brown pits/runoff are outside this rectangle; they cannot dictate new damage.
// This is material-asset reuse, not a calibrated scan or measured paint height.
const steelPhoto={rect:[352,45,128,112],tileM:1,files:{},levels:{}};
for(const [kind,suffix]of[['base','diff'],['normal','nor_gl'],['orm','arm']]){
 const path=`tools/chunk_surfer/assets/doors/polyhaven/door_green_metal_rust_${suffix}.jpg`,raw=await sharp(path).removeAlpha().raw().toBuffer({resolveWithObject:true}),d=new Float32Array(raw.data.length);
 for(let i=0;i<d.length;i++){const c=raw.data[i]/255;d[i]=kind==='base'?(c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)):c;}
 const levels=[{data:d,width:raw.info.width,height:raw.info.height}];
 while(levels.at(-1).width>32){const p=levels.at(-1),w=p.width/2,h=p.height/2,a=new Float32Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=0;k<3;k++)a[(y*w+x)*3+k]=[0,1,2,3].reduce((s,q)=>s+p.data[(((y*2+(q>>1))*p.width)+x*2+(q%2))*3+k],0)*.25;levels.push({data:a,width:w,height:h});}
 steelPhoto.files[kind]={path,sha256:sha(fs.readFileSync(path))};steelPhoto.levels[kind]=levels;
}
function intactSteel(f,x,y){
 const p=steelPhoto,[rx,ry,rw,rh]=p.rect,mirror=q=>{const k=Math.floor(q),t=q-k;return{t:k%2===0?t:1-t,sign:k%2===0?1:-1};},mx=mirror(x/(rw/512)+f.seed*.137),my=mirror(y/(rh/512)+f.seed*.079),u=(rx+mx.t*(rw-1)+.5)/512,v=(ry+my.t*(rh-1)+.5)/512,lod=Math.max(0,Math.min(4,Math.log2(512/f.density))),lo=Math.floor(lod),hi=Math.min(lo+1,4),frac=lod-lo;
 const sample=kind=>{const levels=p.levels[kind],atLevel=l=>{const a=levels[l],px=u*a.width-.5,py=v*a.height-.5,ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy,at=(x,y,k)=>a.data[(Math.max(0,Math.min(a.height-1,y))*a.width+Math.max(0,Math.min(a.width-1,x)))*3+k];return[0,1,2].map(k=>(at(ix,iy,k)*(1-fx)+at(ix+1,iy,k)*fx)*(1-fy)+(at(ix,iy+1,k)*(1-fx)+at(ix+1,iy+1,k)*fx)*fy);},a=atLevel(lo),b=atLevel(hi);return a.map((v,k)=>v*(1-frac)+b[k]*frac);};
 const normal=sample('normal').map(v=>v*2-1),uSign=(f.corners[3][0]-f.corners[0][0])/f.wm,vSign=(f.corners[1][1]-f.corners[0][1])/f.hm;
 normal[0]*=mx.sign*uSign;normal[1]*=my.sign*vSign;
 return{color:sample('base'),normal,rough:sample('orm')[1]*.78};
}
function read(ai){const a=J.accessors[ai],v=J.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3}[a.type],start=(v.byteOffset||0)+(a.byteOffset||0),C={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];return Array.from(new C(B.buffer,B.byteOffset+start,a.count*n));}
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smo=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);},mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t),gauss=(x,w)=>Math.exp(-x*x/(w*w));
function noise(x,y,s=0){const ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy,h=(i,j)=>{const v=Math.sin(i*127.1+j*311.7+s*74.7)*43758.5453;return v-Math.floor(v);},u=a*a*(3-2*a),v=b*b*(3-2*b);return(h(ix,iy)*(1-u)+h(ix+1,iy)*u)*(1-v)+(h(ix,iy+1)*(1-u)+h(ix+1,iy+1)*u)*v;}
const specs=[['door_leaf_bay_goods','a'],['door_leaf_bay_goods','b'],['door_leaf_hall','a'],['door_leaf_hall','b'],['door_head_goods','a']];
const faces=[],meshSpecs=[];
function collect(name,variant){const m=J.meshes.find(m=>m.name===name),M={name:`weather_after_${name}_${variant}`,source:name,variant,faces:[],originalTriangles:m.primitives.reduce((s,p)=>s+J.accessors[p.indices].count/3,0)};meshSpecs.push(M);let part=0;
 const add=(corners,vertexNormals,material,bp,face,lo,hi,triangle=false)=>{
  const normal=[0,1,2].map(k=>vertexNormals.reduce((s,n)=>s+n[k],0)/4),nl=Math.hypot(...normal);normal.forEach((v,k)=>normal[k]=v/nl);
  const d=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),wm=d(corners[0],corners[3]),hm=d(corners[0],corners[1]),density=normal[2]>.9?192:96;
  if(!(wm>0&&hm>0))throw Error(`Degenerate source face ${name}/${bp}/${face}`);
  const materialName=material.name==='dark wood'?'dark mahogany oak':material.name==='brass'?'oxidised brass':material.name;
  const F={M,part:bp,face,corners,vertexNormals,triangle,normal,material:materialName,base:material.pbrMetallicRoughness.baseColorFactor||[1,1,1,1],lo,hi,dim:hi.map((v,i)=>v-lo[i]),wm,hm,density,w:Math.max(4,Math.ceil(wm*density)),h:Math.max(4,Math.ceil(hm*density)),seed:(variant==='a'?17:83)+bp*11};faces.push(F);M.faces.push(F);
 };
 for(const p of m.primitives){const P=read(p.attributes.POSITION),N=read(p.attributes.NORMAL),I=read(p.indices),material=J.materials[p.material];
  // The source now includes real hinge cylinders and thin screw-slot faces.
  // Preserve their indexed geometry/normals; never reinterpret them as boxes.
  const boxes=P.length%72===0&&N.every(v=>v===0||v===1||v===-1)&&I.length===P.length/2;
  if(!boxes){for(let at=0;at<I.length;){let ids=I.slice(at,at+3),triangle=true,advance=3;
    if(at+6<=I.length){const both=I.slice(at,at+6),unique=[...new Set(both)];if(unique.length===4){const edges=new Map();for(let t=0;t<6;t+=3)for(let e=0;e<3;e++){const a=both[t+e],b=both[t+(e+1)%3],key=[a,b].sort((a,b)=>a-b).join(':');if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}const boundary=[...edges.values()],loop=[both[0]];for(let k=0;k<3;k++){const e=boundary.find(e=>e[0]===loop.at(-1));if(e)loop.push(e[1]);}if(loop.length===4&&new Set(loop).size===4){const shared=both.slice(0,3).filter(i=>both.slice(3).includes(i)),start=loop.indexOf(shared[0]);if(loop[(start+2)%4]!==shared[1])throw Error('Source quad diagonal mismatch');ids=loop.slice(start).concat(loop.slice(0,start));triangle=false;advance=6;}}}
    const positions=ids.map(i=>P.slice(i*3,i*3+3)),normals=ids.map(i=>N.slice(i*3,i*3+3)),lo=[0,1,2].map(k=>Math.min(...positions.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...positions.map(p=>p[k])));
    if(triangle){const [a,b,c]=positions;positions.splice(2,0,a.map((v,k)=>b[k]+c[k]-v));normals.splice(2,0,normals[2]);}
    add(positions,normals,material,part++,0,lo,hi,triangle);at+=advance;
   }continue;}
  for(let at=0;at<P.length;at+=72){const bp=part++,q=P.slice(at,at+72),lo=[0,1,2].map(k=>Math.min(...q.filter((_,i)=>i%3===k))),hi=[0,1,2].map(k=>Math.max(...q.filter((_,i)=>i%3===k))),dim=hi.map((v,i)=>v-lo[i]);
   for(let f=0;f<6;f++)add(Array.from({length:4},(_,i)=>P.slice(at+f*12+i*3,at+f*12+i*3+3)),Array.from({length:4},(_,i)=>N.slice(at+f*12+i*3,at+f*12+i*3+3)),material,bp,f,lo,hi);
  }
 }
}
specs.forEach(([name,variant])=>collect(name,variant));
const propsBytes=fs.readFileSync('public/assets/conservatory-props.glb'),propsJl=propsBytes.readUInt32LE(12);J=JSON.parse(propsBytes.subarray(20,20+propsJl));B=propsBytes.subarray(28+propsJl);collect('hall_entrance_sign','a');
// Reuse quiet finish swatches on sub-90mm hardware instead of spending one
// padded island per hinge facet/screw slot. Keep exposed/handled/low/ledge
// classes distinct. Geometry and its original smooth normals remain unique.
const smallSwatches=new Map();
for(const f of faces)if(Math.max(f.wm,f.hm)<.09&&['blackened iron','worn kick plate','oxidised brass','rubber seals'].includes(f.material)){
 const q=field(f,.5,.5),key=[f.material,Math.round((f.wm+1e-7)*1000),Math.round((f.hm+1e-7)*1000),f.density,f.w,f.h,q.contact>.15?'handled':'quiet',f.hi[1]<.4?'low':'high',f.normal[1]>.5?'up':f.normal[1]<-.5?'down':'side'].join('|');
 f.sharedRole=key;if(smallSwatches.has(key))f.mapOwner=smallSwatches.get(key);else smallSwatches.set(key,f);
}
// MaxRects packing retains physical density instead of dropping detail to meet residency.
const W=2048,G=8;
function pack(height){let free=[{x:0,y:0,w:W,h:height}];for(const f of faces.filter(f=>!f.mapOwner).sort((a,b)=>Math.max(b.h,b.w)-Math.max(a.h,a.w))){const fw=f.w+G*2,fh=f.h+G*2;let best=null;for(const r of free)if(fw<=r.w&&fh<=r.h){const score=Math.min(r.w-fw,r.h-fh)*100000+Math.max(r.w-fw,r.h-fh);if(!best||score<best.score)best={...r,w:fw,h:fh,score};}if(!best)return false;f.x=best.x+G;f.y=best.y+G;const next=[];for(const r of free){if(best.x>=r.x+r.w||best.x+fw<=r.x||best.y>=r.y+r.h||best.y+fh<=r.y){next.push(r);continue;}if(best.x>r.x)next.push({...r,w:best.x-r.x});if(best.x+fw<r.x+r.w)next.push({...r,x:best.x+fw,w:r.x+r.w-best.x-fw});if(best.y>r.y)next.push({...r,h:best.y-r.y});if(best.y+fh<r.y+r.h)next.push({...r,y:best.y+fh,h:r.y+r.h-best.y-fh});}free=next.filter((r,i)=>!next.some((q,j)=>i!==j&&q.x<=r.x&&q.y<=r.y&&q.x+q.w>=r.x+r.w&&q.y+q.h>=r.y+r.h&&(j<i||q.x!==r.x||q.y!==r.y||q.w!==r.w||q.h!==r.h)));}return true;}
const H=pack(1024)?1024:pack(2048)?2048:0;if(!H)throw Error('Study atlas budget overflow');for(const f of faces)if(f.mapOwner){f.x=f.mapOwner.x;f.y=f.mapOwner.y;}const used=Math.max(...faces.map(f=>f.y+f.h+G));
function point(f,u,v){return[0,1,2].map(k=>f.corners[0][k]*(1-u)*(1-v)+f.corners[3][k]*u*(1-v)+f.corners[1][k]*(1-u)*v+f.corners[2][k]*u*v);}
const witnesses=[];
function field(f,u,v,detail=true){const [x,y,z]=point(f,u,v),mat=f.material,seed=f.seed,edge=Math.min(u*f.wm,(1-u)*f.wm,v*f.hm,(1-v)*f.hm),n=noise(x*93,y*93,seed),fine=noise(x*260,y*260,seed+1),macro=noise(x*8,y*8,seed+3),exterior=f.normal[2]>.5?1:.28;
 let color=[.2,.2,.18],rough=.8,metal=0,height=0,ao=1,loss=0,deposit=0,contact=0,oxide=0,microNormal=null;
 if(mat==='grey green fire steel'){
  // Oil/alkyd-like paint over galvanised sheet is provisional; the galvanising itself is code-established.
  const lower=(1-smo(.025,.16,y))*exterior,cut=(1-smo(.001,.009,edge))*smo(.52,.77,macro)*exterior,scuff=gauss(y-(.39+.012*(x-.5)),.003)*(1-smo(.08,.28,Math.abs(x-(f.M.variant==='a'?.42:.98))))*exterior;
  loss=smo(.36,.65,cut*(.52+.48*macro)+lower*(.28+.52*macro)+scuff*.8);
  const primer=smo(.22,.49,cut+lower*.47+scuff*.62)*(1-loss),zincProduct=loss*smo(.3,.7,macro),breach=loss*(1-smo(.001,.004,edge))*smo(.60,.85,n)*lower;
  oxide=breach;
  deposit=(1-smo(.008,.09,y))*.3+gauss(x-.024,.012)*(1-smo(.08,.7,y))*.12;
  const stock=detail?intactSteel(f,x,y):{color:[0,0,0],rough:.6,normal:[0,0,1]};color=stock.color;color=mix(color,[.20,.215,.20],primer*.75);color=mix(color,[.33,.35,.33],loss);color=mix(color,[.39,.40,.36],zincProduct*.5);color=mix(color,[.16,.051,.018],oxide);color=mix(color,[.024,.022,.015],deposit);
  rough=stock.rough+primer*.1+zincProduct*.16+oxide*.2;metal=loss*(1-zincProduct)*.88*(1-oxide);height=-loss*.00012+oxide*.00022;
  const intact=(1-loss)*(1-primer)*(1-deposit);microNormal=[stock.normal[0]*intact,stock.normal[1]*intact,stock.normal[2]];
 }else if(f.M.source==='hall_entrance_sign'&&f.part===1){
  // Existing sign spec: dark enamel. The separate approved gilt overlay is never touched.
  deposit=(1-smo(.001,.008,edge))*.18;color=mix([.009,.011,.010],[.018,.017,.014],deposit);rough=.36+macro*.025+deposit*.25;metal=0;height=(fine-.5)*.00001;
 }else if(mat==='warm oak veneer'||mat==='dark mahogany oak'){
  // Member dimensions select end/long grain; rails run horizontally, stiles vertically.
  const rail=f.dim[0]>f.dim[1]*2,across=rail?y:x,along=rail?x:y,dark=mat.startsWith('dark'),photo=detail?woodPhoto(dark?'dark':'oak',across,along,seed,f.density):[1,1,1];
  color=(dark?[.077,.029,.010]:[.155,.076,.025]).map((c,k)=>c*clamp(Math.pow(photo[k],.55),.50,1.7));
  const hand=gauss(x-.91,.075)*gauss(y-1.08,.11),push=gauss(y-1.12,.035)*gauss(x-.72,.24),edgeUse=(1-smo(.001,.007,edge))*gauss(x-.98,.05)*gauss(y-1.1,.3);
  contact=clamp(hand*.75+push*.24+edgeUse*.5);loss=smo(.4,.83,contact*(.65+.35*macro));color=mix(color,[.22,.12,.043],loss*.6);rough=.42+macro*.07-contact*.1+loss*.24;deposit=(1-smo(.002,.014,edge))*.06;rough+=deposit;metal=0;height=(fine-.5)*.000025-loss*.00006;
 }else if(mat==='masonry infill'){
  // Exact binder/stone is unknown. Restrained mineral infill: no invented downpipe, damp fan or salt outbreak.
  const underside=f.normal[1]<-.5?1:0,top=f.normal[1]>.5?1:0;
  deposit=top*.22+underside*.08+(1-smo(.003,.019,edge))*.09;loss=0;
  color=[.29,.283,.256].map(c=>c*(.94+.09*macro+.035*(fine-.5)));color=mix(color,[.13,.12,.10],deposit);rough=.88+fine*.08;metal=0;height=(fine-.5)*.00018;
 }else if(mat==='worn kick plate'){
  const scratch=Math.pow(Math.max(0,Math.sin(y*2700+noise(x*2,y*160,seed)*4)),16);contact=gauss(y-.28,.12)*(.35+macro*.6);deposit=(1-smo(.002,.014,edge))*.35;color=mix([.27,.29,.28],[.07,.065,.05],deposit);rough=.58-contact*.16+scratch*.07;metal=.92*(1-deposit);height=-scratch*.000035;
 }else if(mat==='oxidised brass'){
  // Only the actual door pull/push bar gets hand polish. The high sign frame
  // is not at hand height; its upper ledge collects a little deposit instead.
  contact=f.M.source==='door_leaf_hall'?clamp(gauss(x-.90,.09)*gauss(y-1.08,.09)+.4*gauss(x-.70,.22)*gauss(y-1.12,.035)):0;
  deposit=clamp((1-smo(.001,.008,edge))*.7+(f.M.source==='hall_entrance_sign'&&f.normal[1]>.5?.12:0))*(1-contact*.72);color=mix([.45,.29,.085],[.075,.055,.026],deposit);rough=.30+deposit*.4-contact*.09;metal=.93*(1-deposit*.8);height=(fine-.5)*.000012;
 }else if(mat==='blackened iron'){
  contact=f.M.source==='door_leaf_bay_goods'?gauss(x-1.34,.09)*gauss(y-1.44,.15):0;loss=clamp((1-smo(.001,.006,edge))*smo(.46,.7,macro)*.6+contact*.3);oxide=loss*(1-smo(.05,.4,y))*.35;color=mix([.027,.029,.025],[.20,.065,.025],oxide);color=mix(color,[.17,.18,.16],loss*(1-oxide));rough=.64+macro*.08+oxide*.18-contact*.18;metal=clamp(loss*.8+contact*.35);height=oxide*.0001;
 }else if(mat==='rubber seals'){color=[.012,.014,.012];rough=.86;height=(fine-.5)*.00002;}
 else{color=f.base.slice(0,3);rough=.8;}
 return {color,rough:clamp(rough,.08,1),metal:clamp(metal),height,ao:clamp(ao),loss,deposit,contact,oxide,microNormal};
}
const maps=Object.fromEntries(['base','normal','orm','condition'].map(k=>[k,Buffer.alloc(W*H*4)]));
const srgb=v=>Math.round(clamp(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055)*255);
for(const f of faces){const epsU=1/f.w,epsV=1/f.h;
 if(!f.mapOwner)for(let yy=-G;yy<f.h+G;yy++)for(let xx=-G;xx<f.w+G;xx++){const u=(clamp(xx,0,f.w-1)+.5)/f.w,v=(clamp(yy,0,f.h-1)+.5)/f.h,q=field(f,f.sharedRole ? .5 : u,f.sharedRole ? .5 : v),dx=(field(f,clamp(u+epsU),v,false).height-field(f,clamp(u-epsU),v,false).height)/(2*f.wm*epsU),dy=(field(f,u,clamp(v+epsV),false).height-field(f,u,clamp(v-epsV),false).height)/(2*f.hm*epsV),len=Math.hypot(dx,dy,1),at=((f.y+yy)*W+f.x+xx)*4;
  const mn=q.microNormal||[0,0,1],nx=f.sharedRole?0:-dx+mn[0]/Math.max(.2,mn[2]),ny=f.sharedRole?0:-dy+mn[1]/Math.max(.2,mn[2]),nl=Math.hypot(nx,ny,1);
  maps.base.set([...q.color.map(srgb),255],at);maps.normal.set([Math.round(127.5+nx/nl*127.5),Math.round(127.5+ny/nl*127.5),Math.round(127.5+127.5/nl),255],at);maps.orm.set([Math.round(q.ao*255),Math.round(q.rough*255),Math.round(q.metal*255),255],at);maps.condition.set([Math.round(q.loss*255),Math.round(q.deposit*255),Math.round(q.contact*255),255],at);
 }
 const q=field(f.mapOwner||f,.5,.5);witnesses.push({mesh:f.M.name,part:f.part,face:f.face,material:f.material,widthM:f.wm,heightM:f.hm,density:f.density,rect:[f.x,f.y,f.w,f.h],sharedRole:f.sharedRole||null,sharedSwatch:!!f.mapOwner,centre:q});
}
for(const[k,data]of Object.entries(maps))await sharp(data,{raw:{width:W,height:H,channels:4}}).png().toFile(`${out}/${k}.png`);
// Assemble isolated candidate assets with glTF-standard channels, factors exactly1.
const chunks=[],views=[],acc=[],materials=[],meshes=[],nodes=[];let offset=0;
function buf(b,target){const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const i=views.length;views.push({buffer:0,byteOffset:offset,byteLength:b.length,...(target?{target}:{})});chunks.push(b);offset+=b.length;return i;}
function attr(a,type){const ar=type==='SCALAR'?new Uint32Array(a):new Float32Array(a),count=a.length/({SCALAR:1,VEC2:2,VEC3:3}[type]),v={bufferView:buf(Buffer.from(ar.buffer),type==='SCALAR'?34963:34962),componentType:type==='SCALAR'?5125:5126,count,type};if(type==='VEC3'){v.min=[0,1,2].map(k=>Math.min(...a.filter((_,i)=>i%3===k)));v.max=[0,1,2].map(k=>Math.max(...a.filter((_,i)=>i%3===k)));}acc.push(v);return acc.length-1;}
const images=[];for(const k of ['base','normal','orm'])images.push({bufferView:buf(fs.readFileSync(`${out}/${k}.png`)),mimeType:'image/png',name:`weathering-study-${k}`});
materials.push({name:'Causal weathering study / physical layers',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:0},metallicRoughnessTexture:{index:2},metallicFactor:1,roughnessFactor:1},normalTexture:{index:1,scale:1},occlusionTexture:{index:2,strength:1},extras:{weatheringStudy:true}});
let triangles=0;const geometry=[];
for(const M of meshSpecs){const P=[],N=[],UV=[],I=[];
 for(const f of M.faces){const dent=M.source==='door_leaf_bay_goods'&&f.part===0&&f.normal[2]>.9,nx=dent?12:1,ny=dent?24:1,base=P.length/3;
  if(f.triangle){for(const index of[0,1,3]){P.push(...f.corners[index]);N.push(...f.vertexNormals[index]);UV.push((f.x+(index===3?f.w:0))/W,(f.y+(index===1?f.h:0))/H);}I.push(base,base+1,base+2);continue;}
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny,p=point(f,u,v),vn=f.vertexNormals;let normal=[0,1,2].map(k=>vn[0][k]*(1-u)*(1-v)+vn[3][k]*u*(1-v)+vn[1][k]*(1-u)*v+vn[2][k]*u*v);const nl=Math.hypot(...normal);normal=normal.map(v=>v/nl);if(dent){const s=Math.sign(f.normal[2]),dx=p[0]-(M.variant==='a'?.39:1.05),dy=p[1]-.43,g=gauss(dx,.17)*gauss(dy,.12);p[2]-=s*.002*g;const n=[-.004*dx/(.17*.17)*g,-.004*dy/(.12*.12)*g,s],len=Math.hypot(...n);normal=n.map(v=>v/len);}P.push(...p);N.push(...normal);UV.push((f.x+u*f.w)/W,(f.y+v*f.h)/H);}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=base+j*(nx+1)+i,b=a+nx+1;I.push(a,b,b+1,a,b+1,a+1);}
 }
 // Infill composition/history is unresolved: retain its original silhouette.
 const primitive={attributes:{POSITION:attr(P,'VEC3'),NORMAL:attr(N,'VEC3'),TEXCOORD_0:attr(UV,'VEC2')},indices:attr(I,'SCALAR'),material:0};triangles+=I.length/3;geometry.push({mesh:M.name,source:M.source,triangles:I.length/3,originalTriangles:M.originalTriangles,dentDepthM:M.source==='door_leaf_bay_goods'?.002:0});nodes.push({name:M.name,mesh:meshes.length});meshes.push({name:M.name,primitives:[primitive]});
}
const json={asset:{version:'2.0',generator:'Chunk Surfer causal weathering study'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,images,textures:images.map((_,source)=>({source,sampler:0})),samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],accessors:acc,bufferViews:views,buffers:[{byteLength:offset}]};
const pad=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4,32)]),jb=pad(Buffer.from(JSON.stringify(json))),bin=Buffer.concat(chunks),bb=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]),header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jb.length+bb.length,8);header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(bb.length);bh.writeUInt32LE(0x004e4942,4);const glb=Buffer.concat([header,jb,bh,bb]);fs.writeFileSync(`${out}/candidate.glb`,glb);
const report={generatedAt:new Date().toISOString(),source,sourceSha256:sha(bytes),additionalSourcePacks:{'public/assets/conservatory-props.glb':sha(propsBytes)},sourceMaterialAlbedos:Object.fromEntries(Object.entries(woodPhotos).map(([k,p])=>[k,{path:p.path,sha256:p.sha256,tileMetres:p.tileM,sourceGrainAxis:p.alongX?'horizontal':'vertical',sampling:'linear-light mip pyramid, bilinear/trilinear prefilter at physical face texel density',license:'CC0 / original door-pack Poly Haven credits'}])),intactSteelSwatch:{...steelPhoto,levels:undefined,sampling:'physically scaled 1m source; documented intact rectangle; mirrored repeat; linear-light/trilinear prefilter; normal directions retained, not invented measured heights'},candidateSha256:sha(glb),builderSha256:sha(fs.readFileSync(import.meta.filename)),atlas:{width:W,height:H,usedHeight:used,gutterPx:G,rgba8ResidentBytesIncludingMips:W*H*4*3*4/3,compressedFileBytes:glb.length,notes:'3RGBA8uncompressedmaps,mipestimate4/3;conditiondiagnosticnotresidentingame;192texels/mprimaryfaces96edges'},geometry,triangles,faces:witnesses,limits:['No claim of exact historic paint binder or mineral substrate','AO neutral: actual geometry occlusion retained; no invented dirt shadow','Candidate does not change global no-ORM squaring defect','Microheight normal cannot change silhouette;2mm steel dent is geometry; mineral silhouette retained','Diagnostic channel pack uses same masks; not an additional gameplay shader','Map byte accounting is not a driver physical-residency counter']};fs.writeFileSync(`${out}/candidate.json`,JSON.stringify(report,null,2)+'\n');fs.copyFileSync(import.meta.filename,`${out}/candidate-builder.mjs`);console.log(JSON.stringify({atlas:report.atlas,triangles,bytes:glb.length,sourceSha256:report.sourceSha256}));
