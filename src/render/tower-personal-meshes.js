// The optional contractor walk uses ordinary, metre-sized props. These pieces
// enter the same pack, depth, torch, material and shadow passes as the school
// furniture. They do not introduce a separate apparition or screen overlay.
import { physicalPrintPixels, uploadPhysicalPrint } from './physical-source-print.js';
import { worldLetteringFont } from './world-lettering-fonts.js';
import { PROP_INSTANCE_FLOATS, PROP_INSTANCE_BINDINGS } from './prop-instance-layout.js';

export const TOWER_RECORDER_PRINT = Object.freeze({copy:'DA1000',frontAxis:'-z',
  printedSurface:Object.freeze({version:1,coverage:'baseColorAlpha',polarity:'light-on-dark',
    process:'screen-printed equipment legend',emission:'none'})});
const recorderPrintTextures=new WeakMap();

function recorderPrintTexture(gl){
  if(typeof document==='undefined')return null;
  if(recorderPrintTextures.has(gl))return recorderPrintTextures.get(gl);
  const bitmap=physicalPrintPixels({width:256,height:48,ground:'rgb(129,134,132)',finish:{profile:'satin-metal',widthM:.159,heightM:.018,seed:'DA1000-fascia'},draw(c,m){
    c.textAlign=m.textAlign='center';c.textBaseline=m.textBaseline='alphabetic';
    c.font=m.font=worldLetteringFont(48,'sansBold');
    const cap=c.measureText('H').actualBoundingBoxAscent||34;
    c.font=m.font=worldLetteringFont(48*36/cap,'sansBold');
    c.fillStyle='rgb(209,204,184)';m.fillStyle='#fff';
    c.fillText(TOWER_RECORDER_PRINT.copy,128,42);m.fillText(TOWER_RECORDER_PRINT.copy,128,42);
  }});
  const texture=uploadPhysicalPrint(gl,bitmap,{repeat:false}),normalTexture=uploadPhysicalPrint(gl,{...bitmap,pixels:bitmap.normalPixels},{repeat:false,srgb:false}),ormTexture=uploadPhysicalPrint(gl,{...bitmap,pixels:bitmap.ormPixels},{repeat:false,srgb:false});
  const maps={texture,normalTexture,ormTexture,letteringFinish:bitmap.finish};recorderPrintTextures.set(gl,maps);return maps;
}

const MATERIALS = {
  wood: { name: 'worn wood', base: [.34, .20, .095, 1], roughness: .78 },
  dark: { name: 'dark wood', base: [.16, .095, .052, 1], roughness: .82 },
  black: { name: 'black lacquer', base: [.025, .028, .03, 1], roughness: .62, metallic: .15 },
  steel: { name: 'painted steel', base: [.22, .24, .23, 1], roughness: .64, metallic: .7 },
  plaster: { name: 'academic plaster', base: [.63, .62, .55, 1], roughness: .94 },
  white: { name: 'aged white paint', base: [.69, .72, .66, 1], roughness: .84 },
  slate: { name: 'wet slate', base: [.075, .09, .105, 1], roughness: .71 },
  green: { name: 'pub green paint', base: [.075, .18, .12, 1], roughness: .79 },
  cloth: { name: 'cloth', base: [.12, .13, .12, 1], roughness: .96 },
  navy: { name: 'navy raincloth', base: [.035, .075, .12, 1], roughness: .95 },
  skin: { name: 'warm skin', base: [.50, .28, .18, 1], roughness: .86 },
  hair: { name: 'contractor brown hair', base: [.085, .055, .036, 1], roughness: .98 },
  tape: { name: 'recorder oxide tape', base: [.27, .14, .065, 1], roughness: .76 },
  paper: { name: 'paper label', base: [.64, .60, .48, 1], roughness: .91 },
  'recorder-print': {name:'screen-printed equipment legend',base:[1,1,1,1],roughness:1,metallic:1},
  meter: { name: 'vfd green glass', base: [.018, .12, .055, 1], roughness: .3, emissive: [.012, .20, .035] },
  ash: { name: 'tower cold ash', base: [.18, .19, .17, 1], roughness: .99 },
  snow: { name: 'settled hall snow', base: [.72, .77, .78, 1], roughness: .99 },
  rust: { name: 'oxidised fixings', base: [.29, .15, .08, 1], roughness: .91, metallic: .35 },
  warm: { name: 'practical lamp glass', base: [.70, .49, .23, 1], roughness: .43, emissive: [1.6, .88, .32] },
  earth: { name: 'windpacked dark ground', base: [.15, .17, .12, 1], roughness: .99 },
};

const vector = (a, b) => a.map((value, index) => value - b[index]);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = value => { const length = Math.hypot(...value) || 1; return value.map(v => v / length); };

function shape(name) { return { name, groups: new Map() }; }
function group(piece, material) {
  if (!piece.groups.has(material)) piece.groups.set(material, { material, positions: [], normals: [], uvs: [], indices: [] });
  return piece.groups.get(material);
}
function triangle(piece, material, a, b, c) {
  const target = group(piece, material), start = target.positions.length / 3;
  const normal = unit(cross(vector(b, a), vector(c, a)));
  const axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  for (const point of [a, b, c]) {
    target.positions.push(...point); target.normals.push(...normal);
    target.uvs.push(point[axis === 0 ? 2 : 0], point[axis === 1 ? 2 : 1]);
  }
  target.indices.push(start, start + 1, start + 2);
}
function quad(piece, material, a, b, c, d) {
  triangle(piece, material, a, b, c); triangle(piece, material, a, c, d);
}
function box(piece, center, size, material, yaw = 0, pitch = 0) {
  const [x, y, z] = size.map(v => v / 2), cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const point = ([px, py, pz]) => {
    const yy = py * cp - pz * sp, zz = py * sp + pz * cp;
    return [center[0] + px * cy - zz * sy, center[1] + yy, center[2] + px * sy + zz * cy];
  };
  for (const face of [
    [[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]],
    [[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]],
    [[x,-y,z],[x,-y,-z],[x,y,-z],[x,y,z]],
    [[-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z]],
    [[-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z]],
    [[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]],
  ]) quad(piece, material, ...face.map(point));
}

