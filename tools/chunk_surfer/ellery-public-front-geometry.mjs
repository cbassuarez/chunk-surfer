import crypto from 'node:crypto';
import {ELLERY_PUBLIC_FRONT as C} from '../../src/data/ellery-public-front.js';
const mat=(name,rgb,roughness=.88,metallic=0,emissive)=>({name,rgb,roughness,metallic,...(emissive?{emissive}: {})});
export const ELLERY_PUBLIC_MATERIALS=[
  mat('ellery red brick',[.25,.095,.052],.94),mat('ellery faded red brick repair',[.31,.145,.092],.95),
  mat('chapel stone',[.43,.44,.41],.88),mat('public front rubbed sandstone',[.36,.36,.31],.90),
  mat('black lacquer',[.025,.028,.03],.60,.08),mat('painted steel',[.22,.24,.23],.65,.25),
  mat('public forecourt wet flags',[.24,.255,.245],.71),mat('public forecourt mortar joints',[.10,.115,.10],.96),
  mat('public entrance dark green joinery',[.055,.075,.062],.78),
  mat('public entrance warm lamp',[.68,.52,.30],.50,0,[.55,.36,.15]),
  mat('fanlight pane edges',[.18,.25,.25],.35,.02),mat('fanlight sparse water marks',[.29,.34,.32],.48,.01),
  mat('hybrid blackened bronze',[.095,.071,.052],.53,.65),
  mat('hybrid canopy entrance diffuser',[.55,.42,.24],.5,0,[.18,.10,.04]),
  mat('hybrid canopy window diffuser',[.47,.45,.40],.5,0,[.12,.11,.08]),
  mat('hybrid canopy relief diffuser',[.51,.38,.20],.5,0,[.12,.07,.025]),
  mat('civic terracotta panel',[.31,.11,.055],.92),mat('civic terracotta relief',[.48,.19,.09],.86),
  mat('hybrid forecourt inlaid stone',[.14,.16,.15],.78),mat('weathered bench timber',[.19,.15,.105],.84),
];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((v,k)=>v-b[k]);
export function elleryPublicFrontGeometry(){
  const meshes=[];
  function owner(name,anchor){
    const out={name,anchor,primitives:[],parts:[],apertures:[]};meshes.push(out);
    const group=m=>out.primitives.find(g=>g.material===m)||(out.primitives.push({material:m,positions:[],normals:[],uvs:[],indices:[]}),out.primitives.at(-1));
    const point=p=>[p[0]-anchor.x,p[1],p[2]-anchor.z];
    function quad(id,world,material){
      const p=world.map(point),n=cross(sub(p[1],p[0]),sub(p[2],p[0])),length=Math.hypot(...n);
      if(length<1e-10)throw Error('Degenerate public-front face '+id);
      const normal=n.map(v=>v/length),axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),uv=axis===0?[2,1]:axis===1?[0,2]:[0,1],g=group(material),start=g.positions.length/3;
      for(const v of p){g.positions.push(...v);g.normals.push(...normal);g.uvs.push(v[uv[0]],v[uv[1]]);}g.indices.push(start,start+1,start+2,start,start+2,start+3);
    }
    function tri(id,world,material){
      const p=world.map(point),n=cross(sub(p[1],p[0]),sub(p[2],p[0])),length=Math.hypot(...n);
      if(length<1e-10)throw Error('Degenerate public-front triangle '+id);
      const normal=n.map(v=>v/length),g=group(material),start=g.positions.length/3;
      for(const v of p){g.positions.push(...v);g.normals.push(...normal);g.uvs.push(v[0],v[1]);}g.indices.push(start,start+1,start+2);
    }
    function box(id,c,size,material){const h=size.map(v=>v/2),p=Array.from({length:8},(_,i)=>c.map((v,k)=>v+(i&(1<<k)?h[k]:-h[k])));for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(id,f.map(i=>p[i]),material);out.parts.push({id,kind:'box',center:c,size,material});}
    function beam(id,a,b,width,material){const d=sub(b,a),length=Math.hypot(...d),u=d.map(v=>v/length),reference=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],v0=cross(u,reference),vl=Math.hypot(...v0),v=v0.map(n=>n/vl),w=cross(u,v),p=Array.from({length:8},(_,i)=>[0,1,2].map(k=>(i&1?b:a)[k]+v[k]*(i&2?width/2:-width/2)+w[k]*(i&4?width/2:-width/2)));for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(id,f.map(i=>p[i]),material);out.parts.push({id,kind:'beam',a,b,width,material});}
    return{out,box,beam,quad,tri};
  }
  {
    const{out,box,beam,quad,tri}=owner(C.facade.mesh,C.anchor),f=C.facade;
    const openings=[f.door,f.window];out.apertures=openings;
    const ys=[...new Set([0,f.height,...openings.flatMap(o=>[o.sill,o.head])])].sort((a,b)=>a-b);
    for(let j=1;j<ys.length;j++){
      const lo=ys[j-1],hi=ys[j],y=(lo+hi)/2,holes=openings.filter(o=>y>o.sill&&y<o.head).sort((a,b)=>a.x0-b.x0);let cursor=f.x0;
      for(const[index,h]of[...holes,{x0:f.x1,x1:f.x1}].entries()){
        if(h.x0>cursor)box(`actual-front-split-${j}-${index}`,[(cursor+h.x0)/2,y,3.11],[h.x0-cursor,hi-lo,.34],0);
        cursor=Math.max(cursor,h.x1);
      }
    }
    for(const[index,[a,b]]of[[74,78],[80,98]].entries()){
      box('front-plinth-'+index,[(a+b)/2,.50,2.935],[b-a,.95,.26],3);
      box('front-plinth-worn-cap-'+index,[(a+b)/2,.985,2.91],[b-a,.10,.32],2);
    }
    for(const x of[74.22,81.96,89.42,97.78]){
      box('front-brick-pier-'+x,[x,4.64,2.92],[.42,9.28,.38],0);
      box('front-pier-foot-'+x,[x,.42,2.87],[.58,.52,.43],3);
      box('front-pier-cap-'+x,[x,9.13,2.87],[.63,.28,.47],2);
    }
    for(const x of[77.78,80.22]){
      box('public-entrance-stone-jamb-'+x,[x,1.76,2.91],[.28,3.52,.42],2);
      box('public-entrance-jamb-base-'+x,[x,.29,2.86],[.36,.26,.50],3);
    }
    box('public-entrance-lintel',[79,3.62,2.90],[2.78,.25,.49],2);
    for(const x of[83.79,88.21])box('W3-outer-stone-jamb-'+x,[x,2.25,2.93],[.28,2.40,.43],2);
    box('W3-outer-stone-lintel',[86,3.63,2.92],[4.55,.24,.48],2);
    box('W3-outer-rubbed-sill',[86,.995,2.86],[4.60,.105,.58],3);
    // Blind brick panels are masonry, not invented glazed rooms. Their frame
    // and repaired bond give the tall existing wall a civic rather than shed scale.
    for(const x of[79.0,86.0,94.2]){
      box('upper-blind-brick-panel-'+x,[x,6.55,2.91],[3.85,2.62,.055],0);
      for(const s of[-1,1])box('upper-panel-jamb-'+x+'-'+s,[x+s*1.99,6.55,2.895],[.13,2.82,.095],2);
      for(const s of[-1,1])box('upper-panel-course-'+x+'-'+s,[x,6.55+s*1.375,2.895],[4.11,.13,.095],2);
    }
    // The smaller old name stone belongs to the real, left-hand entrance.
    box('public-school-name-frieze',[79,3.96,2.72],[3.15,.32,.15],2);
    // A single period terracotta arts panel gives the entrance a civic centre.
    // Every stroke has depth and casts its own shadow in the game's light pass.
    box('public-arts-terracotta-panel',[79,6.55,2.79],[3.25,2.10,.10],16);
    for(const side of[-1,1]){
      box('public-arts-panel-side-'+side,[79+side*1.66,6.55,2.77],[.09,2.22,.15],2);
      box('public-arts-panel-cap-'+side,[79,6.55+side*1.075,2.77],[3.40,.09,.15],2);
    }
    // Every raised stroke overlaps the terracotta panel by 3mm: no floating
    // lines or gap that would become a bright outline under grazing light.
    const curve=(id,points,width=.035)=>{const reliefZ=2.74-width/2+.003;for(let i=1;i<points.length;i++)beam(id+'-'+i,[points[i-1][0],points[i-1][1],reliefZ],[points[i][0],points[i][1],reliefZ],width,17);};
    for(const side of[-1,1]){
      curve('lyre-outer-'+side,[[79+side*.21,6.05],[79+side*.48,6.12],[79+side*.59,6.36],[79+side*.57,6.68],[79+side*.45,6.94],[79+side*.29,7.02]],.07);
      curve('arts-branch-'+side,[[79+side*.57,6.16],[79+side*.84,6.34],[79+side*1.03,6.57],[79+side*1.13,6.91]],.035);
      for(let i=0;i<5;i++){
        const x=79+side*(.68+i*.09),y=6.26+i*.115;
        curve('arts-leaf-'+side+'-'+i,[[x,y],[x+side*.19,y+.065],[x+side*.26,y+.16]],.032);
        curve('arts-leaf-return-'+side+'-'+i,[[x+side*.19,y+.065],[x+side*.11,y+.20]],.026);
      }
    }
    curve('lyre-crossbar',[[78.55,6.93],[79.45,6.93]],.055);
    curve('lyre-base',[[78.72,6.06],[79.28,6.06]],.07);
    for(let j=-2;j<=2;j++)curve('lyre-string-'+j,[[79+j*.095,6.14],[79+j*.14,6.91]],.019);
    // Shallow stone pediment contained below the existing 9.44m roofline.
    tri('entrance-pediment-front',[[80.73,8.26,2.72],[77.27,8.26,2.72],[79,9.08,2.72]],2);
    tri('entrance-pediment-back',[[77.27,8.26,2.84],[80.73,8.26,2.84],[79,9.08,2.84]],2);
    quad('entrance-pediment-left',[[77.27,8.26,2.84],[79,9.08,2.84],[79,9.08,2.72],[77.27,8.26,2.72]],2);
    quad('entrance-pediment-right',[[79,9.08,2.84],[80.73,8.26,2.84],[80.73,8.26,2.72],[79,9.08,2.72]],2);
    beam('entrance-pediment-base',[77.18,8.24,2.67],[80.82,8.24,2.67],.12,3);
    // Modern vertical screen is backed by the solid brick panel: it is not a window.
    for(let i=0;i<21;i++)box('hybrid-blind-screen-fin-'+i,[84.19+i*.181,6.55,2.765],[.045,2.35,.10],12);
    for(const y of[5.375,7.725])box('hybrid-blind-screen-rail-'+y,[86,y,2.765],[3.70,.035,.10],12);
    // Folded cantilever: an honest thin solid with a continuous sloping bottom,
    // upper face, front fascia, rear attachment and two end caps. No columns.
    const c=C.hybrid.canopy;
    for(let i=0;i<c.x.length-1;i++){
      const x0=c.x[i],x1=c.x[i+1],y0=c.bottomY[i],y1=c.bottomY[i+1],z0=c.frontZ,z1=c.backZ,t=c.thickness;
      quad('hybrid-canopy-bottom-'+i,[[x0,y0,z0],[x1,y1,z0],[x1,y1,z1],[x0,y0,z1]],12);
      quad('hybrid-canopy-top-'+i,[[x0,y0+t,z1],[x1,y1+t,z1],[x1,y1+t,z0],[x0,y0+t,z0]],12);
      quad('hybrid-canopy-front-'+i,[[x1,y1,z0],[x0,y0,z0],[x0,y0+t,z0],[x1,y1+t,z0]],12);
      quad('hybrid-canopy-back-'+i,[[x0,y0,z1],[x1,y1,z1],[x1,y1+t,z1],[x0,y0+t,z1]],12);
    }
    for(const i of[0,c.x.length-1]){const x=c.x[i],y=c.bottomY[i],corners=[[x,y,c.frontZ],[x,y+c.thickness,c.frontZ],[x,y+c.thickness,c.backZ],[x,y,c.backZ]];quad('hybrid-canopy-end-'+i,i===0?corners.reverse():corners,12);}
    out.parts.push({id:'hybrid-canopy',kind:'folded-canopy',...c,projectingFromWall:f.planeZ-c.frontZ});
    // Separate, compact diffusers: they correspond to actual light sources.
    box('hybrid-canopy-entrance-housing',[79,4.135,1.95],[.20,.040,.20],12);
    box('hybrid-canopy-entrance-diffuser',[79,4.111,1.95],[.11,.008,.11],13);
    box('hybrid-canopy-window-housing',[86.4,3.817,1.95],[.20,.024,.20],12);
    box('hybrid-canopy-window-diffuser',[86.4,3.801,1.95],[.11,.008,.11],14);
    box('hybrid-canopy-relief-housing',[79,4.275,2.42],[.15,.020,.15],12);
    box('hybrid-canopy-relief-diffuser',[79,4.287,2.42],[.085,.008,.085],15);
    // A deep contemporary outer liner stops short of the true W3 aperture.
    for(const x of[83.92,88.08])box('hybrid-W3-vertical-liner-'+x,[x,2.25,2.68],[.14,2.41,.55],12);
    box('hybrid-W3-head-liner',[86,3.53,2.68],[4.28,.14,.55],12);
    box('hybrid-W3-sill-liner',[86,.97,2.68],[4.28,.13,.55],12);
    for(const y of[3.84,4.85,8.17,9.36])box('front-continuous-course-'+y,[86,y,2.91],[24.10,y===9.36?.15:.11,.34],2);
    box('foundation-date-stone',[95.4,1.40,2.875],[1.28,.47,.26],2);
    box('closure-case-back',[81.08,1.78,2.81],[1.34,.85,.16],8);
    for(const x of[80.43,81.73])box('closure-case-side-'+x,[x,1.78,2.71],[.055,.85,.055],8);
    for(const y of[1.38,2.18])box('closure-case-rail-'+y,[81.08,y,2.71],[1.34,.055,.055],8);
    box('later-brick-repair-low',[92.1,1.25,2.925],[1.04,.43,.04],1);
    box('later-stone-indent',[75.2,2.36,2.925],[.62,.31,.04],3);
    // Rainwater goods end in a real shoe above the forecourt gully.
    box('front-downpipe',[97.43,4.79,2.70],[.13,9.12,.13],5);
    for(const y of[1.2,3.1,5.1,7.1,9.1])box('front-downpipe-collar-'+y,[97.43,y,2.71],[.20,.06,.19],5);
    beam('front-downpipe-shoe',[97.43,.27,2.70],[97.43,.20,2.43],.13,5);
    for(const x of[76.92,81.10]){
      box('public-lamp-wall-plate-'+x,[x,2.85,2.79],[.15,.29,.13],5);
      beam('public-lamp-bracket-'+x,[x,2.85,2.78],[x,2.79,2.43],.055,5);
      box('public-lamp-body-'+x,[x,2.72,2.41],[.24,.34,.19],5);
      box('public-lamp-diffuser-'+x,[x,2.72,2.306],[.17,.23,.025],9);
      box('public-lamp-cap-'+x,[x,2.92,2.41],[.31,.06,.25],5);
    }
    // Part of the public front mesh so exterior collision can own the bench.
    // It stays entirely in the .6m wall-side band, with its seat top at .62m.
    for(const x of[94.42,95.98])box('hybrid-bench-stone-leg-'+x,[x,.37,2.68],[.22,.44,.36],3);
    box('hybrid-bench-seat',[95.2,.59,2.68],[2.10,.06,.48],19);
    box('hybrid-bench-back',[95.2,.83,2.86],[2.10,.42,.10],19);
  }
  {
    const{box}=owner(C.forecourt.mesh,C.anchor),f=C.forecourt,top=f.drawnFloor+.002;
    box('forecourt-joint-bed',[86,f.drawnFloor-.035,1.25],[24,.07,3.50],7);
    for(let ix=0;ix<20;ix++)for(let iz=0;iz<4;iz++){
      const x=74+(ix+.5)*1.20,z=-.5+(iz+.5)*.875;
      box(`forecourt-flag-${ix}-${iz}`,[x,top-.035,z],[1.18,.07,.855],ix%7===0&&iz===3?3:6);
    }
    for(const x of[74.72,97.43]){
      box('forecourt-gully-dark-'+x,[x,top+.003,2.39],[.42,.025,.30],4);
      for(let k=0;k<4;k++)box('forecourt-gully-grate-'+x+'-'+k,[x-.15+k*.10,top+.017,2.39],[.025,.018,.30],5);
    }
    // Six millimetres of expressed inlay over the real flags avoids z-fighting;
    // the step remains below both collision and foot-comfort thresholds.
    box('hybrid-forecourt-entry-inlay',[79,f.drawnFloor+.005,1.0],[1.48,.008,2.70],18);
    for(const x of[78.64,79,79.36])box('hybrid-forecourt-bronze-line-'+x,[x,f.drawnFloor+.010,1.0],[.018,.004,2.70],12);
  }
  {
    const f=C.fanlight,{box,beam}=owner(f.mesh,{x:(f.x0+f.x1)/2,z:f.planeZ}),mid=(f.sill+f.head)/2;
    for(const x of[f.x0+.035,f.x1-.035])box('D0-high-fanlight-jamb-'+x,[x,mid,f.planeZ],[.07,f.head-f.sill,.12],8);
    for(const y of[f.sill+.04,f.head-.04])box('D0-high-fanlight-head-foot-'+y,[(f.x0+f.x1)/2,y,f.planeZ],[f.x1-f.x0,.08,.12],8);
    for(const x of[f.x0+(f.x1-f.x0)/3,f.x0+(f.x1-f.x0)*2/3])box('D0-high-fanlight-mullion-'+x,[x,mid,f.planeZ],[.045,f.head-f.sill-.13,.10],8);
    for(const x of[f.x0+.10,f.x1-.10])box('D0-high-pane-edge-'+x,[x,mid,f.planeZ+.008],[.008,f.head-f.sill-.20,.008],10);
    beam('D0-high-pane-water-mark',[f.x0+.32,f.sill+.48,f.planeZ+.015],[f.x0+.35,f.sill+.81,f.planeZ+.015],.006,11);
    // No opaque pane or broad backing. The shared sightline air cut owns what
    // the player can see, while the original door system retains the leaves.
  }
  for(const m of meshes){m.bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const g of m.primitives)for(let i=0;i<g.positions.length;i++){const k=i%3;m.bounds.min[k]=Math.min(m.bounds.min[k],g.positions[i]);m.bounds.max[k]=Math.max(m.bounds.max[k],g.positions[i]);}m.triangles=m.primitives.reduce((n,g)=>n+g.indices.length/3,0);}
  return meshes;
}

export function heroFingerprint(mesh){
 const hash=crypto.createHash('sha256');
 for(const p of mesh.listPrimitives()){
  for(const semantic of p.listSemantics().sort()){const a=p.getAttribute(semantic).getArray();hash.update(semantic);hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
  const a=p.getIndices().getArray();hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  const m=p.getMaterial();hash.update(JSON.stringify({name:m.getName(),color:m.getBaseColorFactor(),metallic:m.getMetallicFactor(),roughness:m.getRoughnessFactor(),emissive:m.getEmissiveFactor(),extras:m.getExtras()}));
  for(const getter of['getBaseColorTexture','getNormalTexture','getMetallicRoughnessTexture','getOcclusionTexture','getEmissiveTexture']){const t=m[getter]();if(t)hash.update(t.getImage());}
 }
 return hash.digest('hex');
}
