// The world acquisition receives this treatment BEFORE its existing dither.
// Clinical reference informs the independence of colour, shape grouping and
// field loss; the particular progression is fiction, not a medical depiction.
const unit=n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,n)=>{const t=unit((n-a)/(b-a));return t*t*(3-2*t);};
const luma=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
export const SOURCE_REST_FACULTIES=Object.freeze({
  maximumSeparationUv:.0018,maximumPoolingUv:.032,
  minimumWorldDepth:.65,fullWorldDepth:.85,
  // Per helper sample, then complete production full/cell acquisition.
  maximumColourReads:2,maximumDepthReads:2,passMaximumColourReads:4,passMaximumDepthReads:5,extraTargets:0,extraDraws:0,
  historyTargets:0,animatedNoise:false,cameraMotion:false,
});

export function normalizeSourceRestFaculties(value){
  const enabled=value?.enabled===true,canLeave=value?.canLeave!==false,reducedMotion=value?.reducedMotion===true;
  const bounded=(key,limit=1)=>enabled?Math.min(limit,unit(value[key])):0;
  return{enabled,canLeave,reducedMotion,progression:unit(value?.progression),
    colourSeparation:reducedMotion?0:bounded('colourSeparation',canLeave?.23:1),
    colourFlattening:bounded('colourFlattening',canLeave?.32:1),
    bindingLoss:bounded('bindingLoss',canLeave?.14:1),
    fieldLoss:canLeave?0:bounded('fieldLoss'),black:canLeave?0:bounded('black')};
}

export function sourceRestFacultyUniforms(value){
  const v=normalizeSourceRestFaculties(value);
  return{uSourceRestFaculties:[v.colourSeparation,v.colourFlattening,v.bindingLoss,v.fieldLoss],
    uSourceRestFacultyState:[v.enabled?1:0,v.canLeave?1:0,v.reducedMotion?1:0,v.black]};
}

// UVs use the acquisition shader's bottom-left origin. The protection is
// explicit, rather than an accidental consequence of a darkening vignette.
function viewMask(uv,canLeave){
  if(!canLeave)return 1;
  const lower=1-smooth(.38,.55,uv[1]),
    focus=1-smooth(.13,.24,Math.hypot(uv[0]-.5,(uv[1]-.55)*.82));
  return 1-Math.max(lower,focus);
}
function islands(uv){
  const x=uv[0]-.5,y=uv[1]-.5,
    a=Math.exp(-((x+.27)**2/.036+(y-.09)**2/.19)),
    b=Math.exp(-((x-.20)**2/.12+(y+.22)**2/.027)),
    c=Math.exp(-((x-.31)**2/.024+(y-.28)**2/.065));
  return unit(.08+.64*a+.76*b+.58*c);
}
const worldGate=depth=>smooth(.65,.85,depth);
function mask(uv,depth,v){return v.enabled?viewMask(uv,v.canLeave)*worldGate(depth):0;}
function detail(uv,depth,v){
  if(!v.enabled)return 1;
  return 1-mask(uv,depth,v)*unit(v.colourFlattening*.18+v.bindingLoss*(.45+.55*islands(uv)));
}
export function sourceRestFacultyDetail(uv,depth,value){return detail(uv,depth,normalizeSourceRestFaculties(value));}
export function sourceRestFacultyVisibility(uv,depth,value){
  const v=normalizeSourceRestFaculties(value);
  if(!v.enabled)return 1;
  return (1-mask(uv,depth,v)*v.fieldLoss*(.24+.76*islands(uv)))*(1-v.black);
}

function terraced(n){
  const scaled=unit(n)*5,base=Math.floor(scaled),part=scaled-base;
  // Five broad, smoothly joined tonal regions. Clamp to the acquired value:
  // the visual loss cannot illuminate an unlit wall or an unseen obstacle.
  return Math.min(n,(base+smooth(.18,.82,part))/5);
}

/** CPU reference for controlled colour/depth fixtures. No historical frame,
 * independent time, damage, movement, sound or save state is read or written.
 * sampleAt returns undithered RGB; depthAt returns actual view metres. */
export function sourceRestFacultyColour(colour,uv,depth,value,{sampleAt=()=>colour,depthAt=()=>depth}={}){
  const v=normalizeSourceRestFaculties(value),original=colour.map(n=>Math.max(0,Number(n)||0));
  if(!v.enabled)return original;
  const gain=mask(uv,depth,v),flat=v.colourFlattening,binding=v.bindingLoss,
    spread=v.colourSeparation>0?.0018*v.colourSeparation:.032*Math.max(flat,binding);
  let changed=original;
  if(gain>0&&spread>0){
    const dx=uv[0]-.5,dy=uv[1]-.5,length=Math.hypot(dx,dy),
      axis=length>.0001?[dx/length,dy/length]:[1,0],
      direction=[axis[0]*.8660254-axis[1]*.5,axis[0]*.5+axis[1]*.8660254],
      tolerance=Math.max(.18,depth*.08),
      neighbour=sign=>{
        const at=uv.map((n,k)=>clamp(n+direction[k]*spread*sign,.001,.999)),
          agreement=1-smooth(tolerance,tolerance*2,Math.abs(depthAt(at)-depth)),sample=sampleAt(at);
        return original.map((n,k)=>mix(n,Math.max(0,Number(sample[k])||0),agreement));
      },plus=neighbour(1),minus=neighbour(-1),
      separated=[plus[0],original[1],minus[2]],
      pooled=original.map((n,k)=>n*.5+(plus[k]+minus[k])*.25),
      poolGain=unit(flat*.82+binding*.18);
    changed=original.map((n,k)=>mix(mix(n,separated[k],v.colourSeparation),pooled[k],poolGain));
    const planes=changed.map(terraced);
    changed=changed.map((n,k)=>mix(n,planes[k],flat));
    const oldLuma=luma(original),newLuma=luma(changed),lightLimit=newLuma>oldLuma?oldLuma/Math.max(.000001,newLuma):1;
    changed=original.map((n,k)=>mix(n,changed[k]*lightLimit,gain));
  }
  return changed;
}