// A beam has a real thickness in every direction, so a loose tape/lead is
// visible to the torch at a grazing angle and casts a physical shadow.
function beam(piece, start, end, width, material, depth = width) {
  const axis = unit(vector(end, start));
  const side = unit(cross(axis, Math.abs(axis[1]) < .9 ? [0,1,0] : [1,0,0]));
  const up = cross(side, axis);
  const ring = center => [[-1,-1],[1,-1],[1,1],[-1,1]].map(([s,u]) => center.map((v,i) => v + side[i]*s*width/2 + up[i]*u*depth/2));
  const a = ring(start), b = ring(end);
  quad(piece, material, a[0], a[1], a[2], a[3]);
  quad(piece, material, b[3], b[2], b[1], b[0]);
  for (let i=0;i<4;i++) quad(piece, material, a[i], b[i], b[(i+1)%4], a[(i+1)%4]);
}
function ellipsoid(piece, center, radius, material, segments = 10, rings = 6) {
  const point = (ring, segment) => {
    const latitude = -Math.PI/2 + Math.PI*ring/rings, longitude = Math.PI*2*segment/segments;
    return [center[0]+Math.cos(latitude)*Math.cos(longitude)*radius[0], center[1]+Math.sin(latitude)*radius[1], center[2]+Math.cos(latitude)*Math.sin(longitude)*radius[2]];
  };
  for (let r=0;r<rings;r++) for (let s=0;s<segments;s++) {
    const a=point(r,s), b=point(r,s+1), c=point(r+1,s+1), d=point(r+1,s);
    if(r>0) triangle(piece,material,a,c,b);
    if(r<rings-1) triangle(piece,material,a,d,c);
  }
}
function cylinder(piece, center, radius, height, material, segments = 12) {
  const top=[center[0],center[1]+height/2,center[2]],bottom=[center[0],center[1]-height/2,center[2]];
  for(let i=0;i<segments;i++) {
    const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
    const at=y=>[center[0]+Math.cos(a)*radius,y,center[2]+Math.sin(a)*radius];
    const bt=y=>[center[0]+Math.cos(b)*radius,y,center[2]+Math.sin(b)*radius];
    quad(piece,material,at(bottom[1]),at(top[1]),bt(top[1]),bt(bottom[1]));
    triangle(piece,material,top,bt(top[1]),at(top[1]));
    triangle(piece,material,bottom,at(bottom[1]),bt(bottom[1]));
  }
}
function tapeReel(piece) {
  // Upright archival spool: an actual dark wound drum behind steel spokes,
  // with a thin open flange. At landscape scale it still reads as recording
  // equipment, rather than a tyre or a pool lane float.
  const cy=.86,steps=40;
  const point=(radius,angle,z)=>[Math.cos(angle)*radius,cy+Math.sin(angle)*radius,z];
  const ring=(inner,outer,z,material)=>{
    for(let i=0;i<steps;i++) {
      const a=i*Math.PI*2/steps,b=(i+1)*Math.PI*2/steps;
      if(z>0)quad(piece,material,point(inner,a,z),point(outer,a,z),point(outer,b,z),point(inner,b,z));
      else quad(piece,material,point(inner,b,z),point(outer,b,z),point(outer,a,z),point(inner,a,z));
    }
  };
  for(let i=0;i<steps;i++) {
    const a=i*Math.PI*2/steps,b=(i+1)*Math.PI*2/steps;
    quad(piece,'tape',point(.64,a,-.11),point(.64,b,-.11),point(.64,b,.11),point(.64,a,.11));
    quad(piece,'steel',point(.82,a,-.15),point(.82,b,-.15),point(.82,b,.15),point(.82,a,.15));
  }
  for(const z of [-.15,.15]) {
    ring(.13,.64,z*.75,'black');ring(.72,.82,z,'steel');ring(.025,.16,z,'steel');
    for(let k=0;k<5;k++) {
      const a=k*Math.PI*2/5;
      beam(piece,point(.12,a,z),point(.75,a,z),.065,'steel',.027);
    }
  }
  box(piece,[0,.075,0],[.52,.15,.39],'black');
  box(piece,[.34,cy+.31,.168],[.15,.075,.012],'paper',0,-.15);
}
function chair(piece, x=0, z=0, child=false, seat=child?.39:.45) {
  const w=child?.36:.44;
  box(piece,[x,seat,z],[w,.045,w],'wood');
  box(piece,[x,seat+.23,z+.18],[w,.40,.035],'wood');
  for (const dx of [-w*.40,w*.40]) for (const dz of [-w*.40,w*.40]) beam(piece,[x+dx,.015,z+dz],[x+dx,seat,z+dz],.025,'steel');
  for (const dx of [-w*.4,w*.4]) beam(piece,[x+dx,seat,z+.17],[x+dx,seat+.43,z+.17],.022,'steel');
  // The same pale diagonal chip and two exposed rivets identify this chair on
  // the return, without writing a label onto the story's central object.
  beam(piece,[x-.10,seat+.29,z+.202],[x+.025,seat+.23,z+.202],.012,'paper',.004);
  for(const dx of [-w*.35,w*.35])ellipsoid(piece,[x+dx,seat+.23,z+.204],[.009,.009,.004],'rust',6,4);
}
function recorder(piece, x, y, z, scale=1, withStrap=true) {
  const put=(offset,size,material)=>box(piece,[x+offset[0]*scale,y+offset[1]*scale,z+offset[2]*scale],size.map(v=>v*scale),material);
  put([0,.065,0],[.44,.13,.28],'black');
  put([0,.136,-.012],[.40,.012,.235],'steel');
  put([-.095,.145,-.065],[.135,.009,.042],'meter');
  put([.095,.145,-.07],[.07,.01,.055],'black');
  for(let k=0;k<4;k++)put([-.125+k*.065,.147,.075],[.032,.016,.04],k===3?'paper':'black');
  for(const dx of [-.13,.13]) cylinder(piece,[x+dx*scale,y+.15*scale,z+.008*scale],.033*scale,.012*scale,'black',10);
  for (const dx of [-.235,.235]) put([dx,.075,.025],[.018,.05,.11],'steel');
  put([0,.055,.156],[.19,.018,.025],'black');
  put([0,.079,-.145],[.405,.094,.011],'steel');
  put([-.105,.074,-.153],[.15,.053,.006],'black');
  for(let k=0;k<10;k++)put([-.168+k*.013,.074,-.158],[.007,.025,.003],k<7?'meter':'slate');
  for(let k=0;k<4;k++)put([.008+k*.046,.070,-.157],[.036,.037,.010],k===3?'rust':'black');
  for(const dx of [-.19,.19])for(const dy of [.043,.113])ellipsoid(piece,[x+dx*scale,y+dy*scale,z-.154*scale],[.004*scale,.004*scale,.002*scale],'black',6,4);
  const local=(p)=>[x+p[0]*scale,y+p[1]*scale,z+p[2]*scale];
  // Two physically modelled scratches form a repeated, recognisable scar.
  for(const [a,b] of [[[-.17,.143,-.08],[-.045,.143,.013]],[[-.157,.144,-.073],[-.058,.144,.023]]])beam(piece,local(a),local(b),.0018*scale,'paper',.001*scale);
  // An actual equipment legend belongs to the flat steel fascia. It is not a
  // row of letter-shaped rods, and reader-right on its -Z face is local -X.
  const printGroup=group(piece,'recorder-print'),uvStart=printGroup.uvs.length;
  quad(piece,'recorder-print',local([-.184,.108,-.158]),local([-.184,.126,-.158]),
    local([-.025,.126,-.158]),local([-.025,.108,-.158]));
  printGroup.uvs.splice(uvStart,12,1,1,1,0,0,0,1,1,0,0,0,1);
  const strap=[[-.23,.075,.025],[-.27,.018,.04],[-.25,.006,.21],[-.02,.006,.26],[.25,.007,.21],[.27,.025,.06],[.23,.075,.025]];
  if(withStrap)for(let i=1;i<strap.length;i++)beam(piece,local(strap[i-1]),local(strap[i]),.027*scale,'cloth',.006*scale);
}
function recordistWorkstation(piece) {
  chair(piece,0,.1,false,.47);
  // Raincoat folded over the chair back, with an empty hanging sleeve and a
  // heavy hem. It is independent of the pale shirt and dark waistcoat.
  const coatPoint=(u,v,back=false)=>[u*.53,.90-v*.68,.335+Math.sin(v*Math.PI)*.05+Math.cos(u*22)*.015+(back?.012:0)];
  for(let row=0;row<10;row++)for(let col=0;col<12;col++){
    const u=col/12-.5,v=row/10,du=1/12,dv=.1;
    quad(piece,'navy',coatPoint(u,v),coatPoint(u+du,v),coatPoint(u+du,v+dv),coatPoint(u,v+dv));
    quad(piece,'navy',coatPoint(u,v,true),coatPoint(u,v+dv,true),coatPoint(u+du,v+dv,true),coatPoint(u+du,v,true));
  }
  beam(piece,[-.23,.87,.34],[-.31,.61,.37],.08,'navy',.025);
  beam(piece,[-.31,.61,.37],[-.28,.34,.38],.075,'navy',.025);
  beam(piece,[-.26,.23,.347],[.26,.23,.347],.016,'cloth',.015);
  box(piece,[0,.775,-.48],[1.55,.085,.72],'wood');
  for(const x of[-.68,.68])for(const z of[-.76,-.20])beam(piece,[x,.01,z],[x,.775,z],.055,'steel');
  box(piece,[-.51,.822,-.49],[.29,.008,.37],'paper',.12);
  for(let i=0;i<5;i++)box(piece,[-.50,.829,-.61+i*.026],[.22-i*.018,.002,.003],'slate',.12);
  const lead=[[.24,.88,-.49],[.55,.825,-.52],[.76,.825,-.51],[.79,.38,-.45],[.84,.024,-.25],[.72,.024,.16],[.82,.024,.63]];
  for(let i=1;i<lead.length;i++)beam(piece,lead[i-1],lead[i],.012,'black');
}
function seatedBoy(piece,x=0,z=0,arms=true) {
  chair(piece,x,z,true);
  // Ordinary, fully lit child: rounded head, school jumper, socks and shoes.
  // The pose is small and quiet rather than the player's adult shadow asset.
  ellipsoid(piece,[x,.70,z+.01],[.155,.245,.105],'navy');
  box(piece,[x,.879,z-.015],[.18,.035,.12],'white');
  ellipsoid(piece,[x,.972,z-.024],[.107,.135,.10],'skin',12,8);
  ellipsoid(piece,[x,1.058,z-.008],[.111,.063,.105],'hair',12,5);
  ellipsoid(piece,[x,.964,z-.116],[.024,.024,.027],'skin',8,4);
  for(const s of [-1,1]) {
    if(arms){
    beam(piece,[x+s*.12,.83,z],[x+s*.19,.63,z-.05],.064,'navy');
    beam(piece,[x+s*.19,.63,z-.05],[x+s*.075,.59,z-.20],.052,'navy');
    ellipsoid(piece,[x+s*.075,.588,z-.21],[.034,.028,.048],'skin',8,4);
    }
    beam(piece,[x+s*.09,.46,z],[x+s*.12,.43,z-.25],.105,'cloth');
    beam(piece,[x+s*.12,.43,z-.25],[x+s*.12,.12,z-.29],.075,'cloth');
    box(piece,[x+s*.12,.065,z-.335],[.115,.10,.22],'black');
  }
}

