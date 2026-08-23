export const SIGNAL_ROLES=Object.freeze([
  'human','playerShadowReturn','chunkSurferTrace','building','institution','unattributed',
]);

const ROLE_SET=new Set(SIGNAL_ROLES);

// WHERE THE SURFER GOT IT.
//
// The doctrine has not moved: the Chunk Surfer has nothing of its own to say
// and may only ever repeat recorded or institutional language. What has moved
// is how that is enforced.
//
// It used to be a list of literal regexes — every sentence the thing was ever
// allowed to utter, written out in this file. That worked while it had ten
// lines. It does not survive a rewrite: the last five patterns were added by
// hand for one draft, with a note saying a broader answer was still being
// worked out, and any new line meant editing the engine to permit a sentence.
//
// So a trace now declares its SOURCE instead of matching its text. `quotes`
// names the recorded or institutional language the line is repeating, and it
// has to be one of these — every one of which is a real thing in the building
// that a recording could plausibly have come off. If you cannot name where the
// Surfer heard it, the Surfer may not say it, which is the rule stated as a
// question the author has to answer rather than as a list they have to join.
export const TRACE_SOURCES=Object.freeze({
  slate:'studio slate and take commands, off the recordist’s own tape',
  rehearsal:'the conservatoire’s teaching voice, worn into the practice rooms',
  contract:'the client’s paperwork — terms, delivery notes, the last page',
  monitor:'the monitor path: what the building says down its own wires',
  confession:'the recordist’s own words, played back at him',
  recordist:'the previous recordist, on tape',
  guard:'the man at the door, recorded at the cold open',
  signal:'the documented language of the signal path — routing, sends, references',
});

const TRACE_SOURCE_SET=new Set(Object.keys(TRACE_SOURCES));

export function isTraceSource(value){
  return TRACE_SOURCE_SET.has(String(value||'').trim());
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
  if(signalRole==='chunkSurferTrace'){
    const quotes=String(line.quotes||'').trim();
    if(!quotes){
      throw new Error(`Chunk Surfer traces may only repeat recorded or institutional language, and must name what they repeat with quotes: ${String(line.text||'')}`);
    }
    if(!isTraceSource(quotes)){
      throw new Error(`unknown Chunk Surfer trace source "${quotes}" (expected one of: ${Object.keys(TRACE_SOURCES).join(', ')})`);
    }
  }
  return{...line,signalRole};
}
