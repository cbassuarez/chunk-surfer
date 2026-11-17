import {
  MENU_SIGNAL_VERTEX_GLSL, MENU_SIGNAL_FINISH_GLSL,
} from './menu-signal-treatments.js';
import {MENU_ART_DIRECTIONS,MENU_ART_DIRECTION_FRAGMENT_GLSL} from './menu-art-directions.js';

export const MENU_FEEDBACK_SETTINGS=MENU_ART_DIRECTIONS.find(p=>p.id==='residual');
export const MENU_FEEDBACK_HZ=30;
const STEP=1/MENU_FEEDBACK_HZ,INITIAL_TIME=3.2,SEED_STEPS=42;

// Render cadence cannot change decay or the recursive camera transform. A held
// presentation and the first frame after an absence never repay elapsed debt.
export function createMenuFeedbackClock(){
  let last=null,ticks=0,accumulator=0,held=false;
  return{
    advance(now,{paused=false,reducedMotion=false}={}){
      const hold=paused||reducedMotion,delta=last==null?0:Math.max(0,now-last);
      const dt=last==null||held||hold||delta>.25?0:delta;
      last=now;held=hold;accumulator=hold?0:accumulator+dt;
      const times=[];
      while(accumulator+1e-9>=STEP){accumulator=Math.max(0,accumulator-STEP);ticks++;times.push(INITIAL_TIME+ticks*STEP);}
      return{time:INITIAL_TIME+ticks*STEP,times,ticks,paused:!!paused,reducedMotion:!!reducedMotion};
    },
    reset(){last=null;ticks=0;accumulator=0;held=false;},
  };
}

export const MENU_FEEDBACK_PRESENT_GLSL=`#version 300 es
precision highp float;
in vec2 uv;out vec4 result;
uniform sampler2D sourceImage,historyImage;
uniform float amount,exposure,vignette;
${MENU_SIGNAL_FINISH_GLSL}
void main(){
  vec2 imageUV=vec2(uv.x,1.-uv.y);
  vec3 original=texture(sourceImage,imageUV).rgb;
  vec3 treated=finishMenuSignal(texture(historyImage,imageUV).rgb,uv,exposure,vignette);
  result=vec4(mix(original,treated,amount),1.);
}`;

// Shares r3d's context: finished positive POST frame -> two world-only history
// buffers -> final integration. The UI canvas is never an input to this pass.
export function createMenuFeedbackPass(gl){
  const clock=createMenuFeedbackClock(),config=MENU_FEEDBACK_SETTINGS;
  const status={active:false,frames:0,historySteps:0,seedSteps:0,ticks:0,time:INITIAL_TIME,
    paused:false,reducedMotion:false,amount:0,error:null};
  let signal=null,finish=null,input=null,history=[],width=0,height=0,front=0,seedNeeded=true;
  function program(fragment){
    const p=gl.createProgram(),shaders=[];
    try{
      for(const[type,source]of[[gl.VERTEX_SHADER,MENU_SIGNAL_VERTEX_GLSL],[gl.FRAGMENT_SHADER,fragment]]){
        const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);
      }
      gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
      return{program:p,uniforms:new Map()};
    }catch(error){gl.deleteProgram(p);throw error;}
    finally{for(const s of shaders)gl.deleteShader(s);}
  }
  const uniform=(p,key)=>{if(!p.uniforms.has(key))p.uniforms.set(key,gl.getUniformLocation(p.program,key));return p.uniforms.get(key);};
  function target(){
    const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();
    try{
      gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Menu feedback framebuffer incomplete');
      return{texture,framebuffer};
    }catch(error){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);throw error;}
  }
  function release(){
    for(const t of [input,...history])if(t){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.framebuffer);}
    input=null;history=[];width=height=front=0;seedNeeded=true;
  }
  function bind(p,key,texture,unit){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniform(p,key),unit);}
  const color=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  function step(time,presence){
    const next=1-front;gl.bindFramebuffer(gl.FRAMEBUFFER,history[next].framebuffer);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0,0,width,height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindVertexArray(null);gl.useProgram(signal.program);
    bind(signal,'sourceImage',input.texture,0);bind(signal,'historyImage',history[front].texture,1);
    gl.uniform2f(uniform(signal,'sourceSize'),width,height);gl.uniform1i(uniform(signal,'sourceIsFramebuffer'),1);
    gl.uniform1i(uniform(signal,'mode'),config.mode);gl.uniform1f(uniform(signal,'time'),time);
    gl.uniform1f(uniform(signal,'presence'),presence);
    for(const key of ['damage','registration','feedback'])gl.uniform1f(uniform(signal,key),config[key]);
    for(const key of ['colorA','colorB'])gl.uniform3fv(uniform(signal,key),color(config[key]));
    gl.drawArrays(gl.TRIANGLES,0,3);front=next;status.historySteps++;
  }
  return{
    prepare(w,h){
      if(status.error)return null;
      try{
        if(!signal)signal=program(MENU_ART_DIRECTION_FRAGMENT_GLSL);
        if(!finish)finish=program(MENU_FEEDBACK_PRESENT_GLSL);
        if(!input||w!==width||h!==height){
          release();width=Math.max(1,Math.round(w));height=Math.max(1,Math.round(h));
          input=target();history.push(target());history.push(target());
        }
        status.active=true;return input;
      }catch(error){status.error=String(error.message||error);status.active=false;release();console.warn('[menu-feedback]',status.error);return null;}
    },
    present({now,amount=1,paused=false,reducedMotion=false}){
      if(!input)return false;
      const timing=clock.advance(now,{paused,reducedMotion});Object.assign(status,timing,{amount});
      // Reduced motion uses a fully formed still exposure and a simple dissolve.
      const presence=reducedMotion?1:Math.max(0,Math.min(1,amount));
      if(seedNeeded){
        for(const t of history){gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}
        front=0;for(let i=0;i<SEED_STEPS;i++)step(timing.time-(SEED_STEPS-1-i)*STEP,presence);
        status.seedSteps+=SEED_STEPS;seedNeeded=false;
      }else for(const time of timing.times)step(time,presence);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.drawBuffers([gl.BACK]);gl.viewport(0,0,width,height);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindVertexArray(null);gl.useProgram(finish.program);
      bind(finish,'sourceImage',input.texture,0);bind(finish,'historyImage',history[front].texture,1);
      gl.uniform1f(uniform(finish,'amount'),Math.max(0,Math.min(1,amount)));
      gl.uniform1f(uniform(finish,'exposure'),config.exposure);gl.uniform1f(uniform(finish,'vignette'),config.vignette);
      gl.drawArrays(gl.TRIANGLES,0,3);status.frames++;delete status.times;return true;
    },
    reset(){seedNeeded=true;clock.reset();},
    inactive(){if(input)release();clock.reset();status.active=false;status.amount=0;status.ticks=0;status.time=INITIAL_TIME;},
    status(){return{...status,width,height,bufferBytes:width*height*4*(input?3:0),settings:{...config}};},
    dispose(){release();clock.reset();for(const p of [signal,finish])if(p)gl.deleteProgram(p.program);signal=finish=null;status.active=false;},
  };
}
