import {BOX_OFFICE_DESK as D} from '../../src/data/box-office.js';
export const BOX_OFFICE_MATERIALS=[
 {name:'box office quarter-sawn oak',color:[.22,.145,.078],roughness:.76,texture:'oak'},
 {name:'box office rubbed oak edges',color:[.33,.23,.125],roughness:.65},
 {name:'box office old green joinery',color:[.065,.092,.076],roughness:.82},
 {name:'box office blackened iron',color:[.025,.032,.031],roughness:.68,metallic:.62},
 {name:'box office touched brass',color:[.40,.29,.12],roughness:.43,metallic:.82},
 {name:'box office dark drawer interiors',color:[.065,.048,.032],roughness:.94},
 {name:'box office cable rubber',color:[.018,.021,.019],roughness:.83},
 {name:'box office sparse glazing evidence',color:[.48,.55,.50],roughness:.38,texture:'glass',alphaMode:'MASK',alphaCutoff:.5},
 {name:'box office typed enamel plate',color:[.64,.64,.53],roughness:.65,texture:'sign0'},
 {name:'box office returns stencil',color:[.19,.21,.18],roughness:.86,texture:'sign1'},
 {name:'box office worn steel tray',color:[.17,.20,.18],roughness:.81,metallic:.33},
];
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function buildBoxOfficeGeometry(){
 const meshes=new Map();
 function owner(name){
  const out={groups:new Map(),parts:[],bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},triangles:0};meshes.set(name,out);
  const group=m=>out.groups.get(m)||(out.groups.set(m,{positions:[],normals:[],uvs:[],indices:[]}),out.groups.get(m));
  function quad(points,m,uvs){
   const n=cross(sub(points[1],points[0]),sub(points[2],points[0])),length=Math.hypot(...n);if(length<1e-10)throw Error('Degenerate box-office face');
   const g=group(m),start=g.positions.length/3,axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),uv=axis===0?[2,1]:axis===1?[0,2]:[0,1];
   points.forEach((p,i)=>{g.positions.push(...p);g.normals.push(...n.map(v=>v/length));g.uvs.push(...(uvs?.[i]||[p[uv[0]],p[uv[1]]]));p.forEach((v,k)=>{out.bounds.min[k]=Math.min(out.bounds.min[k],v);out.bounds.max[k]=Math.max(out.bounds.max[k],v);});});
   g.indices.push(start,start+1,start+2,start,start+2,start+3);out.triangles+=2;
  }
  function box(id,c,size,m){const h=size.map(v=>v/2),p=Array.from({length:8},(_,i)=>c.map((v,k)=>v+(i&(1<<k)?h[k]:-h[k])));for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(f.map(i=>p[i]),m);out.parts.push({id,kind:'box',center:c,size,material:m});}
  function beam(id,a,b,width,m){const d=sub(b,a),length=Math.hypot(...d),u=d.map(v=>v/length),r=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],v0=cross(u,r),vl=Math.hypot(...v0),v=v0.map(n=>n/vl),w=cross(u,v);const p=Array.from({length:8},(_,i)=>[0,1,2].map(k=>(i&1?b:a)[k]+v[k]*(i&2?width/2:-width/2)+w[k]*(i&4?width/2:-width/2)));for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(f.map(i=>p[i]),m);out.parts.push({id,kind:'beam',a,b,width,material:m});}
  function lathe(id,x,z,profile,m,segments=10){
   for(let j=1;j<profile.length;j++)for(let k=0;k<segments;k++){const a=k/segments*Math.PI*2,b=(k+1)/segments*Math.PI*2,[y0,r0]=profile[j-1],[y1,r1]=profile[j];quad([[x+Math.cos(a)*r0,y0,z+Math.sin(a)*r0],[x+Math.cos(a)*r1,y1,z+Math.sin(a)*r1],[x+Math.cos(b)*r1,y1,z+Math.sin(b)*r1],[x+Math.cos(b)*r0,y0,z+Math.sin(b)*r0]],m);}
   out.parts.push({id,kind:'lathe',x,z,profile,material:m});
  }
  return{out,box,beam,quad,lathe};
 }
 {
  const {box,beam,quad}=owner('box_office_clerking_hatch');
  // The masonry owns the lower enclosure; this is a fitted one-metre-deep
  // reveal, not another solid cardboard wall in front of the office.
  for(const x of[-1.51,1.51]){
   box('oak-through-jamb-'+x,[x,1.64,0],[.10,1.76,1.08],0);
   for(const z of[-.55,.55])box('stepped-jamb-architrave-'+x+'-'+z,[x,1.64,z],[.10,1.76,.035],1);
  }
  box('deep-head-lining',[0,2.465,0],[3.12,.11,1.08],0);
  box('head-public-mould',[0,2.50,.56],[3.12,.04,.07],1);
  box('public-worn-transaction-ledge',[0,.832,.66],[3.06,.056,.48],0);
  box('public-rounded-nosing',[0,.827,.89],[3.06,.048,.020],1);
  box('staff-working-shelf',[0,.732,-.655],[2.86,.056,.37],0);
  for(const x of[-1.25,1.25]){
   beam('public-ledge-bracket-'+x,[x,.72,.52],[x,.80,.82],.035,3);
   beam('staff-shelf-bracket-'+x,[x,.57,-.52],[x,.71,-.77],.035,3);
  }
  // A closed sliding frame with a separate service slot and doubled meeting
  // stiles. Deep jambs and a room beyond make the wall thickness accountable.
  for(const z of[-.505,.505]){
   for(const y of[1.04,2.37])box('glazing-track-'+z+'-'+y,[0,y,z],[2.90,.035,.035],2);
   for(const x of[-1.43,-.475,.475,1.43])box('sliding-glazing-stile-'+z+'-'+x,[x,1.705,z],[.027,1.36,.035],2);
   for(const x of[-.95,0,.95])quad([[x-.46,1.065,z],[x+.46,1.065,z],[x+.46,2.35,z],[x-.46,2.35,z]],7,[[0,0],[1,0],[1,1],[0,1]]);
  }
  for(const x of[-.40,.55])box('sliding-pane-finger-pull-'+x,[x,1.37,.535],[.022,.13,.035],4);
  for(const y of[1.15,2.31])box('fixed-grille-rail-'+y,[0,y,.565],[2.88,.025,.03],3);
  for(let n=0;n<15;n++){
   const x=-1.33+n*.19;box('grille-spindle-'+n,[x,1.73,.565],[.016,1.16,.022],3);
  }
  for(const side of[-1,1])for(const row of[0,1]){
   const cx=side*.95,cy=2.06-row*.55,points=[];
   for(let n=0;n<=18;n++){const a=n/18*Math.PI*1.65,r=.11*(1-n/25);points.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r,.565]);}
   for(let n=1;n<points.length;n++)beam('restrained-iron-scroll-'+side+'-'+row+'-'+n,points[n-1],points[n],.013,3);
  }
  box('brass-transfer-recess-floor',[0,.870,.52],[.50,.012,.34],4);
  for(const x of[-.26,.26])box('transfer-recess-cheek-'+x,[x,.915,.52],[.012,.08,.34],4);
  box('service-slot-back-lip',[0,.905,.36],[.52,.07,.012],4);
  box('old-green-name-board',[0,2.22,.585],[.88,.22,.028],2);
  quad([[-.40,2.14,.601],[.40,2.14,.601],[.40,2.30,.601],[-.40,2.30,.601]],8,[[0,0],[1,0],[1,1],[0,1]]);
  for(const x of[-1.51,1.51])for(const y of[1.13,2.18])box('jamb-fixing-'+x+'-'+y,[x,y,.572],[.017,.017,.010],4);
 }
 {
  const {box,beam,lathe}=owner(D.mesh);
  box('joined-solid-oak-worktop',[0,.7375,0],[D.width,.045,D.depth],0);
  box('worktop-front-rubbed-edge',[0,.735,.284],[D.width,.035,.012],1);
  box('worktop-back-rubbed-edge',[0,.735,-.284],[D.width,.035,.012],1);
  for(const x of[-.49,.49])for(const z of[-.225,.225]){
   lathe('tapered-turned-leg-'+x+'-'+z,x,z,[[.02,.024],[.045,.030],[.075,.026],[.10,.024],[.47,.034],[.51,.039],[.54,.034],[.715,.034]],0,10);
   lathe('brass-leg-socket-'+x+'-'+z,x,z,[[.02,.025],[.055,.025]],4,10);
  }
  // Drawers occupy the right pedestal; the sitter's central/left knee well
  // stays open. No erroneous shelf occupies the chair's seat height.
  for(const x of[.235,.525])box('drawer-case-side-'+x,[x,.44,0],[.025,.55,.49],0);
  box('drawer-case-back',[.38,.44,-.232],[.315,.55,.026],0);
  for(let n=0;n<3;n++){
   const y=.25+n*.17;box('drawer-shadow-gap-'+n,[.38,y,.25],[.28,.159,.018],5);
   box('fitted-drawer-front-'+n,[.38,y,.263],[.274,.145,.024],0);
   for(const x of[.325,.435])beam('drawer-handle-mount-'+n+'-'+x,[x,y+.01,.278],[x,y+.01,.302],.014,4);
   beam('drawer-swing-pull-'+n,[.325,y-.012,.302],[.435,y-.012,.302],.014,4);
  }
  box('knee-well-top-rail',[-.12,.695,.248],[.69,.040,.035],0);
  box('rear-modesty-panel',[-.12,.51,-.235],[.69,.31,.028],2);
  box('desk-left-jointed-apron',[-.49,.665,0],[.035,.10,.44],0);
  box('desk-cable-grommet',[.47,.759,-.22],[.055,.002,.035],6);
  const cable=[[.47,.702,-.22],[.46,.62,-.25],[.41,.44,-.26],[.43,.22,-.26],[.35,.07,-.26],[.20,.03,-.26]];
  for(let n=1;n<cable.length;n++)beam('rear-cable-'+n,cable[n-1],cable[n],.009,6);
  box('drawer-lock-escutcheon',[.38,.627,.279],[.024,.025,.005],4);
 }
 {
  const {box,quad}=owner('box_office_returns_tray');
  box('pressed-tray-base',[0,.006,0],[.25,.012,.21],10);
  for(const x of[-.12,.12])box('folded-tray-side-'+x,[x,.031,0],[.010,.042,.21],10);
  box('tray-back-lip',[0,.031,-.10],[.23,.042,.010],10);
  // Front scoop permits papers to be picked up; its broad stencil is on the
  // real metal, not a separate in-world floating notice.
  box('tray-front-low-lip',[0,.019,.10],[.23,.026,.010],10);
  quad([[-.085,.013,-.037],[.085,.013,-.037],[.085,.013,.037],[-.085,.013,.037]],9,[[0,0],[1,0],[1,1],[0,1]]);
 }
 return{materials:BOX_OFFICE_MATERIALS,meshes,maximumTriangles:6500,maximumBytes:2*1024*1024};
}
