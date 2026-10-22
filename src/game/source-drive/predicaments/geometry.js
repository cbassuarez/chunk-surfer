// Original, metre-scaled Source drive catastrophe kit. Authoring only: the
// runtime imports generated bounds.js and the small placement module instead.
export const PREDICAMENT_REVISION='car-nage-whiteout-2';
const TAU=Math.PI*2;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(v,s)=>v.map(x=>x*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>mul(v,1/(Math.hypot(...v)||1));
const mix=(a,b,t)=>a+(b-a)*t;
export const PREDICAMENT_MATERIALS=Object.freeze({
 enamelIvory:{base:[.52,.485,.385],rough:.53,metal:.22,period:.85,relief:.0004,kind:'enamel'},
 enamelRed:{base:[.19,.025,.015],rough:.43,metal:.32,period:.85,relief:.0004,kind:'enamel'},
 enamelAsh:{base:[.315,.33,.31],rough:.67,metal:.18,period:.85,relief:.0004,kind:'enamel'},
 steel:{base:[.17,.18,.165],rough:.40,metal:.79,period:.60,relief:.0007,kind:'steel'},
 rust:{base:[.105,.042,.016],rough:.89,metal:.15,period:.75,relief:.002,kind:'rust'},
 cavity:{base:[.012,.014,.012],rough:.88,metal:.03,period:.60,relief:.001,kind:'rubber'},
 rubber:{base:[.018,.019,.016],rough:.86,metal:0,period:.30,relief:.0008,kind:'rubber'},
 upholstery:{base:[.055,.036,.024],rough:.91,metal:0,period:.35,relief:.001,kind:'cloth'},
 glazing:{base:[.023,.043,.043],rough:.22,metal:.15,period:1.0,relief:.0001,kind:'glass'},
 reflector:{base:[.49,.41,.21],rough:.32,metal:.45,period:.30,relief:.0001,kind:'glass'},
 cliff:{base:[.075,.082,.074],rough:.92,metal:0,period:4,relief:.015,kind:'stone'},
 concrete:{base:[.13,.145,.14],rough:.86,metal:0,period:2,relief:.004,kind:'stone'},
 asphalt:{base:[.047,.053,.05],rough:.82,metal:0,period:2,relief:.003,kind:'asphalt'},
 marking:{base:[.37,.345,.25],rough:.72,metal:0,period:.7,relief:.0004,kind:'paint'},
 snow:{base:[.55,.58,.56],rough:.85,metal:0,period:1.5,relief:.002,kind:'snow'},
 packedSnow:{base:[.30,.325,.31],rough:.83,metal:0,period:1.4,relief:.002,kind:'snow'},
 headlampOn:{base:[.60,.44,.25],rough:.28,metal:.05,period:.22,relief:.0003,kind:'glass',emissive:[.82,.52,.23]},
});
function primitive(material){return{material,positions:[],normals:[],uvs:[],indices:[]};}
function mesh(name,features={}){return{name,primitives:[],features};}
function stock(m,key){let g=m.primitives.find(p=>p.material===key);if(!g){g=primitive(key);m.primitives.push(g);}return g;}
function vertex(g,p,uv){const i=g.positions.length/3;g.positions.push(...p);g.uvs.push(...(uv||[p[0]/PREDICAMENT_MATERIALS[g.material].period,p[2]/PREDICAMENT_MATERIALS[g.material].period]));return i;}
function tri(g,a,b,c){g.indices.push(a,b,c);}
function quad(g,a,b,c,d,uv=null){const n=g.positions.length/3;[a,b,c,d].forEach((p,i)=>vertex(g,p,uv?.[i]));tri(g,n,n+1,n+2);tri(g,n,n+2,n+3);}
function triangles(g,points,faces){const n=g.positions.length/3;points.forEach(p=>vertex(g,p));for(const f of faces)for(let i=1;i<f.length-1;i++)tri(g,n+f[0],n+f[i],n+f[i+1]);}
function grid(g,cols,rows,fn,{flip=false,uvScale=[1,1]}={}){const n=g.positions.length/3;for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++)vertex(g,fn(i/cols,j/rows),[i/cols*uvScale[0],j/rows*uvScale[1]]);for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=n+j*(cols+1)+i,b=a+1,c=b+cols+1,d=a+cols+1;g.indices.push(...(flip?[a,c,b,a,d,c]:[a,b,c,a,c,d]));}}
function doubleSkin(g,cols,rows,fn,thickness=.018){grid(g,cols,rows,fn,{flip:true});grid(g,cols,rows,(u,v)=>add(fn(u,v),[0,-thickness,0]));for(let i=0;i<cols;i++)for(const v of[0,1]){const a=fn(i/cols,v),b=fn((i+1)/cols,v),c=add(b,[0,-thickness,0]),d=add(a,[0,-thickness,0]);quad(g,...(v?[b,a,d,c]:[a,b,c,d]));}for(let j=0;j<rows;j++)for(const u of[0,1]){const a=fn(u,j/rows),b=fn(u,(j+1)/rows),c=add(b,[0,-thickness,0]),d=add(a,[0,-thickness,0]);quad(g,...(u?[a,b,c,d]:[b,a,d,c]));}}
function closedPanel(g,points,thickness=.025){const a=points,b=points.map(p=>[p[0],p[1]-thickness,p[2]]);triangles(g,a,[Array.from({length:a.length},(_,i)=>i)]);triangles(g,b,[Array.from({length:b.length},(_,i)=>b.length-1-i)]);for(let i=0;i<a.length;i++){const j=(i+1)%a.length;quad(g,a[i],b[i],b[j],a[j]);}}
function box(g,c,s,transform=null){const h=s.map(v=>v/2),pts=Array.from({length:8},(_,i)=>[(i&1?1:-1)*h[0],(i&2?1:-1)*h[1],(i&4?1:-1)*h[2]]).map(p=>add(c,transform?transform(p):p));triangles(g,pts,[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]]);}
function tube(g,points,radius,segments=8,{cap=true,flatten=1}={}){const n=g.positions.length/3;let lastRight=null;for(let j=0;j<points.length;j++){const direction=unit(sub(points[Math.min(j+1,points.length-1)],points[Math.max(0,j-1)])),ref=Math.abs(direction[1])<.92?[0,1,0]:[1,0,0];let right=unit(cross(direction,ref));if(lastRight&&right.reduce((s,v,i)=>s+v*lastRight[i],0)<0)right=mul(right,-1);lastRight=right;const up=unit(cross(direction,right)),r=Array.isArray(radius)?radius[j]:radius;for(let k=0;k<segments;k++){const a=k/segments*TAU,p=add(points[j],add(mul(right,Math.cos(a)*r),mul(up,Math.sin(a)*r*flatten)));vertex(g,p,[j/(points.length-1)*Math.max(1,points.length*.3),k/segments]);if(j){const i=n+j*segments+k,ip=n+j*segments+(k+1)%segments;g.indices.push(i-segments,ip-segments,ip,i-segments,ip,i);}}}if(cap){const a=vertex(g,points[0]),b=vertex(g,points.at(-1));for(let k=0;k<segments;k++){tri(g,a,n+(k+1)%segments,n+k);tri(g,b,n+(points.length-1)*segments+k,n+(points.length-1)*segments+(k+1)%segments);}}}
function revolveX(g,centre,profile,segments=32){const n=g.positions.length/3;for(let j=0;j<profile.length;j++)for(let k=0;k<=segments;k++){const a=k/segments*TAU,[x,r]=profile[j];vertex(g,[centre[0]+x,centre[1]+Math.cos(a)*r,centre[2]+Math.sin(a)*r],[k/segments,j/(profile.length-1)]);if(j&&k){const i=n+j*(segments+1)+k;g.indices.push(i-segments-2,i-segments-1,i,i-segments-2,i,i-1);}}}
function normals(g){const n=new Float32Array(g.positions.length),p=g.positions;for(let i=0;i<g.indices.length;i+=3){const ids=g.indices.slice(i,i+3).map(v=>v*3),a=p.slice(ids[0],ids[0]+3),b=p.slice(ids[1],ids[1]+3),c=p.slice(ids[2],ids[2]+3),v=cross(sub(b,a),sub(c,a));for(const k of ids)for(let j=0;j<3;j++)n[k+j]+=v[j];}for(let i=0;i<n.length;i+=3){const v=unit([...n.slice(i,i+3)]);n.set(v,i);}g.normals=[...n];}
function bounds(m){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const g of m.primitives)for(let i=0;i<g.positions.length;i++){const k=i%3;min[k]=Math.min(min[k],g.positions[i]);max[k]=Math.max(max[k],g.positions[i]);}return{min,max};}
function finish(m){for(const p of m.primitives)normals(p);m.bounds=bounds(m);m.triangles=m.primitives.reduce((s,p)=>s+p.indices.length/3,0);return m;}
function wheel(m,centre,side=1,damage=0){const rubber=stock(m,'rubber'),steel=stock(m,'steel'),dark=stock(m,'cavity'),[x,y,z]=centre;
 // A tyre is a hollow toroidal section with sidewalls and an actual dish rim.
 // Broad shoulder ribs survive the game's sampling better than hairline tread.
 revolveX(rubber,centre,[[-.13,.235],[-.145,.258],[-.142,.31],[-.105,.345],[.085,.345],[.128,.315],[.133,.26],[.115,.231]],32);
 for(let r=0;r<3;r++){const px=-.078+r*.078;revolveX(dark,centre,[[px-.008,.346],[px+.008,.346]],32);}
 const outer=side*.143;revolveX(steel,centre,[[outer,.231],[outer+side*.015,.22],[outer+side*.018,.178],[outer-side*.035,.174]],24);
 revolveX(steel,centre,[[outer-side*.025,.066],[outer+side*.009,.058],[outer-side*.03,.050]],24);
 revolveX(dark,centre,[[outer-side*.028,.18],[outer-side*.02,.18],[outer-side*.02,.055]],24);
 for(let i=0;i<5;i++){const a=i/5*TAU,c=Math.cos(a),s=Math.sin(a);tube(steel,[[x+outer-side*.013,y+c*.07,z+s*.07],[x+outer-side*.003,y+c*.18,z+s*.18]],.027,6);tube(dark,[[x+outer+side*.018,y+c*.088,z+s*.088],[x+outer+side*.024,y+c*.088,z+s*.088]],.010,6);}
 if(damage)tube(steel,[[x,y,z],[x-.08,y-.09,z+.13],[x-.13,y-.21,z+.17]],.022,7);
}
function seat(m,x,z,{back=true,slump=0}={}){const g=stock(m,'upholstery'),dark=stock(m,'cavity');box(dark,[x,.41,z],[.48,.13,.52]);
 grid(g,6,8,(u,v)=>[x+(u-.5)*.46,.49+.034*Math.pow(Math.abs(u-.5)*2,3)-.02*Math.sin(v*Math.PI),z+(v-.5)*.47],{flip:true});
 if(back)grid(g,7,9,(u,v)=>[x+(u-.5)*(.45-.035*v),.49+v*.55-slump*Math.sin(v*Math.PI),z+.22+v*.09-slump*v],{flip:true});
}
export function wreckPanelPoint(variant,p){const estate=variant==='estate',shell=variant==='shell',red=variant==='saloon';let[x,y,z]=p;const front=Math.max(0,Math.min(1,(-z-.78)/1.35)),rear=Math.max(0,(z-1.1)/1.15),roof=Math.max(0,(y-.85)/.75);
  if(red){x+=.11*front*(.4+Math.sin(z*6.2+y*4));y-=front*.23+front*.055*Math.sin(x*12+z*7);z+=front*.45+front*.05*Math.cos(x*9);if(roof){x+=roof*.10;y-=roof*.15*Math.max(0,Math.sin(z*2.1+.8));}}
  if(estate){x+=rear*.12*Math.sin(z*3+y*6);y-=rear*.11;z-=rear*.23;if(roof)y-=roof*.08*Math.sin(z*3.5);}
  if(shell){x+=.065*Math.sin(z*4+y*9)*Math.max(front,rear);y-=.08*front+.06*Math.sin(z*3)*roof;z+=front*.25;}
  return[x,y,z];}
