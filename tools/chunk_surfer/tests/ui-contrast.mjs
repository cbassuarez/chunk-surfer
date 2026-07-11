import { UI_COLOR } from '../../../public/labs/chunk-surfer/src/render/palette.js';

function rgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function channel(v) {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function lum(hex) {
  const [r,g,b] = rgb(hex).map(channel);
  return 0.2126*r + 0.7152*g + 0.0722*b;
}
function ratio(a,b) {
  const [hi,lo] = [lum(a),lum(b)].sort((x,y)=>y-x);
  return (hi+0.05)/(lo+0.05);
}
function check(name, fg, bg, minimum = 4.5) {
  const r = ratio(fg,bg);
  if (r < minimum) throw new Error(`${name}: ${r.toFixed(2)} < ${minimum}`);
  console.log(`✓ ${name} ${r.toFixed(2)}:1`);
}

for (const [name, color] of Object.entries({
  primary:UI_COLOR.primary, amber:UI_COLOR.amber, blue:UI_COLOR.blue,
  green:UI_COLOR.green, danger:UI_COLOR.danger, secondary:UI_COLOR.secondary,
})) check(`machine ${name}`, color, UI_COLOR.glass);

check('paper ink', UI_COLOR.paperInk, UI_COLOR.paper);
check('paper secondary', UI_COLOR.paperSecondary, UI_COLOR.paper);
check('machine frame', UI_COLOR.frame, UI_COLOR.glass, 3);
