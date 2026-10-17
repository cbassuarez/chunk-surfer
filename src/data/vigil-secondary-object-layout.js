// Metres in the actual hand frame: X across the knuckles, Y toward the
// fingertips, Z out of the palm. Build geometry and the live pinch share this
// definition so the little ring cannot drift away from the holding fingers.
export const OWEN_KEY_RING=Object.freeze({
  center:Object.freeze([-.060,.139,-.004]),
  radius:.019,
  wire:.0022,
  pinch:Object.freeze({
    thumb:Object.freeze([-.060,.120,.005]),
    index:Object.freeze([-.060,.120,-.009]),
  }),
});
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=a=>a.map(v=>v/(Math.hypot(...a)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function vigilHandFrame(bones,side='L'){
  const find=name=>{const b=bones.find(b=>b.name===name+'_'+side);if(!b)throw Error('Missing vigil hand bone '+name+'_'+side);return b;};
  const hand=find('hand'),y=unit(sub(find('middle_tip').tail,hand.head));
  const z=unit(cross(y,sub(find('little').head,find('index').head)).map(v=>v*(side==='L'?-1:1)));
  return{origin:hand.head,x:unit(cross(y,z)),y,z};
}
export function vigilHandPoint(frame,point){
  return frame.origin.map((v,i)=>v+frame.x[i]*point[0]+frame.y[i]*point[1]+frame.z[i]*point[2]);
}
