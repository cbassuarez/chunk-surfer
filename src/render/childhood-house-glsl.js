// A whole house behind the last clear pane. Its geometry is static; weather and
// attention belong to the whiteout scene around it.
import { HOME_HOUSE } from '../data/childhood-house.js';

const f = (n) => Number.isInteger(n) ? `${n}.0` : String(n);
const v = (values) => `vec3(${values.map(f).join(',')})`;
const box = (bounds) => {
  const axes = ['x', 'y', 'z'];
  return { centre: axes.map((a) => (bounds[`${a}0`] + bounds[`${a}1`]) / 2),
    half: axes.map((a) => (bounds[`${a}1`] - bounds[`${a}0`]) / 2) };
};
const h = HOME_HOUSE, cx = (h.x0 + h.x1) / 2, cz = h.roof.ridgeZ;
const hw = (h.x1 - h.x0) / 2, hd = (h.z1 - h.z0) / 2;
const slope = (h.ridge - h.eaves) / hd, slopeNormal = Math.hypot(1, slope);
const body = box({ x0: h.x0, x1: h.x1, y0: h.bottom, y1: h.eaves, z0: h.z0, z1: h.z1 });
const room = box(h.bedroomVoid);
const pane = box({ x0: h.clearPane.x - h.clearPane.halfWidth, x1: h.clearPane.x + h.clearPane.halfWidth,
  y0: h.clearPane.bottom, y1: h.clearPane.top, z0: h.clearPane.z0, z1: h.clearPane.z1 });
const orientation = { front: 0, back: 1, left: 2, right: 3 };
const face = (item) => `hhFace(p,${v([item.x, item.y, item.z])},${f(orientation[item.face])})`;

