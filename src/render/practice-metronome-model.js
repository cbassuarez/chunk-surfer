// One physical instrument in the room and in the hands. +Y is up and -Z is
// the printed face. No local animation clock: pose comes from audible transport.
import {METRONOME_TEMPO} from '../game/practice-metronomes.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(Number(v))?Number(v):a));
export const PRACTICE_METRONOME_SHAPE=Object.freeze({
  height:.421,halfWidth:.108,depth:.15,pivotY:.074,frontZ:-.088,
  rodLength:.329,weightLow:.089,weightHigh:.294,maxAngle:Math.PI*.115,
  weightWidth:.061,weightHeight:.031,
});
// The view projects these literal surfaces, rather than an invented screen UI.
export const PRACTICE_METRONOME_PICK_GEOMETRY=Object.freeze({
  caseFrontZ:-.0715,weightFrontZ:-.102,weightScrewFrontZ:-.112,
  weightScrewRadius:.006,pivotFrontZ:-.101,rodPickRadius:.006,
});
export const PRACTICE_METRONOME_SCALE=Object.freeze([40,60,80,100,120,144,168,192,224,252,300]);
export const PRACTICE_METRONOME_SCALE_SURFACE=Object.freeze({x0:-.085,x1:.085,y0:.045,y1:.415});
// A long, unbranded extended scale preserves all six authored tempi. The
// logarithmic spacing gives the low end room without implying a digital fader.
export function practiceMetronomeWeightDistance(tempo){
  const C=PRACTICE_METRONOME_SHAPE,t=clamp(tempo,METRONOME_TEMPO.min,METRONOME_TEMPO.max);
  return C.weightLow+(C.weightHigh-C.weightLow)*Math.log(METRONOME_TEMPO.max/t)/Math.log(METRONOME_TEMPO.max/METRONOME_TEMPO.min);
}
export function practiceMetronomeTempoAtDistance(distance){
  const C=PRACTICE_METRONOME_SHAPE,t=clamp((distance-C.weightLow)/(C.weightHigh-C.weightLow),0,1);
  return METRONOME_TEMPO.max*Math.pow(METRONOME_TEMPO.min/METRONOME_TEMPO.max,t);
}
export function practiceMetronomePose(tempo=168,swing=0){
  const C=PRACTICE_METRONOME_SHAPE,angle=clamp(swing,-1,1)*C.maxAngle,distance=practiceMetronomeWeightDistance(tempo);
  const at=d=>({x:Math.sin(angle)*d,y:C.pivotY+Math.cos(angle)*d,z:C.frontZ});
  return{angle,distance,pivot:at(0),tip:at(C.rodLength),weight:at(distance)};
}

