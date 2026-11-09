// One reference-led, closed hero object for the cab, inspection and coast.
// No internal mechanism is implied by the coating or the crash deformation.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {MUSIC_BOX_CONSTRUCTION} from '../../../src/data/music-box-construction.js';
export {MUSIC_BOX_CONSTRUCTION};
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const srgb=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const colour=hex=>[1,3,5].map(i=>linear(parseInt(hex.slice(i,i+2),16)/255));
export const MUSIC_BOX_MATERIALS=Object.freeze({
 plastic:{label:'aged ivory coated case',base:colour('#c6bca2'),rough:.4,metal:0,period:.011,relief:.000025,kind:'boxCoating',mapSize:256},
 boxSeam:{label:'closed case seam and recess',base:colour('#57554b'),rough:.64,metal:0,period:.011,relief:0,kind:'boxCoating'},
 boxBack:{label:'dark coated rear plate',base:colour('#26313a'),rough:.43,metal:.12,period:.012,relief:.000019,kind:'boxPlate',mapSize:256},
 boxScrew:{label:'worn crosshead brass fasteners',base:colour('#ac914c'),rough:.33,metal:.82,period:.009,relief:.000008,kind:'boxMetal'},
 brassKey:{label:'engraved brass winding key',base:colour('#b5a36e'),rough:.31,metal:.85,period:.012,relief:.00001,kind:'boxMetal',mapSize:256},
 boxEngraving:{label:'key engraving and recessed screw slots',base:colour('#514b32'),rough:.69,metal:.4,period:.012,relief:0,kind:'boxMetal'},
 boxScuff:{label:'impact rubbed coating and old edge wear',base:colour('#9e9681'),rough:.79,metal:0,period:.011,relief:.000035,kind:'boxCoating'},
 boxOxide:{label:'restrained green patina at fittings',base:colour('#667264'),rough:.86,metal:.12,period:.012,relief:.000015,kind:'boxMetal'},
 boxImpactUndercoat:{label:'dark green undercoat at the single impact chip',base:colour('#34463c'),rough:.86,metal:0,period:.008,relief:.000045,kind:'boxCoating'},
 portrait:{label:'Debussy portrait on coated case',base:[1,1,1],rough:.51,metal:0,period:.05,relief:.000008,kind:'boxPrint',photo:'assets/music-box/texture-portrait.png'},
 boxLabel:{label:'Clair de Lune title on coated case',base:[1,1,1],rough:.46,metal:0,period:.04,relief:.000008,kind:'boxPrint',photo:'assets/music-box/texture-label.png'},
});
const group=material=>({material,positions:[],normals:[],uvs:[],indices:[]});
function triangle(g,a,b,c,uv=[[0,0],[1,0],[1,1]]){const ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]),n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],len=Math.hypot(...n),off=g.positions.length/3;if(len<1e-15)return;g.positions.push(...a,...b,...c);for(let i=0;i<3;i++){g.normals.push(...n.map(v=>v/len));g.uvs.push(...uv[i]);}g.indices.push(off,off+1,off+2);}
function quad(g,a,b,c,d,uv=[[0,0],[1,0],[1,1],[0,1]]){triangle(g,a,b,c,uv.slice(0,3));triangle(g,a,c,d,[uv[0],uv[2],uv[3]]);}
function rounded(g,size,position,radius=.001,segments=3){const geometry=new RoundedBoxGeometry(...size,segments,radius),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),off=g.positions.length/3;for(let i=0;i<p.count;i++){const a=[p.getX(i)+position[0],p.getY(i)+position[1],p.getZ(i)+position[2]],normal=[n.getX(i),n.getY(i),n.getZ(i)],axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1],repeat=MUSIC_BOX_MATERIALS[g.material].period;g.positions.push(...a);g.normals.push(...normal);g.uvs.push(a[axes[0]]/repeat,a[axes[1]]/repeat);}g.indices.push(...Array.from({length:p.count},(_,i)=>off+i));geometry.dispose();}
// A thin stamped plate needs generous corners in XY independently of its
// thickness; a rounded cuboid would clamp their radius to half that thickness.
function plate(g,w,h,depth,c,r=.0028){const points=[],hw=w/2,hh=h/2;for(const[x,y,a]of[[hw-r,hh-r,0],[-hw+r,hh-r,Math.PI/2],[-hw+r,-hh+r,Math.PI],[hw-r,-hh+r,Math.PI*1.5]])for(let i=0;i<=8;i++){const t=a+i/8*Math.PI/2;points.push([c[0]+x+Math.cos(t)*r,c[1]+y+Math.sin(t)*r]);}const back=c[2]-depth/2,front=c[2]+depth/2;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];quad(g,[...a,back],[...b,back],[...b,front],[...a,front]);triangle(g,[c[0],c[1],back],[...b,back],[...a,back]);triangle(g,[c[0],c[1],front],[...a,front],[...b,front]);}}
function ring(g,c,outer,inner,z,segments=32){for(let i=0;i<segments;i++){const a=i/segments*TAU,b=(i+1)/segments*TAU,p=(r,t)=>[c[0]+Math.cos(t)*r,c[1]+Math.sin(t)*r,z];quad(g,p(outer,a),p(inner,a),p(inner,b),p(outer,b));}}
function disk(g,c,r,z,segments=32){for(let i=0;i<segments;i++){const a=i/segments*TAU,b=(i+1)/segments*TAU;triangle(g,[c[0],c[1],z],[c[0]+Math.cos(b)*r,c[1]+Math.sin(b)*r,z],[c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r,z]);}}
function ribbon(g,points,width,normal=[0,0,-1]){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=b.map((v,k)=>v-a[k]),side=[d[1]*normal[2]-d[2]*normal[1],d[2]*normal[0]-d[0]*normal[2],d[0]*normal[1]-d[1]*normal[0]],len=Math.hypot(...side);if(!len)continue;const o=side.map(v=>v/len*width/2);quad(g,a.map((v,k)=>v+o[k]),b.map((v,k)=>v+o[k]),b.map((v,k)=>v-o[k]),a.map((v,k)=>v-o[k]));}}
function deform(g,damaged){if(!damaged)return;for(let i=0;i<g.positions.length;i+=3){const x=g.positions[i],y=g.positions[i+1],z=g.positions[i+2],s=Math.exp(-(((x-.025)/.010)**2)-((y-.003)/.009)**2),crease=Math.exp(-(((x-.023)/.008)**2)-((y-.006)/.0018)**2);g.positions[i]-=.00365*s+.00035*crease;g.positions[i+1]+=.0020*s;g.positions[i+2]+=.0010*s*(z<0?1:-1);}}
function recompute(g){const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];for(let i=0;i<g.normals.length;i+=3){const p=g.positions.slice(i,i+3),n=g.normals.slice(i,i+3),e=1e-7,base={positions:[...p,p[0]+e,p[1],p[2],p[0],p[1]+e,p[2],p[0],p[1],p[2]+e]};deform(base,true);const columns=[3,6,9].map(o=>[0,1,2].map(k=>(base.positions[o+k]-base.positions[k])/e)),cofactors=[cross(columns[1],columns[2]),cross(columns[2],columns[0]),cross(columns[0],columns[1])],normal=[0,1,2].map(k=>cofactors.reduce((sum,c,j)=>sum+c[k]*n[j],0)),len=Math.hypot(...normal)||1;for(let k=0;k<3;k++)g.normals[i+k]=normal[k]/len;}}
function facePanel(g,c,width,height,z,normal=1){const w=width/2,h=height/2,a=[c[0]-w,c[1]-h,z],b=[c[0]+w,c[1]-h,z],d=[c[0]-w,c[1]+h,z],e=[c[0]+w,c[1]+h,z];if(normal>0)quad(g,a,b,e,d,[[0,1],[1,1],[1,0],[0,0]]);else quad(g,b,a,d,e,[[0,1],[1,1],[1,0],[0,0]]);}
function physicalUV(g){if(MUSIC_BOX_MATERIALS[g.material].photo)return;for(let i=0;i<g.positions.length;i+=3){const n=g.normals.slice(i,i+3),axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1],repeat=MUSIC_BOX_MATERIALS[g.material].period;g.uvs[i/3*2]=g.positions[i+axes[0]]/repeat;g.uvs[i/3*2+1]=g.positions[i+axes[1]]/repeat;}}
function impactChip(undercoat,edge,W,H,D){
 const radius=.0041,cornerX=W/2-radius,cornerZ=D/2-radius,quarter=Math.PI/2*radius;
 // Unfold one small chip across front, rounded corner and side. Projecting
 // onto the actual rounded skin keeps its marks attached at the bottom bevel.
 const surface=(u,y,offset)=>{let x,z;if(u<0){x=cornerX+u;z=D/2;}else if(u<=quarter){x=cornerX+radius*Math.sin(u/radius);z=cornerZ+radius*Math.cos(u/radius);}else{x=W/2;z=cornerZ-(u-quarter);}const p=[x,y,z],centre=[0,H/2,0],half=[W/2-radius,H/2-radius,D/2-radius],q=p.map((v,k)=>Math.max(0,Math.abs(v-centre[k])-half[k])),length=Math.hypot(...q),normal=q.map((v,k)=>(v/(length||1))*Math.sign(p[k]-centre[k]));return p.map((v,k)=>v-normal[k]*(length-radius)+normal[k]*offset);};
 const stations=[[-.0044,.0043,.0056],[-.0035,.0030,.0063],[-.0026,.0026,.0060],[-.0014,.0028,.0076],[-.0003,.0020,.0081],[.0008,.0025,.0072],[.0019,.0019,.0077],[.0031,.0023,.0070],[.0042,.0020,.0068],[.0053,.0028,.0071],[.0063,.0026,.0060],[.0073,.0034,.0059],[.0082,.0042,.0050]];
 const top=[],bottom=[];for(const[u,low,high]of stations){bottom.push(surface(u,low,.000055));top.push(surface(u,high,.000055));}
 for(let i=1;i<stations.length;i++)quad(undercoat,bottom[i-1],bottom[i],top[i],top[i-1]);
 // A fine, irregular coating lip supplies depth without a bright graphic rim.
 for(const line of[top,bottom]){const raised=line.map(p=>{const q=p.map((x,k)=>x-[0,H/2,0][k]),l=Math.hypot(...q);return p.map((x,k)=>x+q[k]/l*.000025);});ribbon(edge,raised,.00015,[0,0,1]);}
}
export function buildMusicBoxModel({damaged=false}={}){
 const groups=new Map(),get=key=>{if(!groups.has(key))groups.set(key,group(key));return groups.get(key);},[W,H,D]=MUSIC_BOX_CONSTRUCTION.dimensions;
 rounded(get('plastic'),[W,H,D],[0,H/2,0],.0041,4);
 // The closed rear rim is an actual seating seam around a separate plate.
 plate(get('boxSeam'),W-.0011,H-.0011,.00105,[0,H/2,-D/2+.00005],.0034);
 const rearPlate=MUSIC_BOX_CONSTRUCTION.rearPlate;
 plate(get('boxBack'),rearPlate.width,rearPlate.height,rearPlate.depth,[0,rearPlate.centreY,rearPlate.frontZ-rearPlate.depth/2],.0028);
 facePanel(get('portrait'),[0,H*.505],W*.84,H*.79,D/2+.000055,1);
 // Preserve the reference's sideways inscription on the narrow +X face.
 const lg=get('boxLabel'),x=W/2+.000055,y0=H*.16,y1=H*.84,z0=-D*.37,z1=D*.37;
 quad(lg,[x,y0,z0],[x,y1,z0],[x,y1,z1],[x,y0,z1],[[0,1],[0,0],[1,0],[1,1]]);
 const rear=rearPlate.frontZ-rearPlate.depth-.00006;
 for(const [sx,sy,turn]of[[-.0210,.0112,-.24],[.0067,.0402,.43],[.0131,.0064,1.2]]){
  ring(get('boxEngraving'),[sx,sy],.0022,.0016,rear-.00001,24);
  // A shallow domed head, its slot and an annular seating recess.
  for(let j=0;j<3;j++){const ra=.00182-j*.00025,rb=ra-.00025,za=rear-.0001-j*.00015,zb=za-.00015;for(let i=0;i<24;i++){const a=i/24*TAU,b=(i+1)/24*TAU;quad(get('boxScrew'),[sx+ra*Math.cos(a),sy+ra*Math.sin(a),za],[sx+rb*Math.cos(a),sy+rb*Math.sin(a),zb],[sx+rb*Math.cos(b),sy+rb*Math.sin(b),zb],[sx+ra*Math.cos(b),sy+ra*Math.sin(b),za]);}}
  disk(get('boxScrew'),[sx,sy],.00107,rear-.00055,24);
  for(const angle of[turn,turn+Math.PI/2]){const dx=Math.cos(angle)*.00137,dy=Math.sin(angle)*.00137;ribbon(get('boxEngraving'),[[sx-dx,sy-dy,rear-.000565],[sx+dx,sy+dy,rear-.000565]],.00025);}
 }
 for(const [hx,hy,r]of[[-.0113,.0147,.0011],[-.0113,.0096,.0009],[.0221,.0214,.00125]]){disk(get('boxEngraving'),[hx,hy],r,rear-.000015,24);ring(get('boxScrew'),[hx,hy],r+.00015,r,rear-.000025,24);}
 for(const [tx,ty]of[[-.0034,H-.0014],[.0035,.0015]]){rounded(get('boxScrew'),[.007,.0017,.0009],[tx,ty,rear-.00018],.00035,2);ribbon(get('boxOxide'),[[tx-.0027,ty+.00022,rear-.00066],[tx+.0025,ty+.00038,rear-.00066]],.00034);}
 // Old scratches stay modest in the opening; the coast adds one coherent
 // compressed corner and rubbed coating, while the case remains shut.
 for(const [sx,sy,len]of[[-.024,.034,.006],[.023,.012,.005],[-.021,.004,.005]])ribbon(get('boxScuff'),[[sx,sy,D/2-.0005],[sx+.00035,sy+len,D/2-.0005]],.0002,[0,0,1]);
 if(damaged)impactChip(get('boxImpactUndercoat'),get('boxScuff'),W,H,D);
 const body=[...groups.values()].filter(g=>g.indices.length);for(const g of body){if(damaged)recompute(g);deform(g,damaged);physicalUV(g);}
 // Key geometry has the same box-local origin as the shell. Runtime rotates
 // this entire group about keyPivot, and never rotates the printed rear plate.
 const key=group('brassKey'),engraving=group('boxEngraving'),[kx,ky,kz]=MUSIC_BOX_CONSTRUCTION.keyPivot;
 rounded(key,[.003,.003,.0034],[kx,ky,kz-.0014],.00045,3);
 const bend=(x,y,z)=>[x,y,z+(damaged?-.00065*((y-ky)/.007)**2:0)],N=48,rx=.00255,ry=.0074,front=kz-.0023,back=front-.0007;
 for(let i=0;i<N;i++){const a=i/N*TAU,b=(i+1)/N*TAU,p=(t,z)=>bend(kx+Math.cos(t)*rx,ky+Math.sin(t)*ry,z);triangle(key,bend(kx,ky,back),p(b,back),p(a,back));triangle(key,bend(kx,ky,front),p(a,front),p(b,front));quad(key,p(a,front),p(a,back),p(b,back),p(b,front));}
 // Fine stamped marks follow the key rather than remaining on the case.
 for(let j=0;j<5;j++){const yy=ky-.0048+j*.0022;ribbon(engraving,[bend(kx-.0010,yy,back-.00001),bend(kx+.0010,yy+.00035,back-.00001)],.00013);}
 for(const g of[key,engraving])physicalUV(g);
 return{body,key:[key,engraving],features:{type:'reference-led-closed-coated-music-box',dimensionsMetres:[W,H,D],dimensionsProvisional:true,damaged,casingClosed:true,construction:'Rounded aged ivory coated case; real closed rear rim and near-full dark plate; three crosshead brass screws, bores, retaining tabs, and separately pivoted oval winding key. No exposed internals.',damage:damaged?'One lower-right impact, compressed about 3–4 mm with a ragged dark-green undercoat chip wrapping from front to side, and a subtly bent oval key. Plate remains seated.':'Light old scuffs; no crash deformation.',keyPivot:[...MUSIC_BOX_CONSTRUCTION.keyPivot],keyAxis:[0,0,1],referenceTextures:['texture-portrait.png','texture-label.png']}};
}
let crcTable;
function png(n,data){crcTable??=Array.from({length:256},(_,i)=>{for(let k=0;k<8;k++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});const chunk=(type,bytes)=>{const t=Buffer.from(type),b=Buffer.alloc(bytes.length+12);b.writeUInt32BE(bytes.length);t.copy(b,4);bytes.copy(b,8);let c=0xffffffff;for(const v of Buffer.concat([t,bytes]))c=crcTable[(c^v)&255]^(c>>>8);b.writeUInt32BE((c^0xffffffff)>>>0,bytes.length+8);return b;},h=Buffer.alloc(13),rows=Buffer.alloc((n*4+1)*n);h.writeUInt32BE(n);h.writeUInt32BE(n,4);h[8]=8;h[9]=6;for(let y=0;y<n;y++)Buffer.from(data.buffer,data.byteOffset+y*n*4,n*4).copy(rows,y*(n*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
export function musicBoxMaterialMaps(key,{root=ROOT}={}){const q=MUSIC_BOX_MATERIALS[key];if(!q)return null;const N=q.mapSize||128,A=new Uint8Array(N*N*4),B=new Uint8Array(N*N*4),O=new Uint8Array(N*N*4),height=new Float32Array(N*N),noise=(x,y)=>{const v=Math.sin(x*127.1+y*311.7+key.length*91.3)*43758.5453;return v-Math.floor(v);};for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x; height[i]=(noise(x,y)-.5)*.37+(noise(Math.floor(x/3),Math.floor(y/3))-.5)*.25;}
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,k=i*4,h=height[i],d=q.relief*N/q.period,nx=-(height[y*N+(x+1)%N]-height[y*N+(x+N-1)%N])*d,ny=-(height[((y+1)%N)*N+x]-height[((y+N-1)%N)*N+x])*d,len=Math.hypot(nx,ny,1),mottled=.022*Math.sin(x/N*TAU*2)*Math.sin(y/N*TAU*3);for(let c=0;c<3;c++){A[k+c]=Math.round(clamp(srgb(clamp(q.base[c]*(1+h*.08+mottled))))*255);B[k+c]=Math.round(([nx/len,ny/len,1/len][c]*.5+.5)*255);}A[k+3]=B[k+3]=O[k+3]=255;O[k]=255;O[k+1]=Math.round(clamp(q.rough+h*.1)*255);O[k+2]=Math.round(q.metal*255);}
 return{albedo:q.photo?fs.readFileSync(path.join(root,q.photo)):png(N,A),normal:png(N,B),orm:png(N,O)};
}
