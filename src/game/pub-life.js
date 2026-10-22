import {PUB_OVERHEARDS} from '../data/pub-patrons.js';
// One cancellable room conversation. Its clock stops outside the pub and
// nothing said here can queue beneath a player conversation or survive an exit.
export function createPubLifeDirector({createDispatch,valid=()=>true,lines=PUB_OVERHEARDS}={}){
  let elapsed=0,nextAt=9,cursor=0,active=null;
  const cancel=()=>{active?.cancel?.();active=null;};
  return{update({dt=0,inPub=false,busy=false,paused=false}={}){
    if(!inPub||paused){cancel();return null;}
    elapsed+=Math.max(0,Math.min(.5,Number(dt)||0));
    if(busy){cancel();nextAt=Math.max(nextAt,elapsed+5);return null;}
    if(elapsed<nextAt||!lines.length)return null;
    const beat=lines[cursor++%lines.length];cancel();
    active=createDispatch({id:'pub-company',context:'auto',maxWaitMs:1200,replace:true,interrupt:false,escapable:true,valid});
    active.sayAll(beat);nextAt=elapsed+28+cursor%3*7;return beat;
  },cancel,snapshot:()=>({elapsed,nextAt,cursor,active:!!active})};
}
