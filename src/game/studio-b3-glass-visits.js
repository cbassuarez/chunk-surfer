// The marks change only after the player has actually seen the ordinary pane,
// left the combined B3 live/control area and returned. This uses normal save
// flags; the in-memory inside latch prevents a reload from inventing a departure.
export const B3_GLASS_SEEN_FLAG='b3.glass.marks.seen';
export const B3_GLASS_LEFT_FLAG='b3.glass.marks.left';

export function inB3Rooms({x,z,floor,group}={}){
  return group==='basement' && Math.abs((Number(floor)||0)+4)<.2
    && x>=5 && x<25 && z>=5 && z<19;
}

export function createB3GlassVisitTracker(){
  let inside=false;
  return {
    step({eligible=false,suspended=false,inRoom=false,seen=false,left=false,observed=false,onSeen=()=>{},onLeft=()=>{}}={}){
      if(!eligible||suspended)return !!left;
      if(inRoom){
        inside=true;
        if(observed&&!seen){onSeen();seen=true;}
      }else if(inside){
        inside=false;
        if(seen&&!left){onLeft();left=true;}
      }
      return !!left;
    },
    reset(){inside=false;},
  };
}