export function wreckLampAnchors(){const out={};for(const variant of['saloon','estate','shell']){const L=variant==='estate'?2.32:2.15;out['dp_wreck_'+variant]={};for(const end of['head','rear'])for(const side of[-1,1]){const p=end==='head'?[side*.635,.745,-L+.011]:[side*.665,.70,L+.009],centre=wreckPanelPoint(variant,p),x=unit(sub(wreckPanelPoint(variant,add(p,[.001,0,0])),centre)),yd=unit(sub(wreckPanelPoint(variant,add(p,[0,.001,0])),centre)),z=mul(unit(cross(x,yd)),end==='head'?1:-1),y=unit(cross(z,x)),shift=mul(z,-.008);out['dp_wreck_'+variant][end+(side<0?'Left':'Right')]={centre:add(centre,shift),x,y,z};}}return out;}
function wreck(variant){const estate=variant==='estate',shell=variant==='shell',red=variant==='saloon',m=mesh('dp_wreck_'+variant,{type:'manufactured-car',variant,construction:'Separate formed panels and real open apertures, cabin cavity, pillars, radiator and wheel sections.',bodyOpenings:true,wheels:4,periodClaim:'Generic late twentieth-century saloon/estate forms, no branded model claim.'}),paint=stock(m,red?'enamelRed':estate?'enamelIvory':'enamelAsh'),steel=stock(m,'steel'),rust=stock(m,'rust'),dark=stock(m,'cavity'),glass=stock(m,'glazing'),lights=stock(m,'reflector'),L=estate?2.32:2.15;
 const crush=p=>wreckPanelPoint(variant,p);
 const sheet=(g,cols,rows,fn,options)=>grid(g,cols,rows,(u,v)=>crush(fn(u,v)),options),bar=(g,points,r=.018,n=8)=>tube(g,points.map(crush),r,n);
 // Continuous stamped floor, inner sills and longitudinal frame members.
 closedPanel(dark,[[-.77,.35,-L+.25],[-.80,.35,L-.16],[.80,.35,L-.16],[.77,.35,-L+.25]].map(crush),.09);
 for(const side of[-1,1]){bar(steel,[[side*.57,.25,-L+.23],[side*.57,.25,L-.20]],.054,8);bar(rust,[[side*.82,.43,-L+.16],[side*.82,.43,L-.14]],.038,8);}
 // Formed lower body sides. Wheel arches are absent topology, not black decals.
 const wheelZ=[-1.31,1.28],arcR=.405;
 for(const side of[-1,1]){
  const zs=[-L,-1.77,-1.68,-1.55,-1.42,-1.31,-1.20,-1.07,-.94,-.85,.83,.92,1.05,1.17,1.28,1.39,1.52,1.65,1.73,L];
  for(let j=0;j<zs.length-1;j++){const z0=zs[j],z1=zs[j+1];sheet(paint,3,5,(u,v)=>{const z=mix(z0,z1,u),nearest=Math.min(...wheelZ.map(w=>Math.abs(z-w))),arch=nearest<arcR?.35+Math.sqrt(Math.max(0,arcR*arcR-nearest*nearest)):.34,y=mix(Math.max(.36,arch),.86,v),width=.81+.045*Math.sin(v*Math.PI)-.06*Math.pow(Math.abs(z)/L,4);return[side*width,y,z];},{flip:side>0});}
  // The rolled flange exposes millimetres of oxidised steel around each arch.
  for(const wz of wheelZ){const ps=[];for(let i=0;i<=18;i++){const a=Math.PI*i/18;ps.push([side*.852,.35+Math.sin(a)*arcR,wz-Math.cos(a)*arcR]);}bar(steel,ps,.012,7);}
  // Door skins with real shoulder crease; one torn opening on the burnt shell.
  const doors=estate?[[-.68,.26],[.27,1.05]]:[[-.69,.32],[.34,1.06]];
  for(const[k,[za,zb]]of doors.entries()){
   if(shell&&side<0&&k===0){bar(rust,[[side*.825,.46,za],[side*.86,.83,za],[side*.83,.86,zb],[side*.825,.45,zb]],.017,6);continue;}
   sheet(paint,8,5,(u,v)=>[side*(.833+.018*Math.sin(v*Math.PI)),mix(.44,.865,v),mix(za+.018,zb-.018,u)],{flip:side>0});
   for(const z of[za+.008,zb-.008])bar(dark,[[side*.855,.44,z],[side*.86,.84,z]],.005,5);
   bar(steel,[[side*.855,.824,zb-.18],[side*.855,.824,zb-.07]],.010,7);
  }
  bar(steel,[[side*.842,.87,-.75],[side*.842,.87,L-.47]],.010,7);
 }
 // Pressed hood and boot have double-curved stock and independent torn edges.
 doubleSkin(paint,15,13,(u,v)=>{const z=mix(-L,-.78,v),x=(u-.5)*1.60;return crush([x,.85+.055*Math.cos(x*1.5)+.045*Math.sin(v*Math.PI),z]);},.014);
 if(!estate)sheet(paint,12,8,(u,v)=>[(u-.5)*1.58,.86+.028*Math.sin(u*Math.PI)+.02*Math.sin(v*Math.PI),mix(1.04,L,v)],{flip:true});
 else sheet(paint,12,5,(u,v)=>[(u-.5)*1.56,mix(.48,.91,v),L-.035]);
 for(const side of[-1,1])bar(dark,[[side*.77,.88,-L+.13],[side*.77,.90,-.84]],.007,6);
 // Cabin apertures: roof, pillars, seals and separate broken glass polygons.
 const frontBottom=[[-.74,.90,-.78],[.74,.90,-.78]],frontTop=[[-.65,1.43,-.34],[.65,1.43,-.34]],rearZ=estate?1.71:.87,roofBack=estate?1.45:.55;
 if(!shell){doubleSkin(paint,14,16,(u,v)=>{const z=mix(-.34,roofBack,v),width=.65+.035*Math.sin(v*Math.PI),x=(u-.5)*2*width;return crush([x,1.45+.075*Math.cos((u-.5)*Math.PI)+.014*Math.sin(v*Math.PI*3),z]);},.022);}
 else{
  // A buckled roof skin remains peeled toward the right side. No invisible lid.
  doubleSkin(paint,11,9,(u,v)=>{const x=mix(.15,.72,u),z=mix(-.24,.64,v);return crush([x,1.39+.14*Math.sin(u*Math.PI)-.18*Math.sin(v*Math.PI),z]);},.022);
 }
 for(const side of[-1,1]){
  bar(paint,[[side*.74,.90,-.78],[side*.65,1.43,-.34]],.032,9);
  bar(steel,[[side*.726,.92,-.765],[side*.637,1.422,-.326]],.010,7);
  bar(paint,[[side*.67,1.44,roofBack],[side*.76,.89,rearZ]],.036,9);
  const bZ=estate?.34:.27;
  bar(paint,[[side*.82,.89,bZ],[side*.674,1.45,bZ]],.025,8);
  bar(dark,[[side*.753,.89,-.70],[side*.66,1.43,-.30],[side*.666,1.455,roofBack-.04],[side*.757,.89,rearZ-.05]],.014,7);
  // Intact glazing is opaque dark material with a thin real edge. The missing
  // central fragments expose seats, rear well and the opposite aperture.
  const sideWindows=[[[side*.736,.93,-.69],[side*.65,1.395,-.29],[side*.655,1.415,bZ-.045],[side*.78,.93,bZ-.045]],[[side*.78,.93,bZ+.045],[side*.657,1.415,bZ+.045],[side*.654,1.415,roofBack-.07],[side*.739,.93,rearZ-.095]]];
  for(const[k,p]of sideWindows.entries())if(!(shell&&k===0)){
   const broken=side<0?(red||shell):estate;
   if(!broken)quad(glass,...p.map(crush));
   else{const q=p.map(crush),centre=mul(add(q[0],q[2]),.5);triangles(glass,[q[0],q[1],add(mul(add(q[1],q[2]),.5),[0,-.09,.015]),add(centre,[0,-.15,.08])],[[0,1,2,3]]);triangles(glass,[q[2],q[3],add(mul(add(q[3],q[0]),.5),[0,.075,-.03])],[[0,1,2]]);}
  }
 }
 // Front glass retains perimeter shards; the centre is an open void.
 const fb=frontBottom.map(crush),ft=frontTop.map(crush);
 quad(glass,fb[0],ft[0],crush([-.42,1.42,-.34]),crush([-.29,.99,-.70]));
 quad(glass,crush([.44,1.42,-.34]),ft[1],fb[1],crush([.53,.94,-.75]));
 bar(dark,[frontBottom[0],frontTop[0],frontTop[1],frontBottom[1],frontBottom[0]],.018,8);
 const backBottom=[[-.75,.91,rearZ],[.75,.91,rearZ]],backTop=[[-.65,1.43,roofBack],[.65,1.43,roofBack]];
 if(estate||!shell)quad(glass,...[backBottom[0],backBottom[1],backTop[1],backTop[0]].map(crush));
 bar(dark,[backBottom[0],backTop[0],backTop[1],backBottom[1],backBottom[0]],.016,8);
 seat(m,-.39,-.28,{slump:red?.09:0});seat(m,.39,-.28,{slump:shell?.18:0});seat(m,0,.64,{slump:shell?.1:0});
 box(dark,crush([0,.84,-.67]),[1.35,.12,.22]);
 const wheelCentre=crush([.37,1.02,-.54]),wheelPoints=[];for(let i=0;i<=24;i++){const a=i/24*TAU;wheelPoints.push([wheelCentre[0]+Math.cos(a)*.155,wheelCentre[1]+Math.sin(a)*.155,wheelCentre[2]+.045*Math.sin(a)]);}tube(dark,wheelPoints,.018,7);
 // Real grille, radiator fins, bumper returns and corner lamps.
 const frontZ=-L+.035;sheet(dark,10,4,(u,v)=>[mix(-.68,.68,u),mix(.45,.72,v),frontZ],{flip:true});
 for(let i=0;i<9;i++)bar(steel,[[-.65+i*.16,.46,frontZ-.01],[-.65+i*.16,.70,frontZ-.01]],.009,6);
 for(const side of[-1,1]){
  sheet(lights,7,5,(u,v)=>[side*(.52+u*.23),.69+v*.11,frontZ-.024],{flip:side>0});
  sheet(steel,7,5,(u,v)=>[side*(.51+u*.25),.68+v*.13,frontZ+.006],{flip:side>0});
  bar(steel,[[side*.79,.47,-L+.15],[side*.86,.45,-L+.02],[side*.51,.45,-L-.025]],.035,8);
  bar(rust,[[side*.76,.45,L-.03],[side*.79,.44,L+.02],[side*.30,.44,L+.035]],.028,8);
  sheet(stock(m,'enamelRed'),3,2,(u,v)=>[side*(.58+u*.17),.64+v*.12,L+.009],{flip:side<0});
 }
 sheet(steel,5,2,(u,v)=>[mix(-.21,.21,u),mix(.53,.63,v),L+.022]);
 for(const side of[-1,1])for(const wz of wheelZ)wheel(m,[side*.80,.35,wz],side,shell?1:0);
 // The exposed engine is legible behind the folded bonnet, not a flat decal.
 if(red||shell){for(let j=0;j<4;j++)box(rust,crush([-.18+j*.13,.69,-1.15]),[.075,.13,.40]);bar(steel,[[-.30,.73,-1.2],[.10,.80,-1.05],[.30,.71,-1.10]],.025,8);}
 if(estate){for(const side of[-1,1])bar(steel,[[side*.53,1.55,-.18],[side*.53,1.55,1.28]],.018,8);}
 return finish(m);
}
function looseWheel(){const m=mesh('dp_detached_wheel',{type:'manufactured-wheel',torusSection:true});wheel(m,[0,.35,0],1,1);return finish(m);}
function tornSheet(){const m=mesh('dp_torn_panel',{type:'torn-pressed-steel',thicknessMetres:.018}),g=stock(m,'enamelIvory'),r=stock(m,'rust');
 grid(g,13,9,(u,v)=>[(u-.5)*.93,.08+.14*Math.sin(v*Math.PI)+.06*Math.sin(u*Math.PI*3)*v,(v-.5)*.78],{flip:true});
 tube(r,[[-.46,.08,-.39],[-.26,.10,-.40],[-.19,.14,-.45],[.02,.11,-.39],[.20,.10,-.43],[.46,.08,-.39]],.012,6);
 return finish(m);}