const sub=(a,b)=>a.map((x,k)=>x-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const d=Math.hypot(...v);return v.map(n=>n/d);};
const group=material=>({p:[],i:[],n:[],uv:[],material});
// Canvas maps upload with Y flipped: the dark bottom-right swatch lives at V≈0.
const DARK_UV=[.955,.045];
function uvAt(p,n,material){
  if(material==='scale'){
    const S=PRACTICE_METRONOME_SCALE_SURFACE;
    // From the working (-Z) face the runtime camera puts local +X on screen
    // left. Reverse texture U so actual printed glyphs read left to right.
    return[1-(p[0]-S.x0)/(S.x1-S.x0),(p[1]-S.y0)/(S.y1-S.y0)];
  }
  const axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
  const uv=axis===1?[(p[0]+.108)/.216,(p[2]+.075)/.15]:axis===0?[(p[2]+.075)/.15,p[1]/.421]:[(p[0]+.108)/.216,p[1]/.421];
  // Brass uses a small dark atlas corner for true screw slots and grip grooves.
  return material==='brass'?uv.map(v=>.06+clamp(v,0,1)*.78):uv;
}
function tri(g,a,b,c,normals=null,uv=null){
  const at=g.p.length/3,n=unit(cross(sub(b,a),sub(c,a)));
  for(const[p,k]of[[a,0],[b,1],[c,2]]){
    g.p.push(...p);g.n.push(...(normals?.[k]||n));g.uv.push(...(uv||uvAt(p,n,g.material)));
  }
  g.i.push(at,at+1,at+2);
}
function quad(g,a,b,c,d,uv=null){tri(g,a,b,c,null,uv);tri(g,a,c,d,null,uv);}
// Clockwise from above: closed clipped corners give real bevel highlights,
// while the inset top/bottom rings soften the otherwise knife-edged boxes.
function ring(x0,x1,z0,z1,y,c){
  return[[x0+c,y,z0],[x1-c,y,z0],[x1,y,z0+c],[x1,y,z1-c],[x1-c,y,z1],[x0+c,y,z1],[x0,y,z1-c],[x0,y,z0+c]];
}
function loft(g,rings,uv=null){
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<rings[k].length;j++){
    const n=(j+1)%rings[k].length;quad(g,rings[k][j],rings[k+1][j],rings[k+1][n],rings[k][n],uv);
  }
  for(let k=1;k<rings[0].length-1;k++)tri(g,rings[0][0],rings[0][k],rings[0][k+1],null,uv);
  const top=rings.at(-1);for(let k=1;k<top.length-1;k++)tri(g,top[0],top[k+1],top[k],null,uv);
}
function bevelBox(g,x0,x1,y0,y1,z0,z1,b=.001,uv=null){
  const c=Math.min(b,(x1-x0)/5,(y1-y0)/3,(z1-z0)/5),small=c*.22;
  loft(g,[ring(x0+c,x1-c,z0+c,z1-c,y0,small),ring(x0,x1,z0,z1,y0+c,c),ring(x0,x1,z0,z1,y1-c,c),ring(x0+c,x1-c,z0+c,z1-c,y1,small)],uv);
}
function cylinder(g,a,b,r,segments=16,uv=null){
  const axis=unit(sub(b,a)),u=unit(cross(axis,Math.abs(axis[1])<.8?[0,1,0]:[1,0,0])),v=cross(axis,u);
  const radial=i=>u.map((n,k)=>n*Math.cos(i/segments*Math.PI*2)+v[k]*Math.sin(i/segments*Math.PI*2));
  const point=(center,n)=>center.map((p,k)=>p+n[k]*r);
  for(let i=0;i<segments;i++){
    const n0=radial(i),n1=radial(i+1),a0=point(a,n0),a1=point(a,n1),b0=point(b,n0),b1=point(b,n1);
    tri(g,a0,a1,b1,[n0,n1,n1],uv);tri(g,a0,b1,b0,[n0,n1,n0],uv);
    tri(g,a,a1,a0,[axis.map(x=>-x),axis.map(x=>-x),axis.map(x=>-x)],uv);tri(g,b,b0,b1,[axis,axis,axis],uv);
  }
}
function keyLoop(g,x,y,z,ry,rz){
  const count=16,sides=6,tube=.00135;
  const at=(i,j)=>{
    const a=i/count*Math.PI*2,b=j/sides*Math.PI*2;
    return[x+Math.sin(b)*tube,y+Math.cos(a)*(ry+Math.cos(b)*tube),z+Math.sin(a)*(rz+Math.cos(b)*tube)];
  };
  for(let i=0;i<count;i++)for(let j=0;j<sides;j++)quad(g,at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1));
}
function facePanel(g,y0,y1,w0,w1,z0,z1){
  const p=[[-w0,y0,z0],[w0,y0,z0],[w0,y0,z1],[-w0,y0,z1],[-w1,y1,z0],[w1,y1,z0],[w1,y1,z1],[-w1,y1,z1]];
  for(const[a,b,c,d]of[[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])quad(g,p[d],p[c],p[b],p[a]);
}
function extrudeXY(g,points,z0,z1){
  const front=points.map(([x,y])=>[x,y,z0]),back=points.map(([x,y])=>[x,y,z1]);
  for(let i=1;i<points.length-1;i++){tri(g,front[0],front[i+1],front[i]);tri(g,back[0],back[i],back[i+1]);}
  for(let i=0;i<points.length;i++){const j=(i+1)%points.length;quad(g,front[i],front[j],back[j],back[i]);}
}
function scaleFrame(g){
  const outer=[[-.086,.049],[.086,.049],[.035,.405],[-.035,.405]],inner=[[-.080,.054],[.080,.054],[.030,.401],[-.030,.401]];
  for(let i=0;i<4;i++){const j=(i+1)%4;extrudeXY(g,[outer[i],outer[j],inner[j],inner[i]],-.075,-.067);}
}
function screw(g,x,y,z,r=.0024){
  cylinder(g,[x,y,z+.0013],[x,y,z],r,12);
  bevelBox(g,x-r*.67,x+r*.67,y-.00028,y+.00028,z-.00013,z+.00013,.00005,DARK_UV);
}
const piece=(name,g,roughness=1,metallic=1)=>Object.freeze({
  name,p:g.p,i:g.i,n:g.n,uv:g.uv,base:[1,1,1,1],emissive:[0,0,0],roughness,metallic,material:g.material,
});
let geometry;
export function practiceMetronomeGeometry(){
  if(geometry)return geometry;
  const C=PRACTICE_METRONOME_SHAPE,K=PRACTICE_METRONOME_PICK_GEOMETRY,
    wood=group('walnut'),face=group('scale'),dark=group('dark'),pivot=group('brass'),rod=group('brass'),weight=group('brass');
  // Four quiet rubber feet, a stepped mitered plinth and a hollow-looking raised
  // front lip. Scale is recessed behind the lip, not pasted on the rod plane.
  for(const x of[-.083,.083])for(const z of[-.052,.052])bevelBox(dark,x-.012,x+.012,0,.010,z-.012,z+.012,.002);
  bevelBox(wood,-.108,.108,.009,.028,-.075,.075,.003);
  bevelBox(wood,-.104,.104,.028,.036,-.072,.072,.0015);
  loft(wood,[ring(-.101,.101,-.070,.070,.035,.004),ring(-.099,.099,-.070,.070,.043,.005),ring(-.047,.047,-.066,.066,.411,.004),ring(-.043,.043,-.062,.062,.421,.003)]);
  // The thin front frame casts a real ledge shadow around the aged scale.
  scaleFrame(wood);
  facePanel(face,.054,.401,.080,.030,K.caseFrontZ,-.0695);
  // Dark seams at plinth corners stop the base reading as one plastic block.
  for(const sign of[-1,1]){
    const x=sign*.089;
    quad(dark,[x,.0281,-.074],[sign*.106,.0281,-.057],[sign*.1055,.0281,-.0565],[x-sign*.0005,.0281,-.0735]);
    // Actual inset side slats follow the case taper; not screen-space stripes.
    for(let i=0;i<5;i++){
      const y=.115+i*.012,w=.099+(.047-.099)*(y-.043)/(.411-.043),xx=sign*(w+.0003),dy=.002;
      quad(dark,[xx,y-dy,.013],[xx,y+dy,.013],[xx-sign*.0006,y+dy,.048],[xx-sign*.0006,y-dy,.048]);
    }
    screw(pivot,sign*.077,.021,-.0754,.0021);
  }
  // Recessed plate fasteners, pivot cap, catch and a genuine side winding key.
  for(const[x,y]of[[-.018,.391],[.018,.391],[-.062,.064],[.062,.064]])screw(pivot,x,y,-.0726,.0018);
  cylinder(pivot,[0,C.pivotY,-.0715],[0,C.pivotY,K.pivotFrontZ],.0105,20);
  cylinder(pivot,[0,C.pivotY,-.1009],[0,C.pivotY,-.101],.0064,20);
  bevelBox(pivot,.009,.030,C.pivotY-.008,C.pivotY-.003,-.095,-.088,.0014);
  cylinder(pivot,[.024,C.pivotY-.006,-.095],[.024,C.pivotY-.006,-.100],.0035,12);
  cylinder(pivot,[.089,.065,.023],[.106,.065,.023],.0045,12);
  keyLoop(pivot,.105,.065,.014,.007,.0045);keyLoop(pivot,.105,.065,.032,.007,.0045);
  // Articulated pieces stay local to the exact existing hinge and weight axis.
  cylinder(rod,[0,-.018,C.frontZ],[0,C.rodLength,C.frontZ],.0027,16);
  cylinder(rod,[0,C.rodLength-.002,C.frontZ],[0,C.rodLength+.001,C.frontZ],.0032,12);
  bevelBox(weight,-C.weightWidth/2,C.weightWidth/2,-C.weightHeight/2,C.weightHeight/2,K.weightFrontZ,-.080,.003);
  // Casting shoulder and thumb screw have depth; the narrow slot is dark metal.
  bevelBox(weight,-.022,.022,-.010,.010,K.weightFrontZ-.001,K.weightFrontZ+.001,.0005);
  cylinder(weight,[0,0,K.weightFrontZ-.0005],[0,0,K.weightScrewFrontZ],K.weightScrewRadius,20);
  cylinder(weight,[0,0,K.weightScrewFrontZ+.0015],[0,0,K.weightScrewFrontZ],K.weightScrewRadius*1.08,20);
  bevelBox(weight,-.004,.004,-.0006,.0006,K.weightScrewFrontZ-.00012,K.weightScrewFrontZ+.00012,.00005,DARK_UV);
  for(const sign of[-1,1])bevelBox(weight,sign<0?-.025:.018,sign<0?-.018:.025,-.010,.010,K.weightFrontZ-.00008,K.weightFrontZ+.00012,.00004,DARK_UV);
  geometry=Object.freeze([
    piece('practice_metronome_case',wood),piece('practice_metronome_scale',face),
    piece('practice_metronome_ink',dark),piece('practice_metronome_pivot',pivot),
    piece('practice_metronome_rod',rod),piece('practice_metronome_weight',weight),
  ]);return geometry;
}
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function multiply(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return out;}
export function practiceMetronomePlacement(prop={}){
  if(prop.matrix?.length===16)return new Float32Array(prop.matrix);
  const s=Number(prop.scale)||1,sx=s*(prop.scaleX??1),sy=s*(prop.scaleY??1),sz=s*(prop.scaleZ??1),a=Number(prop.yaw)||0,c=Math.cos(a),n=Math.sin(a);
  return new Float32Array([c*sx,0,n*sx,0,0,sy,0,0,-n*sz,0,c*sz,0,Number(prop.x)||0,Number(prop.y)||0,Number(prop.z)||0,1]);
}
// Input is an ordinary renderer instance (y already includes its elevation),
// not a floorplan prop. Keep the original interactable/collider in the host.
export function practiceMetronomeInstances(prop={},state={}){
  const C=PRACTICE_METRONOME_SHAPE,pose=practiceMetronomePose(state.tempo,state.swing),base=practiceMetronomePlacement(prop),a=pose.angle,c=Math.cos(a),s=Math.sin(a);
  const hinge=new Float32Array([c,-s,0,0,s,c,0,0,0,0,1,0,0,C.pivotY,0,1]);
  const shift=identity();shift[13]=pose.distance;
  return practiceMetronomeGeometry().map(part=>{
    const articulated=part.name.endsWith('_rod')||part.name.endsWith('_weight');
    const matrix=articulated?multiply(base,part.name.endsWith('_weight')?multiply(hinge,shift):hinge):new Float32Array(base);
    const center=[0,articulated?part.name.endsWith('_weight')?0:C.rodLength/2:C.height/2,0];
    const at=[0,1,2].map(r=>matrix[r]*center[0]+matrix[4+r]*center[1]+matrix[8+r]*center[2]+matrix[12+r]);
    const scale=Math.max(Math.hypot(base[0],base[1],base[2]),Math.hypot(base[4],base[5],base[6]),Math.hypot(base[8],base[9],base[10]));
    return{...prop,id:`${prop.id||'practice-metronome'}:${part.name.replace('practice_metronome_','')}`,mesh:part.name,matrix,x:at[0],y:at[1],z:at[2],
      cullRadius:.25*scale,blocks:false,interactive:false,structural:false,decorative:true};
  });
}
