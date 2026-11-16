// Menu signal experiments. World-only source -> optional history -> integration
// -> untouched production UI. The inline review uses these exact shader strings.
export const MENU_SIGNAL_TREATMENTS=Object.freeze([
  Object.freeze({id:'shear',name:'Chromatic tear',mode:1,damage:.95,registration:30,feedback:.86,exposure:-.05,vignette:.38,colorA:'#f64827',colorB:'#9bcec6'}),
  Object.freeze({id:'polarity',name:'Polarity fracture',mode:2,damage:.90,registration:38,feedback:.86,exposure:.12,vignette:.38,colorA:'#d8e663',colorB:'#bd7a94'}),
  Object.freeze({id:'feedback',name:'Feedback well',mode:3,damage:.96,registration:22,feedback:.95,exposure:.20,vignette:.40,colorA:'#679ead',colorB:'#ed784a'}),
]);

export const MENU_SIGNAL_VERTEX_GLSL=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=vec2(p.x,1.-p.y);gl_Position=vec4(p*2.-1.,0.,1.);}`;

export const MENU_SIGNAL_FRAGMENT_GLSL=`#version 300 es
precision highp float;
precision highp int;
in vec2 uv;out vec4 result;
uniform sampler2D sourceImage,historyImage;
uniform vec2 sourceSize;
uniform int mode;
uniform float time,damage,registration,feedback;
uniform vec3 colorA,colorB;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
vec2 fold(vec2 p){return 1.-abs(mod(p,2.)-1.);}
vec3 source(vec2 p){return texture(sourceImage,fold(p)).rgb;}
float yAt(vec2 p){return lum(source(p));}
float softY(vec2 p,float r){vec2 q=vec2(r)/sourceSize;return yAt(p)*.4+(yAt(p+vec2(q.x,0.))+yAt(p-vec2(q.x,0.))+yAt(p+vec2(0.,q.y))+yAt(p-vec2(0.,q.y)))*.15;}
float edgeAt(vec2 p){return clamp(abs(softY(p,1.8)-softY(p,7.))*3.,0.,1.);}
void main(){
  vec2 p=uv;
  float travel=fract(time*.045+.26);
  float band=1.-smoothstep(.013,.070,abs(uv.y-travel));
  float line=floor(uv.y*sourceSize.y/13.);
  float coarse=sin(line*.81+time*.31)*sin(line*.17-time*.19);
  float tear=band*(.6+.4*sin(line*1.31))*damage;
  vec3 c;
  if(mode==1){
    p.x+=(tear*.085+coarse*.0022)*damage;
    p.y+=sin(uv.x*9.+time*.21)*.004*damage;
    vec2 shift=vec2(registration/sourceSize.x,0.);
    float a=softY(p,1.2),b=softY(p+shift,1.2),d=softY(p-shift,1.2);
    float mismatch=abs(b-d);
    float negative=pow(clamp(1.-a,0.,1.),.82);
    float edge=edgeAt(p);
    c=mix(vec3(.012,.022,.024),vec3(.42,.46,.39),negative);
    c=mix(c,colorA*.88,clamp(mismatch*2.1+edge*.48,0.,1.)*damage);
    c+=colorB*abs(a-b)*.34;
    c*=1.-band*.35;
    // Thin displaced signal strips, never a full-screen flash.
    float splice=smoothstep(.98,1.,sin(uv.y*220.+time*.8));
    c=mix(c,colorA*.36,splice*damage*.4);
  }else if(mode==2){
    float column=floor(uv.x*10.);
    float fault=sin(column*1.9+time*.16);
    p.y+=fault*.047*damage;
    p.x+=(sin(uv.y*15.+time*.17)*.014+tear*.075)*damage;
    float left=softY(p-vec2(registration/sourceSize.x,0.),1.2);
    float right=softY(p+vec2(registration/sourceSize.x,0.),1.2);
    float y=softY(p,1.4);
    float polarity=smoothstep(-.25,.25,sin(column*2.41+uv.y*5.7+time*.13));
    float flipped=mix(y,1.-y,polarity);
    float solar=1.-abs(flipped*2.-1.);
    // Solid reverse fields, acidic ink and a second misregistered print.
    vec3 ink=mix(vec3(.018,.026,.023),colorA*.70,pow(flipped,.8));
    c=mix(ink,colorB*.64,solar*.75);
    c+=colorA*abs(right-left)*damage*.36;
    float seam=1.-smoothstep(.006,.013,fract(uv.x*10.));
    c=mix(c,vec3(.014,.019,.016),seam*.7);
    c*=1.-band*.29;
  }else{
    vec2 q=(uv-.5)*vec2(sourceSize.x/sourceSize.y,1.);
    float radius=length(q),angle=atan(q.y,q.x);
    float rotation=.013*damage;
    mat2 turn=mat2(cos(rotation),-sin(rotation),sin(rotation),cos(rotation));
    vec2 prior=(turn*q)*(1.-.014*damage);
    prior+=vec2(sin(time*.11+radius*5.),cos(time*.09+radius*4.))*.0025*damage;
    prior=prior/vec2(sourceSize.x/sourceSize.y,1.)+.5;
    vec3 past=texture(historyImage,clamp(vec2(prior.x,1.-prior.y),0.,1.)).rgb;
    p+=(q/max(radius,.01))*sin(radius*16.-time*.17)*damage*.007;
    float edge=edgeAt(p),y=softY(p,2.);
    vec3 seed=mix(colorA,colorB,smoothstep(.17,.73,radius))*(edge*.92+(1.-y)*.010);
    // Bounded lighten feedback, integrated at a fixed 30 Hz. The recursive
    // texture is world colour only: no UI, no exposure/vignette accumulation.
    vec3 trail=past*feedback;
    c=max(seed,trail);
    c+=colorB*abs(yAt(p+vec2(registration/sourceSize.x,0.))-yAt(p))*.025;
    c=clamp(c,0.,.72);
  }
  result=vec4(clamp(c,0.,1.),1.);
}`;

export const MENU_SIGNAL_COMPOSITE_GLSL=`#version 300 es
precision highp float;
in vec2 uv;out vec4 result;
uniform sampler2D backgroundImage,foregroundImage,sourceImage;
uniform float exposure,vignette;
uniform int reference,showMenu;
uniform vec2 sourceSize;
__CARBON_GLSL__
void main(){
  vec3 c=texture(backgroundImage,vec2(uv.x,1.-uv.y)).rgb;
  if(reference==1){c=menuBackgroundTreatment(sourceImage,uv,sourceSize,3,.28,1.12,.40,.44,.10,vec3(.6863,.7294,.6902),.82);}
  else{
    c*=exp2(exposure);
    c=c/(vec3(1.)+c*.48);
    float edge=smoothstep(.16,.79,length((uv-.5)*vec2(1.27,1.)));
    c*=1.-vignette*edge;
    c*=1.-.12*(1.-smoothstep(.18,.52,length((uv-.5)*vec2(1.,1.1))));
  }
  vec4 ui=texture(foregroundImage,uv);if(showMenu==0)ui=vec4(0.);
  result=vec4(mix(c,ui.rgb,ui.a),1.);
}`;

// Self-contained driver shared by the study and a future production adapter.
// step() advances exactly one 1/30s history sample; render() does not advance it.
export function createMenuSignalRenderer({canvas,source,foreground,shaders}){
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('WebGL 2 is required for these signal treatments.');
  canvas.width=source.width;canvas.height=source.height;
  const width=canvas.width,height=canvas.height;
  function program(fragment){
    const p=gl.createProgram();
    for(const [type,code] of [[gl.VERTEX_SHADER,shaders.vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
      gl.attachShader(p,s);gl.deleteShader(s);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
  }
  const signal=program(shaders.signal),composite=program(shaders.composite);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.viewport(0,0,width,height);
  const locations=p=>Object.fromEntries(['sourceImage','historyImage','backgroundImage','foregroundImage','sourceSize','mode','time','damage','registration','feedback','colorA','colorB','exposure','vignette','reference','showMenu'].map(k=>[k,gl.getUniformLocation(p,k)]));
  const a=locations(signal),b=locations(composite);
  function texture(image=null){
    const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    if(image)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);
    for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
    return t;
  }
  const input=texture(source),ui=texture(foreground);
  const buffers=Array.from({length:2},()=>{const t=texture(),f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Signal history framebuffer is incomplete');return{texture:t,framebuffer:f};});
  let front=0;
  const bind=(t,unit,loc)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(loc,unit);};
  const color=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  function step(config,time){
    const next=1-front;gl.useProgram(signal);gl.bindFramebuffer(gl.FRAMEBUFFER,buffers[next].framebuffer);
    bind(input,0,a.sourceImage);bind(buffers[front].texture,1,a.historyImage);
    gl.uniform2f(a.sourceSize,width,height);gl.uniform1i(a.mode,config.mode);
    gl.uniform1f(a.time,time);for(const key of ['damage','registration','feedback'])gl.uniform1f(a[key],config[key]);
    gl.uniform3fv(a.colorA,color(config.colorA));gl.uniform3fv(a.colorB,color(config.colorB));
    gl.drawArrays(gl.TRIANGLES,0,3);front=next;
  }
  function reset(config,time=3.2){
    for(const buffer of buffers){gl.bindFramebuffer(gl.FRAMEBUFFER,buffer.framebuffer);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}
    front=0;const count=config.mode===3?42:1;
    for(let i=0;i<count;i++)step(config,time-(count-1-i)/30);
  }
  function render(config,{reference=false,showMenu=true}={}){
    gl.useProgram(composite);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    bind(buffers[front].texture,0,b.backgroundImage);bind(ui,1,b.foregroundImage);bind(input,2,b.sourceImage);
    gl.uniform2f(b.sourceSize,width,height);gl.uniform1f(b.exposure,config.exposure);gl.uniform1f(b.vignette,config.vignette);
    gl.uniform1i(b.reference,reference?1:0);gl.uniform1i(b.showMenu,showMenu?1:0);gl.drawArrays(gl.TRIANGLES,0,3);
    return canvas;
  }
  return{step,reset,render,dispose(){for(const t of [input,ui,...buffers.map(b=>b.texture)])gl.deleteTexture(t);for(const b of buffers)gl.deleteFramebuffer(b.framebuffer);gl.deleteProgram(signal);gl.deleteProgram(composite);gl.deleteVertexArray(vao);}};
}
