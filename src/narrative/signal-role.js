export const SIGNAL_ROLES=Object.freeze([
  'human','playerShadowReturn','chunkSurferTrace','building','institution','unattributed',
]);

const ROLE_SET=new Set(SIGNAL_ROLES);
const CHUNK_SURFER_TRACE_PATTERNS=Object.freeze([
  /^take (?:three|five)\.?$/i,
  /^take five\. accepted\. thank you\.?$/i,
  /^again(?: from the first bar)?\./i,
  /^retain the reference\.?$/i,
  /^correct the deviation\.?$/i,
  /^last page\. sign where it says received\.?$/i,
  /^(?:monitor return\. )?come closer\.?$/i,
  /^say the reason again\. say it the way you said it in the dark\.?$/i,
  /^you felt it at the door\. name it now and i will be it\.?$/i,
  /^\.\.\.no\?$/i,
]);

export function chunkSurferTraceAllowed(text=''){
  const source=String(text||'').trim();
  return CHUNK_SURFER_TRACE_PATTERNS.some((pattern)=>pattern.test(source));
}

export function inferredSignalRole(who=''){
  const speaker=String(who||'').trim().toLowerCase();
  if(speaker==='hush')throw new Error('HUSH is nonverbal and may not be a narrative speaker');
  if(speaker==='surfer')return'chunkSurferTrace';
  if(speaker==='building')return'building';
  if(speaker==='institution'||speaker==='client')return'institution';
  if(speaker==='recordist')return'playerShadowReturn';
  if(['me','you','guard','radio','sarah'].includes(speaker))return'human';
  return'unattributed';
}

export function normalizeSignalRole(role,who=''){
  if(role!=null&&!ROLE_SET.has(role))throw new Error(`invalid signalRole: ${String(role)}`);
  return role||inferredSignalRole(who);
}

export function attachSignalRole(line={}){
  const signalRole=normalizeSignalRole(line.signalRole,line.who);
  if(signalRole==='chunkSurferTrace'&&!chunkSurferTraceAllowed(line.text)){
    throw new Error(`Chunk Surfer traces may only repeat recorded or institutional language: ${String(line.text||'')}`);
  }
  return{...line,signalRole};
}
