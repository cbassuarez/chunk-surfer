// Selection affordances for a display that never had a mouse.
//
// A real VFD is a triode vacuum tube: a hot cathode, one control grid per
// character cell, phosphor anodes, and a ~100 Hz multiplexed scan. What that
// hardware can express is a short, closed list, and this module is that list.
//
// Three facts from the hardware shape everything here:
//
//  1. BRIGHTNESS IS DUTY FACTOR. Luminance goes as L = K·Ebc^2.5·Du, and the
//     only sanctioned way to dim is to shorten the duty cycle — Noritake
//     explicitly warns against dimming by filament or anode voltage. Character
//     modules expose four steps (100/75/50/25%), graphic modules eight (12.5%).
//     So brightness here is QUANTIZED and switches on the next scan. Never
//     tween it: a fade is the single biggest tell that this is a web page
//     wearing a faceplate.
//
//  2. THERE IS NO PHOSPHOR PERSISTENCE. ZnO:Zn decays in about a microsecond.
//     The "ghosting" people remember from VFDs is burn-in (permanent, uneven
//     wear), capacitive bleed into the horizontally adjacent cell (10-50 µs,
//     spatial not temporal), retinal afterimage from a 640-4000 cd/m² emitter
//     in a dark room, and halation in the front filter glass. None of those is
//     a trail. Selection state must therefore snap, not smear.
//
//  3. THE PANEL CANNOT RENDER GREY. Tone comes from PWM or frame-rate control,
//     which is why an ordered dither is the historically correct way to get a
//     half-lit glyph — and why "disabled" is a dot knock-out, not an alpha.
//
// And the design problem underneath: real VFDs only ever needed SELECTED. They
// had no pointer, so there is no hardware precedent for HOVER at all. Inventing
// a second highlight style is what makes an emulated instrument read as a
// website. Instead the pointer drives the same single cursor the keyboard does
// (one indicator on the panel, exactly as on real glass), and the two states
// are split across DIFFERENT physical mechanisms that could genuinely co-occur:
// brightness for the pointer, inverse video for the committed cursor.

// Duty-factor tiers, as the character modules expose them.
export const VFD_TIER = Object.freeze({
  off: 0,
  dim: 0.25,
  low: 0.5,
  mid: 0.75,
  full: 1,
});

// HD44780 toggles its cursor every 409.6 ms — an 819 ms period, ~1.22 Hz. That
// is the blink rate every character VFD inherited, and it sits safely under
// WCAG 2.3.1's three-flashes-per-second ceiling. Duty is asymmetric (more on
// than off) per MIL-STD-1472's caution guidance.
export const VFD_BLINK_HZ = 1.22;
export const VFD_BLINK_DUTY = 0.7;
// Noritake's blink timing is expressed in ~14 ms units; quantizing to that grid
// is what stops emulated blinking from looking like software.
const BLINK_QUANTUM_MS = 14;

// Blink between two lit tiers rather than on/off. Noritake's p=2 mode alternates
// normal against REVERSE rather than against blank, and a duty-factor swing is
// legitimate hardware behaviour — both keep the luminance delta well under the
// 10% general-flash threshold that a hard on/off cyan block would cross.
export function vfdBlinkOn(nowMs, { hz = VFD_BLINK_HZ, duty = VFD_BLINK_DUTY } = {}) {
  const period = 1000 / Math.max(0.05, hz);
  const quantized = Math.floor(Number(nowMs || 0) / BLINK_QUANTUM_MS) * BLINK_QUANTUM_MS;
  return (quantized % period) / period < duty;
}

// The state ladder. Each rung is a different physical mechanism, so they stack
// without competing:
//
//   hover    — brightness tier only. Brightness was the one VFD channel that
//              was global and semantically empty, so borrowing it for the
//              pointer steals nothing that meant something.
//   selected — inverse video block. The one state real hardware had; it should
//              look the most installed.
//   editing  — blink, on the value field only.
//   pressed  — a transient duty sag. Real panels sag when current draw spikes,
//              and duty modulation is exactly that mechanism.
//   disabled — lowest tier plus a 50% dot knock-out, because a binary panel
//              cannot render grey.
// Draw one menu row through the hardware vocabulary. The inverse block snaps to
// whole character cells with one pad cell at each end and square corners: a
// rounded corner or a soft edge is where the illusion dies, because a real
// panel inverts whole dot cells and nothing else.
export function drawVfdRow(ui, {
  x, y, w, label, gutterWidth = 2, style, role = 'ui-primary', invertRole = 'ui-glass',
}) {
  const { uiFill, uiText } = ui;
  const s = style || vfdRowStyle({});
  if (s.inverse) {
    uiFill(x - 1, y - 0.1, w + 2, 1.15, ui.inverseColor || 'rgba(255,181,54,0.92)');
  }
  if (s.gutter && s.gutter !== ' ') uiText(x, y, s.gutter, s.inverse ? invertRole : role, s.tier);
  // The knock-out is the disabled state: a binary panel cannot render grey, so
  // half the dots simply are not addressed this frame.
  const text = s.knockout > 0
    ? String(label).split('').map((c, i) => (i % 2 ? ' ' : c)).join('')
    : label;
  uiText(x + gutterWidth, y, text, s.inverse ? invertRole : role, s.tier);
}

export function vfdRowStyle({
  hovered = false, selected = false, editing = false, disabled = false,
  pressedFor = 0, nowMs = 0, reduceMotion = false,
} = {}) {
  if (disabled) return { tier: VFD_TIER.dim, inverse: false, knockout: 0.5, gutter: ' ' };
  let tier = hovered ? VFD_TIER.mid : VFD_TIER.low;
  if (selected) tier = VFD_TIER.full;
  // A press drops one tier for well under 100 ms and snaps back. Momentary
  // only — never repeating, so it cannot read as a flash.
  if (pressedFor > 0 && pressedFor < 80) tier = Math.max(VFD_TIER.dim, tier - 0.25);
  const blinking = editing && !reduceMotion && !vfdBlinkOn(nowMs);
  return {
    tier,
    // Reduced motion substitutes a steady inverse block for every blinking
    // state. Blink and inverse are separate hardware primitives, so this
    // degrades with no design compromise at all.
    inverse: selected ? !blinking : (editing && reduceMotion),
    knockout: 0,
    // The gutter is a fixed-anode annunciator: it can only be off, on, or
    // blinking. It can never move, scale, or change tier on its own.
    gutter: selected ? '▶' : hovered ? '▸' : ' ',
  };
}
