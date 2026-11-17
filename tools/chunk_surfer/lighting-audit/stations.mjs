// Fixed camera stations for the lighting audit. Each is an authored god hook,
// Source preset or drive fixture plus an optional look, so a later capture
// stands in the same place.
export const STATIONS = Object.freeze([
  {id: 'get-in', space: 'conservatoire', title: 'Get-in (scene dock)', hook: 'get-in', torch: false},
  {id: 'get-in-torch', space: 'conservatoire', title: 'Get-in, torch on', hook: 'get-in', torch: true},
  {id: 'practice-corridor', space: 'conservatoire', title: 'Practice corridor, torch on', hook: 'practice-corridor', torch: true},
  {id: 'chapel', space: 'conservatoire', title: 'Chapel', hook: 'chapel', torch: false},
  {id: 'concert-hall', space: 'conservatoire', title: 'Concert hall', hook: 'concert-hall', torch: false},
  {id: 'front-atrium', space: 'conservatoire', title: 'Front atrium', hook: ['front-atrium', 'box-office', 'main-stair-ground'], torch: false},
  {id: 'yard-road', space: 'exterior', title: 'Yard road (street lamps)', hook: 'yard-road', torch: false},
  {id: 'drive', space: 'drive', title: 'Source drive, start', settleMs: 9000,
    enter: "const s=await probe.sourceDrive.start(); if(s) return true; const t=await probe.beginGetInDriveTeaser(); return t?true:{start:!!s,teaser:t,state:probe.sourceDrive.state()};"},
  {id: 'drive-teaser', space: 'drive', title: 'Opening drive (get-in teaser)', settleMs: 9000,
    enter: "const t=await probe.beginGetInDriveTeaser(); return t?true:{teaser:t};"},
  {id: 'source-first-lift', space: 'source', title: 'Source: first lift', sourcePreset: 'first-lift', offset: {x: 18, y: 0}, yaw: 0, torch: false},
  {id: 'source-first-contact', space: 'source', title: 'Source proper: first contact', sourcePreset: 'first-contact', torch: false},
  {id: 'source-landscape', space: 'source', title: 'Source: landscape', sourcePreset: 'landscape', torch: false},
  {id: 'source-hall-entry', space: 'source', title: 'Source: hall entry', sourcePreset: 'hall-entry', torch: false},
  {id: 'source-last-reception', space: 'source', title: 'Source: last reception', sourcePreset: 'last-reception', torch: false},
]);
