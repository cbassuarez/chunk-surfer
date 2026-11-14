// Original company lettering and a geometrically constructed Union Flag.
// Filled, opaque paint geometry: no borrowed company mark, raster font or sign card.
export const VAN_BRAND_VIEWBOX=Object.freeze([0,0,1800,540]);
export const VAN_BRAND_COPY='ALBION LOCATION SOUND';
export const VAN_BRAND_PIGMENTS=Object.freeze({navy:'#012169',white:'#f5f1e6',red:'#c8102e'});
export const VAN_BRAND_FLAG=Object.freeze({x:58,y:112,width:480,height:288,
  construction:'50 × 30; white saltire 6; red saltire 2, offset 1; white cross 10; red cross 6',
  reference:'https://www.flaginstitute.org/wp/uk-flags/union-flag-specification/'});
const art=[];
const fill=(id,outer,holes=[],pigment='navy',layer=0)=>art.push({id,pigment,layer,outer,...(holes.length?{holes}:{})});
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
// Convex clipping keeps the diagonal pigment within the exact 3:5 flag field.
function clip(poly,axis,edge,keepAbove){
 const out=[];for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],inside=p=>keepAbove?p[axis]>=edge:p[axis]<=edge,ia=inside(a),ib=inside(b);
  if(ia)out.push(a);if(ia!==ib){const t=(edge-a[axis])/(b[axis]-a[axis]);out.push(a.map((v,k)=>v+(b[k]-v)*t));}
 }return out;
}
function band(a,b,width,offset=0){
 const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),nx=-dy/l,ny=dx/l;
 let p=[a,b,b,a].map((q,i)=>[q[0]+nx*(offset+(i<2?-width/2:width/2)),q[1]+ny*(offset+(i<2?-width/2:width/2))]);
 for(const [axis,edge,above]of [[0,0,true],[0,50,false],[1,0,true],[1,30,false]])p=clip(p,axis,edge,above);return p;
}
const flagMap=p=>[VAN_BRAND_FLAG.x+p[0]*9.6,VAN_BRAND_FLAG.y+p[1]*9.6];
const flag=(id,points,pigment,layer)=>fill('flag-'+id,points.map(flagMap),[],pigment,layer);
flag('field',rect(0,0,50,30),'navy',0);
flag('andrew-descending',band([-30,-18],[80,48],6),'white',1);
flag('andrew-ascending',band([-30,48],[80,-18],6),'white',1);
// The red saltire is counterchanged. The broad white edge is uppermost at
// the hoist, narrow uppermost at the fly, rather than four centred red arms.
for(const [id,a,b,offset]of [['nw',[-30,-18],[25,15],1],['se',[25,15],[80,48],-1],
 ['sw',[-30,48],[25,15],1],['ne',[25,15],[80,-18],-1]])flag('patrick-'+id,band(a,b,2,offset),'red',2);
flag('cross-white-vertical',rect(20,0,10,30),'white',3);
flag('cross-white-horizontal',rect(0,10,50,10),'white',3);
flag('george-vertical',rect(22,0,6,30),'red',4);
flag('george-horizontal',rect(0,12,50,6),'red',4);
// Six purpose-drawn heavy letters, with open counters cut out of the pigment.
const glyph={
 A:{o:[[0,100],[31,0],[69,0],[100,100],[74,100],[67,74],[33,74],[26,100]],h:[[[40,49],[60,49],[50,17]]]},
 L:{o:[[0,0],[27,0],[27,76],[100,76],[100,100],[0,100]]},
 B:{o:[[0,0],[70,0],[91,10],[100,26],[95,43],[84,49],[97,61],[100,80],[89,95],[69,100],[0,100]],h:[[[27,19],[64,19],[73,25],[73,32],[64,39],[27,39]],[[27,60],[66,60],[74,67],[74,76],[65,82],[27,82]]]},
 I:{o:[[12,0],[88,0],[88,21],[63,21],[63,79],[88,79],[88,100],[12,100],[12,79],[37,79],[37,21],[12,21]]},
 O:{o:[[20,0],[80,0],[100,20],[100,80],[80,100],[20,100],[0,80],[0,20]],h:[[[32,23],[68,23],[75,30],[75,70],[68,77],[32,77],[25,70],[25,30]]]},
 N:{o:[[0,100],[0,0],[27,0],[74,62],[74,0],[100,0],[100,100],[73,100],[26,38],[26,100]]},
};
for(const[i,letter]of [...'ALBION'].entries()){
 const g=glyph[letter],map=([x,y])=>[620+i*183+x*1.53,82+y*2.34];
 fill('name-'+letter,g.o.map(map),(g.h||[]).map(h=>h.map(map)),'navy',0);
}
const caption={
 L:[[[5,0],[5,100],[65,100]]],O:[[[18,0],[52,0],[66,18],[66,82],[52,100],[18,100],[4,82],[4,18],[18,0]]],
 C:[[[66,12],[52,0],[18,0],[4,18],[4,82],[18,100],[52,100],[66,88]]],
 A:[[[2,100],[30,0],[40,0],[68,100]],[[13,64],[57,64]]],T:[[[0,0],[70,0]],[[35,0],[35,100]]],
 I:[[[10,0],[60,0]],[[35,0],[35,100]],[[10,100],[60,100]]],
 N:[[[5,100],[5,0],[65,100],[65,0]]],S:[[[66,10],[52,0],[18,0],[4,14],[4,38],[18,50],[52,50],[66,64],[66,86],[52,100],[18,100],[4,90]]],
 U:[[[5,0],[5,82],[18,100],[52,100],[65,82],[65,0]]],D:[[[5,100],[5,0],[47,0],[66,20],[66,80],[47,100],[5,100]]],
};
const stroke=(id,a,b,width)=>{const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy),nx=-dy/d*width/2,ny=dx/d*width/2;
 fill(id,[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]]);};
for(const[i,letter]of [...'LOCATION SOUND'].entries())if(letter!==' '){
 const map=([x,y])=>[621+i*79+x*.80,371+y*.80];
 for(const[j,path]of caption[letter].entries()){
  for(let k=1;k<path.length;k++)stroke(`caption-${i}-${j}-${k}`,map(path[k-1]),map(path[k]),10.5);
  for(const[k,p]of path.entries()){const [x,y]=map(p);fill(`caption-join-${i}-${j}-${k}`,Array.from({length:8},(_,n)=>[x+5.25*Math.cos(n*Math.PI/4),y+5.25*Math.sin(n*Math.PI/4)]));}
 }
}
export const VAN_BRAND_ART=Object.freeze(art.map(s=>Object.freeze({...s,outer:Object.freeze(s.outer.map(Object.freeze)),...(s.holes?{holes:Object.freeze(s.holes.map(h=>Object.freeze(h.map(Object.freeze))))}:{})})));
