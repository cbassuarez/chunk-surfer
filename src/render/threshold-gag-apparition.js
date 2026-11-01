// One false-Ellery presence. Existing apparition/emergency states are unchanged.
// The held body is a scaffold for incomplete pressure, never a lit figure.
export const THRESHOLD_GAG_APPARITION_VERTEX_GLSL=`
  if(aPortrait>14.5&&aPortrait<15.5){
    float seed=dot(aM3.xz+uWorldPatternOffset.xz,vec2(.19,.31));
    local.x=local.x*.70+.035*sin(local.y*5.7+seed);
    local.z*=.45;
  }
`;

export const THRESHOLD_GAG_APPARITION_FUNCTIONS_GLSL=`
float thresholdPressureHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float thresholdPressureNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(thresholdPressureHash(i),thresholdPressureHash(i+vec3(1,0,0)),f.x),
                 mix(thresholdPressureHash(i+vec3(0,1,0)),thresholdPressureHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(thresholdPressureHash(i+vec3(0,0,1)),thresholdPressureHash(i+vec3(1,0,1)),f.x),
                 mix(thresholdPressureHash(i+vec3(0,1,1)),thresholdPressureHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
`;

export const THRESHOLD_GAG_APPARITION_FRAGMENT_GLSL=`
  if(vPortrait==15){
    vec3 p=vSourceSurroundingsLocal;
    // Lose the skull cap, shoulder boundary, hands, leg split and feet. Soft
    // envelopes end inside the source mesh, so its contour cannot outline us.
    float side=1.0-smoothstep(.055,.245,abs(p.x+.024*sin(p.y*6.1)));
    float height=smoothstep(.42,.94,p.y)*(1.0-smoothstep(1.38,1.79,p.y));
    float islands=thresholdPressureNoise((vWorld+uWorldPatternOffset)*vec3(5.8,3.6,5.8));
    float torn=smoothstep(.30,.76,islands);
    float facing=pow(abs(dot(normalize(vNormal),normalize(uEye-vWorld))),1.1);
    float coverage=clamp(vEmissive.a,0.0,1.0)*.72*side*height*torn*(.26+.74*facing);
    // World-pinned grain; normal head movement cannot boil or refill a body.
    float grain=thresholdPressureHash(floor((vWorld+uWorldPatternOffset)*vec3(190,155,190)));
    if(grain>coverage)discard;
    o=vec4(.008,.010,.011,1.0);
    oSurfaceMarks=uSourceRoomLighting>.5?vec4(0.0,.5,.5,0.0):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
    return;
  }
`;
