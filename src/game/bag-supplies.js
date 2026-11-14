// Existing finite cache grants, retained as physical packages until explicitly
// fitted. save.items owns the packages; the old cache flags prevent reissue.
export const BAG_SUPPLY_IDS=Object.freeze({B3:'sealed-cells:b3',POOL:'sealed-cells:pool',RIG:'sealed-cells:rig'});
const supply=(id,fields)=>Object.freeze({id,role:'torch-supply',readyCapable:false,battleCapable:false,...fields});
export const BAG_SUPPLIES=Object.freeze({
  [BAG_SUPPLY_IDS.B3]:supply(BAG_SUPPLY_IDS.B3,{label:'SEALED TORCH CELL',cacheFlag:'b3.spare-cell',charge:.25,cells:1,sealed:true,
    source:'STUDIO B3 / SPARES TIN',propId:'b3-spare-cell-tin',
    description:'One sealed torch cell from the tin beneath the console. Kept intact until fitted.'}),
  [BAG_SUPPLY_IDS.POOL]:supply(BAG_SUPPLY_IDS.POOL,{label:'SEALED MAINTENANCE CELLS',cacheFlag:'pool.cells',charge:.5,cells:2,sealed:true,
    source:'NATATORIUM / MAINTENANCE CART',propId:'pool-cart-1',
    description:'Two alkaline cells in the sealed maintenance sleeve. The complete set fits together.'}),
  [BAG_SUPPLY_IDS.RIG]:supply(BAG_SUPPLY_IDS.RIG,{label:'RECOVERED RIG CELLS',cacheFlag:'rig.cells',requiredFlag:'rig.gutted',charge:.75,cells:2,sealed:false,
    source:'PLANT ROOM / STRIPPED CONVERTER',propId:null,
    description:'The two good cells removed from the converter. Taking them sacrificed the working rig; the complete set is kept together until fitted.'}),
});
export function bagSupplyDefinition(id){return typeof id==='string'&&Object.hasOwn(BAG_SUPPLIES,id)?BAG_SUPPLIES[id]:null;}
const itemsOf=save=>Array.isArray(save?.items)?save.items:[];
const owns=(save,id)=>itemsOf(save).includes(id);
const unchanged=reason=>({changed:false,reason,patch:null});

export function takeBagSupply(save,id){
  const item=bagSupplyDefinition(id);if(!item)return unchanged('unknown-supply');
  // A true legacy flag means charge was already credited under the old rules.
  // Do not reconstruct another physical package from that historical receipt.
  if(save?.flags?.[item.cacheFlag])return unchanged('taken-already');
  if(item.requiredFlag&&!save?.flags?.[item.requiredFlag])return unchanged('source-not-released');
  return{changed:true,reason:null,patch:{items:owns(save,id)?[...itemsOf(save)]:[...itemsOf(save),id],
    flags:{...(save?.flags||{}),[item.cacheFlag]:true}}};
}

export function bagSupplyFitAvailability(save,id,{rec=save?.rec,batteryMax=2,inCombat=false,recording=false,listening=false}={}){
  const item=bagSupplyDefinition(id);
  if(!item)return{enabled:false,reason:'UNKNOWN SUPPLY'};
  if(!owns(save,id))return{enabled:false,reason:'ITEM NOT CARRIED'};
  if(inCombat)return{enabled:false,reason:'NOT DURING CONTACT'};
  if(recording||listening)return{enabled:false,reason:'LOWER THE RECORDER FIRST'};
  const battery=rec?.battery==null?1:rec.battery;
  if(!Number.isFinite(battery)||!Number.isFinite(batteryMax)||battery<0||batteryMax<=0||battery>batteryMax)
    return{enabled:false,reason:'CHARGE UNAVAILABLE'};
  if(battery+item.charge>batteryMax)return{enabled:false,reason:'NOT ENOUGH RESERVE SPACE'};
  return{enabled:true,reason:''};
}

export function fitBagSupply(save,id,options={}){
  const availability=bagSupplyFitAvailability(save,id,options);
  if(!availability.enabled)return unchanged(availability.reason);
  const item=bagSupplyDefinition(id),rec=options.rec===undefined?save?.rec:options.rec;
  const snapshot=rec&&typeof rec==='object'?structuredClone(rec):{};
  const battery=snapshot.battery==null?1:snapshot.battery;
  return{changed:true,reason:null,patch:{items:itemsOf(save).filter(value=>value!==id),
    flags:{...(save?.flags||{}),[item.cacheFlag]:true},rec:{...snapshot,battery:battery+item.charge}}};
}

export function bagSupplyItems(save,options={}){
  return Object.values(BAG_SUPPLIES).filter(item=>owns(save,item.id)).map(item=>{
    const fit=bagSupplyFitAvailability(save,item.id,options),amount=`+${Math.round(item.charge*100)}% CHARGE`;
    return{id:item.id,sourceId:item.id,role:item.role,label:item.label,title:item.label,description:item.description,
      stackKey:'torch-cells',stackLabel:'TORCH CELLS',quantity:item.cells,
      icon:'battery',present:true,readyCapable:false,battleCapable:false,value:amount,
      subtitle:'TORCH SUPPLY / FIT THE COMPLETE SET',location:'IN THE CASE',statusTone:'metadata',
      facts:[['FOUND',item.source],['CONTENTS',`${item.cells} ${item.cells===1?'CELL':'CELLS'}`],['FIT',amount],
        ['USE','EXPLORATION ONLY / FULL SET']],
      primaryAction:{id:'fit-sealed-cells',label:item.cells===1?'FIT CELL':'FIT CELLS',mode:'consume',enabled:fit.enabled,
        reason:fit.reason,confirm:null,closeBefore:true}};
  });
}
