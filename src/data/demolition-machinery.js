// One existing compact tracked machine, parked with its bucket grounded. The
// renderer and ordinary body clearance share this metre-space contract.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const DEMOLITION_EXCAVATOR=freeze({
  id:'demolition-excavator-between-buildings',mesh:'demolition_excavator',revision:'parked-articulated-2',
  placement:{x:31,z:65,yaw:.10},
  baseCollision:{width:2.12,depth:2.84,height:2.70},
  track:{centresX:[-.75,.75],centerY:.30,centerZ:.08,endZ:1.0,radius:.26,width:.43,shoes:32},
  maximumTriangles:12000,
  // Authored clearance, not additional paving or an invented entrance.
  pedestrianLane:{x0:25.6,x1:28.0,z0:58,z1:77},
  references:[{url:'https://www.jcb.com/globalassets/digizuite/68882-45z-1-48z-1-51r-1---en-gb---quickstart-guides-2025/',
    supports:'Primary component/maintenance locations and compact tracked-excavator dimension drawing: track running gear, slew ring, operator cab, separate boom/dipper/bucket and hydraulic service points.',
    limit:'Original fictional unbranded plant, with an authored parked attachment pose; not an exact JCB reconstruction or operating instruction.'}],
});
