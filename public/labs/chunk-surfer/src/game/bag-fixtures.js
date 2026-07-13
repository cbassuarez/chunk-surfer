//
//  bag-fixtures.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Representative payloads for ?baglab=1.

const document = (id, title, room = null, extra = {}) => ({
  id,
  title,
  room,
  byline: 'ARCHIVAL COPY',
  body: [extra.preview || 'A collected document with enough text to exercise the preview renderer.'],
  ...extra,
});

const room = (roomId, label, extra = {}) => ({
  roomId,
  label,
  notes: [],
  recorded: false,
  marked: false,
  stamp: '',
  ...extra,
});

const baseRooms = () => [
  room('main_b3', 'STUDIO B3', { notes: [document('work-order', 'WORK ORDER 4417-C', 'main_b3', { issued: '21:38', preview: 'Five room tones. Sixty seconds each. Unbroken.' })] }),
  room('the_tub', 'THE NATATORIUM'),
  room('amplifications', 'THE CONCERT HALL'),
  room('soundnoisemusic', 'THE PRACTICE WING'),
  room('lux_nova', 'THE CHAPEL'),
];

const equipment = () => [
  'light',
  'recorder + headphones',
  { id: 'radio', label: 'radio', value: 'LIVE', action() {} },
  'standard keyring',
];

function freshRun() {
  return { id: 'fresh-run', equipment: equipment(), job: { rooms: baseRooms(), unfiled: [], done: 0, total: 5 } };
}

function waypoint() {
  const rooms = baseRooms();
  rooms[0].marked = true;
  return { id: 'waypoint', equipment: equipment(), job: { rooms, unfiled: [], done: 0, total: 5 } };
}

function midRun() {
  const rooms = baseRooms();
  rooms[0].recorded = true; rooms[0].stamp = '22:14';
  rooms[2].recorded = true; rooms[2].stamp = '23:47';
  rooms[3].marked = true;
  rooms[2].notes.push(document('hall-log', 'LOG · 00:47', 'amplifications', { unread: true }));
  return {
    id: 'mid-run',
    equipment: equipment(),
    job: { rooms, unfiled: [document('receipt', 'MAINTENANCE RECEIPT', null, { unread: true })], done: 2, total: 5 },
  };
}

function fullFiles() {
  const rooms = baseRooms();
  for (let i = 0; i < 3; i++) rooms[i].notes.push(document(`page-${i + 1}`, `FIELD LOG ${i + 1}`, rooms[i].roomId, { unread: i === 2 }));
  return {
    id: 'full-files',
    equipment: equipment(),
    job: {
      rooms,
      unfiled: Array.from({ length: 6 }, (_, i) => document(`unfiled-${i}`, `UNFILED PAGE ${i + 1}`, null, { unread: i < 2 })),
      done: 1,
      total: 5,
    },
  };
}

function radioDropped() {
  return {
    id: 'radio-dropped',
    equipment: [
      'light',
      'recorder + headphones',
      { id: 'radio', label: 'radio', value: 'DROPPED', present: false, location: 'LOADING DOCK' },
      'standard keyring',
    ],
    job: { rooms: baseRooms(), unfiled: [], done: 0, total: 5 },
  };
}

function coffee() {
  return {
    id: 'coffee',
    equipment: [...equipment(), { id: 'coffee', label: "the guard's coffee", value: 'GET COLD', action() {} }],
    job: { rooms: baseRooms(), unfiled: [], done: 0, total: 5 },
  };
}

function complete() {
  const rooms = baseRooms().map((r, i) => ({ ...r, recorded: true, stamp: `0${i + 1}:3${i}` }));
  return { id: 'complete', equipment: equipment(), job: { rooms, unfiled: [], done: 5, total: 5 } };
}

function empty() {
  return { id: 'empty', equipment: [], job: { rooms: [], unfiled: [], done: 0, total: 0 } };
}

function longLabels() {
  const rooms = baseRooms();
  rooms[1].label = 'THE FORMER MUNICIPAL NATATORIUM AND SERVICE ANNEX';
  rooms[1].notes.push(document('long-file', 'STRUCTURAL AND ACOUSTICAL ASSESSMENT — REVISED COPY', rooms[1].roomId));
  return { id: 'long-labels', equipment: equipment(), job: { rooms, unfiled: [], done: 0, total: 5 } };
}

export const BAG_LAB_CASES = Object.freeze([
  freshRun(), waypoint(), midRun(), fullFiles(), radioDropped(), coffee(), complete(), empty(), longLabels(),
]);
