// Subtle tint-preserving woven cloth for the vigil's production materials.
// Each seamless 256px tile describes about 8cm of fabric. Albedo is sRGB;
// tangent normal and packed R=AO/G=roughness/B=metallic are linear data.
import zlib from 'node:zlib';
const SIZE=256,TAU=Math.PI*2,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const FABRICS=Object.freeze({
 wax:{seed:.17,threads:96,weave:'twill',contrast:.030,dampDarken:.020,dry:.84,wet:.14,ao:.018,gradient:.92,normalScale:.22,fuzz:.006},
 quilt:{seed:.43,threads:80,weave:'plain',contrast:.026,dampDarken:.013,dry:.88,wet:.11,ao:.014,gradient:.78,normalScale:.20,fuzz:.004},
 wool:{seed:.71,threads:48,weave:'twill',contrast:.033,dampDarken:.012,dry:.97,wet:.055,ao:.021,gradient:.70,normalScale:.16,fuzz:.018},
 canvas:{seed:.91,threads:64,weave:'plain',contrast:.040,dampDarken:.021,dry:.95,wet:.105,ao:.022,gradient:1.08,normalScale:.26,fuzz:.008},
});
const cache=new Map(),crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),data.length+8);return out;}
function png(rgb){const header=Buffer.alloc(13);header.writeUInt32BE(SIZE,0);header.writeUInt32BE(SIZE,4);header[8]=8;header[9]=2;const raw=Buffer.alloc(SIZE*(SIZE*3+1));for(let y=0;y<SIZE;y++)rgb.copy(raw,y*(SIZE*3+1)+1,y*SIZE*3,(y+1)*SIZE*3);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
function woven(u,v,p){
 // Slight periodic yarn wander avoids a computer-perfect grid. The raised
 // warp/weft alternate at crossings; this is thread structure, not grunge.
 const x=(u+.0007*Math.sin(TAU*(v*2+p.seed)))*p.threads,y=(v+.0006*Math.sin(TAU*(u*3-p.seed)))*p.threads,rx=Math.sin(Math.PI*x)**2,ry=Math.sin(Math.PI*y)**2,i=Math.floor(x),j=Math.floor(y);
 let hx,hy;
 if(p.weave==='plain'){hx=rx*(.50+.17*Math.sin(Math.PI*y)*(i%2? -1:1));hy=ry*(.50-.17*Math.sin(Math.PI*x)*(j%2? -1:1));}
 else{hx=rx*(.50+.15*Math.cos(TAU*(y-i-.5)/3));hy=ry*(.50-.15*Math.cos(TAU*(x-j-.5)/3));}
 const fibers=p.fuzz*(Math.sin(TAU*(u*113+v*7+p.seed))*.6+Math.sin(TAU*(u*11-v*109-p.seed))*.4);
 return Math.max(hx,hy)+fibers;
}
function wetness(u,v,p){const f=.38*Math.sin(TAU*(u+p.seed))+.29*Math.cos(TAU*(v-p.seed))+.21*Math.sin(TAU*(2*u-v+p.seed))+.12*Math.cos(TAU*(3*u+2*v-p.seed));return clamp(.5+f*.5);}
function make(kind){const p=FABRICS[kind],height=new Float64Array(SIZE*SIZE),wet=new Float64Array(SIZE*SIZE),albedo=Buffer.alloc(SIZE*SIZE*3),normal=Buffer.alloc(albedo.length),orm=Buffer.alloc(albedo.length);
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  let h=0,w=0;for(const dy of[-.25,.25])for(const dx of[-.25,.25]){const u=(x+.5+dx)/SIZE,v=(y+.5+dy)/SIZE;h+=woven(u,v,p)/4;w+=wetness(u,v,p)/4;}const at=y*SIZE+x;height[at]=h;wet[at]=w;
  const brightness=clamp(.978-w*p.dampDarken+(h-.40)*p.contrast,.90,1),a=Math.round(brightness*255),roughness=clamp(p.dry-w*p.wet+(.40-h)*.018,.55,.99),ao=clamp(1-p.ao*(1-clamp(h/.68)),.97,1);
  albedo.fill(a,at*3,at*3+3);orm[at*3]=Math.round(ao*255);orm[at*3+1]=Math.round(roughness*255);orm[at*3+2]=0;
 }
 const at=(x,y)=>height[((y+SIZE)%SIZE)*SIZE+(x+SIZE)%SIZE];
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  // PNG row order runs downward; positive green is tangent-space +V (up).
  const nx=(at(x-1,y)-at(x+1,y))*p.gradient,ny=(at(x,y+1)-at(x,y-1))*p.gradient,nz=1,length=Math.hypot(nx,ny,nz),index=(y*SIZE+x)*3;
  normal[index]=Math.round((nx/length*.5+.5)*255);normal[index+1]=Math.round((ny/length*.5+.5)*255);normal[index+2]=Math.round((nz/length*.5+.5)*255);
 }
 return{albedo:png(albedo),normal:png(normal),orm:png(orm),normalScale:p.normalScale,roughness:1};
}
export function vigilFabricTextures(kind){if(!Object.hasOwn(FABRICS,kind))throw new TypeError('Unknown vigil fabric '+String(kind));let result=cache.get(kind);if(!result){result=make(kind);cache.set(kind,result);}return Object.freeze({...result,albedo:Buffer.from(result.albedo),normal:Buffer.from(result.normal),orm:Buffer.from(result.orm)});}

