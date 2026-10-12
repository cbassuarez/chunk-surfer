// Browser-intercepted research instrumentation only. No production source edits.
// Shared inks are the real recording-acquisition inks. This miniature hatch is
// a study approximation; it does not execute the game's full recorder kernel.
export const SOURCE_OVERWORLD_VARIANTS = Object.freeze({
  opened: { label: 'One continuous world' },
  negative: { label: 'Its photographic negative' },
  rooms: { label: 'Rooms leaking through' },
});

export function patchSourceOverworldRuntime(text) {
  const original = 'intervalStability: understood / 3,';
  if (!text.includes(original)) throw new Error('Source look metadata marker changed');
  return text.replace(original, `${original}\n      studyOriginM: [o.x * .5, o.y * .5 + SOURCE_HANGING_SHORE.bank.frontZ],`);
}

export function patchSourceOverworldModule(text, variant) {
  if (!SOURCE_OVERWORLD_VARIANTS[variant]) throw new Error(`Unknown integration study: ${variant}`);
  const start = text.indexOf('const TEXT_SPACE_FRAG =');
  const end = text.indexOf('const COPY_FRAG =', start);
  if (start < 0 || end < 0) throw new Error('Source compositor markers changed');
  let shader = text.slice(start, end);
  shader = shader.replace('uniform sampler2D uText;', `uniform sampler2D uText;
uniform sampler2D uStudyDepth;
uniform vec3 uStudyEye;
uniform vec2 uStudyNearFar, uStudyOrigin;`);
  const main = 'void main(){\n  vec2 uv=gl_FragCoord.xy/uRes;';
  if (!shader.includes(main)) throw new Error('Source compositor entry changed');
  shader = shader.replace(main, `
vec3 studyWorldAt(vec2 uv){
  vec2 p=(uv*2.0-1.0)*vec2(uRes.x/uRes.y*.95,.95);
  vec3 ray=normalize(vec3(p,1.0));
  float cp=cos(uView.y),sp=sin(uView.y);
  ray=vec3(ray.x,ray.y*cp+ray.z*sp,-ray.y*sp+ray.z*cp);
  vec3 wd=vec3(ray.x*cos(uView.x)+ray.z*sin(uView.x),ray.y,ray.x*sin(uView.x)-ray.z*cos(uView.x));
  vec3 fwd=vec3(sin(uView.x)*cp,sp,-cos(uView.x)*cp);
  float z=texture(uStudyDepth,uv).r*2.0-1.0;
  float linear=2.0*uStudyNearFar.x*uStudyNearFar.y/max(.0001,uStudyNearFar.y+uStudyNearFar.x-z*(uStudyNearFar.y-uStudyNearFar.x));
  return uStudyEye+wd*(linear/max(.001,dot(wd,fwd)));
}
float studyRecordedMark(vec3 world,float tone){
  // Screen-space fine hatch plus world-position density variation. The latter
  // uses real depth; this is not the full material mark/grain buffer.
  float hatch=fract((gl_FragCoord.x*.58+gl_FragCoord.y*.82)/3.4);
  float irregular=sourceHash(floor(world.xz*23.0)+floor(world.y*17.0));
  float threshold=clamp(hatch*.77+irregular*.23,0.0,1.0);
  return step(threshold,clamp(tone,0.0,1.0));
}
${main}`);
  shader = shader.replace('vec3(.72,.77,.80),moon*.86*uMoonCloud.x', 'vec3(.72,.77,.80),0.0');
  const original = `  vec3 paper=vec3(.965,.925,.835);
  vec3 paperScene=mix(paper,vec3(.012,.010,.009),smoothstep(.02,.72,glyphAlpha));
  float lightMix=clamp(max(uSunrise,uPaper*.72),0.0,1.0);
  vec3 composed=mix(darkScene,paperScene,lightMix);`;
  if (!shader.includes(original)) throw new Error('Source paper block changed');

  const common = `
  vec3 recorderDark=vec3(.0015,.0050,.0045);
  vec3 recorderLight=vec3(.835,.945,.885);
  vec3 worldHit=studyWorldAt(uv);
  vec3 localHit=worldHit-vec3(uStudyOrigin.x,0.0,uStudyOrigin.y);
  float fieldDepth=max(0.0,uStudyOrigin.y-uStudyEye.z);
  vec3 materialRGB=clamp(center.rgb/max(center.a,.025),0.0,1.0);
  float rawEnergy=dot(materialRGB,vec3(.2126,.7152,.0722));
  float materialValue=pow(clamp(rawEnergy,0.0,1.0),.29);
  float peak=max(.0001,max(materialRGB.r,max(materialRGB.g,materialRGB.b)));
  float warmRole=smoothstep(.12,.70,(materialRGB.r-materialRGB.b)/peak);
  float signalRole=smoothstep(.10,.50,(max(materialRGB.g,materialRGB.b)-materialRGB.r)/peak)*smoothstep(.12,.50,rawEnergy);
  vec3 chroma=clamp((materialRGB-vec3(rawEnergy))/max(.06,rawEnergy),vec3(-.55),vec3(.55));
  vec3 materialInk=clamp(recorderLight+chroma*.145,.62,1.0);
  materialInk*=dot(recorderLight,vec3(.2126,.7152,.0722))/max(.001,dot(materialInk,vec3(.2126,.7152,.0722)));
  materialInk=mix(materialInk,vec3(.97,.84,.65),warmRole*smoothstep(.07,.40,rawEnergy)*.44);
  // Low-power real props keep their value ordering; luminous code is restrained.
  float formTone=clamp(.12+materialValue*.72-signalRole*.18,.07,.90);
  float mark=studyRecordedMark(worldHit,formTone);
  float coverage=smoothstep(.012,.72,glyphAlpha);
  float outline=smoothstep(.055,.35,max(abs(center.a-left.a),abs(center.a-right.a)));
  mark=max(mark,outline*.72);
  vec3 body=mix(recorderDark,materialInk,mark);
  vec3 empty;
`;
  const variants = {
    opened: `
  // No additional regional grade or authored gray-to-dark exposure journey.
  // Use the shared recording ink; spatial construction carries the change.
  empty=recorderDark;
  body=mix(body,materialRGB,0.07);
  vec3 composed=mix(empty,body,coverage);`,
    negative: `
  // Optical reversal of the same acquired marks, rather than a new hue wash.
  empty=recorderLight*.91;
  vec3 negativeInk=mix(vec3(.018,.027,.024),vec3(.10,.075,.045),warmRole*.28);
  body=mix(empty,negativeInk,mark);
  vec3 composed=mix(empty,body,coverage);`,
    rooms: `
  // World-coordinate room memories: bounded illustrative light pools. These
  // are not authored fixture lights or original-room semantic material tags.
  float service=exp(-pow(length((localHit.xz-vec2(-9.0,-32.0))/vec2(16.0,19.0)),2.0));
  float practice=exp(-pow(length((localHit.xz-vec2(11.0,-66.0))/vec2(19.0,24.0)),2.0));
  float chapel=exp(-pow(length((localHit.xz-vec2(-4.0,-124.0))/vec2(30.0,32.0)),2.0));
  float warmPool=clamp(service*.90+practice*.78,0.0,1.0);
  vec3 islandInk=mix(materialInk,vec3(.99,.83,.61),warmPool*.66);
  islandInk=mix(islandInk,vec3(.75,.88,.96),chapel*.62);
  float poolLift=clamp(service*.12+practice*.10+chapel*.13,0.0,.18);
  float islandMark=studyRecordedMark(worldHit,formTone+poolLift);
  body=mix(recorderDark,islandInk,max(islandMark,outline*.72));
  empty=mix(vec3(.27,.31,.30),vec3(.008,.015,.014),smoothstep(8.0,62.0,fieldDepth));
  vec3 composed=mix(empty,body,coverage);`,
  };
  shader = shader.replace(original, common + variants[variant]);
  text = text.slice(0,start) + shader + text.slice(end);

  const look = '? { sunrise: scene.look.sunrise, chroma: scene.look.chroma, paper: scene.look.paper }';
  if (!text.includes(look)) throw new Error('Source look forwarding changed');
  text = text.replace(look, '? { sunrise: scene.look.sunrise, chroma: scene.look.chroma, paper: scene.look.paper, studyOriginM: scene.look.studyOriginM }');
  const view = "gl.uniform2f(textSpaceU('uView'),yaw+planYaw,pitch);";
  if (!text.includes(view)) throw new Error('Source view uniform marker changed');
  text = text.replace(view, `${view}
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,openingTargets.depth);
  gl.uniform1i(textSpaceU('uStudyDepth'),3);
  gl.uniform3f(textSpaceU('uStudyEye'),camX*CELL,camY*CELL,camZ*CELL);
  gl.uniform2f(textSpaceU('uStudyNearFar'),openingTargets.near,openingTargets.far);
  const studyOrigin=sourceLook.studyOriginM||[0,camZ*CELL];
  gl.uniform2f(textSpaceU('uStudyOrigin'),studyOrigin[0],studyOrigin[1]);`);
  return text;
}
