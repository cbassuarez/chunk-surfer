// Cab-local metres, before OPENING_VEHICLE.cabinMount. These are separate
// belongings, not a new inventory or an alternate job-acceptance authority.
export const OPENING_CAB_ASSET='assets/opening-cab-objects.glb';
export const OPENING_CAB_PLACEMENT=Object.freeze({
  paper:Object.freeze({point:Object.freeze([-.50,1.270,-.72]),yaw:.08,scale:.9,halfX:.144,halfZ:.189}),
  notebook:Object.freeze({point:Object.freeze([-.12,1.2658,-.80]),size:Object.freeze([.15,.018,.20]),yaw:-.035}),
  fieldCase:Object.freeze({point:Object.freeze([-.48,.6702,-.25]),width:.624,yaw:-Math.PI/2}),
  mirror:Object.freeze({point:Object.freeze([.02,1.80,-.30]),size:Object.freeze([.24,.095,.025]),mount:Object.freeze([.02,1.92,-.25])}),
});
export const OPENING_CAB_OBJECTS=Object.freeze([
  {id:'job-papers',kind:'document',label:'READ THE WORK ORDER'},
  {id:'notebook',kind:'notes',label:'OPEN THE NOTEBOOK'},
  {id:'self-check',kind:'status',label:'CHECK YOURSELF'},
  {id:'recorder',kind:'instrument',label:'INSPECT THE RECORDER',group:'recorder'},
  {id:'headphones',kind:'instrument',label:'INSPECT THE HEADPHONES',group:'headphones'},
  {id:'microphone',kind:'instrument',label:'INSPECT THE MICROPHONE',group:'microphone'},
  {id:'flashlight',kind:'instrument',label:'INSPECT THE FLASHLIGHT',group:'flashlight'},
  {id:'amp',kind:'instrument',label:'INSPECT THE AMPLIFIER',group:'amp'},
].map(Object.freeze));
