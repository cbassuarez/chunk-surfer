// Field bounds in metres, aligned with the existing frame instances. The oak
// is an open-grown standard and the fence is a working line of plain wire.
// Reference: Woodland Trust Ancient Tree Inventory, tree forms; DEFRA FG1.
const TAU = Math.PI * 2;
const group = () => ({ p: [], i: [] });
const add = (a, b) => a.map((value, axis) => value + b[axis]);
const sub = (a, b) => a.map((value, axis) => value - b[axis]);
const scale = (v, size) => v.map(value => value * size);
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
const unit = v => scale(v, 1 / (Math.hypot(...v) || 1));
const cross = ([x, y, z], [a, b, c]) => [y * c - z * b, z * a - x * c, x * b - y * a];
const wave = (n) => Math.sin(n * 18.7549 + .944);
const mix = (a, b, t) => a + (b - a) * t;
const piece = (name, shape, base, options = {}) => Object.freeze({
  name, ...shape, base: [...base, 1], emissive: base.map(c => c * .14), roughness: .9, metallic: 0, ...options,
});

// Shared stem tubes carry a continuous grain silhouette through changes of
// direction. A little variation in each radius suggests split timber or bark.
function tube(g, points, radii, sides, rough = 0, phase = 0, bow = false) {
  const start = g.p.length / 3;
  const end = points.length - 1;
  for (let row = 0; row <= end; row++) {
    const tangent = unit(sub(points[Math.min(end, row + 1)], points[Math.max(0, row - 1)]));
    const ref = Math.abs(tangent[0]) > .85 ? [0, 0, 1] : [1, 0, 0];
    const right = unit(cross(ref, tangent)), up = cross(tangent, right);
    for (let side = 0; side < sides; side++) {
      const angle = side * TAU / sides + phase;
      const radius = radii[row] * (1 + rough * wave(side * 3 + phase) + rough * .26 * wave(row * 4 + side));
      const centre = bow && row === end
        ? add(points[row], scale(tangent, .021 * wave(side + phase))) : points[row];
      g.p.push(...add(centre, add(scale(right, radius * Math.cos(angle)), scale(up, radius * Math.sin(angle)))));
    }
  }
  for (let row = 0; row < end; row++) {
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides, a = start + row * sides;
      const b = a + sides;
      g.i.push(a + side, a + next, b + side, a + next, b + next, b + side);
    }
  }
  // End caps: sawn tops, snapped tips and the ends of open channels.
  for (let j = 1; j < sides - 1; j++) {
    g.i.push(start, start + j + 1, start + j);
    const top = start + end * sides;
    g.i.push(top, top + j, top + j + 1);
  }
}

const fenceHeight = [ .42, .78, 1.10 ];
const stations = 12;
const spacing = 4;
function fenceAnchor(i, y) {
  const index = i % stations;
  return [(.078 + .029 * wave(index - 2)) + y * .035 * wave(index), y + .024 * wave(index * 2), -i * spacing];
}
function fenceWireSpan(index, level) {
  const y=fenceHeight[level],a=fenceAnchor(index,y),b=fenceAnchor(index+1,y);
  const sag=.034+.018*level+(index===2||index===7?.045:0);
  return [a,...[.25,.5,.75].map(t=>{
    const point=lerp(a,b,t);
    point[1]-=Math.sin(t*Math.PI)*sag;
    return point;
  }),b];
}

// Find the upper strand between posts, using the same straight sections the
// mesh uses. The garment needs a clear span for both shoulders and sleeves.
export function memoryFieldJumperHangingPoint(z) {
  const cell=Math.floor(z/spacing),end=(cell+1)*spacing;
  const hangingZ=Math.min(end-.86,Math.max(cell*spacing+.86,z));
  const spanIndex=((stations-(cell+1))%stations+stations)%stations;
  const wire=fenceWireSpan(spanIndex,2),along=(end-hangingZ)/spacing*4;
  const section=Math.floor(along),[x,y]=lerp(wire[section],wire[section+1],along-section);
  return [x,y,hangingZ];
}

