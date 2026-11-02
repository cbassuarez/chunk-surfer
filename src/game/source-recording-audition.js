// A temporary read-only transport for one physical Source cassette. The main
// tape remains authoritative; every start/seek revalidates this exact receipt.
export async function createSourceRecordingAudition({playback,take,positionSeconds=0,
  valid=()=>true,present=valid,allowed=()=>true,signal=null}={}){
  if(!playback||!take||signal?.aborted||!valid()||!allowed()||playback.isPlaying())return null;
  let handle=null,closed=false,paused=false,position=Math.max(0,Number(positionSeconds)||0),generation=0;
  let cancelPending=null;
  const duration=Math.max(0,Number(take.durationSeconds)||0);
  const owns=()=>!!handle&&playback.isArchivedPlaybackOwner(handle);
  const permitted=()=>!closed&&!signal?.aborted&&valid()&&allowed();
  function read(){
    if(owns()){
      playback.tickPlayback();const snapshot=playback.playbackSnapshot();
      if(snapshot)position=Math.max(0,Math.min(duration,Number(snapshot.elapsedSec)||0));
      else if(!paused)position=duration;
    }
    return{available:true,playing:owns()&&!paused,paused,positionSeconds:position,durationSeconds:duration};
  }
  function stopOwned(){if(owns())playback.stopPlayback();handle=null;}
  function cancelPreparation(){const cancel=cancelPending;cancelPending=null;cancel?.();}
  function abort(){
    if(closed)return;closed=true;generation++;cancelPreparation();stopOwned();
    signal?.removeEventListener?.('abort',abort);
  }
  async function start(at){
    if(!permitted())return false;
    const serial=++generation;stopOwned();position=Math.max(0,Math.min(duration,Number(at)||0));
    const next=playback.playArchivedTake(take,{offsetSeconds:position});
    if(!next)return false;
    handle=next;paused=false;
    let ready=next;
    if(next.readyPromise){
      let cancel;const canceled=new Promise(resolve=>{cancel=()=>resolve(null);});cancelPending=cancel;
      ready=await Promise.race([next.readyPromise,canceled]);
      if(cancelPending===cancel)cancelPending=null;
    }
    if(!ready||serial!==generation||!permitted()){
      if(handle===next)stopOwned();return false;
    }
    return true;
  }
  const transport={
    snapshot(){if(!present()){read();abort();return{...read(),available:false};}return read();},
    seek(at){
      if(!permitted())return false;
      position=Math.max(0,Math.min(duration,Number(at)||0));
      if(!owns())return paused?true:start(position);
      const next=playback.seekArchivedPlayback(position);if(!next)return false;handle=next;return true;
    },
    pause(){
      read();generation++;const preparing=!!cancelPending;cancelPreparation();
      if(preparing)stopOwned();else if(owns()){const next=playback.pauseArchivedPlayback(true);if(next)handle=next;}
      paused=true;return true;
    },
    resume(){
      if(!permitted())return false;
      if(!owns())return start(position);
      const next=playback.pauseArchivedPlayback(false);if(!next)return false;handle=next;paused=false;return true;
    },
    stop(){if(closed)return false;read();closed=true;generation++;cancelPreparation();stopOwned();signal?.removeEventListener?.('abort',abort);return true;},
  };
  signal?.addEventListener?.('abort',abort,{once:true});
  if(signal?.aborted){abort();return null;}
  try{if(!await start(position)){transport.stop();return null;}}
  catch(error){transport.stop();throw error;}
  return transport;
}