function standingContractor(piece) {
  for(const side of [-1,1]) {
    beam(piece,[side*.12,.91,.04],[side*.13,.48,.045],.17,'navy');
    beam(piece,[side*.13,.48,.045],[side*.14,.12,.015],.12,'navy');
    box(piece,[side*.14,.07,-.05],[.19,.12,.30],'black');
  }
  ellipsoid(piece,[0,1.13,-.08],[.24,.35,.155],'cloth',12,8);
  box(piece,[.11,1.02,-.222],[.11,.17,.025],'navy');
  ellipsoid(piece,[-.035,1.57,-.18],[.135,.165,.125],'skin',12,8);
  ellipsoid(piece,[-.03,1.67,-.16],[.14,.075,.128],'hair',12,5);
  headphones(piece,[-.035,1.57,-.16]);
  box(piece,[0,1.41,-.04],[.23,.07,.17],'navy');
}

function roofGuarantor(piece) {
  // A single knee goes down; the right palm is planted on the roof glass.
  // This pose belongs only to the century-stay held tableau. The ordinary
  // contractor mesh remains upright elsewhere in the ending family.
  for (const [hip,knee,ankle,foot] of [
    [[-.12,.79,.10],[-.21,.45,-.29],[-.23,.14,-.21],[-.23,.065,-.30]],
    [[.12,.79,.10],[.20,.16,-.23],[.27,.14,.15],[.27,.065,.26]],
  ]) {
    beam(piece,hip,knee,.19,'navy');
    ellipsoid(piece,knee,[.09,.085,.09],'navy',10,6);
    beam(piece,knee,ankle,.13,'navy');
    box(piece,foot,[.19,.12,.30],'black');
  }
  ellipsoid(piece,[0,1.05,-.17],[.25,.34,.18],'cloth',12,8);
  box(piece,[.10,.96,-.326],[.11,.16,.025],'navy');
  box(piece,[0,1.34,-.12],[.23,.07,.17],'navy');
  cylinder(piece,[-.02,1.365,-.22],.066,.12,'skin',10);
  ellipsoid(piece,[-.035,1.47,-.31],[.135,.165,.125],'skin',12,8);
  ellipsoid(piece,[-.03,1.56,-.29],[.14,.075,.128],'hair',12,5);
  headphones(piece,[-.035,1.47,-.31]);
  ellipsoid(piece,[-.035,1.47,-.435],[.027,.035,.033],'skin',8,6);
  for (const side of [-1,1]) {
    ellipsoid(piece,[-.035+side*.045,1.505,-.424],[.014,.010,.008],'hair',6,4);
    beam(piece,[-.035+side*.027,1.524,-.42],[-.035+side*.071,1.520,-.413],.009,'hair');
  }
  // The free hand braces on a knee; only the splayed right hand carries the
  // player's chosen hold, in contact with the supported pane at floor height.
  for (const [shoulder,elbow,wrist] of [
    [[-.22,1.22,-.16],[-.36,.85,-.27],[-.24,.54,-.36]],
    [[.22,1.22,-.16],[.36,.67,-.47],[.52,.075,-.75]],
  ]) {
    ellipsoid(piece,shoulder,[.095,.13,.105],'cloth',10,6);
    beam(piece,shoulder,elbow,.13,'cloth',.12);
    ellipsoid(piece,elbow,[.075,.075,.07],'cloth',10,6);
    beam(piece,elbow,wrist,.10,'cloth',.09);
    ellipsoid(piece,wrist,[.057,.055,.048],'skin',10,6);
  }
  ellipsoid(piece,[.52,.030,-.79],[.075,.018,.087],'skin',12,6);
  for (let finger=0;finger<4;finger++) {
    const x=.43+finger*.057;
    beam(piece,[.52,.025,-.82],[x,.018,-.94+(finger===0||finger===3 ? .035 : 0)],.021,'skin',.014);
  }
  ellipsoid(piece,[.42,.028,-.73],[.025,.014,.050],'skin',8,5);
  // Garment seams and the headphones keep the low silhouette recognizably
  // the same living contractor under the roof's dark dither treatment.
  beam(piece,[-.18,1.25,.045],[0,1.21,.073],.014,'navy',.009);
  beam(piece,[0,1.21,.073],[.18,1.25,.045],.014,'navy',.009);
  beam(piece,[0,1.20,.077],[0,.86,.072],.010,'slate',.008);
}