function fence() {
  const wood = group(), wire = group();
  for (let index = 0; index < stations; index++) {
    const pin = fenceAnchor(index, 0), top = fenceAnchor(index, 1.22 + .065 * wave(index * 7));
    const radius = index === 0 ? .098 : .055 + .014 * wave(index * 3 + 9);
    const bottom = [pin[0] - .057, -.14, pin[2]], crown = [top[0] - .057, top[1], top[2] + .033 * wave(index)];
    tube(wood, [bottom, lerp(bottom, crown, .67), crown], [radius * 1.08, radius, radius * .83], 7, .11, index * .25, true);
    if (index === 0) {
      // The strainer shoulders the pull. Join the brace into the post and
      // land the other end in the soil with a short driven heel stake.
      const joint = lerp(bottom, crown, .83), toe = [-.018, -.055, -1.64];
      tube(wood, [toe, joint], [.046, .051], 6, .08, .3);
      tube(wood, [[-.032, -.1, -1.62], [-.048, .16, -1.58]], [.058,.043], 6, .08, 2.1);
    }
    for (const level of fenceHeight.keys()) {
      const span = fenceWireSpan(index,level),a=span[0];
      tube(wire, span, [.0039, .0039, .0039, .0039, .0039], 4, 0, .2);
      // Round staples bridge the strand and enter the timber independently.
      tube(wire, [add(a, [-.038, .012, -.015]), add(a, [.008, .013, -.010]),
        add(a, [.011, -.011, .009]), add(a, [-.038, -.013, .016])], [.004,.004,.004,.004], 4, 0, .55);
    }
  }
  return [piece('mf_fence_post', wood, [.31, .271, .204]),
    piece('mf_fence_wire', wire, [.375, .402, .390], { roughness: .57, metallic: .45 })];
}

function pole() {
  const g = group();
  tube(g, [[0, -.3, 0], [.025, 1.4, .007], [.026, 4.6, -.010], [.015, 7.6, -.023]],
    [.118,.108,.081,.054], 8, .10, .12, true);
  for (const [row, height] of [6.96, 7.36].entries()) {
    const z = row === 0 ? -.091 : -.086;
    tube(g, [[-.79, height - .024, z], [.76, height + .031, z]], [.075,.068], 4, 0, Math.PI / 4);
    for (const side of [-1, 1]) {
      const x = side * .65, y = height + side * .022;
      tube(g, [[x, y, z], [x, y + .09, z], [x, y + .177, z], [x, y + .216, z]], [.021,.047,.040,.026], 7, 0, .2);
      if (row === 0) tube(g, [[.04, y - .46, -.035], [side * .41, y - .026, z]], [.027,.022], 4);
    }
  }
  return piece('mf_pole', g, [.264, .225, .156], { roughness: .96 });
}

function oakCluster(g, centre, size, angle, id) {
  const sides = 9;
  const elevations = [-1, -.69, -.14, .54, .92, 1.04];
  const start = g.p.length / 3;
  for (const [ring, height] of elevations.entries()) {
    const spread = Math.sqrt(Math.max(.008, 1 - height * height)) * (ring === 1 ? .91 : 1);
    for (let i = 0; i < sides; i++) {
      const a = i * TAU / sides + ring * .222, perturb = .79 + .33 * wave(id * 2.1 + ring * 6.11 + i);
      const x = Math.cos(a) * size[0] * spread * perturb + (ring - 2) * size[0] * .092;
      const z = Math.sin(a) * size[2] * spread * perturb;
      g.p.push(centre[0] + Math.cos(angle) * x - Math.sin(angle) * z,
        centre[1] + size[1] * (height + .12 * wave(id + i + ring)),
        centre[2] + Math.sin(angle) * x + Math.cos(angle) * z);
    }
  }
  for (let ring = 0; ring < elevations.length - 1; ring++) {
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides, a = start + ring * sides, b = a + sides;
      g.i.push(a + i, b + i, a + next, a + next, b + i, b + next);
    }
  }
  const cap = start + (elevations.length - 1) * sides;
  for (let i = 1; i < sides - 1; i++) g.i.push(start, start + i, start + i + 1, cap, cap + i + 1, cap + i);
}

