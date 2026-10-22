// Original metre-space construction. No scanned material or historical object
// is claimed. Shared church circulation is imported unchanged by the builder.
import {CHURCH,CHURCH_TURRETS,CHURCH_BELFRY as B} from '../../src/data/st-brendans.js';
import {ST_BRENDANS_EMBRASURES} from '../../src/data/st-brendans-treatment.js';
import {ELLERY_BELLS} from '../../src/data/bell-tower.js';
import {createTwoTierBellFrameLayout} from '../../src/data/bell-tower-layout.js';

export const BRENDAN_MATERIALS=Object.freeze({
 stone:{name:'Brendan dressed limestone',color:[.37,.395,.38,1],roughness:.91},
 stonePale:{name:'Brendan cut limestone edges',color:[.48,.49,.445,1],roughness:.86},
 stoneDark:{name:'Brendan sheltered stone',color:[.225,.25,.24,1],roughness:.96},
 floor0:{name:'Brendan slate flagstone A',color:[.30,.32,.30,1],roughness:.87},
 floor1:{name:'Brendan slate flagstone B',color:[.325,.335,.315,1],roughness:.89},
 floor2:{name:'Brendan slate flagstone C',color:[.345,.355,.33,1],roughness:.86},
 oak:{name:'Brendan blackened oak',color:[.105,.079,.051,1],roughness:.79},
 oakWear:{name:'Brendan handled oak',color:[.235,.16,.085,1],roughness:.56},
 oakEnd:{name:'Brendan exposed oak endgrain',color:[.16,.125,.08,1],roughness:.91},
 iron:{name:'Brendan forged iron',color:[.065,.073,.069,1],metallic:.55,roughness:.65},
 ironWear:{name:'Brendan bearing metal',color:[.16,.17,.155,1],metallic:.72,roughness:.37},
 bronze:{name:'Brendan old cast bell bronze',color:[.285,.245,.14,1],metallic:.76,roughness:.62},
 bronzeLip:{name:'Brendan rubbed soundbow',color:[.46,.345,.16,1],metallic:.82,roughness:.42},
 bronzeShade:{name:'Brendan sheltered bell bronze',color:[.14,.155,.095,1],metallic:.67,roughness:.79},
 dust:{name:'Brendan compressed dust',color:[.36,.34,.285,1],roughness:.99},
 absence:{name:'Brendan removed object footprint',color:[.43,.435,.38,1],roughness:.89},
 glass:{name:'Brendan cold obscured glazing',color:[.13,.175,.18,1],roughness:.42,metallic:.04,emissive:[.018,.032,.038]},
 slate:{name:'Brendan quiet roof slate',color:[.072,.085,.09,1],roughness:.76},
 warm:{name:'Brendan maintenance glass',color:[.4,.315,.17,1],roughness:.54,emissive:[.32,.23,.10]},
});
const unit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)},sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function geometry(){return{positions:[],normals:[],indices:[]}}
function tri(g,a,b,c,want=null,ns=null){
 let n=unit(cross(sub(b,a),sub(c,a)));
 if(want&&n.reduce((s,v,k)=>s+v*want[k],0)<0){[b,c]=[c,b];if(ns)ns=[ns[0],ns[2],ns[1]];n=n.map(v=>-v)}
 const at=g.positions.length/3;for(const [i,p]of[a,b,c].entries()){g.positions.push(...p);g.normals.push(...(ns?.[i]||n))}g.indices.push(at,at+1,at+2);
}
function quad(g,a,b,c,d,want=null){tri(g,a,b,c,want);tri(g,a,c,d,want)}
function append(g,b){const at=g.positions.length/3;g.positions.push(...b.positions);g.normals.push(...b.normals);g.indices.push(...b.indices.map(i=>i+at))}
export function box(g,c,s,yaw=0){
 const cs=Math.cos(yaw),sn=Math.sin(yaw),p=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(v=>{const x=v[0]*s[0]/2,z=v[2]*s[2]/2;return[c[0]+x*cs-z*sn,c[1]+v[1]*s[1]/2,c[2]+x*sn+z*cs]});
 for(const f of[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]])quad(g,...f.map(i=>p[i]));
}
function beam(g,a,b,w,d=w){
 const y=unit(sub(b,a)),x=unit(cross(y,Math.abs(y[1])<.9?[0,1,0]:[1,0,0])),z=cross(x,y),c=a.map((v,k)=>(v+b[k])/2),len=Math.hypot(...sub(b,a));
 const q=geometry();box(q,[0,0,0],[w,len,d]);for(let i=0;i<q.positions.length;i+=3){const p=q.positions.slice(i,i+3),n=q.normals.slice(i,i+3);for(let k=0;k<3;k++){q.positions[i+k]=c[k]+p[0]*x[k]+p[1]*y[k]+p[2]*z[k];q.normals[i+k]=n[0]*x[k]+n[1]*y[k]+n[2]*z[k]}}append(g,q);
}
// Smooth radial normals, hard profile corners only where the actual casting
// changes section. The inner skin and soundbow are real thickness, not a cap.
export function lathe(g,profile,center=[0,0,0],segments=32,axis='y'){
 const area=profile.reduce((sum,p,i)=>{const q=profile[(i+1)%profile.length];return sum+p[0]*q[1]-q[0]*p[1]},0),sign=area>0?-1:1;
 const pt=(r,h,a)=>axis==='z'?[center[0]+r*Math.cos(a),center[1]+r*Math.sin(a),center[2]+h]:[center[0]+r*Math.cos(a),center[1]+h,center[2]+r*Math.sin(a)];
 const normal=(dr,dh,a)=>axis==='z'?unit([-dh*Math.cos(a)*sign,-dh*Math.sin(a)*sign,dr*sign]):unit([-dh*Math.cos(a)*sign,dr*sign,-dh*Math.sin(a)*sign]);
 for(let j=0;j<profile.length-1;j++){const [r,h]=profile[j],[s,k]=profile[j+1],dr=s-r,dh=k-h;if(Math.abs(dr)+Math.abs(dh)<1e-8)continue;
  for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,pa=pt(r,h,a),pb=pt(r,h,b),pc=pt(s,k,b),pd=pt(s,k,a),na=normal(dr,dh,a),nb=normal(dr,dh,b),nm=normal(dr,dh,(a+b)/2);
   if(r>1e-8)tri(g,pa,pb,pc,nm,[na,nb,nb]);if(s>1e-8)tri(g,pa,pc,pd,nm,[na,nb,na]);
  }
 }
}
function ring(g,c,r,thickness,depth=.04,segments=32,axis='z'){
 lathe(g,[[r-thickness/2,-depth/2],[r+thickness/2,-depth/2],[r+thickness/2,depth/2],[r-thickness/2,depth/2],[r-thickness/2,-depth/2]],c,segments,axis);
}
function bearingRing(g,c,scale=1){
 ring(g,c,.082*scale,.052*scale,.13*scale,16,'z');
}
function ellipsoid(g,c,r,columns=16,rows=8){
 const pt=(i,j)=>{const a=i/columns*Math.PI*2,b=(j/rows-.5)*Math.PI;return[c[0]+r[0]*Math.cos(a)*Math.cos(b),c[1]+r[1]*Math.sin(b),c[2]+r[2]*Math.sin(a)*Math.cos(b)]};
 for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const p=[pt(i,j),pt(i+1,j),pt(i+1,j+1),pt(i,j+1)],ns=p.map(p=>unit(p.map((v,k)=>(v-c[k])/(r[k]*r[k])))),want=unit(p[0].map((v,k)=>v-c[k]));if(j>0)tri(g,p[0],p[1],p[2],want,ns.slice(0,3));if(j<rows-1)tri(g,p[0],p[2],p[3],want,[ns[0],ns[2],ns[3]])}
}
function arch(g,c,r,rise,thickness=.045,segments=18){
 // Pointed two-centre profile, local X/Y, plane Z. Finite depth gives a
 // shadowed reveal instead of infinitely thin decorative strokes.
 const pts=[];for(let i=0;i<=segments;i++){const t=i/segments,x=-r+2*r*t,y=rise*Math.pow(Math.sin(Math.PI*t),.72);pts.push([c[0]+x,c[1]+y,c[2]])}for(let i=0;i<pts.length-1;i++)beam(g,pts[i],pts[i+1],thickness,thickness*1.3);
}
function octagonalPlinth(g,r,y,h){lathe(g,[[0,y-h/2],[r,y-h/2],[r,y+h/2],[0,y+h/2]],[0,0,0],8)}
function groups(){return new Map()}
function mat(m,name){if(!m.has(name))m.set(name,geometry());return m.get(name)}
function turned(g,c,r,h,n=12){lathe(g,[[0,-h/2],[r,-h/2],[r,h/2],[0,h/2]],c,n)}