function articulatedHand(piece, gripping=false) {
  ellipsoid(piece,[0,0,.039],[.039,.017,.043],'skin',10,6);
  box(piece,[0,-.002,-.008],[.066,.036,.028],'navy');
  for(let i=0;i<4;i++) {
    const x=-.027+i*.018, length=[.039,.048,.045,.034][i];
    const knuckle=[x,.001,.066],joint=[x,.006,.066+length*.56],tip=[x,gripping?.029:-.005,.066+length];
    beam(piece,knuckle,joint,.012,'skin',.014);beam(piece,joint,tip,.011,'skin',.012);
    ellipsoid(piece,joint,[.007,.008,.007],'skin',6,4);
  }
  beam(piece,[-.034,0,.027],[-.055,.005,.051],.017,'skin');
  beam(piece,[-.055,.005,.051],[-.046,gripping?.024:.007,.076],.014,'skin');
}

function hallRoof(piece) {
  for(const z of [-9,-3,7,15,20])for(const side of [-1,1]) {
    beam(piece,[side*10.9,4.12,z],[side*2.9,6.51,z],.14,'dark',.21);
    beam(piece,[side*10.9,4.12,z],[side*8.5,4.12,z],.12,'wood');
    beam(piece,[side*8.5,4.14,z],[side*6.6,5.37,z],.09,'wood');
    box(piece,[side*10.5,4.27,z],[.72,.10,.45],'snow');
  }
  for(const [side,z0,z1,inner] of [[-1,-10,-4,7],[-1,10,20,6.2],[1,-10,1,7.8],[1,13,20,7]]) {
    const x0=side*10.95,x1=side*inner,y0=4.20,y1=4.20+(10.95-inner)*.299;
    const a=[x0,y0,z0],b=[x1,y1,z0],c=[x1,y1,z1],d=[x0,y0,z1];
    quad(piece,'slate',a,b,c,d);quad(piece,'slate',d,c,b,a);
    beam(piece,a,b,.11,'wood');beam(piece,d,c,.11,'wood');
    for(let z=z0+.5;z<z1;z+=1.2)beam(piece,[x0,y0+.025,z],[x1,y1+.025,z],.025,'steel');
  }
  beam(piece,[-10.7,4.2,4],[-4.8,5.99,4.35],.12,'dark');
  beam(piece,[10.6,4.2,3],[5.8,5.64,3.5],.10,'dark');
  for(const side of [-1,1])beam(piece,[side*10.9,4.12,-10.5],[side*10.9,4.12,20.5],.18,'wood');
}

