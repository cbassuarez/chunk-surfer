// Fitted to the DA-1000 case in metres. The left palm faces the left wall
// of the case, with the thumb on the front and the fingers on the rear.
export const RECORDER_BRACE = {
  position: [-0.189975, -0.107, 0.055],
  quaternion: [-0.161995, 0.7119657, -0.2340574, 0.6419343],
  pose: {
    index: [0.1882996, 0.4784311, 0.5566665],
    middle: [0.3775166, 0.7397527, 0.5517065],
    ring: [0.533589, 0.8890006, 0.37],
    pinky: [0.52, 1.13, 0.3955],
    spread: {index: -0.2119245, middle: -0.0338993, ring: -0.1199864, pinky: -0.27},
    thumb: {opposition: 0.1720441, abduction: -0.0806958, mcp: 0.4203771, ip: 0},
  },
};

export const RECORDER_BRACE_CONTACTS = {
  index: {position: [-0.1321961, 0.0171323, -0.0218608], normal: [0, 0, -1]},
  middle: {position: [-0.1225832, 0.0007377, -0.022], normal: [0, 0, -1]},
  ring: {position: [-0.1178791, -0.028216, -0.022], normal: [0, 0, -1]},
  pinky: {position: [-0.128632, -0.049573, -0.022], normal: [0, 0, -1]},
  thumb: {position: [-0.133, -0.005, 0.03034], normal: [0, 0, 1]},
};

export const RECORDER_PRESS = {
  quaternion: [-0.4791853, 0.8248189, -0.1783172, 0.2413673],
  hoverIndex: [0.07332, 0.06512, 0.0304],
  pose: {
    index: [0.141, 0.088, 0.038],
    middle: [0.65, 0.95, 0.55],
    ring: [0.78, 1.02, 0.6],
    pinky: [0.92, 1.08, 0.65],
    spread: {index: 0.219, middle: -0.02, ring: 0.03, pinky: 0.09},
    thumb: {opposition: 0.52, abduction: 0.22, mcp: 0.3, ip: 0.16},
  },
};
