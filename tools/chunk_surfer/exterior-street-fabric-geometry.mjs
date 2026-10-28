import {EXTERIOR_STREET_FABRIC as C,streetFabricPoint,streetFabricInPilot} from '../../src/data/exterior-street-fabric.js';
const material=(name,rgb,metallic=0,roughness=.9)=>({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:metallic,roughnessFactor:roughness}});
export const STREET_FABRIC_MATERIALS={
  stone:material('street weathered stone kerb',[.225,.233,.218],.01,.91),
  bevel:material('street stone worn arris',[.26,.27,.25],.01,.84),
  joint:material('street flag and kerb joints',[.055,.064,.063],0,.96),
  gutter:material('street gutter wet silt',[.052,.063,.064],.08,.62),
  iron:material('street cast iron covers',[.075,.083,.081],.48,.74),
  lid:material('street worn iron lid',[.13,.145,.14],.48,.65),
  repair:material('street sealed service repair',[.078,.085,.082],0,.91),
  plate:material('street enamel nameplate',[.64,.65,.58],.14,.55),
  steel:material('street service box painted steel',[.105,.125,.113],.45,.76),
  black:material('street service recess',[.020,.027,.025],.1,.88),
};
const bounds=points=>({min:[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...points.map(p=>p[k])))});
const overlaps=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.z0<b.z1&&a.z1>b.z0;
function shapeFootprint(street,a,b,cross,width){const p=streetFabricPoint(street,(a+b)/2,cross),s=street.axis==='x'?[b-a,width]:[width,b-a];return{x0:p[0]-s[0]/2,x1:p[0]+s[0]/2,z0:p[2]-s[1]/2,z1:p[2]+s[1]/2};}
function allowedSpans(street,a,b,cross,width){
  let spans=[[a,b]];
  const cut=(lo,hi)=>{spans=spans.flatMap(([x0,x1])=>x1<=lo||x0>=hi?[[x0,x1]]:[[x0,Math.min(x1,lo)],[Math.max(x0,hi),x1]].filter(([x,y])=>y-x>1e-7));};
  if(street.axis==='x'&&overlaps(shapeFootprint(street,a,b,cross,width),C.protectedPilot))cut(C.protectedPilot.x0,C.protectedPilot.x1);
  const bus=C.busStopFootway;
  if(street.id==='west'&&cross<0&&Math.abs(cross)>=4.8&&overlaps(shapeFootprint(street,a,b,cross,width),bus))cut(bus.z0,bus.z1);
  return spans;
}
export function buildExteriorStreetFabric(api){
  for(const k of['mesh','addBox','addQuad','addBeam','addCylinder'])if(typeof api[k]!=='function')throw Error(`Street fabric needs ${k}`);
  const ids={};for(const[k,m]of Object.entries(STREET_FABRIC_MATERIALS)){let i=api.materials.findIndex(x=>x.name===m.name);if(i<0){i=api.materials.length;api.materials.push(structuredClone(m));}ids[k]=i;}
  const meshes=Object.fromEntries(C.meshNames.map(name=>[name,api.mesh(name)])),report={revision:C.revision,parts:[],placements:[],signs:C.nameplates,triangles:0,protectedPilot:{...C.protectedPilot},seams:{northPilot:{x:[C.protectedPilot.x0,C.protectedPilot.x1],kerbZ:[-12.5,-2.5],authoredFootwayTop:.12,authoredSettTop:.025,drawnFootwayTop:C.drawnSection.footwayFloor,drawnSettTop:C.drawnSection.settFloor,maximumConstructionGap:C.kerbJointGap/2,pilotAssetUnchanged:true},busStop:{preservedFootway:C.busStopFootway,ends:'existing95mm collision transitions retained, not certified accessible'}},clearFootways:true};
  // The ray-marched grid draws 8-bit heights. Keep authored/collision levels
  // separate: an exact .12m model surface would be hidden beneath its .15686m
  // drawn footway. The joint/lid micro-lifts follow that visible surface.
  const drawHeight=y=>y>=C.section.footwayFloor?C.drawnSection.footwayFloor+y-C.section.footwayFloor:y<=C.section.settFloor?C.drawnSection.settFloor+y-C.section.settFloor:C.drawnSection.settFloor+(y-C.section.settFloor)/(C.section.footwayFloor-C.section.settFloor)*(C.drawnSection.footwayFloor-C.drawnSection.settFloor);
  function context(name,world=true){
    const m=meshes[name],ground=world&&['exterior_street_kerbs','exterior_street_paving_joints','exterior_street_services'].includes(name),visual=p=>ground?[p[0],drawHeight(p[1]),p[2]]:p,to=p=>{const q=visual(p);return world?[q[0]-C.origin.x,q[1],q[2]-C.origin.z]:q;};
    const remember=(id,kind,points,triangles,extra={})=>{report.parts.push({id,mesh:name,kind,bounds:bounds(points.map(visual)),authoredBounds:bounds(points),world,...extra});report.triangles+=triangles;};
    const quad=(id,a,b,c,d,key,extra)=>{api.addQuad(m,...[a,b,c,d].map(to),ids[key]);remember(id,'quad',[a,b,c,d],2,extra);};
    const box=(id,c,s,key,extra)=>{const size=ground?[s[0],drawHeight(c[1]+s[1]/2)-drawHeight(c[1]-s[1]/2),s[2]]:s;api.addBox(m,to(c),size,ids[key]);const p=[];for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])p.push([c[0]+x*s[0]/2,c[1]+y*s[1]/2,c[2]+z*s[2]/2]);remember(id,'box',p,12,extra);};
    const beam=(id,a,b,w,key)=>{api.addBeam(m,to(a),to(b),w,ids[key]);remember(id,'beam',[a.map(v=>v-w),b.map(v=>v+w)],12);};
    const cylinder=(id,c,r,h,key,sides=8)=>{api.addCylinder(m,to(c),r,h,ids[key],sides);remember(id,'cylinder',[[c[0]-r,c[1]-h/2,c[2]-r],[c[0]+r,c[1]+h/2,c[2]+r]],sides*4);};
    return{quad,box,beam,cylinder};
  }
  const kerb=context('exterior_street_kerbs'),joints=context('exterior_street_paving_joints'),service=context('exterior_street_services'),plates=context('exterior_street_nameplates');
  const rect=(ctx,id,street,a,b,cross,width,y,key,extra)=>{const c0=cross-width/2,c1=cross+width/2,p=[streetFabricPoint(street,a,c0,y),streetFabricPoint(street,b,c0,y),streetFabricPoint(street,b,c1,y),streetFabricPoint(street,a,c1,y)];if(street.axis==='x')p.reverse();ctx.quad(id,...p,key,extra);};
  for(const street of C.streets)for(const side of[-1,1]){
    const isInner=(street.id==='north'||street.id==='west')?side===1:side===-1;
    const curb=side*5,curbFrom=street.from-(isInner?2:0),curbTo=street.to+(isInner?2:0);
    for(const[from,to]of allowedSpans(street,curbFrom,curbTo,curb,.26)){
      const count=Math.ceil((to-from)/C.kerbJointPitch),length=(to-from)/count;
      for(let i=0;i<count;i++){
        const a=from+i*length+C.kerbJointGap/2,b=from+(i+1)*length-C.kerbJointGap/2,at=(v,h)=>streetFabricPoint(street,a,curb+side*v,h),bt=(v,h)=>streetFabricPoint(street,b,curb+side*v,h),id=`${street.id}:${side}:kerb:${from}:${i}`;
        // Cross-section is wholly at or below the existing footway floor. The
        // 95mm exposed face meets the existing25mm sett margin, not a new step.
        const kquad=(suffix,p,key)=>{if((street.axis==='x'&&side===1)||(street.axis==='z'&&side===-1))p.reverse();kerb.quad(id+suffix,...p,key,{role:'kerb'});};
        kquad(':face',[at(-.025,.025),bt(-.025,.025),bt(-.025,.105),at(-.025,.105)],'stone');
        kquad(':bevel',[at(-.025,.105),bt(-.025,.105),bt(.020,.12),at(.020,.12)],'bevel');
        kquad(':top',[at(.020,.12),bt(.020,.12),bt(.125,.12),at(.125,.12)],'stone');
        for(const [x,other]of[[a,b],[b,a]]){const p=(v,h)=>streetFabricPoint(street,x,curb+side*v,h),points=[p(-.025,.025),p(.125,.025),p(.125,.12),p(-.025,.105)];if(x>other)points.reverse();kerb.quad(id+':joint:'+x,...points,'joint',{role:'kerb'});}
        rect(service,id+':gutter',street,a,b,curb-side*.18,.28,.026,'gutter',{role:'gutter'});
      }
    }
    // Paving joints carry the inherited flagging. These are shallow dark joint
    // reveals on the actual120mm surface, never a second paved floor plane.
    const center=side*6;
    for(const[from,to]of allowedSpans(street,street.from,street.to,center,2)){
      for(const across of[-.40,.20,.80])rect(joints,`${street.id}:${side}:longitudinal:${across}`,street,from,to,center+across,.014,.121,'joint',{role:'flag-joint'});
      let index=0;for(let a=from+.45;a<to;a+=C.flagAlong,index++){
        const cross0=side*5.14,cross1=side*6.99;
        rect(joints,`${street.id}:${side}:flag:${a}`,street,a-.007,a+.007,(cross0+cross1)/2,Math.abs(cross1-cross0),.121,'joint',{role:'flag-joint'});
      }
    }
    for(let along=street.from+10;along<street.to-3;along+=C.gullies.pitch){
      const cross=curb-side*.28,box=shapeFootprint(street,along-C.gullies.length/2,along+C.gullies.length/2,cross,C.gullies.width);
      if(overlaps(box,C.protectedPilot)||overlaps(box,C.busStopFootway))continue;
      const id=`${street.id}:${side}:gully:${along}`;
      rect(service,id+':recess',street,along-.34,along+.34,cross,.37,.027,'black',{role:'gully'});
      for(const edge of[-1,1])rect(service,id+':frame:'+edge,street,along-.34,along+.34,cross+edge*.17,.035,.031,'iron',{role:'gully'});
      for(let k=-3;k<=3;k++)rect(service,id+':bar:'+k,street,along+k*.09-.0275,along+k*.09+.0275,cross,.33,.032,'lid',{role:'gully'});
      report.placements.push({id,kind:'drainage-gully',footprint:box,authoredTop:.032,drawnTop:drawHeight(.032),drains:'sett margin beside footway kerb'});
    }
  }
  for(const cover of C.covers){
    const street=C.streets.find(s=>s.id===cover.street),cross=cover.side*6.32,a=cover.along-cover.length/2,b=cover.along+cover.length/2;
    rect(service,cover.id+':repair',street,a-.20,b+.20,cross,cover.width+.24,.1205,'repair',{role:'cover'});
    rect(service,cover.id+':frame',street,a-.045,b+.045,cross,cover.width+.09,.121,'iron',{role:'cover'});
    rect(service,cover.id+':lid',street,a,b,cross,cover.width,.1215,'lid',{role:'cover'});
    // Broad shallow ribs and two lifting keys are geometry on a flush lid.
    for(let k=0;k<5;k++)rect(service,cover.id+':rib:'+k,street,a+.11+k*(cover.length-.22)/4-.012,a+.11+k*(cover.length-.22)/4+.012,cross,cover.width-.10,.122,'iron',{role:'cover'});
    for(const offset of[-.25,.25])rect(service,cover.id+':key:'+offset,street,cover.along+offset-.05,cover.along+offset+.05,cross,.035,.1225,'black',{role:'cover'});
    report.placements.push({id:cover.id,kind:'flush-utility-cover',use:cover.use,footprint:shapeFootprint(street,a-.20,b+.20,cross,cover.width+.24),authoredTop:.1225,drawnTop:drawHeight(.1225)});
  }
  // A short stepped kerb continuation follows the actual widened bus footway.
  const bus=C.busStopFootway,busCenter=(bus.z0+bus.z1)/2;
  kerb.box('bus-stop-existing-footway-edge',[bus.x1-.055,.0725,busCenter],[.11,.095,bus.z1-bus.z0],'stone',{role:'bus-stop-kerb'});
  for(const sign of C.nameplates){
    const size=sign.normal[0]?[.028,sign.heightM,sign.widthM]:[sign.widthM,sign.heightM,.028],center=sign.center.map((v,k)=>v-sign.normal[k]*.016);
    plates.box(sign.id+':enamel-carrier',center,size,'plate',{role:'wall-nameplate'});
    report.placements.push({id:sign.id,kind:'wall-nameplate',center:sign.center,width:sign.widthM,height:sign.heightM,support:'existing masonry beside the named existing court mouth'});
  }
  // Reusable, physically wall-supported services for existing industrial
  // frontage instances only. Root derives each instance from its actual row.
  const panel=context('exterior_street_wall_services',false);
  panel.box('wall-service-mount',[.026,1.25,0],[.052,.90,.64],'black');
  panel.box('wall-service-cabinet',[.15,1.25,0],[.24,.80,.58],'steel');
  panel.box('wall-service-door',[.278,1.25,0],[.016,.73,.51],'iron');
  panel.box('wall-service-hinge-top',[.293,1.49,-.22],[.025,.10,.03],'steel');
  panel.box('wall-service-hinge-bottom',[.293,1.01,-.22],[.025,.10,.03],'steel');
  panel.box('wall-service-key',[.295,1.25,.17],[.012,.038,.05],'black');
  panel.cylinder('wall-service-riser',[.075,2.875,0],.025,2.45,'steel',8);
  for(const y of[1.8,2.7,3.6])panel.box('wall-service-collar-'+y,[.055,y,0],[.10,.045,.10],'iron');
  panel.box('wall-service-termination',[.075,4.04,0],[.15,.12,.15],'steel');
  return report;
}
