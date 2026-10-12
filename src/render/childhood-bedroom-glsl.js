// Authored room volumes, not a screen-space tableau. Every object is measured
// in the bedroom's local metres; all perspectives use this same arrangement.
import { HOME_BEDROOM, HOME_COMFORT_LOOP_SECONDS } from '../data/childhood-bedroom.js';

const f = (n) => Number.isInteger(n) ? `${n}.0` : String(n);
export const CHILDHOOD_BEDROOM_GLSL = `
const vec3 hbOrigin=vec3(${f(HOME_BEDROOM.origin.x)},0.0,${f(HOME_BEDROOM.origin.z)});
const float hbLoopSeconds=${f(HOME_COMFORT_LOOP_SECONDS)};
float hbPhase(float t){return mod(max(0.0,t),hbLoopSeconds);}
float hbRounded(vec3 p,vec3 size,float r){return ewBox(p,size-vec3(r))-r;}
float hbEllipsoid(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k0<.0001?-min(r.x,min(r.y,r.z)):k0*(k0-1.0)/k1;}
void hbUnion(float piece,float tag,inout float d,inout float material){if(piece<d){d=piece;material=tag;}}

float hbRoomMap(vec3 q,float t,out float material){
  float d=1e5,s,bound;material=22.0;
  // A normal-sized room with substantial window reveals and a side chimney.
  s=min(ewBox(q-vec3(-1.85,1.275,2.125),vec3(.05,1.275,2.125)),ewBox(q-vec3(0.0,1.275,4.30),vec3(1.8,1.275,.05)));
  vec3 rw=q-vec3(1.85,1.275,2.125);
  float rightWall=ewBox(rw,vec3(.05,1.275,2.125));
  rightWall=max(rightWall,-ewBox(q-vec3(1.8,1.02,3.76),vec3(.20,1.02,.41)));
  hbUnion(min(s,rightWall),22.0,d,material);
  hbUnion(ewBox(q-vec3(1.65,1.275,1.65),vec3(.15,1.275,.60)),22.0,d,material);
  hbUnion(ewBox(q-vec3(0.0,-.045,2.125),vec3(1.8,.045,2.125)),25.0,d,material);
  hbUnion(ewBox(q-vec3(0.0,2.59,2.125),vec3(1.8,.04,2.125)),22.0,d,material);
  // Skirting turns around the breast and the unequal alcoves.
  s=min(ewBox(q-vec3(-1.775,.075,2.125),vec3(.025,.075,2.125)),ewBox(q-vec3(0.0,.075,4.225),vec3(1.8,.075,.025)));
  s=min(s,ewBox(q-vec3(1.775,.075,.525),vec3(.025,.075,.525)));
  s=min(s,ewBox(q-vec3(1.475,.075,1.65),vec3(.025,.075,.60)));
  s=min(s,ewBox(q-vec3(1.775,.075,2.80),vec3(.025,.075,.55)));
  s=min(s,min(ewBox(q-vec3(1.65,.075,1.05),vec3(.15,.075,.025)),ewBox(q-vec3(1.65,.075,2.25),vec3(.15,.075,.025))));
  hbUnion(s,21.0,d,material);
  // Plain ceiling junctions follow the same walls, rather than a floating box.
  s=min(ewBox(q-vec3(-1.773,2.48,2.125),vec3(.027,.027,2.125)),ewBox(q-vec3(0.0,2.48,4.223),vec3(1.8,.027,.027)));
  s=min(s,ewBox(q-vec3(1.473,2.48,1.65),vec3(.027,.027,.60)));
  hbUnion(s,21.0,d,material);

  // Door leaf, inset panels, deep jamb and ordinary handle. It is not an exit.
  bound=ewBox(q-vec3(1.80,1.07,3.76),vec3(.15,1.12,.51));
  if(bound<.15){
    s=hbRounded(q-vec3(1.83,1.02,3.76),vec3(.035,1.02,.40),.009);
    s=min(s,min(ewBox(q-vec3(1.765,1.045,3.325),vec3(.04,1.045,.038)),ewBox(q-vec3(1.765,1.045,4.195),vec3(.04,1.045,.038))));
    s=min(s,ewBox(q-vec3(1.765,2.08,3.76),vec3(.04,.043,.47)));
    hbUnion(s,21.0,d,material);
    s=min(hbRounded(q-vec3(1.784,.64,3.76),vec3(.012,.30,.29),.008),hbRounded(q-vec3(1.784,1.52,3.76),vec3(.012,.30,.29),.008));
    hbUnion(s,32.0,d,material);
    hbUnion(ewCapsule(q,vec3(1.72,.95,3.37),vec3(1.72,.95,3.47),.014),29.0,d,material);
  }else d=min(d,bound);

  // Retained single bed: open underside, thin rails and rounded posts.
  bound=ewBox(q-vec3(-1.215,.51,3.225),vec3(.53,.53,1.07));
  if(bound<.18){
    vec3 leg=q-vec3(-1.215,.27,3.225);leg.x=abs(leg.x)-.43;leg.z=abs(leg.z)-.98;
    s=hbRounded(leg,vec3(.035,.25,.035),.009);
    s=min(s,ewBox(vec3(abs(q.x+1.215)-.435,q.y-.34,q.z-3.225),vec3(.033,.08,1.005)));
    s=min(s,ewBox(vec3(q.x+1.215,q.y-.35,abs(q.z-3.225)-.98),vec3(.465,.075,.033)));
    float arch=.86+.09*cos(clamp((q.x+1.215)/.44,-1.0,1.0)*1.5707963);
    s=min(s,max(hbRounded(q-vec3(-1.215,.72,4.205),vec3(.46,.25,.035),.014),q.y-arch));
    s=min(s,hbRounded(q-vec3(-1.215,.52,2.23),vec3(.46,.20,.035),.014));
    hbUnion(s,25.0,d,material);
    hbUnion(hbRounded(q-vec3(-1.215,.48,3.225),vec3(.47,.09,1.0),.045),26.0,d,material);
    // Unoccupied bedding: a crooked pillow and one corner of the duvet folded.
    vec3 duvet=q-vec3(-1.21,.606,3.01);duvet.y-=.012*sin(duvet.x*15.0+duvet.z*6.0);
    duvet.xz=ewRot(duvet.xz,.023);
    s=hbRounded(duvet,vec3(.49,.042,.77),.032);
    vec3 fold=q-vec3(-.875,.652,3.66);fold.xz=ewRot(fold.xz,-.23);
    s=min(s,hbRounded(fold,vec3(.15,.025,.22),.020));
    vec3 pillow=q-vec3(-1.26,.665,3.96);pillow.xz=ewRot(pillow.xz,-.11);
    s=min(s,hbEllipsoid(pillow,vec3(.36,.10,.21))*.85);
    hbUnion(s,26.0,d,material);
  }else d=min(d,bound);
  hbUnion(hbRounded(q-vec3(-.18,.012,2.94),vec3(.53,.012,.82),.008),34.0,d,material);

  // Later study desk: useful knee space, apron, drawer pedestal and handles.
  bound=ewBox(q-vec3(.175,.48,3.94),vec3(.65,.48,.35));
  if(bound<.15){
    s=hbRounded(q-vec3(.175,.754,3.94),vec3(.625,.028,.31),.013);
    vec3 leg=q-vec3(.175,.365,3.94);leg.x=abs(leg.x)-.572;leg.z=abs(leg.z)-.26;
    s=min(s,hbRounded(leg,vec3(.028,.35,.028),.006));
    s=min(s,ewBox(q-vec3(.175,.66,4.18),vec3(.58,.06,.023)));
    s=min(s,hbRounded(q-vec3(.57,.58,3.96),vec3(.185,.15,.27),.012));
    hbUnion(s,25.0,d,material);
    vec3 drawers=q-vec3(.57,.582,3.674);drawers.y=mod(drawers.y+.073,.145)-.073;
    s=max(hbRounded(drawers,vec3(.165,.059,.015),.006),abs(q.y-.582)-.145);
    hbUnion(s,25.0,d,material);
    s=min(ewCapsule(q,vec3(.53,.51,3.652),vec3(.61,.51,3.652),.008),ewCapsule(q,vec3(.53,.655,3.652),vec3(.61,.655,3.652),.008));
    hbUnion(s,29.0,d,material);
    // Slightly scattered, deliberately small: no date, logo or explanatory prop.
    vec3 paper=q-vec3(-.20,.790,3.83);paper.xz=ewRot(paper.xz,.17);
    s=ewBox(paper,vec3(.105,.006,.145));
    paper=q-vec3(-.07,.800,3.86);paper.xz=ewRot(paper.xz,-.14);
    s=min(s,ewBox(paper,vec3(.105,.006,.145)));
    hbUnion(s,31.0,d,material);
    hbUnion(hbRounded(q-vec3(.18,.805,4.03),vec3(.135,.022,.10),.007),35.0,d,material);
    hbUnion(ewCapsule(q,vec3(-.30,.803,3.70),vec3(-.13,.803,3.75),.007),25.0,d,material);
  }else d=min(d,bound);

  // Chair left out and turned a little, with a small discarded shirt on its seat.
  vec3 cq=q-vec3(.11,0.0,2.96);cq.xz=ewRot(cq.xz,.17);
  bound=ewBox(cq-vec3(0.0,.47,0.0),vec3(.27,.48,.28));
  if(bound<.15){
    vec3 legs=cq-vec3(0.0,.23,0.0);legs.x=abs(legs.x)-.175;legs.z=abs(legs.z)-.17;
    s=hbRounded(legs,vec3(.019,.23,.019),.005);
    s=min(s,hbRounded(cq-vec3(0.0,.46,0.0),vec3(.215,.036,.205),.022));
    s=min(s,ewBox(vec3(abs(cq.x)-.18,cq.y-.67,cq.z+.18),vec3(.017,.24,.017)));
    vec3 back=cq-vec3(0.0,.84,-.18);back.z+=.025*cos(back.x*6.0);
    s=min(s,hbRounded(back,vec3(.205,.075,.018),.012));
    hbUnion(s,25.0,d,material);
    s=hbRounded(cq-vec3(.04,.505,-.02),vec3(.13,.022,.12),.018);
    hbUnion(s,33.0,d,material);
  }else d=min(d,bound);

  // Dresser belongs to the rear alcove; the bottom drawer remains a handspan out.
  bound=ewBox(q-vec3(1.48,.46,2.79),vec3(.40,.48,.43));
  if(bound<.15){
    s=hbRounded(q-vec3(1.52,.455,2.79),vec3(.27,.455,.40),.018);
    s=min(s,hbRounded(q-vec3(1.51,.925,2.79),vec3(.30,.025,.425),.015));
    hbUnion(s,25.0,d,material);
    s=min(hbRounded(q-vec3(1.232,.70,2.79),vec3(.018,.10,.35),.008),hbRounded(q-vec3(1.232,.46,2.79),vec3(.018,.10,.35),.008));
    s=min(s,hbRounded(q-vec3(1.105,.215,2.79),vec3(.018,.10,.35),.008));
    hbUnion(s,25.0,d,material);
    s=min(ewCapsule(q,vec3(1.205,.70,2.70),vec3(1.205,.70,2.88),.012),ewCapsule(q,vec3(1.205,.46,2.70),vec3(1.205,.46,2.88),.012));
    s=min(s,ewCapsule(q,vec3(1.08,.215,2.70),vec3(1.08,.215,2.88),.012));
    hbUnion(s,29.0,d,material);
    hbUnion(hbRounded(q-vec3(1.18,.333,2.72),vec3(.09,.022,.17),.018),33.0,d,material);
  }else d=min(d,bound);
  // A shallow closed clothes cupboard uses the smaller front alcove.
  hbUnion(hbRounded(q-vec3(1.52,.99,.65),vec3(.27,.955,.325),.018),25.0,d,material);
  hbUnion(hbRounded(q-vec3(1.235,1.0,.65),vec3(.015,.90,.285),.008),32.0,d,material);
  hbUnion(ewCapsule(q,vec3(1.205,.98,.61),vec3(1.205,1.065,.61),.012),29.0,d,material);

  // One low bedside lamp provides the actual source of the room's warmth.
  s=hbRounded(q-vec3(-.52,.47,3.91),vec3(.17,.41,.18),.012);
  s=min(s,ewCapsule(q,vec3(-.52,.91,3.91),vec3(-.52,1.23,3.91),.018));
  hbUnion(s,25.0,d,material);
  vec3 lamp=q-vec3(-.52,1.32,3.91);
  float shadeRadius=.175-lamp.y*.24;
  s=max(abs(length(lamp.xz)-shadeRadius)-.008,abs(lamp.y)-.14);
  hbUnion(s,28.0,d,material);

  // Books were taken, not arranged for a visitor. A few remain on the low shelf.
  hbUnion(hbRounded(q-vec3(.16,1.61,4.10),vec3(.62,.018,.14),.006),25.0,d,material);
  vec3 book=q-vec3(-.205,1.76,4.12);book.x=mod(book.x+.045,.09)-.045;
  s=max(hbRounded(book,vec3(.033,.13,.095),.003),abs(q.x+.205)-.17);
  s=min(s,hbRounded(q-vec3(.67,1.69,4.12),vec3(.035,.06,.09),.003));
  hbUnion(s,35.0,d,material);
  vec3 fallen=q-vec3(-.66,.035,2.08);fallen.xz=ewRot(fallen.xz,.28);
  hbUnion(hbRounded(fallen,vec3(.11,.025,.15),.006),35.0,d,material);

  // Clock, curtain and radiator are the only domestic motion/sound sources.
  vec3 clock=q-vec3(-.12,2.02,4.218);
  hbUnion(max(length(clock.xy)-.15,abs(clock.z)-.021),25.0,d,material);
  clock.z+=.024;
  hbUnion(max(length(clock.xy)-.134,abs(clock.z)-.008),27.0,d,material);
  float phase=hbPhase(t),hem=(1.0-uCalm)*sin(clamp((phase-7.2)/1.2,0.0,1.0)*3.14159265)*.009;
  vec3 curtain=q-vec3(-1.205,1.50,.23);curtain.x-=hem*(1.0-smoothstep(.75,1.5,q.y));
  curtain.z+=sin(curtain.x*110.0)*.012;
  hbUnion(hbRounded(curtain,vec3(.10,.775,.016),.010),33.0,d,material);

  // Tall cast-iron radiator on the left return, so the cuff clears the sill.
  bound=ewBox(q-vec3(-1.64,.56,1.31),vec3(.18,.48,.58));
  if(bound<.15){
    vec3 ribs=q-vec3(-1.70,.56,1.31);ribs.z=mod(ribs.z+.04,.08)-.04;
    s=max(hbRounded(ribs,vec3(.09,.355,.026),.019),abs(q.z-1.31)-.45);
    s=min(s,min(ewCapsule(q,vec3(-1.70,.92,.86),vec3(-1.70,.92,1.76),.035),ewCapsule(q,vec3(-1.70,.20,.86),vec3(-1.70,.20,1.76),.035)));
    s=min(s,ewCapsule(q,vec3(-1.70,.10,1.83),vec3(-1.70,.28,1.83),.018));
    hbUnion(s,23.0,d,material);
  }else d=min(d,bound);
  // Empty cloth drapes over the radiator: an uneven hem and collapsed collar,
  // one long cuff, one folded sleeve. It never breathes or changes shape.
  vec3 j=vec3(q.z-1.33,q.y-1.01,q.x+1.48);
  bound=ewBox(j-vec3(0.0,-.28,0.0),vec3(.57,.44,.16));
  if(bound<.16){
    vec3 cloth=j-vec3(0.0,-.23,0.0);cloth.z+=.018*sin(cloth.x*26.0)+.010*sin(cloth.y*18.0+cloth.x*9.0);
    float hemY=-.51+.018*sin(j.x*8.0);
    s=max(hbRounded(cloth,vec3(.33,.245,.028),.022),hemY-j.y);
    s=min(s,ewCapsule(j,vec3(-.33,-.015,.015),vec3(.32,-.01,.01),.060));
    s=min(s,ewCapsule(j,vec3(-.32,-.05,.01),vec3(-.49,-.57,.005),.053));
    s=min(s,hbRounded(j-vec3(-.50,-.64,.012),vec3(.052,.079,.027),.020));
    s=min(s,ewCapsule(j,vec3(.31,-.04,.01),vec3(.44,-.29,.025),.057));
    s=max(s,-hbEllipsoid(j-vec3(-.015,.025,.018),vec3(.105,.052,.12)));
    hbUnion(s,24.0,d,material);
    hbUnion(hbRounded(j-vec3(.40,-.25,.078),vec3(.045,.056,.006),.004),30.0,d,material);
  }else d=min(d,bound);
  return d;
}

float ewBedroomMap(vec3 p,float t,out float material){
  vec3 q=p-hbOrigin;
  float d=hbRoomMap(q,t,material),s;
  // The window opening and all nested joinery have actual wall thickness.
  float left=-1.07,right=.71,bottom=.78,top=2.20;
  s=min(ewBox(q-vec3(left-.035,1.49,-.14),vec3(.035,.71,.14)),ewBox(q-vec3(right+.035,1.49,-.14),vec3(.035,.71,.14)));
  s=min(s,ewBox(q-vec3(-.18,2.235,-.14),vec3(.96,.035,.14)));
  hbUnion(s,22.0,d,material);
  s=min(hbRounded(q-vec3(left,1.49,-.235),vec3(.043,.75,.043),.008),hbRounded(q-vec3(right,1.49,-.235),vec3(.043,.75,.043),.008));
  s=min(s,min(hbRounded(q-vec3(-.18,bottom,-.235),vec3(.935,.043,.043),.008),hbRounded(q-vec3(-.18,top,-.235),vec3(.935,.043,.043),.008)));
  s=min(s,hbRounded(q-vec3(-.31,1.49,-.258),vec3(.029,.70,.033),.006));
  s=min(s,hbRounded(q-vec3(-.18,1.94,-.258),vec3(.86,.023,.028),.005));
  s=min(s,hbRounded(q-vec3(-.18,.752,-.08),vec3(.995,.038,.25),.012));
  hbUnion(s,21.0,d,material);
  hbUnion(hbRounded(q-vec3(-.18,.796,-.28),vec3(.995,.012,.095),.007),13.0,d,material);
  hbUnion(ewCapsule(q,vec3(-.30,1.30,-.31),vec3(-.21,1.30,-.31),.010),29.0,d,material);
  return d;
}

// A small blocker set keeps lamplight directional and contact shadows readable
// without marching the full furnishing map a second time for every light ray.
float hbLightBlockers(vec3 q){
  float d=ewBox(q-vec3(1.65,1.275,1.65),vec3(.15,1.275,.60));
  d=min(d,ewBox(q-vec3(-1.215,.48,3.225),vec3(.47,.09,1.0)));
  d=min(d,ewBox(q-vec3(.57,.58,3.96),vec3(.185,.15,.27)));
  return min(d,ewBox(q-vec3(1.52,.455,2.79),vec3(.27,.455,.40)));
}
void ewBedroomMaterial(vec3 q,vec3 n,vec3 rd,float t,float m,out vec3 albedo,out vec3 ambient,out vec3 emit){
  float grain=.96+.04*ewNoise(q.xy*45.0);
  albedo=vec3(.61,.59,.49)*grain;emit=vec3(0.0);
  if(m<20.5)albedo=vec3(.43,.45,.40);
  else if(m<21.5)albedo=vec3(.69,.70,.59)*grain;
  else if(m<22.5){
    albedo=vec3(.64,.64,.53)*grain;
    float poster=step(-.34,q.x)*step(q.x,.18)*step(1.85,q.y)*step(q.y,2.25)*step(4.23,q.z);
    albedo=mix(albedo,vec3(.73,.71,.61),poster*.6);
    float mark=step(1.77,q.x)*step(3.20,q.z)*step(q.z,3.29)*step(.50,q.y)*step(q.y,1.82);
    float ticks=1.0-smoothstep(.004,.011,abs(mod(q.y-.62,.145)-.0725));
    albedo*=1.0-mark*ticks*.30;
  }else if(m<23.5)albedo=vec3(.68,.68,.58)*grain;
  else if(m<24.5){float knit=.92+.08*sin(q.z*185.0)*sin(q.y*160.0);albedo=vec3(.20,.46,.24)*knit;}
  else if(m<25.5){
    float timber=.88+.12*ewNoise(vec2(q.x*16.0+q.z*8.0,q.y*100.0));albedo=vec3(.43,.30,.17)*timber;
    if(q.y<.01){float seam=1.0-smoothstep(.005,.012,abs(mod(q.x+.09,.18)-.09));albedo*=1.0-seam*.22;}
  }else if(m<26.5)albedo=vec3(.60,.62,.52)*grain;
  else if(m<27.5){
    vec2 c=q.xy-vec2(-.12,2.02);float phase=floor(hbPhase(t)),a=phase*6.2831853/60.0;
    vec2 hand=ewRot(c,a);float ink=step(abs(hand.x),.008)*step(0.0,hand.y)*step(hand.y,.106);
    ink=max(ink,step(abs(c.y+c.x*.4),.009)*step(-.085,c.x)*step(c.x,0.0));
    albedo=mix(vec3(.80,.76,.62),vec3(.14,.14,.105),ink);
  }else if(m<28.5){albedo=vec3(.71,.59,.37);emit=vec3(.45,.29,.10);}
  else if(m<29.5)albedo=vec3(.37,.31,.18);
  else if(m<30.5)albedo=vec3(.43,.56,.30);
  else if(m<31.5)albedo=vec3(.73,.70,.60);
  else if(m<32.5)albedo=vec3(.47,.50,.40)*grain;
  else if(m<33.5)albedo=vec3(.50,.52,.46)*grain;
  else if(m<34.5){float weave=.92+.08*sin(q.x*100.0)*sin(q.z*90.0);albedo=vec3(.38,.34,.25)*weave;}
  else albedo=mix(vec3(.30,.36,.31),vec3(.46,.35,.23),step(.5,ewHash(floor(q.xz*12.0))));
  vec3 lamp=vec3(-.52,1.35,3.91)-q;float ld=length(lamp);vec3 L=lamp/max(ld,.001);
  float visibility=1.0,travel=.035;
  for(int i=0;i<5;i++){
    float blocker=hbLightBlockers(q+n*.025+L*travel);
    visibility=min(visibility,clamp(blocker*7.0/max(travel,.04),.18,1.0));
    travel+=clamp(blocker,.07,.65);if(travel>ld-.25)break;
  }
  float direct=max(0.0,dot(n,L))*visibility/(1.0+ld*ld*.38);
  // The snow supplies broad reflected light through the opening. Its bearing
  // matters on the left return: the jumper faces across the room, not forward.
  vec3 toWindow=vec3(-.18,1.49,-.28)-q;
  float wd=length(toWindow);
  float windowBounce=(.22+.78*max(0.0,dot(n,toWindow/max(wd,.001))))/(1.0+wd*wd*.30);
  ambient=vec3(.13,.14,.13)+vec3(.48,.54,.56)*windowBounce+vec3(1.2,.77,.35)*direct+vec3(.13,.085,.04)/(1.0+ld*ld*.25);
  if(q.y<.08){float bedContact=(1.0-smoothstep(.44,.62,abs(q.x+1.215)))*(1.0-smoothstep(.98,1.11,abs(q.z-3.225)));ambient*=1.0-bedContact*.42;}
}
`;
