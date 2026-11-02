// Closed project-native geometry in local metres; canonical placement and
// collision dimensions are supplied by src/data/glass-court.js to the builder.
// No facade, rear door, apparition, trigger or gameplay state is authored here.
export const GLASS_COURT_MATERIALS = Object.freeze([
  {name:'court painted iron',color:[.13,.18,.155],roughness:.72,metallic:.38},
  {name:'court exposed iron',color:[.24,.255,.225],roughness:.77,metallic:.52},
  {name:'court warm terrazzo',color:[.55,.54,.48],roughness:.78,metallic:0,texture:'terrazzo'},
  {name:'court dark paving joints',color:[.19,.21,.18],roughness:.97,metallic:0},
  {name:'court brick nursery trough',color:[1,1,1],roughness:.90,metallic:0,texture:'brick'},
  {name:'court mineral coping',color:[.59,.58,.50],roughness:.83,metallic:0},
  {name:'court damp soil',color:[.075,.060,.041],roughness:1,metallic:0},
  {name:'court nursery timber',color:[.25,.20,.115],roughness:.94,metallic:0},
  {name:'court terracotta',color:[.43,.235,.115],roughness:.94,metallic:0},
  {name:'court old terracotta',color:[.31,.245,.155],roughness:.98,metallic:0},
  {name:'court fluorescent glass',color:[.78,.84,.72],roughness:.53,metallic:0,emissive:[.025,.035,.022]},
  {name:'court warm exit opal',color:[.84,.72,.47],roughness:.56,metallic:0,emissive:[.045,.025,.008]},
  {name:'court sparse glazed reflection',color:[.48,.64,.57],roughness:.25,metallic:.04,texture:'glass',alphaMode:'MASK',alphaCutoff:.5},
  {name:'court broadleaf deep',color:[.055,.17,.078],roughness:.76,metallic:0},
  {name:'court broadleaf jade',color:[.12,.255,.115],roughness:.70,metallic:0},
  {name:'court fern olive',color:[.22,.30,.105],roughness:.87,metallic:0},
  {name:'court vine leaf',color:[.10,.235,.10],roughness:.79,metallic:0},
  {name:'court plant stems',color:[.16,.205,.07],roughness:.92,metallic:0},
  {name:'court changing mineral wall',color:[.48,.57,.52],roughness:.88,metallic:0},
  {name:'court old enamel blue',color:[.065,.17,.20],roughness:.56,metallic:0},
  {name:'court ivory ceramic',color:[.70,.70,.60],roughness:.67,metallic:0},
  ...[0,1,2].map(n=>({name:'court physical sign '+n,color:[1,1,1],roughness:.65,metallic:0,texture:'sign'+n})),
]);

const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((n,k)=>n-b[k]),dot=(a,b)=>a.reduce((s,n,k)=>s+n*b[k],0);
const unit=v=>{const length=Math.hypot(...v);return v.map(n=>n/length);};
const bounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
const include=(b,p)=>{for(let k=0;k<3;k++){b.min[k]=Math.min(b.min[k],p[k]);b.max[k]=Math.max(b.max[k],p[k]);}};
const lerp=(a,b,t)=>a.map((n,k)=>n+(b[k]-n)*t);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const materialNames=GLASS_COURT_MATERIALS.map(m=>m.name);
const M=Object.freeze({iron:0,metal:1,paving:2,joint:3,brick:4,stone:5,soil:6,wood:7,pot:8,oldPot:9,tube:10,opal:11,glass:12,deep:13,jade:14,fern:15,vine:16,stem:17,wall:18,blue:19,ivory:20,sign0:21,sign1:22,sign2:23});

export function courtRayTriangle(from,to,a,b,c){
  const direction=sub(to,from),e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);
  if(Math.abs(det)<1e-10)return null;
  const inverse=1/det,tv=sub(from,a),u=dot(tv,p)*inverse;
  if(u<0||u>1)return null;
  const q=cross(tv,e1),v=dot(direction,q)*inverse;
  if(v<0||u+v>1)return null;
  const t=dot(e2,q)*inverse;return t>1e-5&&t<.9999?t:null;
}

