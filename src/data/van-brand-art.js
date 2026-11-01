// Original owner-painted mark. Geometry, SVG review and the production pigment
// share these filled outlines; there is no raster font, alpha card or emissive
// sign behind the paint. Coordinates are in the 1800 × 540 design plane.
export const VAN_BRAND_VIEWBOX=Object.freeze([0,0,1800,540]);
export const VAN_BRAND_COPY='FIELD RECORDING SERVICES';
export const VAN_BRAND_PIGMENTS=Object.freeze({ink:'#17231e',oxide:'#ac3927'});
const art=[];
const cubic=(a,b,c,d,t)=>{const u=1-t;return[u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]];};
const line=(a,b,n=12)=>Array.from({length:n+1},(_,k)=>[a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);
const curve=(a,b,c,d,n=32)=>Array.from({length:n+1},(_,k)=>cubic(a,b,c,d,k/n));
const chain=(...pieces)=>pieces.flatMap((p,i)=>i?p.slice(1):p);
function paint(id,points,width,pigment='ink',seed=0){
 const left=[],right=[];
 for(let i=0;i<points.length;i++){
  const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1,t=i/(points.length-1);
  const pressure=.83+.10*Math.sin(t*5.4+seed)+.045*Math.sin(i*1.87+seed),tip=Math.min(1,.60+t*5,.62+(1-t)*8),r=width*.5*pressure*tip;
  left.push([p[0]-dy/length*r,p[1]+dx/length*r]);right.push([p[0]+dy/length*r,p[1]-dx/length*r]);
 }
 art.push({id,pigment,outer:[...left,...right.reverse()]});
}
function oval(cx,cy,rx,ry,seed=0,n=44){return Array.from({length:n},(_,i)=>{const t=i/n*Math.PI*2,w=1+.018*Math.sin(5*t+seed)+.011*Math.sin(9*t-seed);return[cx+Math.cos(t)*rx*w,cy+Math.sin(t)*ry*w];});}
function fill(id,outer,holes=[],pigment='ink'){art.push({id,pigment,outer,...(holes.length?{holes}:{})});}

// A hand-pulled microphone lead. The narrow swell is a single painter's
// gesture, not an ECG stock graphic or a decorative outline around the name.
paint('lead',chain(curve([152,316],[100,326],[69,383],[118,401]),curve([118,401],[214,456],[289,379],[350,412]),
 curve([350,412],[780,425],[1230,416],[1725,400])),14,'oxide',1.7);
paint('lead-end',curve([1710,400],[1737,397],[1751,390],[1770,394]),11,'oxide',2);

// FIELD: five deliberately different, pressure-shaped broad brush letters.
paint('F-stem',curve([373,392],[401,287],[411,166],[438,74]),88,'ink',.3);
paint('F-cap',curve([435,82],[495,71],[563,68],[620,65]),80,'ink',.6);
paint('F-cross',curve([410,218],[462,204],[514,206],[569,198]),67,'ink',1.4);
paint('I-stem',curve([679,385],[687,287],[710,161],[729,78]),95,'ink',2.8);
paint('I-cap',curve([681,85],[716,77],[751,76],[777,75]),51,'ink',.9);
paint('I-foot',curve([634,385],[673,392],[726,385],[756,379]),49,'ink',3.2);
paint('E-stem',curve([827,386],[839,286],[856,177],[872,83]),85,'ink',.4);
paint('E-cap',curve([869,85],[925,76],[993,74],[1056,69]),79,'ink',1.3);
paint('E-cross',curve([848,224],[900,219],[956,219],[1007,208]),67,'ink',.1);
paint('E-foot',curve([818,384],[873,395],[955,386],[1028,372]),82,'ink',2.4);
paint('L-stem',curve([1101,389],[1118,297],[1126,174],[1151,74]),89,'ink',1.7);
paint('L-foot',curve([1093,384],[1179,399],[1253,384],[1321,369]),89,'ink',.7);
paint('D-stem',curve([1380,388],[1393,278],[1407,164],[1424,78]),87,'ink',2.1);
paint('D-bowl',chain(curve([1422,80],[1589,37],[1748,104],[1690,251]),curve([1690,251],[1657,347],[1532,396],[1379,386])),87,'ink',3.7);

// A battered moving-coil capsule, drawn as filled pigment with actual open
// grille slots. Its tilted crown and socket differ from a corporate mic icon.
const capsule=chain(curve([103,115],[106,69],[177,59],[207,98]),curve([207,98],[222,141],[210,225],[196,257]),
 curve([196,257],[182,292],[116,285],[103,253]),curve([103,253],[91,216],[93,155],[103,115]));
fill('capsule',capsule,[
 [[120,121],[194,109],[193,130],[118,142]],[[115,164],[193,151],[191,172],[113,185]],[[113,205],[187,194],[184,214],[114,225]],
]);
paint('capsule-socket',curve([146,271],[146,288],[153,301],[152,317]),35,'ink',1.1);
paint('capsule-highlight',curve([101,130],[91,160],[92,209],[100,232]),10,'oxide',.4);

// Small owner-lettered description. Only this inscription's required glyphs
// exist here: these are original compact marker skeletons, not a font system.
const glyphs={
 R:[[[4,100],[7,3]],[[7,5],[52,4],[64,15],[59,40],[9,48]],[[32,48],[61,100]]],
 E:[[[8,99],[9,4]],[[9,5],[62,3]],[[9,49],[50,46]],[[7,98],[61,94]]],
 C:[[[63,13],[43,2],[16,8],[4,35],[3,69],[18,96],[44,100],[62,86]]],
 D:[[[7,99],[8,4]],[[8,5],[38,2],[59,19],[66,48],[60,79],[40,96],[7,98]]],
 I:[[[28,3],[24,99]],[[5,4],[49,3]],[[2,99],[48,97]]],
 N:[[[4,100],[8,3],[60,99],[63,3]]],
 G:[[[62,14],[44,2],[16,8],[4,36],[4,73],[20,98],[48,97],[63,76],[62,57],[36,59]]],
 S:[[[64,13],[46,3],[18,7],[5,25],[12,44],[48,54],[62,72],[55,92],[30,100],[4,88]]],
 V:[[[3,4],[29,99],[65,4]]],
 O:[],
};
const caption='RECORDING SERVICES',pitch=77,start=385,top=447,scale=.72;
for(let i=0;i<caption.length;i++){
 const letter=caption[i];if(letter===' ')continue;
 const ox=start+i*pitch,oy=top+Math.sin(i*1.9)*2.2,tilt=Math.sin(i*1.37)*.025;
 const map=([x,y])=>[ox+(x+tilt*(100-y))*scale,oy+y*scale];
 if(letter==='O')fill('caption-O-'+i,oval(ox+34*scale,oy+50*scale,32*scale,50*scale,i),[oval(ox+34*scale,oy+50*scale,18*scale,34*scale,i+.3)]);
 else for(const [k,path]of(glyphs[letter]||[]).entries()){
  const points=chain(...path.slice(1).map((p,j)=>line(map(path[j]),map(p),8)));
  paint(`caption-${letter}-${i}-${k}`,points,12.7,'ink',i*.51+k);
 }
}
export const VAN_BRAND_ART=Object.freeze(art.map(s=>Object.freeze({...s,outer:Object.freeze(s.outer.map(Object.freeze)),...(s.holes?{holes:Object.freeze(s.holes.map(h=>Object.freeze(h.map(Object.freeze))))}:{})})));
