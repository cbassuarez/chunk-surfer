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
  if(court?.meshNames?.length!==6)throw Error('Use the canonical six-mesh indoor court contract.');
  const [frameName,glassName,bedName,nurseryName,plantsName,vestibuleName]=court.meshNames;
  const names=[...court.meshNames,court.entranceFixtures.mesh];
  const meshes=new Map(names.map(name=>[name,{name,groups:new Map(),parts:[],triangles:0,bounds:bounds()}]));
  const frame=meshes.get(frameName),glass=meshes.get(glassName),bed=meshes.get(bedName),nursery=meshes.get(nurseryName),plants=meshes.get(plantsName),vestibule=meshes.get(vestibuleName),fixtures=meshes.get(court.entranceFixtures.mesh);
  const figures=[
    {id:'west-head-glimpse',eye:[5.6,1.62,2.5],target:[5.6,1.68,.60],headBand:[1.5,1.9]},
    {id:'east-head-glimpse',eye:[18.2,1.62,2.5],target:[18.2,1.68,.60],headBand:[1.5,1.9]},
  ];
  const clearRays=figures.flatMap(f=>[-.055,0,.055].map(dx=>({from:[f.eye[0]+dx,f.eye[1],f.eye[2]],to:[f.target[0]+dx,f.target[1],f.target[2]]})));
  let windowLeavesOmitted=0;
  function part(mesh,id,role,material,points,indices,uvs=null,{keepWindows=false}={}){
    if(keepWindows&&clearRays.some(ray=>indices.some((_,i)=>i%3===0&&courtRayTriangle(ray.from,ray.to,...indices.slice(i,i+3).map(k=>points[k]))!==null))){windowLeavesOmitted++;return;}
    if(mesh===fixtures)points=points.map(p=>[p[0]-13,p[1],p[2]-2]);
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
    if(mesh.parts.length>previous)mesh.parts.at(-1).obb={center:mesh===fixtures?[c[0]-13,c[1],c[2]-2]:c,size:s,basis};
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

  // Reversible infill occupies the existing dry north band. The pool hall,
  // basin and its taller roof remain beyond an actual south glazed boundary.
  const roofHeight=z=>court.eaves+(court.ridge-court.eaves)*(1-Math.abs(z-2)/2);
  box(frame,'paving-substrate','floor',M.joint,[12.5,-.041,2],[25,.09,4]);
  for(let x=0;x<25;x++)for(let z=0;z<4;z++)
    box(frame,`terrazzo:${x}:${z}`,'floor',M.paving,[x+.5,-.006,z+.5],[.992,.024,.992]);
  for(const z of[1.15,3.85]){
    box(frame,`gully:${z}`,'drain',M.joint,[10.5,-.003,z],[20.9,.028,.09]);
    for(let x=.15;x<21;x+=.30)box(frame,`grate:${x.toFixed(2)}:${z}`,'drain',M.metal,[x,.009,z],[.035,.012,.085]);
  }
  const postXs=[.07,3.5,7,10.5,14,17.5,20.94];
  for(const x of postXs)for(const z of[.06,3.97]){
    // The entry gap remains clear; the south frame is fixed glazing.
    if(z<1&&x>11.5&&x<14.5)continue;
    box(frame,`post:${x}:${z}`,'side-stock',M.iron,[x,2,z],[.10,4,.06]);
    box(frame,`collar:${x}:${z}`,'side-stock',M.metal,[x,.20,z],[.14,.10,.06]);
  }
  for(const z of[.06,3.97])box(frame,`eave:${z}`,'overhead-frame',M.iron,[10.5,3.96,z],[21,.08,.06]);
  box(frame,'ridge','overhead-frame',M.iron,[10.5,5.15,2],[21,.10,.08]);
  for(const z of[1,3])box(frame,`purlin:${z}`,'overhead-frame',M.iron,[10.5,roofHeight(z)-.06,z],[21,.07,.055]);
  for(const x of[.07,1.75,3.5,5.25,7,8.75,10.5,12.25,14,15.75,17.5,19.25,20.94]){
    beam(frame,`rafter-north:${x}`,'overhead-frame',M.iron,[x,3.96,.06],[x,5.15,2],.06);
    beam(frame,`rafter-south:${x}`,'overhead-frame',M.iron,[x,5.15,2],[x,3.96,3.97],.06);
  }
  // Glass is a real fixed screen with a low opaque plinth, repeated mullions
  // and a clear pair of aperture-free faces; nothing resembles an exit leaf.
  box(frame,'south-opaque-plinth','opaque-plinth',M.wall,[10.5,.09,4],[21,.18,.12]);
  const bays=[0,3.5,7,10.5,14,17.5,21];
  for(const z of[0,4])for(let n=1;n<bays.length;n++){
    const a=bays[n-1]+.06,b=bays[n]-.06;
    const spans=z===0&&a<14.5&&b>11.5?[[a,11.5],[14.5,b]]:[[a,b]];
    for(const[s0,s1]of spans){if(s1<=s0)continue;
      for(const y of[.36,1.65,3.92])box(frame,`glazing-rail:${z}:${n}:${s0}:${y}`,'side-stock',M.iron,[(s0+s1)/2,y,z],[s1-s0,.045,.06]);
      for(const[y0,y1]of[[.39,1.62],[1.68,3.89]])box(glass,`side-pane:${z}:${n}:${s0}:${y0}`,'side-glazing',M.glass,[(s0+s1)/2,(y0+y1)/2,z],[s1-s0,y1-y0,.008],undefined,{normalizedUv:true});
    }
  }
  const pitch=Math.atan((court.ridge-court.eaves)/2),cs=Math.cos(pitch),sn=Math.sin(pitch);
  for(let n=0;n<12;n++)for(const south of[false,true]){
    const a=.06+n*1.74,b=Math.min(20.94,a+1.67),z=south?3:1;
    const basis=[[1,0,0],[0,cs,south?sn:-sn],[0,south?-sn:sn,cs]];
    box(glass,`roof-pane:${n}:${south}`,'roof-glazing',M.glass,[(a+b)/2,4.60,z],[b-a,.010,1.95/cs],basis,{normalizedUv:true});
  }
  // Glazed gables close the greenhouse above the west wall and the lower
  // changing-room roof. Shallow horizontal panes preserve real sight lines.
  for(const x of[.01,20.99])for(const z of[.5,1.5,2.5,3.5]){
    const top=roofHeight(z)-.17,base=x<1?.2:3.42;
    box(glass,`gable:${x}:${z}`,'gable-glazing',M.glass,[x,(base+top)/2,z],[.008,top-base,.93],undefined,{normalizedUv:true});
    box(frame,`gable-mullion:${x}:${z}`,'side-stock',M.iron,[x,(base+top)/2,z-.47],[.055,top-base,.04]);
  }
  for(const p of court.partitionSegments){
    if(p.kind==='glass')continue;
    box(vestibule,p.id,'changing-wall',M.wall,[p.x,p.height/2,p.z],[p.width,p.height,p.depth]);
    box(vestibule,p.id+':skirting','changing-wall',M.blue,[p.x,.10,p.z],[p.width,.20,p.depth]);
  }
  box(vestibule,'changing-ceiling','changing-ceiling',M.wall,[23,3.47,2],[4,.14,4]);
  box(vestibule,'changing-east-bench','changing-furniture',M.wood,[24.65,.45,2.20],[.48,.06,2.10]);
  for(const z of[1.45,2.95])box(vestibule,'bench-bracket:'+z,'changing-furniture',M.iron,[24.8,.24,z],[.15,.42,.045]);
  // Independent greenhouse supply/extract and changing exhaust are visibly
  // separate ducts. Each ends at a mounted service flange, not in midair.
  for(const[z,y,label]of[[.25,3.72,'glasshouse-supply'],[.80,3.72,'glasshouse-extract']]){
    box(frame,label+':trunk','ventilation',M.metal,[12.5,y,z],[24.9,.18,.22]);
    for(const x of[2.4,7.4,12.4,17.4]){
      box(frame,`${label}:outlet:${x}`,'ventilation',M.iron,[x,y-.107,z],[.68,.045,.22]);
      for(let n=0;n<7;n++)box(frame,`${label}:louvre:${x}:${n}`,'ventilation',M.metal,[x-.29+n*.095,y-.135,z],[.025,.018,.18]);
    }
    box(vestibule,label+':east-flange','ventilation',M.metal,[24.97,y,z],[.06,.36,.40]);
  }
  box(vestibule,'changing-extract-trunk','ventilation',M.metal,[23.5,3.64,2.9],[2.94,.18,.22]);
  box(vestibule,'changing-extract-east-flange','ventilation',M.metal,[24.97,3.64,2.9],[.06,.34,.38]);
  box(vestibule,'changing-extract-grille','ventilation',M.iron,[23.2,3.39,2.9],[.62,.03,.26]);
  box(vestibule,'changing-extract-neck','ventilation',M.metal,[23.2,3.5,2.9],[.24,.22,.24]);
  for(let n=0;n<8;n++)box(vestibule,'changing-extract-slat:'+n,'ventilation',M.metal,[22.94+n*.075,3.365,2.9],[.025,.025,.24]);
  for(const lamp of court.lamps){
    const{x,y,z,id}=lamp;
    if(id.includes('light')||id.includes('fluorescent')){
      const host=id.includes('changing')?vestibule:frame;
      box(host,`housing:${id}`,'fluorescent-fixture',M.iron,[x,y+.075,z],[1.30,.055,.16]);
      for(const dz of[-.04,.04]){
        cylinder(host,`tube:${id}:${dz}`,'fluorescent-fixture',M.tube,[x,y,z+dz],.018,.018,1.18,8,'x');
        for(const dx of[-.60,.60])cylinder(host,`end:${id}:${dx}:${dz}`,'fluorescent-fixture',M.metal,[x+dx,y,z+dz],.024,.024,.04,8,'x');
      }
      for(const dx of[-.50,.50])beam(host,`drop:${id}:${dx}`,'overhead-frame',M.metal,[x+dx,y+.10,z],[x+dx,id.includes('changing')?3.39:roofHeight(z)-.09,z],.014);
    }else{
      box(frame,'exit-globe-foot','side-stock',M.iron,[x,2.15,.06],[.15,.30,.08]);
      beam(frame,'exit-globe-neck','side-stock',M.iron,[x,2.15,.10],[x,2.25,z],.028);
      cylinder(frame,'exit-globe','side-stock',M.opal,[x,y,z],.125,.125,.23,12);
      cylinder(frame,'exit-globe-cap','side-stock',M.iron,[x,y+.14,z],.07,.07,.05,10);
    }
  }
  for(const[bi,b]of court.plantingBands.entries()){
    const cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2,w=b.x1-b.x0,d=b.z1-b.z0;
    box(bed,`trough:${bi}`,'solid-planting',M.brick,[cx,(b.height-.08)/2,cz],[w,b.height-.08,d]);
    for(const z of[b.z0+.065,b.z1-.065])box(bed,`coping:${bi}:${z}`,'solid-planting',M.stone,[cx,b.height-.04,z],[w,.08,.13]);
    for(const x of[b.x0+.065,b.x1-.065])box(bed,`end-coping:${bi}:${x}`,'solid-planting',M.stone,[x,b.height-.04,cz],[.13,.08,d-.26]);
    box(bed,`soil:${bi}`,'soil',M.soil,[cx,b.height-.075,cz],[w-.26,.07,d-.26]);
    // Narrow nursery shelves stay over the planting; there is no new shelf
    // or pot solid in the actual clear pedestrian lane.
    box(nursery,`shelf:${bi}`,'nursery-stock',M.wood,[cx,.70,.16],[w-.30,.035,.28]);
    for(let x=b.x0+.45;x<b.x1-.3;x+=1.15){
      cylinder(nursery,`pot:${bi}:${x}`,'nursery-stock',M.pot,[x,1.20,.20],.085,.13,.24,8);
      rim(nursery,`pot-rim:${bi}:${x}`,M.pot,[x,1.326,.20],.14,.115,.025,8);
    }
  }
  let seed=0x5f38a2c1;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  for(const[bi,b]of court.plantingBands.entries()){
    for(let x=b.x0+.24,n=0;x<b.x1-.2;x+=.48,n++){
      const z=.40+(n%2)*.30,top=2.4+random()*.5;
      beam(plants,`stem:${bi}:${n}`,'central-stem',M.stem,[x,1.07,z],[x,top,z],.018,{keepWindows:true});
      for(let k=0;k<10;k++){
        const angle=k*2.399+random()*.5,at=1.16+k*.125,reach=.35+random()*.30;
        leaf(`broadleaf:${bi}:${n}:${k}`,[x,at,z],[x+Math.cos(angle)*reach,Math.min(2.94,at+.20+random()*.35),z+Math.sin(angle)*reach],.42+random()*.20,k%3===0?M.jade:M.deep,{band:b});
      }
    }
    for(let x=b.x0+.22,n=0;x<b.x1-.2;x+=.26,n++){
      leaf(`upright-screen:${bi}:${n}`,[x,1.19,1.00],[x+(n%2?.025:-.025),2.30,.94],.46,n%3?M.deep:M.jade,{band:b});
    }
    for(let n=0;n<Math.floor((b.x1-b.x0)/1.2);n++){
      const x=b.x0+.55+n*1.2,z=.40;
      for(let f=0;f<4;f++){
        const a=f*1.57+n*.6,tip=[clamp(x+Math.cos(a)*.45,b.x0+.05,b.x1-.05),1.50+random()*.20,clamp(z+Math.sin(a)*.35,.05,1.05)];
        for(let k=1;k<4;k++)for(const side of[-1,1]){
          const base=lerp([x,1.10,z],tip,k/5);
          leaf(`fern:${bi}:${n}:${f}:${k}:${side}`,base,[base[0]+Math.cos(a+side*1.57)*.16,base[1]+.06,base[2]+Math.sin(a+side*1.57)*.16],.08,M.fern,{simple:true,band:b});
        }
      }
    }
    // Vines hang only above the bed, retaining full-height clear circulation.
    for(let x=b.x0+.65,n=0;x<b.x1-.3;x+=1.3,n++){
      let previous=[x,3.70,.20];
      for(let k=1;k<=8;k++){
        const point=[x+Math.sin(k*.65+n)*.06,3.70-k*.20,.20+Math.sin(k*.8+n)*.035];
        beam(plants,`vine:${bi}:${n}:${k}`,'hanging-vine',M.stem,previous,point,.008);
        leaf(`vine-leaf:${bi}:${n}:${k}`,point,[point[0]+(k%2?.16:-.16),point[1]-.12,point[2]+.05],.14,M.vine,{central:false,role:'hanging-vine',simple:true,keepWindows:false});previous=point;
      }
    }
  }
  // Deliberately narrow leaf-edged glimpses. Finite broad leaves flank each
  // slot; approaching off-axis intersects foliage instead of revealing an
  // openly standing mannequin. The central 110mm ray band remains clear.
  for(const[f,w]of figures.entries())for(const side of[-1,1])for(let n=0;n<5;n++){
    const x=w.target[0]+side*(.145+n*.14),band=court.plantingBands[f];
    leaf(`glimpse-flank:${f}:${side}:${n}`,[x,1.15,1.045],[x+.005,2.20,1.005],.16,M.deep,{band});
  }
  // Rehost every class of old admission furniture. These coordinates are
  // converted to the unchanged (84,30) instance datum inside part().
  box(fixtures,'old-threshold-mosaic','preserved-entry-fixture',M.ivory,[13,.018,.22],[5.8,.036,1.34]);
  for(let iz=0;iz<4;iz++)for(let ix=0;ix<14;ix++)if((ix+iz)%3===0)
    box(fixtures,`old-mosaic:${ix}:${iz}`,'preserved-entry-fixture',(ix+iz)%2?M.blue:M.wall,[10.30+ix*.415,.041,-.25+iz*.31],[.19,.012,.14]);
  box(fixtures,'old-baths-header','preserved-entry-fixture',M.blue,[13,3.54,.22],[5.55,.78,.13]);
  box(fixtures,'old-baths-header-face','preserved-entry-fixture',M.ivory,[13,3.54,.14],[4.86,.50,.025]);
  const c=court.counter;
  box(fixtures,'attendant-counter-body','rehosted-counter',M.wall,[c.x,.48,c.z+.11],[3.25,.96,.66]);
  box(fixtures,'attendant-counter-top','rehosted-counter',M.stone,[c.x,1.01,c.z],[c.width,.10,c.depth]);
  box(fixtures,'towel-return-slot','rehosted-counter',M.iron,[c.x-1.1,.73,c.z+.444],[.92,.32,.025]);
  box(fixtures,'towel-return-paper','rehosted-counter',M.ivory,[c.x-1.1,.73,c.z+.455],[.78,.22,.010]);
  box(fixtures,'attendant-grille-surround','rehosted-grille',M.ivory,[24.94,2.35,2.1],[.12,1.58,2.7]);
  box(fixtures,'attendant-grille-dark','rehosted-grille',M.iron,[24.86,2.35,2.1],[.04,1.36,2.42]);
  for(let z=.98;z<=3.25;z+=.25)beam(fixtures,'grille-bar:'+z,'rehosted-grille',M.metal,[24.82,1.72,z],[24.82,2.98,z],.025);
  for(const[bi,b]of court.plantingBands.entries()){
    const x=(b.x0+b.x1)/2;
    box(fixtures,'screen-plinth:'+bi,'rehosted-control-screen',M.wall,[x,.34,.12],[2.85,.68,.16]);
    for(const dx of[-1.42,-.48,.50,1.42])box(fixtures,`screen-post:${bi}:${dx}`,'rehosted-control-screen',M.ivory,[x+dx,1.72,.12],[.08,2.12,.10]);
    box(fixtures,'screen-top:'+bi,'rehosted-control-screen',M.ivory,[x,2.76,.12],[2.92,.12,.12]);
    for(const dx of[-.94,.01,.95])box(fixtures,`screen-glass:${bi}:${dx}`,'rehosted-control-screen',M.glass,[x+dx,1.73,.12],[.76,1.88,.045],undefined,{normalizedUv:true});
  }
  cylinder(fixtures,'folded-turnstile-shaft','rehosted-folded-turnstile',M.metal,[24.65,.78,3.45],.075,.075,1.48,12);
  cylinder(fixtures,'folded-turnstile-head','rehosted-folded-turnstile',M.metal,[24.65,.83,3.45],.16,.16,.14,12);
  for(const dz of[-.06,0,.06])beam(fixtures,'folded-turnstile-arm:'+dz,'rehosted-folded-turnstile',M.metal,[24.65,.84,3.45+dz],[24.65,.12,3.58+dz],.035);
  for(const z of[1.2,1.75]){
    cylinder(fixtures,'rehosted-bypass-post:'+z,'rehosted-service-hardware',M.metal,[24.80,.58,z],.055,.055,1.12,10);
    cylinder(fixtures,'rehosted-bypass-cap:'+z,'rehosted-service-hardware',M.metal,[24.80,1.16,z],.10,.10,.08,10);
  }
  beam(fixtures,'folded-bypass-rail','rehosted-service-hardware',M.metal,[24.8,1.0,1.2],[24.8,1.0,1.75],.045);
  for(let x=1.0;x<=3.4;x+=.48)box(fixtures,'rehosted-radiator-fin:'+x,'rehosted-service-hardware',M.ivory,[x,.66,.23],[.24,1.14,.16]);
  box(fixtures,'rehosted-radiator-base','rehosted-service-hardware',M.iron,[2.2,.12,.23],[2.92,.20,.28]);
  box(fixtures,'rehosted-service-box','rehosted-service-hardware',M.metal,[3.5,1.62,.23],[1.18,1.04,.24]);
  box(fixtures,'rehosted-service-box-face','rehosted-service-hardware',M.ivory,[3.5,1.62,.10],[.94,.80,.025]);
  box(fixtures,'rehosted-boot-scraper','rehosted-service-hardware',M.iron,[1.4,.11,.60],[2.25,.18,.34]);
  // Each sign is an opaque physical enamel panel, its face texture baked from
  // the same pinned font pipeline as the existing institutional lettering.
  for(const[n,s]of court.signs.entries()){
    const normal=s.normal,basis=normal[0]<0?[[0,0,-1],[0,1,0],[1,0,0]]:[[1,0,0],[0,1,0],[0,0,1]],
      c=[s.x,s.y,s.z],front=c.map((v,k)=>v+normal[k]*.017);
    box(vestibule,'sign-substrate:'+s.id,'physical-wayfinding',M.blue,c,[s.width+.025,s.height+.025,.025],basis);
    box(vestibule,'sign-face:'+s.id,'physical-wayfinding',M['sign'+n],front,[s.width,s.height,.003],basis,{normalizedUv:true,signFace:true});
  }
  const report={meshNames:names,localBounds:{x0:0,x1:25,z0:-1.2,z1:4.06},floorDatum:0,
    eaves:court.eaves,ridge:court.ridge,plantingBands:court.plantingBands,
    clearLane:{x0:.25,x1:20.70,z0:court.bodyLane.z0,z1:court.bodyLane.z1,width:court.clearFaces.z1-court.clearFaces.z0},
    doors:court.doors,changing:court.changing,
    mouthPolicy:'Original pool-lobby door; D1 and D2 use existing ordinary paired-door controls.',
    facadeAdded:false,rearDoorAdded:false,plantsAdded:true,apparitionsAdded:false,
    glassPolicy:'MASK sparse smudge/reflection coverage with real frame and opaque 180mm plinth; no BLEND.',
    ventilation:{greenhouse:['glasshouse-supply','glasshouse-extract'],changing:['changing-extract'],termination:{axis:'x',coordinate:25,worldCoordinate:96}},
    fixtureOrigin:court.entranceFixtures.origin,figureWindows:figures,windowLeavesOmitted,lamps:court.lamps.map(l=>({...l})),maximumTriangles:43000,maximumBytes:5*1024*1024};
  return {meshes,materials:GLASS_COURT_MATERIALS,report};
}