function cliffMass(){const m=mesh('dp_cliff_mass',{type:'fractured-cliff',verticalDropMetres:32,localContract:'X=0 is the road-side crest; all mass recedes into +X. Mount at outside-edge positive lateral, or rotate PI to face the opposite verge.'}),g=stock(m,'cliff');
 // A deep fractured retaining ledge descends out of headlamp range. Top and
 // side are continuous surfaces; rhythm follows stratification, not noise.
 const rows=22,cols=28;
 grid(g,cols,rows,(u,v)=>{const z=(u-.5)*32,y=-32*v,ridge=Math.sin(z*.24+v*3)*.38+Math.sin(z*.83-v*4)*.19,bench=Math.floor(v*6)*.44;return[.25+v*4.8+bench+ridge*Math.sin(v*Math.PI),y,z];},{flip:true,uvScale:[8,8]});
 grid(g,cols,6,(u,v)=>{const z=(u-.5)*32,x=.25+v*12;return[x,-.08-v*1.6+.08*Math.sin(z*.52)*v,z];},{uvScale:[8,3]});
 for(const z of[-16,16])quad(g,[.25,0,z],[12.25,-1.6,z],[12.25,-32,z],[7.7,-32,z]);
 return finish(m);}
function cliffSupport(){const m=mesh('dp_cliff_shelf',{type:'broken-road-ledge',minThicknessMetres:.45}),g=stock(m,'concrete'),a=stock(m,'asphalt'),r=stock(m,'steel');
 const zN=24,xN=8;
 grid(a,xN,zN,(u,v)=>[(u-.5)*5.4,-.03+.035*Math.sin(v*12)*Math.pow(Math.abs(u-.5)*2,4),(v-.5)*32],{flip:true,uvScale:[2.7,16]});
 for(const side of[-1,1])grid(g,zN,5,(u,v)=>[side*(2.7+.09*Math.sin(u*20)*v),-.08-v*(.57+.18*Math.sin(u*14)),(u-.5)*32],{flip:side<0,uvScale:[16,.5]});
 for(let i=0;i<6;i++){const z=-14+i*5.25;tube(r,[[2.70,-.20,z],[3.06,-.22,z+.08],[3.30,-.49,z+.04]],.013,6);}
 return finish(m);
}
function roadFold(){const m=mesh('dp_road_fold',{type:'impossible-continuation',drivable:false,widthMetres:7.8,construction:'Continuous asphalt over a thick concrete section, worn lane marks, exposed edge bars. Curves through vertical and turns back above itself.'}),g=stock(m,'concrete'),a=stock(m,'asphalt'),mark=stock(m,'marking'),r=stock(m,'steel'),n=64;
 function curve(v){const theta=v*Math.PI*1.58,rad=22+5*Math.sin(v*Math.PI),z=-Math.sin(theta)*rad,y=rad*(1-Math.cos(theta)),x=3.5*Math.sin(v*Math.PI);return{x,y,z,theta};}
 function surface(u,v,bottom=false){const q=curve(v),x=(u-.5)*7.8;return[q.x+x,q.y-(bottom?.58:0)*Math.cos(q.theta),q.z+(bottom?.58:0)*Math.sin(q.theta)];}
 grid(a,9,n,(u,v)=>surface(u,v),{uvScale:[3.9,35]});
 grid(g,9,n,(u,v)=>surface(u,v,true),{flip:true,uvScale:[3.9,35]});
 for(const side of[0,1])grid(g,n,2,(u,v)=>{const top=surface(side,u),bottom=surface(side,u,true);return top.map((p,i)=>mix(p,bottom[i],v));},{flip:side===1,uvScale:[35,.3]});
 for(let j=0;j<12;j++){const va=(j+.1)/12,vb=(j+.67)/12;grid(mark,1,4,(u,v)=>{const p=surface(.5+(u-.5)*.022,mix(va,vb,v));return[p[0],p[1]+.008*Math.cos(curve(mix(va,vb,v)).theta),p[2]-.008*Math.sin(curve(mix(va,vb,v)).theta)];});}
 for(const side of[-1,1])for(let j=0;j<9;j++){const v=.06+j*.105,p=surface(side<0?0:1,v),q=curve(v);tube(r,[[p[0],p[1]-.16*Math.cos(q.theta),p[2]+.16*Math.sin(q.theta)],[p[0]+side*.23,p[1]-.19*Math.cos(q.theta),p[2]+.19*Math.sin(q.theta)],[p[0]+side*.33,p[1]-.41*Math.cos(q.theta),p[2]+.41*Math.sin(q.theta)]],.013,6);}
 return finish(m);
}
function pylon(){const m=mesh('dp_whiteout_pylon',{type:'severed-highway-sentinel',heightMetres:8.9}),g=stock(m,'concrete'),r=stock(m,'rust'),snow=stock(m,'snow');
 // Broken portal legs carry the same road section above the whiteout. Their
 // interrupted flanges prevent the silhouette reading as a building facade.
 for(const side of[-1,1]){
  const x=side*4.7;
  box(g,[x,3.8,0],[.62,7.6,.82]);box(g,[x,.16,0],[1.20,.32,1.35]);
  closedPanel(g,[[x-.47,7.1,-.40],[x+.47,7.1,-.40],[x+.47,8.5,.09],[x-.47,8.5,.09]],.22);
  tube(r,[[x-.12,8.2,.05],[x-.14,8.82,.02],[x-.19,8.91,-.07]],.018,7);
  tube(r,[[x+.12,8.2,.05],[x+.11,8.65,.03],[x+.23,8.71,.11]],.018,7);
  grid(snow,6,4,(u,v)=>[x+mix(-.61,.61,u),.33+.08*Math.sin(u*Math.PI)*Math.sin(v*Math.PI),mix(-.69,.69,v)],{flip:true});
 }
 box(g,[0,6.91,0],[8.9,.44,.78]);
 return finish(m);
}
function snowPaving(){const m=mesh('dp_snow_paving',{type:'physical-packed-snow-road-slab',widthMetres:6.5,lengthMetres:1,substrateBottomMetres:-.09,surfaceRiseMetres:[.005,.011],drivable:true,placementContract:'Exact existing drive_plain_paving X/Z bounds, opaque retained substrate; use root road width and grade transforms.'}),snow=stock(m,'packedSnow'),asphalt=stock(m,'asphalt');
 grid(snow,20,8,(u,v)=>[(u-.5)*6.5,.005+.006*Math.pow(Math.sin(u*Math.PI*3.5)*Math.sin(v*Math.PI),2),(v-.5)],{flip:true,uvScale:[6.5/1.4,1/1.4]});
 for(const side of[-1,1])quad(asphalt,[side*3.25,.005,-.5],[side*3.25,-.09,-.5],[side*3.25,-.09,.5],[side*3.25,.005,.5]);
 for(const z of[-.5,.5])quad(asphalt,[-3.25,.005,z],[3.25,.005,z],[3.25,-.09,z],[-3.25,-.09,z]);
 quad(asphalt,[-3.25,-.09,-.5],[3.25,-.09,-.5],[3.25,-.09,.5],[-3.25,-.09,.5]);
 return finish(m);
}
function brokenLamp(){const m=mesh('dp_wreck_broken_lamp',{type:'powered-broken-car-lamp-inset',mount:'Generated deformed head/rear lens anchors; local -Z is outward.',emitterFaceLocalZ:-.006}),rim=stock(m,'steel'),rubber=stock(m,'rubber'),glow=stock(m,'headlampOn');box(rubber,[0,0,.014],[.224,.106,.028]);box(rim,[0,0,.009],[.210,.096,.024]);
 // A dense opal remnant with broad moulded flutes, retained inside the real
 // damaged assembly. Only selected car placements receive this powered inset.
 grid(glow,12,5,(u,v)=>[(u-.5)*.192,(v-.5)*.080,-.006+.0015*Math.cos(u*Math.PI*12)],{flip:true});
 return finish(m);}
export function buildPredicamentGeometry(){return[wreck('saloon'),wreck('estate'),wreck('shell'),looseWheel(),tornSheet(),cliffMass(),cliffSupport(),roadFold(),pylon(),snowPaving(),brokenLamp()];}
