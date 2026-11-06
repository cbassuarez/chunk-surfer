// WHOSE LIFE. docs/plans/last-minutes.md, stage 8.
//
// Things start with no owner. A stool at the height somebody left it. As the night goes
// on the same sentence comes back with him in it, and nothing marks the moment. He goes
// from discovering a place to knowing it was his, in that order, the way a dream does.
//
// This is one mechanism among several, and rule 1 still applies. Self-criticism has been
// failing for hours by the time any of this arrives, so "you" can be memory, or it can be
// a man who has started claiming everything he looks at. Nothing here may say which. So
// these rows only ever change who a sentence belongs to, and they never add a fact that
// would rule out the prior contractor, the student or anyone else having done the same.
//
// `at` is lastMinutesFrame().meaning, held at its highest for the run, so a thing that has
// become his stays his. `swap` is literal text in that prop's inspect copy, and
// test/whose-life.spec.mjs fails if the copy moves and a row goes stale.
const freeze=Object.freeze;
const rows=list=>freeze(list.map(row=>freeze({...row,swap:freeze(row.swap.map(freeze))})));

export const WHOSE_LIFE_OWNED=rows([
  {id:'b2-piano-stool',at:.26,swap:[['somebody left it','you left it'],['their height','your height']]},
  {id:'practice-ensemble-violin',at:.3,swap:[['Someone put it down mid-phrase.','You put it down mid-phrase.']]},
  {id:'practice-piano-4',at:.34,swap:[['somebody’s coat and bag','your coat and bag'],['briefly claimed','briefly yours']]},
  {id:'dock-desk-1',at:.38,swap:[['Somebody meant to come back to it.','You meant to come back to it.'],['the rest of its shift','the rest of your shift']]},
  {id:'b3-patchbay',at:.42,swap:[['Somebody left this room tidy.','You left this room tidy.']]},
  {id:'b3-chair',at:.46,swap:[['Somebody worked in here for a long time, and then one day they did not come back.','You worked in here for a long time, and then one day you did not come back.']]},
  {id:'b3-foam-north-2',at:.48,swap:[['Somebody treated this room properly','You treated this room properly']]},
  {id:'b2-barre-south',at:.5,swap:[['Somebody has wound gaffer','You wound gaffer']]},
  {id:'b5-mirror-south',at:.54,swap:[['Somebody turned the mirror around.','You turned the mirror around.']]},
  {id:'b1-barre-south',at:.56,swap:[['Somebody started taking this room apart and stopped.','You started taking this room apart and stopped.']]},
  {id:'b2-drugget-run',at:.58,swap:[['Somebody means to lift these boards','You mean to lift these boards']]},
  {id:'foh-bin',at:.6,swap:[['Someone put the bag in','You put the bag in']]},
  {id:'box-office-till-slip',at:.62,swap:[['Somebody counted it, agreed with it, and did not put their name to it.','You counted it, agreed with it, and did not put your name to it.']]},
  {id:'yard-clutter',at:.64,swap:[['Somebody catalogued these.','You catalogued these.']]},
  {id:'academic-corridor-runner',at:.66,swap:[['Whoever laid it measured once.','You measured once.']]},
  {id:'yard-park-eyes',at:.7,swap:[['Somebody has been wishing','You have been wishing']]},
  {id:'spur-substation-mcc',at:.74,swap:[['a hand that is not yours','your hand']]},
  {id:'dock-work-order-clipboard',at:.78,swap:[['somebody else’s unfinished leaving','your own unfinished leaving']]},
]);

// A place he has been, met as if it were somebody else's. It plays once a run on that
// object, after its own words. A second rung, later, is the same place coming closer.
export const WHOSE_LIFE_PLACES=freeze({
  'brendan-visitor-guidebooks':freeze([
    freeze({at:.44,text:'Someone’s school trip. Packed lunches on the steps, a teacher counting heads and coming up one short.'}),
    freeze({at:.8,text:'Cheese. The sandwich was cheese. You don’t know how you know that.'}),
  ]),
  'brendan-font':freeze([
    freeze({at:.68,text:'Somebody held a baby over this and got the words wrong, and everybody laughed, and it was all right.'}),
  ]),
  // The notes in the cab stay as they are, a reminder in blue ink, because nobody gets back
  // to them this late. This is where the hand turns up instead, and it is two names' worth.
  'box-office-rota':freeze([
    freeze({at:.7,text:'The doubled name is in blue ink, in square capitals. You have been reading that hand all night.'}),
  ]),
  // The turn. The list was on the page from the first. It takes this long to read it.
  'dock-work-order-clipboard':freeze([
    freeze({at:.6,text:'The client’s list is at the bottom. No handling, no clothing, no breath. As lists go, it is very nearly everything.'}),
  ]),
});

// HANDS BEFORE HEAD. The marimba has always played well under him: the stem is someone
// who can really play. So nobody explains it until long after the hands have shown it.
// Only once he has played that instrument, one line a visit, in this order.
export const WHOSE_LIFE_HANDS=freeze({
  ids:freeze(['hall-marimba-1','hall-marimba-overflow','practice-ensemble-marimba']),
  rungs:freeze([
    freeze({at:0,text:'Your hands went to the bars before you had looked at them.'}),
    freeze({at:.4,text:'Nobody in this building taught you that.'}),
    freeze({at:.68,text:'You know what comes next. You don’t know what it’s called.'}),
  ]),
});