function pew(choir=false){
 const m=groups(),oak=mat(m,'oak'),wear=mat(m,'oakWear'),end=mat(m,'oakEnd'),iron=mat(m,'iron'),dust=mat(m,'dust');
 const top=choir?1.68:1.20;
 // Traditional boarded construction, deep stiles and framed panels. Envelope
 // stays within the existing pew's 2.70 x .67m contact footprint.
 for(const x of[-1.25,1.25]){
  box(oak,[x,.52,.01],[.115,1.04,.59]);box(oak,[x,1.10,.21],[.13,.24,.27]);
  ellipsoid(wear,[x,top-.08,.21],[.105,.115,.105],12,6);
  box(end,[x,.065,.015],[.18,.13,.61]);
  for(const z of[-.23,.25])box(iron,[x,.10,z],[.14,.04,.08]);
 }
 for(const z of[-.23,-.035,.16])box(oak,[0,.475,z],[2.45,.105,.178]);
 box(oak,[0,.84,.27],[2.48,.62,.085]);box(wear,[0,1.17,.27],[2.5,.075,.105]);
 for(const x of[-.84,-.28,.28,.84]){
  box(end,[x,.85,.217],[.48,.47,.018]);
  for(const a of[-1,1])box(oak,[x+a*.245,.85,.197],[.029,.53,.03]);
  box(oak,[x,1.10,.197],[.50,.035,.03]);box(oak,[x,.60,.197],[.50,.035,.03]);
 }
 box(oak,[0,.18,-.235],[2.38,.10,.13]);box(dust,[0,.235,-.235],[2.28,.012,.11]);
 for(const x of[-1.23,1.23]){box(wear,[x,.69,-.03],[.14,.055,.48]);box(iron,[x,.29,-.23],[.022,.31,.025]);}
 // A narrow numbering plate is retained; no new readable clue or inscription.
 box(mat(m,'bronzeShade'),[-1.325,.81,-.11],[.028,.08,.13]);
 if(choir){
  box(oak,[0,1.36,.29],[2.50,.64,.085]);
  for(const x of[-.83,0,.83]){
   box(mat(m,'stoneDark'),[x,1.37,.237],[.68,.38,.012]);
   arch(oak,[x,1.35,.20],.35,.26,.045,12);
   for(const dx of[-.355,.355])box(oak,[x+dx,1.19,.20],[.05,.32,.07]);
   // The lifted seat leaves a squat worn misericord below, not a skull.
   ellipsoid(wear,[x,.39,-.19],[.16,.085,.10],12,6);
   for(const s of[-1,1])ellipsoid(oak,[x+s*.15,.42,-.16],[.105,.05,.065],10,5);
  }
  box(wear,[0,1.66,.29],[2.62,.065,.12]);
 }return m;
}
function altar(){
 const m=groups(),s=mat(m,'stone'),p=mat(m,'stonePale'),d=mat(m,'stoneDark');
 box(s,[0,.145,0],[1.66,.29,.67]);for(const x of[-.60,.60]){box(s,[x,.47,0],[.33,.57,.57]);box(p,[x,.72,0],[.39,.075,.61]);}
 box(s,[0,.805,0],[1.8,.19,.78]);box(p,[0,.914,0],[1.76,.028,.74]);
 box(d,[0,.47,.035],[.83,.48,.33]);
 // Clean square outlines and four pale vessel feet: the removed linen and
 // objects described by the existing inspect text have left physical traces.
 for(const x of[-.55,.55])for(const z of[-.20,.20])box(mat(m,'absence'),[x,.931,z],[.11,.005,.10]);
 for(const x of[-.83,.83])box(mat(m,'dust'),[x,.932,0],[.05,.005,.63]);
 return m;
}
function font(){
 const m=groups(),s=mat(m,'stone'),p=mat(m,'stonePale'),dark=mat(m,'stoneDark');
 octagonalPlinth(s,.42,.10,.20);octagonalPlinth(p,.35,.225,.07);
 lathe(s,[[.19,.25],[.23,.32],[.18,.39],[.18,.77],[.25,.83],[.36,.87]],[0,0,0],8);
 lathe(s,[[.34,.82],[.50,.91],[.50,1.16],[.43,1.18],[.37,1.105],[.27,.965],[0,.965]],[0,0,0],8);
 ring(p,[0,1.15,0],.465,.06,.06,8,'y');
 // Inset floor of the dry bowl and actual plaster grit, never a black cap at
 // the lip: looking down explains the receptacle.
 lathe(dark,[[0,.972],[.26,.972],[.26,.968],[0,.968]],[0,0,0],8);
 for(let i=0;i<7;i++){const a=i*2.399,r=.05+(i%3)*.045;box(p,[Math.cos(a)*r,.977,Math.sin(a)*r],[.024+(i%2)*.013,.009,.017],a)}
 return m;
}
function monument(){
 const m=groups(),s=mat(m,'stone'),p=mat(m,'stonePale'),d=mat(m,'stoneDark');
 box(s,[0,1.15,0],[1.20,2.30,.25]);box(p,[0,.18,-.06],[1.38,.20,.40]);box(p,[0,.34,-.045],[1.26,.085,.34]);
 box(d,[0,1.10,-.143],[.76,1.32,.035]);box(s,[0,1.10,-.17],[.66,1.22,.026]);
 for(const x of[-.49,.49]){turned(p,[x,1.12,-.175],.072,1.45,12);box(p,[x,1.86,-.175],[.20,.12,.20]);}
 arch(p,[0,1.77,-.19],.53,.48,.09,20);box(p,[0,2.28,-.03],[1.22,.11,.32]);
 // Names and dates were deliberately abraded in existing prose. The shallow
 // uneven swath records that loss without inventing new readable text.
 for(let i=0;i<6;i++)box(mat(m,'absence'),[(i%2)*.045-.02,.87+i*.07,-.189],[.40+(i%3)*.025,.035,.009],.01*(i%3-1));
 return m;
}
function tomb(){
 const m=groups(),s=mat(m,'stone'),p=mat(m,'stonePale'),dark=mat(m,'stoneDark');
 box(s,[0,.32,0],[2.0,.64,.78]);box(p,[0,.07,0],[2.10,.14,.85]);box(p,[0,.70,0],[2.08,.14,.85]);box(s,[0,.79,0],[1.96,.08,.77]);
 for(const x of[-.70,0,.70])for(const side of[-1,1]){
  box(dark,[x,.37,side*.399],[.49,.36,.012]);arch(p,[x,.40,side*.412],.215,.15,.032,10);
  for(const dx of[-.235,.235])box(p,[x+dx,.31,side*.413],[.035,.29,.035]);
 }
 // A carved recumbent clothed figure, with neck, crossed hands and feet. It
 // remains a stone memorial; no corpse, apparition or extra encounter.
 ellipsoid(s,[-.10,.88,0],[.64,.115,.22],24,8);ellipsoid(p,[-.73,.90,0],[.15,.13,.135],16,8);
 for(const z of[-.075,.075])ellipsoid(s,[.63,.855,z],[.15,.065,.06],12,6);
 for(const z of[-.11,.11]){beam(p,[-.46,.925,z],[-.08,.99,0],.075,.06);ellipsoid(p,[-.10,.99,z*.18],[.09,.034,.045],12,6)}
 return m;
}
function pulpitum(broken=false){
 const m=groups(),s=mat(m,'stone'),p=mat(m,'stonePale'),d=mat(m,'stoneDark');
 for(const side of(broken?[1]:[-1,1])){
  const center=broken?0:side*2.90;
  box(s,[center,.22,0],[2.2,.44,.35]);box(p,[center,.45,-.01],[2.24,.09,.39]);
  box(s,[center,2.38,0],[2.22,.18,.36]);box(p,[center,2.52,0],[2.30,.10,.42]);
  for(let j=0;j<4;j++){
   const x=center-.99+j*.66;turned(s,[x,1.38,0],.09,1.78,10);box(p,[x,.54,0],[.19,.08,.32]);box(p,[x,2.22,0],[.20,.12,.31]);
  }
  for(let j=0;j<3;j++){
   const x=center-.66+j*.66;
   // Actual pierced light openings: the tracery is a deep stone frame.
   arch(s,[x,1.69,0],.255,.42,.075,14);
   arch(p,[x,1.69,-.13],.255,.42,.035,14);
   ring(s,[x,2.22,0],.135,.036,.19,16,'z');
  }
  for(const x of[center-1.06,center+1.06]){box(s,[x,1.34,0],[.15,1.88,.35]);box(p,[x,2.62,0],[.22,.10,.37]);}
  if(broken){for(let i=0;i<4;i++){const x=center+side*(.60+i*.11);box(d,[x,1.86-i*.17,-.18],[.10,.13,.028],i*.19)}}
 }
 if(broken){
  // The runtime already uses sx=.5 for each fallen wing. Author one wing at
  // twice its final horizontal width, not a shrunken duplicate whole screen.
  for(const g of m.values())for(let i=0;i<g.positions.length;i+=3)g.positions[i]*=2;
  for(const g of m.values())for(let i=0;i<g.normals.length;i+=3){const n=unit([g.normals[i]/2,g.normals[i+1],g.normals[i+2]]);g.normals.splice(i,3,...n)}
 }return m;
}
function bell(id){
 const m=groups(),r=.45+id*.035,b=mat(m,'bronze'),lip=mat(m,'bronzeLip'),shade=mat(m,'bronzeShade'),iron=mat(m,'iron'),oak=mat(m,'oak');
 const profile=[[0,-.15],[r*.19,-.15],[r*.31,-.21],[r*.43,-.29],[r*.49,-.39],[r*.52,-.51],[r*.58,-.66],[r*.72,-.81],[r*.91,-.92],[r*1.04,-.965],[r*1.08,-1.02],[r*1.06,-1.055],[r*.93,-1.055],[r*.86,-.97],[r*.69,-.86],[r*.53,-.70],[r*.43,-.50],[r*.37,-.36],[r*.27,-.28],[0,-.28]];
 lathe(b,profile,[0,0,0],32);
 for(const [h,rr,t]of[[-.35,.474,.014],[-.42,.502,.01],[-.855,.80,.014],[-.89,.866,.012]])ring(shade,[0,h,0],r*rr,t,.016,24,'y');
 ring(lip,[0,-1.025,0],r*1.034,.055,.045,24,'y');
 // A worn internal strike patch on each soundbow, physically inset; no black
 // face or solid mouth conceals the cast cavity when seen from below.
 for(const sign of[-1,1])ellipsoid(shade,[sign*r*.87,-.94,0],[.028,.04,r*.16],12,6);
 box(oak,[0,.04,0],[.26,.18,.92]);for(const z of[-.35,.35]){box(iron,[0,.04,z],[.30,.225,.055]);for(const x of[-.16,.16])box(mat(m,'ironWear'),[x,.075,z],[.04,.035,.075]);}
 // The unchanged runtime roll is around local Z. Both gudgeons therefore run
 // on Z through the exact origin, not on the old approximate X/Y blocks.
 for(const z of[-.52,.52])lathe(mat(m,'ironWear'),[[0,z-.12],[.05,z-.12],[.05,z+.12],[0,z+.12]],[0,0,0],16,'z');
 // Six canons join the crown to the headstock and leave actual air between.
 for(let i=0;i<6;i++){const a=i*Math.PI/3,xx=Math.cos(a)*r*.17,zz=Math.sin(a)*r*.17;beam(b,[xx,-.18,zz],[xx,-.025,zz],.045,.045)}
 return m;
}
function wheel(){
 const m=groups(),o=mat(m,'oakEnd'),w=mat(m,'oakWear'),iron=mat(m,'iron');
 // Grooved double sole, eight mortised spokes, hub flanges and bindings. Plane
 // XY and zero roll pivot are unchanged; sole sits outside the Z gudgeon.
 for(const z of[.60,.68])ring(o,[0,0,z],1.02,.070,.035,24,'z');
 ring(w,[0,0,.64],1.015,.040,.055,24,'z');
 for(let i=0;i<8;i++){const a=i*Math.PI/4;beam(o,[Math.cos(a)*.12,Math.sin(a)*.12,.64],[Math.cos(a)*.98,Math.sin(a)*.98,.64],.055,.055);box(iron,[Math.cos(a)*1.02,Math.sin(a)*1.02,.64],[.10,.10,.12],a);}
 lathe(iron,[[0,.56],[.14,.56],[.14,.72],[0,.72]],[0,0,0],16,'z');ring(mat(m,'ironWear'),[0,0,.725],.10,.045,.025,16,'z');
 return m;
}
function clapper(){
 const m=groups(),iron=mat(m,'iron'),wear=mat(m,'ironWear');
 ring(iron,[0,0,0],.070,.028,.08,16,'z');
 beam(iron,[0,-.07,0],[0,-.84,0],.052,.058);
 lathe(iron,[[0,-.80],[.065,-.80],[.105,-.84],[.12,-.90],[.105,-.96],[.065,-1.01],[0,-1.01]],[0,0,0],20);
 ring(wear,[0,-.90,0],.117,.013,.055,20,'y');return m;
}
function stay(){const m=groups(),o=mat(m,'oakEnd');box(o,[0,.60,.64],[.075,1.24,.075]);box(o,[0,1.20,.64],[.18,.14,.14]);box(mat(m,'iron'),[0,.08,.64],[.115,.20,.105]);return m}
function slider(){const m=groups(),i=mat(m,'iron');box(i,[0,1.34,.66],[.92,.055,.055]);for(const x of[-.46,.46]){box(i,[x,1.34,.66],[.12,.12,.18]);box(mat(m,'ironWear'),[x,1.407,.66],[.15,.024,.20]);}return m}

