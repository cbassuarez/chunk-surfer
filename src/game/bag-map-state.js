// Persisted map knowledge that belongs to the player's issued plan. Structural
// names are always present; this record only supplies the VISITED annotation.

export const BAG_MAP_SCHEMA=1;

export function freshBagMapState(){return{schema:BAG_MAP_SCHEMA,visited:[]};}

export function normalizeBagMapState(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const visited=[...new Set((Array.isArray(source.visited)?source.visited:[])
    .filter((id)=>typeof id==='string'&&id.length>0&&id.length<=96))].slice(0,256);
  return{schema:BAG_MAP_SCHEMA,visited};
}

export function visitBagMapSpace(value,spaceId){
  const state=normalizeBagMapState(value),id=String(spaceId||'');
  if(!id||state.visited.includes(id))return{state,changed:false};
  return{state:{...state,visited:[...state.visited,id]},changed:true};
}