// Low fork and uneven, exposed horizontal limbs are the structure of this
// silhouette. Leaf clusters sit at their ends, with openings at the crotches.
const oakArms = [
  { root: [.04, 2.28, -.12], a: [-1.02, 3.49, -.24], b: [-2.61, 4.05, .24], tip: [-5.08, 4.17, .25], radius: .321, crown: 1.08 },
  { root: [.14, 2.82, .03], a: [1.28, 3.72, .30], b: [2.84, 4.35, .43], tip: [5.62, 5.05, 1.19], radius: .335, crown: 1.18 },
  { root: [.09, 3.03, -.10], a: [.16, 3.98, -1.33], b: [.72, 5.05, -2.66], tip: [1.06, 5.8, -4.61], radius: .257, crown: 1.09 },
  { root: [.17, 3.33, -.08], a: [-.82, 4.26, 1.01], b: [-1.51, 5.14, 2.41], tip: [-2.06, 5.43, 3.92], radius: .257, crown: 1.09 },
  { root: [.27, 4.08, -.22], a: [.64, 5.2, .16], b: [1.4, 6.39, .84], tip: [2.89, 6.83, 1.58], radius: .230, crown: 1.24 },
  { root: [.41, 4.70, -.31], a: [-.54, 5.55, -.99], b: [-1.46, 6.40, -1.72], tip: [-3.08, 6.96, -2.86], radius: .203, crown: 1.05 },
];

function oak() {
  const trunk = group(), leaf = group();
  tube(trunk, [[-.03,-.22,.04],[.00,.38,.02],[.04,1.50,-.03],[.10,2.59,-.11],
    [.28,3.67,-.16],[.38,4.83,-.33],[.29,5.97,-.51],[.65,7.33,-.71],[.44,8.51,-.94]],
  [.66,.50,.44,.39,.33,.27,.20,.11,.025], 12, .15, .46);
  for (let i = 0; i < 5; i++) {
    const angle = i * TAU / 5 + .29, axis = [Math.sin(angle), 0, Math.cos(angle)];
    tube(trunk, [[0,.40,0], add([0,.12,0],scale(axis,.60)), add([0,-.06,0],scale(axis,1.15 + .19 * wave(i)))],
      [.22,.14,.023], 7, .13, i * .88);
  }
  oakArms.forEach((arm, index) => {
    const { root, a, b, tip, radius, crown } = arm;
    tube(trunk, [root,a,b,tip], [radius,radius*.71,radius*.40,.031], 8, .11, index * .71);
    const direction = unit(sub(tip,b)), azimuth = Math.atan2(direction[2], direction[0]);
    const across = unit(cross([0,1,0],direction));
    for (const [side, t] of [[1,.1],[-1,.46],[1,.67]]) {
      const stem = lerp(a,b,t), lead = add(lerp(b,tip,.54 + t * .29), scale(across,side * mix(.83,1.84,t)));
      const finish = add(lead,[direction[0] * .67,.72 + .31 * wave(index * 5 + t),direction[2] * .67]);
      const elbow = add(lerp(stem,finish,.56),[0,.06,0]);
      tube(trunk, [stem,elbow,finish], [radius*.43,radius*.27,.015], 6, .09, t);
      const head = add(finish,[0,.45,0]);
      oakCluster(leaf, head, [crown*1.26,crown*.73,crown], azimuth, index * 17 + t);
      if (t !== .46 || index % 2 === 0) {
        const outer = add(add(head, scale(direction,.77)), scale(across, .39 * side));
        oakCluster(leaf, outer, [crown*.84,crown*.63,crown*.71], azimuth + .30, index * 9 + t);
      }
    }
    if (index !== 0) oakCluster(leaf, add(tip,[0,.30,0]), [crown*1.20,crown*.67,crown*.87], azimuth, index + 51);
  });
  oakCluster(leaf,[.57,8.34,-.99],[1.34,1.09,1.33],.65,120);
  oakCluster(leaf,[-.33,7.80,.19],[1.32,.92,1.17],-.13,121);
  return [piece('mf_tree_trunk', trunk, [.285,.219,.141]),
    piece('mf_tree_crown', leaf, [.197,.324,.117], { emissive:[.031,.056,.019], roughness:.97 })];
}

let library;
export function memoryFieldFarLandmarkGeometry() {
  library ??= Object.freeze([...fence(), pole(), ...oak()]);
  return library;
}
