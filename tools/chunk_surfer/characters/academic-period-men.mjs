// Period cuts over the retained anatomical skeleton. Dates describe reference
// garments, not the lives of the fictional wearers. All panels carry real skin
// weights; no trousers, collar or historical silhouette is a billboard.
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

export function buildAcademicPeriodMan(source,d,h){
  const {geometry,tube,ellipsoid,torsoWeights,retargetMesh,masters,normals}=h;
  const bones=new Map(source.bones.map((b,index)=>[b.name,{...b,index}])),parts=[];
  const put=(mesh,role)=>{mesh.role=role;parts.push(mesh);return mesh;};
  const chest=bones.get('chest').index,pelvis=bones.get('pelvis').index,head=bones.get('head');
  const seam=(name,points,radius,role='trim',bone=chest)=>put(tube(name,points,radius,bone),role);
  const box=(name,c,size,bone)=>{
    const p=[];for(const z of[-1,1])for(const y of[-1,1])for(const x of[-1,1])p.push(add(c,[x*size[0]/2,y*size[1]/2,z*size[2]/2]));
    return geometry(name,p,[0,2,3,0,3,1,4,5,7,4,7,6,0,1,5,0,5,4,2,6,7,2,7,3,0,4,6,0,6,2,1,3,7,1,7,5],bone);
  };
  const panel=(name,p,role,bone=chest)=>{const mesh=geometry(name,p,Array.from({length:p.length-2},(_,i)=>[0,i+1,i+2]).flat(),bone);if(mesh.normals.filter((_,i)=>i%3===2).reduce((n,v)=>n+v,0)>0){for(let i=0;i<mesh.indices.length;i+=3)[mesh.indices[i+1],mesh.indices[i+2]]=[mesh.indices[i+2],mesh.indices[i+1]];normals(mesh);}return put(mesh,role);};
  function shell(name,profiles,{opening=0,cutaway=false,split=false}={}){
    const points=[],indices=[],segments=64;
    for(let j=0;j<profiles.length;j++)for(let k=0;k<=segments;k++){
      const r=profiles[j],gap=cutaway?opening+clamp((1.16-r.y)/.30)*1.12:opening,a=gap+(Math.PI*2-2*gap)*k/segments;
      points.push([Math.sin(a)*r.x,r.y,-Math.cos(a)*r.z]);
      if(j&&k){const mid=(k-.5)/segments*Math.PI*2;if(split&&r.y<1.15&&Math.abs(mid-Math.PI)<.11)continue;const v=(j-1)*(segments+1)+k-1;indices.push(v,v+1,v+segments+2,v,v+segments+2,v+segments+1);}
    }return torsoWeights(geometry(name,points,indices,pelvis),source);
  }
  const rows=(top,bottom,count=20)=>Array.from({length:count+1},(_,i)=>top+(bottom-top)*i/count);
  function legCenter(side,y){
    const thigh=bones.get('thigh_'+side),shin=bones.get('shin_'+side),foot=bones.get('foot_'+side);
    const a=y>=shin.head[1]?thigh.head:shin.head,b=y>=shin.head[1]?shin.head:foot.head;
    return mix(a,b,(a[1]-y)/(a[1]-b[1]));
  }
  function legWeights(mesh,side){
    const thigh=bones.get('thigh_'+side),shin=bones.get('shin_'+side),foot=bones.get('foot_'+side);
    for(let v=0;v<mesh.positions.length/3;v++){
      const y=mesh.positions[v*3+1];let a=thigh.index,b=shin.index,t=clamp((shin.head[1]+.035-y)/.07);
      if(y>thigh.head[1]){a=pelvis;b=thigh.index;t=clamp((thigh.head[1]+.11-y)/.11);}
      if(y<.13){a=shin.index;b=foot.index;t=clamp((.13-y)/.065);}
      mesh.skinIndex.splice(v*4,4,a,b,0,0);mesh.skinWeight.splice(v*4,4,1-t,t,0,0);
    }return mesh;
  }
  function legPanel(name,side,ys,radius,range=[0,Math.PI*2],offset=0){
    const p=[],idx=[],segments=range[1]-range[0]>.5?40:2;
    for(let j=0;j<ys.length;j++)for(let k=0;k<=segments;k++){
      const y=ys[j],a=range[0]+(range[1]-range[0])*k/segments,c=legCenter(side,y),r=radius(y);
      p.push([c[0]+Math.sin(a)*(r[0]+offset),y,c[2]-Math.cos(a)*(r[1]+offset)]);
      if(j&&k){const v=(j-1)*(segments+1)+k-1;idx.push(v,v+segments+2,v+segments+1,v,v+1,v+segments+2);}
    }return legWeights(geometry(name,p,idx,pelvis),side);
  }
  function breechesAndHose(full){
    for(const side of['L','R']){
      const knee=bones.get('shin_'+side).head[1],hem=knee-.035;
      const radius=y=>{const t=clamp((1.085-y)/(1.085-hem)),width=full?.092+.043*Math.sin(t*Math.PI)-.020*t:.087-.026*t;return[width,width*(full?1.05:1)];};
      put(legPanel(full?'1642 full knee breeches with gathered hem':'1790 fitted knee breeches',side,rows(1.085,hem),radius),'trouser');
      const band=legPanel('separate gathered breeches knee band',side,[hem+.025,hem],y=>radius(y).map(n=>n+.003));put(band,'trim');
      const hoseRadius=y=>{const t=clamp((hem-y)/(hem-.075)),width=.049+.008*Math.sin(t*Math.PI)-.020*t;return[width,width*.96];};
      put(legPanel('separate pale knitted stocking below the knee',side,rows(hem,.073,18),hoseRadius),'shirt');
      const kneeCenter=legCenter(side,hem+.012);put(ellipsoid('breeches knee fastening',[kneeCenter[0]+(side==='L'?-.075:.075),hem+.012,kneeCenter[2]-.005],[.006,.009,.005],bones.get('shin_'+side).index,6,12),'metal');
    }
  }
  function trousers(punk=false){
    for(const side of['L','R']){
      const radius=y=>{const t=clamp((1.18-y)/1.11),w=punk?.083-.040*t:.106-.062*t;return[w,w*(punk?1.02:1.05)];};
      put(legPanel(punk?'1983 narrow bondage trousers':'1835 high rise slim full length trousers',side,rows(punk?1.09:1.18,.073,28),radius),'trouser');
      if(punk){
        for(const y of[.98,.86,.74,.62,.50,.38])put(legPanel('woven tartan horizontal check band',side,[y+.008,y-.008],radius,[0,Math.PI*2],.0015),'accent');
        for(let n=0;n<8;n++){const a=n*Math.PI/4;put(legPanel('woven tartan vertical check line',side,rows(1.09,.30,20),radius,[a-.016,a+.016],.002),'trim');}
        const center=legCenter(side,.70),sign=side==='L'?-1:1;
        put(legPanel('physical buckled bondage thigh strap',side,[.714,.686],radius,[0,Math.PI*2],.006),'coat');
        put(legWeights(box('metal strap buckle at outer thigh',[center[0]+sign*.105,.70,center[2]-.005],[.012,.04,.045],pelvis),side),'metal');
      }
    }
  }
  function sleeves(amount=1){
    for(const m of masters.female.meshes.filter(mesh=>/^option2-continuous-sleeve/.test(mesh.name))){
      const out=retargetMesh(m,masters.female,source,{height:source.height,width:1,depth:1});out.name='period fitted continuous sleeve '+m.name;
      for(let v=0;v<out.positions.length/3;v++){
        const point=out.positions.slice(v*3,v*3+3),side=point[0]<0?'L':'R',upper=bones.get('upperarm_'+side),fore=bones.get('forearm_'+side),bone=point[1]>fore.head[1]?upper:fore,axis=sub(bone.tail,bone.head),t=clamp(dot(sub(point,bone.head),axis)/dot(axis,axis)),center=add(bone.head,mul(axis,t)),factor=bone===upper?amount:Math.min(1,amount);
        const moved=add(center,mul(sub(point,center),factor));out.positions.splice(v*3,3,...moved);
      }put(normals(out),'coat');
    }
  }
  function shoes({boots=false,buckles=false}={}){
    for(const side of['L','R']){
      const foot=bones.get('foot_'+side),x=foot.head[0],z=foot.head[2]-.105,bone=foot.index;
      put(ellipsoid(boots?'1983 heavy leather boot toe':'period low leather shoe upper',[x,.045,z],[boots?.067:.058,.041,.133],bone,10,28),'shoe');
      put(box(boots?'heavy raised boot sole':'thin leather shoe sole',[x,boots?.018:.009,z],[boots?.136:.12,boots?.03:.016,.277],bone),'shoe');
      put(box('separate low stacked shoe heel',[x,boots?.025:.015,foot.head[2]+.008],[.095,boots?.045:.028,.055],bone),'shoe');
      if(boots){
        const shaft=legPanel('1983 leather ankle boot shaft',side,rows(.31,.07,12),()=>[.058,.061]);put(shaft,'shoe');
        for(let i=0;i<6;i++){const y=.115+i*.033,c=legCenter(side,y);seam('boot cross lacing',[[c[0]-.025,y,c[2]-.063],[c[0]+.025,y+.025,c[2]-.063]],.0024,'trim',bones.get('shin_'+side).index);seam('boot cross lacing',[[c[0]+.025,y,c[2]-.063],[c[0]-.025,y+.025,c[2]-.063]],.0024,'trim',bones.get('shin_'+side).index);}
      }else if(buckles){
        for(const [a,b]of[[[-.024,-.012],[.024,-.012]],[[.024,-.012],[.024,.012]],[[.024,.012],[-.024,.012]],[[-.024,.012],[-.024,-.012]]])seam('period shoe buckle frame',[[x+a[0],.09,z+a[1]],[x+b[0],.09,z+b[1]]],.0022,'metal',bone);
      }else seam('plain leather latchet across instep',[[x-.045,.083,z],[x+.045,.083,z]],.006,'shoe',bone);
    }
  }
  function shirtAndNeck(high=false){
    put(shell('visible linen shirt front',[{y:1.55,x:.084,z:.086},{y:1.43,x:.19,z:.19},{y:1.17,x:.15,z:.155}]),'shirt');
    if(high){
      for(const side of[-1,1])panel('1835 high standing shirt collar',[[side*.005,1.57,-.09],[side*.073,1.565,-.072],[side*.080,1.50,-.115],[side*.012,1.49,-.125]],'shirt');
      for(let i=0;i<3;i++)seam('1835 wrapped high cravat fold',[[-.07,1.51-i*.014,-.117],[0,1.505-i*.014,-.145],[.07,1.51-i*.014,-.117]],.009,'accent');
    }else{
      for(const side of[-1,1])panel('1642 linen falling collar',[[side*.006,1.553,-.080],[side*.072,1.54,-.068],[side*.177,1.435,-.205],[side*.025,1.417,-.228]],'shirt');
      for(const side of[-1,1])seam('linen collar tie',[[side*.008,1.48,-.21],[side*.013,1.405,-.238]],.002,'shirt');
    }
  }
  if(d.hollow==='empty-coat'){
    // The V&A cloak reference supplies a circular, sleeveless silhouette. No
    // skin, head, cuffs, trousers or hidden body fills this open garment.
    const profiles=[{y:1.51,x:.075,z:.068},{y:1.43,x:.19,z:.12},{y:1.22,x:.255,z:.19},{y:.85,x:.285,z:.22},{y:.45,x:.30,z:.235},{y:.26,x:.30,z:.235}];
    const cloak=shell('1580–1600 empty circular sleeveless cloak with open neck and front',profiles,{opening:.30});put(cloak,'coat');
    const front=[];for(const r of profiles)front.push([Math.sin(.30)*r.x,r.y,-Math.cos(.30)*r.z]);seam('cloak turned satin front edge',front,.004,'trim');seam('cloak turned satin front edge',front.map(p=>[-p[0],p[1],p[2]]),.004,'trim');
    return parts;
  }
  if(d.id==='noe'||d.id==='listener'){
    put(shell('1642 fitted short working doublet',[{y:1.545,x:.08,z:.075},{y:1.45,x:.225,z:.17},{y:1.34,x:.23,z:.195},{y:1.14,x:.165,z:.15},{y:1.045,x:.18,z:.16}]),'coat');sleeves(1.08);breechesAndHose(true);shoes();shirtAndNeck(false);
    const p=[[-.19,1.11,-.214],[.19,1.11,-.214],[.23,.59,-.245],[-.23,.59,-.245]];put(torsoWeights(geometry('1642 working waist apron without modern bib or straps',p,[0,1,2,0,2,3],pelvis),source),'shirt');
    seam('1642 waist apron narrow tie',[[-.18,1.105,-.207],[0,1.105,-.217],[.18,1.105,-.207]],.006,'trim',pelvis);
    for(let i=0;i<8;i++)put(ellipsoid('close set working doublet button',[0,1.43-i*.043,-.200],[.004,.005,.003],chest,6,10),'metal');
    const H=head.head[1];put(ellipsoid('1642 soft work cap crown',[0,H+.127,head.head[2]+.004],[.097,.033,.087],head.index,14,40,.04),'coat');
    const rim=[];for(let i=0;i<=48;i++){const a=i*Math.PI*2/48;rim.push([Math.sin(a)*.09,H+.105,head.head[2]-Math.cos(a)*.082]);}seam('1642 soft cap turned band',rim,.006,'trim',head.index);
  }else if(d.id==='emile'){
    trousers();shoes();shirtAndNeck(true);
    put(shell('1835 fitted high waist waistcoat',[{y:1.50,x:.10,z:.12},{y:1.39,x:.205,z:.199},{y:1.18,x:.152,z:.159},{y:1.13,x:.155,z:.159}]),'trim');
    put(shell('1835 full chest nipped waist dress coat with separate split tails',[{y:1.55,x:.09,z:.085},{y:1.47,x:.235,z:.17},{y:1.36,x:.24,z:.207},{y:1.18,x:.148,z:.165},{y:1.145,x:.15,z:.17},{y:.94,x:.195,z:.19},{y:.69,x:.205,z:.19},{y:.50,x:.20,z:.18}],{opening:.27,cutaway:true,split:true}),'coat');sleeves(1.16);
    for(const side of[-1,1])panel('1835 broad peaked coat lapel',[[side*.04,1.545,-.09],[side*.15,1.495,-.17],[side*.185,1.39,-.216],[side*.048,1.22,-.176]],'coat');
    for(const side of[-1,1])put(ellipsoid('separate tail waist button',[side*.09,1.16,.171],[.006,.006,.004],pelvis,6,12),'metal');
  }else if(d.id==='lucien'){
    trousers(true);shoes({boots:true});
    put(shell('1983 cropped asymmetric leather biker jacket',[{y:1.52,x:.09,z:.08},{y:1.445,x:.245,z:.18},{y:1.34,x:.235,z:.20},{y:1.08,x:.175,z:.167},{y:1.025,x:.178,z:.168}]),'coat');sleeves(1.04);
    panel('1983 overlapping asymmetric leather lapel',[[-.105,1.48,-.197],[.03,1.505,-.116],[.14,1.405,-.22],[-.02,1.22,-.216]],'coat');
    panel('1983 broad folded diagonal biker lapel',[[-.09,1.505,-.12],[-.20,1.43,-.20],[-.10,1.335,-.218],[.045,1.49,-.18]],'coat');
    const start=[-.115,1.10,-.190],end=[.13,1.48,-.198];seam('1983 actual diagonal jacket zip', [start,end],.0025,'metal');for(let i=0;i<=23;i++){const p=mix(start,end,i/23);put(box('1983 raised metal zip tooth',p,[.010,.004,.003],chest),'metal');}
    for(const side of[-1,1]){panel('1983 shoulder epaulette',[[side*.08,1.49,-.04],[side*.205,1.455,-.07],[side*.21,1.44,-.04],[side*.08,1.475,-.015]],'coat');put(ellipsoid('1983 lapel stud',[side*.135,1.405,-.224],[.006,.006,.004],chest,6,12),'metal');}
    seam('1983 clipped safety pin on lapel',[[.09,1.43,-.223],[.055,1.39,-.223],[.085,1.40,-.223]],.0018,'metal');
  }
  return parts;
}