const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1));
/** Assign physical cloth UVs after all garment fitting. Three stitched charts
 * preserve grain along the torso and each bent arm. UV seams are real vertex
 * splits; positions, smooth normals and skin weights stay exactly unchanged. */
export function fabricUV(mesh,bones,{repeatPerMeter=12.5}={}){
 if(!Number.isFinite(repeatPerMeter)||repeatPerMeter<=0)throw new TypeError('Fabric repeat density must be positive');
 const byName=new Map((bones||[]).map(b=>[b.name,b])),pelvis=byName.get('pelvis'),chest=byName.get('chest'),armWeight=(id,side)=>{let total=0;for(let slot=0;slot<4;slot++)if(new RegExp('^(upperarm|forearm)_'+side+'$').test(bones?.[mesh.skinIndex?.[id*4+slot]]?.name||''))total+=mesh.skinWeight[id*4+slot];return total;},torsoCenter=y=>{if(!pelvis||!chest)return[0,0,0];const t=clamp((y-pelvis.head[1])/(chest.head[1]-pelvis.head[1]||1));return add(mul(pelvis.head,1-t),mul(chest.head,t));};
 let torsoRadius=0,torsoSamples=0;const armRadii={L:[],R:[]},armCoordinate=(p,side)=>{const upper=byName.get('upperarm_'+side),fore=byName.get('forearm_'+side);if(!upper||!fore)return null;let best=null,cumulative=0;for(const[a,b]of[[upper.head,upper.tail],[fore.head,fore.tail]]){const axis=sub(b,a),size=length(axis),t=clamp(dot(sub(p,a),axis)/(size*size||1)),center=add(a,mul(axis,t)),radial=sub(p,center),distance=length(radial),along=cumulative+t*size,forward=unit(sub([0,0,-1],mul(unit(axis),dot([0,0,-1],unit(axis))))),right=unit(cross(unit(axis),forward));if(!best||distance<best.radius)best={radius:distance,angle:Math.atan2(dot(radial,right),dot(radial,forward)),along,axis:unit(axis),cap:[dot(radial,right),dot(radial,forward)]};cumulative+=size;}return best;};
 for(const id of new Set(mesh.indices)){const p=mesh.positions.slice(id*3,id*3+3),l=armWeight(id,'L'),r=armWeight(id,'R');if(Math.max(l,r)>.5){const side=l>r?'L':'R',a=armCoordinate(p,side);if(a&&a.radius>.008&&a.radius<.13)armRadii[side].push(a.radius);}else if(!pelvis||p[1]>pelvis.head[1]-.12){const c=torsoCenter(p[1]);torsoRadius+=Math.hypot(p[0]-c[0],p[2]-c[2]);torsoSamples++;}}
 torsoRadius=Math.max(.08,torsoRadius/(torsoSamples||1));for(const side of['L','R']){armRadii[side].sort((a,b)=>a-b);armRadii[side]=armRadii[side][Math.floor(armRadii[side].length/2)]||.045;}
 const positions=[],normals=[],skinIndex=[],skinWeight=[],uv=[],indices=[],sourceVertexIndices=[],lookup=new Map(),coordinate=(id,chart)=>{
  const p=mesh.positions.slice(id*3,id*3+3),side=chart.replace('cap-','');
  if(side==='L'||side==='R'){const a=armCoordinate(p,side);if(a)return chart.startsWith('cap-')?{direct:a.cap}:{angle:a.angle,v:a.along,radius:armRadii[side]};}
  if(chart==='cap-torso'||chart==='plane-y')return{direct:[p[0],p[2]]};
  if(chart==='plane-x')return{direct:[p[2],p[1]]};
  if(chart==='plane-z')return{direct:[p[0],p[1]]};
  const c=torsoCenter(p[1]);return{angle:Math.atan2(p[0]-c[0],-(p[2]-c[2])),v:p[1],radius:torsoRadius};
 };
 let fallbackTriangles=0;
 for(let tri=0;tri<mesh.indices.length;tri+=3){
  const ids=mesh.indices.slice(tri,tri+3),l=ids.reduce((n,id)=>n+armWeight(id,'L'),0)/3,r=ids.reduce((n,id)=>n+armWeight(id,'R'),0)/3;let chart=Math.max(l,r)>.35?(l>r?'L':'R'):'torso';
  const p=ids.map(id=>mesh.positions.slice(id*3,id*3+3)),face=unit(cross(sub(p[1],p[0]),sub(p[2],p[0]))),axis=chart==='torso'?[0,1,0]:armCoordinate(mul(p.reduce(add,[0,0,0]),1/3),chart)?.axis;
  // Sewn return edges and cap faces need planar tangent charts. A cylinder's
  // longitudinal coordinate is constant there and would collapse the TBN.
  if(axis&&Math.abs(dot(face,axis))>.88)chart='cap-'+chart;
  let coords=ids.map(id=>coordinate(id,chart)),wrap=!coords[0].direct&&Math.max(...coords.map(c=>c.angle))-Math.min(...coords.map(c=>c.angle))>Math.PI;
  const projected=coords.map(c=>c.direct?c.direct.map(v=>v*repeatPerMeter):[(c.angle+(wrap&&c.angle<0?TAU:0))*c.radius*repeatPerMeter,c.v*repeatPerMeter]),uvArea=Math.abs((projected[1][0]-projected[0][0])*(projected[2][1]-projected[0][1])-(projected[2][0]-projected[0][0])*(projected[1][1]-projected[0][1])),area=length(cross(sub(p[1],p[0]),sub(p[2],p[0])));
  // Shoulder cloth can extend beyond a clamped anatomical cylinder endpoint.
  // Use a well-conditioned local plane for those few patches rather than
  // feeding a collapsed derivative frame into the normal-map shader.
  if(area>1e-12&&(uvArea<1e-10||uvArea/area<repeatPerMeter**2*.05)){
   const axis=['x','y','z'].sort((a,b)=>Math.abs(face['xyz'.indexOf(b)])-Math.abs(face['xyz'.indexOf(a)]))[0];chart='plane-'+axis;coords=ids.map(id=>coordinate(id,chart));wrap=false;fallbackTriangles++;
  }
  for(let j=0;j<3;j++){
   const original=ids[j],c=coords[j],shift=wrap&&c.angle<0?1:0,key=original+':'+chart+':'+shift;let id=lookup.get(key);
   if(id===undefined){id=positions.length/3;lookup.set(key,id);positions.push(...mesh.positions.slice(original*3,original*3+3));normals.push(...mesh.normals.slice(original*3,original*3+3));skinIndex.push(...mesh.skinIndex.slice(original*4,original*4+4));skinWeight.push(...mesh.skinWeight.slice(original*4,original*4+4));uv.push(...(c.direct?c.direct.map(v=>v*repeatPerMeter):[(c.angle+shift*TAU)*c.radius*repeatPerMeter,c.v*repeatPerMeter]));sourceVertexIndices.push(mesh.sourceVertexIndices?.[original]??original);}indices.push(id);
  }
 }

 return{...mesh,positions,normals,skinIndex,skinWeight,uv,indices,sourceVertexIndices,faces:Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3)),fabricUV:{repeatPerMeter,charts:9,fallbackTriangles,sourceVertices:mesh.positions.length/3,vertices:positions.length/3}};
}
