// Sign ownership is visible in the substrate and fastening as much as the
// copy. Every name, departure, route and notice here is authored for the game.
const inks = {
  enamel: '#e4dfd0', transit: '#e7b323', red: '#983429', road: '#282c2d',
  paper: '#e3ddc6', municipal: '#495851', tourist: '#4c5544', trail: '#e9b029',
};
const line = (text, x, y, size, face = 'sans', color = inks.road, align, tracking = 0) => ({
  text, x, y, size, face, color, align, tracking,
});
const mark = (kind, x, y, width, height, color, direction) => ({
  kind, x, y, width, height, color, direction,
});
const print = (id, width, height, base, lines, marks = [], finish = 'paint') => Object.freeze({
  id, width, height, base, lines: Object.freeze(lines), marks: Object.freeze(marks), finish,
});

const worksNotice = print('works-notice', 222, 246, '#dfdacf', [
  line('GEMEINDEWERK', 13, 15, 17, 'bold', '#202924', undefined, .95),
  line('Schneeräumung', 13, 62, 25, 'bold', '#252c28'),
  line('Zufahrt zum Laden', 13, 110, 18, 'mono-bold', '#262b29'),
  line('bitte freihalten.', 13, 136, 18, 'mono-bold', '#262b29'),
  line('Vielen Dank.', 13, 181, 17, 'mono-bold', '#262b29'),
], [
  mark('rule', 13, 46, 194, 2, '#354139'),
], 'paper');

// Separate pen movements on a scrap of wrapping paper. This is the writing
// on this one slip, including crossings, repeated letters and lifts.
const woodSlipStrokes = [
  // Brennholz
  'M14 54 Q16 38 14 28 M15 29 C37 20 36 36 19 40 C40 35 37 52 15 54',
  'M36 53 L38 39 M38 45 Q43 38 49 39',
  'M49 46 Q61 47 63 42 Q59 36 54 41 Q45 54 63 51',
  'M67 52 L68 40 M68 47 Q79 34 80 43 L80 51',
  'M84 51 L86 38 M86 45 Q98 33 99 43 L98 50',
  'M103 51 Q107 36 106 25 M106 43 Q116 33 118 42 L116 50',
  'M126 39 C138 34 138 49 128 50 C120 50 120 42 126 39 Z',
  'M142 26 L139 45 Q138 51 144 49',
  'M148 39 L161 37 L148 50 L164 49',
  // abzugeben
  'M29 73 C13 67 14 90 26 86 Q29 84 29 76 M30 71 L30 86 L33 86',
  'M38 85 Q38 68 40 61 M38 79 C47 67 55 73 49 82 Q45 87 39 85',
  'M54 72 L66 71 L53 85 L68 85',
  'M72 72 Q69 89 78 84 L84 72 M84 73 L82 86',
  'M102 72 C91 64 85 82 93 84 Q99 85 102 74 L101 91 Q98 99 89 94',
  'M107 78 Q123 79 119 73 Q114 68 110 74 Q101 87 120 84',
  'M124 84 L127 62 M125 78 C133 68 143 71 137 80 Q133 87 125 84',
  'M144 78 Q159 76 156 71 Q151 68 146 74 Q139 85 158 83',
  'M162 83 L164 70 M164 76 Q176 63 175 82',
  // Im Laden
  'M19 117 L17 135',
  'M25 136 L27 124 M27 131 Q36 119 36 127 L35 134 M36 130 Q46 120 45 133',
  'M60 114 L57 134 L69 133',
  'M84 123 Q78 119 74 125 Q69 135 78 134 Q82 132 84 126 M84 121 L83 133',
  'M100 123 Q93 117 88 126 Q86 136 95 132 L100 125 M102 112 L98 132',
  'M105 127 Q117 127 117 122 Q112 118 107 123 Q100 134 118 131',
  'M122 132 L123 121 M123 127 Q134 115 135 130',
  // fragen
  'M26 171 L32 150 Q36 144 41 147 M26 155 L38 155',
  'M41 167 L42 154 M42 160 Q46 153 53 154',
  'M68 155 Q58 149 55 161 Q53 168 62 166 Q65 165 68 157 M69 153 L67 166',
  'M87 153 Q77 149 73 160 Q72 166 80 165 L86 157 M87 152 L85 174 Q79 181 72 177',
  'M92 158 Q106 158 106 154 Q102 149 95 154 Q88 168 108 163',
  'M111 163 L113 151 M113 157 Q126 144 127 162',
].map((d, index) => ({ kind: 'pen', d, stroke: index < 18 ? 3.5 + index % 3 * .24 : 3.15 + index % 3 * .19,
  color: index % 5 === 0 ? '#303731' : '#252b25' }));

