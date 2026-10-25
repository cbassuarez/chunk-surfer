// Retained finish on the existing cast stair, without changing its analytic
// walking ribbon, heights or tread intervals. Dimensions are physical metres.
export const MAIN_STAIR_TREAD_FINISH=Object.freeze({
  revision:1,
  story:'Polished warm terrazzo units with a folded bronze edge, an undercut molded ivory riser and a coved stone fascia carried on the concrete waist.',
  // Along the tread's ascent direction, measured back into its existing mass;
  // drop is below the unchanged top. The lower cove returns to the old toe line.
  noseProfile:Object.freeze([
    Object.freeze([0,0]),Object.freeze([.002,.003]),Object.freeze([.006,.008]),
    Object.freeze([.010,.016]),Object.freeze([.010,.030]),Object.freeze([.004,.040]),
    Object.freeze([.015,.052]),Object.freeze([.018,.068]),
  ]),
  toeCoveHeightM:.026,
  bronzeTurnDownM:.008,
  cheek:Object.freeze({radialCentreOffsetM:.014,radialHalfWidthM:.025,
    halfHeightM:.050,aboveSoffitM:.075,maximumProjectionM:.039,minimumBelowTreadM:.055,
    maximumAngleStepDeg:3,sides:8}),
  materials:Object.freeze({
    terrazzo:Object.freeze({tileM:.8,size:256,roughness:.52}),
    riser:Object.freeze({tileM:.6,size:128,roughness:.39}),
    concrete:Object.freeze({tileM:.9,size:128,roughness:.83}),
    brass:Object.freeze({tileM:.3,size:64,roughness:.31}),
  }),
  references:Object.freeze([
    Object.freeze({url:'https://advanceterrazzo.co.uk/precast-terrazzo/',supports:'Cast-in nosing inserts and polished precast coved skirting; does not establish an Ellery construction date.'}),
    Object.freeze({url:'https://terrazzco.com/terrazzo-self-supporting-stair-treads/',supports:'Manufactured terrazzo treads support custom nose profiles; mechanism reference, not a replacement stair design.'}),
    Object.freeze({url:'https://www.nationaltrust.org.uk/visit/somerset/montacute-house/saving-the-staircases',supports:'Retained shaped stone tread construction and conservation of existing support; no claim that this cast stair is Hamstone.'}),
  ]),
});
