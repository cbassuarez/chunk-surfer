// Original compact tracked excavator. All pieces are ordinary opaque PBR
// surfaces; no billboard, special character shader or decorative collision.
import {DEMOLITION_EXCAVATOR as C} from '../../src/data/demolition-machinery.js';
const palette={
  paint:['excavator: faded ochre enamel',[.46,.285,.055],.025,.74],
  edge:['excavator: contact worn steel',[.25,.255,.235],.82,.42],
  rubber:['excavator: track rubber',[.027,.032,.028],0,.98],
  grease:['excavator: grease and recess',[.032,.026,.020],.15,.38],
  steel:['excavator: dark structural steel',[.095,.105,.100],.75,.62],
  chrome:['excavator: hydraulic piston',[.54,.56,.55],.95,.22],
  seat:['excavator: cab upholstery',[.055,.058,.052],0,.92],
  mud:['excavator: compacted tread soil',[.14,.105,.065],0,.98],
  glass:['excavator: restrained glazing reflection',[.18,.24,.25],.04,.25],
};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>scale(a,1/(Math.hypot(...a)||1));
export function buildDemolitionExcavator(api){
  for(const k of['mesh','addBox','addBeam','addCylinder','addCylinderX','addQuad','addTriangle'])if(typeof api[k]!=='function')throw Error('Excavator requires opaque geometry API: '+k);
  const m=api.mesh(C.mesh),ids={},parts=[],features={};let triangles=0;
  for(const[key,[name,rgb,metallicFactor,roughnessFactor]]of Object.entries(palette)){
    let i=api.materials.findIndex(v=>v.name===name);if(i<0){i=api.materials.length;api.materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor,roughnessFactor},
      extras:{materialFactors:'gltf',letteringFinish:{version:1,profile:'demolition-machinery',localSpecular:true}}});}ids[key]=i;
  }
  const part=(id,kind,data,mat,count)=>{parts.push({id,kind,...data,material:mat});triangles+=count;};
  const box=(id,c,size,mat,yaw=0,pitch=0)=>{api.addBox(m,c,size,ids[mat],yaw,pitch);part(id,'box',{center:c,size,yaw,pitch},mat,12);};
  const beam=(id,a,b,w,mat)=>{api.addBeam(m,a,b,w,ids[mat]);part(id,'beam',{a,b,width:w},mat,12);};
  const quad=(id,a,b,c,d,mat)=>{api.addQuad(m,a,b,c,d,ids[mat]);part(id,'quad',{points:[a,b,c,d]},mat,2);};
  const tri=(id,a,b,c,mat)=>{api.addTriangle(m,a,b,c,ids[mat]);part(id,'triangle',{points:[a,b,c]},mat,2);};
  const cyl=(id,c,r,h,mat,n=12)=>{api.addCylinder(m,c,r,h,ids[mat],n);part(id,'cylinder',{center:c,radius:r,height:h,axis:'y',sides:n},mat,n*4);};
  const axle=(id,c,r,length,mat,n=12)=>{api.addCylinderX(m,c,r,length,ids[mat],n);part(id,'cylinder',{center:c,radius:r,height:length,axis:'x',sides:n},mat,n*4);};
  const tube=(id,a,b,r,mat,n=10)=>{
    const u=unit(sub(b,a)),s=unit(cross(u,Math.abs(u[1])<.9?[0,1,0]:[1,0,0])),t=cross(s,u);
    const ring=p=>Array.from({length:n},(_,i)=>add(p,add(scale(s,r*Math.cos(i/n*2*Math.PI)),scale(t,r*Math.sin(i/n*2*Math.PI)))));
    const aa=ring(a),bb=ring(b);
    for(let i=0;i<n;i++){const j=(i+1)%n;quad(id+'-skin-'+i,aa[i],aa[j],bb[j],bb[i],mat);tri(id+'-cap-a-'+i,a,aa[j],aa[i],mat);tri(id+'-cap-b-'+i,b,bb[i],bb[j],mat);}
  };
  const yzPlate=(id,profile,x,width,mat)=>{
    const rings=[x-width/2,x+width/2].map(xx=>profile.map(([y,z])=>[xx,y,z]));
    for(let i=0;i<profile.length;i++){const j=(i+1)%profile.length;quad(id+'-edge-'+i,rings[0][i],rings[1][i],rings[1][j],rings[0][j],mat);}
    for(let i=1;i<profile.length-1;i++){tri(id+'-left-'+i,rings[0][0],rings[0][i+1],rings[0][i],mat);tri(id+'-right-'+i,rings[1][0],rings[1][i],rings[1][i+1],mat);}
  };
  const deck=(id,profile,y0,y1,mat)=>{
    const aa=profile.map(([x,z])=>[x,y0,z]),bb=profile.map(([x,z])=>[x,y1,z]);
    for(let i=0;i<profile.length;i++){const j=(i+1)%profile.length;quad(id+'-side-'+i,aa[i],aa[j],bb[j],bb[i],mat);}
    for(let i=1;i<profile.length-1;i++){tri(id+'-bottom-'+i,aa[0],aa[i+1],aa[i],mat);tri(id+'-top-'+i,bb[0],bb[i],bb[i+1],mat);}
  };
  // Continuous belts have an open running-gear recess and separate shoes.
  const trackPath=r=>{
    const p=[];for(let i=0;i<=12;i++){const a=Math.PI/2-i*Math.PI/12;p.push([C.track.centerY+r*Math.sin(a),C.track.centerZ+C.track.endZ+r*Math.cos(a)]);}
    for(let i=0;i<=12;i++){const a=-Math.PI/2-i*Math.PI/12;p.push([C.track.centerY+r*Math.sin(a),C.track.centerZ-C.track.endZ+r*Math.cos(a)]);}return p;
  };
  const outer=trackPath(C.track.radius),inner=trackPath(C.track.radius-.085);
  for(const[side,x]of C.track.centresX.entries()){
    const w=C.track.width/2;
    for(let i=0;i<outer.length;i++){const j=(i+1)%outer.length;
      quad(`track-${side}-outer-${i}`,[x-w,...outer[i]],[x+w,...outer[i]],[x+w,...outer[j]],[x-w,...outer[j]],'rubber');
      quad(`track-${side}-inner-${i}`,[x-w,...inner[j]],[x+w,...inner[j]],[x+w,...inner[i]],[x-w,...inner[i]],'rubber');
      for(const q of[-w,w])quad(`track-${side}-edge-${q}-${i}`,[x+q,...outer[i]],[x+q,...outer[j]],[x+q,...inner[j]],[x+q,...inner[i]],'rubber');
    }
    const lengths=[0];for(let i=1;i<=outer.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...sub(outer[i%outer.length],outer[i-1])));
    const total=lengths.at(-1);
    for(let n=0;n<C.track.shoes;n++){const at=(n+.5)/C.track.shoes*total;let i=0;while(lengths[i+1]<at)i++;const a=outer[i],b=outer[(i+1)%outer.length],p=mix(a,b,(at-lengths[i])/(lengths[i+1]-lengths[i]));
      const pitch=-Math.atan2(b[0]-a[0],b[1]-a[1]);box(`track-${side}-shoe-${n}`,[x,p[0],p[1]],[.48,.045,.165],n%11===2?'mud':'steel',0,pitch);
      box(`track-${side}-grouser-${n}`,[x,p[0]+.022*Math.cos(pitch),p[1]+.022*Math.sin(pitch)],[.49,.028,.033],'rubber',0,pitch);
    }
    for(const z of[-.72,-.36,0,.36,.72]){axle(`track-${side}-roller-${z}`,[x,.285,z+.08],.145,.46,'steel',14);axle(`track-${side}-roller-cap-${z}`,[x+(side?1:-1)*.241,.285,z+.08],.087,.035,'edge',12);}
    for(const[z,role]of[[-.92,'idler'],[1.08,'sprocket']]){
      axle(`track-${side}-${role}`,[x,.32,z],.235,.45,'steel',16);
      axle(`track-${side}-${role}-hub`,[x+(side?1:-1)*.235,.32,z],.095,.06,'grease',14);
      for(let b=0;b<6;b++){const a=b/6*Math.PI*2;axle(`track-${side}-${role}-bolt-${b}`,[x+(side?1:-1)*.272,.32+.145*Math.cos(a),z+.145*Math.sin(a)],.017,.022,'edge',6);}
    }
  }
  features.trackShoes=2*C.track.shoes;features.runningGear='Two continuous open-recess belts, ten road rollers, separate idlers/sprockets and external hubs';
  box('lower-cross-frame',[0,.59,.08],[1.45,.23,2.32],'steel');
  for(const z of[-.82,.88])box('undercarriage-crossmember-'+z,[0,.58,z],[1.75,.15,.19],'steel');
  cyl('slew-bearing-base',[0,.79,.12],.60,.17,'steel',32);cyl('slew-grease-line',[0,.89,.12],.575,.035,'grease',32);cyl('slew-bearing-upper',[0,.94,.12],.56,.08,'edge',32);
  deck('upper-platform',[[-.98,-.89],[.98,-.89],[1.0,1.04],[.76,1.32],[-.78,1.32],[-1,1.03]],.93,1.08,'steel');
  deck('counterweight',[[-.93,.48],[.93,.48],[.97,1.02],[.73,1.33],[-.74,1.33],[-.97,1.01]],1.08,1.65,'paint');
  deck('counterweight-top-seam',[[-.91,.55],[.91,.55],[.93,1.01],[.71,1.30],[-.72,1.30],[-.93,1.0]],1.65,1.68,'grease');
  box('engine-compartment',[.53,1.40,.10],[.78,.66,1.22],'paint');
  box('engine-access-recess',[.938,1.39,.22],[.018,.46,.76],'grease');
  for(let i=0;i<10;i++)box('engine-louvre-'+i,[.958,1.20+i*.038,.22],[.025,.018,.67],'steel');
  beam('engine-access-handle',[.981,1.56,.03],[.981,1.56,.27],.026,'edge');
  cyl('engine-filler-neck',[.51,1.76,.43],.075,.06,'steel',12);cyl('engine-filler-cap',[.51,1.805,.43],.083,.03,'grease',12);
  tube('exhaust',[.77,1.66,.72],[.77,2.03,.72],.032,'steel',10);tube('exhaust-elbow',[.77,2.03,.72],[.77,2.06,.79],.034,'steel',10);
  // Hollow cab: framing, footwell, seat, controls and handrails are visible
  // through genuine apertures instead of being enclosed in a glass-coloured box.
  const cab={left:-.97,right:-.17,front:-.83,rear:.46,bottom:1.03,top:2.56};
  box('cab-floor',[-.57,1.075,-.14],[.88,.09,1.38],'steel');
  for(const[x,z,top]of[[cab.left,cab.front,2.43],[cab.right,cab.front,2.43],[cab.left,cab.rear,cab.top],[cab.right,cab.rear,cab.top]])beam('cab-pillar-'+x+'-'+z,[x,1.09,z],[x,top,z],.055,'steel');
  for(const x of[cab.left,cab.right])beam('cab-roof-side-'+x,[x,2.43,cab.front],[x,cab.top,cab.rear],.065,'steel');
  beam('cab-front-header',[cab.left,2.43,cab.front],[cab.right,2.43,cab.front],.065,'steel');beam('cab-rear-header',[cab.left,cab.top,cab.rear],[cab.right,cab.top,cab.rear],.065,'steel');
  quad('cab-roof',[-1.035,2.47,-.91],[-.105,2.47,-.91],[-.105,2.61,.53],[-1.035,2.61,.53],'paint');
  quad('cab-roof-under',[-1.035,2.455,-.91],[-1.035,2.595,.53],[-.105,2.595,.53],[-.105,2.455,-.91],'steel');
  box('cab-lower-front',[-.57,1.24,-.82],[.77,.29,.045],'paint');box('cab-rear-lower',[-.57,1.31,.46],[.78,.44,.045],'paint');
  box('seat-pedestal',[-.58,1.28,.03],[.38,.35,.41],'steel');box('seat-cushion',[-.58,1.49,.02],[.43,.15,.44],'seat');box('seat-back',[-.58,1.76,.20],[.43,.48,.13],'seat',0,-.10);
  beam('seat-belt',[-.78,1.59,-.13],[-.38,1.59,-.13],.028,'steel');
  for(const x of[-.84,-.29]){box('operator-console-'+x,[x,1.43,-.10],[.12,.35,.46],'steel');tube('operator-stick-'+x,[x,1.59,-.24],[x,1.77,-.27],.014,'edge',8);cyl('operator-grip-'+x,[x,1.79,-.27],.027,.07,'rubber',8);}
  for(const x of[-.70,-.45])box('operator-pedal-'+x,[x,1.14,-.57],[.14,.035,.25],'rubber',0,-.15);
  beam('windscreen-wiper',[-.87,1.49,-.857],[-.51,2.19,-.857],.018,'steel');beam('windscreen-wiper-blade',[-.60,1.98,-.862],[-.43,2.31,-.862],.025,'rubber');
  // Sparse edge reflections leave a clear view of the actual cabin volume.
  for(const x of[-.93,-.21])beam('windscreen-reflection-'+x,[x,1.53,-.859],[x,2.29,-.859],.012,'glass');
  for(const y of[.58,.86]){box('access-step-'+y,[-1.035,y,-.15],[.22,.045,.46],'steel');for(let i=0;i<4;i++)box(`step-grip-${y}-${i}`,[-1.039,y+.027,-.30+i*.10],[.20,.016,.028],'edge');}
  beam('access-grab-front',[-1.02,1.12,-.71],[-1.02,1.76,-.71],.026,'edge');beam('access-grab-rear',[-1.02,1.15,.36],[-1.02,1.85,.36],.026,'edge');
  features.cab='Open framed cab volume with seat, belt, twin controls, pedals, wiper, access steps and grab rails';
  // The boom is a shaped box section with paired kingpost cheeks. Pivots,
  // cylinders and hoses meet their actual attachment points in this held pose.
  box('kingpost-base',[.20,1.20,-.60],[.45,.35,.47],'steel');
  for(const x of[-.04,.44])yzPlate('kingpost-cheek-'+x,[[1.11,-.84],[1.48,-.83],[1.57,-.52],[1.31,-.40]],x,.075,'paint');
  const boom=[[1.30,-.70],[1.63,-.48],[2.98,-1.59],[3.10,-1.91],[2.83,-2.08],[1.44,-.91]];
  yzPlate('boom-box-section',boom,.20,.30,'paint');
  const stick=[[2.93,-1.88],[2.94,-2.09],[.80,-3.34],[.67,-3.13]];
  yzPlate('dipper-box-section',stick,.20,.24,'paint');
  const joints=[[.20,1.39,-.66],[.20,2.96,-1.94],[.20,.78,-3.24]];
  for(const[i,p]of joints.entries()){axle('attachment-pin-'+i,p,.075,.55,'steel',16);for(const side of[-1,1])axle(`attachment-pin-${i}-cap-${side}`,[p[0]+side*.29,p[1],p[2]],.089,.025,'edge',12);}
  const ram=(id,a,b,r)=>{const split=mix(a,b,.64);tube(id+'-barrel',a,split,r,'steel',12);tube(id+'-gland',mix(a,b,.60),mix(a,b,.67),r*1.18,'edge',12);tube(id+'-rod',split,b,r*.43,'chrome',12);for(const p of[a,b])axle(id+'-eye-'+p.join('_'),p,r*1.34,.20,'steel',12);};
  ram('boom-lift-ram',[.44,1.34,-.77],[.44,2.60,-1.73],.067);ram('dipper-ram',[.44,2.85,-1.28],[.44,1.34,-2.96],.057);ram('bucket-curl-ram',[-.04,1.93,-2.51],[-.04,.82,-3.02],.048);
  for(const[x,n]of[[.038,0],[.366,1]]){const path=[[x,1.35,-.55],[x,1.75,-.68],[x,2.85,-1.62],[x,3.03,-1.92],[x,2.85,-2.09],[x,1.22,-3.04]];for(let i=1;i<path.length;i++)tube(`hydraulic-hose-${n}-${i}`,path[i-1],path[i],.015,'rubber',8);}
  for(const z of[-1.14,-1.56])beam('hose-retaining-clamp-'+z,[.015,2.33-(z+1.14)*.9,z],[.385,2.33-(z+1.14)*.9,z],.027,'steel');
  features.attachment='Shaped boom and dipper sections, actual hinge pins, three telescoping hydraulic rams and twin retained hoses';
  // Curved bucket skin, side cheeks and separate tapered teeth. The mouth is
  // open; its shaded cavity cannot be mistaken for a solid charcoal cuboid.
  const profile=[[.13,-3.85],[.075,-3.68],[.13,-3.39],[.36,-3.15],[.71,-3.09],[.91,-3.23]],width=1.08;
  for(let i=1;i<profile.length;i++){const a=profile[i-1],b=profile[i];quad('bucket-outer-'+i,[.20-width/2,...a],[.20+width/2,...a],[.20+width/2,...b],[.20-width/2,...b],'steel');quad('bucket-inner-'+i,[.20-width/2,a[0]+.055,a[1]-.015],[.20-width/2,b[0]+.055,b[1]-.015],[.20+width/2,b[0]+.055,b[1]-.015],[.20+width/2,a[0]+.055,a[1]-.015],'edge');}
  for(const side of[-1,1])yzPlate('bucket-side-cheek-'+side,profile,.20+side*.55,.045,'steel');
  beam('bucket-cutting-edge',[-.37,.14,-3.84],[.77,.14,-3.84],.075,'edge');
  for(let i=0;i<5;i++){const x=-.24+i*.22;deck('bucket-tooth-'+i,[[x-.065,-3.82],[x+.065,-3.82],[x+.027,-4.04],[x-.027,-4.04]],.008,.098,'edge');}
  for(const x of[-.01,.41])beam('bucket-link-'+x,[x,.80,-3.20],[x,1.03,-3.04],.064,'steel');
  features.bucket='Open curved shell, paired side plates, cutting edge and five grounded tapered teeth';
  // Wear follows contact: lower shoe faces, bucket edge, step grips and hinge
  // rims. No arbitrary all-over rust or manufactured glow is introduced.
  if(triangles>C.maximumTriangles)throw Error('Excavator geometry exceeds its bounded budget: '+triangles);
  const report={revision:C.revision,mesh:C.mesh,triangles,features,parts,materials:Object.fromEntries(Object.entries(ids).map(([k,i])=>[k,api.materials[i].name])),references:C.references};
  m.extras={...m.extras,demolitionMachinery:{revision:C.revision,features,collision:'Tracked base plus exact exported surface collision for the attachment',parkedPose:true,references:C.references}};
  return report;
}
