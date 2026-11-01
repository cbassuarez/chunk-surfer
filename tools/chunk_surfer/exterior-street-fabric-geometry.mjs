import {EXTERIOR_STREET_FABRIC as C,STREET_PARKING_BAYS,streetFabricPoint} from '../../src/data/exterior-street-fabric.js';
import {STREET_CROSSINGS} from '../../src/data/street-crossings.js';
import {streetSurfaceAt} from './street-surface-sampler.mjs';
const material=(name,rgb,metallic=0,roughness=.9)=>({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:metallic,roughnessFactor:roughness}});
// The kerb top is the palest stone in the street and the channel the darkest:
// at one bit those two lines are what draw the road edge, as in every Leeds
// photograph of a kerb at night.
export const STREET_FABRIC_MATERIALS={
  stone:material('street granite kerb face',[.30,.305,.29],.01,.88),
  // Wet granite: the top catches every lamp, which is what draws the line.
  kerbTop:material('street granite kerb top',[.56,.56,.53],.01,.42),
  joint:material('street flag and kerb joints',[.055,.064,.063],0,.96),
  // Matched to the drawn Yorkstone around it, not to a dry flag.
  flag:material('street dropped crossing flags',[.16,.165,.16],0,.80),
  gutter:material('street channel wet silt',[.040,.048,.050],.08,.50),
  iron:material('street cast iron covers',[.075,.083,.081],.48,.74),
  lid:material('street worn iron lid',[.13,.145,.14],.48,.65),
  repair:material('street sealed service repair',[.078,.085,.082],0,.91),
  plate:material('street enamel nameplate',[.64,.65,.58],.14,.55),
  steel:material('street service box painted steel',[.105,.125,.113],.45,.76),
  black:material('street service recess',[.020,.027,.025],.1,.88),
  yellow:material('street primrose road paint',[.62,.47,.10],0,.70),
  white:material('street white road paint',[.70,.70,.64],0,.72),
  tactileBuff:material('street buff blister paving',[.50,.40,.25],0,.92),
  tactileRed:material('street red blister paving',[.34,.095,.065],0,.92),
};
const bounds=points=>({min:[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...points.map(p=>p[k])))});
const clamp01=v=>Math.max(0,Math.min(1,v));
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const crossV=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// How far a crossing lowers a kerb at `along`: flush across the three dropped
// glyphs, then a one-metre flare back up (Inclusive Mobility §4.11).
function crossingsOn(run){
  return STREET_CROSSINGS.flatMap(c=>c.kerbs.filter(k=>Math.abs(k.line-run.line)<1e-9&&k.side===-run.toRoad
    &&(c.walk==='z')===(run.dir==='x')).map(k=>({crossing:c,kerb:k})));
}
const dropAt=(list,along)=>Math.max(0,...list.map(({crossing})=>1-clamp01(Math.abs(along-crossing.at)-1.5)));

// Every glyph edge where pavement steps down to carriageway, merged into
// straight runs. A run's `toRoad` is the sign of the step from its line into
// the road. A flush edge is a kerb only where a crossing dropped it; anywhere
// else it is where one floor's paving meets another's, and is reported.
export function streetKerbRuns(scan=C.scan,sample=streetSurfaceAt,flush=[]){
  const edges=new Map();
  const push=(dir,line,toRoad,from,to,top)=>{const key=`${dir}|${line}|${toRoad}`;if(!edges.has(key))edges.set(key,[]);edges.get(key).push({from,to,top});};
  for(let z=scan.z0;z<=scan.z1;z++)for(let x=scan.x0;x<=scan.x1;x++){
    const a=sample(x,z);if(!a)continue;
    for(const[dx,dz]of[[1,0],[0,1]]){
      const b=sample(x+dx,z+dz);if(!b)continue;
      const pave=a.kind==='pave'&&b.kind==='road'?a:a.kind==='road'&&b.kind==='pave'?b:null;
      if(!pave)continue;
      const toRoad=pave===a?1:-1,road=pave===a?b:a;
      const edge=dx?{dir:'z',line:x+.75,from:z-.25,to:z+.75}:{dir:'x',line:z+.75,from:x-.25,to:x+.75};
      if(pave.drawn<=road.drawn+.01&&dropAt(crossingsOn({...edge,toRoad}),(edge.from+edge.to)/2)<.5){flush.push({...edge,toRoad});continue;}
      push(edge.dir,edge.line,toRoad,edge.from,edge.to,pave.drawn);
    }
  }
  const runs=[];
  for(const[key,list]of edges){
    const[dir,line,toRoad]=key.split('|');list.sort((p,q)=>p.from-q.from);
    let run=null;
    for(const e of list){
      if(run&&Math.abs(run.to-e.from)<1e-9){run.to=e.to;run.segments.push(e);continue;}
      run={dir,line:Number(line),toRoad:Number(toRoad),from:e.from,to:e.to,segments:[e]};runs.push(run);
    }
  }
  return runs.sort((p,q)=>p.dir.localeCompare(q.dir)||p.line-q.line||p.from-q.from);
}

