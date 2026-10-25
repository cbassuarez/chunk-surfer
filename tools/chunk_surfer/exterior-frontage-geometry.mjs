// Dimensional shop joinery and physically open shelter screens. These reuse
// the existing ordinary opaque palette; no renderer/transparency exception or
// new inscription is needed. Brick masses and gameplay doors stay data-owned.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const EXTERIOR_FRONTAGE_CONTRACT=freeze({
  pub:{width:8,height:12.8,minimumFaceX:-5.50,maximumFaceX:1.60,
    doorZ:-2.75,doorWidth:1.95,doorHeight:2.35,
    groundWindows:[{z:-.65,width:1.55},{z:2.05,width:2.15}],
    upperWindowZ:[-1.65,1.75],upperWindowY:[5.1,8.2,11.3],
    signCarrier:{center:[.26,3.65,0],size:[.09,.46,6.9]}},
  arrivalShelter:{name:'city_bus_shelter',width:2.9,length:5,height:2.63,
    timetable:{center:[1.28,1.45,-1.2],size:[.10,1.30,1.10]}},
  compactShelter:{name:'city_bus_shelter_compact',width:1.4,length:5,height:2.63,rearX:-.61,
    timetable:{center:[-.55,1.45,-1.9],size:[.10,1.30,.76]}},
  clearPaneHeight:{y0:.70,y1:1.85},safetyBandY:[1.08,1.43],safetyBandHeight:.026,
  maximumPubTriangles:10000,maximumShelterTriangles:1800,
});
const material=(name,rgb,metallicFactor=0,roughnessFactor=.9,extras={})=>({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor,roughnessFactor},...extras});
const PALETTE=freeze({
  stone:material('chapel stone',[.43,.44,.41],0,.86),
  green:material('pub green paint',[.075,.18,.12],0,.66),
  black:material('black lacquer',[.025,.028,.03],.15,.28),
  white:material('aged white paint',[.69,.72,.66],.03,.68),
  ivory:material('ivory',[.82,.80,.69],0,.58),
  brass:material('brass',[.49,.31,.08],.8,.25),
  steel:material('painted steel',[.22,.24,.23],.7,.46),
  iron:material('black lacquer',[.025,.028,.03],.15,.28),
  brick:material('ellery dark brick',[.13,.075,.058],0,.96),
  plaster:material('academic plaster',[.63,.62,.55],0,.92),
  slate:material('wet slate',[.075,.09,.105],.03,.52),
  terracotta:material('dull terracotta',[.42,.17,.08],0,.86),
  warm:material('occupied warm glass',[.38,.25,.10],.02,.28,{emissiveFactor:[.86,.53,.20]}),
});
function builder(api,m){
  const{materials,addBox,addBeam,addCylinder,addQuad}=api;
  if(!m||!Array.isArray(materials)||[addBox,addBeam,addCylinder].some(f=>typeof f!=='function'))throw Error('Exterior frontage needs the ordinary opaque primitive builder API.');
  const initial=materials.length,ids={};
  for(const[key,descriptor]of Object.entries(PALETTE)){
    let index=materials.findIndex(item=>item.name===descriptor.name);
    if(index<0){index=materials.length;materials.push(structuredClone(descriptor));}
    ids[key]=index;
  }
  const stats={owner:m.name,triangles:0,newMaterials:materials.length-initial,materials:ids,parts:[]};
  const box=(id,c,size,mat)=>{
    addBox(m,c,size,ids[mat]);stats.triangles+=12;
    stats.parts.push({id,kind:'box',center:c,size,material:mat});
  };
  const beam=(id,a,b,w,mat)=>{
    addBeam(m,a,b,w,ids[mat]);stats.triangles+=12;
    stats.parts.push({id,kind:'beam',a,b,width:w,material:mat});
  };
  const cylinder=(id,c,r,h,mat,sides=8)=>{
    addCylinder(m,c,r,h,ids[mat],sides);stats.triangles+=sides*4;
    stats.parts.push({id,kind:'cylinder',center:c,radius:r,height:h,sides,material:mat});
  };
  const quad=(id,a,b,c,d,mat)=>{
    if(typeof addQuad!=='function')throw Error('Complete pub needs opaque quad geometry.');
    addQuad(m,a,b,c,d,ids[mat]);stats.triangles+=2;
    stats.parts.push({id,kind:'quad',points:[a,b,c,d],material:mat});
  };
  return{stats,box,beam,cylinder,quad};
}