export function buildGlassCourtGeometry(court){
  if(court?.meshNames?.length!==7)throw Error('Use the canonical longitudinal court and guard contract.');
  const [frameName,glassName,bedName,nurseryName,plantsName,vestibuleName,guardsName]=court.meshNames;
  const names=[...court.meshNames,court.entranceFixtures.mesh];
  const meshes=new Map(names.map(name=>[name,{name,groups:new Map(),parts:[],triangles:0,bounds:bounds()}]));
  const frame=meshes.get(frameName),glass=meshes.get(glassName),bed=meshes.get(bedName),nursery=meshes.get(nurseryName),plants=meshes.get(plantsName),vestibule=meshes.get(vestibuleName),fixtures=meshes.get(court.entranceFixtures.mesh),guards=meshes.get(guardsName);
  const figures=[
    {id:'west-head-glimpse',eye:[2,1.62,3],target:[.35,1.68,3],headBand:[1.5,1.9]},
    {id:'east-head-glimpse',eye:[2,1.62,9],target:[3.65,1.68,9],headBand:[1.5,1.9]},
  ];
  const clearRays=figures.flatMap(f=>[
    ...[-.055,0,.055].map(dx=>({from:[f.eye[0]+dx,f.eye[1],f.eye[2]],to:[f.target[0]+dx,f.target[1],f.target[2]]})),
    ...[-.025,0,.025].map(dz=>({from:[f.eye[0],f.eye[1],f.eye[2]+dz],to:[f.target[0],f.target[1],f.target[2]+dz]})),
  ]);
  let windowLeavesOmitted=0;
  function part(mesh,id,role,material,points,indices,uvs=null,{keepWindows=false}={}){
    if(keepWindows&&clearRays.some(ray=>indices.some((_,i)=>i%3===0&&courtRayTriangle(ray.from,ray.to,...indices.slice(i,i+3).map(k=>points[k]))!==null))){windowLeavesOmitted++;return;}
    if(mesh===fixtures)points=points.map(p=>[p[0]-(court.entranceFixtures.origin.x-court.origin.x),p[1],p[2]-(court.entranceFixtures.origin.z-court.origin.z)]);
    const signedVolume=indices.reduce((s,_,i)=>i%3?s:s+dot(points[indices[i]],cross(points[indices[i+1]],points[indices[i+2]]))/6,0);
    if(Math.abs(signedVolume)<1e-14)throw Error(`Zero-volume court part: ${id}`);
    if(!mesh.groups.has(material))mesh.groups.set(material,{positions:[],normals:[],uvs:[],indices:[]});
    const g=mesh.groups.get(material),startTriangle=g.indices.length/3,extent=bounds();
    for(let at=0;at<indices.length;at+=3){
      const ids=signedVolume>0?indices.slice(at,at+3):[indices[at],indices[at+2],indices[at+1]],p=ids.map(i=>points[i].map(Math.fround));
      const n=unit(cross(sub(p[1],p[0]),sub(p[2],p[0]))),start=g.positions.length/3;
      if(!n.every(Number.isFinite))throw Error(`Degenerate court triangle: ${id}`);
      for(let k=0;k<3;k++){g.positions.push(...p[k]);g.normals.push(...n);g.uvs.push(...(uvs?.[ids[k]]||[0,0]));include(extent,p[k]);include(mesh.bounds,p[k]);}
      g.indices.push(start,start+1,start+2);
    }
    const triangles=indices.length/3;
    mesh.parts.push({id,role,material:materialNames[material],materialIndex:material,startTriangle,triangles,bounds:extent,closed:true});mesh.triangles+=triangles;
  }
  const faces=[
    [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],
    [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],
    [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],
  ];
  function box(mesh,id,role,mat,c,s,basis=[[1,0,0],[0,1,0],[0,0,1]],options={}){
    const p=[],i=[],uv=[];
    for(let f=0;f<faces.length;f++){
      const start=p.length;
      for(const v of faces[f]){
        p.push(c.map((value,k)=>value+v.reduce((sum,n,a)=>sum+n*s[a]/2*basis[a][k],0)));
        const pair=f<2?[0,1]:f<4?[2,1]:[0,2];
        uv.push(pair.map((a,index)=>options.signFace?(1-v[a])/2:options.normalizedUv?(v[a]+1)/2:(v[a]+1)*s[a]/2/(index===0?.456:.154)));
      }
      i.push(start,start+1,start+2,start,start+2,start+3);
    }
    const previous=mesh.parts.length;
    part(mesh,id,role,mat,p,i,uv,options);
    if(mesh.parts.length>previous)mesh.parts.at(-1).obb={center:mesh===fixtures?[c[0]-(court.entranceFixtures.origin.x-court.origin.x),c[1],c[2]-(court.entranceFixtures.origin.z-court.origin.z)]:c,size:s,basis};
  }
  function beam(mesh,id,role,mat,a,b,w,options={}){
    const direction=sub(b,a),axis=unit(direction),reference=Math.abs(axis[1])<.9?[0,1,0]:[1,0,0],u=unit(cross(reference,axis)),v=cross(axis,u);
    box(mesh,id,role,mat,lerp(a,b,.5),[w,w,Math.hypot(...direction)],[u,v,axis],options);
  }
  function cylinder(mesh,id,role,mat,c,r0,r1,h,sides=8,axis='y'){
    const local=(x,y,z)=>axis==='x'?[c[0]+y,c[1]+x,c[2]+z]:[c[0]+x,c[1]+y,c[2]+z];
    const p=[local(0,-h/2,0),local(0,h/2,0)],i=[];
    for(let n=0;n<sides;n++){const a=n/sides*Math.PI*2;p.push(local(Math.cos(a)*r0,-h/2,Math.sin(a)*r0),local(Math.cos(a)*r1,h/2,Math.sin(a)*r1));}
    for(let n=0;n<sides;n++){const a=2+n*2,b=2+(n+1)%sides*2;i.push(a,a+1,b+1,a,b+1,b,0,a,b,1,b+1,a+1);}
    part(mesh,id,role,mat,p,i);
  }
  function rim(mesh,id,mat,c,outer,inner,h,sides=8){
    const p=[],i=[];
    for(let n=0;n<sides;n++){const a=n/sides*Math.PI*2;for(const[r,y]of[[outer,-h/2],[outer,h/2],[inner,h/2],[inner,-h/2]])p.push([c[0]+Math.cos(a)*r,c[1]+y,c[2]+Math.sin(a)*r]);}
    for(let n=0;n<sides;n++)for(let k=0;k<4;k++){const a=n*4+k,b=(n+1)%sides*4+k,d=n*4+(k+1)%4,e=(n+1)%sides*4+(k+1)%4;i.push(a,b,e,a,e,d);}
    part(mesh,id,'terracotta-rim',mat,p,i);
  }
  function leaf(id,base,tip,width,mat,{central=true,role='central-broadleaf',simple=false,keepWindows=true,band=null}={}){
    const axis=unit(sub(tip,base)),perpendicular=cross([0,1,0],axis),side=Math.hypot(...perpendicular)<.01?[1,0,0]:unit(perpendicular),normal=unit(cross(axis,side));
    const p=[],indices=[],sections=simple?[[0,.015],[.50,.5],[1,.008]]:[[0,.018],[.30,.40],[.65,.50],[1,.008]];
    for(const[t,w]of sections){
      const center=lerp(base,tip,t);center[1]+=Math.sin(t*Math.PI)*.075;
      for(const[sideOffset,fold]of[[-w*width,0],[0,.018],[w*width,0],[0,-.0035]]){
        const point=center.map((v,k)=>v+side[k]*sideOffset+normal[k]*fold);
        p.push(point);
      }
    }
    for(let n=0;n<sections.length-1;n++)for(let k=0;k<4;k++){const a=n*4+k,b=(n+1)*4+k,c=(n+1)*4+(k+1)%4,d=n*4+(k+1)%4;indices.push(a,b,c,a,c,d);}
    indices.push(0,1,2,0,2,3);const end=(sections.length-1)*4;indices.push(end,end+2,end+1,end,end+3,end+2);
    // Fit the entire finite leaf with an affine scale about its stem. Clipping
    // individual vertices would collapse folded edge triangles at the border.
    const fit=(axis,lo,hi)=>{
      const min=Math.min(...p.map(v=>v[axis])),max=Math.max(...p.map(v=>v[axis]));let scale=1;
      if(max>hi)scale=Math.min(scale,(hi-base[axis])/(max-base[axis]));
      if(min<lo)scale=Math.min(scale,(base[axis]-lo)/(base[axis]-min));
      if(scale<=0)throw Error(`Leaf stem outside its bounded bed: ${id}`);
      if(scale<1)for(const point of p)point[axis]=base[axis]+(point[axis]-base[axis])*scale;
    };
    if(central&&band){fit(0,band.x0+.015,band.x1-.015);fit(2,band.z0+.015,band.z1-.015);fit(1,0,band.maxHeight-.015);}
    part(plants,id,role,mat,p,indices,null,{keepWindows});
  }

  // Separate enclosed volumes, connected only by a narrow longitudinal link.
  const roofHeight=x=>court.eaves+(court.ridge-court.eaves)*(1-Math.abs(x-2)/2);
  box(frame,'greenhouse-paving-substrate','floor',M.joint,[2,-.041,6],[4,.09,12]);
  for(let x=0;x<4;x++)for(let z=0;z<12;z++)box(frame,`terrazzo:${x}:${z}`,'floor',M.paving,[x+.5,-.006,z+.5],[.992,.024,.992]);
  // Low plinths, upright posts and glass panels have real depth on both sides.
  for(const x of[0,4]){
    box(frame,`side-plinth:${x}`,'opaque-plinth',M.wall,[x,.10,6],[.12,.20,12]);
    box(frame,`eave:${x}`,'overhead-frame',M.iron,[x,3.96,6],[.09,.08,12]);
    for(let z=0;z<=12;z+=2){box(frame,`side-post:${x}:${z}`,'side-stock',M.iron,[x,2,z],[.10,4,.08]);box(frame,`collar:${x}:${z}`,'side-stock',M.metal,[x,.20,z],[.14,.10,.12]);}
    for(let z=0;z<12;z+=2)for(const[y0,y1]of[[.23,1.62],[1.68,3.89]]){
      box(glass,`side-pane:${x}:${z}:${y0}`,'side-glazing',M.glass,[x,(y0+y1)/2,z+1],[.008,y1-y0,1.88],undefined,{normalizedUv:true});
      box(frame,`side-rail:${x}:${z}:${y0}`,'side-stock',M.iron,[x,y0,z+1],[.06,.045,1.9]);
    }
  }
  box(frame,'ridge','overhead-frame',M.iron,[2,5.15,6],[.10,.10,12]);
  const pitch=Math.atan((court.ridge-court.eaves)/2),cs=Math.cos(pitch),sn=Math.sin(pitch);
  for(let z=0;z<=12;z+=1.5)for(const side of[-1,1])beam(frame,`rafter:${side}:${z}`,'overhead-frame',M.iron,[2+side*2,3.96,z],[2,5.15,z],.06);
  for(let z=0;z<12;z+=1.5)for(const side of[-1,1])box(glass,`roof-pane:${side}:${z}`,'roof-glazing',M.glass,[2+side,4.60,z+.75],[1.94/cs,.010,1.40],[[cs,side*-sn,0],[side*sn,cs,0],[0,0,1]],{normalizedUv:true});
  for(const z of[0,12]){
    for(const[a,b]of[[0,1],[3,4]])box(glass,`end-pane:${z}:${a}`,'end-glazing',M.glass,[(a+b)/2,1.95,z],[b-a-.08,3.84,.008],undefined,{normalizedUv:true});
    for(const x of[1,3])box(frame,`end-jamb:${z}:${x}`,'end-door-frame',M.iron,[x,1.7,z],[.07,3.4,.10]);
    box(frame,`end-lintel:${z}`,'end-door-frame',M.iron,[2,3.43,z],[2.14,.10,.12]);
    for(const x of[.5,1.5,2.5,3.5]){const top=roofHeight(x)-.12;box(glass,`end-fanlight:${z}:${x}`,'end-glazing',M.glass,[x,(3.5+top)/2,z],[.92,top-3.5,.008],undefined,{normalizedUv:true});}
  }
  // Ellery's new south face closes the occupied building, with its two honest
  // apertures: the greenhouse and the dry eastern return to the concert hall.
  const end=court.elleryFace,z=end.z-court.origin.z;
  for(const[a,b]of[[end.x0,83],[85,95],[97,end.x1]])box(frame,`ellery-rear-wall:${a}`,'ellery-envelope',M.wall,[(a+b)/2-court.origin.x,4.75,z],[b-a,9.5,.24]);
  for(const[a,b]of[[83,85],[95,97]])box(frame,`ellery-rear-header:${a}`,'ellery-envelope',M.wall,[(a+b)/2-court.origin.x,6.45,z],[b-a,6.1,.24]);
  // The detached pool has its own complete north elevation and a real door.
  for(const[a,b]of[[70,83],[85,97]])box(frame,`baths-north-wall:${a}`,'natatorium-envelope',M.wall,[(a+b)/2-court.origin.x,4.75,12],[b-a,9.5,.24]);
  box(frame,'baths-north-header','natatorium-envelope',M.wall,[2,6.45,12],[2,6.1,.24]);
  // The hall return is a narrow enclosed arm at the far court boundary.
  box(frame,'hall-return-west-wall','hall-return',M.wall,[13,1.8,4.5],[.18,3.6,9]);
  box(frame,'hall-return-ceiling','hall-return',M.wall,[14.5,3.65,4.5],[3,.14,9]);
  box(frame,'hall-lobby-west-wall','hall-return',M.wall,[12,1.8,10.5],[.18,3.6,3]);
  box(frame,'hall-lobby-south-wall','hall-return',M.wall,[14,1.8,12],[4,3.6,.18]);
  // These unique meshes cannot be overwritten by the optional gallery pack.
  for(const[tier,polygon,base]of[['academic',court.upperGuards.academicPolygon,10],['roof',court.upperGuards.roofPolygon,17]])for(let n=0;n<polygon.length;n++){
    const a=polygon[n],b=polygon[(n+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length;
    const start=[a[0]-court.origin.x+nx*.14,base-court.drawnFloor,a[1]-court.origin.z+nz*.14],end=[b[0]-court.origin.x+nx*.14,base-court.drawnFloor,b[1]-court.origin.z+nz*.14];
    for(const h of[.12,.57,1.13])beam(guards,`${tier}-guard-rail:${n}:${h}`,'void-safety-guard',M.iron,[start[0],start[1]+h,start[2]],[end[0],end[1]+h,end[2]],h===.12?.10:.07);
    const count=Math.ceil(length/1.25);for(let k=0;k<=count;k++){const q=lerp(start,end,k/count);box(guards,`${tier}-guard-post:${n}:${k}`,'void-safety-guard',M.metal,[q[0],q[1]+.59,q[2]],[.075,1.18,.075]);}
  }
  // The independent changing buffer leaves a real cross-deck before the
  // unchanged starting blocks and basin. Geometry follows its shared bounds.
  const changing=court.changing,changingZ=(changing.z0+changing.z1)/2,changingLength=changing.z1-changing.z0;
  for(const p of court.partitionSegments){box(vestibule,p.id,'changing-wall',M.wall,[p.x,p.height/2,p.z],[p.width,p.height,p.depth]);box(vestibule,p.id+':skirting','changing-wall',M.blue,[p.x,.10,p.z],[p.width,.20,p.depth]);}
  for(const z of[changing.z0,changing.z1])box(vestibule,`changing-header:${z}`,'changing-wall',M.wall,[2,3.45,z],[2.12,.10,.18]);
  box(vestibule,'changing-ceiling','changing-ceiling',M.wall,[2,3.47,changingZ],[6,.14,changingLength]);
  box(vestibule,'changing-floor','floor',M.paving,[2,-.006,changingZ],[6,.024,changingLength]);
  box(vestibule,'changing-west-bench','changing-furniture',M.wood,[-.60,.45,changingZ],[.48,.08,2.4]);
  for(const z of[changingZ-1,changingZ+1])beam(vestibule,`bench-bracket:${z}`,'changing-furniture',M.iron,[-.8,.05,z],[-.6,.42,z],.06);
  // Each ventilation circuit has its own actual external termination.
  for(const[x,label]of[[.18,'glasshouse-supply'],[3.82,'glasshouse-extract']]){
    box(frame,label+':trunk','ventilation',M.metal,[x,3.73,6],[.18,.18,11.9]);
    for(const z of[2,5,8,11])box(frame,`${label}:outlet:${z}`,'ventilation',M.iron,[x,3.61,z],[.25,.045,.55]);
    box(frame,label+':end-flange','ventilation',M.metal,[x,3.73,.02],[.36,.36,.06]);
  }
  box(vestibule,'changing-extract-trunk','ventilation',M.metal,[4.6,3.65,changingZ],[.18,.18,changingLength-.2]);
  box(vestibule,'changing-extract-exterior-flange','ventilation',M.metal,[5.02,3.65,changingZ],[.06,.36,.40]);
  beam(vestibule,'changing-extract-neck','ventilation',M.metal,[4.6,3.65,changingZ],[5.02,3.65,changingZ],.18);
  for(const lamp of court.lamps){const{x,y,z,id}=lamp,host=id.includes('changing')?vestibule:frame;
    if(id.includes('light')||id.includes('fluorescent')){box(host,`housing:${id}`,'fluorescent-fixture',M.iron,[x,y+.075,z],[1.30,.055,.16]);for(const dz of[-.04,.04])cylinder(host,`tube:${id}:${dz}`,'fluorescent-fixture',M.tube,[x,y,z+dz],.018,.018,1.18,8,'x');for(const dx of[-.5,.5])beam(host,`drop:${id}:${dx}`,'overhead-frame',M.metal,[x+dx,y+.10,z],[x+dx,id.includes('changing')?3.39:roofHeight(x+dx)-.09,z],.014);}
    else cylinder(frame,'exit-globe','side-stock',M.opal,[x,y,z],.125,.125,.23,12);
  }
  let seed=0x5f38a2c1;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  for(const[bi,b]of court.plantingBands.entries()){
    const cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2,w=b.x1-b.x0,d=b.z1-b.z0;
    box(bed,`trough:${bi}`,'solid-planting',M.brick,[cx,(b.height-.08)/2,cz],[w,b.height-.08,d]);
    for(const x of[b.x0+.06,b.x1-.06])box(bed,`coping:${bi}:${x}`,'solid-planting',M.stone,[x,b.height-.04,cz],[.12,.08,d]);
    box(bed,`soil:${bi}`,'soil',M.soil,[cx,b.height-.075,cz],[w-.20,.07,d-.20]);
    for(let z=b.z0+.35,n=0;z<b.z1-.3;z+=.65,n++){
      const x=cx,top=1.95+random()*.5;
      beam(plants,`stem:${bi}:${n}`,'central-stem',M.stem,[x,.71,z],[x,top,z],.018);
      for(let k=0;k<9;k++){const a=k*2.399+random()*.4,at=.8+k*.16;leaf(`broadleaf:${bi}:${n}:${k}`,[x,at,z],[clamp(x+Math.cos(a)*.36,b.x0+.03,b.x1-.03),Math.min(2.7,at+.30+random()*.3),z+Math.sin(a)*.4],.25+random()*.12,k%3?M.deep:M.jade,{band:b,keepWindows:true});}
      if(n%2===0){cylinder(nursery,`pot:${bi}:${n}`,'nursery-stock',M.pot,[x,.90,z],.085,.13,.24,8);rim(nursery,`pot-rim:${bi}:${n}`,M.pot,[x,1.026,z],.14,.115,.025);}
    }
    // A rooted pair of folded fronds stands in front of each existing body.
    // The bed centre alone left the figures exposed behind sideways leaves.
    // Petioles meet the nearest real stem; the narrow gap reveals only a
    // partial head, while walking past restores overlapping living foliage.
    const figure=figures[bi],front=bi?b.x0+.04:b.x1-.04;
    const stemZ=b.z0+.35+Math.round((figure.target[2]-b.z0-.35)/.65)*.65;
    for(const side of[-1,1]){
      const z=figure.target[2]+side*.20;
      beam(plants,`body-frond-petiole:${bi}:${side}`,'central-stem',M.stem,[cx,1.12,stemZ],[front,1.18,z],.016);
      leaf(`body-frond:${bi}:${side}`,[front,1.18,z],[front+(bi?-.01:.01),1.82,z],.32,M.deep,{band:b,keepWindows:true});
    }
    for(let z=1;z<11.5;z+=1.5){let prev=[cx,3.65,z];for(let k=1;k<=7;k++){const q=[cx+Math.sin(k*.7)*.04,3.65-k*.19,z+Math.sin(k*.6)*.05];beam(plants,`vine:${bi}:${z}:${k}`,'hanging-vine',M.stem,prev,q,.008);leaf(`vine-leaf:${bi}:${z}:${k}`,q,[q[0]+(bi?-.10:.10),q[1]-.12,q[2]+.10],.12,M.vine,{central:false,role:'hanging-vine',simple:true,keepWindows:false});prev=q;}}
  }
  const counter=court.counter;
  box(fixtures,'rehosted-attendant-counter','rehosted-admission-counter',M.wood,[counter.x,counter.height/2,counter.z],[counter.width,counter.height,counter.depth]);
  box(fixtures,'rehosted-attendant-worktop','rehosted-admission-counter',M.ivory,[counter.x,1.08,counter.z],[counter.width+.06,.06,counter.depth+.08]);
  const foldedGateZ=changing.z1-.30;
  cylinder(fixtures,'folded-turnstile-shaft','rehosted-folded-turnstile',M.metal,[4.3,.78,foldedGateZ],.075,.075,1.48,12);
  for(const dz of[-.06,0,.06])beam(fixtures,'folded-turnstile-arm:'+dz,'rehosted-folded-turnstile',M.metal,[4.3,.84,foldedGateZ+dz],[4.3,.12,foldedGateZ+.15+dz],.035);
  box(fixtures,'rehosted-radiator','rehosted-service-hardware',M.ivory,[-.75,.66,12.8],[.24,1.14,1.0]);
  box(fixtures,'rehosted-service-box','rehosted-service-hardware',M.metal,[-.85,1.62,changing.z1-1],[.24,1.04,.70]);
  box(fixtures,'rehosted-boot-scraper','rehosted-service-hardware',M.iron,[.1,.08,12.7],[.7,.12,.5]);
  for(const[n,s]of court.signs.entries()){
    const normal=s.normal,basis=[[1,0,0],[0,1,0],[0,0,1]],c=[s.x,s.y,s.z],front=c.map((v,k)=>v+normal[k]*.017);
    box(vestibule,'sign-substrate:'+s.id,'physical-wayfinding',M.blue,c,[s.width+.025,s.height+.025,.025],basis);
    box(vestibule,'sign-face:'+s.id,'physical-wayfinding',M['sign'+n],front,[s.width,s.height,.003],basis,{normalizedUv:true,signFace:true});
  }
  const report={meshNames:names,localBounds:{x0:-12,x1:16,z0:-.2,z1:changing.z1+.1},floorDatum:0,eaves:court.eaves,ridge:court.ridge,plantingBands:court.plantingBands,
    clearLane:{...court.clearLane,width:court.clearLane.x1-court.clearLane.x0},doors:court.doors,changing:court.changing,
    mouthPolicy:'Two centred greenhouse end doors followed by a separate ventilated changing room and pool door.',
    facadeAdded:true,rearDoorAdded:true,plantsAdded:true,apparitionsAdded:false,glassPolicy:'MASK sparse wet glass on two exterior long faces; no BLEND.',
    ventilation:{greenhouse:['glasshouse-supply','glasshouse-extract'],changing:['changing-extract'],termination:{axis:'x',coordinate:5,worldCoordinate:87}},
    fixtureOrigin:court.entranceFixtures.origin,figureWindows:figures,windowLeavesOmitted,lamps:court.lamps.map(l=>({...l})),maximumTriangles:43000,maximumBytes:5*1024*1024};
  return{meshes,materials:GLASS_COURT_MATERIALS,report};
}
