// Metre-pinned architectural relief, shared by marched walls and native props.
// The caller decides surface eligibility and clears the amount outside play.
// This alters incident material response; it emits no light or screen image.
export const STILLNESS_FACE_REVISION='anatomical-pressure-1';
export const STILLNESS_FACES_GLSL = `
// stillness-material-version:anatomical-pressure-1
uniform vec4 uStillnessState; // amount, profile (ordinary / II / III), time, reduced motion
uniform float uStillnessTreatment; // 0 legacy reference, 1 native anatomical relief, 2 off
uniform vec3 uStillnessAnchor;
uniform vec3 uStillnessDirection;

float sfHash(vec2 p){
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}
float sfBell(vec2 p){return exp(-dot(p,p)*2.0);}
float sfLine(float distanceM,float widthM){
  float q=distanceM/max(.001,widthM);return exp(-q*q*2.0);
}
void sfBasis(vec3 axis,out vec3 right,out vec3 up){
  vec3 reference=abs(axis.y)>.82?vec3(0.0,0.0,1.0):vec3(0.0,1.0,0.0);
  right=normalize(cross(axis,reference));up=normalize(cross(right,axis));
}

// q is a head-local coordinate. Eyes are unequal cavities under one tense
// supraorbital bar; no pupils, smile curve or independently floating features.
vec4 sfAnatomy(vec2 q,float identity,float clock,float motion,float severity){
  float asymmetry=(identity-.5)*.13;
  float breath=sin(clock*.39+identity*6.2831853)*motion;
  q.x+=asymmetry*q.y+sin(q.y*3.2+identity*8.0)*.018;
  q.y*=1.0+breath*.015;
  float cranium=length(q/vec2(.70,1.08));
  float coverage=1.0-smoothstep(1.0,1.34,cranium);
  if(coverage<.0001)return vec4(0.0);

  float leftY=.23+asymmetry*.28,rightY=.215-asymmetry*.48;
  vec2 left=q-vec2(-.245,leftY),right=q-vec2(.235,rightY);
  left.y+=left.x*.20;right.y-=right.x*.29;
  float leftSocket=sfBell(left/vec2(.205,.139));
  float rightSocket=sfBell(right/vec2(.178,.158));
  float sockets=max(leftSocket,rightSocket);
  float eyeSlits=max(sfBell(left/vec2(.17,.030)),sfBell(right/vec2(.148,.025)));
  float browY=.36-.19*abs(q.x)+asymmetry*q.x;
  float brow=sfLine(q.y-browY,.048)*(1.0-smoothstep(.35,.54,abs(q.x)));
  float lowerOrbit=max(sfBell((left-vec2(-.018,-.115))/vec2(.20,.037)),
                       sfBell((right-vec2(.012,-.125))/vec2(.17,.035)));

  float bridge=sfBell((q-vec2(asymmetry*.3,.11))/vec2(.075,.31));
  float nose=sfBell((q-vec2(.018+asymmetry*.4,-.115))/vec2(.118,.11));
  float nostrils=max(sfBell((q-vec2(-.075,-.165))/vec2(.046,.035)),
                     sfBell((q-vec2(.092,-.155))/vec2(.042,.029)));
  float cheek=max(sfBell((q-vec2(-.39,-.03))/vec2(.15,.25)),
                  sfBell((q-vec2(.36,-.065))/vec2(.13,.28)));

  // A drawn-down jaw changes with the slow breath. The uneven mouth stays a
  // single wound in the same material, with a lower lip instead of a smile.
  float opening=mix(.028,.19+severity*.085,smoothstep(.16,.92,uStillnessState.x))+breath*.012;
  vec2 mouth=q-vec2(asymmetry*.75,-.47-severity*.045);
  mouth.x+=mouth.y*(.11+asymmetry);
  float mouthWidth=.112+severity*.041+clamp(-mouth.y,0.0,.25)*.12;
  float mouthCavity=sfBell(mouth/vec2(mouthWidth,opening));
  float lowerLip=sfBell((mouth-vec2(.012,-opening*.90))/vec2(mouthWidth*1.03,.038));
  float jaw=sfBell((q-vec2(asymmetry*.5,-.79))/vec2(.24,.115));
  float cheekFold=sfLine(abs(q.x)-(.17-q.y*.22+asymmetry),.027)
    *(1.0-smoothstep(-.10,.06,q.y))*(1.0-smoothstep(.54,.76,-q.y));
  float foreheadFold=sfLine(abs(q.x)-.046-asymmetry*.12,.015)
    *smoothstep(.30,.42,q.y)*(1.0-smoothstep(.61,.77,q.y));

  float dark=clamp(sockets*.78+eyeSlits*.33+nostrils*.47+mouthCavity*.98
    +cheekFold*.24+foreheadFold*.17,0.0,1.0);
  float ridge=clamp(brow*.64+bridge*.55+nose*.46+cheek*.39
    +lowerOrbit*.26+lowerLip*.27+jaw*.21,0.0,1.0);
  float heightM=(ridge*.049-sockets*.043-mouthCavity*(.058+severity*.055)
    -cheekFold*.012-foreheadFold*.009)*(1.0+breath*.035);
  return vec4(heightM,dark,ridge,1.0)*coverage;
}

vec4 sfOrdinary(vec3 p,vec3 normal,float clock,float motion,float curated){
  float surface=mix(1.0-smoothstep(.40,.86,abs(normal.y)),1.0,curated);
  if(surface<.0001)return vec4(0.0);
  vec3 axis;
  if(abs(normal.y)>.72)axis=vec3(0.0,normal.y<0.0?-1.0:1.0,0.0);
  else if(abs(normal.x)>abs(normal.z))axis=vec3(normal.x<0.0?-1.0:1.0,0.0,0.0);
  else axis=vec3(0.0,0.0,normal.z<0.0?-1.0:1.0);
  vec3 right,up;sfBasis(axis,right,up);
  // A bout latches this origin once. Looking never translates the field.
  // The nearest course forms at bodily height instead of missing a whole
  // short wall because its fixed world grid falls above the player's view.
  vec3 origin=uStillnessAnchor;
  if(uStillnessState.y>1.5)origin.y=9.44;
  vec3 local=p-origin;
  vec2 uv=vec2(dot(local,right),dot(local,up))+vec2(1.60,1.55);
  float row=floor(uv.y/3.10);
  uv.x+=row*.87; // staggered courses, not a rectangular wallpaper grid
  vec2 cell=floor(uv/vec2(3.20,3.10));
  float identity=sfHash(cell+axis.xz*11.0);
  vec2 jitter=vec2(sfHash(cell+17.1),sfHash(cell+43.7))-.5;
  vec2 centre=(cell+.5+jitter*.20)*vec2(3.20,3.10);
  float scale=.78+sfHash(cell+8.9)*.35;
  vec2 q=(uv-centre)/(vec2(.76,.95)*scale);
  float lean=(sfHash(cell+61.3)-.5)*.32;
  q=mat2(cos(lean),-sin(lean),sin(lean),cos(lean))*q;
  // Some courses remain only suggestive; a second area need not repeat the
  // same complete face. The identity and incomplete fragments stay pinned.
  float presence=.80+.20*smoothstep(.17,.68,identity);
  return sfAnatomy(q,identity,clock,motion,.35+identity*.5)*presence*surface;
}

// x signed relief metres; y dark cavities; z lit bone ridges; w coverage.
// No hidden surface, silhouette, collision or supported landing is invented.
vec4 stillnessFaceRelief(vec3 p,vec3 normal){
  float amount=clamp(uStillnessState.x,0.0,1.0);
  if(amount<.0001)return vec4(0.0);
  float profile=uStillnessState.y,curated=step(.5,profile);
  float motion=1.0-step(.5,uStillnessState.w);
  float clock=uStillnessState.z;
  vec3 n=normalize(normal);
  vec4 ordinary=sfOrdinary(p,n,clock,motion,curated);
  if(curated<.5)return ordinary*amount;

  vec3 axis=dot(uStillnessDirection,uStillnessDirection)>.01
    ?normalize(uStillnessDirection):vec3(0.0,1.0,0.0);
  vec3 right,up;sfBasis(axis,right,up);
  vec3 delta=p-uStillnessAnchor;
  vec2 uv=vec2(dot(delta,right),dot(delta,up));
  float depth=dot(delta,axis);
  vec4 giant;
  if(profile<1.5){
    // One face spans the II bay. Its absent material remains the real window
    // aperture; adjacent jambs, head and sill carry the surviving anatomy.
    // The real aperture is1.30m wide. This spacing places the unequal eyes
    // across its jambs and the drawn-down mouth on its lower sill, rather
    // than hiding every diagnostic feature inside the absent window pixels.
    vec2 q=uv/vec2(2.45,1.75);
    q.x+=q.y*q.y*.055;
    float reach=1.0-smoothstep(.55,4.5,abs(depth));
    float alignment=.34+.66*abs(dot(n,axis));
    giant=sfAnatomy(q,.79,clock*.82,motion,1.0)*reach*alignment;
    // The aperture itself has no receiving fragments. Two compressed faces
    // take its actual surviving jambs; the giant remains split by the opening.
    vec4 north=sfAnatomy((uv-vec2(.90,-.04))/vec2(.30,.40),.72,clock*.82,motion,1.15);
    vec4 south=sfAnatomy((uv-vec2(-.85,-.06))/vec2(.25,.45),.18,clock*.73,motion,1.25);
    vec4 jamb=max(north,south)*reach*alignment;
    giant=vec4(giant.x+jamb.x*1.6,max(giant.y,jamb.y),max(giant.z,jamb.z),max(giant.w,jamb.w));
    giant.x*=2.35;
    return vec4(giant.x+ordinary.x*.20,
      max(giant.y,ordinary.y*.24),max(giant.z,ordinary.z*.22),
      max(giant.w,ordinary.w*.24))*amount;
  }

  // III projects an enormous, incompatible anatomy through successive real
  // receiving shelves. Each depth course is slightly misregistered; joints
  // and unsupported gaps physically interrupt the recognition.
  float course=floor((depth+2.1)/6.9);
  float misregister=(sfHash(vec2(course,19.3))-.5)*1.8;
  vec2 q=(uv+vec2(misregister,misregister*.43))/vec2(13.5,17.0);
  giant=sfAnatomy(q,.24,clock*.57,motion,1.25);
  giant.x*=3.1;
  vec4 nested=sfAnatomy((uv-vec2(-5.4,6.7))/vec2(4.2,5.3),
    .91,clock*.73,motion,.92);
  // The seated eye cannot see four receiving floors at once. A nearby head
  // turns up out of the existing top sheet, beside the counterweight's start;
  // the much larger anatomy remains discoverable through the lower shelves.
  vec3 nearDelta=p-vec3(-166.3,8.4,-83.7);
  vec2 nearUv=vec2(dot(nearDelta,right),dot(nearDelta,axis));
  vec4 nearHead=sfAnatomy(nearUv/vec2(.90,1.30),.63,clock*.66,motion,1.35)
    *smoothstep(.55,.90,abs(n.y))*(1.0-smoothstep(.12,.75,abs(p.y-8.4)));
  float reach=1.0-smoothstep(42.0,90.0,abs(depth));
  return vec4(giant.x+nested.x*.52+ordinary.x*.75+nearHead.x*2.0,
    max(nearHead.y,max(giant.y,max(nested.y*.82,ordinary.y*.94))),
    max(nearHead.z,max(giant.z,max(nested.z*.70,ordinary.z*.80))),
    max(nearHead.w,max(giant.w,max(nested.w*.82,ordinary.w*.94))))*reach*amount;
}

void stillnessFaceNormal(inout vec3 n,vec3 p,vec4 field){
  if(uStillnessState.x<.0001)return;
  // The already evaluated physical height supplies its screen derivatives.
  // Re-evaluating the complete anatomy twice per pixel tripled shader cost.
  // Evaluate derivatives before the coverage guard so adjacent empty samples
  // still form a well-defined surface gradient at the head's boundary.
  vec3 dx=dFdx(p),dy=dFdy(p),r1=cross(dy,n),r2=cross(n,dx);
  vec2 dh=vec2(dFdx(field.x),dFdy(field.x));float determinant=dot(dx,r1);
  if(field.w<.0001||abs(determinant)<1e-10)return;
  vec3 gradient=(r1*dh.x+r2*dh.y)/determinant;
  n=normalize(n-clamp(gradient,vec3(-1.15),vec3(1.15)));
}
vec3 stillnessFaceAlbedo(vec3 base,vec4 field){
  if(uStillnessState.x<.0001||field.w<.0001)return base;
  // The head first separates as strained material. Keeping the old high-
  // contrast pattern at full strength made its eyes read as random glyphs.
  // Its stock still receives the actual incident light and occlusion.
  float body=smoothstep(.06,.70,field.w)*.94;
  vec3 raised=mix(base,vec3(.58,.60,.53),max(body,clamp(field.z*.78,0.0,.78)));
  return raised*(1.0-clamp(field.y,0.0,1.0)*.89)
    *(1.0+clamp(field.z,0.0,1.0)*.24);
}
vec3 stillnessFaceOcclusion(vec3 shaded,vec4 field){
  // Cavities also absorb the grazing finish. Otherwise Source's reflective
  // printed stock lights a hollow eye back to white after the albedo changed.
  // This removes incident energy; it is never a luminous face or overlay.
  return shaded*(1.0-smoothstep(.07,.48,field.y));
}
float stillnessFacePigment(float coverage,float polarity,vec4 field){
  // Printed Source deliberately reconstructs its glyph coverage after shading.
  // Its stock must carry the same relief into that coverage contract, or the
  // acquisition pass erases the facial cavities and draws the old glyphs back.
  // Only depth-winning eligible architectural fragments supply a nonzero field.
  float cavity=smoothstep(.06,.55,field.y),ridge=smoothstep(.10,.62,field.z)*.84;
  float body=smoothstep(.06,.70,field.w)*.82;
  // A head's stock displaces the old print before the sockets open. This
  // retains the original writing outside the emerging architectural tissue.
  float value=mix(coverage,polarity>1.5?1.0:0.0,body);
  value=mix(value,polarity>1.5?0.0:1.0,cavity);
  return mix(value,polarity>1.5?1.0:0.0,ridge);
}
void stillnessFaceMaterial(inout vec3 base,inout vec3 n,vec3 p){
  if(uStillnessState.x<.0001)return;
  vec4 field=stillnessFaceRelief(p,n);
  stillnessFaceNormal(n,p,field);
  base=stillnessFaceAlbedo(base,field);
}
`;
