// Original monumental instrument anatomy, not a historical replica. The
// Vaudry1681 catalogue informs the thin bent case, walnut bridges, two manuals
// and rose; the Met's altered Couchet informs the legible pale/dark keyboards.
// https://www.vam.ac.uk/__data/assets/pdf_file/0009/178497/Catalogue_Keyboard_Instruments.pdf
// https://www.metmuseum.org/art/collection/search/503614
// All vertices share the listener's meaningful local origin: Xright,Yup,Zback.
import {SOURCE_CONTINUATION,CONTINUATION_CATCH_STAGES,continuationRadialPoint} from '../data/source-continuation.js';
import {SOURCE_REST_SEATS} from '../game/source-rest-seat.js';
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const TAU=Math.PI*2,hingeX=-2.8,hingeY=1.68,lidAngle=63*Math.PI/180;
const rawOutline=[[-2.8,1.35],[-2.8,-7.4],[-1.5,-7.4],[.4,-6.35],[2.25,-3.25],[2.95,-.7],[3,1.35]];
export const SOURCE_REST_HARPSICHORD=freeze({
  frame:'seat-local: Xright,Yup,Zback',outline:rawOutline.map(p=>[...p]),lidAngle,
  lidHinge:[hingeX,hingeY,0],rose:{centre:[-1.45,.065,-3.2],radius:.42,opening:false},
  keyboard:{midiStart:36,midiEnd:96,naturals:36,accidentals:25,manuals:2,minX:-2.72,maxX:-.56,
    manualsBounds:[{min:[-2.72,.89,1.11],max:[-.56,1.055,1.50]},{min:[-2.72,1.09,.74],max:[-.56,1.255,1.13]}]},
  route:{minX:-.50,maxX:.50,minZ:-.40,maxZ:1.85,headClearance:1.95},
  sideBreak:{minZ:-5.7,maxZ:-.5,minX:0,thresholdTop:.055,reason:'existing Catch entry and counterweight passage'},
  strings:{choirs:2,stringsPerChoir:61,minimumWidth:.014,maximumWidth:.018,minimumY:2.04,maximumY:2.25},
  architecture:{registerBays:3,pitchCourses:122,principalCourses:30,minimumCourseWidth:.022,maximumCourseWidth:.24,
    upperHeight:18.2,maximumCullRadius:32,anchorOwner:'actual Catch stage outer supports',additionalInstances:0},
  maxParts:20,triangleBudget:16000,additionalLights:0,supportFloor:false,
});
const descriptions=[
  ['case','case',null,false],['lining','lining',null,false],['beading','beading',null,false],['bridges','bridge','bridge',false],
  ...['acoustic','electronic'].flatMap(choir=>['low','mid','high'].map(register=>['strings-'+choir+'-'+register,'strings',choir+'-strings',false,register])),
  ['wrestplank','wrestplank',null,false],['pins-jacks','pins',null,false],['manual-bed','manual-bed',null,false],
  ['naturals','naturals',null,false],['accidentals','accidentals',null,false],
  ['lid-rear','lid','lid',true],['lid-middle','lid','lid',true],['lid-tail','lid','lid',true],
  ['lid-prop','lid-prop',null,false],['rose','rose',null,false],
];
export const SOURCE_REST_HARPSICHORD_PARTS=freeze(descriptions.map(([name,casePart,reactive,wear,register])=>({
  id:'harpsichord-'+name,mesh:'rest-harpsichord-'+name,casePart,reactive,wear,
  ...(register?{register}:{}),...(casePart==='lid'?{pivot:[hingeX,hingeY,name==='lid-rear'?.10:name==='lid-middle'?-3.15:-5.95],assembly:'spine-hinged-lid'}
    :casePart==='strings'?{pivot:[0,2.15,-.72]}:casePart==='bridge'?{pivot:[0,1.9,-3.4]}:{}),
})));

const box=(x0,x1,y0,y1,z0,z1)=>({p:[x0,y0,z0,x1,y0,z0,x1,y0,z1,x0,y0,z1,x0,y1,z0,x1,y1,z0,x1,y1,z1,x0,y1,z1],
  i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]});
