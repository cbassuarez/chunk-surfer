// THE FIELDS' SKY IS FILM. The developer's own Super 8 (reel 5072's cumulus, built by
// scripts/build-field-sky-film.py) comes into the memory fields' sky over the visits: first
// its light (soft light on the game's own sky), then its brightest lifted (screen, in the
// hour's cloud colour), then its shapes (the film's clouds, shaded by the film). Each stage
// layers on the last; the game's own clouds give way as the light comes in.
//
// `visits` is where each visit's sky starts and ends on that way: 0 the game's sky, 1 the
// light, 2 lifted, 3 the shapes. Each visit develops along its stretch on its own clock, to
// the end a visit reaches when it is let be (game/memory-field-scene.js).
export const FIELD_SKY_FILM=Object.freeze({
  url:'assets/field-sky-cumulus.mp4',
  scale:.5,                                // film tiles per unit of the cloud plane
  turn:.35,                                // radians the tile grid is turned off the horizon
  // The print shimmers every frame, so the clouds must travel and billow faster than life or
  // the sky reads as the stiller thing. Reduced motion keeps neither: no travel, plate speed 1.
  drift:Object.freeze([.09,.035]),         // tiles a second the clouds travel
  playbackRate:1.5,                        // on top of the plate's own 2x time-lapse
  visits:Object.freeze({first:Object.freeze([0,.4]),second:Object.freeze([.4,1]),third:Object.freeze([1,1.8]),fourth:Object.freeze([1.8,2.6]),fifth:Object.freeze([2.6,3])}),
});
