// Acquisition failure for the existing road memory, before the final dither.
// Construction cover remains complete even when bright effects are disabled.
import {DRIVE_MEMORY_BREAK,driveMemoryBreakFrame} from '../game/source-drive/memory-break.js';
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));

export function driveMemoryBreakUniforms(value){
  const frame=value?.memoryBreak||value;
  if(!frame?.active)return new Float32Array([0,0,0,0]);
  const grain=frame.effectsMode==='off'?0:(Number(frame.grain)||0)*(frame.reducedFlash?.3:1);
  return new Float32Array([clamp(frame.cover),Math.max(0,Math.min(.065,grain)),Number(frame.age)||0,Number(frame.serial)||0]);
}
export const DRIVE_MEMORY_BREAK_GLSL=`
uniform vec4 uDriveMemoryBreak; // complete cover, bounded grain, owned age, identity
vec3 driveMemoryBreakAcquire(vec3 source,vec2 fragment){
  float cover=clamp(uDriveMemoryBreak.x,0.0,1.0);
  if(cover>=.99999)return vec3(0.0);
  float carrier=fract(sin(dot(floor(fragment*.7),vec2(12.9898,78.233))
    +floor(uDriveMemoryBreak.z*27.0)*17.71+uDriveMemoryBreak.w*9.13)*43758.5453);
  float lost=uDriveMemoryBreak.y*(carrier-.68)*(1.0-cover);
  return max(vec3(0.0),source+vec3(lost))*(1.0-cover);
}
`;

// Compatibility fallback for hosts not yet forwarding the acquisition frame.
// It supplies only the necessary black cover; no television grain, scan bars or
// bright UI overlays bypass the game's renderer.
export function radioDialStaticAlpha(fraction){
  return driveMemoryBreakFrame({age:clamp(fraction)*DRIVE_MEMORY_BREAK.seconds},DRIVE_MEMORY_BREAK).cover;
}
export function paintRadioDialStatic(ctx,{width,height,fraction=0}={}){
  const alpha=radioDialStaticAlpha(fraction);if(!ctx||alpha<.001)return false;
  ctx.save();ctx.setTransform?.(1,0,0,1,0,0);ctx.globalAlpha=alpha;ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);ctx.restore();return true;
}
