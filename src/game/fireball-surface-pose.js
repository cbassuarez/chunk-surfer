// CSS-pixel geometry shared by the transparent carrier's drawing and hit test.
// Motion is a delivered, authored phase. Neither time nor the cursor enters it.
export const FIREBALL_SURFACE_ENVELOPE_SIZE=240;
export const FIREBALL_SURFACE_FORGIVENESS=8;
const TARGET_SIZE=100;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

function sample(seed,salt){
  let hash=0x811c9dc5;
  for(const character of `${seed}:${salt}`)hash=Math.imul(hash^character.charCodeAt(0),0x01000193)>>>0;
  hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d);hash^=hash>>>15;
  hash=Math.imul(hash,0x846ca68b);hash^=hash>>>16;
  return (hash>>>0)/4294967296;
}

export function fireballSurfacePose(cast,{width=FIREBALL_SURFACE_ENVELOPE_SIZE,height=FIREBALL_SURFACE_ENVELOPE_SIZE}={}){
  width=Math.max(1,Number(width)||FIREBALL_SURFACE_ENVELOPE_SIZE);
  height=Math.max(1,Number(height)||FIREBALL_SURFACE_ENVELOPE_SIZE);
  const motion=cast?.motion||{};
  const formationProgress=cast?.reducedMotion||motion.rebounding?1:clamp(motion.formationProgress??(cast?.catchReady?1:0),0,1);
  const pressure=clamp(motion.pressure,0,1);
  const baseSeed=`${motion.seed??cast?.castId??0}:${Number(cast?.surfaceIndex)||0}`;
  const announcedOffer=Math.max(1,Math.floor(Number(cast?.offer)||1));
  const offer=motion.rebounding?Math.max(1,announcedOffer-1):announcedOffer;
  const seed=`${baseSeed}:${offer}:${motion.gesture||'rise-drift'}`;
  const size=Math.min(TARGET_SIZE,Math.max(1,width-16),Math.max(1,height-16));
  // The tile, including its forgiveness border, remains in the fixed carrier.
  const limitX=Math.min(40,Math.max(0,(width-size)/2-FIREBALL_SURFACE_FORGIVENESS));
  const limitY=Math.max(0,(height-size)/2-FIREBALL_SURFACE_FORGIVENESS);
  // Opposite banks exclude the carrier centre from both committed hit regions.
  // The ray's bank is selected once; its next offer deliberately flips it.
  const bank=(sample(baseSeed,2)<.5?-1:1)*(offer%2===0?-1:1);
  const bankReach=Math.min(62,limitY);
  const markX=(sample(seed,1)*2-1)*limitX;
  const previousSeed=`${baseSeed}:${offer-1}:${motion.gesture||'rise-drift'}`;
  const startX=(sample(offer>1?previousSeed:seed,offer>1?1:5)*2-1)*limitX;
  const eased=formationProgress**2*(3-2*formationProgress);
  const envelope=Math.sin(formationProgress*Math.PI);
  const intensity=envelope>1e-6?clamp(motion.dodge??pressure*envelope,0,1)/envelope:pressure;
  const bow=Math.sin(eased*Math.PI)*24*clamp(intensity,0,1)*clamp(motion.reach??1,0,1)
    *(sample(seed,3)<.5?-1:1)*(.55+.45*sample(seed,4));
  const offsetX=clamp(startX+(markX-startX)*eased+(formationProgress>=1?0:bow),-limitX,limitX);
  const offsetY=bank*bankReach*(2*eased-1);
  const x=(width-size)/2+offsetX,y=(height-size)/2+offsetY;
  return Object.freeze({x,y,size,centerX:x+size/2,centerY:y+size/2,offsetX,offsetY,formationProgress,width,height});
}

export function fireballSurfaceContains(pose,{x,y}={}, {forgiveness=FIREBALL_SURFACE_FORGIVENESS}={}){
  if(!pose||!Number.isFinite(x)||!Number.isFinite(y))return false;
  const margin=Math.max(0,Number(forgiveness)||0);
  return x>=0&&x<=pose.width&&y>=0&&y<=pose.height
    &&x>=pose.x-margin&&x<=pose.x+pose.size+margin
    &&y>=pose.y-margin&&y<=pose.y+pose.size+margin;
}
