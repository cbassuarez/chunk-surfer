// A whole house behind the last clear pane. Its geometry is static; weather and
// attention belong to the whiteout scene around it.
import { HOME_HOUSE } from '../data/childhood-house.js';
import { CHILDHOOD_HOUSE_INSCRIPTION_GLSL } from './childhood-house-inscription.js';

const f = (n) => Number.isInteger(n) ? `${n}.0` : String(n);
const v = (values) => `vec3(${values.map(f).join(',')})`;
const box = (bounds) => {
  const axes = ['x', 'y', 'z'];
  return { centre: axes.map((a) => (bounds[`${a}0`] + bounds[`${a}1`]) / 2),
    half: axes.map((a) => (bounds[`${a}1`] - bounds[`${a}0`]) / 2) };
};
const h = HOME_HOUSE, cx = (h.x0 + h.x1) / 2, cz = h.roof.ridgeZ;
const dress=h.windowDress,eaves=h.eavesJoinery;
const sillFront=h.z0-.295, sillBack=h.z0-.04+dress.sillProjection;
const hw = (h.x1 - h.x0) / 2, hd = (h.z1 - h.z0) / 2;
const slope = (h.ridge - h.eaves) / hd, slopeNormal = Math.hypot(1, slope);
const body = box({ x0: h.x0, x1: h.x1, y0: h.bottom, y1: h.eaves, z0: h.z0, z1: h.z1 });
const room = box(h.bedroomVoid);
const pane = box({ x0: h.clearPane.x - h.clearPane.halfWidth, x1: h.clearPane.x + h.clearPane.halfWidth,
  y0: h.clearPane.bottom, y1: h.clearPane.top, z0: h.clearPane.z0, z1: h.clearPane.z1 });
const orientation = { front: 0, back: 1, left: 2, right: 3 };
const face = (item) => `hhFace(p,${v([item.x, item.y, item.z])},${f(orientation[item.face])})`;

