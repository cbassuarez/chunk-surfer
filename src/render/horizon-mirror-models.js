// The things at Horizon, in local metres. The mirror is built in its own frame
// (x along the glass, y up, z out of it) and placed by the frame module; the
// road and floor are built where they stand.
import {HORIZON_MIRROR as C} from '../data/horizon-mirror.js';

const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
  dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  unit=a=>mul(a,1/(Math.hypot(...a)||1));
const target=()=>({p:[],i:[]});
function tri(g,a,b,c,outward){
  const flip=outward&&dot(cross(sub(b,a),sub(c,a)),outward)<0,o=g.p.length/3;
  g.p.push(...a,...(flip?c:b),...(flip?b:c));g.i.push(o,o+1,o+2);
}
const quad=(g,a,b,c,d,outward)=>{tri(g,a,b,c,outward);tri(g,a,c,d,outward);};
function solid(g,c){
  const mid=mul(c.reduce((s,v)=>add(s,v),[0,0,0]),1/8);
  for(const[a,b,e,f]of[[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]){
    const centre=mul(add(add(c[a],c[b]),add(c[e],c[f])),.25);quad(g,c[a],c[b],c[e],c[f],sub(centre,mid));
  }
}
const box=(g,x0,x1,y0,y1,z0,z1)=>solid(g,[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]]);
// A flat band along a path of points, `side` giving its width direction at each.
function band(g,points,sides,width,outward=null){
  for(let k=0;k<points.length-1;k++){
    const a=points[k],b=points[k+1],sa=mul(sides[k],width/2),sb=mul(sides[k+1],width/2),n=outward?outward(k):null;
    quad(g,sub(a,sa),add(a,sa),add(b,sb),sub(b,sb),n);
  }
}

function floorGeometry(){
  const g=target(),sides=120,R=C.floorRadius;
  for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2,b=(k+1)/sides*Math.PI*2;tri(g,[0,0,0],[Math.cos(a)*R,0,Math.sin(a)*R],[Math.cos(b)*R,0,Math.sin(b)*R],[0,1,0]);}
  return g;
}
// The chapel road, and its two pale edges so it reads in the dark.
function roadGeometry(){
  const{halfWidth:w,from,to}=C.road,surface=target(),edge=target();
  quad(surface,[-w,.01,from],[w,.01,from],[w,.01,to],[-w,.01,to],[0,1,0]);
  for(const s of[-1,1])quad(edge,[s*w-.05,.015,from],[s*w+.05,.015,from],[s*w+.05,.015,to],[s*w-.05,.015,to],[0,1,0]);
  return{surface,edge};
}

// ── THE MIRROR ──────────────────────────────────────────────────────────────
// A tall standing glass, as in Escher's Magic Mirror. Its frame is four battens;
// its back is a sheet of board on two struts, because seen from behind it is a
// piece of scenery. In its own frame: x along, y up, z out of the glass.
function mirrorGeometry(scale=1){
  const{width,height,bottom,frame:f,depth:d}=C.mirror,w=width/2*scale,b=bottom*scale,h=b+height*scale,F=f*scale,D=d*scale,
    frame=target(),back=target(),strut=target();
  box(frame,-w-F,w+F,b-F,b,-D,D*.6);box(frame,-w-F,w+F,h,h+F,-D,D*.6);
  box(frame,-w-F,-w,b,h,-D,D*.6);box(frame,w,w+F,b,h,-D,D*.6);
  quad(back,[-w-F,b-F,-D],[w+F,b-F,-D],[w+F,h+F,-D],[-w-F,h+F,-D],[0,0,-1]);
  // Two struts out the back to the ground, and the feet the glass stands on.
  for(const s of[-1,1]){
    const top=[s*w*.6,h*.62,-D],foot=[s*w*.6,0,-D-h*.34];
    const dir=unit(sub(foot,top)),side=unit(cross(dir,[1,0,0]));
    quad(strut,add(top,mul(side,.05)),sub(top,mul(side,.05)),sub(foot,mul(side,.05)),add(foot,mul(side,.05)));
    box(frame,s*w*.8-.12*scale,s*w*.8+.12*scale,0,b,-D*2,D*2);
  }
  return{frame,back,strut};
}
// The frame coming away: three ribbons that leave the top battens and wind out
// round the glass and back, each a little wider and further than the last.
function rindGeometry(){
  const{width,height,bottom}=C.mirror,cx=0,cy=bottom+height/2,rows=[];
  for(let r=0;r<3;r++){
    const g=target(),pts=[],sides=[],N=90,start=Math.PI*(.5+r*.62);
    for(let k=0;k<=N;k++){
      const t=k/N,a=start+t*Math.PI*2*(1.1+r*.25),rx=width/2+.85+t*(1.9+r*1.1),ry=height/2+.7+t*(1.4+r*.8);
      pts.push([cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,-.25-t*(1.6+r*1.4)]);
    }
    for(let k=0;k<=N;k++){const a=pts[Math.max(0,k-1)],b=pts[Math.min(N,k+1)],tan=unit(sub(b,a)),out=unit(sub(pts[k],[cx,cy,pts[k][2]]));sides.push(unit(cross(tan,cross(out,tan))));}
    band(g,pts,sides,.16+r*.05);
    rows.push(g);
  }
  return rows;
}

