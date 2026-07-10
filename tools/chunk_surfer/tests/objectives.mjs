// The bag is the job. Pure Node — this is a filing question, not a rendering one.
//
//   node tools/chunk_surfer/tests/objectives.mjs
//
// Four claims:
//   · Notes file under the room they name, in the client's order.
//   · A sheet that names no room lands in UNFILED, where it is exactly as
//     useful as it was on the floor.
//   · Marking a room is the only navigation the game gives you, and it points
//     at the cell where the take is made.
//   · A recorded room says so.

import * as OBJ from '../../../public/labs/chunk-surfer/src/game/objectives.js';
import { PAGES, TARGETS, ROOM_CELLS } from '../../../public/labs/chunk-surfer/src/data/conservatory-script.js';

let pass = true;
const ck = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };

const label = (r) => r;
const notes = PAGES.slice();                       // every sheet, as if all found
const takes = new Set(['main_b3']);

let job = OBJ.objectives({ rooms: TARGETS, notes, hasTake: (r) => takes.has(r), label });

ck('the client\'s five rooms, in the client\'s order',
   job.rooms.length === 5 && job.rooms[0].roomId === 'main_b3',
   job.rooms.map((r) => r.roomId).join(' → '));

// Every page that names a room is filed under it, and nowhere else.
const filedIds = new Set(job.rooms.flatMap((r) => r.notes.map((n) => n.id)));
const misfiled = job.rooms.flatMap((r) => r.notes.filter((n) => n.room !== r.roomId).map((n) => `${n.id}→${r.roomId}`));
ck('every note is filed under the room it names', misfiled.length === 0, misfiled.join(' '));

const shouldFile = notes.filter((n) => n.room && TARGETS.includes(n.room));
ck('...and all of them are', shouldFile.every((n) => filedIds.has(n.id)),
   `${filedIds.size} filed of ${shouldFile.length}`);

// A sheet that names no room is not lost, and it is not filed.
const orphans = notes.filter((n) => !n.room);
ck('a sheet that names no room lands in UNFILED',
   job.unfiled.length === orphans.length && orphans.every((n) => job.unfiled.includes(n)),
   job.unfiled.map((n) => n.id).join(' '));
ck('...and UNFILED is not empty in the real building', orphans.length > 0, `${orphans.length} sheets`);

// Takes.
ck('a recorded room says so', job.rooms.find((r) => r.roomId === 'main_b3').recorded);
ck('an unrecorded one does not', !job.rooms.find((r) => r.roomId === 'lux_nova').recorded);
ck('and the counter counts', job.done === 1 && job.total === 5, `${job.done}/${job.total}`);

// Marking. The only navigation the game gives you: a room, not a route.
ck('nothing is marked to begin with', !job.rooms.some((r) => r.marked));

const cell = ROOM_CELLS.the_tub;
OBJ.setWaypoint(cell.x, cell.y, 'the_tub');
job = OBJ.objectives({ rooms: TARGETS, notes, hasTake: (r) => takes.has(r), label });
ck('marking a room marks exactly one room',
   job.rooms.filter((r) => r.marked).length === 1 && job.rooms.find((r) => r.marked).roomId === 'the_tub');
ck('...and the waypoint is the cell the take is made in',
   OBJ.waypoint().x === cell.x && OBJ.waypoint().y === cell.y, JSON.stringify(OBJ.waypoint()));

// Every room the client names must have somewhere to send you.
const noCell = TARGETS.filter((r) => !ROOM_CELLS[r]);
ck('every room on the order can be marked', noCell.length === 0, noCell.join(' '));

console.log(pass ? '\n✅ OBJECTIVES PASSED' : '\n❌ FAILURES');
process.exit(pass ? 0 : 1);
