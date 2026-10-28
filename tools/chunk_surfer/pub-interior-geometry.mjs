// Complete ordinary opaque pub fittings in district-civic local metres.
// Furniture floor Y0 is placed at world Y+.12 by the owning pub prop. The
// shell, real entry, walls, collision installation and lights are root-owned.
import {PUB_INTERIOR_LAYOUT,PUB_FURNITURE_COLLIDERS,PUB_LIGHT_ANCHORS} from '../../src/data/exterior-pub-furnishings.js';
export {PUB_INTERIOR_LAYOUT,PUB_FURNITURE_COLLIDERS,PUB_LIGHT_ANCHORS};
export const PUB_INTERIOR_LIGHT_ANCHORS=PUB_LIGHT_ANCHORS;
const furniture=PUB_INTERIOR_LAYOUT.furniture;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const mat=(name,rgb,metallic=0,roughness=.9)=>({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:metallic,roughnessFactor:roughness}});
const PALETTE=freeze({
  timber:mat('dark wood',[.16,.095,.052],0,.72),wood:mat('worn wood',[.34,.20,.095],0,.68),
  green:mat('pub green upholstery',[.060,.135,.090],0,.94),
  brass:mat('brass',[.49,.31,.08],.8,.25),black:mat('black lacquer',[.025,.028,.03],.15,.28),
  ivory:mat('ivory',[.82,.80,.69],0,.58),mirror:mat('oxidised bronze',[.16,.29,.24],.72,.58),
  bottleGreen:mat('pub green bottle glass',[.060,.135,.085],.03,.27),
  bottleBrown:mat('pub brown bottle glass',[.195,.083,.034],.02,.29),
  lamp:mat('pub warm lamp glass',[.72,.52,.25],0,.40),
  painting:mat('dull terracotta',[.42,.17,.08],0,.86),
  plaster:mat('academic plaster',[.63,.62,.55],0,.92),
  tile:mat('municipal glazed brick',[.24,.39,.34],.02,.35),
});
const rotate=(x,z,yaw)=>[x*Math.cos(yaw)-z*Math.sin(yaw),x*Math.sin(yaw)+z*Math.cos(yaw)];