// ── THE CHAPEL, AT THE END OF THE ROAD ───────────────────────────────────────
function chapelGeometry(){
  const body=target(),glow=target();
  box(body,-5,5,0,8,-11,11);
  const roof=[[-5.4,8,11],[5.4,8,11],[0,13,11],[-5.4,8,-11],[5.4,8,-11],[0,13,-11]];
  tri(body,roof[0],roof[1],roof[2],[0,0,1]);tri(body,roof[3],roof[5],roof[4],[0,0,-1]);
  quad(body,roof[0],roof[2],roof[5],roof[3],[-1,1,0]);quad(body,roof[1],roof[4],roof[5],roof[2],[1,1,0]);
  box(body,-1,1,13,16.5,9.5,11.5);
  quad(glow,[-1,0,11.02],[1,0,11.02],[1,3.6,11.02],[-1,3.6,11.02],[0,0,1]);
  for(let k=0;k<12;k++){const a=k/12*Math.PI*2,b=(k+1)/12*Math.PI*2;tri(glow,[0,8.6,11.03],[Math.cos(a)*1.3,8.6+Math.sin(a)*1.3,11.03],[Math.cos(b)*1.3,8.6+Math.sin(b)*1.3,11.03],[0,0,1]);}
  return{body,glow};
}

// ── THE DAISY ───────────────────────────────────────────────────────────────
// Bigger than him. One petal is one mesh, placed round the head as many times as
// it has petals, so a petal can be taken away by not drawing it.
function daisyGeometry(){
  const{height,headRadius:r,petalLength:L}=C.daisy,stem=target(),disc=target(),petal=target();
  const S=10;for(let k=0;k<S;k++){const a=k/S*Math.PI*2,b=(k+1)/S*Math.PI*2,q=(t,y)=>[Math.cos(t)*.045,y,Math.sin(t)*.045];quad(stem,q(a,0),q(b,0),q(b,height),q(a,height),[Math.cos(a),0,Math.sin(a)]);}
  for(let k=0;k<18;k++){const a=k/18*Math.PI*2,b=(k+1)/18*Math.PI*2;tri(disc,[0,height,.06],[Math.cos(a)*r,height+Math.sin(a)*r,.04],[Math.cos(b)*r,height+Math.sin(b)*r,.04],[0,0,1]);}
  // The petal lies along +x from the disc's rim, in the head's plane.
  const w=.11;quad(petal,[r*.85,height-w,0],[r+L,height-w*.6,-.02],[r+L,height+w*.6,-.02],[r*.85,height+w,0],[0,0,1]);
  return{stem,disc,petal};
}

// The sky behind the glass. The capture draws only geometry, so the reflected
// world gets a cyclorama, painted in the Source sky's own bands.
function cycloramaGeometry(){
  const R=110,bands=[[0,9],[9,24],[24,70]],rows=bands.map(()=>target()),N=48,span=1.35;
  bands.forEach(([y0,y1],b)=>{for(let k=0;k<N;k++){const a=-span+k/N*2*span,c=-span+(k+1)/N*2*span,p=(t,y)=>[Math.sin(t)*R,y,-Math.cos(t)*R];
    quad(rows[b],p(a,y0),p(c,y0),p(c,y1),p(a,y1),[-Math.sin(a),0,Math.cos(a)]);}});
  return rows;
}
let library=null;
export function horizonMirrorGeometry(){
  if(library)return library;
  const road=roadGeometry(),m=mirrorGeometry(),rind=rindGeometry(),chapel=chapelGeometry(),daisy=daisyGeometry(),sky=cycloramaGeometry();
  library=Object.freeze([
    {name:'hm_floor',...floorGeometry(),base:[.03,.032,.045,1],roughness:1},
    {name:'hm_road',...road.surface,base:[.36,.35,.33,1],emissive:[.04,.04,.04],roughness:1},
    {name:'hm_road_edge',...road.edge,base:[.8,.82,.86,1],emissive:[.32,.33,.36],roughness:1},
    {name:'hm_mirror_frame',...m.frame,base:[.13,.1,.08,1],roughness:.6},
    {name:'hm_mirror_back',...m.back,base:[.62,.47,.3,1],roughness:1},
    {name:'hm_mirror_strut',...m.strut,base:[.5,.4,.26,1],roughness:.92},
    ...rind.map((g,k)=>({name:`hm_rind_${k}`,...g,base:k===1?[.62,.47,.3,1]:[.5,.42,.32,1],emissive:k===1?[.12,.09,.05]:[.06,.05,.04],roughness:.7})),
    {name:'hm_chapel',...chapel.body,base:[.02,.02,.025,1],roughness:1},
    {name:'hm_chapel_glow',...chapel.glow,base:[.95,.78,.48,1],emissive:[.9,.7,.4],roughness:1},
    {name:'hm_daisy_stem',...daisy.stem,base:[.16,.32,.1,1],roughness:.9},
    {name:'hm_daisy_disc',...daisy.disc,base:[.92,.72,.16,1],emissive:[.3,.22,.04],roughness:.8},
    {name:'hm_daisy_petal',...daisy.petal,base:[.95,.95,.92,1],emissive:[.22,.22,.21],roughness:.9},
    ...[[.043,.043,.59],[.027,.027,.44],[.012,.012,.1]].map((c,k)=>({name:`hm_sky_${k}`,...sky[k],base:[...c,1],emissive:c,roughness:1})),
  ]);
  return library;
}
export const HORIZON_MIRROR_MESHES=Object.freeze(horizonMirrorGeometry().map(row=>row.name));
