// The radio in the van's dash. The layout is the radio-cassette Ford fitted across its
// range in the late eighties, Transits included: metal frame, tape door, a row of tall
// station keys, tone and volume on the right. Where the Ford had a dim window this one has
// a green tube off a better car stereo, because somebody who records sound for a living
// would have swapped it. There's no maker's name on it. Nobody needs to know whose it was.
//
// Everything here is metres in cab space, measured from the middle of the face, so the
// builder, the hands, the reach targets and the lean-in all press the same place.
const freeze=Object.freeze;
const rows=list=>freeze(list.map(freeze));

export const CAB_RADIO_PACK='assets/source-drive/cab-radio/cab-radio.glb';

const CENTER=freeze([.025,1.1]),FACE_Z=-.397;
export const CAB_RADIO=freeze({
  center:CENTER,faceZ:FACE_Z,
  surround:freeze({w:.224,h:.09}),
  face:freeze({w:.186,h:.058}),
  readout:freeze({x:-.0425,y:.0150,w:.096,h:.025}),
  door:freeze({x:.0345,y:.0150,w:.05,h:.025}),
  eject:freeze({x:.0475,y:.0060,w:.018,h:.005}),
  seek:rows([{id:'seek-down',x:.0715,y:.0145,w:.01,h:.019},{id:'seek-up',x:.083,y:.0145,w:.01,h:.019}]),
  tune:freeze({x:-.073,y:-.0145,w:.024,h:.021}),
  keys:rows([{id:'1',x:-.053},{id:'2',x:-.04},{id:'3',x:-.027},{id:'4',x:-.014}]),
  keyRow:freeze({y:-.0145,w:.0108,h:.021,proud:.0065,latched:.0028}),
  band:rows([{id:'ml',x:-.0015,y:-.0092,w:.0105,h:.0098},{id:'fm',x:-.0015,y:-.0198,w:.0105,h:.0098},
    {id:'lo',x:.0105,y:-.0092,w:.0105,h:.0098},{id:'ld',x:.0105,y:-.0198,w:.0105,h:.0098}]),
  tone:freeze({x:.033,y:-.0145,r:.0066,proud:.012}),
  volume:freeze({x:.058,y:-.0145,r:.0108,proud:.019,offAngle:2.5,minAngle:2.15,maxAngle:-2.15}),
  noise:freeze({x:.0815,y:-.0145,w:.0085,h:.012}),
});

/** A face offset (x, y, standing out by z) as a point in cab space. */
export function cabRadioPoint(x=0,y=0,z=0){return[CENTER[0]+x,CENTER[1]+y,FACE_Z+z];}
export function cabRadioKeyPoint(index,z=CAB_RADIO.keyRow.proud){const key=CAB_RADIO.keys[index]||CAB_RADIO.keys[0];return cabRadioPoint(key.x,CAB_RADIO.keyRow.y,z);}
export function cabRadioVolumePoint(z=CAB_RADIO.volume.proud){return cabRadioPoint(CAB_RADIO.volume.x,CAB_RADIO.volume.y,z);}

/** Key depth and knob angle for a radio in this state. Same on the road as parked. */
export function cabRadioPose({on=true,preset=-1,volume=.6}={}){
  const{minAngle,maxAngle,offAngle}=CAB_RADIO.volume,level=Math.max(0,Math.min(1,Number(volume)||0));
  return{keys:CAB_RADIO.keys.map((_,i)=>on&&i===preset?CAB_RADIO.keyRow.latched:0),volumeAngle:on?minAngle+(maxAngle-minAngle)*level:offAngle};
}

// The presets as they were left. Key four only answers when the van is parked, which is
// when there's somebody to listen to it.
export const CAB_RADIO_FREQUENCIES=freeze([89.3,96.4,103.7,107.2]);
export const CAB_RADIO_ROAD_STATIONS=freeze(['service','company','music']);
export const CAB_RADIO_ROAD_NAMES=freeze({service:'SERVICE',company:'COMPANY',music:'MUSIC'});

// What the tube's clock says on the way in. Each dial cut has lost some of the night by
// the time the picture comes back. It runs out just short of the time on the gate's sheet.
export const CAB_RADIO_ROAD_CLOCK=freeze({road:[20,52],figure:[20,59],again:[21,6],oncoming:[21,14],stalled:[21,22],bus:[21,29],edge:[21,33]});
export const CAB_RADIO_ROAD_CLOCK_LAST=freeze([21,37]);

// Close enough to read it, from just on the driver's side of it.
export const CAB_RADIO_LEAN=freeze({eye:freeze([.034,1.117,-.283]),target:freeze([.025,1.1,-.397]),seconds:.42});

/** Which way the head is turned once it's there, relative to straight ahead down the van. */
export function cabRadioLeanAngles(){
  const{eye,target}=CAB_RADIO_LEAN,dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2];
  return{yaw:Math.atan2(dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))};
}

const unit=v=>{const l=Math.hypot(...v)||1;return v.map(n=>n/l);},dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
/** Where a face offset lands on screen (0 to 1) from the lean, before the renderer has said. */
export function cabRadioLeanProject(x=0,y=0,z=0,{tan=.7,aspect=16/9}={}){
  const{eye,target}=CAB_RADIO_LEAN,point=cabRadioPoint(x,y,z),forward=unit(target.map((v,i)=>v-eye[i])),right=unit([-forward[2],0,forward[0]]);
  const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
  const d=point.map((v,i)=>v-eye[i]),depth=Math.max(.01,dot(d,forward));
  return{x:.5+dot(d,right)/(depth*tan*aspect)/2,y:.5-dot(d,up)/(depth*tan)/2,visible:true};
}
