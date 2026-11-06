// Cab-local metres, before OPENING_VEHICLE.cabinMount. These are separate
// belongings, not a new inventory or an alternate job-acceptance authority.
// Preparation equipment is already at the rear workbench. It must not also
// appear as a second packed kit on the front passenger seat.
export const OPENING_CAB_ASSET='assets/opening-cab-objects.glb';
// Existing Mk3 interior release lever and its recessed escutcheon, measured
// from the authored right-hand door. This is not the window winder or pull.
export const OPENING_CAB_DRIVER_DOOR=Object.freeze({
  id:'driver-door',label:'STEP OUT OF THE VAN',mesh:'opening_drive_cabin_door_r',
  point:Object.freeze([.813,1.1725,.255]),
  bounds:Object.freeze({min:Object.freeze([.793,1.139,.184]),max:Object.freeze([.848,1.206,.335])}),
});
export const OPENING_CAB_PLACEMENT=Object.freeze({
  paper:Object.freeze({point:Object.freeze([-.50,1.270,-.72]),yaw:.08,scale:.9,halfX:.144,halfZ:.189}),
  notebook:Object.freeze({point:Object.freeze([-.12,1.2658,-.80]),size:Object.freeze([.15,.018,.20]),yaw:-.035}),
  fieldCase:Object.freeze({point:Object.freeze([-.48,.6702,-.25]),width:.624,yaw:-Math.PI/2}),
  mirror:Object.freeze({point:Object.freeze([.02,1.80,-.30]),size:Object.freeze([.24,.095,.025]),mount:Object.freeze([.02,1.92,-.25])}),
  clipboard:Object.freeze({point:Object.freeze([-.50,1.2678,-.72]),size:Object.freeze([.307,.0038,.406]),yaw:.08}),
  practiceNote:Object.freeze({point:Object.freeze([-.77,1.2663,-.84]),size:Object.freeze([.084,.0007,.084]),yaw:-.11}),
  firstTakeNote:Object.freeze({point:Object.freeze([-.35,1.055,-.574]),size:Object.freeze([.092,.078,.0007]),yaw:.025}),
  programme:Object.freeze({point:Object.freeze([-.46,.971,.17]),size:Object.freeze([.15,.0014,.20]),yaw:-.12}),
  // Lyle's music box, whole, on the back of the passenger cushion: the same box
  // the coast finds broken on the shingle. Turned to face the windscreen, key
  // toward the driver. Base height comes from the actual cushion.
  musicBox:Object.freeze({point:Object.freeze([-.40,0,.42]),turn:Math.PI+.1}),
  radio:Object.freeze({point:Object.freeze([.025,1.10,-.378]),bounds:Object.freeze({min:Object.freeze([-.088,1.050,-.405]),max:Object.freeze([.139,1.144,-.357])})}),
});
export const OPENING_CAB_REHEARSAL_NOTES=Object.freeze([
  'Leave the pedal up once. Hear what the hands are doing.',
  'An ornament needs somewhere to arrive. Do not hurry it just to get through.',
  'Try the release at the harpsichord. Bring that knowledge back to the marimba.',
  'Keep the first take. You need to hear what changed.',
]);
// Looking at Lyle's box, whole, before the drive.
export const OPENING_CAB_MUSIC_BOX_LINES=Object.freeze([
  'Dark wood, a brass key in the side, the lid shut. Clair de lune: the first eight bars, then the spring runs out.',
  'Lyle gave it to you before his big piano break. So you’d have something to remember him by.',
]);
export const OPENING_CAB_PAPERS=Object.freeze([
  {id:'opening-cab-practice-note',title:'Rebook the practice room',byline:'A reminder in blue ink',
    body:['REBOOK THE PRACTICE ROOM'],worldLines:['REBOOK THE','PRACTICE','ROOM'],stock:'#d5c47e'},
  {id:'opening-cab-first-take-note',title:'Do not erase the first take',byline:'A reminder in blue ink',
    body:['DON’T ERASE THE FIRST TAKE'],worldLines:["DON'T ERASE",'THE FIRST','TAKE'],stock:'#c9c69a'},
  {id:'opening-cab-recital-programme',title:'Recital programme',byline:'Folded down the middle',
    body:['RECITAL','J. S. BACH','Chaconne','from Partita No. 2 in D minor','Marimba','', 'LEAVE TIME AT THE END.'],
    worldLines:['RECITAL','J S BACH','CHACONNE','MARIMBA'],stock:'#d5cdb7'},
].map(paper=>Object.freeze({...paper,body:Object.freeze(paper.body),worldLines:Object.freeze(paper.worldLines)})));
export const OPENING_CAB_OBJECTS=Object.freeze([
  {id:'job-papers',kind:'document',label:'READ THE WORK ORDER',location:'cab'},
  {id:'notebook',kind:'notes',label:'OPEN THE NOTEBOOK',location:'cab'},
  {id:'self-check',kind:'status',label:'CHECK YOURSELF',location:'cab'},
  {id:'practice-note',kind:'document',label:'READ THE PRACTICE-ROOM REMINDER',documentId:'opening-cab-practice-note',location:'cab'},
  {id:'first-take-note',kind:'document',label:'READ THE TAPE REMINDER',documentId:'opening-cab-first-take-note',location:'cab'},
  {id:'recital-programme',kind:'document',label:'UNFOLD THE RECITAL PROGRAMME',documentId:'opening-cab-recital-programme',location:'cab'},
  {id:'radio',kind:'radio',label:'LOOK AT THE RADIO',location:'cab'},
  {id:'music-box',kind:'keepsake',label:'LOOK AT LYLE’S MUSIC BOX',location:'cab'},
  {id:'recorder',kind:'instrument',label:'INSPECT THE RECORDER',group:'recorder',location:'rear-workbench'},
  {id:'headphones',kind:'instrument',label:'INSPECT THE HEADPHONES',group:'headphones',location:'rear-workbench'},
  {id:'microphone',kind:'instrument',label:'INSPECT THE MICROPHONE',group:'microphone',location:'rear-workbench'},
  {id:'flashlight',kind:'instrument',label:'INSPECT THE FLASHLIGHT',group:'flashlight',location:'rear-workbench'},
  {id:'amp',kind:'instrument',label:'INSPECT THE AMPLIFIER',group:'amp',location:'rear-workbench'},
].map(Object.freeze));
export const OPENING_CAB_VISIBLE_OBJECTS=Object.freeze(OPENING_CAB_OBJECTS.filter(object=>object.location==='cab'));
