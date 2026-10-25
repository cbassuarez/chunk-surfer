import {ARRIVAL_COURT as C} from '../../src/data/arrival-court.js';
const palette={
  brick:{name:'arrival court / rain-dark red brick',rgb:[.22,.092,.058],roughness:.94},
  mortar:{name:'arrival court / recessed lime joints',rgb:[.29,.265,.20],roughness:.98},
  stone:{name:'arrival court / weathered limestone',rgb:[.49,.47,.38],roughness:.86},
  iron:{name:'arrival court / charcoal cast iron',rgb:[.034,.043,.039],metallic:.50,roughness:.64},
  bronze:{name:'arrival court / old bronze fixings',rgb:[.20,.225,.13],metallic:.65,roughness:.72},
  oak:{name:'arrival court / oiled oak',rgb:[.245,.13,.056],roughness:.58},
  endgrain:{name:'arrival court / exposed oak endgrain',rgb:[.16,.075,.029],roughness:.78},
  weather:{name:'arrival court / sheltered green mineral stain',rgb:[.14,.19,.12],roughness:1},
};
export function buildArrivalCourt(api){
  const{mesh,materials,addBox,addBeam,addQuad}=api;
  if(!mesh||!Array.isArray(materials)||![addBox,addBeam,addQuad].every(f=>typeof f==='function'))throw Error('Arrival court requires the ordinary opaque primitive builder.');
  const ids={};for(const[k,p]of Object.entries(palette)){let i=materials.findIndex(m=>m.name===p.name);if(i<0){i=materials.length;materials.push({name:p.name,pbrMetallicRoughness:{baseColorFactor:[...p.rgb,1],metallicFactor:p.metallic||0,roughnessFactor:p.roughness}});}ids[k]=i;}
  const report={triangles:0,meshes:{},parts:[],opening:{...C.opening},bench:{...C.bench}};
  const geometry=(name)=>{const target=mesh(name);report.meshes[name]={triangles:0};return{target,name};};
  const count=(g,n)=>{report.triangles+=n;report.meshes[g.name].triangles+=n;};
  const box=(g,id,c,size,mat='iron')=>{addBox(g.target,c,size,ids[mat]);count(g,12);report.parts.push({mesh:g.name,id,kind:'box',center:c,size,material:mat});};
  const beam=(g,id,a,b,width,mat='iron')=>{addBeam(g.target,a,b,width,ids[mat]);count(g,12);report.parts.push({mesh:g.name,id,kind:'beam',a,b,width,material:mat});};
  const quad=(g,a,b,c,d,mat)=>{addQuad(g.target,a,b,c,d,ids[mat]);count(g,2);};
  // Chamfered stone/timber solids: top, bottom and connected vertical arrises.
  function bevel(g,id,c,size,mat='stone',b=.025){
    const[hx,hy,hz]=size.map(v=>v/2),ch=Math.min(b,hx*.35,hz*.35),ring=[[-hx+ch,-hz],[hx-ch,-hz],[hx,-hz+ch],[hx,hz-ch],[hx-ch,hz],[-hx+ch,hz],[-hx,hz-ch],[-hx,-hz+ch]];
    const lo=ring.map(([x,z])=>[c[0]+x,c[1]-hy,c[2]+z]),hi=ring.map(([x,z])=>[c[0]+x,c[1]+hy,c[2]+z]);
    for(let i=0;i<8;i++){const j=(i+1)%8;quad(g,lo[i],hi[i],hi[j],lo[j],mat==='oak'&&(i===2||i===6)?'endgrain':mat);}
    // Three planar quads fill each octagon exactly, with no open corners or
    // collapsed fan triangles. The upper cap reverses the X/Z ring winding.
    for(const[r,up]of[[lo,false],[hi,true]]){
      const faces=[[r[0],r[1],r[2],r[7]],[r[7],r[2],r[3],r[6]],[r[6],r[3],r[4],r[5]]];
      for(const f of faces)quad(g,...(up?[...f].reverse():f),mat);
    }
    report.parts.push({mesh:g.name,id,kind:'bevel',center:c,size,material:mat});
  }
  const boundary=geometry(C.meshes.boundary),local=([x,y,z])=>[x-C.origin.x,y,z-C.origin.z];
  const worldBox=(id,x,y,z,w,h,d,mat)=>box(boundary,id,local([x,y,z]),[w,h,d],mat);
  const worldBevel=(id,x,y,z,w,h,d,mat='stone',b=.025)=>bevel(boundary,id,local([x,y,z]),[w,h,d],mat,b);
  const worldBeam=(id,a,b,w,mat='iron')=>beam(boundary,id,local(a),local(b),w,mat);
  function ball(id,x,y,z,r){
    // Six latitude bands with small flat end caps; no collapsed polar quads.
    const rings=Array.from({length:7},(_,i)=>{let a=-Math.PI*.43+i/6*Math.PI*.86;return{y:y+Math.sin(a)*r,r:Math.cos(a)*r};});
    for(let j=1;j<rings.length;j++)for(let i=0;i<12;i++){const point=(ring,k)=>local([x+Math.cos(k/12*Math.PI*2)*ring.r,ring.y,z+Math.sin(k/12*Math.PI*2)*ring.r]);quad(boundary,point(rings[j-1],i),point(rings[j],i),point(rings[j],i+1),point(rings[j-1],i+1),'stone');}
    for(const[ring,top]of[[rings[0],false],[rings.at(-1),true]]){const pts=Array.from({length:12},(_,i)=>local([x+Math.cos(i/12*Math.PI*2)*ring.r,ring.y,z+Math.sin(i/12*Math.PI*2)*ring.r]));for(let k=1;k<11;k+=2){const f=[pts[0],pts[k],pts[k+1],pts[k+2]];quad(boundary,...(top?[...f].reverse():f),'stone');}}
    worldBevel(`${id}-finial-neck`,x,y-r*.96,z,r*.24,r*.08,r*.24,'stone',.003);
    worldBevel(`${id}-finial-crown`,x,y+r*.96,z,r*.24,r*.08,r*.24,'stone',.003);
  }
  for(const p of C.piers){
    worldBox(`${p.id}-brick-core`,p.x,p.height/2,p.z,p.depth,p.height,p.width,'brick');
    worldBevel(`${p.id}-limestone-foot`,p.x,.105,p.z,p.depth+.08,.21,p.width,'stone');
    const courses=Math.floor((p.height-.3)/.19);
    for(let i=0;i<courses;i++){
      const y=.26+i*.19;
      // Mortar sits in the real facade face; selective brick joints avoid a
      // uniform noise texture in the final dither.
      for(const side of[-1,1])worldBox(`${p.id}-bed-joint-${i}-${side}`,p.x+side*(p.depth/2+.001),y,p.z,.003,.012,p.width-.035,'mortar');
      if(i%2===0)worldBox(`${p.id}-staggered-head-${i}`,p.x-p.depth/2-.002,y+.085,p.z+(i%4===0?-.11:.11),.004,.15,.011,'mortar');
    }
    worldBevel(`${p.id}-cap-bed`,p.x,p.height+.045,p.z,p.depth+.075,.09,p.width+.07);
    worldBevel(`${p.id}-projecting-coping`,p.x,p.height+.135,p.z,p.depth+.17,.12,p.width+.17);
    worldBevel(`${p.id}-weathering-top`,p.x,p.height+.225,p.z,p.depth+.105,.06,p.width+.105);
    if(p.gate){worldBevel(`${p.id}-finial-socle`,p.x,p.height+.292,p.z,.23,.075,.23);ball(p.id,p.x,p.height+.40,p.z,.095);}
    else worldBevel(`${p.id}-shallow-terminal`,p.x,p.height+.277,p.z,.17,.045,.17);
    // Sheltered damp occurs only on the north-foot ledge, not every face.
    worldBox(`${p.id}-mineral-foot`,p.x-p.depth/2-.006,.065,p.z,.008,.07,p.width*.52,'weather');
  }
  const point=(r,t,y,depth=0)=>r.axis==='z'?[r.fixed+depth,y,t]:[t,y,r.fixed+depth];
  function rosette(g,id,project,mid,y,r=.105){
    const centre=project(mid,y),right=project(mid+.1,y),dx=right[0]-centre[0],dz=right[2]-centre[2],len=Math.hypot(dx,dz),normal=[-dz/len,0,dx/len];
    for(let k=0;k<4;k++){
      const a=k/4*Math.PI*2,b=a+Math.PI/4;
      const front=[project(mid+Math.cos(a)*r*.30,y+Math.sin(a)*r*.30),project(mid+Math.cos(b)*r,y+Math.sin(b)*r),project(mid+Math.cos(a+Math.PI/2)*r*.30,y+Math.sin(a+Math.PI/2)*r*.30),centre].map(p=>p.map((v,i)=>v+normal[i]*.008));
      const back=front.map(p=>p.map((v,i)=>v-normal[i]*.016));
      quad(g,...front,'iron');quad(g,...[...back].reverse(),'iron');
      for(let i=0;i<4;i++){const j=(i+1)%4;quad(g,front[i],back[i],back[j],front[j],'iron');}
    }
    box(g,`${id}-centre-rivet`,project(mid,y),[.043,.043,.043],'bronze');
  }
  // Each paired S has one lower scroll, one upper scroll and a continuous
  // diagonal web joining them. Its two endpoints bear on the panel rails.
  function scroll(g,id,project,cx,cy,mirror=1,scale=1,bottom=cy-.675,top=cy+.675){
    const p=(x,y)=>project(cx+mirror*x*scale,cy+y*scale),a=[];
    for(let i=0;i<=8;i++){let t=i/8*Math.PI*1.72,r=.035+.105*i/8;a.push(p(-.19+Math.cos(t)*r,-.25+Math.sin(t)*r));}
    a.push(p(.01,-.02),p(.08,.10));
    for(let i=8;i>=0;i--){let t=i/8*Math.PI*1.72,r=.035+.105*i/8;a.push(p(.19-Math.cos(t)*r,.25-Math.sin(t)*r));}
    for(let i=1;i<a.length;i++)beam(g,`${id}-${i}`,a[i-1],a[i],.033*scale);
    const curlX=-.19+Math.cos(Math.PI*1.72)*.14;
    beam(g,`${id}-lower-tie`,a[8],project(cx+mirror*curlX*scale,bottom),.033*scale);
    beam(g,`${id}-upper-tie`,a[11],project(cx-mirror*curlX*scale,top),.033*scale);
  }
  function panel(id,from,to,project,{bottom=C.iron.bottom,top=C.iron.top,folded=false}={}){
    const mid=(from+to)/2,w=to-from;
    for(const y of[bottom,top])beam(boundary,`${id}-frame-${y}`,project(from,y),project(to,y),C.iron.frameWidth);
    for(const t of[from,to])beam(boundary,`${id}-stile-${t}`,project(t,bottom),project(t,top),.055);
    const bars=Math.max(2,Math.floor(w/.29));
    for(let i=1;i<bars;i++){
      const t=from+w*i/bars;beam(boundary,`${id}-upright-${i}`,project(t,bottom),project(t,top),C.iron.barWidth);
      if(i%2===1)box(boundary,`${id}-collar-${i}`,project(t,top-.13),[.065,.055,.065]);
    }
    const cy=(bottom+top)/2,scale=Math.min(1,(top-bottom)/1.2,w/1.9);
    scroll(boundary,`${id}-s-left`,project,mid-.30*scale,cy,-1,scale,bottom,top);
    scroll(boundary,`${id}-s-right`,project,mid+.30*scale,cy,1,scale,bottom,top);
    beam(boundary,`${id}-scroll-cross-tie`,project(mid-.31*scale,cy-.02*scale),project(mid+.31*scale,cy-.02*scale),.033);
    rosette(boundary,`${id}-rosette`,project,mid,cy);
    if(folded)for(const t of[from+.1,to-.1])box(boundary,`${id}-hinge-boss-${t}`,project(t,bottom+.19),[.10,.13,.10],'bronze');
  }
  for(const r of C.runs){
    const length=r.to-r.from,mid=(r.from+r.to)/2;
    const pos=(t,y,d=0)=>local(point(r,t,y,d));
    const sizes=r.axis==='z'?[C.plinth.width,C.plinth.height,length]:[length,C.plinth.height,C.plinth.width];
    box(boundary,`${r.id}-brick-dwarf-wall`,pos(mid,C.plinth.height/2),sizes,'brick');
    bevel(boundary,`${r.id}-continuous-limestone-cope`,pos(mid,.445),r.axis==='z'?[C.plinth.copeWidth,.09,length]:[length,.09,C.plinth.copeWidth],'stone',.02);
    // Recessed joints and sparse green drips are construction/weathering,
    // never a dark panel occupying the spaces between the iron bars.
    for(let t=r.from+.55;t<r.to-.2;t+=1.15){
      const c=point(r,t,.20,r.axis==='z'?-.155:-.155);
      worldBox(`${r.id}-low-mortar-${t}`,c[0],c[1],c[2],r.axis==='z'?.004:.012,.25,r.axis==='z'?.012:.004,'mortar');
    }
    for(let i=0;i<r.panels;i++){
      const a=r.from+length*i/r.panels,b=r.from+length*(i+1)/r.panels;
      // The end brick pier absorbs the stile; intermediate cast posts have
      // real shoes anchored to the continuous stone coping.
      if(i>0){beam(boundary,`${r.id}-post-${i}`,pos(a,.49),pos(a,C.iron.postTop),.09);bevel(boundary,`${r.id}-post-shoe-${i}`,pos(a,.535),[.17,.09,.17],'iron',.015);box(boundary,`${r.id}-post-neck-${i}`,pos(a,2.08),[.13,.055,.13]);}
      const endA=i===0?r.trimFrom:.06,endB=i===r.panels-1?r.trimTo:.06;
      panel(`${r.id}-panel-${i}`,a+endA,b-endB,(t,y)=>pos(t,y));
    }
  }
  for(const l of C.foldedLeaves){
    const project=(t,y)=>local([l.x,y,t]);panel(`folded-${l.id}`,l.z0,l.z1,project,{bottom:.35,top:2.02,folded:true});
    const hinge=l.id==='north'?l.z1:l.z0;
    for(const y of[.48,1.77]){
      worldBeam(`folded-${l.id}-hinge-pin-${y}`,[l.x,y-.10,hinge],[l.x,y+.10,hinge],.075,'bronze');
      worldBeam(`folded-${l.id}-hinge-strap-${y}`,[l.x,y,hinge],[27.23,y,hinge+(l.id==='north'?-.12:.12)],.06);
    }
  }
  const bench=geometry(C.meshes.bench),B=C.bench;
  // Four flags bed into the existing lawn datum, with the shoes embedded a
  // few millimetres into the top. No pedestal or new navigation height.
  for(let i=0;i<4;i++)bevel(bench,`bench-foundation-flag-${i}`,[-B.padWidth/2+(i+.5)*B.padWidth/4,-.009,0],[B.padWidth/4-.009,.034,B.padDepth],'stone',.018);
  for(const side of[-1,1]){
    const x=side*.835;
    for(const z of[-.285,.285]){
      bevel(bench,`bench-shoe-${side}-${z}`,[x,.025,z],[.18,.05,.19],'iron',.022);
      box(bench,`bench-anchor-bolt-${side}-${z}`,[x,.055,z],[.045,.02,.045],'bronze');
    }
    const frame=[[-.285,.05],[-.255,.17],[-.16,.29],[-.15,.415],[.18,.435],[.285,.29],[.285,.05]];
    for(let i=1;i<frame.length;i++)beam(bench,`bench-cast-end-${side}-${i}`,[x,frame[i-1][1],frame[i-1][0]],[x,frame[i][1],frame[i][0]],.065);
    beam(bench,`bench-seat-bearer-${side}`,[x,.415,-.31],[x,.435,.26],.065);
    beam(bench,`bench-back-stay-${side}`,[x,.43,.20],[x,1.025,.32],.055);
    const arm=[[-.33,.63],[-.29,.69],[-.17,.71],[.12,.70],[.30,.64],[.28,.44]];
    for(let i=1;i<arm.length;i++)beam(bench,`bench-rolled-arm-${side}-${i}`,[side*.96,arm[i-1][1],arm[i-1][0]],[side*.96,arm[i][1],arm[i][0]],.052);
    beam(bench,`bench-front-arm-bearing-${side}`,[side*.96,.63,-.33],[x,.42,-.28],.045);
    // Open cast iron spiral braces join the bearing frame and rolled arm.
    const pts=Array.from({length:15},(_,i)=>{const a=i/14*Math.PI*1.9,r=.025+.105*i/14;return[x,.28+Math.sin(a)*r,-.01+Math.cos(a)*r];});
    for(let i=1;i<pts.length;i++)beam(bench,`bench-end-scroll-${side}-${i}`,pts[i-1],pts[i],.027);
    beam(bench,`bench-scroll-bearing-${side}`,pts.at(-1),[x,.415,.12],.027);
  }
  beam(bench,'bench-underseat-tie',[-.835,.26,.14],[.835,.26,.14],.045);
  for(let i=0;i<5;i++){
    const z=-.25+i*.1125,y=B.seatHeight-.023+(z+.25)*.027;
    bevel(bench,`bench-oak-seat-slat-${i}`,[0,y,z],[1.98,.046,.092],'oak',.010);
    for(const x of[-.835,.835])box(bench,`bench-seat-countersunk-fixing-${i}-${x}`,[x,y+.0236,z],[.013,.0015,.013],'bronze');
  }
  for(let i=0;i<4;i++){
    const y=.65+i*.116,z=.23+(y-.65)*.20;
    bevel(bench,`bench-oak-back-slat-${i}`,[0,y,z],[1.98,.086,.048],'oak',.008);
    for(const x of[-.835,.835])box(bench,`bench-back-fixing-${i}-${x}`,[x,y,z-.0248],[.013,.013,.0015],'bronze');
  }
  report.placedTriangles=report.meshes[C.meshes.boundary].triangles+report.meshes[C.meshes.bench].triangles*C.benches.length;
  if(report.placedTriangles>C.maximumTriangles)throw Error(`Arrival court exceeds ${C.maximumTriangles} triangles: ${report.placedTriangles}`);
  return report;
}
