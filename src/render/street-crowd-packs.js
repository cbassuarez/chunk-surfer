import {STREET_CROWD_CHARACTER_MESHES} from '../data/street-crowd-characters.js';

// A renderer rebuild invalidates pending loads as well as the old ready bit.
// Keep legacy bodies until both the anatomical pack and fixed kit are present.
export function createStreetCrowdPackLoader({props,resolveAsset=path=>path,onError=()=>{}}){
  let generation=0,state={characters:false,props:false,error:null};
  const status=()=>({...state,ready:state.characters&&state.props&&!state.error});
  function reset(){generation++;state={characters:false,props:false,error:null};return generation;}
  async function part(kind,url,load,validate,token){
    try{
      await load(resolveAsset(url));
      if(token!==generation)return;
      if(!validate())throw Error(`Incomplete street crowd ${kind} pack`);
      state[kind]=true;
    }catch(error){
      if(token!==generation)return;
      state.error=String(error?.message||error);onError(error,kind);
    }
  }
  async function load(token=generation){
    if(token!==generation)return status();
    await Promise.all([
      part('characters','assets/street-crowd-characters.glb',url=>props.addCharacterPack(url),()=>{
        const loaded=new Set(props.characterStats().meshes);
        return STREET_CROWD_CHARACTER_MESHES.every(mesh=>loaded.has(mesh));
      },token),
      part('props','assets/street-crowd-props.glb',url=>props.addPropPack(url),()=>{
        const loaded=new Set(props.propMeshCatalog());
        return ['street_crowd_folding_chair','street_crowd_camera_tripod'].every(mesh=>loaded.has(mesh));
      },token),
    ]);
    return status();
  }
  return{reset,load,status};
}
