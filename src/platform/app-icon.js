import {IS_TAURI} from './paths.js';

export const APP_ICON_CHOICES=Object.freeze(['van','ear']);

function nativeStatus(value){
  if(!value||typeof value.supported!=='boolean'||!APP_ICON_CHOICES.includes(value.choice))
    throw new Error('The desktop did not confirm the app icon.');
  return {supported:value.supported,choice:value.choice};
}

// The native preference owns the selected icon. Only discovery of the hidden
// setting belongs to game settings; a new night cannot replace native choice.
export function createAppIconController({desktop=IS_TAURI,invoke=null}={}){
  let state={supported:false,choice:'van',loaded:!desktop,pending:false,error:null};
  let refreshPromise=null,switchPromise=null;
  const snapshot=()=>({...state});
  const call=async(command,args)=>{
    if(!desktop)throw new Error('Alternate app icons are unavailable in the browser.');
    const invokeNative=invoke||(await import('@tauri-apps/api/core')).invoke;
    return invokeNative(command,args);
  };
  async function refresh(){
    if(!desktop)return snapshot();
    if(switchPromise)return switchPromise;
    if(refreshPromise)return refreshPromise;
    state={...state,pending:true,error:null};
    refreshPromise=(async()=>{
      try{state={...nativeStatus(await call('chunk_app_icon_status')),loaded:true,pending:false,error:null};return snapshot();}
      catch(error){state={...state,pending:false,error:String(error?.message||error)};throw error;}
    })().finally(()=>{refreshPromise=null;});
    return refreshPromise;
  }
  async function setChoice(choice){
    if(!APP_ICON_CHOICES.includes(choice))throw new Error('Choose the van or the ear.');
    if(switchPromise)return switchPromise;
    const pendingRefresh=refreshPromise;
    switchPromise=(async()=>{
      try{
        if(pendingRefresh)await pendingRefresh;
        if(!state.loaded&&desktop)state={...nativeStatus(await call('chunk_app_icon_status')),loaded:true,pending:false,error:null};
        if(!state.supported)throw new Error('Alternate app icons are unavailable on this platform.');
        if(state.choice===choice)return snapshot();
        state={...state,pending:true,error:null};
        const result=nativeStatus(await call('chunk_set_app_icon',{choice}));
        if(!result.supported||result.choice!==choice)throw new Error('The desktop did not confirm the selected icon.');
        state={...result,loaded:true,pending:false,error:null};return snapshot();
      }catch(error){state={...state,pending:false,error:String(error?.message||error)};throw error;}
    })().finally(()=>{switchPromise=null;});
    return switchPromise;
  }
  return{snapshot,refresh,setChoice};
}

const appIcon=createAppIconController();
export const appIconStatus=()=>appIcon.snapshot();
export const refreshAppIcon=()=>appIcon.refresh();
export const setAppIcon=choice=>appIcon.setChoice(choice);
