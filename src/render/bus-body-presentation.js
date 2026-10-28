// World-space parts of the bus ordeal. The runtime owns every clock and
// crossing; this file neither advances the encounter nor owns a render loop.
import {ZONE} from '../data/floorplan/legend.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
const matrix=(p={},scale=[1,1,1])=>{const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0);return[c*scale[0],0,-s*scale[0],0,0,scale[1],0,0,s*scale[2],0,c*scale[2],0,p.x||0,p.y||0,p.z||0,1];};
const product=(a,b)=>{const m=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};

export function busBodyPassageInstances(frame){
  if(!frame?.bodyOpening?.active||frame.bodyOpening.elapsed<.32||frame.interior?.active)return[];
  const o=frame.lighting?.origin;if(!o)return[];
  const opening=frame.bodyOpening,u=clamp(opening.progress),p=opening.paperReady?1:0,t=opening.elapsed;
  const strain=u>=1?0:Math.sin(clamp((t-.32)/2.68)*Math.PI)*(.55+.25*Math.sin(t*18));
  const character={time:0,loop:false,morphs:{unfold:u,paper:p,paperUnfold:u*p,strain}},root=matrix(o);
  return['left','right','bag',...(p?['ticket']:[])].map(part=>({id:`r7-bus-body:${part}`,mesh:`bus_body_passage_${part}`,matrix:root,
    zone:ZONE.sourceSpace,structural:false,sourceStructure:'outskirts',character}));
}

export function busSeatIntrusionInstances(frame,{reducedMotion=false}={}){
  const t=frame?.transit,o=frame?.lighting?.origin;
  if(!o||t?.trapAt==null||frame.interior?.active)return[];
  const age=Math.max(0,t.clock-t.trapAt),root=matrix(o),out=[];
  // These are the Cut's actual lobed, textured lung meshes. Their bases stay
  // on the cushions; no new collider grows into the walked aisle.
  for(let i=0;i<4;i++){
    const grow=ease((age-1.35-i*.48)/2.1);if(grow<=0)continue;
    const side=i%2?-1:1,z=i<2?-1.22:.54,sy=.23*grow;
    const m=product(root,matrix({x:side*.84,y:1.11-3.8292465327192815*sy,z:z+4.65*.009},[.0075,sy,.009]));
    out.push({id:`r7-seat-growth:${i}`,mesh:'cut_lungs',matrix:m,zone:ZONE.sourceSpace,structural:false,sourceStructure:'outskirts',
      character:{time:0,loop:false,morphs:{tension:0,shear:0,breath:reducedMotion?.32:.32+.18*Math.sin(age*1.3+i),recoil:0}}});
  }
  return out;
}
