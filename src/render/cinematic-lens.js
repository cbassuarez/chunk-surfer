// Optical units are millimetres at the lens and metres in the world. This is
// frame-owned: ordinary play has no lens owner and uses its established view.
export const ORDINARY_CAMERA_TAN_HALF_FOV = .95;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function cinematicLens(value) {
  if (!value || !['focalLengthMm', 'sensorHeightMm', 'focusDistanceM', 'apertureFNumber', 'maxBlurPx'].every(k => Number.isFinite(value[k]))) return null;
  return {
    focalLengthMm: clamp(value.focalLengthMm, 8, 120),
    sensorHeightMm: clamp(value.sensorHeightMm, 12, 36),
    focusDistanceM: clamp(value.focusDistanceM, .2, 500),
    apertureFNumber: clamp(value.apertureFNumber, 1.2, 32),
    maxBlurPx: clamp(value.maxBlurPx, 0, 12),
  };
}
export function cinematicTanHalfFov(lens) {
  const l = cinematicLens(lens);
  return l ? l.sensorHeightMm / (2 * l.focalLengthMm) : ORDINARY_CAMERA_TAN_HALF_FOV;
}
// Signed circle-of-confusion radius in final output pixels. Negative is in
// front of the focus plane. Axial view depth, never radial camera distance.
export function cinematicCircleOfConfusion(depthM, lens, outputHeight) {
  const l = cinematicLens(lens);
  if (!l || !Number.isFinite(depthM) || depthM <= 0 || !Number.isFinite(outputHeight)) return 0;
  const f = l.focalLengthMm, s = l.focusDistanceM * 1000, z = depthM * 1000;
  const diameter = f * f * (z - s) / (l.apertureFNumber * z * (s - f));
  return clamp(.5 * diameter * outputHeight / l.sensorHeightMm, -l.maxBlurPx, l.maxBlurPx);
}

// One bounded gather after world acquisition, before the game glass/grain and
// UI. The original merged view-depth is kept separately, so engraving does not
// turn into a second, incorrect depth layer. Also supports the DEV pre-print
// comparison; production selects post-print after the matched study.
export const CINEMATIC_LENS_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSource,uDepth;
uniform vec2 uResolution;
uniform vec4 uOptics; // focal mm, sensor height mm, focus metres, f-number
uniform float uOutputHeight,uMaxBlur;
out vec4 o;
float depthAt(vec2 uv){return max(.02,(1.0/max(texture(uDepth,uv).a,.0001)-1.0)/.14);}
float coc(float z){
  float f=uOptics.x,s=uOptics.z*1000.0;
  float diameter=f*f*(z*1000.0-s)/(uOptics.w*z*1000.0*(s-f));
  return clamp(.5*diameter*uOutputHeight/uOptics.y,-uMaxBlur,uMaxBlur);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;
  vec4 centre=texture(uSource,uv);
  float z=depthAt(uv),r=coc(z),radius=abs(r);
  if(radius<.35){o=centre;return;}
  vec3 colour=centre.rgb;float weight=1.0;
  // Stable rotated disk, no animated noise or focus shimmer. Samples which
  // cross a nearer occluder are rejected for background pixels. Near blur is
  // limited to its own support: a single depth layer cannot reveal a surface
  // hidden behind an actor and must not invent it by smearing a halo outward.
  for(int i=0;i<20;i++){
    float n=float(i)+.5,a=n*2.39996323;
    vec2 sampleUV=clamp(uv+vec2(cos(a),sin(a))*sqrt(n/20.0)*radius/uOutputHeight*vec2(uResolution.y/uResolution.x,1.0),vec2(.001),vec2(.999));
    float sampleZ=depthAt(sampleUV),sampleR=coc(sampleZ);
    float tolerance=max(.035,z*.012);
    float w=sampleZ<z-tolerance?0.0:1.0;
    if(r<0.0)w*=1.0-smoothstep(tolerance,tolerance*4.0,abs(sampleZ-z));
    // Do not erase a sharply focused foreground edge with its background.
    w*=smoothstep(.05,.75,max(radius,abs(sampleR)));
    colour+=texture(uSource,sampleUV).rgb*w;weight+=w;
  }
  o=vec4(colour/weight,centre.a);
}`;

export function createCinematicLensPass(gl) {
  let program = null, target = null, texture = null, width = 0, height = 0, floatingTarget = false;
  const locations = new Map(), status = { active: false, frames: 0, error: null, lens: null, stage: null };
  function shader(type, source) {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  function prepare(w, h, floating) {
    if (!program) {
      const vertex = shader(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1&2),(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0,1);}');
      const fragment = shader(gl.FRAGMENT_SHADER, CINEMATIC_LENS_FRAGMENT);
      program = gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
      gl.deleteShader(vertex);gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    }
    if (width === w && height === h && floatingTarget === floating && texture) return;
    if (texture) gl.deleteTexture(texture);if(target)gl.deleteFramebuffer(target);
    width=w;height=h;floatingTarget=floating;texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    // The DEV pre-print comparison still feeds source alpha into the world's
    // edge/material acquisition. Match the original scene's floating depth;
    // the post-print production target only carries already acquired colour.
    gl.texImage2D(gl.TEXTURE_2D,0,floating?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,floating?gl.FLOAT:gl.UNSIGNED_BYTE,null);
    for (const pname of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,pname,gl.LINEAR);
    for (const pname of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,pname,gl.CLAMP_TO_EDGE);
    target=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,target);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Cinematic lens framebuffer incomplete');
  }
  const u = name => {if(!locations.has(name))locations.set(name,gl.getUniformLocation(program,name));return locations.get(name);};
  return {
    run(source, depth, value, { width:w, height:h, outputHeight=h, stage='post-print' }={}) {
      const lens=cinematicLens(value);status.active=!!lens&&lens.maxBlurPx>0;status.lens=lens;status.stage=status.active?stage:null;
      if(status.error){status.active=false;return source;}
      if(!status.active)return source;
      try {
        prepare(w,h,stage==='pre-print');gl.bindFramebuffer(gl.FRAMEBUFFER,target);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,w,h);
        gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindVertexArray(null);gl.useProgram(program);
        for(const [unit,name,t] of [[0,'uSource',source],[1,'uDepth',depth]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(u(name),unit);}
        gl.uniform2f(u('uResolution'),w,h);gl.uniform4f(u('uOptics'),lens.focalLengthMm,lens.sensorHeightMm,lens.focusDistanceM,lens.apertureFNumber);
        gl.uniform1f(u('uOutputHeight'),outputHeight);gl.uniform1f(u('uMaxBlur'),lens.maxBlurPx);gl.drawArrays(gl.TRIANGLES,0,3);status.frames++;return texture;
      } catch(error) {status.error=String(error.message||error);status.active=false;return source;}
    },
    inactive(){status.active=false;status.lens=null;status.stage=null;},
    status(){return {...status,lens:status.lens&&{...status.lens},width,height,targetFormat:texture?(floatingTarget?'rgba16f':'rgba8'):null};},
    dispose(){if(texture)gl.deleteTexture(texture);if(target)gl.deleteFramebuffer(target);if(program)gl.deleteProgram(program);texture=target=program=null;width=height=0;locations.clear();},
  };
}