function slackTape(piece,hanging=false) {
  const points=Array.from({length:65},(_,i)=>{const t=i/64;return [12*t-6,hanging?4.05-1.5*Math.sin(Math.PI*t):.025+.04*Math.sin(t*9)**8,.14*Math.sin(t*8)+.035*Math.sin(t*21)];});
  for(let i=1;i<points.length;i++)beam(piece,points[i-1],points[i],hanging?.13:.09,'tape',.012);
}

function ashWindow(piece) {
  for(const side of [-1,1])box(piece,[side*2.08,1.7,0],[1.04,3.4,.24],'plaster');
  box(piece,[0,.45,0],[3.12,.9,.24],'green');box(piece,[0,3.12,0],[3.12,.56,.24],'plaster');
  for(const x of [-1.52,0,1.52])box(piece,[x,1.91,.02],[.07,1.95,.12],'white');
  for(const y of [.94,2.86])box(piece,[0,y,.02],[3.12,.075,.12],'white');
  box(piece,[-.74,1.5,-.04],[1.45,.026,.025],'steel');
  box(piece,[0,.96,.12],[3.36,.10,.42],'wood');
  for(const x of [-2.38,2.3])beam(piece,[x,.1,.15],[x,2.8,.15],.035,'steel');
}

function workCase(piece) {
  box(piece,[0,.23,0],[.78,.46,.47],'black');
  for(const x of [-.36,.36])for(const z of [-.215,.215])box(piece,[x,.23,z],[.025,.46,.025],'steel');
  for(const y of [.035,.405])box(piece,[0,y,0],[.80,.025,.49],'steel');
  for(const x of [-.22,.22])box(piece,[x,.37,-.247],[.055,.08,.017],'steel');
  box(piece,[0,.24,-.248],[.18,.10,.015],'paper');
  beam(piece,[-.09,.47,0],[-.09,.52,0],.024,'black');beam(piece,[.09,.47,0],[.09,.52,0],.024,'black');beam(piece,[-.09,.52,0],[.09,.52,0],.024,'black');
}

function console(piece) {
  box(piece,[0,.51,0],[1.55,1.02,.60],'steel');
  box(piece,[0,.86,-.32],[1.39,.27,.035],'black');
  for(let i=0;i<3;i++)box(piece,[-.44+i*.44,.90,-.342],[.29,.11,.01],'meter');
  for(let i=0;i<7;i++)box(piece,[-.57+i*.19,.61,-.337],[.065,.065,.035],'black');
  for(let i=0;i<9;i++)box(piece,[-.62+i*.15,.24,-.317],[.09,.016,.012],'slate');
  for(const x of [-.72,.72])box(piece,[x,.06,0],[.09,.12,.64],'black');
}

function practicalLamp(piece) {
  cylinder(piece,[0,.035,0],.16,.07,'black',16);
  beam(piece,[0,.05,0],[.04,.42,.02],.028,'steel');beam(piece,[.04,.42,.02],[-.12,.67,-.12],.027,'steel');
  ellipsoid(piece,[-.14,.66,-.15],[.13,.075,.15],'steel',12,6);
  ellipsoid(piece,[-.14,.625,-.15],[.10,.014,.12],'warm',12,4);
}

function portalLeaf(piece) {
  box(piece,[.625,.71,0],[1.25,1.42,.075],'green');box(piece,[.625,2.275,0],[1.25,.35,.075],'green');
  for(const x of [.055,1.195])box(piece,[x,1.76,0],[.11,.68,.075],'wood');
  for(const y of [1.45,2.05])box(piece,[.625,y,0],[1.25,.075,.085],'wood');
  for(let x=.23;x<1.15;x+=.15)box(piece,[x,1.76,0],[.014,.57,.022],'steel');
  box(piece,[1.08,.95,-.055],[.035,.16,.04],'steel');
  for(const y of [.28,1.32,2.18])box(piece,[.012,y,-.055],[.045,.14,.035],'rust');
}