const join=pieces=>{const p=[],i=[];for(const piece of pieces){const start=p.length/3;p.push(...piece.p);i.push(...piece.i.map(n=>n+start));}return{p,i};};
const transformed=(g,fn)=>({p:g.p.flatMap((_,k)=>k%3?[]:fn(g.p.slice(k,k+3))),i:[...g.i]});
const smooth=(a,b,value)=>{const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);};
// The hinge spine stays tall and supported. The distant cheek falls away from
// the eye into an actual opening, so the grand string bays own the view.
const openCheek=point=>[point[0],point[1]-Math.max(0,point[1]-.10)/1.55*.70
  *smooth(1.8,6.5,-point[2])*smooth(-2.65,-2.35,point[0]),point[2]];
const area=polygon=>polygon.reduce((n,a,k)=>{const b=polygon[(k+1)%polygon.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function triangulate(polygon){
  const ids=polygon.map((_,k)=>k),out=[],ccw=area(polygon)>0;if(!ccw)ids.reverse();
  const within=(p,a,b,c)=>cross(a,b,p)>=-1e-10&&cross(b,c,p)>=-1e-10&&cross(c,a,p)>=-1e-10;
  while(ids.length>3){
    let found=false;
    for(let k=0;k<ids.length;k++){
      const a=ids[(k+ids.length-1)%ids.length],b=ids[k],c=ids[(k+1)%ids.length];
      if(cross(polygon[a],polygon[b],polygon[c])<1e-10||ids.some(j=>j!==a&&j!==b&&j!==c&&within(polygon[j],polygon[a],polygon[b],polygon[c])))continue;
      out.push(a,b,c);ids.splice(k,1);found=true;break;
    }
    if(!found)throw Error('Harpsichord polygon cannot be triangulated without a self-intersection.');
  }
  out.push(...ids);return out;
}
function slab(outline,y0,y1){
  const polygon=area(outline)>0?outline:[...outline].reverse(),n=polygon.length,p=[],i=[],tri=triangulate(polygon);
  for(const y of[y0,y1])for(const[x,z]of polygon)p.push(x,y,z);
  for(let k=0;k<tri.length;k+=3){const[a,b,c]=tri.slice(k,k+3);i.push(a,b,c,a+n,c+n,b+n);}
  for(let k=0;k<n;k++){const a=k,b=(k+1)%n;i.push(a,a+n,b+n,a,b+n,b);}
  return{p,i};
}
function roundedOutline(points,radius=.16){
  const out=[];
  for(let k=0;k<points.length;k++){
    const a=points[(k+points.length-1)%points.length],b=points[k],c=points[(k+1)%points.length],ab=Math.hypot(a[0]-b[0],a[1]-b[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]),
      r=Math.min(radius,ab*.18,bc*.18),start=b.map((v,j)=>v+(a[j]-v)*r/ab),end=b.map((v,j)=>v+(c[j]-v)*r/bc);
    for(let n=0;n<5;n++){const t=n/4;out.push(start.map((v,j)=>(1-t)*(1-t)*v+2*(1-t)*t*b[j]+t*t*end[j]));}
  }
  return out;
}
function strip(path,width,y0,y1){
  const left=[],right=[];
  for(let k=0;k<path.length;k++){
    const a=path[Math.max(0,k-1)],b=path[Math.min(path.length-1,k+1)],d=Math.hypot(b[0]-a[0],b[1]-a[1])||1,n=[-(b[1]-a[1])/d,(b[0]-a[0])/d];
    left.push(path[k].map((v,j)=>v+n[j]*width/2));right.push(path[k].map((v,j)=>v-n[j]*width/2));
  }
  return slab([...left,...right.reverse()],y0,y1);
}
function beam(a,b,width,thickness){
  const d=b.map((v,k)=>v-a[k]),length=Math.hypot(d[0],d[2])||1,side=[d[2]/length,0,-d[0]/length];
  return transformed(box(-width/2,width/2,-thickness/2,thickness/2,0,1),p=>a.map((v,k)=>v+side[k]*p[0]+(k===1?p[1]:0)+d[k]*p[2]));
}
function cylinder(x,y,z,r,height,sides=6){
  const polygon=Array.from({length:sides},(_,k)=>[x+Math.cos(k*TAU/sides)*r,z+Math.sin(k*TAU/sides)*r]);
  return slab(polygon,y,y+height);
}
function annulus(cx,y,cz,inner,outer,depth,sides=48){
  const p=[],i=[];
  for(const yy of[y,y+depth])for(let k=0;k<sides;k++)for(const r of[inner,outer]){const a=k*TAU/sides;p.push(cx+Math.cos(a)*r,yy,cz+Math.sin(a)*r);}
  const top=sides*2;
  for(let k=0;k<sides;k++){
    const a=k*2,b=((k+1)%sides)*2;
    i.push(a,b+1,b,a,a+1,b+1,top+a,top+b,top+b+1,top+a,top+b+1,top+a+1,
      a,b,top+b,a,top+b,top+a,a+1,top+b+1,b+1,a+1,top+a+1,top+b+1);
  }
  return{p,i};
}
const opened=p=>{const x=p[0]-hingeX,y=p[1]-hingeY,c=Math.cos(lidAngle),s=Math.sin(lidAngle);return[hingeX+c*x-s*y,hingeY+s*x+c*y,p[2]];};
function clipZ(polygon,edge,greater){
  const out=[];let a=polygon.at(-1),insideA=greater?a[1]>=edge:a[1]<=edge;
  for(const b of polygon){const insideB=greater?b[1]>=edge:b[1]<=edge;
    if(insideA!==insideB){const t=(edge-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*t,edge]);}
    if(insideB)out.push(b);a=b;insideA=insideB;
  }return out;
}
function widthAtZ(polygon,z){
  const xs=[];
  for(let k=0;k<polygon.length;k++){
    const a=polygon[k],b=polygon[(k+1)%polygon.length];if(z<Math.min(a[1],b[1])-1e-8||z>Math.max(a[1],b[1])+1e-8)continue;
    if(Math.abs(b[1]-a[1])<1e-9)xs.push(a[0],b[0]);else xs.push(a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]));
  }return[Math.min(...xs),Math.max(...xs)];
}
function brokenBentside(path){
  const kept=[],removed=[],gap=SOURCE_REST_HARPSICHORD.sideBreak;let last=null,kind=null;
  const append=(a,b,inside)=>{
    const target=inside?removed:kept;
    if(kind!==inside||!last||Math.hypot(last.at(-1)[0]-a[0],last.at(-1)[1]-a[1])>1e-7){last=[[...a]];target.push(last);}
    if(Math.hypot(last.at(-1)[0]-b[0],last.at(-1)[1]-b[1])>1e-8)last.push([...b]);kind=inside;
  };
  for(let k=1;k<path.length;k++){
    const a=path[k-1],b=path[k],ts=[0,1];
    for(const[axis,value]of[[0,gap.minX],[1,gap.minZ],[1,gap.maxZ]])if(Math.abs(b[axis]-a[axis])>1e-10){const t=(value-a[axis])/(b[axis]-a[axis]);if(t>1e-9&&t<1-1e-9)ts.push(t);}
    ts.sort((a,b)=>a-b);
    for(let j=1;j<ts.length;j++){
      const start=a.map((v,n)=>v+(b[n]-v)*ts[j-1]),end=a.map((v,n)=>v+(b[n]-v)*ts[j]),mid=start.map((v,n)=>(v+end[n])/2),
        inside=mid[0]>gap.minX&&mid[1]>gap.minZ&&mid[1]<gap.maxZ;
      if(Math.hypot(start[0]-end[0],start[1]-end[1])>1e-9)append(start,end,inside);
    }
  }
  return{kept:kept.filter(p=>p.length>1),removed:removed.filter(p=>p.length>1)};
}
function stringData(choir){return Array.from({length:61},(_,k)=>{
  const t=k/60,x=-2.37+t*4.76,short=choir==='electronic',start=[x+(short?.035:0),short?2.245:2.22,-.72+(short?.045:0)],
    longZ=-6.6+5.55*Math.pow(t,.72),end=[x+.06*Math.sin(Math.PI*t)+(short?.035:0),short?2.13+t*.025:2.055+t*.03,
      short?start[2]+(longZ-start[2])*.73:longZ],register=k<20?'low':k<40?'mid':'high',width=k<20?.018:k<40?.016:.014;
  return{midi:36+k,choir,register,start,end,width};
});}
// Each monumental course continues a real near string at its bridge. The far
// pins are rooted in the existing three Catch shelves: from the earned seat,
// bass crosses the void to the top case, middle to the soundboard, and treble
// rises from the nearby counterarc. They are one instrument seen at two scales.
export function sourceRestHarpsichordCourses(choir='acoustic'){
  const seat=SOURCE_REST_SEATS.find(item=>item.phase==='catch'),centre=SOURCE_CONTINUATION.catch.center,
    angle=Math.atan2(seat.z-centre.z,seat.x-centre.x),
    yaw=angle-Math.PI/2,c=Math.cos(yaw),s=Math.sin(yaw),synthetic=choir==='electronic';
  const local=(x,y,z)=>{const dx=x-seat.x,dz=z-seat.z;return[c*dx+s*dz,y-seat.feet,-s*dx+c*dz];};
  return stringData(choir).map((string,index)=>{
    const register=index<20?0:index<40?1:2,ordinal=index-register*20,count=register===2?21:20,
      t=ordinal/(count-1),stage=CONTINUATION_CATCH_STAGES[register],
      range=[[-.82,1.18],[.58,2.80],[2.88,4.61]][register],
      bearing=range[0]+(range[1]-range[0])*t+(synthetic?.012:0),
      radius=(register===1?11.1:stage.outerRadius-.12)-(synthetic?.13:0),ground=continuationRadialPoint(radius,bearing),
      rise=[4.55,10.55,8.4][register]+Math.sin(t*Math.PI)*.30,
      foot=local(ground.x,stage.y,ground.z),end=local(ground.x,stage.y+rise,ground.z);
    const principal=ordinal%5===0||ordinal===count-1;
    return{midi:string.midi,choir,register:string.register,start:[...string.end],end,foot,principal,
      ...(register<2?{guide:[string.end[0],12.6,string.end[2]-2.0]}:{}),
      width:(principal?[.24,.20,.15]:[.030,.025,.022])[register],thickness:synthetic?.028:.032,
      support:{id:`catch-${stage.level}-${stage.id}`,level:stage.level,y:stage.y,x:ground.x,z:ground.z,halfFootprint:.08},
      nearString:{start:[...string.start],end:[...string.end]}};
  });
}
function manualData(){
  const keys=[],width=2.16/36,start=-2.72;
  for(let manual=0;manual<2;manual++){
    const y=manual?1.09:.89,z=manual?.74:1.11,length=.39;
    for(let k=0;k<36;k++)keys.push({manual,natural:true,naturalIndex:k,x0:start+k*width+.003,x1:start+(k+1)*width-.003,y0:y,y1:y+.07,z0:z,z1:z+length});
    for(let k=0;k<35;k++)if([0,1,3,4,5].includes(k%7)){
      const x=start+(k+1)*width;keys.push({manual,natural:false,afterNatural:k,x0:x-width*.29,x1:x+width*.29,y0:y+.07,y1:y+.165,z0:z,z1:z+.23});
    }
  }return keys;
}
const bounds=geometry=>({min:[0,1,2].map(k=>Math.min(...geometry.p.filter((_,j)=>j%3===k))),max:[0,1,2].map(k=>Math.max(...geometry.p.filter((_,j)=>j%3===k)))});
let cached=null;
export function sourceRestHarpsichordGeometryLibrary(){
  if(cached)return cached;
  const out={},outline=roundedOutline(rawOutline),openPath=outline.slice(2,-2),parts=new Map(SOURCE_REST_HARPSICHORD_PARTS.map(p=>[p.mesh,p]));
  const add=(suffix,geometry,material,base,extra={})=>{const name='rest-harpsichord-'+suffix,part=parts.get(name);out[name]={...geometry,material,base:[...base,1],roughness:.86,
    casePart:part.casePart,reactive:part.reactive,register:part.register,wear:part.wear,pivot:part.pivot,localOrigin:[0,0,0],bounds:bounds(geometry),triangles:geometry.i.length/3,...extra};};
  // The open rear has a real central walking gap. Its two-manual bay sits to
  // the left, rather than pretending a player can pass through a keydesk.
  const architecture=['acoustic','electronic'].map(sourceRestHarpsichordCourses),
    bearings=architecture[0].filter((row,index)=>[0,10,19,20,30,39,40,50,60].includes(index))
      .filter(row=>!(row.foot[1]<1.95&&row.foot[0]>-.18&&row.foot[2]>SOURCE_REST_HARPSICHORD.sideBreak.minZ-.18
        &&row.foot[2]<SOURCE_REST_HARPSICHORD.sideBreak.maxZ+.18)),
    posts=bearings.flatMap(row=>[box(row.foot[0]-.05,row.foot[0]+.05,row.foot[1],row.end[1]+.10,row.foot[2]-.05,row.foot[2]+.05),
      box(row.foot[0]-.08,row.foot[0]+.08,row.foot[1],row.foot[1]+.18,row.foot[2]-.08,row.foot[2]+.08)]),
    broken=brokenBentside(openPath),caseWalls=[...broken.kept.map(path=>strip(path,.105,.045,1.62)),
    ...broken.removed.map(path=>strip(path,.145,.020,SOURCE_REST_HARPSICHORD.sideBreak.thresholdTop)),box(.72,2.75,.06,.28,1.27,1.38),
    box(-2.8,-.52,.05,.15,1.48,1.59),box(-2.8,-.52,1.26,1.36,1.51,1.59)];
  add('case',join([transformed(join(caseWalls),openCheek),...posts]),'wood',[.25,.17,.105],{construction:'thin bent case; lowered far cheek; exposed endgrain; monumental register bearing posts rooted in existing shelves',
    sideBreak:SOURCE_REST_HARPSICHORD.sideBreak,architecturalBearings:bearings.map(row=>({foot:[...row.foot],head:[...row.end],support:{...row.support}}))});
  const inner=openPath.map(([x,z])=>{const dx=-.3-x,dz=-2.6-z,d=Math.hypot(dx,dz)||1;return[x+dx/d*.073,z+dz/d*.073];});
  const ribs=architecture[0].filter((row,index)=>[0,10,19,20,30,39,40,50,60].includes(index)).flatMap(row=>{
    const start=[row.start[0],Math.max(2.38,row.start[1]+.18),row.start[2]],end=row.end.map((value,k)=>value-(k===1?.27:0));
    return row.guide?[beam(start,row.guide,.13,.18),beam(row.guide,end,.13,.18)]:[beam(start,end,.13,.18)];
  });
  add('lining',join([transformed(join(brokenBentside(inner).kept.map(path=>strip(path,.025,.27,1.50))),openCheek),...ribs]),'case-lining',[.40,.255,.19],
    {architecturalRibs:9,construction:'exposed soundboard ribs share the actual string-bearing directions'});
  const trim=broken.kept.flatMap(path=>[strip(path,.145,1.625,1.663),strip(path,.125,.10,.135)]);
  for(const z of[-.9,-3.8,-6.4]){trim.push(box(-2.90,-2.66,1.48,1.67,z-.15,z+.15));trim.push(beam([-2.80,1.63,z-.18],[-2.80,1.63,z+.18],.065,.065));}
  const registerRows=Array.from({length:3},(_,k)=>architecture[0].filter(row=>row.register===['low','mid','high'][k])),
    fret=[];
  for(const rows of registerRows){
    const anchors=rows.filter((_,index)=>index%4===0||index===rows.length-1);
    for(let k=1;k<anchors.length;k++)for(const inset of[.12,.35,.61])fret.push(beam(
      anchors[k-1].end.map((value,j)=>value-(j===1?inset:0)),anchors[k].end.map((value,j)=>value-(j===1?inset:0)),.055,.055));
  }
  add('beading',join([transformed(join(trim),openCheek),...fret]),'worn-metal',[.64,.46,.245],{roughness:.78,registerFret:3,
    construction:'three stepped, nested bentside frets tied to the real upper bearings'});
  const choirs=['acoustic','electronic'].map(stringData),bridges=[];
  for(const [k,strings]of choirs.entries()){
    bridges.push(strip(strings.filter((_,j)=>j%3===0||j===60).map(n=>[n.end[0],n.end[2]]),k?.10:.13,k?1.96:1.97,k?2.13:2.055));
    for(const n of[strings[0],strings.at(-1)]){
      const edges=widthAtZ(outline,n.end[2]),x=n.midi===36?edges[0]+.035:edges[1]-.035;
      bridges.push(beam(n.midi===36?[x,1.61,n.end[2]]:[n.end[0],2.055,-.70],n.end,.085,.085));
    }
  }
  bridges.push(box(-2.57,2.61,2.145,2.195,-.765,-.675));
  for(const choir of architecture)for(const register of['low','mid','high']){
    const rows=choir.filter(row=>row.register===register).filter((_,index)=>index%4===0||index===(register==='high'?20:19));
    for(let k=1;k<rows.length;k++)bridges.push(beam(rows[k-1].end,rows[k].end,.16,.17));
  }
  add('bridges',join(bridges),'piano-wood',[.56,.335,.16],{bridgeCount:2,swept:true});
  for(const [k,strings]of choirs.entries())for(const register of['low','mid','high']){
    const rows=strings.filter(n=>n.register===register);
    const courses=architecture[k].filter(row=>row.register===register);
    add('strings-'+(k?'electronic':'acoustic')+'-'+register,
      join([...rows.map(n=>beam(n.start,n.end,n.width,.005)),...courses.flatMap(n=>n.guide
        ?[beam(n.start,n.guide,n.width,n.thickness),beam(n.guide,n.end,n.width,n.thickness)]
        :[beam(n.start,n.end,n.width,n.thickness)])]),
      'worn-metal',k?[.43,.57,.53]:[.70,.61,.43],{strings:rows.map(n=>({...n,start:[...n.start],end:[...n.end]})),
        architecturalStrings:courses,courseWidthMinimum:Math.min(...courses.map(row=>row.width)),
        stringWidthMinimum:Math.min(...rows.map(n=>n.width)),roughness:.82});
  }
  add('wrestplank',join([box(-2.80,2.94,2.0,2.175,-.97,-.58),box(-2.84,-2.70,1.50,2.05,-.99,-.57),
    box(2.90,3.00,1.50,2.05,-.45,-.28),box(2.79,3.01,2.0,2.175,-.97,-.28)]),'piano-wood',[.46,.285,.155]);
  const pins=[];
  for(const strings of choirs)for(const n of strings){pins.push(cylinder(n.start[0],2.12,n.start[2]+.055,.023,.20,4));pins.push(cylinder(n.end[0],n.end[1]-.025,n.end[2]-.035,.019,.075,5));
    pins.push(box(n.start[0]-.012,n.start[0]+.012,1.97,2.145,n.start[2]-.08,n.start[2]-.055));}
  add('pins-jacks',join(pins),'dark-metal',[.205,.235,.205],{tuningPins:122,hitchPins:122,jacks:122,tuningHeads:'square'});
  add('manual-bed',join([box(-2.76,-.52,.68,.885,1.075,1.56),box(-2.76,-.52,.925,1.085,.705,1.16),
    box(-2.79,-2.73,.68,1.29,.67,1.59),box(-.55,-.50,.68,1.29,.67,1.59),box(-2.76,-.52,.59,.68,1.15,1.48)]),'wood',[.235,.15,.085],{manuals:2,walkingGap:[-.50,.72]});
  const keys=manualData();
  for(const [natural,suffix,material,colour]of[[true,'naturals','linen',[.81,.75,.57]],[false,'accidentals','wood',[.065,.060,.042]]]){
    const selected=keys.filter(k=>k.natural===natural);
    add(suffix,join(selected.map(k=>box(k.x0,k.x1,k.y0,k.y1,k.z0,k.z1))),material,colour,{keys:selected,manuals:2,accidentalGroups:[2,3],roughness:.91});
  }
  for(const [suffix,min,max]of[['lid-rear',-1.8,1.35],['lid-middle',-4.5,-1.8],['lid-tail',-7.4,-4.5]]){
    const section=clipZ(clipZ(outline,min,true),max,false),lid=[slab(section,hingeY+.012,hingeY+.132)];
    // Recessed framing belongs to the same rigid wooden member. It cannot
    // remain hanging in place when a late lid panel is released.
    const z=(min+max)/2,edges=widthAtZ(section,z);
    lid.push(box(edges[0]+.10,Math.max(edges[0]+.14,edges[1]-.12),hingeY+.132,hingeY+.183,z-.035,z+.035));
    add(suffix,transformed(join(lid),opened),'wood',[.39,.235,.125],{hinge:[hingeX,hingeY,z],openAngle:lidAngle,assembly:'spine-hinged-lid',section:[min,max]});
  }
  const propZ=.15,propTop=opened([1.35,hingeY+.03,propZ]),propFoot=widthAtZ(outline,propZ)[1]-.025;
  add('lid-prop',beam([propFoot,1.635,propZ],propTop,.080,.080),'wood',[.40,.28,.15],{attachedTo:'spine-hinged-lid'});
  const rose=SOURCE_REST_HARPSICHORD.rose,ornament=[annulus(rose.centre[0],.055,rose.centre[2],.325,.42,.038),annulus(rose.centre[0],.071,rose.centre[2],.20,.233,.026,36)];
  for(let k=0;k<12;k++){const a=k*TAU/12,b=a+.12;ornament.push(beam([rose.centre[0]+Math.cos(a)*.205,.083,rose.centre[2]+Math.sin(a)*.205],
    [rose.centre[0]+Math.cos(b)*.35,.083,rose.centre[2]+Math.sin(b)*.35],.022,.018));}
  add('rose',join(ornament),'worn-metal',[.69,.51,.26],{appliedRosette:true,opening:false,roughness:.80});
  const total=Object.values(out).reduce((n,p)=>n+p.triangles,0);
  if(Object.keys(out).length!==SOURCE_REST_HARPSICHORD.maxParts||total>SOURCE_REST_HARPSICHORD.triangleBudget)throw Error('Harpsichord geometry exceeds its bounded part/triangle budget.');
  cached=freeze(out);return cached;
}

