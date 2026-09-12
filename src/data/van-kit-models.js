// Original, separate field-kit objects. +Y is up; the authored root is centered
// in X/Z with its lowest point at Y=0. Workbench placements may fit the bounds.
const model=(id,name,scale=3.3,inspect={yaw:.35,pitch:-.12})=>Object.freeze({
  id,name,model:`assets/items/${id}.glb`,scale,
  lighting:Object.freeze({environmentIntensity:1.3,exposure:1.08}),
  inspect:Object.freeze(inspect),up:'Y',origin:'floor-center',
});
export const VAN_KIT_MODELS=Object.freeze({
  'field-case':model('field-case','AUDIOCORP FC–7 Field Case',3.05,{yaw:-.24,pitch:-.20}),
  'field-recorder':model('field-recorder','AUDIOCORP DA–1000 Field Recorder',3.7,{yaw:.25,pitch:-.12}),
  'headphones-reference':model('headphones-reference','AUDIOCORP HM–1 Reference Headphones',3.5),
  'headphones-closed':model('headphones-closed','AUDIOCORP HM–2 Closed Headphones',3.5),
  'headphones-open':model('headphones-open','AUDIOCORP HM–3 Open Headphones',3.5),
  'microphone-reference':model('microphone-reference','AUDIOCORP CM–1 Reference Microphone',3.45),
  'microphone-directional':model('microphone-directional','AUDIOCORP CM–2 Directional Microphone',3.45),
  'microphone-wide':model('microphone-wide','AUDIOCORP CM–3 Wide-field Microphone',3.45),
});
export const WITNESS_MODELS=Object.freeze({
  'field-recorder-witness':model('field-recorder-witness','AUDIOCORP WITNESS EDITION',3.7,{yaw:.25,pitch:-.12}),
  'witness-faceplate':model('witness-faceplate','WITNESS EDITION / Service Faceplate',3.7,{yaw:.25,pitch:-.12}),
});
// Bench stock is deliberately separate from the eight original carried assets.
// These are distinct housings, not color-swapped copies of one instrument.
export const BENCH_MODELS=Object.freeze({
  'amp-reference':model('amp-reference','AUDIOCORP PA–1 Reference Amplifier',2.7),
  'amp-low-draw':model('amp-low-draw','AUDIOCORP PA–2 Low-draw Amplifier',2.7),
  'amp-headroom':model('amp-headroom','AUDIOCORP PA–3 High-headroom Amplifier',2.7),
  'flashlight-reference':model('flashlight-reference','AUDIOCORP FL–1 Field Light',3.5),
  'flashlight-throw':model('flashlight-throw','AUDIOCORP FL–2 Long-throw Light',3.5),
  'flashlight-flood':model('flashlight-flood','AUDIOCORP FL–3 Flood Light',3.5),
  'faceplate-aluminum':model('faceplate-aluminum','DA–1000 / Brushed Aluminum Faceplate',3.7),
  'faceplate-black':model('faceplate-black','DA–1000 / Black Anodized Faceplate',3.7),
  'faceplate-olive':model('faceplate-olive','DA–1000 / Olive Enamel Faceplate',3.7),
});
export function vanKitModel(id){return VAN_KIT_MODELS[id]||WITNESS_MODELS[id]||BENCH_MODELS[id]||null;}