// Assumes the acquisition pass already declares uSrc and uDepth. It adds two
// RGB + two depth reads PER CALL when spatial simplification/separation is active.
// Production full/cell sampling totals four RGB + five depth reads (one is the
// cell-centre depth lookup), with no extra read when the owner is disabled.
// Apply to full/cell samples before grading and one-bit acquisition, and use
// sourceRestFacultyDetail on generated contours/engraving so they cannot
// reconstruct the object grouping removed from the acquired image.
export const SOURCE_REST_FACULTIES_GLSL=`
uniform vec4 uSourceRestFaculties;
uniform vec4 uSourceRestFacultyState;
float sourceRestFacultyWorldGate(float depth){return smoothstep(.65,.85,depth);}
float sourceRestFacultyMask(vec2 uv,float depth){
  if(uSourceRestFacultyState.x<.5)return 0.0;
  float protection=0.0;
  if(uSourceRestFacultyState.y>.5){
    float lower=1.0-smoothstep(.38,.55,uv.y);
    float focus=1.0-smoothstep(.13,.24,length((uv-vec2(.5,.55))*vec2(1.0,.82)));
    protection=max(lower,focus);
  }
  return (1.0-protection)*sourceRestFacultyWorldGate(depth);
}
float sourceRestFacultyIslands(vec2 uv){
  vec2 q=uv-vec2(.5);
  float a=exp(-((q.x+.27)*(q.x+.27)/.036+(q.y-.09)*(q.y-.09)/.19));
  float b=exp(-((q.x-.20)*(q.x-.20)/.12+(q.y+.22)*(q.y+.22)/.027));
  float c=exp(-((q.x-.31)*(q.x-.31)/.024+(q.y-.28)*(q.y-.28)/.065));
  return clamp(.08+.64*a+.76*b+.58*c,0.0,1.0);
}
float sourceRestFacultyDetail(vec2 uv,float depth){
  if(uSourceRestFacultyState.x<.5)return 1.0;
  float loss=clamp(uSourceRestFaculties.y*.18+uSourceRestFaculties.z*(.45+.55*sourceRestFacultyIslands(uv)),0.0,1.0);
  return 1.0-sourceRestFacultyMask(uv,depth)*loss;
}
float sourceRestFacultyVisibility(vec2 uv,float depth){
  if(uSourceRestFacultyState.x<.5)return 1.0;
  float missing=uSourceRestFaculties.w*(.24+.76*sourceRestFacultyIslands(uv));
  return (1.0-sourceRestFacultyMask(uv,depth)*missing)*(1.0-uSourceRestFacultyState.w);
}
vec3 sourceRestFacultyNeighbour(vec2 uv,vec3 original,float depth){
  vec2 at=clamp(uv,vec2(.001),vec2(.999));
  float packed=texture(uDepth,at).a;
  float sourceDepth=max(0.0,(1.0/max(packed,.000001)-1.0)/.14);
  float tolerance=max(.18,depth*.08);
  float agreement=1.0-smoothstep(tolerance,tolerance*2.0,abs(sourceDepth-depth));
  return mix(original,texture(uSrc,at).rgb,agreement);
}
vec3 sourceRestFacultyColour(vec3 original,vec2 uv,float depth){
  if(uSourceRestFacultyState.x<.5)return original;
  float gain=sourceRestFacultyMask(uv,depth);
  float separation=uSourceRestFacultyState.z>.5?0.0:uSourceRestFaculties.x;
  float flattening=uSourceRestFaculties.y,binding=uSourceRestFaculties.z;
  float spread=separation>0.0?.0018*separation:.032*max(flattening,binding);
  vec3 changed=original;
  if(gain>0.0&&spread>0.0){
    vec2 relative=uv-vec2(.5);
    vec2 axis=length(relative)>.0001?normalize(relative):vec2(1.0,0.0);
    vec2 direction=vec2(axis.x*.8660254-axis.y*.5,axis.x*.5+axis.y*.8660254);
    vec3 plus=sourceRestFacultyNeighbour(uv+direction*spread,original,depth);
    vec3 minus=sourceRestFacultyNeighbour(uv-direction*spread,original,depth);
    vec3 separated=vec3(plus.r,original.g,minus.b);
    vec3 pooled=original*.5+(plus+minus)*.25;
    changed=mix(mix(original,separated,separation),pooled,clamp(flattening*.82+binding*.18,0.0,1.0));
    vec3 scaled=clamp(changed,0.0,1.0)*5.0;
    vec3 planes=min(changed,(floor(scaled)+smoothstep(vec3(.18),vec3(.82),fract(scaled)))/5.0);
    changed=mix(changed,planes,flattening);
    float oldLuma=dot(original,vec3(.2126,.7152,.0722));
    float newLuma=dot(changed,vec3(.2126,.7152,.0722));
    float lightLimit=newLuma>oldLuma?oldLuma/max(.000001,newLuma):1.0;
    changed=mix(original,changed*lightLimit,gain);
  }
  return changed;
}
`;
