const STRIKEABLE_STATES=new Set(['outbound']);

// The external webview is deliberately stupid: it may report only the opaque
// cast id and the fixed surface index it was given. The main combat window owns
// the real cast id, the ray, charge, damage, and every gameplay consequence.
export function fireballSurfaceHitPayload(cast){
  if(!cast||!STRIKEABLE_STATES.has(String(cast.state||'')))return null;
  const castId=String(cast.castId||'');
  const surfaceIndex=Math.floor(Number(cast.surfaceIndex));
  if(!/^cast-[0-9a-f]{8}$/i.test(castId)||surfaceIndex<0||surfaceIndex>3)return null;
  if(!Array.isArray(cast.rays)||!cast.rays[0])return null;
  return Object.freeze({castId,surfaceIndex});
}

// Resolve locally on pointer-down so focus + pointer events from the same click
// cannot report the fireball twice while the main window is processing RETURN.
export function strikeFireballSurface(cast,emitHit=()=>{}){
  const payload=fireballSurfaceHitPayload(cast);
  if(!payload)return Object.freeze({hit:false,cast,payload:null});
  const next=Object.freeze({...cast,state:'deflected'});
  void Promise.resolve().then(()=>emitHit(payload)).catch(()=>null);
  return Object.freeze({hit:true,cast:next,payload});
}