export function addBourgeoisPubFrontage(api,m,{z,h,unitW,depth,deed:authoredDeed}){
  if(![z,h,unitW,depth].every(Number.isFinite)||Math.abs(unitW-8)>1e-8||h<12.6||depth!==5.4)
    throw Error('The complete pub occupies the two existing eight-metre deeds, at their original depth.');
  const{stats,box,beam,cylinder,quad}=builder(api,m),C=EXTERIOR_FRONTAGE_CONTRACT.pub;
  const deed=authoredDeed??(z<-24?0:1),front=-.20,back=-depth,door=-2.75;
  const put=(id,x,y,dz,sx,sy,sz,mat)=>box(id,[x,y,z+dz],[sx,sy,sz],mat);
  const line=(id,a,b,w,mat)=>beam(id,[a[0],a[1],z+a[2]],[b[0],b[1],z+b[2]],w,mat);
  const face=(id,a,b,c,d,mat)=>quad(id,...[a,b,c,d].map(p=>[p[0],p[1],z+p[2]]),mat);
  // Thin masonry is split around physical apertures. No full-depth ground
  // block, emissive window plane or invisible decorative door seals the room.
  const splitFront=(id,y0,y1,holes,mat)=>{
    const ys=[...new Set([y0,y1,...holes.flatMap(v=>[Math.max(y0,v.y0),Math.min(y1,v.y1)])])].filter(v=>v>=y0&&v<=y1).sort((a,b)=>a-b);
    for(let j=1;j<ys.length;j++){
      const lo=ys[j-1],hi=ys[j],mid=(lo+hi)/2;
      if(hi-lo<1e-6)continue;
      const cuts=holes.filter(v=>mid>v.y0&&mid<v.y1).map(v=>[v.z0,v.z1]).sort((a,b)=>a[0]-b[0]);
      let cursor=-3.92,index=0;
      for(const[a,b]of[...cuts,[3.92,3.92]]){
        if(a>cursor+1e-6)put(`${id}-${j}-${index++}`,front-.17,mid,(cursor+a)/2,.34,hi-lo,a-cursor,mat);
        cursor=Math.max(cursor,b);
      }
    }
  };
  const windowHoles=C.groundWindows.map(v=>({z0:v.z-v.width/2,z1:v.z+v.width/2,y0:1.10,y1:3.02}));
  splitFront('pub-ground-split-shell',0,3.40,[{z0:door-1.04,z1:door+1.04,y0:0,y1:3.40},...windowHoles],'green');
  put('pub-real-rear-wall',back+.10,1.70,0,.20,3.40,8,'brick');
  if(deed===0){
    // The exposed corner return has its own true window, rather than the end
    // face of the old extruded backing box.
    put('pub-west-return-low',-2.70,.55,-3.91,5.40,1.10,.18,'green');
    put('pub-west-return-head',-2.70,3.11,-3.91,5.40,.58,.18,'brick');
    for(const[x,w]of[[-4.75,1.30],[-.95,1.90]])put(`pub-west-return-pier-${x}`,x,1.96,-3.91,w,1.72,.18,'green');
    for(const x of[-4.05,-1.95])put(`pub-west-return-jamb-${x}`,x,1.95,-4.015,.13,1.84,.16,'green');
    put('pub-west-return-sill',-3.0,1.08,-4.02,2.32,.10,.32,'stone');
    put('pub-west-return-transom',-3.0,2.60,-4.02,2.14,.06,.08,'brass');
    for(const x of[-3.52,-3.0,-2.48])put(`pub-west-return-mullion-${x}`,x,1.96,-4.02,.035,1.74,.08,'green');
  }
  if(deed===1)put('pub-east-party-wall',-2.7,1.70,3.91,5.4,3.40,.18,'brick');
  put('pub-ground-ceiling',-2.70,3.47,0,5.40,.14,8,'plaster');
  put('pub-rear-upper-wall',back+.12,(h+3.54)/2,0,.24,h-3.54,8,'brick');
  for(const side of[-1,1])put(`pub-upper-party-return-${side}`,-2.70,(h+3.54)/2,side*3.92,5.40,h-3.54,.16,'brick');
  const upperHoles=C.upperWindowY.flatMap(y=>C.upperWindowZ.map(dz=>({y0:y-.93,y1:y+.93,z0:dz-.76,z1:dz+.76})));
  splitFront('pub-upper-split-brick',3.54,h,upperHoles,'brick');
  // A stepped stone order gives the ground floor weight without a single
  // cladding sheet across the doors or windows.
  for(const[part,a,b]of[['left',-3.91,door-1.04],['right',door+1.04,3.91]]){
    put(`pub-stone-foot-${part}`,front+.16,.12,(a+b)/2,.35,.24,b-a,'stone');
    put(`pub-stall-riser-base-${part}`,front+.10,.33,(a+b)/2,.25,.12,b-a,'green');
  }
  for(const[pi,dz]of[-3.94,-1.52,.58,3.67].entries()){
    put(`pub-pilaster-${pi}`,front+.24,1.75,dz,.27,2.96,pi===0?.10:.24,'green');
    put(`pub-pilaster-plinth-${pi}`,front+.29,.39,dz,.38,.42,pi===0?.20:.39,'stone');
    for(const y of[.68,2.91])put(`pub-pilaster-collar-${pi}-${y}`,front+.32,y,dz,.40,.09,pi===0?.20:.42,'brass');
    put(`pub-pilaster-capital-${pi}`,front+.32,3.14,dz,.44,.17,pi===0?.28:.48,'stone');
    for(const side of[-1,1]){
      const curve=Array.from({length:9},(_,i)=>{const a=i/8*Math.PI*1.25;return[front+.38,3.15+.14*Math.sin(a),dz+side*(pi===0?.04+.10*Math.cos(a):.10+.16*Math.cos(a))];});
      for(let j=1;j<curve.length;j++)line(`pub-capital-volute-${pi}-${side}-${j}`,curve[j-1],curve[j],.035,'brass');
    }
  }
  for(const[index,bay]of C.groundWindows.entries()){
    const cz=bay.z,w=bay.width;
    for(const side of[-1,1]){
      put(`pub-ground-window-${index}-jamb-${side}`,front+.20,2.04,cz+side*(w/2+.065),.24,2.02,.13,'green');
      put(`pub-ground-window-${index}-jamb-gilt-${side}`,front+.33,2.04,cz+side*(w/2+.065),.018,1.88,.022,'brass');
    }
    put(`pub-ground-window-${index}-sill`,front+.20,1.08,cz,.47,.10,w+.29,'stone');
    put(`pub-ground-window-${index}-lintel`,front+.17,3.04,cz,.33,.13,w+.30,'green');
    put(`pub-ground-window-${index}-mullion`,front+.15,2.06,cz,.16,1.87,.055,'green');
    put(`pub-ground-window-${index}-transom`,front+.17,2.64,cz,.18,.07,w,'green');
    put(`pub-ground-window-${index}-lower-panel`,front+.09,.65,cz,.15,.65,w,'green');
    for(const y of[.41,.88])put(`pub-ground-window-${index}-panel-bead-${y}`,front+.18,y,cz,.035,.035,w-.16,'brass');
    // An open leading pattern leaves the occupied room visible through most
    // of each light. Opaque panes would erase all the work behind the window.
    const n=Math.max(3,Math.round(w/.31));
    for(let i=0;i<n;i++){
      const d=cz-w/2+(i+.5)*w/n;
      line(`pub-ground-window-${index}-fan-a-${i}`,[front+.16,2.68,d-w/n/2],[front+.16,2.96,d],.018,'brass');
      line(`pub-ground-window-${index}-fan-b-${i}`,[front+.16,2.96,d],[front+.16,2.68,d+w/n/2],.018,'brass');
    }
  }
  for(const side of[-1,1]){
    put(`pub-door-outer-jamb-${side}`,front+.19,1.69,door+side*1.10,.29,3.38,.19,'green');
    put(`pub-door-gilt-fillets-${side}`,front+.345,1.69,door+side*1.10,.024,3.13,.028,'brass');
  }
  put('pub-door-crown',front+.25,3.31,door,.48,.16,2.41,'stone');
  // No static leaf or threshold step. The ordinary door system supplies the
  // paired moving leaves, collision, handles, open/close and saved state.
  box('pub-existing-sign-carrier',[.26,3.65,z],[.09,.46,unitW-1.1],'green');
  for(const y of[3.38,3.94]){
    put(`pub-fascia-raised-moulding-${y}`,.28,y,0,.35,.12,7.74,'green');
    put(`pub-fascia-gilt-line-${y}`,.475,y+.025,0,.022,.025,7.62,'brass');
  }
  for(let i=0;i<18;i++)put(`pub-cornice-dentil-${i}`,.29,4.02,-3.60+i*.424,.29,.12,.16,'stone');
  put('pub-ground-large-cornice',.28,4.10,0,.53,.10,7.96,'stone');
  put('pub-ground-cornice-shadow',.20,4.035,0,.33,.04,7.90,'green');
  stats.signFaces=[{id:`pub-lyric-fascia-${deed===0?'west':'east'}`,copy:deed===0?'THE LYRIC':'PUBLIC HOUSE',
    center:[.312,3.65,z],readerRight:[0,0,-1],up:[0,1,0],widthM:6.76,heightM:.35,capHeightM:.25}];
  for(const[floor,y]of C.upperWindowY.entries())for(const[index,dz]of C.upperWindowZ.entries()){
    const prefix=`pub-upper-${floor}-${index}`,lit=floor===1&&index===deed;
    put(`${prefix}-deep-recess-back`,-.76,y,dz,.045,1.86,1.52,lit?'warm':'black');
    for(const side of[-1,1]){
      put(`${prefix}-reveal-${side}`,-.46,y,dz+side*.74,.57,1.86,.06,'stone');
      put(`${prefix}-jamb-${side}`,-.055,y,dz+side*.69,.13,1.79,.12,'white');
    }
    put(`${prefix}-sash`,-.025,y,dz,.065,.065,1.26,'white');
    put(`${prefix}-mullion`,-.025,y,dz,.065,1.64,.065,'white');
    put(`${prefix}-lintel`,-.02,y+.96,dz,.34,.16,1.73,'stone');
    put(`${prefix}-sill`,.005,y-.94,dz,.48,.11,1.78,'stone');
    if(floor===0){
      put(`${prefix}-apron`,-.10,y-1.11,dz,.19,.20,1.42,'stone');
      for(const side of[-1,1])line(`${prefix}-hood-bracket-${side}`,[-.13,y+.89,dz+side*.68],[.10,y+.68,dz+side*.68],.095,'stone');
    }
  }
  put('pub-top-frieze',-.04,h-.48,0,.35,.24,7.96,'stone');
  for(const y of[h-.26,h-.12])put(`pub-eaves-profile-${y}`,0,y,0,.52,.12,8,'stone');
  const rise=2.0,ridge=-depth/2;
  face('pub-front-slate-pitch',[-.08,h,-4],[ridge,h+rise,-4],[ridge,h+rise,4],[-.08,h,4],'slate');
  face('pub-rear-slate-pitch',[-depth,h,4],[ridge,h+rise,4],[ridge,h+rise,-4],[-depth,h,-4],'slate');
  for(const side of[-1,1]){
    const zz=side*3.98,a=[-.08,h,zz],b=[-depth,h,zz],c=[ridge,h+rise,zz];
    const mid=b.map((v,i)=>(v+c[i])/2);
    if(side>0)face(`pub-solid-roof-gable-${side}`,c,mid,b,a,'brick');
    else face(`pub-solid-roof-gable-${side}`,a,b,mid,c,'brick');
    line(`pub-coped-front-gable-${side}`,[-.08,h+.06,zz],[ridge,h+rise+.06,zz],.13,'stone');
    line(`pub-coped-rear-gable-${side}`,[ridge,h+rise+.06,zz],[-depth,h+.06,zz],.13,'stone');
  }
  put('pub-slate-ridge-roll',ridge,h+rise+.04,0,.17,.12,8,'slate');
  put('pub-attached-chimney',ridge-.38,h+2.34,2.3,.88,1.18,1.22,'brick');
  put('pub-chimney-capping',ridge-.38,h+2.97,2.3,1.03,.13,1.38,'stone');
  for(const dz of[1.98,2.62])cylinder(`pub-chimney-pot-${dz}`,[ridge-.38,h+3.23,z+dz],.13,.40,'terracotta',10);
  // Working rainwater goods continue into a visible shoe at street level.
  for(const x of[.08,-depth+.02]){
    put(`pub-eaves-gutter-${x}`,x,h+.02,0,.14,.13,8,'iron');
    cylinder(`pub-downpipe-${x}`,[x,6.18,z+3.70],.065,12.05,'iron',8);
    line(`pub-downpipe-shoe-${x}`,[x,.22,3.70],[x+.18,.13,3.70],.11,'iron');
    for(const y of[1.0,4.1,7.2,10.3])put(`pub-downpipe-collar-${x}-${y}`,x,y,3.70,.18,.055,.18,'iron');
  }
  // Lanterns are separate, caged volumes with practical light anchors. Their
  // projection is overhead; the ordinary walking strip remains unobstructed.
  for(const dz of[-1.57,3.63]){
    line(`pub-lantern-arm-${dz}`,[.12,2.99,dz],[.79,3.19,dz],.06,'iron');
    put(`pub-lantern-cap-${dz}`,.79,3.06,dz,.43,.09,.35,'iron');
    put(`pub-lantern-lamp-${dz}`,.79,2.80,dz,.24,.43,.22,'warm');
    put(`pub-lantern-foot-${dz}`,.79,2.55,dz,.38,.08,.32,'iron');
    for(const x of[.64,.94])for(const d of[-.13,.13])put(`pub-lantern-cage-${dz}-${x}-${d}`,x,2.80,dz+d,.028,.52,.028,'iron');
  }
  if(deed===0){
    const dz=-3.63;
    line('pub-blade-bracket',[.08,5.51,dz],[1.52,5.51,dz],.065,'iron');
    const curl=Array.from({length:14},(_,i)=>{const a=i/13*Math.PI*1.7,r=.25*(1-i/18);return[.80+Math.cos(a)*r,5.26+Math.sin(a)*r,dz];});
    for(let i=1;i<curl.length;i++)line(`pub-blade-scroll-${i}`,curl[i-1],curl[i],.035,'iron');
    for(const x of[.48,1.31])line(`pub-blade-chain-${x}`,[x,5.50,dz],[x,5.23,dz],.024,'iron');
    put('pub-hanging-lyre-sign',.90,4.61,dz,1.10,1.23,.09,'green');
    for(const y of[4.04,5.18])put(`pub-blade-gold-horizontal-${y}`,.90,y,dz,1.02,.035,.12,'brass');
    for(const x of[.40,1.40])put(`pub-blade-gold-vertical-${x}`,x,4.61,dz,.035,1.16,.12,'brass');
    for(const side of[-1,1]){
      const zz=dz+side*.052;
      for(const s of[-1,1]){
        const curve=Array.from({length:9},(_,i)=>{const t=i/8;return[.90+s*(.29-.13*Math.sin(t*Math.PI)),4.93-.67*t,zz];});
        for(let i=1;i<curve.length;i++)line(`pub-lyre-bow-${side}-${s}-${i}`,curve[i-1],curve[i],.045,'brass');
      }
      line(`pub-lyre-crossbar-${side}`,[.61,4.91,zz],[1.19,4.91,zz],.045,'brass');
      line(`pub-lyre-base-${side}`,[.64,4.26,zz],[1.16,4.26,zz],.055,'brass');
      for(const x of[.77,.90,1.03])line(`pub-lyre-string-${side}-${x}`,[x,4.88,zz],[x,4.31,zz],.014,'brass');
    }
  }
  stats.groundApertures=[{kind:'entry',x:front,z:z+door,width:2.08,y0:0,y1:3.40},...C.groundWindows.map(v=>({kind:'window',x:front,z:z+v.z,width:v.width,y0:1.10,y1:3.02}))];
  stats.fullBuilding=true;stats.staticDoorLeaves=0;
  if(stats.triangles>EXTERIOR_FRONTAGE_CONTRACT.maximumPubTriangles)throw Error(`Complete pub deed exceeds geometry budget: ${stats.triangles}`);
  return stats;
}


