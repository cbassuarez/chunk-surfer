// The existing shared console, Y-up metres. Its playable side is local -Z.
// Keep the case, feet and complete outer envelope; articulate the working parts
// inside it so all three existing consoles retain their placement and collision.
export function buildOrganConsole({mesh,MAT,addBox,addLegs,addEllipsoid}){
  const m=mesh('organ_console');
  addBox(m,[0,.62,.10],[1.55,1.18,.65],MAT.dark);
  addBox(m,[0,.38,-.53],[.92,.055,.35],MAT.dark);
  addLegs(m,0,-.34,1.25,.30,.02,.54,MAT.dark,.035);

  const pitch=.025,naturals=36,gap=.001;
  // Two C-to-C, 61-note manuals. The lower keyfront is 150mm nearer the
  // player; the old upper-over-lower projection concealed the lower working row.
  for(const row of[
    {top:.7175,front:-.74,back:-.39,frameWidth:1.18},
    {top:.9025,front:-.59,back:-.24,frameWidth:1.30},
  ]){
    const keyThickness=.022,depth=row.back-row.front;
    const frameBack=row.back+.025,frameTop=row.top-keyThickness;
    addBox(m,[0,frameTop-.0275,(row.front+frameBack)/2],
      [row.frameWidth,.055,frameBack-row.front],MAT.wood);
    let white=0;
    for(let semitone=0;semitone<=60;semitone++){
      if([1,3,6,8,10].includes(semitone%12)){
        // A sharp/flat sits at the boundary of its neighbouring naturals,
        // raised above the ivory and set back from the full-length keyfront.
        const x=(white-naturals/2)*pitch;
        addBox(m,[x,row.top+.014,row.back-.115],[.014,.028,.23],MAT.black);
      }else{
        const x=(white-naturals/2+.5)*pitch;
        addBox(m,[x,row.top-keyThickness/2,(row.front+row.back)/2],
          [pitch-gap,keyThickness,depth],MAT.ivory);
        white++;
      }
    }
  }
  // Short brackets attach the lower keybed to the unchanged case front.
  for(const x of[-.56,.56])addBox(m,[x,.6525,-.29],[.05,.07,.18],MAT.dark);

  // Four modest drawstops to either side. Each is fully pushed in: a shallow
  // stem, dull escutcheon and ivory knob, with no lamps or emissive material.
  for(const x of[-.60,.60])for(const y of[.98,1.035,1.09,1.145]){
    addBox(m,[x,y,-.245],[.010,.010,.040],MAT.brass);
    addEllipsoid(m,[x,y,-.232],[.027,.027,.007],MAT.brass,4,8);
    addEllipsoid(m,[x,y,-.272],[.022,.022,.013],MAT.ivory,4,8);
  }
  return m;
}
