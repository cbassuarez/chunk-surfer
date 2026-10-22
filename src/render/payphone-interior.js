// The close controls are a live material on the cabinet already inside the K6.
// Keep the cabinet anchor in metres, matching build-props.mjs; the canvas is
// only its ink and moving parts. The enclosure and view through it stay 3D.
import { cameraBasis } from './camera-basis.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => a.map((n, i) => n - b[i]);
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;

export const PAYPHONE_CABINET = Object.freeze({
  width: .60,
  height: .60 / 1.12,
  left: -.235 - (-.185 + .145 * .54) * .60,
  top: 1.46 + (.17 + .53 * .5) * (.60 / 1.12),
  // In front of the fixed fittings. The live receiver is painted on the same
  // material so the handset and its hit region cannot separate while looking.
  faceZ: -.24,
  standingX: .09,
  standingZ: .23,
});

export const PAYPHONE_BOOK = Object.freeze({
  left: .0145, topY: 1.033, backZ: -.3755, width: .291, height: .199,
});

function boxFrame(pose, groundY = 0) {
  const box = pose.boxWorld || {};
  const yaw = finite(box.yaw, -finite(pose.faceSet));
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const normal = [Math.sin(yaw), 0, Math.cos(yaw)];
  const inside = pose.insideWorld || {};
  return {
    right, normal,
    x: finite(box.x, finite(inside.x) - normal[0] * PAYPHONE_CABINET.standingZ - right[0] * PAYPHONE_CABINET.standingX),
    z: finite(box.z, finite(inside.z) - normal[2] * PAYPHONE_CABINET.standingZ - right[2] * PAYPHONE_CABINET.standingX),
    y: finite(box.y, finite(pose.groundY, finite(groundY))),
  };
}

// Origin is the canvas's top left in world metres. Right and up are unit
// vectors; width/height are its physical extents. The optional down vector is
// the full top-to-bottom extent for consumers that prefer a two-vector plane.
export function payphoneInteriorPlane(pose, layout, { groundY = 0 } = {}) {
  if (!pose || !layout?.px?.housing) return null;
  const P = layout.px, body = P.housing;
  if (!(body.w > 0 && body.h > 0 && P.W > 0 && P.H > 0)) return null;
  const { right, normal, x: bx, y: by, z: bz } = boxFrame(pose, groundY);
  const sx = PAYPHONE_CABINET.width / body.w, sy = PAYPHONE_CABINET.height / body.h;
  const canvasWidth = Math.max(P.W, finite(P.FW)), canvasHeight = Math.max(P.H, finite(P.FH));
  const left = PAYPHONE_CABINET.left - body.x * sx;
  const top = PAYPHONE_CABINET.top + body.y * sy;
  const width = canvasWidth * sx, height = canvasHeight * sy;
  return {
    origin: [bx + right[0] * left + normal[0] * PAYPHONE_CABINET.faceZ,
      by + top, bz + right[2] * left + normal[2] * PAYPHONE_CABINET.faceZ],
    right, up: [0, 1, 0], normal, width, height, down: [0, -height, 0],
    canvasWidth, canvasHeight,
    cellW: layout.cellW || 8, cellH: layout.cellH || 16,
  };
}

// The directory is already modelled lying on the shelf. Its live print belongs
// on that horizontal top, rather than on a second vertical book below the dial.
// Canvas top is the book's back edge; screen-right follows the native spine.
export function payphoneInteriorBookPlane(pose, {
  groundY = 0, canvasWidth = 1024, canvasHeight = 704, cellW = 8, cellH = 16,
} = {}) {
  if (!pose) return null;
  const { right, normal, x, y, z } = boxFrame(pose, groundY);
  const book = PAYPHONE_BOOK, up = normal.map(n => -n);
  return {
    origin: [x + right[0] * book.left + normal[0] * book.backZ,
      y + book.topY, z + right[2] * book.left + normal[2] * book.backZ],
    right, up, normal: [0, 1, 0], width: book.width, height: book.height,
    down: normal.map(n => n * book.height),
    canvasWidth: Math.max(1, finite(canvasWidth, 1024)), canvasHeight: Math.max(1, finite(canvasHeight, 704)),
    cellW: Math.max(.01, finite(cellW, 8)), cellH: Math.max(.01, finite(cellH, 16)),
  };
}

export function payphoneInteriorWorldPoint(plane, u = 0, v = 0) {
  if (!plane) return null;
  return {
    x: plane.origin[0] + plane.right[0] * u * plane.width - plane.up[0] * v * plane.height,
    y: plane.origin[1] + plane.right[1] * u * plane.width - plane.up[1] * v * plane.height,
    z: plane.origin[2] + plane.right[2] * u * plane.width - plane.up[2] * v * plane.height,
  };
}

// Pick the exact live material, even after looking sideways or changing the
// window aspect. Input positions arrive in UI cells normalized over the whole
// displayed canvas (uiPointFromClient), not simply cell-size CSS pixels.
// Return the original instrument's virtual cells so its governed rotary and
// inspection regions keep one shared coordinate system with the drawn face.
export function payphoneInteriorPointer(event, {
  plane, eye, yaw = 0, pitch = 0, size = {}, width = 0, height = 0, fov = .95,
} = {}) {
  if (!event || !plane || !eye || !(size.cols > 0 && size.rows > 0)) return null;
  const nx = Number(event.cellX) / size.cols, ny = Number(event.cellY) / size.rows;
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  const aspect = width > 0 && height > 0 ? width / height
    : size.cols * plane.cellW / (size.rows * plane.cellH);
  const basis = cameraBasis(yaw, pitch), vx = (nx * 2 - 1) * aspect * fov, vy = (1 - ny * 2) * fov;
  const ray = basis.forward.map((n, i) => n + basis.right[i] * vx + basis.up[i] * vy);
  const from = [Number(eye.x), Number(eye.y), Number(eye.z)];
  if (!from.every(Number.isFinite)) return null;
  const denominator = dot(ray, plane.normal);
  if (Math.abs(denominator) < 1e-8) return null;
  const distance = dot(sub(plane.origin, from), plane.normal) / denominator;
  if (!(distance > .001)) return null;
  const relative = ray.map((n, i) => from[i] + n * distance - plane.origin[i]);
  const u = dot(relative, plane.right) / plane.width;
  const v = -dot(relative, plane.up) / plane.height;
  // Deliberately keep off-canvas coordinates: a captured finger can leave its
  // original hole or canvas while pulling, and still must release the spring.
  return {
    ...event,
    cellX: u * plane.canvasWidth / plane.cellW,
    cellY: v * plane.canvasHeight / plane.cellH,
    instrumentUV: { u, v, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 },
  };
}

// Reuse the original inspection actions. The left page carries scratched
// numbers; the right page carries the surviving directory listings. Projected
// page hits must take priority over the cabinet's empty surrounding canvas.
export function payphoneInteriorBookPointer(event, { layout, ...options } = {}) {
  const hit = payphoneInteriorPointer(event, options);
  if (!hit?.instrumentUV.inside) return null;
  const region = hit.instrumentUV.u < .5 ? 'scratches' : 'directory';
  const bounds = layout?.[region];
  if (!bounds) return null;
  return { ...hit, cellX: bounds.x + bounds.w / 2, cellY: bounds.y + bounds.h / 2, instrumentRegion: region };
}
