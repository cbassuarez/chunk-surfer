// A borrowed world can show a real distant support plane without changing the
// ordinary walking world's clip range. Only one scene owns that borrow at once.
export function createPropRangeController(){
  let owner=null,far=90;
  return {
    current:({drive=false}={})=>drive?260:far,
    acquire(token,value=90){
      if(!token||owner&&owner!==token)throw Error('Another scene owns the prop range.');
      if(!Number.isFinite(value)||value<90||value>320)throw Error('Invalid authored prop range.');
      owner=token;far=value;let released=false;
      return()=>{if(released)return false;released=true;if(owner!==token)return false;owner=null;far=90;return true;};
    },
  };
}