export function buildExteriorStreetFabric(api){
  for(const k of['mesh','addBox','addQuad','addBeam','addCylinder'])if(typeof api[k]!=='function')throw Error(`Street fabric needs ${k}`);
  const ids={};for(const[k,m]of Object.entries(STREET_FABRIC_MATERIALS)){let i=api.materials.findIndex(x=>x.name===m.name);if(i<0){i=api.materials.length;api.materials.push(structuredClone(m));}ids[k]=i;}
  const meshes=Object.fromEntries(C.meshNames.map(name=>[name,api.mesh(name)]));
  const R=C.drawnSection.roadFloor,T=C.drawnSection.footwayFloor,S=C.section;
  const report={revision:C.revision,parts:[],placements:[],signs:C.nameplates,triangles:0,kerbs:{runs:0,fullLength:0,droppedLength:0,unexplainedDrops:[]},
    drawnSection:{...C.drawnSection},drawnUpstand:T-R,crossings:[]};
  function context(name,world=true){
    const m=meshes[name],to=p=>world?[p[0]-C.origin.x,p[1],p[2]-C.origin.z]:p;
    const remember=(id,kind,points,triangles,extra={})=>{report.parts.push({id,mesh:name,kind,bounds:bounds(points),world,...extra});report.triangles+=triangles;};
    // Order the four corners so the face looks along `hint`. A kerb face at a
    // flare narrows to a triangle; start from a corner whose triangle is real.
    const quad=(id,a,b,c,d,key,extra,hint=[0,1,0])=>{
      const ring=[a,b,c,d],n=[0,0,0];
      for(let i=0;i<4;i++){const p=ring[i],q=ring[(i+1)%4];n[0]+=(p[1]-q[1])*(p[2]+q[2]);n[1]+=(p[2]-q[2])*(p[0]+q[0]);n[2]+=(p[0]-q[0])*(p[1]+q[1]);}
      let pts=n[0]*hint[0]+n[1]*hint[1]+n[2]*hint[2]<0?[d,c,b,a]:ring;
      for(let k=0;k<4;k++){const area=crossV(sub(pts[1],pts[0]),sub(pts[2],pts[0]));if(Math.hypot(...area)>1e-10)break;pts=[...pts.slice(1),pts[0]];}
      api.addQuad(m,...pts.map(to),ids[key]);remember(id,'quad',pts,2,extra);
    };
    const box=(id,c,s,key,extra)=>{api.addBox(m,to(c),s,ids[key]);const p=[];for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])p.push([c[0]+x*s[0]/2,c[1]+y*s[1]/2,c[2]+z*s[2]/2]);remember(id,'box',p,12,extra);};
    const beam=(id,a,b,w,key)=>{api.addBeam(m,to(a),to(b),w,ids[key]);remember(id,'beam',[a.map(v=>v-w),b.map(v=>v+w)],12);};
    const cylinder=(id,c,r,h,key,sides=8)=>{api.addCylinder(m,to(c),r,h,ids[key],sides);remember(id,'cylinder',[[c[0]-r,c[1]-h/2,c[2]-r],[c[0]+r,c[1]+h/2,c[2]+r]],sides*4);};
    return{quad,box,beam,cylinder};
  }
  const kerb=context('exterior_street_kerbs'),cross=context('exterior_street_crossings'),paint=context('exterior_street_markings'),service=context('exterior_street_services'),plates=context('exterior_street_nameplates');
  // A point `c` metres from a kerb line, positive into the road.
  const at=(run,along,c,y)=>run.dir==='x'?[along,y,run.line+run.toRoad*c]:[run.line+run.toRoad*c,y,along];
  const roadward=run=>run.dir==='x'?[0,0,run.toRoad]:[run.toRoad,0,0];
  const strip=(ctx,id,run,a,b,c0,c1,y,key,extra)=>ctx.quad(id,at(run,a,c0,y),at(run,b,c0,y),at(run,b,c1,y),at(run,a,c1,y),key,extra);

  const flushEdges=[],runs=streetKerbRuns(C.scan,streetSurfaceAt,flushEdges);
  report.kerbs.runs=runs.length;report.kerbs.flushEdgesWithoutKerb=flushEdges;
  for(const run of runs){
    const id=`${run.dir}:${run.line}:${run.toRoad}:${run.from}`,drops=crossingsOn(run);
    const topAt=along=>T-(T-R)*dropAt(drops,along);
    // Every drawn drop must belong to a crossing; anything else is a hole in the plan.
    for(const s of run.segments)if(s.top<T-.05&&dropAt(drops,(s.from+s.to)/2)<.5)report.kerbs.unexplainedDrops.push({id,from:s.from,to:s.to});
    // Stone breaks fall on the flare ends so each stone's top is one straight slope.
    const breaks=[run.from,run.to,...drops.flatMap(({crossing:c})=>[c.at-2.5,c.at-1.5,c.at+1.5,c.at+2.5])].filter(v=>v>=run.from&&v<=run.to).sort((p,q)=>p-q);
    const lift=run.dir==='x'?.001:.0013;
    for(let i=0;i+1<breaks.length;i++){
      const from=breaks[i],to=breaks[i+1];if(to-from<1e-6)continue;
      const count=Math.ceil((to-from)/S.stoneLength-1e-9),length=(to-from)/count;
      for(let j=0;j<count;j++){
        const a=from+j*length,b=a+length,ha=topAt(a),hb=topAt(b),sid=`${id}:stone:${a.toFixed(3)}`;
        const raised=Math.max(ha,hb)>R+.01;
        if(raised){
          kerb.quad(sid+':face',at(run,a,S.kerbProud,R),at(run,b,S.kerbProud,R),at(run,b,S.kerbProud,Math.max(R,hb-.012)),at(run,a,S.kerbProud,Math.max(R,ha-.012)),'stone',{role:'kerb-face'},roadward(run));
          kerb.quad(sid+':arris',at(run,a,S.kerbProud,Math.max(R,ha-.012)),at(run,b,S.kerbProud,Math.max(R,hb-.012)),at(run,b,-.010,hb+lift),at(run,a,-.010,ha+lift),'kerbTop',{role:'kerb-arris'},[roadward(run)[0]*.7,.7,roadward(run)[2]*.7]);
        }
        kerb.quad(sid+':top',at(run,a,raised?-.010:S.kerbProud,ha+lift),at(run,b,raised?-.010:S.kerbProud,hb+lift),at(run,b,-S.kerbTop,hb+lift),at(run,a,-S.kerbTop,ha+lift),'kerbTop',{role:'kerb-top'});
        if(j+1<count||i+2<breaks.length)strip(kerb,sid+':joint',run,b-.006,b+.006,raised?-.010:S.kerbProud,-S.kerbTop,hb+lift+.0005,'joint',{role:'kerb-joint'});
        report.kerbs[raised?'fullLength':'droppedLength']+=length;
      }
    }
    // The channel runs unbroken past crossings, as it does in the street.
    strip(service,id+':channel',run,run.from,run.to,S.kerbProud,S.channelWidth,R+.001,'gutter',{role:'channel'});
    // Gullies sit in the channel against the kerb, clear of crossings.
    if(run.to-run.from>12)for(let along=run.from+C.gullies.first;along<run.to-2;along+=C.gullies.pitch){
      if(drops.some(({crossing})=>Math.abs(along-crossing.at)<C.gullies.clearOfCrossing))continue;
      const gid=`${id}:gully:${along}`,g=C.gullies,c0=S.kerbProud,c1=c0+g.width,y=R+.0012;
      strip(service,gid+':recess',run,along-g.length/2,along+g.length/2,c0,c1,y,'black',{role:'gully'});
      for(const c of[c0+.017,c1-.017])strip(service,gid+':frame:'+c.toFixed(3),run,along-g.length/2,along+g.length/2,c-.017,c+.017,y+.0004,'iron',{role:'gully'});
      for(let k=-3;k<=3;k++)strip(service,gid+':bar:'+k,run,along+k*.09-.0275,along+k*.09+.0275,c0+.02,c1-.02,y+.0008,'lid',{role:'gully'});
      report.placements.push({id:gid,kind:'drainage-gully',run:id,along,drawnTop:y+.0008});
    }
    paintRun(run,id);
  }

  function paintRun(run,id){
    const M=C.markings;
    if(run.to-run.from<5.5)return;// junction corners and the square's dead ends
    let spans=[[run.from,run.to]];
    const cut=(lo,hi)=>{spans=spans.flatMap(([x0,x1])=>x1<=lo||x0>=hi?[[x0,x1]]:[[x0,Math.min(x1,lo)],[Math.max(x0,hi),x1]].filter(([x,y])=>y-x>.05));};
    for(const bay of STREET_PARKING_BAYS){
      if(Math.abs(bay.line-run.line)>1e-9||bay.toRoad!==run.toRoad)continue;
      const along=run.dir==='x'?bay.x:bay.z,a=along-M.baySpan/2,b=along+M.baySpan/2;
      if(b<run.from||a>run.to)continue;
      cut(a,b);
      const bid=`${id}:bay:${bay.id}`;
      for(let s=a;s<b-1e-6;s+=M.bayDash[0]+M.bayDash[1])strip(paint,`${bid}:dash:${s.toFixed(2)}`,run,s,Math.min(b,s+M.bayDash[0]),M.bayWidth-M.paintWidth/2,M.bayWidth+M.paintWidth/2,R+.002,'white',{role:'bay'});
      for(const e of[a,b])strip(paint,`${bid}:end:${e}`,run,e-M.paintWidth/2,e+M.paintWidth/2,S.channelWidth,M.bayWidth,R+.002,'white',{role:'bay'});
      report.placements.push({id:bid,kind:'parking-bay',run:id,from:a,to:b});
    }
    const bus=C.busStopClearway;
    if(run.dir==='z'&&Math.abs(run.line-bus.line)<1e-9&&run.toRoad===bus.toRoad&&bus.z1>run.from&&bus.z0<run.to){
      cut(bus.z0,bus.z1);
      const w=M.paintWidth,inner=S.channelWidth,outer=bus.width,taper=outer-inner;
      strip(paint,`${id}:bus-stop:outer`,run,bus.z0+taper,bus.z1-taper,outer-w/2,outer+w/2,R+.002,'yellow',{role:'bus-stop'});
      for(const[e,dir]of[[bus.z0,1],[bus.z1,-1]])paint.quad(`${id}:bus-stop:taper:${e}`,at(run,e,inner,R+.002),at(run,e+dir*w*1.4,inner,R+.002),at(run,e+dir*(taper+w*.7),outer+w/2,R+.002),at(run,e+dir*(taper-w*.7),outer-w/2,R+.002),'yellow',{role:'bus-stop'});
      report.placements.push({id:`${id}:bus-stop`,kind:'bus-stop-clearway',from:bus.z0,to:bus.z1});
    }
    const zz=C.zigzagZone;
    if(run.dir==='x'&&zz.line.some(l=>Math.abs(l-run.line)<1e-9))cut(zz.x0,zz.x1);
    for(const[a,b]of spans)for(const c of M.yellowOffsets)strip(paint,`${id}:yellow:${a}:${c}`,run,a,b,c,c+M.yellowWidth,R+.002,'yellow',{role:'double-yellow'});
  }

  // Crossings: the flags ease down to the dropped kerb, with blister paving
  // across the dropped width (red at the signal, buff elsewhere) and, at the
  // signal, a 1.2 m stem back to the building line.
  for(const c of STREET_CROSSINGS)for(const k of c.kerbs){
    const run={dir:c.walk==='z'?'x':'z',line:k.line,toRoad:-k.side},id=`${c.id}:${k.side}`;
    const H=(a,d)=>R+(T-R)*Math.max(clamp01((d-1.1)/.9),clamp01(Math.abs(a)-1.5));
    const P=(a,d,lift=0)=>at(run,c.at+a,-d,H(a,d)+lift);
    const aKnots=[-2.5,-2,-1.5,-1,-.5,0,.5,1,1.5,2,2.5],dKnots=[S.kerbTop,.7,1.1,1.4,1.7,2];
    for(let i=0;i+1<aKnots.length;i++)for(let j=0;j+1<dKnots.length;j++){
      const[a0,a1,d0,d1]=[aKnots[i],aKnots[i+1],dKnots[j],dKnots[j+1]];
      if(Math.abs(a0+a1)/2<1.4&&d1<=1.1+1e-9)continue;// under the blister paving
      cross.quad(`${id}:ramp:${i}:${j}`,P(a0,d0,.0008),P(a1,d0,.0008),P(a1,d1,.0008),P(a0,d1,.0008),'flag',{role:'crossing-ramp'});
    }
    const tile=.4,key=c.kind==='controlled'?'tactileRed':'tactileBuff';
    const tiles=[];
    for(let i=0;i<7;i++)for(let j=0;j<2;j++)tiles.push([-1.4+i*tile,S.kerbTop+j*tile]);
    // Leeds lays the stem on the side of the push button.
    if(c.kind==='controlled'){const a0=k.side<0?-1.6:0;for(let i=0;i<3;i++)for(let d=1.1;d<3.6;d+=tile)tiles.push([a0+i*tile,d]);}
    for(const[a,d]of tiles){
      cross.quad(`${id}:tactile:${a.toFixed(2)}:${d.toFixed(2)}`,P(a,d,.003),P(a+tile,d,.003),P(a+tile,d+tile,.003),P(a,d+tile,.003),key,{role:'tactile',kind:c.kind});
      for(const[x0,x1,y0,y1]of[[a,a+tile,d,d+.012],[a,a+.012,d,d+tile]])cross.quad(`${id}:tactile-joint:${a.toFixed(2)}:${d.toFixed(2)}:${x1-x0>.1?'a':'d'}`,P(x0,y0,.0035),P(x1,y0,.0035),P(x1,y1,.0035),P(x0,y1,.0035),'joint',{role:'tactile-joint'});
    }
    report.crossings.push({id:c.id,kind:c.kind,kerb:k.line,side:k.side,tiles:tiles.length,stem:c.kind==='controlled'});
  }

  for(const cover of C.covers){
    const street=C.streets.find(s=>s.id===cover.street),c=cover.side*C.coverCross,a=cover.along-cover.length/2,b=cover.along+cover.length/2;
    const rect=(rid,a0,b0,width,y,key)=>{const p=(u,v)=>streetFabricPoint(street,u,c+v,y);service.quad(rid,p(a0,-width/2),p(b0,-width/2),p(b0,width/2),p(a0,width/2),key,{role:'cover'});};
    rect(cover.id+':repair',a-.20,b+.20,cover.width+.24,T+.0005,'repair');
    rect(cover.id+':frame',a-.045,b+.045,cover.width+.09,T+.001,'iron');
    rect(cover.id+':lid',a,b,cover.width,T+.0015,'lid');
    // Broad shallow ribs and two lifting keys are geometry on a flush lid.
    for(let k=0;k<5;k++){const u=a+.11+k*(cover.length-.22)/4;rect(cover.id+':rib:'+k,u-.012,u+.012,cover.width-.10,T+.002,'iron');}
    for(const offset of[-.25,.25])rect(cover.id+':key:'+offset,cover.along+offset-.05,cover.along+offset+.05,.035,T+.0025,'black');
    report.placements.push({id:cover.id,kind:'flush-utility-cover',use:cover.use,center:streetFabricPoint(street,cover.along,c),drawnTop:T+.0025});
  }
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
