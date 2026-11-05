// THE STORE THE NIGHT AFTER THE CRASH SAVES TO.
//
// Nothing about the opening may know it is in the loop, and parts of it check
// their work: the van writes the shift sheet, reads it back and compares. So
// this is an ordinary store that keeps what it is told, in memory, in front of
// the real one, which it only ever reads. Closing the game throws it away.
const clone=value=>value===undefined||value===null?value:structuredClone(value);
export function createSixLoopStorage(real){
  const memory=new Map(),GONE=Symbol('deleted');
  const read=async(key,load)=>{
    if(!memory.has(key))return load();
    const value=memory.get(key);return value===GONE?null:clone(value);
  };
  const keep=(key,value)=>{memory.set(key,clone(value));};
  const local={
    loadSettings:()=>read('settings',()=>real.loadSettings()),
    saveSettings:async settings=>{keep('settings',settings);},
    resetSettings:async()=>{memory.delete('settings');return real.loadSettings();},
    loadProfile:()=>read('profile',()=>real.loadProfile()),
    saveProfile:async profile=>{keep('profile',profile);},
    loadSave:(slot='autosave')=>read(`save:${slot}`,()=>real.loadSave(slot)),
    saveGame:async(slot='autosave',save)=>{keep(`save:${slot}`,save);},
    deleteSave:async(slot='autosave')=>{memory.set(`save:${slot}`,GONE);},
    deleteProfile:async()=>{memory.set('profile',GONE);},
    // The real night's tape belongs to the real night.
    loadCausalDraft:async()=>null,loadSealedCausalDraft:async()=>null,
    appendCausalDraftSegment:async()=>null,saveCausalDraftCheckpoint:async()=>null,
    sealCausalDraft:async()=>null,promoteCausalDraft:async()=>null,discardCausalDraft:async()=>null,
    loadHushRunSession:()=>read('session',async()=>null),
    saveHushRunSession:async session=>{keep('session',session);return session;},
    deleteHushRunSession:async()=>{memory.set('session',GONE);},
    deleteLatestCausalTape:async()=>{},
  };
  return new Proxy(real,{
    get(target,name){
      if(Object.hasOwn(local,name))return local[name];
      const value=target[name];
      return typeof value==='function'?value.bind(target):value;
    },
  });
}
