// Per-device layout from the vendored SDL GameControllerDB (src/data/...).
// The browser's `mapping: 'standard'` guarantees nothing about the PHYSICAL
// pad under a wrapper driver: an 8BitDo in X mode, a Switch Pro on Windows,
// or a fight stick all claim standard while their real buttons sit elsewhere.
// The database says where they really are; this module turns a pad id into a
// physical->semantic layout the poller can apply before the standard mapping
// guesses.

import { GAMECONTROLLER_DB } from '../data/gamecontrollerdb.js';

const DB = GAMECONTROLLER_DB;

// SDL logical name -> our semantic id (the same ids BUTTON_BY_INDEX uses).
const LOGICAL_BUTTON = Object.freeze({
  a: 'south', b: 'east', x: 'west', y: 'north',
  back: 'view', guide: 'guide', start: 'menu',
  leftstick: 'leftStick', rightstick: 'rightStick',
  leftshoulder: 'leftShoulder', rightshoulder: 'rightShoulder',
  lefttrigger: 'leftTrigger', righttrigger: 'rightTrigger',
});
const LOGICAL_AXIS = Object.freeze(['leftx', 'lefty', 'rightx', 'righty']);

let vendorProductCache = new Map(); // "vendor:product" -> layout | null

// "054c-09cc-..." or "... (Vendor: 054c Product: 09cc)" both carry the pair.
function vendorProductOf(padId) {
  const raw = String(padId || '');
  const bracket = raw.match(/vendor:\s*([0-9a-f]{4})\s+product:\s*([0-9a-f]{4})/i);
  if (bracket) return `${bracket[1].toLowerCase()}:${bracket[2].toLowerCase()}`;
  const dashed = raw.match(/^([0-9a-f]{4})-([0-9a-f]{4})/i);
  if (dashed) return `${dashed[1].toLowerCase()}:${dashed[2].toLowerCase()}`;
  return null;
}

// The SDL USB GUID for a vendor/product pair. Field layout, byte offsets
// measured against the database itself: bus[0:2] crc[2:6] zero[6:8]
// vendor-LE[8:12] zero[12:16] product-LE[16:20] version+zeros[20:32].
function guidFor(vendorProduct) {
  if (!vendorProduct) return null;
  const [v, p] = vendorProduct.split(':');
  return `03000000${v.slice(2)}${v.slice(0, 2)}0000${p.slice(2)}${p.slice(0, 2)}000000000000`;
}

function parseEntry(entry) {
  const buttons = new Map(), axes = new Map(), invert = new Set(), triggerAxes = new Map();
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'guid' || key === 'name' || key === 'platform') continue;
    const raw = String(value);
    const invertAxis = raw.endsWith('~');
    const token = raw.replace(/[~+]$/, '').replace(/[+-]$/, '');
    if (LOGICAL_BUTTON[key]) {
      if (token.startsWith('b')) {
        const index = Number(token.slice(1));
        if (Number.isInteger(index) && index >= 0) buttons.set(index, LOGICAL_BUTTON[key]);
      } else if (token.startsWith('a')) {
        // A trigger on an axis: poll the axis's value with the button's id.
        const index = Number(token.slice(1));
        if (Number.isInteger(index) && index >= 0) {
          triggerAxes.set(LOGICAL_BUTTON[key], index);
          if (invertAxis) invert.add(`a${index}`);
        }
      }
    } else if (LOGICAL_AXIS.includes(key) && token.startsWith('a')) {
      const index = Number(token.slice(1));
      if (Number.isInteger(index) && index >= 0) {
        axes.set(index, key);
        if (invertAxis) invert.add(`a${index}`);
      }
    }
    // dp* hats are exposed by browsers as buttons 12-15 anyway; nothing to do.
  }
  if (!buttons.size && !axes.size && !triggerAxes.size) return null;
  return { name: entry.name, buttons, axes, invert, triggerAxes };
}

function layoutForPair(vendorProduct) {
  if (vendorProductCache.has(vendorProduct)) return vendorProductCache.get(vendorProduct);
  let layout = null;
  const guid = guidFor(vendorProduct);
  const exact = guid ? DB[guid] : null;
  if (exact) layout = parseEntry(exact);
  if (!layout) {
    // Same vendor/product under another bus or with a crc: scan once.
    const prefix = guid ? guid.slice(6) : null; // everything after bus+crc
    const entry = Object.values(DB).find((row) => row.guid.endsWith(prefix || ''));
    if (entry) layout = parseEntry(entry);
  }
  vendorProductCache.set(vendorProduct, layout);
  return layout;
}

/**
 * The physical layout for a pad id, or null when the standard mapping should
 * be trusted. Cached per vendor/product pair.
 */
export function deviceLayoutFor(padId) {
  const pair = vendorProductOf(padId);
  return pair ? layoutForPair(pair) : null;
}

export function deviceLayoutName(padId) {
  const pair = vendorProductOf(padId);
  if (!pair) return null;
  return layoutForPair(pair)?.name || null;
}

export function resetDeviceLayoutCacheForTest() {
  vendorProductCache = new Map();
}
