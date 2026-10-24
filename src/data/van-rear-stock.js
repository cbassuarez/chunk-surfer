// The world and close preparation view share the same physical stock choices.
// This never creates ownership; the existing catalog remains authoritative.
import {WORKBENCH_VARIANTS,workbenchCatalog} from './workbench-catalog.js';

export const VAN_REAR_STOCK_PARTS=Object.freeze(Object.entries(WORKBENCH_VARIANTS).flatMap(([group,options])=>
 options.map(optionId=>Object.freeze({group,optionId,key:`variant:${group}:${optionId}`,
  id:`yard-van-stock-${group}-${optionId}`,
  mesh:`yard_van_stock_${group}_${optionId.replaceAll('-','_')}`}))));

export function vanRearStockState({closed=false,...state}={}){
 const visible=new Set(closed?[]:workbenchCatalog(state).filter(object=>
  object.kind==='variant'&&object.destination==='bench').map(object=>object.key));
 return VAN_REAR_STOCK_PARTS.map(part=>({...part,visible:visible.has(part.key)}));
}