// Bench-space matches the previous physical furniture: +X is forward, Z is
// its long axis (the host retains the existing .55 Z scale). The .6075m pad
// plane keeps every existing pelvis/contact/eye calculation authoritative.
export function sourceRestHarpsichordSeatGeometry(){
  const timber=[],cloth=[],padTop=.6075;
  const rounded=(x0,x1,z0,z1,y0,y1,r=.035)=>slab(roundedOutline([[x0,z0],[x1,z0],[x1,z1],[x0,z1]],r),y0,y1);
  timber.push(rounded(-.34,.35,-1.53,1.53,.425,.53,.055));
  for(const x of[-.24,.24])for(const z of[-1.30,1.30]){
    timber.push(rounded(x-.07,x+.07,z-.105,z+.105,0,.075));
    timber.push(box(x-.042,x+.042,.065,.45,z-.055,z+.055));
  }
  for(let n=0;n<11;n++){
    const z=-1.40+n*.28;
    timber.push(beam([-.285,.50,z],[-.355,.96,z],.055,.06));
    timber.push(beam([-.355,.96,z],[-.305,1.16,z],.055,.06));
  }
  for(const y of[.76,1.13])timber.push(beam([-.325,y,-1.49],[-.325,y,1.49],.062,.062));
  for(const sign of[-1,1]){
    const z=sign*1.43;
    timber.push(beam([.27,.48,z],[.29,.73,z],.075,.075));
    timber.push(beam([.29,.73,z],[-.31,.87,z],.075,.065));
    timber.push(beam([-.31,.87,z],[-.34,1.10,z],.075,.065));
    cloth.push(rounded(-.245,.315,z-.09,z+.09,.73,.775,.055));
  }
  // Three upholstered panels have real recessed divisions. No buttons or
  // decorative seams rise above the contact surface beneath the player.
  for(let n=0;n<3;n++){
    const z0=-1.31+n*(2.62/3),z1=-1.31+(n+1)*(2.62/3);
    cloth.push(rounded(-.275,.305,z0+.006,z1-.006,.535,padTop,.05));
    cloth.push(rounded(-.292,.318,z0+.003,z1-.003,.535,.551,.04));
  }
  cloth.push(rounded(-.335,-.245,-1.31,1.31,.68,1.085,.035));
  const wood=join(timber),upholstery=join(cloth),triangles=(wood.i.length+upholstery.i.length)/3,
    total=Object.values(sourceRestHarpsichordGeometryLibrary()).reduce((sum,g)=>sum+g.triangles,0)+triangles;
  if(total>SOURCE_REST_HARPSICHORD.triangleBudget)throw Error('Instrument and purpose-built settle exceed shared triangle budget.');
  return{...wood,material:'wood',base:[.31,.19,.095,1],roughness:.91,bounds:bounds(wood),triangles:wood.i.length/3,
    seatHeight:padTop,forward:'+X',retainedScaleZ:.55,upholstery:{...upholstery,material:'linen',base:[.085,.105,.095,1],roughness:.96,
      bounds:bounds(upholstery),triangles:upholstery.i.length/3,seatHeight:padTop},
    diagnostics:{purpose:'case settle; bentwood ribs and dark canvas panels',instrumentAndSeatTriangles:total,additionalBatches:2}};
}