export function buildPubInterior({mesh,materials,addBox,addBeam,addCylinder,addQuad}){
  if(typeof mesh!=='function'||!Array.isArray(materials)||[addBox,addBeam,addCylinder,addQuad].some(f=>typeof f!=='function'))throw Error('Pub interior requires the normal opaque primitive builder API.');
  const materialCount=materials.length,ids={};
  for(const[key,descriptor]of Object.entries(PALETTE)){
    let i=materials.findIndex(m=>m.name===descriptor.name);
    if(i<0){i=materials.length;materials.push(structuredClone(descriptor));}ids[key]=i;
  }
  const origin=PUB_INTERIOR_LAYOUT.meshOriginInRow,local=p=>[p[0]-origin.x,p[1]-origin.y,p[2]-origin.z];
  const m=mesh(PUB_INTERIOR_LAYOUT.mesh),stats={mesh:m.name,origin:structuredClone(origin),triangles:0,newMaterials:materials.length-materialCount,materials:ids,fixtures:[],parts:[],bottles:0,
    colliders:structuredClone(PUB_FURNITURE_COLLIDERS),
    lightAnchors:structuredClone(PUB_INTERIOR_LAYOUT.lightAnchors)};
  let active,activePart=null,primitiveCount=0;
  const point=p=>{for(const bounds of[active,activePart])if(bounds)for(let i=0;i<3;i++){bounds.min[i]=Math.min(bounds.min[i],p[i]);bounds.max[i]=Math.max(bounds.max[i],p[i]);}};
  const count=n=>{stats.triangles+=n;active.triangles+=n;primitiveCount++;};
  const box=(c,s,material='timber',yaw=0)=>{
    addBox(m,local(c),s,ids[material],yaw);
    for(const x of[-s[0]/2,s[0]/2])for(const y of[-s[1]/2,s[1]/2])for(const z of[-s[2]/2,s[2]/2]){const[a,b]=rotate(x,z,yaw);point([c[0]+a,c[1]+y,c[2]+b]);}count(12);
  };
  const cylinder=(c,r,h,material='timber',sides=8)=>{
    addCylinder(m,local(c),r,h,ids[material],sides);
    for(let i=0;i<sides;i++)for(const y of[-h/2,h/2])point([c[0]+Math.cos(i/sides*Math.PI*2)*r,c[1]+y,c[2]+Math.sin(i/sides*Math.PI*2)*r]);count(sides*4);
  };
  const beam=(a,b,w,material='brass')=>{
    addBeam(m,local(a),local(b),w,ids[material]);
    const u=b.map((v,i)=>v-a[i]),length=Math.hypot(...u);for(let i=0;i<3;i++)u[i]/=length;
    const ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],cross=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]],s=cross(u,ref),sl=Math.hypot(...s);for(let i=0;i<3;i++)s[i]/=sl;const t=cross(s,u);
    for(const p of[a,b])for(const ds of[-1,1])for(const dt of[-1,1])point(p.map((v,i)=>v+s[i]*ds*w/2+t[i]*dt*w/2));count(12);
  };
  const quad=(a,b,c,d,material)=>{addQuad(m,local(a),local(b),local(c),local(d),ids[material]);[a,b,c,d].forEach(point);count(2);};
  const part=(id,kind,build,extra={})=>{
    activePart={id,kind,fixtureId:active.id,primitiveStart:primitiveCount,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],...extra};
    stats.parts.push(activePart);build();activePart.primitiveCount=primitiveCount-activePart.primitiveStart;activePart=null;
  };
  // Closed eight-sided sections read round without a separate material or
  // unsupported box end. Caps are convex quads, with no degenerate triangles.
  const roundBeam=(a,b,r,material='brass')=>{
    const u=b.map((v,i)=>v-a[i]),length=Math.hypot(...u);for(let i=0;i<3;i++)u[i]/=length;
    const ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],cross=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]],s=cross(u,ref),sl=Math.hypot(...s);for(let i=0;i<3;i++)s[i]/=sl;const t=cross(s,u);
    const ring=p=>Array.from({length:8},(_,i)=>p.map((v,k)=>v+r*(s[k]*Math.cos(i*Math.PI/4)+t[k]*Math.sin(i*Math.PI/4)))),lo=ring(a),hi=ring(b);
    for(let i=0;i<8;i++){const j=(i+1)%8;quad(lo[i],hi[i],hi[j],lo[j],material);}
    for(let i=1;i<7;i+=2){quad(lo[0],lo[i],lo[i+1],lo[i+2],material);quad(hi[0],hi[i+2],hi[i+1],hi[i],material);}
  };
  const taper=(x,z,y0,r0,y1,r1,material,sides=8)=>{
    for(let i=0;i<sides;i++){
      const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;
      quad([x+Math.cos(a)*r0,y0,z+Math.sin(a)*r0],[x+Math.cos(a)*r1,y1,z+Math.sin(a)*r1],
        [x+Math.cos(b)*r1,y1,z+Math.sin(b)*r1],[x+Math.cos(b)*r0,y0,z+Math.sin(b)*r0],material);
    }
  };
  const fixture=(id,kind,build)=>{active={id,kind,triangles:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};stats.fixtures.push(active);build();};
  const banquette=f=>{
    const at=([x,y,z])=>{const[a,b]=rotate(x,z,f.yaw);return[f.x+a,y,f.z+b];};
    const b=(c,s,mat)=>box(at(c),s,mat,f.yaw);
    part(`${f.id}-plinth`,'banquette-plinth',()=>b([0,.032,0],[.58,.040,f.length-.12],'timber'),{supportY:PUB_INTERIOR_LAYOUT.floorFinish.topY});
    b([0,.23,0],[.66,.38,f.length],'timber');
    b([-.245,.80,0],[.15,.94,f.length],'timber');
    b([-.235,1.265,0],[.19,.07,f.length],'wood');
    b([.265,.12,0],[.08,.15,f.length-.03],'wood');
    const n=Math.max(2,Math.round(f.length/1.05)),span=f.length/n;
    for(let i=0;i<n;i++){
      const z=-f.length/2+span*(i+.5);
      b([.015,.46,z],[.58,.11,span-.035],'green');
      b([-.145,.90,z],[.12,.64,span-.035],'green');
    }
    for(const z of[-f.length/2+.055,f.length/2-.055])b([.015,.69,z],[.63,.17,.11],'wood');
  };
  const chair=f=>{
    box([f.x,.455,f.z],[.48,.075,.48],'wood');
    for(const dz of[-.225,.225])part(`${f.id}-stile-${dz}`,'chair-stile',()=>
      beam([f.x+.18,.42,f.z+dz],[f.x+.245,1.105,f.z+dz],.055,'timber'));
    box([f.x+.205,.65,f.z],[.06,.07,.47],'wood');
    box([f.x+.233,1.01,f.z],[.055,.055,.47],'wood');
    box([f.x+.23,.84,f.z],[.04,.31,.36],'timber');
    box([f.x+.20,.84,f.z],[.04,.275,.325],'green');
    part(`${f.id}-crest`,'chair-crest',()=>{
      const p=z=>[f.x+.245,1.075+.035*(1-(z/.2525)**2),f.z+z];
      for(let i=0;i<6;i++)beam(p(-.2525+i*.505/6),p(-.2525+(i+1)*.505/6),.055,'wood');
    });
    for(const dx of[-.18,.18])for(const dz of[-.18,.18])box([f.x+dx,.225,f.z+dz],[.065,.45,.065],'timber');
    for(const dz of[-.18,.18])box([f.x,.20,f.z+dz],[.40,.055,.055],'timber');
  };
  const bottle=(x,y,z,index,extra={})=>{
    const material=index%3?'bottleGreen':'bottleBrown',styles=[{h:.304,r:.049,body:.61,neck:.44},{h:.354,r:.041,body:.66,neck:.42},
      {h:.332,r:.046,body:.57,neck:.40},{h:.320,r:.044,body:.64,neck:.48}],style=styles[index%styles.length],{h,r}=style;
    part(`pub-backbar-bottle-${stats.bottles}`,'shelf-bottle',()=>{
      cylinder([x,y+.006,z],r*.92,.012,material,6);
      cylinder([x,y+.010+h*style.body/2,z],r,h*style.body,material,6);
      taper(x,z,y+.009+h*style.body,r,y+h*.77,r*style.neck,material,6);
      cylinder([x,y+h*.865,z],r*style.neck,h*.192,material,6);
      cylinder([x,y+h*.98,z],r*style.neck*1.20,h*.04,'black',6);
      // A few short blank bands give scale; open glass and varied shoulders
      // carry the rest, rather than forty-two identical pale pegs.
      if(index%4===0)cylinder([x,y+h*.38,z],r+.001,.038,'ivory',6);
    },{shelfTop:y,profile:index%styles.length,...extra});stats.bottles++;
  };
  fixture('pub-basketweave-parquet','floor-finish',()=>{
    const zones=[{x0:-5.25,x1:-.20,z0:-31.88,z1:-18.06},{x0:-2.64,x1:-.20,z0:-18.06,z1:-16.15}];
    const y=PUB_INTERIOR_LAYOUT.floorFinish.topY,side=.92,gap=.008;
    for(const r of zones){
      for(let z=r.z0,row=0;z<r.z1;z+=side,row++)for(let x=r.x0,col=0;x<r.x1;x+=side,col++){
        const turn=(row+col)%2;
        for(let board=0;board<4;board++){
          const x0=x+(turn?board*.23:0)+gap/2,x1=Math.min(r.x1,x+(turn?(board+1)*.23:side)-gap/2);
          const z0=z+(turn?0:board*.23)+gap/2,z1=Math.min(r.z1,z+(turn?side:(board+1)*.23)-gap/2);
          if(x1>x0&&z1>z0)quad([x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0],'wood');
        }
      }
    }
    // Broad timber borders sit at the same joined surface height, outside
    // the parquet field; no dense alternate-colour checker is introduced.
    box([-.235,.006,(-31.88-16.15)/2],[.07,.012,15.73],'timber');
  });
  fixture('pub-wc-tiled-floor','floor-finish',()=>{
    const y=.014;
    for(let x=-5.18;x<-2.76;x+=.40)for(let z=-17.93;z<-16.37;z+=.40){
      const x1=Math.min(x+.392,-2.76),z1=Math.min(z+.392,-16.37);
      quad([x,y,z],[x,y,z1],[x1,y,z1],[x1,y,z],'tile');
    }
  });
  fixture('pub-panelling-skirts-and-rails','wall-finish',()=>{
    // The entry/window wall remains shell-owned; do not trim across doors.
    box([-5.235,.10,-24],[.055,.18,15.65],'timber');
    box([-5.235,.68,-24],[.045,1.02,15.65],'timber');
    box([-5.20,1.225,-24],[.08,.075,15.65],'wood');
    box([-5.205,2.79,-24],[.065,.055,15.65],'wood');
    for(let z=-31.6;z<-16.3;z+=.96)box([-5.205,.69,z],[.035,.94,.045],'wood');
    for(const z of[-31.84,-16.16]){
      box([-2.75,.10,z],[4.92,.18,.055],'timber');
      box([-2.75,.68,z],[4.92,1.02,.045],'timber');
      box([-2.75,1.225,z],[4.92,.075,.08],'wood');
      box([-2.75,2.79,z],[4.92,.055,.065],'wood');
      for(let x=-5.0;x<-.3;x+=.94)box([x,.69,z+(z<-24?.025:-.025)],[.045,.94,.035],'wood');
    }
  });
  fixture('pub-ceiling-coving-and-roses','ceiling-finish',()=>{
    for(const x of[-5.16,-.34]){
      box([x,3.325,-24],[.15,.15,15.65],'plaster');
      box([x+(x<-2.7?.06:-.06),3.235,-24],[.11,.045,15.65],'wood');
    }
    for(const z of[-31.76,-16.24]){
      box([-2.75,3.325,z],[4.92,.15,.15],'plaster');
      box([-2.75,3.235,z+(z<-24?.06:-.06)],[4.92,.045,.11],'wood');
    }
    for(const x of[-4.82,-.70])box([x,3.365,-24],[.045,.045,14.55],'plaster');
    for(const z of[-31.25,-16.75])box([-2.76,3.365,z],[4.16,.045,.045],'plaster');
    for(const p of PUB_INTERIOR_LAYOUT.pendants){
      cylinder([p.x,3.385,p.z],.235,.025,'plaster',12);
      cylinder([p.x,3.358,p.z],.14,.032,'plaster',12);
    }
  });
  for(const f of furniture)fixture(f.id,f.kind,()=>{
    if(f.kind==='banquette')banquette(f);
    if(f.kind==='chair')chair(f);
    if(f.kind==='table'){
      part(`${f.id}-top`,'table-top',()=>{
        cylinder([f.x,.755,f.z],.455,.07,'wood',24);
        taper(f.x,f.z,.72,.455,.730,.47,'wood',24);
        taper(f.x,f.z,.730,.47,.775,.47,'wood',24);
        taper(f.x,f.z,.775,.47,.790,.455,'wood',24);
      });
      cylinder([f.x,.705,f.z],.40,.045,'timber',12);
      part(`${f.id}-pedestal`,'table-pedestal',()=>{
        cylinder([f.x,.37,f.z],.085,.66,'timber',8);
        cylinder([f.x,.67,f.z],.115,.045,'wood',8);
        cylinder([f.x,.12,f.z],.125,.060,'wood',8);
      });
      for(const dz of[-.31,.31])box([f.x,.065,f.z+dz],[.72,.10,.11],'timber');
      box([f.x,.035,f.z],[.12,.07,.76],'timber');
    }
    if(f.kind==='counter'){
      box([f.x,.53,f.z],[.68,1.06,f.length-.04],'timber');
      box([f.x-.0125,1.095,f.z],[.715,.09,f.length],'wood');
      part('pub-counter-rounded-arris','counter-arris',()=>roundBeam(
        [f.x+.345,1.115,f.z-f.length/2],[f.x+.345,1.115,f.z+f.length/2],.025,'wood'));
      box([f.x+0.365,1.025,f.z],[.035,.09,f.length-.08],'brass');
      for(const z of[-23.65,-21.575,-19.50]){
        box([f.x+0.353,.57,z],[.032,.68,1.80],'wood');
        for(const dz of[-.90,.90])box([f.x+0.382,.57,z+dz],[.025,.74,.045],'timber');
      }
      part('pub-counter-footrail','footrail-run',()=>roundBeam([f.x+.610,.23,-24.55],[f.x+.610,.23,-18.55],.0225));
      for(const z of[-24.3,-23.2,-22.1,-21.0,-19.9,-18.8]){
        part(`pub-counter-socket-${z}`,'footrail-socket',()=>roundBeam([f.x+.328,.14,z],[f.x+.352,.14,z],.044));
        part(`pub-counter-bracket-${z}`,'footrail-bracket',()=>{
          beam([f.x+.340,.14,z],[f.x+.610,.14,z],.035,'brass');
          beam([f.x+.610,.14,z],[f.x+.610,.23,z],.035,'brass');
        });
      }
      for(const z of[-22.10,-21.65,-21.20]){
        cylinder([f.x+0.030,1.18,z],.065,.08,'brass',8);
        beam([f.x+0.030,1.20,z],[f.x+0.030,1.43,z],.045,'brass');
        beam([f.x+0.030,1.43,z],[f.x+0.240,1.43,z],.045,'brass');
        cylinder([f.x+0.030,1.48,z],.040,.12,'black',8);
      }
      box([f.x+0.120,1.151,-21.65],[.24,.022,1.42],'black');
    }
    if(f.kind==='backbar'){
      box([f.x,.48,f.z],[.31,.96,f.length-.02],'timber');
      box([f.x,1.015,f.z],[.32,.09,f.length],'wood');
      box([-5.265,1.87,f.z],[.025,1.68,f.length-.02],'timber');
      const stiles=[-24.85,-22.70,-20.50,-18.35];
      for(const z of stiles)part(`pub-backbar-stile-${z}`,'shelf-stile',()=>box([-5.10,1.86,z],[.26,1.66,.065],'wood'));
      for(const [row,y]of[1.08,1.62,2.16].entries()){
        part(`pub-backbar-shelf-${row}`,'shelf-surface',()=>box([-5.105,y,f.z],[.28,.055,f.length-.08],'wood'));
        let index=0;
        for(let bay=0;bay<3;bay++){
          const count=bay===1?4:5,lo=stiles[bay]+.16,hi=stiles[bay+1]-.16;
          for(let n=0;n<count;n++){
            const z=lo+(hi-lo)*(n+.5)/count;
            bottle(-5.095,y+.0275,z,index++ + row*5,{row,bay});
          }
        }
      }
      part('pub-backbar-cornice','shelf-cornice',()=>box([-5.115,2.62,f.z],[.29,.12,f.length],'wood'));
      for(const z of[-23.65,-21.60,-19.55])box([-4.959,.48,z],[.018,.63,1.85],'wood');
    }
    if(f.kind==='stool'){
      cylinder([f.x,.785,f.z],.255,.095,'green',10);
      cylinder([f.x,.724,f.z],.26,.045,'wood',10);
      for(const dx of[-.18,.18])for(const dz of[-.18,.18])box([f.x+dx,.36,f.z+dz],[.055,.72,.055],'timber');
      for(const dz of[-.18,.18])box([f.x,.26,f.z+dz],[.41,.045,.045],'brass');
      for(const dx of[-.18,.18])box([f.x+dx,.26,f.z],[.045,.045,.41],'brass');
    }
    if(f.kind==='stove'){
      box([f.x,.045,f.z],[1.28,.09,.90],'black');
      box([f.x,.47,f.z],[.68,.74,.48],'black');
      box([f.x,.87,f.z],[.78,.08,.55],'black');
      for(const dx of[-.26,.26])for(const dz of[-.17,.17])box([f.x+dx,.13,f.z+dz],[.07,.20,.07],'black');
      box([f.x,.50,f.z+.255],[.49,.44,.035],'mirror');
      box([f.x+.22,.50,f.z+.285],[.045,.22,.045],'brass');
      cylinder([f.x,1.53,f.z-.08],.075,1.28,'black',8);
      cylinder([f.x,2.18,f.z-.08],.10,.06,'black',8);
    }
    if(f.kind==='toilet'){
      cylinder([f.x,.17,f.z],.19,.34,'ivory',12);
      cylinder([f.x,.34,f.z],.27,.18,'ivory',12);
      cylinder([f.x,.431,f.z],.20,.015,'black',12);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
        quad([f.x+Math.cos(a)*.20,.455,f.z+Math.sin(a)*.20],[f.x+Math.cos(b)*.20,.455,f.z+Math.sin(b)*.20],
          [f.x+Math.cos(b)*.29,.455,f.z+Math.sin(b)*.29],[f.x+Math.cos(a)*.29,.455,f.z+Math.sin(a)*.29],'ivory');
      }
      box([-5.045,.65,f.z],[.20,.62,.58],'ivory');
      box([-4.83,.31,f.z],[.28,.22,.25],'ivory');
      box([-4.945,.72,f.z],[.04,.40,.49],'ivory');
      box([-4.925,.85,f.z+.20],[.035,.045,.07],'brass');
      box([-5.13,.20,f.z],[.04,.15,.11],'black');
    }
    if(f.kind==='basin'){
      cylinder([f.x,.78,f.z],.23,.13,'ivory',12);
      cylinder([f.x,.849,f.z],.16,.014,'black',12);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
        quad([f.x+Math.cos(a)*.16,.86,f.z+Math.sin(a)*.16],[f.x+Math.cos(b)*.16,.86,f.z+Math.sin(b)*.16],
          [f.x+Math.cos(b)*.23,.86,f.z+Math.sin(b)*.23],[f.x+Math.cos(a)*.23,.86,f.z+Math.sin(a)*.23],'ivory');
      }
      beam([f.x,.72,f.z],[f.x,.40,f.z],.055,'brass');
      beam([f.x,.40,f.z],[f.x,.40,-17.94],.055,'brass');
      beam([f.x,.88,-17.88],[f.x,1.02,-17.88],.035,'brass');
      beam([f.x,1.02,-17.88],[f.x,1.02,-17.69],.035,'brass');
      for(const x of[-.14,.14])cylinder([f.x+x,.90,-17.88],.035,.04,'brass',8);
    }
  });
  fixture('pub-wc-partitions','wc-wall',()=>{
    const w=PUB_INTERIOR_LAYOUT.wc.bounds,t=PUB_INTERIOR_LAYOUT.wc.wallThickness;
    box([(w.x0+w.x1)/2,1.70,w.z0],[w.x1-w.x0,3.40,t],'plaster');
    box([(w.x0+w.x1)/2,1.70,w.z1],[w.x1-w.x0,3.40,t],'plaster');
    box([w.x0,1.70,(w.z0+w.z1)/2],[t,3.40,w.z1-w.z0],'plaster');
    for(const[a,b]of[[w.z0,-17.75],[-16.75,w.z1]])box([w.x1,1.70,(a+b)/2],[t,3.40,b-a],'plaster');
    // The dynamic standard frame/leaf and masonry head own the full-height
    // gap. Never place a static door or custom lintel across its opening.
    for(const z of[w.z0+.065,w.z1-.065])box([(w.x0+w.x1)/2,.46,z],[w.x1-w.x0-.12,.86,.025],'ivory');
  });
  fixture('pub-wc-ceiling-practical','ceiling-practical',()=>{
    // A porcelain ceiling mount and opaque warm diffuser motivate the
    // separate ordinary point light even with the privacy door shut.
    cylinder([-3.80,3.30,-16.70],.095,.20,'ivory',12);
    cylinder([-3.80,3.18,-16.70],.16,.14,'ivory',12);
    cylinder([-3.80,3.105,-16.70],.125,.08,'lamp',12);
  });
  fixture('pub-wc-mirror','wall-mirror',()=>{
    box([-4.15,1.70,-17.925],[.70,.95,.045],'wood');
    box([-4.15,1.70,-17.895],[.59,.83,.025],'mirror');
  });
  for(const p of PUB_INTERIOR_LAYOUT.pendants)fixture(p.id,'pendant',()=>{
    cylinder([p.x,3.16,p.z],.013,.48,'black',8);
    cylinder([p.x,3.37,p.z],.09,.05,'brass',8);
    const sides=10;
    for(let i=0;i<sides;i++){
      const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;
      quad([p.x+Math.cos(a)*.07,2.96,p.z+Math.sin(a)*.07],[p.x+Math.cos(b)*.07,2.96,p.z+Math.sin(b)*.07],
        [p.x+Math.cos(b)*.24,2.61,p.z+Math.sin(b)*.24],[p.x+Math.cos(a)*.24,2.61,p.z+Math.sin(a)*.24],'brass');
    }
    cylinder([p.x,2.635,p.z],.055,.075,'lamp',8);
  });
  for(const[z,w]of[[-30.1,1.25],[-28.3,1.05]])fixture(`pub-snug-picture-${z}`,'wall-picture',()=>{
    box([-5.275,2.03,z],[.04,.85,w],'timber');
    for(const y of[1.60,2.46])box([-5.235,y,z],[.07,.07,w+.10],'wood');
    for(const dz of[-w/2,w/2])box([-5.235,2.03,z+dz],[.07,.85,.07],'wood');
    box([-5.245,2.03,z],[.018,.70,w-.10],'painting');
    box([-5.230,1.90,z],[.012,.17,w-.13],'mirror');
    box([-5.220,2.08,z+w*.14],[.008,.19,w*.32],'wood');
  });
  fixture('pub-return-mirror','wall-mirror',()=>{
    box([-1.08,1.92,-16.11],[1.35,1.36,.06],'timber');
    box([-1.08,1.92,-16.07],[1.18,1.17,.025],'mirror');
    for(const x of[-1.76,-.40])box([x,1.92,-16.06],[.065,1.40,.06],'brass');
    for(const y of[1.23,2.61])box([-1.08,y,-16.06],[1.42,.065,.06],'wood');
  });
  if(stats.triangles>PUB_INTERIOR_LAYOUT.maximumTriangles)throw Error(`Pub interior exceeds its reviewed triangle budget: ${stats.triangles}`);
  return stats;
}
