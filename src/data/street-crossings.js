// Pedestrian crossings on the ring and in Ellery Square. Physical metres.
//
// Every crossing drops both kerbs flush (Leeds Transport SPD ¶748: flush on
// the high side) and is marked with blister paving: red at the signal crossing
// only, buff everywhere else (Inclusive Mobility 2021 §6.1). The pavement eases
// down to the dropped kerb over two and a half metres, under 1:12.
//
// A crossing is placed by the glyph grid, whose glyph o covers o-.25..o+.75:
// `at` is a glyph centre, and three glyphs either side of it along the street
// are fully dropped. `walk` names the axis a pedestrian walks along to cross.
// Each kerb line is a glyph boundary; `side` points from it into the pavement.
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};

export const STREET_CROSSING_SECTION=freeze({
  halfWidth:1.1,flare:1,rampLength:2,
  flushFloor:.006,pavementFloor:.12,
  // Blister paving: 400 mm tiles, two rows (800 mm) across the dropped width.
  tile:.4,rows:2,
});

export const STREET_CROSSINGS=freeze([
  // The North Street signal crossing: the street pilot owns its signals and
  // paint; its kerbs, ramps and red tactile are the same as everyone else's.
  {id:'north-street-signal',kind:'controlled',walk:'z',at:78.25,
    kerbs:[{line:-10.25,side:-1},{line:-4.25,side:1}]},
  {id:'west-street-mid',kind:'uncontrolled',walk:'x',at:32.25,
    kerbs:[{line:-10.25,side:-1},{line:-4.25,side:1}]},
  {id:'east-street-hall',kind:'uncontrolled',walk:'x',at:30.25,
    kerbs:[{line:132.75,side:-1},{line:138.75,side:1}]},
  {id:'south-street-library',kind:'uncontrolled',walk:'z',at:30.25,
    kerbs:[{line:96.75,side:-1},{line:102.75,side:1}]},
  {id:'south-street-lyric-yard',kind:'uncontrolled',walk:'z',at:86.25,
    kerbs:[{line:96.75,side:-1},{line:102.75,side:1}]},
  // One crossing to each garden gate, from the house-side pavement.
  {id:'square-west-gate',kind:'uncontrolled',walk:'x',at:-35.75,square:true,
    kerbs:[{line:52.75,side:-1},{line:57.75,side:1}]},
  {id:'square-north-gate',kind:'uncontrolled',walk:'z',at:86.25,square:true,
    kerbs:[{line:-57.25,side:-1},{line:-52.25,side:1}]},
  {id:'square-east-gate',kind:'uncontrolled',walk:'x',at:-35.75,square:true,
    kerbs:[{line:113.75,side:-1},{line:118.75,side:1}]},
]);

// Floor of a pavement glyph near a dropped kerb, or null when no crossing
// reaches it. Takes the glyph's physical centre (glyph o → o+.25).
export function streetCrossingFloorAt(cx,cz){
  const S=STREET_CROSSING_SECTION;let best=null;
  for(const c of STREET_CROSSINGS){
    const along=Math.abs((c.walk==='z'?cx:cz)-c.at),across=c.walk==='z'?cz:cx;
    if(along>S.halfWidth+S.flare)continue;
    for(const k of c.kerbs){
      const d=(across-k.line)*k.side;
      if(d<=0||d>=S.rampLength+.5)continue;
      const t=Math.min(1,Math.max(0,(d-.5)/S.rampLength));
      let floor=S.flushFloor+(S.pavementFloor-S.flushFloor)*t;
      if(along>S.halfWidth)floor=(floor+S.pavementFloor)/2;
      best=best===null?floor:Math.min(best,floor);
    }
  }
  return best;
}