export const HOME_VALLEY_SIGN_PRINTS = Object.freeze([
  print('stop-flag', 286, 154, inks.transit, [
    line('PostAuto', 88, 15, 25, 'bold'),
    line('Tannenried, Dorf', 15, 80, 27, 'bold'),
  ], [
    mark('bus', 19, 14, 50, 35, inks.road),
    mark('rect', 0, 59, 286, 12, inks.red),
  ]),
  print('stop-name', 498, 74, inks.enamel, [
    line('Tannenried, Dorf', 249, 7, 48, 'bold', inks.road, 'center'),
  ]),
  print('winter-departures', 238, 248, '#e5e0d6', [
    line('WINTERFAHRPLAN', 12, 15, 22, 'bold', '#212825', undefined, .65),
    line('Tannenried, Dorf · täglich', 12, 43, 18, 'bold'),
    line('Innertkirchen, Grimseltor', 12, 79, 17, 'bold'),
    line('06.42 12.42 17.26', 12, 104, 22, 'mono-bold'),
    line('Guttannen, Dorf', 12, 144, 21, 'bold'),
    line('07.18 13.18 18.03', 12, 170, 22, 'mono-bold'),
    line('Umsteigen in Innertkirchen', 12, 207, 16, 'bold'),
    line('Richtung Meiringen', 12, 228, 16, 'bold'),
  ], [
    mark('rect', 0, 0, 238, 6, inks.transit),
    mark('rule', 12, 69, 214, 2, '#625945'),
    mark('rule', 12, 134, 214, 1, '#a19983'),
    mark('rule', 12, 199, 214, 1, '#a19983'),
  ], 'paper'),
  print('visitor-route-slip', 224, 245, '#e0d6bb', [
    line('TANNENRIED', 13, 14, 20, 'bold', '#25332a', undefined, 1.3),
    line('ZU FUSS', 13, 37, 18, 'bold', '#25332a', undefined, 1.5),
    line('Aussichtspunkt', 13, 75, 25, 'bold', '#25332a'),
    line('Oberhalb der Weide', 13, 114, 20, 'bold'),
    line('dem Waldweg folgen.', 13, 141, 19, 'bold'),
    line('Kein Winterdienst', 13, 184, 20, 'bold'),
    line('Verkehrsverein Tannenried', 13, 222, 15, 'bold', '#25332a'),
  ], [
    mark('rule', 13, 61, 198, 2, inks.tourist),
    mark('rule', 13, 172, 198, 1, inks.tourist),
  ], 'paper'),
  print('store-name', 480, 78, '#384946', [
    line('Dorfladen', 240, 6, 57, 'serif', '#e7d9b8', 'center'),
  ], [
    mark('rule', 15, 65, 450, 1.5, '#ac9a76'),
  ], 'light-paint'),
  worksNotice,
  print('wood-note', 182, 190, '#b7a57f', [], woodSlipStrokes, 'paper'),
  print('pump-notice', 335, 102, '#d1ccb9', [
    line('Kein Trinkwasser', 167.5, 25, 31, 'bold', inks.road, 'center'),
  ]),
  print('bakery-name', 446, 82, '#d7bd89', [
    line('Bäckerei', 223, 8, 49, 'serif', '#4c2d21', 'center'),
  ], [
    mark('rule', 26, 66, 394, 2, '#956b41'),
  ]),
  print('bakery-hours', 170, 150, '#e1d5bf', [
    line('Öffnungszeiten', 11, 10, 19, 'bold', '#342d25'),
    line('Di–Sa', 11, 44, 22, 'bold'),
    line('07.00–12.00', 11, 70, 22, 'mono-bold'),
    line('Montag', 11, 105, 18, 'bold'),
    line('geschlossen', 11, 126, 18, 'bold'),
  ], [
    mark('rule', 11, 35, 147, 1.5, '#77684f'),
  ], 'paper'),
  print('ski-workshop-name', 477, 90, '#344741', [
    line('Skiwerkstatt', 238.5, 7, 47, 'bold', '#f1e7d0', 'center'),
    line('Wachs und Kanten', 238.5, 57, 20, 'sans', '#dcc697', 'center'),
  ], [
    mark('rule', 104, 53, 269, 1.5, '#a98f59'),
  ], 'light-paint'),
  print('lookout-way', 470, 86, inks.trail, [
    line('Aussichtspunkt', 75, 15, 48, 'bold'),
  ], [
    mark('arrow', 15, 25, 47, 31, inks.road, 'left'),
  ]),
  print('hamlet-way', 410, 84, inks.trail, [
    line('Tannenried', 22, 14, 48, 'bold'),
  ], [
    mark('arrow', 350, 25, 46, 29, inks.road, 'right'),
  ]),
  print('hamlet-way-reverse', 410, 84, inks.trail, [
    line('Tannenried', 76, 14, 48, 'bold'),
  ], [
    mark('arrow', 15, 25, 46, 29, inks.road, 'left'),
  ]),
  print('works-notice-return', worksNotice.width, worksNotice.height, worksNotice.base, [
    ...worksNotice.lines,
    line('Rückweg geräumt.', 13, 218, 21, 'bold', '#27372e'),
  ], worksNotice.marks, worksNotice.finish),
]);