export function buildForegroundShelters(api){
  if(typeof api.mesh!=='function')throw Error('Shelter builder requires the existing mesh factory.');
  const reports=[];
  for(const compact of[false,true]){
    const C=compact?EXTERIOR_FRONTAGE_CONTRACT.compactShelter:EXTERIOR_FRONTAGE_CONTRACT.arrivalShelter;
    const{stats,box}=builder(api,api.mesh(C.name)),rear=compact?-.61:-1.22,front=compact?.61:1.20;
    box('shelter-base',[0,.07,0],[compact?1.32:2.60,.14,4.60],'stone');
    if(compact)for(const z of[-2.20,0,2.20])box(`shelter-rear-post-${z}`,[rear,1.24,z],[.10,2.48,.12],'steel');
    else for(const[x,z]of[[-1.20,-2.20],[-1.20,2.20],[1.20,-2.20],[1.20,2.20]])box(`shelter-original-post-${x}-${z}`,[x,1.24,z],[.12,2.48,.12],'steel');
    box('shelter-canopy',[0,2.56,0],[C.width,.14,C.length],'steel');
    box('shelter-original-tube',[0,2.40,0],[compact?1.0:2.40,.10,4.20],'ivory');
    // Opaque glass in this renderer cannot provide a view. Physical absence
    // between the edge seals and two narrow safety strips provides that view.
    for(const y of[.28,2.36]){
      box(`shelter-rear-weather-strip-${y}`,[rear,y,0],[.045,.045,4.40],'black');
      for(const z of[-2.24,2.24])box(`shelter-end-weather-strip-${y}-${z}`,[(rear+front)/2,y,z],[front-rear,.045,.045],'black');
    }
    for(const y of EXTERIOR_FRONTAGE_CONTRACT.safetyBandY){
      box(`shelter-rear-safety-band-${y}`,[rear+.012,y,0],[.026,.026,4.27],'white');
      for(const z of[-2.24,2.24])box(`shelter-end-safety-band-${y}-${z}`,[(rear+front)/2,y,z],[front-rear,.026,.026],'white');
    }
    box(compact?'shelter-compact-timetable-case':'shelter-existing-timetable-carrier',C.timetable.center,C.timetable.size,'white');
    if(stats.triangles>EXTERIOR_FRONTAGE_CONTRACT.maximumShelterTriangles)throw Error('Shelter exceeded its bounded geometry cost.');
    reports.push(stats);
  }
  return reports;
}
