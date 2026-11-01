// The index presses with a slight PIP/DIP bend. Its nail faces the player;
// the wrist remains below and to the left so the forearm returns to the body.
// Unused digits fold into the palm and the thumb tucks clear of the supporting
// hand. These are contact-relative metre offsets, not IK targets for the wrist.
const CONTROL_POSE = {
  index: [0, .15, .1], middle: [1.3, 1.5, 1.05],
  ring: [1.3, 1.5, 1.05], pinky: [1.3, 1.5, 1.05],
  spread: { index: 0, middle: 0, ring: .02, pinky: .04 },
  thumb: { opposition: 1, abduction: -.2, mcp: .6, ip: .4 },
};

export const FRONT_CONTROL = {
  offset: [-.1325749266086006, -.0529072574538174, .08619294929305825],
  quaternion: [.4912221142601753, .8480750741904904, -.17191332840317436, -.09957565222432532],
  pose: CONTROL_POSE,
};

// The full-size carried walkie has a taller chassis than the previous combat
// receiver. Its top dial needs a lateral, forward approach: this radio-only
// bake keeps the unused digits clear without shrinking the body or hand.
// The side PTT retains its shallower pad angle during its full travel.
const RADIO_DIAL_CONTROL = {
  offset: [-.13746701697448876, -.03893703229399264, .08597232301542299],
  quaternion: [.5777483461570248, .7808323419111719, -.05824889702258799, -.23046641476360336],
  pose: CONTROL_POSE,
};
const SIDE_CONTROL = {
  offset: [-.1478038561396695, -.052704675413108484, .05639814592908889],
  quaternion: [.520075969923635, .8482654504508663, -.08511043581240467, -.05218165190181056],
  pose: CONTROL_POSE,
};

export const CONTROL_CONTACT_POSES = Object.freeze({
  radio: Object.freeze({ tune: RADIO_DIAL_CONTROL, transmit: SIDE_CONTROL }),
});
export const CONTROL_APPROACH_ANGLES = Object.freeze({
  recorder: Object.freeze({ rec: 0, stop: 0, takes: 0 }),
  radio: Object.freeze({ tune: 0, transmit: 0 }),
  rig: Object.freeze({ tune: 0, invert: 0 }),
});
