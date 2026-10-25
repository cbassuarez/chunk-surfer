// Shared authoring/runtime registration for the cage and twelve low glands.
// Only a handful of attachment points are sampled on CPU; mesh morphs stay GPU.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const COSTAL_GLAND_ANCHORS=Object.freeze([
 {id:'left-low',side:-1,point:[-12.302371452431785,3.6595143951268634,-7.828319220984149],scale:[.96,1.04,.91],outward:.82},
 {id:'right-low',side:1,point:[12.302371452431785,3.6595143951268634,6.971680779015851],scale:[1.10,.93,1.04],outward:1.04},
]);
export const COSTAL_NECK=Object.freeze({outlet:[.16462753863181837,-1.10,.08],extendedMetres:1.15,dripMetres:.12});
export function costalStructureDelta(p,name){const[x,y,z]=p,root=smooth((y-1.3)/6),roof=smooth((y-8.2)/5.2),left=1-smooth((x+4)/8);if(root===0)return[0,0,0];
 // Posterior joints stay restrained. Rotation of the bowed rib blades raises
 // the anterior/lateral chest rather than translating an entire stone arch.
 if(name==='tension'){const angle=.105*root*smooth(Math.abs(x)/4),dy=y-19.65,c=Math.cos(angle),s=Math.sin(angle),side=Math.sign(x);return[x*(c-1)-side*dy*s,dy*(c-1)+Math.abs(x)*s,.16*Math.sin(z*.10)*root];}
 if(name==='shear')return[.44*left*roof*root,-.43*left*roof*root,.22*left*roof*root];
 if(name==='recoil')return[-.12*left*roof*root,-.08*roof*root,-.24*left*roof*root];
 return[0,0,0];
}
export function costalFoldPoint(p,side=Math.sign(p[0])||-1){const y=p[1],a=smooth((y-1.2)/12);return[p[0]+side*14*a,y-Math.max(0,y)*.46*a,p[2]];}
export function costalPointPose(p,morphs={},side=Math.sign(p[0])||-1){const base=costalFoldPoint(p,side),macro=clamp(morphs.breath||0),out=base.map((v,i)=>v+(p[i]-v)*macro);for(const name of['tension','shear','recoil']){const d=costalStructureDelta(p,name),w=clamp(morphs[name]||0);for(let c=0;c<3;c++)out[c]+=d[c]*w;}return out;}

export function costalNeckPoint(p,w={}){const along=smooth((-p[1]-.43)/.67),t=clamp(w.tension||0),s=clamp(w.shear||0),r=clamp(w.recoil||0);return[p[0]+p[0]*.32*t+.055*along*s+.025*along*r,p[1]-.04*t-COSTAL_NECK.extendedMetres*along*s-COSTAL_NECK.dripMetres*along*r,p[2]+p[2]*.30*t+.035*along*s+.018*along*r];}
