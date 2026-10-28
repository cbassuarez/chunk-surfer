// One real borrowed outlook: street -> W3 foyer window -> occupied atrium ->
// D0 glazed pair/fanlight -> existing greenhouse. Nothing moves or teleports.
export const GLASS_COURT_SIGHTLINES=Object.freeze({
  windowId:'W3-foyer-north',
  maximumExteriorDistance:36,
  fanlight:Object.freeze({id:'baths-D0-high-fanlight',doorId:'pool-lobby',
    x0:83,x1:85,z0:27,z1:28,planeZ:27.5,sill:3.4,head:5.5}),
  enclosures:Object.freeze([
    Object.freeze({spaceId:'front_atrium',x0:74,x1:98,z0:3,z1:28}),
    Object.freeze({spaceId:'natatorium',x0:70,x1:97,z0:27,z1:51}),
  ]),
});
