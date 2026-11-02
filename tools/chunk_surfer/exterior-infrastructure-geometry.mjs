import {EXTERIOR_INFRASTRUCTURE as C} from '../../src/data/exterior-infrastructure.js';
const mat=(name,rgb,metallic=0,roughness=.86)=>({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:metallic,roughnessFactor:roughness}});
export const INFRASTRUCTURE_MATERIALS=[
  mat('services worn galvanized steel',[.25,.27,.25],.45,.76),mat('services wet iron',[.10,.125,.12],.4,.66),
  mat('services recessed darkness',[.018,.024,.022],0,.96),mat('services old green enamel',[.17,.21,.16],.14,.86),
  mat('services rubbed metal edges',[.40,.41,.35],.3,.68),mat('services rubber',[.035,.041,.036],0,.97),
  mat('services aged warm camera housing',[.53,.51,.42],.08,.83),mat('services iron oxide',[.25,.16,.09],.08,.96),
];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const n=Math.hypot(...a);if(n<1e-9)throw Error('Degenerate service axis');return a.map(v=>v/n);};
const add=(a,b)=>a.map((v,k)=>v+b[k]),mul=(a,s)=>a.map(v=>v*s);
const orient=(name,p)=>name===C.camera.mesh?[p[2],p[1],-p[0]]:name===C.extract.mesh?[-p[2],p[1],p[0]]:p;
export function exteriorInfrastructureGeometry(){
 const meshes=[];let m;
 const begin=(spec)=>{m={name:spec.mesh,origin:spec.origin,primitives:[],parts:[],purpose:spec.purpose};meshes.push(m);};
 const group=material=>m.primitives.find(p=>p.material===material)||(m.primitives.push({material,positions:[],normals:[],uvs:[],indices:[]}),m.primitives.at(-1));
 const quad=(id,points,material)=>{const ps=points.map(p=>orient(m.name,p)),g=group(material),base=g.positions.length/3,n=unit(cross(ps[1].map((v,k)=>v-ps[0][k]),ps[2].map((v,k)=>v-ps[0][k])));for(const p of ps){if(!p.every(Number.isFinite))throw Error('Nonfinite service vertex');g.positions.push(...p);g.normals.push(...n);g.uvs.push(p[0]+p[2],p[1]);}g.indices.push(base,base+1,base+2,base,base+2,base+3);};
 const box=(id,c,size,material,axes=[[1,0,0],[0,1,0],[0,0,1]])=>{const p=Array.from({length:8},(_,i)=>c.map((v,k)=>v+axes.reduce((s,a,j)=>s+a[k]*size[j]*(i&(1<<j)?1:-1)/2,0)));for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(id,f.map(i=>p[i]),material);m.parts.push({id,kind:'box',center:c,size,axes,material});};
 const pipe=(id,a,b,r,material,sides=10,cap=true)=>{const f=unit(b.map((v,k)=>v-a[k])),u=unit(cross(f,Math.abs(f[1])>.9?[1,0,0]:[0,1,0])),v=cross(f,u),p=(c,t)=>add(c,add(mul(u,r*Math.cos(t)),mul(v,r*Math.sin(t))));for(let i=0;i<sides;i++){const t=i/sides*Math.PI*2,n=(i+1)/sides*Math.PI*2;quad(id,[p(a,n),p(b,n),p(b,t),p(a,t)],material);if(cap)for(const[c,flip]of[[a,false],[b,true]]){const pa=p(c,t),pb=p(c,n),mid=mul(add(pa,pb),.5);quad(id,flip?[c,pa,mid,pb]:[c,pb,mid,pa],material);}}m.parts.push({id,kind:'pipe',a,b,radius:r,material});};
 const bracket=(id,y,z=0)=>{box(id+':wall-pad',[.40,y,z],[.12,.14,.20],1);box(id+':stand-off',[.205,y,z],[.35,.05,.055],0);pipe(id+':collar',[0,y-.025,z],[0,y+.025,z],.091,0,12);};
 begin(C.camera);
 box('camera-wall-foot',[.04,3.30,0],[.08,.29,.18],0);pipe('camera-supported-arm',[.06,3.30,0],[.40,3.30,0],.029,0);pipe('camera-ball-stem',[.40,3.30,0],[.40,3.47,0],.025,1);
 const worldDir=unit(C.camera.target.map((v,k)=>v-C.camera.eye[k])),dir=[-worldDir[2],worldDir[1],worldDir[0]],right=unit(cross([0,1,0],dir)),up=cross(dir,right),cc=[.40,3.47,0];
 box('camera-body',cc,[.18,.16,.32],6,[right,up,dir]);box('camera-rain-hood',add(cc,mul(up,.095)),[.225,.025,.41],6,[right,up,dir]);
 pipe('camera-optic-rim',add(cc,mul(dir,.155)),add(cc,mul(dir,.184)),.062,1,12);pipe('camera-dark-lens',add(cc,mul(dir,.185)),add(cc,mul(dir,.188)),.047,2,12);
 box('camera-junction-box',[.08,2.15,.18],[.14,.24,.20],0);pipe('camera-real-conduit',[.09,2.28,.18],[.09,3.19,.18],.014,1,8);pipe('camera-cable-elbow',[.09,3.19,.18],[.10,3.28,0],.014,1,8);
 for(const y of[2.48,2.92])box('camera-conduit-clip-'+y,[.052,y,.18],[.10,.035,.055],0);
 begin(C.extract);const h=C.extract.roofHeight;
 box('extract-wall-outlet',[0,2.72,.07],[.75,.77,.14],1);box('extract-turn',[0,2.72,.29],[.54,.54,.58],0);
 box('extract-riser',[0,(h+1+2.45)/2,.43],[.48,h+1-2.45,.48],0);
 for(let y=2.6;y<h+.6;y+=1.1){box('extract-slip-joint-'+y,[0,y,.43],[.515,.055,.515],4);box('extract-wall-support-'+y,[0,y,.21],[.78,.065,.42],1);}
 box('extract-cleanout',[0,3.02,.682],[.34,.36,.018],1);for(const x of[-.14,.14])box('extract-cleanout-fastener-'+x,[x,3.02,.695],[.022,.025,.016],4);
 box('extract-open-terminal',[0,h+1.03,.43],[.43,.05,.43],2);box('extract-weather-cap',[0,h+1.16,.43],[.72,.09,.72],0);
 for(const x of[-.21,.21])box('extract-cap-strut-'+x,[x,h+1.08,.43],[.025,.17,.025],1);
 box('extract-isolator',[.52,2.18,.09],[.18,.28,.18],6);box('extract-isolator-switch',[.52,2.18,.19],[.065,.11,.035],1);pipe('extract-supply',[.52,2.33,.09],[.52,3.35,.09],.015,1,8);pipe('extract-supply-turn',[.52,3.35,.09],[.27,3.35,.43],.015,1,8);
 begin(C.bins);
 for(const[z,colour]of[[-.41,3],[.41,1]]){
  const id=z<0?'recycling-bin':'general-bin';
  // Tapered moulded body, rather than an intersecting pair of cuboids.
  const rings=[[.14,.54,.52],[.98,.66,.65]].map(([y,w,d])=>[[-w/2,y,z-d/2],[w/2,y,z-d/2],[w/2,y,z+d/2],[-w/2,y,z+d/2]]);
  for(let i=0;i<4;i++)quad(id+':taper-'+i,[rings[0][(i+1)%4],rings[0][i],rings[1][i],rings[1][(i+1)%4]],colour);
  box(id+':rim',[0,.995,z],[.69,.065,.69],colour);box(id+':lid',[0,1.05,z-.018],[.72,.065,.72],colour);box(id+':hinge',[0,1.055,z+.32],[.54,.07,.065],5);
  box(id+':lid-handle',[0,1.10,z-.28],[.25,.045,.09],1);box(id+':pull-handle',[0,.94,z+.39],[.45,.055,.055],1);
  for(const x of[-.25,.25]){pipe(id+':wheel-'+x,[x-.045,.105,z+.27],[x+.045,.105,z+.27],.10,5,12);pipe(id+':hub-'+x,[x-.047,.105,z+.27],[x+.047,.105,z+.27],.039,0,8);}
  for(const[x,y]of[[-.18,.42],[.09,.76]])box(id+':rub-'+y,[x,y,z-.315],[.16,.032,.008],4);
 }
 for(const spec of C.rainwater){begin(spec);const h=spec.height;
  box('parapet-outlet-face',[.24,h-.08,0],[.12,.19,.28],1);box('parapet-outlet-dark',[.174,h-.08,0],[.012,.10,.19],2);box('outlet-spout',[.13,h-.105,0],[.34,.035,.22],0);
  box('hopper-back',[.12,h-.23,0],[.045,.28,.33],1);box('hopper-front',[-.15,h-.23,0],[.035,.28,.33],1);for(const z of[-.16,.16])box('hopper-side-'+z,[-.015,h-.23,z],[.30,.28,.035],1);
  box('hopper-dark-bottom',[-.015,h-.35,0],[.25,.025,.28],2);pipe('hopper-outlet',[0,h-.36,0],[0,h-.52,0],.09,1,12);
  pipe('cast-iron-downpipe',[0,.34,0],[0,h-.48,0],.068,1,12);
  for(let y=.8;y<h-.45;y+=2.05)bracket('pipe-bracket-'+y,y);
  box('pipe-cleanout',[0,.43,-.067],[.10,.17,.026],0);pipe('pipe-shoe',[0,.34,0],[-.16,.13,0],.076,1,12);
  box('gully-dark-trap',[-.16,.038,0],[.44,.012,.51],2);for(const x of[-.40,.08])box('gully-frame-x-'+x,[x,.052,0],[.035,.026,.57],1);for(const z of[-.27,.27])box('gully-frame-z-'+z,[-.16,.052,z],[.50,.026,.03],1);
  for(let i=0;i<6;i++)box('gully-removable-grate-'+i,[-.35+i*.075,.058,0],[.026,.022,.48],0);
  box('old-overflow-stain',[.435,(h-.5)/2,0],[.008,h-.5,.23],7);
 }
 let total=0;for(const mesh of meshes){mesh.bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};mesh.triangles=0;for(const g of mesh.primitives){mesh.triangles+=g.indices.length/3;for(let i=0;i<g.positions.length;i++){const k=i%3;mesh.bounds.min[k]=Math.min(mesh.bounds.min[k],g.positions[i]);mesh.bounds.max[k]=Math.max(mesh.bounds.max[k],g.positions[i]);}}total+=mesh.triangles;}
 if(total>C.maximumTriangles)throw Error('Connected services exceed triangle budget');return{revision:C.revision,meshes,materials:INFRASTRUCTURE_MATERIALS,totalTriangles:total};
}
