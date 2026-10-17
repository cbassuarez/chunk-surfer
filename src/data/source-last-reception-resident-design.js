// Anonymous residents belong only to the Last Reception. Their proportions,
// muted dress and held poses are independent of the game's named encounters.
export const SOURCE_LAST_RECEPTION_RESIDENT_DESIGNS = Object.freeze({
  host: { mesh:'source_reception_host', source:'male', height:1.76, width:1.03, depth:1.02, dress:'waistcoat', coat:[.16,.165,.158], trim:[.29,.29,.265], skin:[.34,.35,.33], trouser:[.11,.12,.117], lean:.015, sideLean:-.025, headYaw:.06, hands:'welcome', seed:.17 },
  'guest-a': { mesh:'source_reception_guest_a', source:'female', height:1.66, width:1.08, depth:1.04, dress:'longcoat', coat:[.27,.28,.26], trim:[.17,.18,.17], skin:[.40,.41,.385], trouser:[.15,.16,.15], lean:.035, sideLean:.045, headYaw:-.17, hands:'folded', seed:1.37 },
  'guest-b': { mesh:'source_reception_guest_b', source:'male', height:1.83, width:.90, depth:.93, dress:'jacket', coat:[.18,.19,.18], trim:[.24,.245,.23], skin:[.30,.32,.30], trouser:[.12,.13,.12], lean:.09, sideLean:-.035, headYaw:.14, hands:'argument', seed:2.81 },
  window: { mesh:'source_reception_window', source:'female', height:1.73, width:.91, depth:.97, dress:'longcoat', coat:[.19,.21,.20], trim:[.25,.26,.24], skin:[.365,.385,.36], trouser:[.13,.15,.14], lean:.08, sideLean:.018, headYaw:-.36, hands:'window', seed:3.64 },
  warning: { mesh:'source_reception_warning', source:'male', height:1.69, width:1.08, depth:1.05, dress:'workcoat', coat:[.30,.31,.285], trim:[.20,.21,.19], skin:[.38,.39,.36], trouser:[.15,.16,.145], lean:.055, sideLean:.055, headYaw:.08, hands:'quiet', seed:4.93 },
  gallery: { mesh:'source_reception_gallery', source:'female', height:1.78, width:1.02, depth:1.02, dress:'jacket', coat:[.225,.23,.22], trim:[.15,.16,.15], skin:[.33,.345,.32], trouser:[.13,.14,.125], lean:.025, sideLean:-.04, headYaw:.18, hands:'rail', seed:5.71 },
  imprint: { mesh:'source_reception_imprint', source:'male', height:1.75, width:.99, depth:.99, dress:'waistcoat', coat:[.14,.145,.133], trim:[.16,.17,.15], skin:[.20,.21,.19], trouser:[.12,.13,.115], lean:.13, sideLean:0, headYaw:0, hands:'lap', seed:0 },
});

export const SOURCE_LAST_RECEPTION_RESIDENT_MESHES = Object.freeze(Object.values(SOURCE_LAST_RECEPTION_RESIDENT_DESIGNS).map(d=>d.mesh));