function groundRidge(piece,material) {
  // Low accumulated ground with a rounded, uneven crest. Its first 35cm are
  // an actual steep bank, matching the body's refusal at the support edge.
  const profile=[[-.45,0],[-.45,.40],[-.34,.68],[-.18,.86],[.02,.94],[.25,.86],[.44,.61],[.45,0]];
  const rings=[[-.5,.91],[-.20,1.03],[.15,.96],[.5,1.0]].map(([z,factor])=>profile.map(([x,y])=>[x,y*factor,z]));
  for(let j=1;j<rings.length;j++)for(let i=0;i<profile.length;i++)quad(piece,material,rings[j-1][i],rings[j][i],rings[j][(i+1)%profile.length],rings[j-1][(i+1)%profile.length]);
  for(const [ring,reverse]of[[rings[0],true],[rings.at(-1),false]])for(let i=1;i<ring.length-1;i++){
    if(reverse)triangle(piece,material,ring[0],ring[i+1],ring[i]);else triangle(piece,material,ring[0],ring[i],ring[i+1]);
  }
}
function headphones(piece,center) {
  for(const side of [-1,1]) {
    ellipsoid(piece,[center[0]+side*.15,center[1],center[2]],[.042,.068,.058],'black',10,6);
    box(piece,[center[0]+side*.185,center[1],center[2]],[.012,.058,.048],'steel');
  }
  for(let k=0;k<10;k++) {
    const point=i=>[center[0]+Math.cos(i*Math.PI/10)*.166,center[1]+Math.sin(i*Math.PI/10)*.194,center[2]+.012];
    beam(piece,point(k),point(k+1),.023,'black',.031);
  }
}
function workingRecordist(piece) {
  chair(piece,0,.42);
  // The contractor is bigger than the boy, in a worn working coat. The player
  // approaches the back of the chair (+Z); their face remains aimed at the take.
  ellipsoid(piece,[0,.84,.30],[.245,.36,.16],'cloth',12,8);
  box(piece,[0,.585,.30],[.43,.12,.33],'navy');
  ellipsoid(piece,[0,1.238,.18],[.135,.168,.125],'skin',12,8);
  ellipsoid(piece,[0,1.342,.202],[.138,.077,.125],'hair',12,5);
  headphones(piece,[0,1.237,.202]);
  box(piece,[0,1.13,.244],[.23,.07,.17],'navy');
  for(const s of [-1,1]) {
    beam(piece,[s*.19,1.045,.26],[s*.30,.86,-.03],.13,'cloth');
    beam(piece,[s*.30,.86,-.03],[s*.145,.835,-.34],.105,'cloth');
    ellipsoid(piece,[s*.145,.835,-.365],[.053,.033,.075],'skin',8,5);
    beam(piece,[s*.11,.49,.35],[s*.17,.47,.00],.15,'navy');
    beam(piece,[s*.17,.47,0],[s*.17,.12,-.04],.105,'navy');
    box(piece,[s*.17,.065,-.105],[.17,.11,.29],'black');
  }
  box(piece,[0,.775,-.48],[1.55,.085,.72],'wood');
  for(const x of [-.68,.68])for(const z of [-.76,-.20])box(piece,[x,.38,z],[.055,.76,.055],'steel');
  box(piece,[-.50,.66,-.45],[.40,.13,.55],'dark');
  recorder(piece,.04,.825,-.49,.9);
  box(piece,[-.50,.823,-.56],[.30,.007,.22],'paper',.12);
  for(let i=0;i<5;i++)box(piece,[-.50,.829,-.61+i*.026],[.22-i*.018,.002,.003],'slate',.12);
  const lead=[[.22,.87,-.46],[.46,.84,-.51],[.76,.815,-.51],[.79,.38,-.45],[.84,.024,-.25],[.72,.024,.16],[.82,.024,.63]];
  for(let i=1;i<lead.length;i++)beam(piece,lead[i-1],lead[i],.012,'black');
}
function handover(piece) {
  seatedBoy(piece,-.58,-.07);
  const x=.38,z=.05;
  for(const s of [-1,1]) {
    beam(piece,[x+s*.12,.90,z],[x+s*.13,.48,z+.01],.17,'navy');
    beam(piece,[x+s*.13,.48,z+.01],[x+s*.14,.12,z-.015],.12,'navy');
    box(piece,[x+s*.14,.07,z-.08],[.19,.12,.30],'black');
  }
  ellipsoid(piece,[x,1.175,z],[.24,.36,.155],'cloth',12,8);
  ellipsoid(piece,[x-.055,1.636,z-.065],[.135,.165,.125],'skin',12,8);
  ellipsoid(piece,[x-.050,1.738,z-.043],[.14,.075,.128],'hair',12,5);
  headphones(piece,[x-.055,1.635,z-.043]);
  box(piece,[x,1.46,z+.035],[.23,.07,.17],'navy');
  beam(piece,[x-.19,1.36,z],[x-.35,1.10,z-.12],.13,'cloth');
  beam(piece,[x-.35,1.10,z-.12],[-.24,.85,-.28],.10,'cloth');
  ellipsoid(piece,[-.26,.85,-.29],[.055,.034,.075],'skin',8,5);
  beam(piece,[x+.19,1.36,z],[x+.25,1.08,z-.10],.13,'cloth');
  beam(piece,[x+.25,1.08,z-.10],[.04,.85,-.28],.10,'cloth');
  ellipsoid(piece,[.015,.85,-.29],[.055,.034,.075],'skin',8,5);
  // The machine is an independent tower_personal_recorder instance. The
  // runtime moves it from these offered hands into the boy's lap while both
  // bodies remain in the room; it is never duplicated in this mesh.
}

