// Issued building notes. Dates stay within the established chapel commission;
// undated alterations are identified as such rather than assigned false years.
const note = (period, use, fact) => Object.freeze({ period, use, fact });
export const ROOM_HISTORY = Object.freeze({
  'space:main_b3': note('Dance wing; construction date not recorded.', 'Dance students and their accompanists.', 'A sprung timber floor carries footfall into the room. The piano belongs to the teaching space, not the public concert inventory.'),
  'space:the_tub': note('Natatorium wing; construction date not recorded.', 'Swimming classes and changing-room staff.', 'Tile, water and the high enclosure return sound from several directions. The basin and its plant were maintained as one installation.'),
  'space:amplifications': note('Concert hall; public-room fittings replaced in successive refits.', 'Visiting orchestras, conservatory ensembles and prize-night audiences.', 'Programmes record winter concerts and municipal performances. The last advertised season was crossed out before it opened.'),
  'space:soundnoisemusic': note('Upper teaching wing; later practice-suite fit-out.', 'Instrumental students and ensemble tutors.', 'The reference room served the surrounding practice rooms. Furniture was bought for the suite as a group.'),
  'space:lux_nova': note('Chapel commission, 1908.', 'Chapel musicians, choir and congregation.', 'The score cabinets and presider chair were made for this chapel. Their EC/C marks belong to the original commission.'),
  'space:basement-corridor': note('Dance-wing circulation; date not recorded.', 'Dancers, accompanists and maintenance staff.', 'Service doors connect the teaching studios to stores and plant. Sound from a studio can travel along this corridor.'),
  'space:prop-store': note('Basement store; later inventory accumulated here.', 'Stage and teaching staff.', 'Objects were retained for reuse after leaving the public rooms. Storage here does not establish an object\'s original room.'),
  'space:studio-b2': note('Dance wing; date not recorded.', 'Small teaching groups and accompanists.', 'The service connection to B3 allowed equipment to move between studios without taking it through the corridor.'),
  'space:studio-b1': note('Dance wing, beside the old lift.', 'Movement classes and staff moving equipment.', 'The lift hatch is a service opening. It is not listed as a public exit.'),
  'space:studio-b5': note('Dance wing; date not recorded.', 'Rehearsal groups.', 'A separate corridor door kept this studio independent of the B1–B3 teaching rooms.'),
  'space:plant-room': note('Services altered during the building\'s working life.', 'Boiler and water-system maintenance staff.', 'The conservatory\'s occupied rooms depended on this plant. Pipe noise can be transmitted well beyond the plant-room walls.'),
  'space:services-substation': note('Later services refit; an isolation label is dated 1994.', 'Electrical maintenance staff.', 'The date on an isolation label records work on the equipment, not the age of the room.'),
  'space:services-tank': note('Tank annex; installation date not recorded.', 'Water-system maintenance staff.', 'The annex is reached from the services spur. Its tank and pipework form part of the building\'s water installation.'),
  'space:lift-shaft': note('Former goods-lift installation; date not recorded.', 'Porters and maintenance staff.', 'The shaft served the movement of equipment. The remaining hatch is accessible from Studio B1.'),
  'space:loading-bay': note('Service entrance; date not recorded.', 'Delivery crews and visiting production staff.', 'Instruments and scenery arrived here. The grey door leads into the Scene Dock.'),
  'space:get-in': note('Scene Dock; service accommodation retained through later refits.', 'Stage crews unloading and assembling equipment.', 'The dock links the loading bay, service route and front of house. It allowed deliveries to be kept out of audience circulation.'),
  'space:atrium': note('Public entrance; furnished during a formal refit.', 'Audiences, ushers and waiting visitors.', 'The sofa, two armchairs and two console tables were supplied as a matching waiting-room suite.'),
  'space:box-office': note('Front-of-house office; date not recorded.', 'Booking clerks and house management.', 'Tickets, programmes and audience enquiries were handled beside the public entrance.'),
  'space:ground-spine': note('Main ground-floor circulation; date not recorded.', 'Students, audiences and staff.', 'This route joins the service side of the building to its public and teaching spaces.'),
  'space:main-stair-ground': note('Main stair; date not recorded.', 'Students, staff and visitors to the upper rooms.', 'The stair connects the ground circulation to the teaching wing above.'),
  'space:upper-landing': note('Upper teaching wing; date not recorded.', 'Students waiting between lessons.', 'The landing distributes traffic from the main stair toward the practice rooms and chapel approach.'),
  'space:practice-corridor': note('Later practice-suite arrangement.', 'Instrumental students and their tutors.', 'Eight rooms were arranged on either side of the corridor. Their matching chairs were purchased under one contract.'),
  'space:practice-1': note('Later practice-suite fit-out.', 'Individual instrumental tuition.', 'The first room on the west side shares the suite\'s P/CH furniture marking.'),
  'space:practice-2': note('Later practice-suite fit-out.', 'Individual instrumental tuition.', 'The first east-side room faces Practice Room 1 across the corridor.'),
  'space:practice-3': note('Later practice-suite fit-out.', 'Individual practice and supervised lessons.', 'The second west-side room belongs to the same eight-room booking group.'),
  'space:practice-4': note('Later practice-suite fit-out.', 'Individual practice and supervised lessons.', 'The second east-side room faces Practice Room 3. Its furniture was supplied with the rest of the suite.'),
  'space:practice-5': note('Later practice-suite fit-out.', 'Individual instrumental tuition.', 'The third west-side room sits toward the ensemble end of the corridor.'),
  'space:practice-6': note('Later practice-suite fit-out.', 'Individual instrumental tuition.', 'The third east-side room faces Practice Room 5, near the ensemble-room approach.'),
  'space:practice-7': note('Later practice-suite fit-out.', 'Students practising between ensemble sessions.', 'The last west-side practice room ends the numbered run on this side of the corridor.'),
  'space:practice-8': note('Later practice-suite fit-out.', 'Students practising between ensemble sessions.', 'The last east-side practice room completes the suite of eight.'),
  'space:ensemble-room': note('Upper teaching wing; furnishings renewed during later service.', 'Small ensembles and their tutors.', 'The side entrance allowed players from the practice suite to gather without passing through another teaching room.'),
  'space:chapel-narthex': note('Chapel commission, 1908.', 'Congregation, choir and chapel attendants.', 'The enclosed approach separated arrivals from services in progress.'),
  'landmark:ringing-room': note('Chapel tower, 1908.', 'The chapel\'s bell ringers.', 'The board records a 1908 touch of Stedman Triples. A touch is a shorter ringing performance, not a full peal.'),
  'landmark:bell-chamber': note('Bells cast for the chapel in 1908.', 'Bell hangers, tuners and maintenance staff.', 'J. Vale & Sons supplied eight bells. The foundry plate gives the tenor\'s weight as 2,200 kilograms.'),
  'landmark:organ-loft': note('Chapel accommodation; instrument alterations are undated.', 'Organists and chapel musicians.', 'The elevated position connects the instrument to the chapel below while keeping the player apart from the congregation.'),
  'space:academic-loggia': note('Academic wing; construction date not recorded.', 'Students and teaching staff.', 'The stair arrival opens onto the academic circulation rather than directly into a classroom.'),
  'space:academic-gallery': note('Academic wing; collection accumulated over time.', 'Students and visitors moving between teaching rooms.', 'Display objects are separate accessions. Their individual ages do not date the gallery.'),
  'space:academic-lobby': note('Academic wing; date not recorded.', 'Visitors and students waiting for appointments.', 'The lobby joins the gallery to the core corridor.'),
  'space:academic-core': note('Academic teaching arrangement; date not recorded.', 'Class groups and faculty.', 'Classrooms open from both sides. Offices occupy the end of the teaching run.'),
  'space:classroom-west-1': note('Academic wing; date not recorded.', 'Class teaching.', 'The first west-side classroom sits nearest the lobby end of the core corridor.'),
  'space:classroom-west-2': note('Academic wing; date not recorded.', 'Class teaching.', 'The second west-side classroom faces the east-side teaching rooms across the core.'),
  'space:classroom-east-2': note('Academic wing; date not recorded.', 'Class teaching.', 'The first numbered east-side teaching room on this plan is E2; the plan does not assign an E1 classroom.'),
  'space:classroom-west-3': note('Academic wing; date not recorded.', 'Class teaching.', 'The third west-side classroom occupies the middle portion of the teaching corridor.'),
  'space:classroom-east-3': note('Academic wing; date not recorded.', 'Class teaching.', 'This room faces the W3 teaching space across the core corridor.'),
  'space:classroom-west-4': note('Academic wing; date not recorded.', 'Class teaching.', 'The last west-side classroom is nearest the faculty offices.'),
  'space:classroom-east-4': note('Academic wing; date not recorded.', 'Class teaching.', 'The last east-side classroom is beside the reception end of the corridor.'),
  'space:faculty-office-west': note('Academic offices; date not recorded.', 'Teaching faculty.', 'A private office off the end of the academic core. Staff names are absent from the issued plan.'),
  'space:faculty-office-east': note('Academic offices; date not recorded.', 'Teaching faculty.', 'The second private office shares the reception approach with its western neighbour.'),
  'space:academic-reception': note('Academic offices; date not recorded.', 'Administrative staff and visitors.', 'Reception served the faculty offices and the teaching rooms along the core.'),
  'space:stripped-office': note('Former office; clearance date not recorded.', 'Administrative staff; no individual occupant is listed.', 'The room retains its office designation after its furnishings were removed.'),
});

export function roomHistory(space) {
  return space && !space.unknown ? ROOM_HISTORY[space.id] || null : null;
}

export function roomHistoryText(space) {
  const record = roomHistory(space);
  if (!record) return [];
  return [space.label, `BUILDING HISTORY: ${record.period}`, `OCCUPANTS: ${record.use}`, record.fact,
    ...(space.objective?.notes || []).map(doc => `ON FILE: ${doc.title || doc.label || doc.id}`)];
}