function churchConstruction(){
 const m=groups(),s=mat(m,'stone'),p=mat(m,'stonePale'),o=mat(m,'oak'),end=mat(m,'oakEnd'),iron=mat(m,'iron');
 const local=([x,y,z])=>[x-16,y,z-70],bx=(material,c,size)=>box(mat(m,material),local(c),size);
 // Jointed large flags: broad value fields and 12mm joints remain stable at
 // walking distance. Only upward faces are needed over the existing solid floor.
 const visited=new Set();for(const room of CHURCH.rooms)for(let z=room.y0;z<=room.y1;z++)for(let x=room.x0;x<=room.x1;x++){
  const key=`${x},${z}`;if(visited.has(key))continue;visited.add(key);
  if(CHURCH_TURRETS.some(t=>Math.min(t.fromH,t.toH)===0&&Math.hypot(x+.5-t.center.x,z+.5-t.center.y)<t.outerRadius+.15))continue;
  const g=mat(m,`floor${(x*7+z*11)%3}`),y=.012;
  quad(g,local([x+.012,y,z+.012]),local([x+.988,y,z+.012]),local([x+.988,y,z+.988]),local([x+.012,y,z+.988]),[0,1,0]);
 }
 // Removal marks are localized to existing furniture footprints. No every-
 // surface grunge: the main aisle is the abrasion route, not a puzzle trail.
 for(const z of[78,80.3])for(const x of[13,19])for(const dz of[-.60,.60])bx('absence',[x,.017,z+dz],[.38,.006,.21]);
 for(const z of[62.3,65.2,68.1])for(const x of[13.6,18.4])bx('dust',[x,.018,z+.32],[2.12,.006,.14]);
 // Existing bell-frame envelope, now mortised structural timbers. Every new
 // member remains within the protected pit; no perimeter route or hatch filled.
 for(const x of[B.frame.x0,B.frame.x1])for(const z of[B.frame.y0,B.frame.y1]){
  bx('oak',[x,12.40,z],[.29,4.40,.29]);bx('oakEnd',[x,10.27,z],[.36,.14,.36]);
  for(const h of[10.55,12.25,14.40]){
   for(const side of[-1,1])bx('iron',[x+side*.153,h,z],[.028,.36,.255]);
   for(const dz of[-.08,.08])for(const dh of[-.10,.10])bx('ironWear',[x+.173,h+dh,z+dz],[.025,.043,.043]);
  }
 }
 for(const h of[12.25,14.40]){
  for(const x of[14.9,17.1])bx('oak',[x,h-.27,73],[.27,.25,3.6]);
  for(const z of[71.2,74.8])bx('oak',[16,h-.27,z],[4.4,.25,.30]);
 }
 for(const bell of createTwoTierBellFrameLayout(ELLERY_BELLS,{centerX:16,centerZ:73,lowerFloorY:10.2,upperPivotY:14.4})){
  for(const side of[-1,1]){
   const scale=bell.visualScale,x=bell.pivot.x,z=bell.pivot.z+side*.56*scale,y=bell.pivot.y;
   bx('iron',[x,y-.14,z],[.22,.10,.29]);bx('iron',[x,y-.0875,z],[.16,.035,.25]);
   bearingRing(iron,local([x,y,z]),scale);
   for(const dz of[-.11,.11])bx('ironWear',[x,y-.12,z+dz],[.055,.034,.045]);
  }
 }
 for(const z of[B.frame.y0,B.frame.y1])for(const side of[-1,1]){
  beam(end,local([side<0?B.frame.x0:16,10.45,z]),local([side<0?16:B.frame.x1,12.12,z]),.15,.15);
 }
 // Main roof principals are visible on the descent; collars and pegged knees
 // explain the load rather than repeating an ornamental texture.
 for(const z of[60,63.2,66.4,69.6])for(const side of[-1,1]){
  beam(o,local([16.5,9.12,z]),local([16.5+side*4.25,8.72,z]),.20,.16);
  beam(end,local([16.5+side*3.95,8.68,z]),local([16.5+side*2.7,9.0,z]),.10,.13);
 }
 // Glazed blind openings: cool closed panes at the existing solid wall and
 // generously splayed stone cheeks project inward .4-.46m. No fake throughview.
 for(const e of ST_BRENDANS_EMBRASURES){
  const n=e.normal,t=[n[2],0,-n[0]],pos=(u,v,d)=>local([e.x+t[0]*u+n[0]*d,e.y+v,e.z+t[2]*u+n[2]*d]);
  const w=e.width/2,h=e.height/2,innerW=w-.12,innerH=h-.14;
  const q=mat(m,'glass');quad(q,pos(-innerW,-innerH,.012),pos(innerW,-innerH,.012),pos(innerW,innerH,.012),pos(-innerW,innerH,.012),n);
  // Four stone splays with real longitudinal depth, no coincident old panel.
  for(const side of[-1,1])quad(s,pos(side*w,-h,e.depth),pos(side*innerW,-innerH,.018),pos(side*innerW,innerH,.018),pos(side*w,h,e.depth),n);
  quad(p,pos(-w,-h,e.depth),pos(w,-h,e.depth),pos(innerW,-innerH,.018),pos(-innerW,-innerH,.018),[0,1,0]);
  quad(s,pos(-w,h,e.depth),pos(-innerW,innerH,.018),pos(innerW,innerH,.018),pos(w,h,e.depth),[0,-1,0]);
  // Recessed iron saddle bars interrupt glass once, at construction scale.
  for(const v of[-h*.33,h*.33])beam(iron,pos(-innerW,v,.026),pos(innerW,v,.026),.022,.028);
  beam(iron,pos(0,-innerH,.028),pos(0,innerH,.028),.022,.028);
 }
 return m;
}

export function createStBrendansTreatmentGeometry(){
 const meshes=new Map([
  ['brendan_church_treated',churchConstruction()],['brendan_pew',pew()],['brendan_choir_stall',pew(true)],
  ['brendan_altar',altar()],['brendan_font',font()],['brendan_monument',monument()],['brendan_tomb',tomb()],
  ['brendan_pulpitum',pulpitum()],['brendan_pulpitum_broken',pulpitum(true)],
 ]);
 const wheelGeometry=wheel(),clapperGeometry=clapper(),stayGeometry=stay(),sliderGeometry=slider();
 for(let i=1;i<=8;i++){const n=String(i).padStart(2,'0');for(const [part,g]of[['bell',bell(i)],['wheel',wheelGeometry],['clapper',clapperGeometry],['stay',stayGeometry],['slider',sliderGeometry]])meshes.set(`brendan_${part}_${n}`,g)}
 return meshes;
}
export function bounds(g){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<g.positions.length;i++) {const k=i%3;min[k]=Math.min(min[k],g.positions[i]);max[k]=Math.max(max[k],g.positions[i]);}return{min,max}}
