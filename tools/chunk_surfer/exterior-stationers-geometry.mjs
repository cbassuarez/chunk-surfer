import{EXTERIOR_STATIONERS as S,STATIONERS_FURNITURE,STATIONERS_LIGHTS,stationersLocal}from'../../src/data/exterior-stationers.js';
const EPS=1e-9,cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((v,k)=>v-b[k]);
const interpolate=(a,b,t)=>({position:a.position.map((v,k)=>v+(b.position[k]-v)*t),normal:a.normal.map((v,k)=>v+(b.normal[k]-v)*t),uv:a.uv.map((v,k)=>v+(b.uv[k]-v)*t)});
function splitPolygon(points,axis,bound,sign){
  const inside=[],outside=[],distance=p=>(p.position[axis]-bound)*sign;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b),ai=da>=-EPS,bi=db>=-EPS;
    (ai?inside:outside).push(a);
    if(ai!==bi){const p=interpolate(a,b,da/(da-db));inside.push(p);outside.push(p);}
  }
  return{inside,outside};
}
export function subtractTriangleBox(triangle,box=S.carve){
  if([0,1,2].some(k=>triangle.every(v=>v.position[k]<box.min[k]-EPS)||triangle.every(v=>v.position[k]>box.max[k]+EPS)))return{changed:false,triangles:[triangle]};
  let remaining=triangle;const kept=[];
  for(const[axis,bound,sign]of[[0,box.min[0],1],[0,box.max[0],-1],[1,box.min[1],1],[1,box.max[1],-1],[2,box.min[2],1],[2,box.max[2],-1]]){
    if(remaining.length<3)break;
    const split=splitPolygon(remaining,axis,bound,sign);if(split.outside.length>=3)kept.push(split.outside);remaining=split.inside;
  }
  const out=[];
  for(const p of kept)for(let j=1;j<p.length-1;j++){
    const t=[p[0],p[j],p[j+1]],n=cross(sub(t[1].position,t[0].position),sub(t[2].position,t[0].position));if(Math.hypot(...n)>1e-10)out.push(t);
  }
  if(out.length===1&&out[0].every((p,i)=>p===triangle[i]))return{changed:false,triangles:[triangle]};
  return{changed:true,triangles:out};
}
export const STATIONERS_MATERIALS=[
  {name:'stationers cream lime-painted plaster',rgb:[.43,.40,.31],roughness:.92,metallic:0},
  {name:'stationers linoleum floor',rgb:[.16,.145,.10],roughness:.84,metallic:0},
  {name:'stationers worn ash joinery',rgb:[.25,.15,.075],roughness:.73,metallic:0},
  {name:'stationers deep green painted joinery',rgb:[.055,.075,.062],roughness:.78,metallic:0},
  {name:'stationers paper stock',rgb:[.63,.60,.49],roughness:.96,metallic:0},
  {name:'stationers carton board',rgb:[.24,.18,.10],roughness:.98,metallic:0},
  {name:'stationers blackened fitting',rgb:[.025,.032,.030],roughness:.72,metallic:.12},
  {name:'stationers duplicator enamel',rgb:[.30,.32,.27],roughness:.61,metallic:.04},
  {name:'stationers printer roller',rgb:[.035,.037,.032],roughness:.91,metallic:0},
  {name:'stationers lamp diffuser',rgb:[.58,.48,.28],roughness:.59,metallic:0,emissive:[.48,.32,.12]},
];
export function stationersRoomGeometry(){
  const mesh={name:S.room.mesh,primitives:[],parts:[]},group=material=>mesh.primitives.find(g=>g.material===material)||(mesh.primitives.push({material,positions:[],normals:[],uvs:[],indices:[]}),mesh.primitives.at(-1));
  const point=([x,y,z])=>stationersLocal({x,y,z});
  const quad=(id,world,material)=>{const points=world.map(point),g=group(material),start=g.positions.length/3,n=cross(sub(points[1],points[0]),sub(points[2],points[0])),length=Math.hypot(...n);if(length<1e-10)throw Error(`Degenerate shop quad ${id}`);const normal=n.map(v=>v/length),major=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),axes=major===0?[2,1]:major===1?[0,2]:[0,1];for(const p of points){g.positions.push(...p);g.normals.push(...normal);g.uvs.push(p[axes[0]],p[axes[1]]);}g.indices.push(start,start+1,start+2,start,start+2,start+3);};
  const box=(id,c,size,material)=>{const h=size.map(v=>v/2),p=Array.from({length:8},(_,i)=>c.map((v,k)=>v+(i&(1<<k)?h[k]:-h[k])));for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(id,f.map(i=>p[i]),material);mesh.parts.push({id,kind:'box',center:c,size,material});};
  const tube=(id,a,b,r,material,n=10)=>{const f=sub(b,a),len=Math.hypot(...f),u=f.map(v=>v/len),ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],right=cross(u,ref),rl=Math.hypot(...right),v=right.map(v=>v/rl),w=cross(u,v),p=(c,k)=>c.map((x,i)=>x+r*(v[i]*Math.cos(k/n*Math.PI*2)+w[i]*Math.sin(k/n*Math.PI*2)));for(let k=0;k<n;k++)quad(id,[p(a,k),p(a,k+1),p(b,k+1),p(b,k)],material);mesh.parts.push({id,kind:'tube',a,b,r,material});};
  const fy=S.floor,cy=S.ceiling;
  box('actual-shop-floor',[22,fy-.045,-17.875],[7,.09,5.25],1);
  box('door-recess-paved-floor',[22,fy-.045,-14.875],[7,.09,.75],0);
  box('actual-shop-ceiling',[22,cy+.035,-17.80],[7,.07,5.40],0);
  box('west-room-wall',[18.57,(fy+cy)/2,-17.83],[.14,cy-fy,5.22],0);box('east-room-wall',[25.43,(fy+cy)/2,-17.83],[.14,cy-fy,5.22],0);box('rear-room-wall',[22,(fy+cy)/2,-20.40],[7,cy-fy,.14],0);
  for(const side of[-1,1])box('room-skirting-'+side,[side<0?18.67:25.33,fy+.105,-17.83],[.07,.21,5.15],3);
  box('rear-skirting',[22,fy+.105,-20.29],[6.70,.21,.07],3);
  // The shell has two true apertures. Runtime door geometry supplies the one
  // moving leaf and its frame; glazing remains an actual view into the room.
  const spans=[[18.5,19.0],[22.55,23.25],[24.25,25.5]];
  for(const[index,[a,b]]of spans.entries())box('front-shop-pier-'+index,[(a+b)/2,(fy+cy)/2,S.frontZ],[b-a,cy-fy,.16],3);
  box('front-display-stall-riser',[20.775,(fy+S.window.bottom)/2,S.frontZ],[3.55,S.window.bottom-fy,.16],3);
  box('front-display-head',[20.775,(S.window.top+cy)/2,S.frontZ],[3.55,cy-S.window.top,.16],3);
  for(const x of[19.035,22.515])box('display-real-timber-jamb-'+x,[x,1.96,S.frontZ+.075],[.09,1.96,.12],3);
  box('display-projected-sill',[20.775,.98,S.frontZ+.08],[3.82,.12,.38],2);
  box('display-meeting-rail',[20.775,2.44,S.frontZ+.075],[3.52,.075,.12],3);
  box('display-central-mullion',[20.775,1.97,S.frontZ+.075],[.075,1.88,.12],3);
  box('door-clear-threshold',[S.door.x,fy-.01,S.frontZ],[1.00,.02,.43],1);
  box('stationers-fascia-board',[21.90,3.31,-15.08],[6.44,.40,.14],3);
  for(const y of[3.095,3.525])box('fascia-painted-moulding-'+y,[21.90,y,-15.055],[6.63,.06,.20],3);
  // Shelving is real carcass and shelf stock, not coloured boxes hanging on a
  // wall. Broad packets and paper reams retain weight at the shared sample size.
  for(const f of STATIONERS_FURNITURE.filter(f=>f.role==='shelving')){
    const alongZ=f.depth>f.width;box(f.id+'-back',[f.x+(f.x<22?-f.width/2+.022:f.width/2-.022),fy+f.height/2,f.z],[.044,f.height,f.depth],2);
    const face=alongZ?(f.x<22?f.x+f.width/2:f.x-f.width/2):f.z+f.depth/2;
    // Replace the front half of the carcass with shallow shelves: the backing
    // stays against the wall, leaving honest shadows between displayed stock.
    for(let shelf=0;shelf<5;shelf++){
      const y=fy+.20+shelf*(f.height-.35)/4;
      box(f.id+'-shelf-'+shelf,[f.x+(f.x<22?.07:-.04),y,f.z],[f.width+.17,.055,f.depth],2);
      for(let k=0;k<6;k++){
        const z=f.z-f.depth/2+.22+k*(f.depth-.44)/5,height=.18+.035*((k+shelf)%3),x=face+(f.x<22?.035:-.035);
        box(f.id+'-paper-ream-'+shelf+'-'+k,[x,y+.055+height/2,z],[.18,height,.34],(k+shelf)%4===0?5:4);
        if((k+shelf)%3===0)box(f.id+'-packet-band-'+shelf+'-'+k,[x+(f.x<22?.095:-.095),y+.055+height/2,z],[.008,.045,.31],3);
      }
    }
    for(const z of[f.z-f.depth/2,f.z+f.depth/2])box(f.id+'-end-standard-'+z,[f.x,fy+f.height/2,z],[f.width+.12,f.height,.07],2);
  }
  const counter=STATIONERS_FURNITURE.find(f=>f.role==='counter');
  box('counter-carcass',[counter.x,fy+.43,counter.z],[counter.width,.86,counter.depth],2);
  box('counter-foot-recess',[counter.x,fy+.085,counter.z+.355],[counter.width-.12,.17,.04],6);
  box('counter-solid-top',[counter.x,fy+.945,counter.z],[counter.width+.12,.09,counter.depth+.12],2);
  for(const x of[20.45,21.55,22.65]){box('counter-raised-panel-'+x,[x,fy+.49,-18.837],[.91,.51,.035],3);box('counter-panel-bead-'+x,[x,fy+.79,-18.816],[.96,.055,.035],2);}
  box('counter-lettering-plaque',[21.55,.69,-18.80],[2.85,.26,.02],2);
  const back=STATIONERS_FURNITURE.find(f=>f.role==='cupboard');box('back-stock-cupboard',[back.x,fy+back.height/2,back.z],[back.width,back.height,back.depth],3);for(const x of[24.27,24.83])box('cupboard-leaf-'+x,[x,fy+.60,-19.92],[.50,.94,.025],2);
  // A compact duplicator with two rollers, paper feed, delivery shelf and
  // broad stock stands on the counter. No controls or takeable part are added.
  box('duplicator-cast-base',[22.22,fy+1.02,-19.20],[.84,.14,.49],7);
  for(const x of[21.82,22.62])box('duplicator-side-housing-'+x,[x,fy+1.22,-19.21],[.09,.42,.48],7);
  for(const z of[-19.34,-19.12])tube('duplicator-roller-'+z,[21.86,fy+1.28,z],[22.58,fy+1.28,z],.075,8,12);
  box('duplicator-feed-paper',[22.22,fy+1.40,-19.46],[.57,.045,.27],4);
  box('duplicator-output-tray',[22.22,fy+1.03,-18.91],[.64,.035,.31],6);box('duplicator-delivery-sheets',[22.22,fy+1.055,-18.92],[.54,.022,.27],4);
  tube('duplicator-crank-shaft',[22.69,fy+1.28,-19.20],[22.79,fy+1.28,-19.20],.022,6);tube('duplicator-crank-arm',[22.79,fy+1.28,-19.20],[22.79,fy+1.09,-19.20],.025,6);tube('duplicator-crank-handle',[22.79,fy+1.09,-19.20],[22.91,fy+1.09,-19.20],.035,8);
  box('counter-paper-stack',[20.10,fy+1.05,-19.20],[.46,.14,.33],4);for(let k=0;k<4;k++)box('counter-paper-edge-'+k,[20.10,fy+1.00+k*.027,-19.025],[.44,.006,.007],5);
  box('counter-pencil-tray',[21.06,fy+.998,-18.99],[.32,.035,.12],6);for(let k=0;k<5;k++)tube('counter-pencil-'+k,[20.94,fy+1.022,-19.035+k*.019],[21.18,fy+1.022,-19.035+k*.019],.006,2,6);
  for(const l of STATIONERS_LIGHTS){
    if(l.id.includes('ceiling')){tube('ceiling-fitting-stem',[l.x,cy-.02,l.z],[l.x,l.y+.13,l.z],.028,6);box('ceiling-lamp-shade',[l.x,l.y+.06,l.z],[.62,.15,.34],3);box('ceiling-lamp-diffuser',[l.x,l.y-.026,l.z],[.51,.022,.25],9);}
    else{box('counter-lamp-foot',[l.x,fy+1.00,l.z],[.22,.045,.17],6);tube('counter-lamp-neck',[l.x,fy+1.02,l.z],[l.x,l.y+.02,l.z],.024,6);box('counter-lamp-painted-shade',[l.x,l.y+.04,l.z],[.38,.15,.22],3);box('counter-lamp-diffuser',[l.x,l.y-.045,l.z],[.28,.018,.16],9);}
  }
  mesh.bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const g of mesh.primitives)for(let i=0;i<g.positions.length;i++){const k=i%3;mesh.bounds.min[k]=Math.min(mesh.bounds.min[k],g.positions[i]);mesh.bounds.max[k]=Math.max(mesh.bounds.max[k],g.positions[i]);}mesh.triangles=mesh.primitives.reduce((n,g)=>n+g.indices.length/3,0);return mesh;
}