export const CHILDHOOD_HOUSE_GLSL = `
${CHILDHOOD_HOUSE_INSCRIPTION_GLSL}
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
  // Putty/beads sit against the recessed glass, with a substantial sill below.
  // These narrow shoulders give cold windows depth without lighting them.
  s=min(s,ewBox(vec3(abs(q.x)-size.x+.073,q.y,q.z+.112),vec3(.012,size.y-.073,.014)));
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

  // The roof skin uses the same overlapped slate construction as the store.
  vec3 roofLocal=p-vec3(${f(cx)},0.0,${f(cz)});
  hvRoofCover(roofLocal,${f(hw+h.roof.overhang-.346)},${f(hd+h.roof.overhang-.344)},
    ${f(h.ridge+.034-.093)},hhRoofSlope,1.0/hhSlopeNormal,false,
    vec3(${f(h.chimney.x-cx)},${f(h.chimney.z-cz)},1.0),d,material);
  if(material==57.0)material=46.0;
  else if(material==52.0||material==85.0)material=42.0;
  // Fascia, soffit and roof bearing belong to the same eaves section. Their
  // broad horizontal junction is readable before individual slate seams.
  vec3 fascia=p-vec3(${f(cx)},${f(h.eaves-.12-eaves.fasciaHeight/2)},${f(cz)});
  fascia.z=abs(fascia.z)-${f(hd+h.roof.overhang-eaves.fasciaThickness/2)};
  hhUnion(ewBox(fascia,vec3(${f(hw+h.roof.overhang)},${f(eaves.fasciaHeight/2)},${f(eaves.fasciaThickness/2)})),43.0,d,material);
  vec3 soffit=p-vec3(${f(cx)},${f(h.eaves-.125)},${f(cz)});
  soffit.z=abs(soffit.z)-${f(hd+eaves.soffitDepth/2)};
  hhUnion(ewBox(soffit,vec3(${f(hw)},.012,${f(eaves.soffitDepth/2)})),43.0,d,material);
  // A continuous masonry stack stands above the room's chimney breast.
  vec3 chimney=p-vec3(${f(h.chimney.x)},${f((h.eaves + h.chimney.top) / 2)},${f(h.chimney.z)});
  s=ewRoundBox(chimney,vec3(${f(h.chimney.halfX-.012)},${f((h.chimney.top - h.eaves) / 2-.012)},${f(h.chimney.halfZ-.012)}),.012);
  if(abs(s)<.10){
    float along=abs(chimney.x)/${f(h.chimney.halfX)}>abs(chimney.z)/${f(h.chimney.halfZ)}?p.z:p.x;
    s=(s+.009*(1.0-smoothstep(.003,.014,hvBond(vec2(along,p.y),vec2(.227,.081),.5).x)))*.89;
  }
  hhUnion(s,41.0,d,material);
  hhUnion(ewBox(p-vec3(${f(h.chimney.x)},${f(h.chimney.top + .04)},${f(h.chimney.z)}),vec3(.34,.055,.40)),40.0,d,material);
  vec3 pots=p-vec3(${f(h.chimney.x)},${f(h.chimney.top + .25)},${f(h.chimney.z)});
  pots.x=abs(pots.x)-.12;
  hhUnion(max(length(pots.xz)-.079,abs(pots.y)-.21),41.0,d,material);
  hhUnion(max(length(pots.xz)-.053,abs(pots.y-.211)-.004),44.0,d,material);
  // Lead apron follows both the stack and roof plane, rather than ending at a
  // hovering square. The upper edge turns up the masonry to shed meltwater.
  vec3 stack=p-vec3(${f(h.chimney.x)},0.0,${f(h.chimney.z)});
  s=max(abs(p.y-hhRoofHeight(p.z)-.075)/hhSlopeNormal-.018,
    ewBox(stack,vec3(${f(h.chimney.halfX+.13)},12.0,${f(h.chimney.halfZ+.13)})));
  s=max(s,-ewBox(stack,vec3(${f(h.chimney.halfX-.01)},12.0,${f(h.chimney.halfZ-.01)})));
  float upstand=max(abs(max(abs(stack.x)-${f(h.chimney.halfX+.016)},abs(stack.z)-${f(h.chimney.halfZ+.016)}))-.014,
    abs(p.y-hhRoofHeight(p.z)-${f(eaves.flashingHeight/2)})-${f(eaves.flashingHeight/2)});
  hhUnion(min(s,upstand),48.0,d,material);

  // A single downhill eave collects meltwater. This shoe reaches a small
  // masonry splashstone on the side of the house where snow exposes it.
  vec3 gutter=p-vec3(${f(cx)},2.65,${f(cz)});
  gutter.z=-gutter.z-${f(hd+.232)};
  gutter.y+=.043*clamp((gutter.x+${f(hw)})/${f(hw*2)},0.0,1.0);
  float bend=length(gutter.yz);
  s=max(max(bend-.073,.057-bend),max(gutter.y-.010,abs(gutter.x)-${f(hw+.232)}));
  float clipX=abs(fract((gutter.x+.13)/${f(eaves.gutterBracketSpacing)})-.5)*${f(eaves.gutterBracketSpacing)};
  float clip=max(abs(bend-.079)-.008,max(clipX-.015,max(gutter.y-.030,abs(gutter.x)-${f(hw+.21)})));
  hhUnion(min(s,clip),45.0,d,material);
  float conductor=ewCapsule(p,vec3(5.09,2.55,69.768),vec3(5.09,2.46,69.768),.045);
  conductor=min(conductor,ewCapsule(p,vec3(5.09,2.46,69.768),vec3(5.09,2.31,69.89),.043));
  conductor=min(conductor,ewCapsule(p,vec3(5.09,2.31,69.89),vec3(5.09,.26,69.89),.039));
  float clampY=abs(fract((p.y+.31)/.77)-.5)*.77;
  float band=max(length(p.xz-vec2(5.09,69.89))-.056,max(clampY-.022,max(p.y-2.25,.30-p.y)));
  conductor=min(conductor,band);
  vec3 mouth=vec3(5.09,.10,69.66);
  float shoe=ewCapsule(p,vec3(5.09,.26,69.89),mouth,.044);
  shoe=max(shoe,-ewCapsule(p,vec3(5.09,.14,69.72),vec3(5.09,.045,69.55),.030));
  hhUnion(min(conductor,shoe),45.0,d,material);
  hhUnion(ewRoundBox(p-vec3(5.09,-.003,69.55),vec3(.20,.034,.24),.013),47.0,d,material);

${h.secondaryWindows.map((item, i) => `  wd=hhClosedWindow(w${i},vec2(${f(item.halfWidth)},${f(item.halfHeight)}),wm);hhUnion(wd,wm,d,material);`).join('\n')}
  // The door's dark leaves and light head read separately above the side drift.
  s=ewBox(door-vec3(0.0,0.0,-.145),vec3(${f(h.lowerDoor.halfWidth - .04)},${f(h.lowerDoor.halfHeight - .035)},.025));
  float seams=abs(fract((door.x+.05)/.126)-.5)*.126;
  hhUnion((s+.008*(1.0-smoothstep(.003,.012,seams)))*.85,49.0,d,material);
  s=min(ewBox(door-vec3(-.43,0.0,-.035),vec3(.036,1.025,.075)),
    ewBox(door-vec3(.43,0.0,-.035),vec3(.036,1.025,.075)));
  hhUnion(s,47.0,d,material);
  hhUnion(ewBox(door-vec3(0.0,1.045,-.01),vec3(.53,.062,.12)),47.0,d,material);
  // One restrained masonry opening carries the invitation to look in. Its
  // lintel bears beyond both jambs; every piece stays outside the clear pane.
  vec3 surround=p-vec3(${f(h.clearPane.x)},${f((h.clearPane.bottom+h.clearPane.top)/2)},${f(h.z0-dress.projection/2)});
  hhUnion(ewBox(vec3(abs(surround.x)-${f(h.clearPane.halfWidth+dress.jamb/2)},surround.y,surround.z),
    vec3(${f(dress.jamb/2)},${f((h.clearPane.top-h.clearPane.bottom)/2)},${f(dress.projection/2)})),47.0,d,material);
  hhUnion(ewBox(p-vec3(${f(h.clearPane.x)},${f(h.clearPane.top+dress.lintelHeight/2)},${f(h.z0-.018)}),
    vec3(${f(h.clearPane.halfWidth+dress.lintelBearing)},${f(dress.lintelHeight/2)},.062)),47.0,d,material);
  // A nosing/drip groove reads in profile during lateral inspection. It never
  // becomes another foothold or an opening through the fixed glazing plane.
  s=ewBox(p-vec3(${f(h.clearPane.x)},${f(h.clearPane.bottom-.07)},${f((sillFront+sillBack)/2)}),
    vec3(${f(h.clearPane.halfWidth+.12)},${f(dress.sillThickness)},${f((sillBack-sillFront)/2)}));
  s=max(s,-ewBox(p-vec3(${f(h.clearPane.x)},${f(h.clearPane.bottom-.125)},${f(sillFront+dress.dripSetback)}),vec3(${f(h.clearPane.halfWidth+.08)},.009,.009)));
  hhUnion(s,47.0,d,material);
  // Loose powder follows the top of the sill and leaves a rolled edge over
  // the stone nosing. It remains on the exterior face of the glazing.
  vec3 sillPowder=p-vec3(${f(h.clearPane.x - .025)},${f(h.clearPane.bottom - .002)},69.819);
  float drift=.005*sin(p.x*4.0)+.003*cos(p.x*11.3)
    +.003*cos((p.z-69.82)*24.0+p.x*4.7);
  sillPowder.y-=drift;
  hhUnion(ewRoundBox(sillPowder,vec3(${f(h.clearPane.halfWidth + .076)},.008,.098),.007),46.0,d,material);
  return d;
}

void ewHouseMaterial(vec3 p,inout vec3 n,vec3 rd,float m,float distanceM,out vec3 albedo,out vec3 ambient,out vec3 emit){
  float along=abs(n.x)>.5?p.z:p.x;
  float detail=1.0-smoothstep(3.0,17.0,distanceM);
  float wear=mix(.5,ewNoise(vec2(along*5.2,p.y*7.7)),detail);
  albedo=vec3(.49,.48,.445)*(.95+.05*wear);
  // Snow bounce is strongest at the buried foot and on down-facing joinery.
  // The sky-facing wall stays cold beside the single warm room.
  float snowBounce=(1.0-smoothstep(.35,2.35,p.y))*.13+.09*max(0.0,-n.y);
  ambient=vec3(.52,.555,.575)+vec3(snowBounce);emit=vec3(0.0);
  if(m<40.5){
    float damp=(1.0-smoothstep(-.1,.45,p.y))*(.75+.25*ewNoise(vec2(along*2.4,0.0)));
    float run=smoothstep(1.5,2.65,p.y)*smoothstep(.62,.88,ewNoise(vec2(along*4.0,1.0)));
    float underEave=smoothstep(2.06,2.66,p.y)*(.68+.32*ewNoise(vec2(along*1.6,.4)));
    float sillRun=(1.0-smoothstep(.78,1.05,p.y))*smoothstep(.08,.28,p.y)
      *(1.0-smoothstep(.73,1.12,abs(p.x-(${f(h.clearPane.x)}))))*smoothstep(69.91,70.01,p.z);
    float rough=ewNoise(vec2(along*.82,p.y*1.30));
    albedo*=.95+.10*rough-.24*damp-.11*run-.10*sillRun-.31*underEave;
  }else if(m<41.5){
    float joints=hvBedJoint(vec2(along,p.y+2.8));
    float mortar=1.0-smoothstep(.007,.024,joints);
    float variation=ewNoise(vec2(along*1.4,p.y*4.6));
    albedo=mix(vec3(.43,.42,.38)*(.83+.23*variation),vec3(.31,.32,.29),mortar*.83*detail);
  }else if(m<42.5){
    float rise=abs(p.z-${f(cz)})*hhSlopeNormal,row=floor(rise/.22);
    float joint=min(abs(mod(p.x+.18*mod(row,2.0),.36)-.18),abs(mod(rise,.22)-.11));
    float seams=1.0-smoothstep(.004,.011,joint);
    albedo=vec3(.166,.184,.194)*(.88+.15*ewNoise(vec2(p.x*.94,rise*.92)))*(1.0-.21*seams*detail);
  }else if(m<43.5){albedo=vec3(.58,.60,.55)*(.95+.05*wear);}
  else if(m<44.5){albedo=vec3(.065,.085,.105);ambient=vec3(.25,.31,.38)+vec3(.045,.055,.065)*max(0.0,n.y);}
  else if(m<45.5){albedo=vec3(.16,.18,.19);}
  else if(m<46.5){
    albedo=p.y>${f(h.eaves-.18)}?hvHeldSnow(p,n,detail):vec3(.64,.654,.657)*(.91+.10*ewNoise(p.xz*1.09));
    ambient=vec3(.56,.574,.579);
  }
  else if(m<47.5){albedo=vec3(.61,.60,.54)*(.97+.03*wear);}
  else if(m<48.5){albedo=vec3(.26,.29,.30)*(.97+.03*wear);}
  else {albedo=vec3(.17,.194,.177)*(.94+.12*wear);}
  hhSillWriting(p,rd,n,m,distanceM,albedo,ambient);
}
`;