const part = (id, x0, x1, y0, y1, z0, z1, material, extra = {}) => Object.freeze({
  id, x0, x1, y0, y1, z0, z1, material, blocking: false, ...extra,
});
const sign = (id, ink, face, x0, x1, y0, y1, z0, z1, material = 76, details = {}) =>
  part(id, x0, x1, y0, y1, z0, z1, material, {
    shape: 'printed-sign', print: ink, face, ...details,
  });
// Angle, free corner (left/right in the reader's view), lift in metres,
// and depth of a missing scrap as a fraction of the sheet width.
const paper = (angle, side, curl, tear) => Object.freeze({ angle, side, curl, tear });
const group = (id, pieces) => Object.freeze({ id, pieces: Object.freeze(pieces) });

export const HOME_VALLEY_SIGN_GROUPS = Object.freeze([
  group('transit-signs', [
    // Both directions can see the operator flag. The sheltered enamel name
    // and the paper departures serve passengers who have already stopped.
    sign('postauto-flag-south', 'stop-flag', '-z', -25.88, -24.99, 2.10, 2.58, 22.704, 22.728),
    sign('postauto-flag-north', 'stop-flag', '+z', -25.88, -24.99, 2.10, 2.58, 22.728, 22.752),
    part('postauto-name-backer', -28.56, -28.442, 1.914, 2.153, 20.512, 22.178, 76),
    sign('postauto-enamel-name', 'stop-name', '+x', -28.442, -28.414, 1.949, 2.138, 20.54, 22.15),
    sign('postauto-paper-departures', 'winter-departures', '+x', -28.450, -28.430, 1.133, 1.769, 21.111, 21.629, 76,
      { paper: paper(.004, 1, .004, 0) }),
    part('postauto-paper-top-clip', -28.437, -28.421, 1.757, 1.785, 21.096, 21.644, 76),
    part('postauto-paper-foot-clip', -28.437, -28.421, 1.110, 1.133, 21.096, 21.644, 76),
    // The unofficial visitor sheet is adjacent to, and outside, the
    // timetable hardware. Three small fixings keep its paper against wood.
    part('visitor-slip-backer', -28.56, -28.520, 1.205, 1.812, 22.225, 22.787, 70),
    part('visitor-older-flyer-top', -28.521, -28.514, 1.767, 1.795, 22.289, 22.725, 61),
    part('visitor-older-flyer-side', -28.521, -28.514, 1.363, 1.792, 22.254, 22.278, 61),
    sign('visitor-paper', 'visitor-route-slip', '+x', -28.521, -28.512, 1.240, 1.780, 22.253, 22.747, 70,
      { paper: paper(.040, 1, .037, .046) }),
    part('visitor-pin-upper-left', -28.514, -28.502, 1.748, 1.764, 22.270, 22.286, 63),
    part('visitor-pin-upper-right', -28.514, -28.502, 1.750, 1.766, 22.712, 22.728, 63),
    part('visitor-pin-lower-left', -28.514, -28.502, 1.257, 1.271, 22.286, 22.300, 63),
  ]),
  group('commons-signs', [
    // Painted timber over the store door, and a reused display case by
    // the step. The operator, public works and handwritten note are distinct.
    part('dorfladen-paint-board', -20.005, -17.829, 2.145, 2.513, 56.702, 56.768, 70),
    sign('dorfladen-painted-face', 'store-name', '-z', -19.978, -17.856, 2.161, 2.497, 56.687, 56.704, 70),
    part('commons-case-wood', -19.915, -18.552, .995, 1.936, 56.646, 56.772, 70),
    part('commons-case-sill', -19.943, -18.524, .979, 1.042, 56.549, 56.750, 70),
    part('commons-case-cap', -19.948, -18.518, 1.909, 1.973, 56.530, 56.755, 72),
    part('commons-case-edge-west', -19.915, -19.862, 1.014, 1.921, 56.595, 56.689, 70),
    part('commons-case-edge-east', -18.605, -18.552, 1.014, 1.921, 56.595, 56.689, 70),
    part('commons-case-centre-bar', -19.243, -19.204, 1.024, 1.920, 56.604, 56.665, 70),
    part('commons-previous-notice-top', -19.818, -19.460, 1.738, 1.796, 56.641, 56.650, 61),
    part('commons-previous-notice-edge', -19.818, -19.769, 1.313, 1.758, 56.641, 56.650, 61),
    part('commons-previous-notice-torn-foot', -19.731, -19.557, 1.161, 1.202, 56.640, 56.650, 61),
    sign('commons-public-works-paper', worksNotice.id, '-z', -19.788, -19.276, 1.183, 1.752, 56.631, 56.648, 70,
      { returnPrint: 'works-notice-return', paper: paper(-.019, 1, .035, .037) }),
    part('commons-works-staple-left', -19.756, -19.727, 1.726, 1.732, 56.626, 56.633, 63),
    part('commons-works-staple-right', -19.336, -19.305, 1.720, 1.726, 56.626, 56.633, 63),
    sign('commons-resident-wood-note', 'wood-note', '-z', -19.099, -18.683, 1.250, 1.685, 56.615, 56.632, 70,
      { paper: paper(.056, -1, .024, .066) }),
    part('commons-old-paper-stub', -18.865, -18.680, 1.133, 1.211, 56.616, 56.625, 61),
    part('commons-left-over-staple', -19.767, -19.743, 1.815, 1.825, 56.638, 56.645, 63),
    part('commons-resident-pin-upper', -18.904, -18.881, 1.643, 1.665, 56.607, 56.617, 63),
    part('commons-resident-pin-lower', -18.723, -18.702, 1.272, 1.293, 56.607, 56.617, 63),
    part('pump-notice-backer', -23.858, -23.230, .428, .625, 53.277, 53.314, 76),
    sign('pump-enamel-water', 'pump-notice', '-z', -23.835, -23.250, .444, .608, 53.265, 53.279),
  ]),
  group('fork-signs', [
    // South-facing at the fork. -X is uphill to the timber track on the
    // left, +X goes back into the valley. The galvanized stake is off-lane.
    part('upper-fork-galvanized-stake', -42.393, -42.317, 7.453, 9.350, 91.602, 91.678, 76, { shape: 'round-y' }),
    part('upper-fork-left-arm', -43.400, -42.329, 9.108, 9.290, 91.592, 91.631, 76),
    sign('upper-fork-left-blade', 'lookout-way', '-z', -43.396, -42.334, 9.111, 9.288, 91.569, 91.595),
    part('upper-fork-right-arm', -42.375, -41.492, 8.862, 9.049, 91.592, 91.631, 76),
    sign('upper-fork-right-blade', 'hamlet-way', '-z', -42.371, -41.497, 8.865, 9.047, 91.569, 91.595),
    sign('upper-fork-dorf-return', 'hamlet-way-reverse', '+z', -42.371, -41.497, 8.865, 9.047, 91.629, 91.652),
  ]),
  group('bakery-frontage', [
    // Painted timber on its own fastenings. The staff's paper hours
    // live on the door jamb above a scraper set in the stone threshold.
    part('bakery-shop-board', -10.185, -7.415, 2.224, 2.555, 55.957, 56.023, 70),
    sign('bakery-lettered-face', 'bakery-name', '-z', -10.150, -7.450, 2.241, 2.542, 55.941, 55.958, 70),
    part('bakery-board-fastener-west', -10.178, -10.141, 2.373, 2.400, 55.932, 55.951, 63),
    part('bakery-board-fastener-east', -7.455, -7.425, 2.372, 2.403, 55.931, 55.951, 63),
    part('bakery-hours-backing', -9.391, -9.025, 1.248, 1.604, 55.915, 56.014, 72),
    part('bakery-previous-hours-strip', -9.384, -9.159, 1.247, 1.316, 55.914, 55.919, 61),
    sign('bakery-paper-hours', 'bakery-hours', '-z', -9.366, -9.054, 1.273, 1.578, 55.900, 55.918, 72,
      { paper: paper(-.032, -1, .018, .031) }),
    part('bakery-hours-tape-left', -9.376, -9.332, 1.548, 1.595, 55.896, 55.902, 58),
    part('bakery-hours-tape-right', -9.088, -9.045, 1.545, 1.586, 55.896, 55.902, 58),
    part('bakery-scraper-bar', -10.20, -9.37, .107, .138, 55.615, 55.651, 63),
    part('bakery-window-sill', -8.826, -7.069, .929, 1.002, 55.834, 56.05, 71),
    part('bakery-sill-return-west', -8.826, -8.765, .994, 1.044, 55.872, 56.030, 71),
    part('bakery-sill-return-east', -7.130, -7.069, .994, 1.044, 55.872, 56.030, 71),
    part('bakery-display-shelf', -8.711, -7.189, 1.106, 1.146, 56.017, 56.218, 62),
    part('bakery-display-backboard', -8.700, -7.201, 1.145, 1.213, 56.152, 56.207, 62),
    ...[
      ['west', -8.588, -8.326, 1.146, 1.304, 56.045, 56.199],
      ['west-small', -8.303, -8.164, 1.148, 1.264, 56.060, 56.190],
      ['centre', -8.125, -7.843, 1.146, 1.338, 56.041, 56.205],
      ['east-small', -7.811, -7.636, 1.146, 1.270, 56.053, 56.186],
      ['east', -7.593, -7.302, 1.145, 1.309, 56.051, 56.205],
    ].map(([id,x0,x1,y0,y1,z0,z1])=>
      part(`bakery-display-loaf-${id}`,x0,x1,y0,y1,z0,z1,86,{shape:'round-x'})),
    // Shallow cuts in the warm crust read as scoring, and no glass plane
    // needs to be drawn in front of the loaves.
    part('bakery-loaf-centre-score', -8.027, -7.982, 1.267, 1.319, 56.034, 56.058, 62, { shape: 'round-y' }),
    part('bakery-loaf-west-score', -8.491, -8.454, 1.260, 1.299, 56.046, 56.068, 62, { shape: 'round-y' }),
    part('bakery-loaf-east-score', -7.479, -7.441, 1.256, 1.295, 56.052, 56.076, 62, { shape: 'round-y' }),
  ]),
  group('ski-workshop-sign', [
    part('ski-workshop-board', 15.304, 17.696, 3.361, 3.699, 97.518, 97.574, 70),
    sign('ski-workshop-paint', 'ski-workshop-name', '-z', 15.350, 17.650, 3.376, 3.684, 97.505, 97.520, 70),
    part('ski-workshop-west-bolt', 15.322, 15.347, 3.523, 3.546, 97.499, 97.522, 63),
    part('ski-workshop-east-bolt', 17.654, 17.680, 3.523, 3.546, 97.499, 97.522, 63),
  ]),
]);