export const CHILDHOOD_HOUSE_GLSL = `
const vec2 hhCentre=vec2(${f(cx)},${f(cz)});
const float hhRoofSlope=${f(slope)},hhSlopeNormal=${f(slopeNormal)};
void hhUnion(float piece,float tag,inout float d,inout float material){if(piece<d){d=piece;material=tag;}}
vec3 hhFace(vec3 p,vec3 centre,float side){
  vec3 q=p-centre;
  if(side<.5)return vec3(q.x,q.y,-q.z);
  if(side<1.5)return q;
  if(side<2.5)return vec3(q.z,q.y,-q.x);
  return vec3(q.z,q.y,q.x);
}
float hhRoofHeight(float z){return ${f(h.ridge)}-hhRoofSlope*abs(z-${f(cz)});}

// Closed cold glazing sits behind a real reveal. Only the bedroom is lit.
float hhClosedWindow(vec3 q,vec2 size,out float material){
  float d=1e5,s;material=43.0;
  s=min(ewBox(q-vec3(-size.x+.025,0.0,-.035),vec3(.035,size.y,.075)),ewBox(q-vec3(size.x-.025,0.0,-.035),vec3(.035,size.y,.075)));
  s=min(s,min(ewBox(q-vec3(0.0,-size.y+.025,-.035),vec3(size.x,.035,.075)),ewBox(q-vec3(0.0,size.y-.025,-.035),vec3(size.x,.035,.075))));
  s=min(s,ewBox(q-vec3(-.045,0.0,-.070),vec3(.024,size.y-.035,.045)));
  s=min(s,ewBox(q-vec3(0.0,.20,-.070),vec3(size.x-.035,.022,.045)));
  hhUnion(s,43.0,d,material);
  hhUnion(ewBox(q-vec3(0.0,0.0,-.145),vec3(size.x-.035,size.y-.035,.017)),44.0,d,material);
  hhUnion(ewBox(q-vec3(0.0,-size.y-.045,.025),vec3(size.x+.075,.045,.14)),40.0,d,material);
  hhUnion(ewBox(q-vec3(-.025,-size.y+.012,.045),vec3(size.x+.065,.015,.11)),46.0,d,material);
  return d;
}

float ewHouseMap(vec3 p,float t,out float material){
  material=40.0;
  // Near evaluation begins before this enclosing volume can be a visible hit.
  float bound=ewBox(p-vec3(${f(cx)},1.08,${f(cz)}),vec3(${f(hw + h.roof.overhang + .12)},3.94,${f(hd + h.roof.overhang + .12)}));
  if(bound>.45)return bound;
  float d=ewBox(p-${v(body.centre)},${v(body.half)}),s,wm,wd;
  float gable=max(max(abs(p.x-${f(cx)})-${f(hw)},abs(p.z-${f(cz)})-${f(hd)}),max(${f(h.eaves)}-p.y,(p.y-hhRoofHeight(p.z))/hhSlopeNormal));
  d=min(d,gable);
  d=max(d,-ewBox(p-${v(room.centre)},${v(room.half)}));
  d=max(d,-ewBox(p-${v(pane.centre)},${v(pane.half)}));
${h.secondaryWindows.map((item, i) => `  vec3 w${i}=${face(item)};
  d=max(d,-ewBox(w${i}-vec3(0.0,0.0,-.10),vec3(${f(item.halfWidth)},${f(item.halfHeight)},.24)));`).join('\n')}
  vec3 door=${face(h.lowerDoor)};
  d=max(d,-ewBox(door-vec3(0.0,0.0,-.10),vec3(${f(h.lowerDoor.halfWidth)},${f(h.lowerDoor.halfHeight)},.24)));
  material=p.y<-.32?41.0:40.0;

  // Slate covers two measured roof planes, a projecting verge and a ridge.
  s=max(max(abs(p.x-${f(cx)})-${f(hw + h.roof.overhang)},abs(p.z-${f(cz)})-${f(hd + h.roof.overhang)}),abs(p.y-hhRoofHeight(p.z))/hhSlopeNormal-${f(h.roof.thickness / 2)});
  hhUnion(s,42.0,d,material);
  s=max(length(vec2(p.y-${f(h.ridge)},p.z-${f(cz)}))-.105,abs(p.x-${f(cx)})-${f(hw + h.roof.overhang)});
  hhUnion(s,42.0,d,material);
  // Retained snow leaves broad slate areas legible, with an uneven eaves lip.
  float roofSnow=abs(p.y-hhRoofHeight(p.z)-.105)/hhSlopeNormal-.045;
  s=max(roofSnow,max(abs(p.x-1.12)-3.13,abs(p.z-70.04)-(.34+.035*sin(p.x*2.7))));
  hhUnion(s*.96,46.0,d,material);
  s=max(roofSnow,max(abs(p.x-2.92)-1.83,abs(p.z-77.01)-(.51+.04*sin(p.x*2.1))));
  hhUnion(s*.96,46.0,d,material);

  // A continuous masonry stack stands above the room's chimney breast.
  s=ewBox(p-vec3(${f(h.chimney.x)},${f((h.eaves + h.chimney.top) / 2)},${f(h.chimney.z)}),vec3(${f(h.chimney.halfX)},${f((h.chimney.top - h.eaves) / 2)},${f(h.chimney.halfZ)}));
  hhUnion(s,41.0,d,material);
  hhUnion(ewBox(p-vec3(${f(h.chimney.x)},${f(h.chimney.top + .04)},${f(h.chimney.z)}),vec3(.34,.055,.40)),40.0,d,material);
  vec3 pots=p-vec3(${f(h.chimney.x)},${f(h.chimney.top + .25)},${f(h.chimney.z)});
  pots.x=abs(pots.x)-.12;
  hhUnion(max(length(pots.xz)-.079,abs(pots.y)-.21),41.0,d,material);
  hhUnion(max(length(pots.xz)-.053,abs(pots.y-.211)-.004),44.0,d,material);

  // Open gutter channels and ordinary downpipes complete the roof's scale.
  vec3 gutter=p-vec3(${f(cx)},2.60,${f(cz)});gutter.z=abs(gutter.z)-${f(hd + .265)};
  s=ewBox(gutter,vec3(${f(hw + .24)},.068,.069));
  s=max(s,-ewBox(gutter-vec3(0.0,.042,0.0),vec3(${f(hw + .22)},.050,.045)));
  hhUnion(s,45.0,d,material);
  s=ewCapsule(p,vec3(5.15,2.61,69.735),vec3(5.15,2.40,69.91),.038);
  s=min(s,ewCapsule(p,vec3(5.15,2.40,69.91),vec3(5.15,-.86,69.91),.038));
  s=min(s,ewCapsule(p,vec3(-1.98,2.60,77.665),vec3(-1.98,-.80,77.55),.038));
  hhUnion(s,45.0,d,material);

${h.secondaryWindows.map((item, i) => `  wd=hhClosedWindow(w${i},vec2(${f(item.halfWidth)},${f(item.halfHeight)}),wm);hhUnion(wd,wm,d,material);`).join('\n')}
  // Only the top of this closed lower-storey door escapes the side drift.
  s=ewBox(door-vec3(0.0,0.0,-.145),vec3(${f(h.lowerDoor.halfWidth - .04)},${f(h.lowerDoor.halfHeight - .035)},.025));
  s=min(s,min(ewBox(door-vec3(-.43,0.0,-.035),vec3(.036,1.025,.075)),ewBox(door-vec3(.43,0.0,-.035),vec3(.036,1.025,.075))));
  s=min(s,ewBox(door-vec3(0.0,1.025,-.035),vec3(.465,.04,.075)));
  hhUnion(s,43.0,d,material);
  // This outer sill joins the accepted deep reveal without entering its glass.
  hhUnion(ewBox(p-vec3(${f(h.clearPane.x)},${f(h.clearPane.bottom - .07)},69.96),vec3(${f(h.clearPane.halfWidth + .12)},.055,.15)),40.0,d,material);
  hhUnion(ewBox(p-vec3(${f(h.clearPane.x - .04)},${f(h.clearPane.bottom - .002)},69.93),vec3(${f(h.clearPane.halfWidth + .10)},.015,.10)),46.0,d,material);
  return d;
}

void ewHouseMaterial(vec3 p,vec3 n,float m,out vec3 albedo,out vec3 ambient,out vec3 emit){
  float along=abs(n.x)>.5?p.z:p.x;
  float wear=ewNoise(vec2(along*11.0,p.y*13.0));
  albedo=vec3(.55,.54,.49)*(.95+.05*wear);
  // Broad light from the snow keeps pale roughcast above slate and glazing in
  // the engraving's tonal bands. The house has no emitting exterior surfaces.
  ambient=vec3(.64,.68,.72);emit=vec3(0.0);
  if(m<40.5){
    float damp=(1.0-smoothstep(-.1,.45,p.y))*(.75+.25*ewNoise(vec2(along*2.4,0.0)));
    float run=smoothstep(1.5,2.65,p.y)*smoothstep(.62,.88,ewNoise(vec2(along*4.0,1.0)));
    albedo*=1.0-.15*damp-.07*run;
  }else if(m<41.5){
    float row=floor((p.y+2.8)/.082);
    vec2 brick=vec2(along+.12*mod(row,2.0),p.y+2.8);
    float joints=min(abs(mod(brick.x,.24)-.12),abs(mod(brick.y,.082)-.041));
    float mortar=1.0-smoothstep(.004,.010,joints);
    float variation=ewNoise(vec2(floor(brick.x/.24),row));
    albedo=mix(vec3(.33,.25,.21)*(.90+.12*variation),vec3(.44,.43,.39),mortar*.62);
  }else if(m<42.5){
    float rise=abs(p.z-${f(cz)})*hhSlopeNormal,row=floor(rise/.22);
    float joint=min(abs(mod(p.x+.18*mod(row,2.0),.36)-.18),abs(mod(rise,.22)-.11));
    float seams=1.0-smoothstep(.004,.011,joint);
    albedo=vec3(.14,.17,.19)*(.90+.10*ewNoise(vec2(floor(p.x/.36),row)))*(1.0-.22*seams);
  }else if(m<43.5){albedo=vec3(.42,.45,.42)*(.91+.09*wear);}
  else if(m<44.5){albedo=vec3(.065,.085,.105);ambient=vec3(.28,.35,.42);}
  else if(m<45.5){albedo=vec3(.16,.18,.19);}
  else {albedo=vec3(.80,.85,.89);ambient=vec3(.43,.49,.57);}
}
`;