function tapeLead(piece) {
  // A single unbroken 1/4-inch strand broadens just enough for the game's
  // acquisition pass. The turns are deliberate, not a field of collectibles.
  const points=Array.from({length:81},(_,i)=>{
    const t=i/80;return [Math.sin(t*13)*.14+Math.sin(t*29)*.055,.016+Math.pow(Math.sin(t*17),14)*.055,-12*t];
  });
  for(let i=1;i<points.length;i++)beam(piece,points[i-1],points[i],.018,'tape',.007);
  // The turn at the chair gives the very thin strand a recognisable loose end.
  for(let i=0;i<28;i++) {
    const a=i*Math.PI*2/28,b=(i+1)*Math.PI*2/28;
    beam(piece,[.28+Math.cos(a)*.28,.018,Math.sin(a)*.15],[.28+Math.cos(b)*.28,.018,Math.sin(b)*.15],.018,'tape',.007);
  }
}
function mast(piece) {
  const widthAt=y=>.95-y*.055;
  const leg=(x,z,y)=>[x*widthAt(y),y,z*widthAt(y)];
  for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
    beam(piece,leg(x,z,0),leg(x,z,10),.085,'steel');
    box(piece,[x*.95,.07,z*.95],[.38,.14,.38],'plaster');
  }
  for(let y=0;y<10;y+=1.25)for(const [a,b] of [[[1,1],[-1,1]],[[-1,1],[-1,-1]],[[-1,-1],[1,-1]],[[1,-1],[1,1]]]) {
    beam(piece,leg(...a,y),leg(...b,y+1.25),.035,'steel');
    beam(piece,leg(...a,y+1.25),leg(...b,y),.035,'steel');
    beam(piece,leg(...a,y),leg(...b,y),.045,'steel');
  }
  beam(piece,[0,9.7,0],[0,11.2,0],.055,'steel');
  for(const y of [8.1,8.6,9.1])beam(piece,[-.65,y,0],[.65,y,0],.025,'steel');
  box(piece,[.55,6.4,0],[.15,.65,.55],'white');
  box(piece,[0,.52,1.07],[.64,.85,.28],'steel');
  box(piece,[0,.55,1.225],[.52,.67,.02],'slate');
  box(piece,[.18,.55,1.245],[.025,.14,.035],'black');
  beam(piece,[0,4,.85],[0,.15,.96],.024,'black');
  box(piece,[0,10.025,0],[.18,.07,.18],'black');
}
function flake(piece,material) {
  const points=[[-.013,-.005,0],[-.005,-.012,.001],[.010,-.008,0],[.012,.005,-.001],[.002,.013,0],[-.011,.008,.001]];
  for(let i=0;i<points.length;i++) {
    triangle(piece,material,[0,0,0],points[i],points[(i+1)%points.length]);
    triangle(piece,material,[0,0,0],points[(i+1)%points.length],points[i]);
  }
}
function serviceWindow(piece) {
  box(piece,[-1.29,1.50,0],[.42,3.0,.30],'plaster');
  box(piece,[1.29,1.50,0],[.42,3.0,.30],'plaster');
  box(piece,[0,2.80,0],[2.2,.40,.30],'plaster');
  box(piece,[0,.47,0],[2.2,.94,.30],'green');
  box(piece,[0,.99,-.04],[2.3,.12,.52],'wood');
  for(const x of [-1.05,1.05])box(piece,[x,1.87,0],[.065,1.72,.065],'white');
  for(const y of [1.04,2.66])box(piece,[0,y,0],[2.16,.065,.065],'white');
  for(let x=-.88;x<1;x+=.22)box(piece,[x,1.86,-.04],[.018,1.55,.018],'steel');
  box(piece,[0,1.83,-.075],[2.04,.025,.025],'steel');
  // Opaque failed radio panel below the empty, barred view of the mast.
  box(piece,[-.44,1.07,.20],[.76,.18,.44],'black');
  box(piece,[-.44,1.165,.19],[.69,.012,.36],'steel');
  for(const x of [-.67,-.24])cylinder(piece,[x,1.18,.20],.045,.018,'black',10);
  box(piece,[-.44,1.18,.07],[.20,.015,.06],'paper');
  for(let k=0;k<6;k++)box(piece,[.25+k*.052,1.175,.20],[.016,.012,.22],'slate');
  const cable=[[.62,1.12,.14],[.90,1.04,.20],[1.13,.86,.16],[1.15,.28,.16],[1.00,.024,.31]];
  for(let i=1;i<cable.length;i++)beam(piece,cable[i-1],cable[i],.018,'black');
}

