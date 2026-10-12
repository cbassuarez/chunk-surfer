// SOMEWHERE ELSE, DRAWN WITH DEPTH.
//
// The door-field openings used to pick a colour from the view direction alone —
// a painted backdrop that never moved when you did. These are places: raymarched
// in the door's own space (x right, y up from the threshold, z into the world),
// so what stands near the doorway slides across what stands far off as you walk
// past, and the same scene can be stood inside during a crossing.
//
// Shared by the portal pass and the crossing pass in props3d.js. See
// src/data/elsewhere-worlds.js for what each place is.
import { ELSEWHERE_WORLDS } from '../data/elsewhere-worlds.js';
import { REALM_POCKET_GLSL, HOME_WINDOW } from './realm-pocket-geometry.js';
import { CHILDHOOD_BEDROOM_GLSL } from './childhood-bedroom-glsl.js';
import { CHILDHOOD_HOUSE_GLSL } from './childhood-house-glsl.js';
import { HOME_BEDROOM } from '../data/childhood-bedroom.js';

export const ELSEWHERE_WORLD_COUNT = ELSEWHERE_WORLDS.length;
const glf = (value) => Number.isInteger(value) ? `${value}.0` : String(value);

// elsewhereScene(ro, rd, variant, seed, key, time, calm)
//   key  > .5 puts the tower on that world's horizon (the tower's key doors)
//   calm > .5 is reduced motion
export const ELSEWHERE_GLSL = `
float ewHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float ewHash1(float n){return fract(sin(n*91.3458)*47453.5453);}
float ewNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(ewHash(i),ewHash(i+vec2(1.0,0.0)),f.x),mix(ewHash(i+vec2(0.0,1.0)),ewHash(i+vec2(1.0,1.0)),f.x),f.y);}
float ewFbm(vec2 p){float v=0.0,a=.5;for(int k=0;k<4;k++){v+=a*ewNoise(p);p=p*2.03+17.1;a*=.5;}return v;}
float ewWrap(float a){return atan(sin(a),cos(a));}
float ewBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);}
vec2 ewRot(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(c*p.x-s*p.y,s*p.x+c*p.y);}

// The glass storm has no weather of its own: it strikes when the night's storm
// does (src/game/storm.js, through main.js stormFlashStrength), so a flash seen
// through a door is the one overhead.
uniform float uStormFlash;

// WHEN A DOOR SHUTS BEHIND HIM there is another one standing out in the world,
// a walk away: the way out. Off unless the crossing says so.
// (docs/plans/door-field-station.md, stage T2.)
uniform float uWayOut;
uniform float uRealmActive,uRealmDecoherence,uRealmTorch;
uniform vec3 uRealmView;
// eligible, attention, hold, the gust concealing the final approach.
uniform vec4 uHomeState;

${REALM_POCKET_GLSL}

float ewRoundBox(vec3 p,vec3 b,float radius){return ewBox(p,b)-radius;}
float ewCapsule(vec3 p,vec3 a,vec3 b,float radius){vec3 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0))-radius;}

${CHILDHOOD_BEDROOM_GLSL}
${CHILDHOOD_HOUSE_GLSL}

vec3 ewSky(vec3 d,int v,float seed,float t,float flash){
  float az=atan(d.x,d.z)+seed*6.2831853;
  float e=d.y;
  if(v==0){
    vec3 sky=mix(vec3(.38,.06,.01),vec3(.02,0.0,0.0),smoothstep(0.0,.55,e));
    sky+=vec3(1.4,.36,.06)*smoothstep(.17,.13,length(vec2(ewWrap(az-1.2),e-.06)));
    float ash=ewFbm(vec2(az*3.0+t*.02,e*9.0));
    sky=mix(sky,vec3(.05,.03,.03),smoothstep(.45,.8,ash)*smoothstep(-.02,.3,e));
    return e<0.0?vec3(.20,.05,.02):sky;
  }
  if(v==1){
    vec3 sky=mix(vec3(.42,.46,.38),vec3(.10,.12,.11),smoothstep(0.0,.7,abs(e)));
    return sky+vec3(1.5,1.5,1.4)*smoothstep(.07,.05,length(vec2(ewWrap(az),abs(e)-.18)));
  }
  if(v==2){
    if(e>=0.0)return vec3(.55,.60,.68);
    vec3 col=mix(vec3(.30,.33,.38),vec3(.62,.70,.80),smoothstep(0.0,-.6,e));
    return col+vec3(1.6)*smoothstep(.10,.07,length(vec2(ewWrap(az+2.0),e+.35)));
  }
  if(v==3){
    vec3 sky=mix(vec3(.05,.06,.09),vec3(0.0,0.0,.01),smoothstep(0.0,.8,e));
    vec2 pm=vec2(ewWrap(az-.6),e-.35);
    float planet=smoothstep(.62,.60,length(pm));
    float bands=.5+.5*sin(pm.y*28.0+ewFbm(pm*6.0)*3.0);
    sky=mix(sky,mix(vec3(.45,.30,.20),vec3(.75,.62,.45),bands)*(.35+.65*smoothstep(-.6,.6,pm.x+pm.y)),planet);
    sky+=vec3(1.1)*smoothstep(.05,.04,length(vec2(ewWrap(az+2.4),e-.55)))*(1.0-planet);
    return e<0.0?vec3(.08,.08,.10):sky;
  }
  if(v==4){
    vec3 sky=mix(vec3(.12,.13,.20),vec3(.02,.02,.04),smoothstep(0.0,.6,e));
    sky+=vec3(.10,.11,.16)*smoothstep(.55,.8,ewFbm(vec2(az*2.0,e*6.0)))*smoothstep(.05,.4,e);
    sky+=vec3(.16,.18,.30)*exp(-abs(e)*14.0)*(.6+.4*ewNoise(vec2(az*4.0,1.0)));
    if(flash>0.0){
      sky+=vec3(.8,.85,1.0)*.35*flash;
    }
    return sky;
  }
  if(v==5){
    vec3 sky=mix(vec3(.86,.88,.90),vec3(.70,.73,.78),smoothstep(0.0,.8,e));
    return sky+vec3(.2)*smoothstep(.2,.1,length(vec2(ewWrap(az-.8),e-.3)));
  }
  if(v==6){
    // Through the gone roof: a low white sky, snow coming down out of it.
    vec3 sky=mix(vec3(.76,.79,.84),vec3(.90,.92,.95),smoothstep(0.0,.9,e));
    return e<0.0?vec3(.30,.31,.33):sky;
  }
  if(v==7){
    // Brown daylight through tape dust, one weak sun low down.
    vec3 sky=mix(vec3(.50,.44,.34),vec3(.26,.24,.22),smoothstep(0.0,.75,e));
    sky+=vec3(.9,.78,.55)*smoothstep(.14,.10,length(vec2(ewWrap(az-2.1),e-.10)));
    return e<0.0?vec3(.22,.19,.15):sky;
  }
  if(v==8){
    // Ash haze to the top of the sky; no sun anywhere in it.
    float grit=ewFbm(vec2(az*2.4,e*7.0+t*.01));
    vec3 sky=mix(vec3(.62,.58,.52),vec3(.34,.32,.30),smoothstep(0.0,.85,e));
    return e<0.0?vec3(.30,.28,.25):sky*(.88+.24*grit);
  }
  // A dead broadcast: the sky is the snow on a set nobody is watching.
  float sn=ewHash(floor(vec2(az*160.0,e*160.0)+floor(t*12.0)*37.0));
  vec3 sky=mix(vec3(.30,.33,.36),vec3(.46,.50,.54),smoothstep(-.2,.8,e));
  return sky*(.72+.55*sn);
}

// The tower, on the horizon of a key door's world. In the inverted world it
// hangs from the ground overhead like everything else there.
float ewTower(vec3 p,int v,out float m){
  vec3 q=p-vec3(-38.0,0.0,230.0);
  if(v==2)q.y=34.0-p.y;
  float body=ewBox(q-vec3(0.0,16.0,0.0),vec3(3.2,16.0,3.2));
  float belfry=ewBox(q-vec3(0.0,35.0,0.0),vec3(3.6,3.0,3.6));
  float holes=min(ewBox(q-vec3(0.0,35.0,0.0),vec3(4.5,2.0,1.4)),ewBox(q-vec3(0.0,35.0,0.0),vec3(1.4,2.0,4.5)));
  belfry=max(belfry,-holes);
  float roof=max(max(q.y-47.0,38.0-q.y),(abs(q.x)+abs(q.z)-(47.0-q.y)*.4)*.7);
  float bell=length((q-vec3(0.0,34.4,0.0))*vec3(1.0,1.2,1.0))-1.2;
  float d=min(min(body,belfry),roof);
  m=3.0;
  if(bell<d){d=bell;m=2.0;}
  return d;
}

// m: 0 ground, 1 structure, 2 lit, 3 the tower
float ewLandscapeMap(vec3 p,int v,float seed,float key,float t,out float m){
  m=0.0;
  float d=1e5;
  if(v==0){
    float h=(ewFbm(p.xz*.04+seed*9.0)-.5)*9.0*smoothstep(10.0,70.0,p.z)
      +max(0.0,sin(p.x*.03+seed*4.0)*6.0-2.0)*smoothstep(60.0,140.0,p.z)
      +(ewNoise(p.xz*.35)-.5)*.5*smoothstep(1.5,8.0,p.z)-.15;
    d=(p.y-h)*.55;
    vec2 cell=floor(p.xz/vec2(38.0,46.0));
    float hh=ewHash(cell+seed*31.0);
    if(hh>.45){
      vec3 q=p;
      q.xz=mod(p.xz,vec2(38.0,46.0))-vec2(19.0,23.0);
      q.xz=ewRot(q.xz,hh*6.2831);
      q.xy=ewRot(q.xy,(ewHash(cell+7.0)-.5)*1.4);
      float mast=ewBox(q-vec3(0.0,6.0,0.0),vec3(.7,7.0,.7));
      float arm=ewBox(q-vec3(0.0,11.5,0.0),vec3(4.5,.35,.35));
      float s=max(min(mast,arm)*.8,12.0-p.z);
      if(s<d){d=s;m=1.0;}
    }
  }else if(v==1){
    vec2 cell=floor((p.xz+seed*30.0)/55.0);
    float hh=ewHash(cell);
    if(hh>.45){
      vec3 q=p;
      q.xz=mod(p.xz+seed*30.0,55.0)-27.5;
      q.xz+=(vec2(ewHash(cell+3.0),ewHash(cell+5.0))-.5)*30.0;
      float hs=10.0+hh*55.0;
      float r=1.8*(1.0-clamp(q.y/hs,0.0,1.0))+.12;
      float s=max(max(length(q.xz)-r,q.y-hs)*.7,25.0-p.z);
      if(s<d){d=s;m=1.0;}
    }
    vec3 w=p-vec3(-30.0,3.0,150.0);
    float wheel=length(vec2(length(w.xy)-22.0,w.z))-.55;
    float spokes=max(max(abs(w.z)-.3,min(abs(w.x),abs(w.y))-.25),length(w.xy)-22.0);
    float s2=min(wheel,spokes);
    if(s2<d){d=s2;m=1.0;}
  }else if(v==2){
    float ceiling=34.0+ewFbm(p.xz*.03+seed*3.0)*6.0;
    d=(ceiling-p.y)*.55;
    vec2 cell=floor(p.xz/16.0);
    float hh=ewHash(cell+seed*17.0);
    if(hh>.3&&p.z>8.0){
      vec3 q=p;
      q.xz=mod(p.xz,16.0)-8.0;
      float len=6.0+hh*26.0;
      vec3 b=vec3(2.2+ewHash(cell+1.0)*2.4,len*.5,2.2+ewHash(cell+2.0)*2.4);
      float s=ewBox(q-vec3(0.0,34.0-len*.5,0.0),b)*.8;
      if(s<d){d=s;m=1.0;}
    }
    vec2 bitCell=floor(p.xz/9.0);
    if(ewHash(bitCell+11.0)>.8&&p.z>3.0){
      vec3 q=p;
      q.xz=mod(p.xz,9.0)-4.5;
      q.y=mod(p.y-t*1.5-ewHash(bitCell)*9.0,9.0)-4.5;
      float s=ewBox(q,vec3(.25))*.8;
      if(s<d){d=s;m=1.0;}
    }
  }else if(v==3){
    float dune=(sin(p.x*.07+seed*5.0)*.5+.5)*3.2*smoothstep(6.0,40.0,abs(p.x))+ewFbm(p.xz*.05)*2.0-.3;
    float road=-.1+max(0.0,ewFbm(p.xz*.12+seed)-.55)*3.0;
    d=(p.y-mix(road,dune,smoothstep(3.0,7.0,abs(p.x))))*.55;
    float cellZ=floor(p.z/24.0);
    float side=p.x<0.0?-1.0:1.0;
    vec3 q=p;
    q.z=mod(p.z,24.0)-12.0;
    q.x=abs(p.x)-5.5;
    q.x-=p.y*(ewHash(vec2(cellZ,side))-.5)*.5;
    float pole=max(length(q.xz)-.09,max(p.y-5.2,-p.y-1.0));
    float head=ewBox(q-vec3(-.6,5.15,0.0),vec3(.7,.08,.18));
    float s=max(min(pole,head)*.8,4.0-p.z);
    if(s<d){d=s;m=(head<pole&&ewHash(vec2(cellZ+3.0,side))>.7)?2.0:1.0;}
  }else if(v==4){
    d=(p.y+.05-ewNoise(p.xz*.02)*.4*smoothstep(20.0,80.0,length(p.xz)))*.8;
    vec3 q=p-vec3(30.0,0.0,170.0);
    q.xz=ewRot(q.xz,q.y*.08);
    float r=2.0+max(q.y,0.0)*.34+ewNoise(vec2(q.y*.12,atan(q.z,q.x)*2.0))*2.5;
    float s=max(abs(length(q.xz)-r)-.9,max(q.y-150.0,-q.y))*.45;
    if(s<d){d=s;m=1.0;}
    vec2 shardCell=floor(p.xz/7.0);
    float sh=ewHash(shardCell+seed*13.0);
    if(sh>.62&&p.z>6.0){
      vec3 k=p;
      k.xz=mod(p.xz,7.0)-3.5;
      k.y-=1.2+ewHash(shardCell+4.0)*9.0;
      k.xz=ewRot(k.xz,sh*9.0);
      k.xy=ewRot(k.xy,ewHash(shardCell+8.0)*3.0);
      float shard=ewBox(k,vec3(.35,1.3,.04))*.7;
      if(shard<d){d=shard;m=1.0;}
    }
  }else if(v==5){
    d=(p.y-(ewFbm(p.xz*.03)*2.2*smoothstep(8.0,50.0,p.z)-.1))*.55;
    vec3 q=p;
    q.z=mod(p.z,45.0)-22.5;
    q.x=p.x+9.0;
    float w=.9*(1.0-clamp(p.y/28.0,0.0,1.0))+.15;
    float pylon=ewBox(vec3(q.x,p.y-13.0,q.z),vec3(w,13.0,w));
    float arm=ewBox(vec3(q.x,p.y-24.0,q.z),vec3(4.0,.25,.25));
    float sag=23.8-3.5*(1.0-pow(q.z/22.5,2.0));
    float wire=length(vec2(abs(q.x)-3.8,p.y-sag))-.09;
    float s=max(min(min(pylon,arm),wire)*.8,6.0-p.z);
    if(s<d){d=s;m=1.0;}
  }else if(v==6){
    // THE SCHOOL HALL, snowed in: parquet under drifted snow, chairs set out in
    // rows, a stage at the end with its lights still on, and no roof.
    float drift=(ewNoise(p.xz*.6)+ewNoise(p.xz*1.7)*.4)*.10;
    d=(p.y-drift)*.6;
    float stage=ewBox(p-vec3(0.0,.45,31.0),vec3(7.6,.45,5.0));
    if(stage<d){d=stage;m=0.0;}
    float wall=min(min(ewBox(p-vec3(-9.2,3.4,16.0),vec3(.35,3.4,22.0)),ewBox(p-vec3(9.2,3.4,16.0),vec3(.35,3.4,22.0))),
                   ewBox(p-vec3(0.0,3.4,38.4),vec3(9.2,3.4,.35)));
    if(wall<d){d=wall;m=1.0;}
    if(p.z>2.0&&p.z<27.0&&abs(p.x)<7.2){
      vec3 q=p;
      q.x=mod(p.x+.3,1.1)-.55;
      q.z=mod(p.z,1.5)-.75;
      float seat=ewBox(q-vec3(0.0,.44,0.0),vec3(.21,.03,.21));
      float back=ewBox(q-vec3(0.0,.70,-.18),vec3(.21,.24,.03));
      float legs=ewBox(q-vec3(0.0,.22,0.0),vec3(.19,.22,.19));
      float chair=min(min(seat,back),legs)*.75;
      if(chair<d){d=chair;m=1.0;}
    }
    vec3 bar=p-vec3(0.0,5.2,29.0);
    bar.x=mod(bar.x+1.6,3.2)-1.6;
    float lamp=ewBox(bar,vec3(.24,.16,.3));
    float rig=ewBox(p-vec3(0.0,5.5,29.0),vec3(7.4,.07,.07));
    if(rig<d){d=rig;m=1.0;}
    if(abs(p.x)<7.4&&lamp<d){d=lamp;m=2.0;}
  }else if(v==7){
    // A FIELD OF TAPE: low ground under it, reels the size of hills, and the
    // tape itself lying in long combed strands.
    float ground=ewFbm(p.xz*.02)*2.2-.2;
    d=(p.y-ground)*.6;
    // Reels the size of hills, lying over: a wound drum between two flanges.
    vec2 cell=floor(p.xz/48.0);
    float hh=ewHash(cell+seed*23.0);
    if(hh>.42){
      vec3 q=p;
      q.xz=mod(p.xz,48.0)-24.0;
      q.xz+=(vec2(ewHash(cell+3.0),ewHash(cell+9.0))-.5)*16.0;
      float r=5.0+hh*7.0;
      q.y-=r*.55;
      float rad=length(vec2(q.y,q.z));
      float wound=max(rad-r*.72,abs(q.x)-r*.34);
      float flange=max(rad-r,abs(abs(q.x)-r*.34)-.16);
      float hub=max(rad-r*.18,abs(q.x)-r*.4);
      float reel=min(min(wound,flange),hub)*.55;
      if(reel<d){d=reel;m=1.0;}
    }
    // The tape itself: combed strands lying everywhere, and loops standing up
    // out of them where it has snarled.
    vec3 t2=p;
    float comb=ewFbm(p.xz*.05+seed)*5.0;
    t2.x=mod(p.x+comb,.85)-.425;
    float lie=ewBox(t2-vec3(0.0,ground+.06,0.0),vec3(.075,.010,60.0));
    float strand=max(lie,2.0-p.z)*.8;
    if(strand<d){d=strand;m=1.0;}
    vec2 loopCell=floor(p.xz/6.0);
    float lh=ewHash(loopCell+seed*7.0);
    if(lh>.55){
      vec3 q=p;
      q.xz=mod(p.xz,6.0)-3.0;
      q.xz=ewRot(q.xz,lh*6.283);
      q.y-=ground+.5+lh*.8;
      float ring=max(abs(length(vec2(q.x,q.y))-(.45+lh*.7))-.012,abs(q.z)-.075);
      if(ring*.7<d){d=ring*.7;m=1.0;}
    }
  }else if(v==8){
    // ELLERY, DROWNED IN ASH: dunes to the horizon, the building's massing sunk
    // into them, its two towers the only things properly above it.
    float dunes=ewFbm(p.xz*.012+seed*5.0)*5.5+ewFbm(p.xz*.05)*1.0-1.0;
    d=(p.y-dunes)*.55;
    // The building itself, close enough to be one: its front range buried to the
    // first-floor sills, a wing off to the side, and the two towers clear of it.
    vec3 b=p-vec3(-4.0,0.0,58.0);
    float block=ewBox(b-vec3(0.0,7.0,0.0),vec3(26.0,7.0,16.0));
    float wing=ewBox(b-vec3(30.0,5.0,-10.0),vec3(12.0,5.0,12.0));
    float tower=ewBox(b-vec3(-17.0,19.0,4.0),vec3(4.0,19.0,4.0));
    float tower2=ewBox(b-vec3(13.0,15.0,7.0),vec3(3.2,15.0,3.2));
    float cap=ewBox(b-vec3(-17.0,38.5,4.0),vec3(4.8,.7,4.8));
    float mass=min(min(block,wing),min(min(tower,tower2),cap));
    // Windows: a row of slots cut into the front, the lower row already under ash.
    vec3 w=b-vec3(0.0,0.0,-16.0);
    w.x=mod(w.x+2.6,5.2)-2.6;
    w.y=mod(b.y-4.5,6.0)-3.0;
    float holes=max(ewBox(w,vec3(1.1,1.7,1.4)),abs(b.x)-24.0);
    mass=max(mass,-holes)*.8;
    if(mass<d){d=mass;m=1.0;}
  }else if(v==9){
    // A DEAD BROADCAST: a flat plain of static, and the mast still blinking.
    d=(p.y+.02-ewNoise(p.xz*.5)*.06)*.8;
    vec3 q=p-vec3(7.0,0.0,62.0);
    float taper=3.4-min(q.y,70.0)*.036;
    float legs=ewBox(vec3(abs(q.x)-taper,q.y-35.0,abs(q.z)-taper),vec3(.30,35.0,.30));
    float braces=ewBox(vec3(q.x,mod(q.y,5.0)-2.5,q.z),vec3(3.6,.14,.14));
    float braces2=ewBox(vec3(q.x,mod(q.y+2.5,5.0)-2.5,q.z),vec3(.14,.14,3.6));
    float lattice=max(min(braces,braces2),q.y-70.0);
    float mast=min(legs,max(lattice,-q.y))*.8;
    if(mast<d){d=mast;m=1.0;}
    // Guy wires, out to their anchors.
    vec3 g=q;
    g.xz=ewRot(g.xz,floor(atan(g.z,g.x)/2.0944+.5)*2.0944);
    float guy=max(abs(g.z)+abs(g.y*.42+g.x*.29-14.0)-.10,max(-g.x,g.x-46.0));
    if(guy*.7<d){d=guy*.7;m=1.0;}
    float blink=step(.45,ewHash1(floor(t*.8)));
    float head=ewBox(q-vec3(0.0,71.4,0.0),vec3(.75,.95,.75));
    if(head<d){d=head;m=blink>.5?2.0:1.0;}
  }
  if(uWayOut>.5){
    vec3 q=p-vec3(2.6,0.0,26.0);
    float leaf=ewBox(q-vec3(0.0,1.05,0.0),vec3(.50,1.05,.04));
    float jamb=min(ewBox(q-vec3(-.60,1.10,0.0),vec3(.10,1.10,.12)),ewBox(q-vec3(.60,1.10,0.0),vec3(.10,1.10,.12)));
    float head=ewBox(q-vec3(0.0,2.26,0.0),vec3(.70,.10,.12));
    float frame=min(jamb,head);
    float s=min(leaf,frame)*.8;
    if(s<d){d=s;m=leaf<frame?4.0:5.0;}
  }
  if(key>.5){
    float tm;
    float s=ewTower(p,v,tm);
    if(s<d){d=s;m=tm;}
  }
  return d;
}

float ewMap(vec3 p,int v,float seed,float key,float t,out float m){
  float d=ewLandscapeMap(p,v,seed,key,t,m);
  if(v>5)return d;
  // The procedural vista starts beyond the authored pocket. It cannot silently
  // put apparent support under an edge that collision treats as open sky.
  d=max(d,(v==5?90.0:34.0)-length(p.xz));
  if(v==0||v==3||v==4){
    float lower=(p.y+(v==0?3.8:v==3?2.4:2.1))*.8;
    if(lower<d){d=lower;m=0.0;}
  }
  vec3 nearP=p;
  float loss=uRealmActive*uRealmDecoherence*(1.0-uCalm);
  if(v==0)nearP.xz+=vec2(sin(p.z*3.1+t*7.0),cos(p.x*2.7+t*5.0))*loss*.19;
  if(v==2)nearP.y+=loss*.65*smoothstep(2.0,15.0,length(p.xz));
  if(v==3)nearP.x+=floor(p.z/5.0)*loss*.23;
  float pm,pd=ewPocketMap(nearP,v,pm);
  if(pd<d){d=pd;m=pm;}
  if(v==5){
    float hm,hd=ewHouseMap(p,t,hm);
    if(hd<d){d=hd;m=hm;}
    float bedroomBound=ewBox(p-vec3(0.0,1.28,${glf(HOME_BEDROOM.origin.z + HOME_BEDROOM.depth / 2)}),vec3(1.97,1.39,2.49));
    if(bedroomBound<.3){float bm,bd=ewBedroomMap(p,t,bm);if(bd<d){d=bd;m=bm;}}
    else d=min(d,bedroomBound);
  }
  return d;
}

float ewTrace(vec3 ro,vec3 rd,int v,float seed,float key,float t,float tMax,out float m){
  float dist=.05;
  m=0.0;
  float last=1e5;
  for(int i=0;i<88;i++){
    vec3 p=ro+rd*dist;
    float mm;
    float d=ewMap(p,v,seed,key,t,mm);
    if(d<min(.035,.0015*dist+.0025)){m=mm;return dist;}
    m=mm;last=d;
    dist+=max(.002,d*.85);
    if(dist>tMax)return -1.0;
  }
  return -1.0;
}

// A fissure a fixed width in metres: the noise's own slope turns "how far from
// the crack's value" into distance, so a flat patch of noise does not become a
// wide glowing pool at the doorway.
float ewFissure(vec2 xz,float scale,float widthM,float offset){
  vec2 q=xz*scale+offset;
  float n=ewNoise(q);
  float gx=ewNoise(q+vec2(.01,0.0))-ewNoise(q-vec2(.01,0.0));
  float gz=ewNoise(q+vec2(0.0,.01))-ewNoise(q-vec2(0.0,.01));
  float slope=length(vec2(gx,gz))/.02*scale;
  return 1.0-smoothstep(widthM*.5,widthM,abs(n-.5)/max(slope,.001));
}

vec3 ewFog(int v){
  if(v==0)return vec3(.25,.07,.03);
  if(v==1)return vec3(.35,.40,.33);
  if(v==2)return vec3(.55,.60,.68);
  if(v==3)return vec3(.08,.08,.10);
  if(v==4)return vec3(.09,.10,.15);
  if(v==6)return vec3(.80,.83,.87);
  if(v==7)return vec3(.42,.37,.29);
  if(v==8)return vec3(.58,.54,.48);
  if(v==9)return vec3(.34,.37,.40);
  return vec3(.86,.88,.90);
}

vec3 ewSurface(vec3 p,vec3 rd,float dist,float m,int v,float seed,float key,float t,float flash){
  float e=.02+dist*.002;
  if(v==5&&m>19.5)e=.004+min(.004,dist*.0007);
  float dm;
  vec3 n=normalize(vec3(
    ewMap(p+vec3(e,0.0,0.0),v,seed,key,t,dm)-ewMap(p-vec3(e,0.0,0.0),v,seed,key,t,dm),
    ewMap(p+vec3(0.0,e,0.0),v,seed,key,t,dm)-ewMap(p-vec3(0.0,e,0.0),v,seed,key,t,dm),
    ewMap(p+vec3(0.0,0.0,e),v,seed,key,t,dm)-ewMap(p-vec3(0.0,0.0,e),v,seed,key,t,dm)));
  vec3 sunDir=normalize(vec3(.4,.12,1.0)),sunCol=vec3(1.2,.45,.2),fog=ewFog(v),albedo=vec3(.05,.045,.045),emit=vec3(0.0),ambient=vec3(.05,.02,.02);
  float fogDensity=.006;
  if(v==0){
    albedo=m<.5?vec3(.05,.045,.045):vec3(.08);
    if(m<.5){
      float blur=max(1.0,dist*.02);
      float fine=ewFissure(p.xz,.55,.07*blur,seed*7.0);
      float wide=ewFissure(p.xz,.12,.22*blur,seed*3.0);
      float fissure=max(fine*.8,wide);
      emit=vec3(1.7,.44,.06)*fissure*(.35+.65*exp(-dist*.012));
      albedo*=.6+.9*ewNoise(p.xz*1.7);
    }
  }else if(v==1){
    sunDir=normalize(vec3(-.2,.25,1.0));sunCol=vec3(1.2);albedo=vec3(.06,.07,.06);ambient=vec3(.08,.09,.08);fogDensity=.004;
  }else if(v==2){
    sunDir=normalize(vec3(.3,-.8,.5));sunCol=vec3(1.3);albedo=m<.5?vec3(.72,.69,.62):vec3(.35,.35,.38);ambient=vec3(.18,.19,.22);fogDensity=.005;
  }else if(v==3){
    sunDir=normalize(vec3(-.5,.5,.8));sunCol=vec3(.6,.5,.4);albedo=m<.5?vec3(.26,.23,.20):vec3(.05);ambient=vec3(.03,.03,.04);fogDensity=.006;
  }else if(v==4){
    sunDir=normalize(vec3(.1,.6,.4));sunCol=vec3(.5,.55,.8);albedo=m<.5?vec3(.03,.03,.045):vec3(.22,.23,.28);ambient=vec3(.05,.05,.08);fogDensity=.004;
  }else if(v==5){
    sunDir=normalize(vec3(.2,.6,.8));sunCol=vec3(.9);albedo=m<.5?vec3(.85,.87,.90):vec3(.12);ambient=vec3(.35,.36,.38);fogDensity=.018;
  }else if(v==6){
    sunDir=normalize(vec3(.1,.8,.3));sunCol=vec3(.8,.82,.86);
    albedo=m<.5?vec3(.82,.84,.88):vec3(.30,.26,.21);ambient=vec3(.32,.33,.36);fogDensity=.010;
    if(m<.5)albedo=mix(albedo,vec3(.42,.31,.20),smoothstep(.06,.02,p.y)*.35);
  }else if(v==7){
    sunDir=normalize(vec3(-.6,.25,.6));sunCol=vec3(.95,.82,.6);
    albedo=m<.5?vec3(.22,.19,.15):vec3(.10,.09,.09);ambient=vec3(.12,.11,.09);fogDensity=.007;
    if(m>.5)albedo+=vec3(.12,.10,.07)*smoothstep(.6,1.0,abs(n.y));
  }else if(v==8){
    sunDir=normalize(vec3(.3,.45,.7));sunCol=vec3(.6,.57,.52);
    albedo=m<.5?vec3(.46,.43,.39):vec3(.24,.22,.20);ambient=vec3(.22,.21,.19);fogDensity=.009;
  }else if(v==9){
    sunDir=normalize(vec3(0.0,.9,.2));sunCol=vec3(.55,.6,.65);
    albedo=m<.5?vec3(.30,.33,.36):vec3(.18,.19,.20);ambient=vec3(.24,.26,.28);fogDensity=.008;
    if(m<.5)albedo*=.7+.6*ewHash(floor(p.xz*3.0+floor(t*12.0)*13.0));
  }
  // The way out: a door standing in the world, lit from the side he is not on.
  if(m>3.5&&m<4.5){albedo=vec3(.62,.60,.56);emit=vec3(.9,.78,.55)*.55;}
  else if(m>4.5&&m<5.5){albedo=vec3(.40,.38,.35);}
  else if(m>2.5&&m<3.5)albedo=vec3(.05,.05,.055);
  if(m>1.5&&m<2.5)emit=v==5?vec3(2.0,1.4,.6):(v==6?vec3(2.6,2.1,1.3):(v==9?vec3(2.2,.3,.2):vec3(1.1,.72,.35)));
  if(m>9.5){
    float grain=ewNoise(p.xz*7.0)*.18+ewNoise(p.xy*23.0)*.07;
    if(m<10.5){albedo=vec3(.095,.085,.082)*(1.0+grain);ambient=vec3(.18,.075,.035);}
    else if(m<11.5){albedo=vec3(.31,.33,.31)*(1.0+grain);ambient=vec3(.22,.25,.27);}
    else if(m<12.5){albedo=vec3(.40,.31,.23)*(1.0+grain);ambient=vec3(.18,.15,.14);}
    else if(m<13.5){albedo=vec3(.79,.85,.89)*(1.0+grain*.3);ambient=vec3(.43,.49,.57);}
    else if(m<14.5){albedo=vec3(.065,.075,.11);ambient=vec3(.18,.20,.30);}
    else if(m<15.5){albedo=vec3(.10,.12,.13)*(1.0+grain);ambient=vec3(.27,.30,.34);}
    else if(m<16.5){albedo=vec3(.36,.34,.30)*(1.0+grain);ambient=vec3(.34,.38,.43);}
    vec3 toLamp=vec3(${glf(HOME_WINDOW.x)},1.8,${glf(HOME_WINDOW.z)}-.15)-p;
    float warm=v==5?exp(-length(toLamp)*.30)*(.65+.35*max(0.0,dot(n,normalize(toLamp)))):0.0;
    emit+=vec3(1.0,.60,.27)*warm*.38;
    // Local practical lighting retains the bedroom's depth and materials.
    if(m>19.5&&m<39.5){
      ewBedroomMaterial(p-hbOrigin,n,rd,t,m,albedo,ambient,emit);
      sunCol=vec3(0.0);fogDensity=.0005;
    }
    if(v==5&&m>39.5&&m<49.5){
      ewHouseMaterial(p,n,m,albedo,ambient,emit);
      sunCol=vec3(0.0);fogDensity=.085;
    }
  }
  float dif=max(dot(n,sunDir),0.0);
  vec3 col=albedo*(sunCol*dif+ambient)+emit;
  col+=flash*vec3(.55,.6,1.0)*(.3+.7*max(n.y,0.0))*albedo*6.0;
  if(v==4&&(m<.5||(m>13.5&&m<14.5))){
    vec3 r=reflect(rd,n);
    r.x+=uRealmActive*uRealmDecoherence*.5*sin(p.z*2.0);
    float fresnel=pow(1.0-max(dot(-rd,n),0.0),4.0);
    col+=ewSky(r,v,seed,t,flash)*(.15+.6*fresnel);
  }
  if(uRealmActive>.5&&m>9.5){
    float cone=smoothstep(.76,.94,dot(rd,normalize(uRealmView)));
    // rd points from the camera to this surface; its direct facing term avoids
    // the black/white clipping that the station's old amplified beam produced.
    float torch=min(.75,uRealmTorch/(1.0+dist*.45+dist*dist*.08))*cone;
    col+=albedo*vec3(.88,.93,1.0)*torch*max(.12,dot(n,-rd));
  }
  // What is lit or is the tower carries through the fog, so a key door reads.
  // The snowbound house resolves out of distance haze. Its closed exterior
  // must not inherit the tower/emissive-material exemption from whiteout fog.
  // Let near masonry and closed panes separate in the engraving. A constant
  // white veil collapsed their values even after the arrival gust had passed.
  float fd=fogDensity*((v==5&&m>39.5&&m<49.5)?smoothstep(3.0,16.0,dist):(m>1.5?.35:1.0));
  return mix(col,fog,1.0-exp(-dist*fd));
}

// Ash blowing past, snow coming down: flat layers at three depths, so they
// part around you at different rates as you move.
vec3 ewParticles(vec3 ro,vec3 rd,vec3 col,float hit,int v,float t){
  if(v!=0&&v!=5&&v!=6&&v!=7&&v!=8)return col;
  // World-space flakes sampled at depths around the moving eye. There is no
  // forward-z test: turning sideways or back retains near and distant snow.
  for(int k=0;k<7;k++){
    float fk=float(k);
    float tp=1.3+fk*fk*1.6;
    if(hit>0.0&&tp>hit)continue;
    vec3 q=(ro+rd*tp)*1.1;
    if(v==5||v==6){q.y+=t*(.8+fk*.15);q.x+=t*.18;}
    else{q.x+=t*(1.1+fk*.3);q.y-=t*.2;}
    vec3 cell=floor(q),f=fract(q);
    vec2 id=cell.xy+cell.z*vec2(17.1,39.7);
    float h=ewHash(id+fk*13.1);
    vec3 delta=f-vec3(ewHash(id+3.0),ewHash(id+7.0),ewHash(id+11.0));
    vec3 crossRay=delta-rd*dot(delta,rd);
    float speck=step(.54,h)*(1.0-smoothstep(.018,.065+fk*.008,length(crossRay)))*step(abs(dot(delta,rd)),.45);
    if(v==5)speck*=1.0+uRealmDecoherence*.7*sin(fk*2.0+t*3.0);
    col=mix(col,(v==5||v==6)?vec3(.95):(v==0?vec3(1.4,.23,.025):v==8?vec3(.55,.52,.47):vec3(.18,.14,.12)),speck*((v==5||v==6)?.8:.5));
  }
  return col;
}

vec3 elsewhereSceneDepth(vec3 ro,vec3 rd,int v,float seed,float key,float t,float calm,out float surfaceHit){
  float flash=v==4?uStormFlash:0.0;
  float waterY=-.20+uRealmActive*uRealmDecoherence*2.7;
  float tWater=(v==1&&rd.y<0.0)?(waterY-ro.y)/rd.y:1e9;
  if(tWater<=0.0)tWater=1e9;
  float m;
  float hit=ewTrace(ro,rd,v,seed,key,t,min(460.0,tWater),m);
  // Transparent glazing clips exterior flakes, but furniture behind it keeps
  // its own acquisition depth. Never flatten the whole room to the glass.
  surfaceHit=hit>0.0?hit:460.0;
  vec3 col;
  if(hit>0.0){
    col=ewSurface(ro+rd*hit,rd,hit,m,v,seed,key,t,flash);
  }else if(tWater<1e8){
    vec3 p=ro+rd*tWater;
    vec2 ripple=vec2(ewNoise(p.xz*.35+t*.25),ewNoise(p.xz*.35-t*.21))-.5;
    vec3 rr=normalize(vec3(rd.x+ripple.x*.04,-rd.y,rd.z+ripple.y*.04));
    float rm;
    float rh=ewTrace(p+rr*.1,rr,v,seed,key,t,300.0,rm);
    vec3 reflected=rh>0.0?ewSurface(p+rr*rh,rr,rh,rm,v,seed,key,t,flash):ewSky(rr,v,seed,t,flash);
    float fresnel=.25+.75*pow(1.0-abs(rd.y),5.0);
    col=mix(vec3(.01,.015,.012),reflected,fresnel*.8);
    col=mix(col,vec3(.35,.40,.33),1.0-exp(-tWater*.004));
  }else if(rd.y<0.0&&v!=2){
    col=mix(ewFog(v),ewSky(vec3(rd.x,0.0,rd.z),v,seed,t,flash),.25);
  }else{
    col=ewSky(rd,v,seed,t,flash);
  }
  if(v==1&&waterY>ro.y)col=mix(col,vec3(.025,.12,.105),.72);
  if(v==5){
    // Closed glazing is composited where the physical pane intersects this ray;
    // mullions, cloth, radiator and back wall remain independent depth hits.
    float glassT=(${glf(HOME_WINDOW.z)}-ro.z)/rd.z;
    vec3 gp=ro+rd*glassT;
    vec2 pane=vec2(gp.x-(${glf(HOME_WINDOW.x)}),gp.y);
    if(glassT>0.0&&rd.z>.001&&abs(pane.x)<${glf(HOME_WINDOW.halfWidth)}&&pane.y>${glf(HOME_WINDOW.bottom)}&&pane.y<${glf(HOME_WINDOW.top)}&&(hit<0.0||glassT<hit+.03)){
      float rim=min(${glf(HOME_WINDOW.halfWidth)}-abs(pane.x),min(pane.y-${glf(HOME_WINDOW.bottom)},${glf(HOME_WINDOW.top)}-pane.y));
      float frost=(1.0-smoothstep(.015,.19,rim))*(.65+.35*ewNoise(pane*43.0));
      float fresnel=.035+.25*pow(1.0-abs(rd.z),4.0);
      // Broad irregular clear glass preserves recognition from ordinary views.
      // Breath belongs to the player outside; its phase is independent of the
      // room's exact domestic loop, and never changes the jumper's shape.
      float clear=1.0-smoothstep(.23,.62,length((pane-vec2(-.46,1.10))*vec2(1.0,.85)));
      float breath=(.035+.025*sin(t*6.2831853/7.1))*(1.0-smoothstep(.12,.36,length(pane-vec2(.08,1.50))));
      float mist=(.035+.045*ewNoise(pane*32.0))*(1.0-clear)+breath;
      col=mix(col,vec3(.62,.72,.82),clamp(fresnel+frost*.32+mist,0.0,.48));
      hit=min(hit>0.0?hit:1e5,glassT);
    }
    float gust=sin(clamp(uHomeState.w,0.0,1.0)*3.14159265);
    col=mix(col,vec3(.79,.84,.89),gust*.72);
    // Attention changes the cold exterior's presence while preserving the
    // window's world-space position and all camera control.
    float nearWindow=1.0-smoothstep(2.0,7.0,length(ro.xz-vec2(${glf(HOME_WINDOW.x)},${glf(HOME_WINDOW.z)})));
    float looking=pow(max(0.0,rd.z),6.0);
    if(m<19.5||(m>39.5&&m<49.5))col=mix(col,col*vec3(.79,.77,.74),uHomeState.z*nearWindow*looking*.45);
  }
  return ewParticles(ro,rd,col,hit,v,t);
}
vec3 elsewhereScene(vec3 ro,vec3 rd,int v,float seed,float key,float t,float calm){
  float surfaceHit;
  return elsewhereSceneDepth(ro,rd,v,seed,key,t,calm,surfaceHit);
}
`;