let cachedGeometry;
export function towerPersonalGeometry() {
  if(cachedGeometry)return cachedGeometry;
  const definitions = [
    ['tower_personal_boy',piece=>seatedBoy(piece)],
    ['tower_personal_recordist_working',workingRecordist],
    ['tower_personal_handover',handover],
    ['tower_personal_tape_lead',tapeLead],
    ['tower_personal_mast',mast],
    ['tower_personal_service_window',serviceWindow],
    ['tower_personal_recorder',piece=>recorder(piece,0,0,0,1,false)],
    ['tower_personal_child_chair',piece=>chair(piece,0,0,true,.445)],
    ['tower_personal_workstation',recordistWorkstation],
    ['tower_personal_strap_segment',piece=>beam(piece,[0,0,0],[0,0,1],.027,'cloth',.006)],
    ['tower_personal_headphone_cable',piece=>beam(piece,[0,0,0],[0,0,1],.007,'black')],
    ['tower_personal_snowflake',piece=>flake(piece,'white')],
    ['tower_personal_ashflake',piece=>flake(piece,'ash')],
    ['tower_personal_mast_beacon',piece=>{box(piece,[0,.055,0],[.13,.11,.13],'paper');box(piece,[0,.12,0],[.19,.025,.19],'black');for(const x of [-.075,.075])for(const z of [-.075,.075])beam(piece,[x,0,z],[x,.12,z],.012,'steel');}],
    ['tower_personal_lock_bolt',piece=>{box(piece,[0,0,0],[.55,.065,.08],'steel');for(const x of [-.17,.17])box(piece,[x,0,.045],[.09,.09,.035],'black');box(piece,[.20,0,.078],[.035,.11,.035],'steel');}],
    ['tower_personal_tape_reel',tapeReel],
    ['tower_personal_boy_body',piece=>seatedBoy(piece,0,0,false)],
    ['tower_personal_contractor_standing',standingContractor],
    ['ending_roof_guarantor',roofGuarantor],
    ['tower_personal_upper_arm',piece=>beam(piece,[0,0,0],[0,0,1],.13,'cloth',.12)],
    ['tower_personal_forearm',piece=>beam(piece,[0,0,0],[0,0,1],.10,'cloth',.095)],
    ['tower_personal_hand_open',piece=>articulatedHand(piece,false)],
    ['tower_personal_hand_support',piece=>articulatedHand(piece,true)],
    ['tower_personal_hall_roof',hallRoof],
    ['tower_personal_tape_hanging',piece=>slackTape(piece,true)],
    ['tower_personal_tape_slack',piece=>slackTape(piece,false)],
    ['tower_personal_ash_window',ashWindow],
    ['tower_personal_work_case',workCase],
    ['tower_personal_broadcast_console',console],
    ['tower_personal_practical_lamp',practicalLamp],
    ['tower_personal_portal_leaf',portalLeaf],
    ['tower_personal_portal_jamb',piece=>{box(piece,[0,1.3,0],[.15,2.6,.22],'wood');box(piece,[0,1.3,-.116],[.06,2.6,.014],'white');}],
    ['tower_personal_portal_head',piece=>{box(piece,[0,0,0],[3,.18,.26],'wood');box(piece,[0,-.04,-.14],[2.7,.035,.025],'white');}],
    ['tower_personal_threshold',piece=>{box(piece,[0,.012,0],[3.0,.024,.66],'steel');for(const x of [-1.2,0,1.2])box(piece,[x,.026,0],[.012,.003,.62],'black');}],
    ['tower_personal_wall_panel',piece=>{box(piece,[0,1.6,0],[1,3.2,.22],'plaster');box(piece,[0,.41,-.125],[1,.82,.025],'green');}],
    ['tower_personal_roof_panel',piece=>box(piece,[0,0,0],[1,.15,1],'slate')],
    ['tower_personal_hall_radiator',piece=>{for(let i=0;i<12;i++)box(piece,[-.7+i*.13,.55,0],[.075,.72,.14],'white');beam(piece,[-.85,.24,0],[.85,.24,0],.06,'steel');beam(piece,[-.85,.85,0],[.85,.85,0],.06,'steel');}],
    ['tower_personal_shelf',piece=>{for(const x of [-.58,.58])box(piece,[x,1.15,0],[.065,2.3,.36],'wood');for(const y of [.08,.75,1.45,2.2])box(piece,[0,y,0],[1.2,.055,.4],'wood');for(let i=0;i<8;i++)box(piece,[-.46+i*.12,1.04,-.03],[.075,.50,.25],i%3?'black':'paper');}],
    ['tower_personal_ash_pile',piece=>{for(const [x,y,z,rx,ry,rz]of [[0,.08,0,.8,.13,.6],[-.35,.12,.15,.55,.19,.35],[.37,.06,-.19,.44,.10,.45]])ellipsoid(piece,[x,y,z],[rx,ry,rz],'ash',12,5);box(piece,[-.2,.16,0],[.55,.07,.16],'dark',.28,.13);}],
    ['tower_personal_settled_snow',piece=>{ellipsoid(piece,[0,.08,0],[1,.10,.65],'snow',16,6);ellipsoid(piece,[-.48,.11,.16],[.55,.12,.4],'snow',12,5);}],
    ['tower_personal_bell_pair',piece=>{beam(piece,[-.42,.48,0],[.42,.48,0],.05,'steel');for(const [x,r]of [[-.24,.14],[.24,.11]]){beam(piece,[x,.48,0],[x,.28,0],.025,'steel');ellipsoid(piece,[x,.18,0],[r,.18,r],'steel',14,6);cylinder(piece,[x,.04,0],r*1.04,.035,'black',14);ellipsoid(piece,[x,.018,0],[.025,.035,.025],'steel',8,4);}}],
    ['tower_personal_lamp_stand',piece=>{beam(piece,[0,.08,0],[0,1.88,0],.032,'steel');for(let i=0;i<3;i++){const a=i*Math.PI*2/3;beam(piece,[0,.18,0],[Math.cos(a)*.34,.025,Math.sin(a)*.34],.025,'steel');}box(piece,[0,1.32,0],[.07,.11,.07],'black');}],
    ['tower_personal_earth_ridge',piece=>groundRidge(piece,'earth')],
    ['tower_personal_ash_ridge',piece=>groundRidge(piece,'ash')],
  ];
  cachedGeometry=definitions.map(([name,build])=>{
    const piece=shape(name);build(piece);
    const groups=[...piece.groups.values()];
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const g of groups)for(let i=0;i<g.positions.length;i++) {const axis=i%3;min[axis]=Math.min(min[axis],g.positions[i]);max[axis]=Math.max(max[axis],g.positions[i]);}
    return {name,groups,bounds:{min,max},cullRadius:Math.hypot(...[0,1,2].map(axis=>Math.max(Math.abs(min[axis]),Math.abs(max[axis]))))};
  });
  return cachedGeometry;
}

export function installTowerPersonalMeshes(gl,pack) {
  if(!gl||!pack?.catalog)return [];
  const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const names=[];
  for(const piece of towerPersonalGeometry()) {
    names.push(piece.name);if(pack.catalog.has(piece.name))continue;
    const instanceBuffer=gl.createBuffer(),primitives=[];
    for(const source of piece.groups) {
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);
      const bind=(location,data,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
      bind(0,source.positions,3);bind(1,source.normals,3);bind(2,source.uvs,2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(source.indices),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
      const stride=PROP_INSTANCE_FLOATS*4;
      for(let column=0;column<4;column++){
        const location=3+column;gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,4,gl.FLOAT,false,stride,column*16);gl.vertexAttribDivisor(location,1);
      }
      for(const [location,size,offset]of PROP_INSTANCE_BINDINGS){
        gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride,offset);gl.vertexAttribDivisor(location,1);
      }
      gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
      const material=MATERIALS[source.material];
      const printMaps=source.material==='recorder-print'?recorderPrintTexture(gl):null;
      primitives.push({vao,count:source.indices.length,indexType:gl.UNSIGNED_INT,base:material.base,emissive:material.emissive||[0,0,0],texture:printMaps?.texture||null,normalTexture:printMaps?.normalTexture||null,letteringFinish:printMaps?.letteringFinish||null,materialFactors:printMaps?'gltf':undefined,ormTexture:printMaps?.ormTexture||null,metallic:material.metallic||0,roughness:material.roughness,aoStrength:0,portrait:false,alphaCut:0,materialName:material.name,materialRole:'tower-personal-prop',printedSurface:source.material==='recorder-print'?TOWER_RECORDER_PRINT.printedSurface:null});
    }
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity,instanceBuffer,extras:{towerPersonal:true,bounds:piece.bounds},primitives});
  }
  gl.bindVertexArray(null);return names;
}
