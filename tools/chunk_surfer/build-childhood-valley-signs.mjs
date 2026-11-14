import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { HOME_VALLEY_SIGN_PRINTS } from '../../src/data/childhood-valley-signs.js';
import { valleyPaperStock } from './childhood-valley-paper-stock.mjs';

const cellWidth = 512, cellHeight = 256, columns = 3, gutter = 4;
const faces = {
  sans: 'assets/fonts/NimbusSans-Regular.otf',
  bold: 'assets/fonts/NimbusSans-Bold.otf',
  serif: 'assets/fonts/NimbusRoman-Bold.otf',
  mono: 'assets/fonts/NimbusMonoPS-Regular.otf',
  'mono-bold': 'assets/fonts/NimbusMonoPS-Bold.otf',
};
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

// Use the pinned outlines directly. Pango/fontconfig can silently fall back
// to the host sans even when a face file is supplied.
const rasterize = `
import base64, io, json, sys
from PIL import Image, ImageDraw, ImageFont
results = []
for row in json.load(sys.stdin):
    font = ImageFont.truetype(row['file'], row['size'])
    text, tracking = row['text'], row['tracking']
    bounds = font.getbbox(text)
    x0, y0, x1, y1 = bounds
    x1 += round(tracking * (len(text)-1))
    image = Image.new('RGBA', (x1-x0, y1-y0))
    draw = ImageDraw.Draw(image)
    if tracking:
        for i, char in enumerate(text):
            x = round(font.getlength(text[:i]) + tracking*i) - x0
            draw.text((x,-y0), char, font=font, fill=row['color'])
    else:
        draw.text((-x0,-y0), text, font=font, fill=row['color'])
    png = io.BytesIO()
    image.save(png, format='PNG')
    results.append([image.width, image.height, base64.b64encode(png.getvalue()).decode('ascii')])
print(json.dumps(results))
`;
const lineJobs = HOME_VALLEY_SIGN_PRINTS.flatMap(print => print.lines.map(line => ({
  text: line.text, size: line.size, file: resolve(faces[line.face || 'sans']),
  color: line.color || print.ink || '#202527', tracking: line.tracking,
})));
const glyphs = JSON.parse(execFileSync(process.env.CHUNK_SURFER_LETTERING_PYTHON || 'python3', ['-c', rasterize], {
  input: JSON.stringify(lineJobs), encoding: 'utf8', maxBuffer: 2_000_000,
}));
let glyphIndex = 0;

function markSvg(mark, color) {
  const { kind, x, y, width: w, height: h, direction } = mark;
  const fill = xml(mark.color || color);
  if (kind === 'pen') return `<path d="${xml(mark.d)}" fill="none" stroke="${fill}"
    stroke-width="${mark.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (kind === 'arrow') {
    const points = [[0,.38],[.63,.38],[.63,0],[1,.5],[.63,1],[.63,.62],[0,.62]]
      .map(([a,b]) => [x + (direction === 'left' ? 1-a : a)*w, y+b*h].join(',')).join(' ');
    return `<polygon points="${points}" fill="${fill}"/>`;
  }
  if (kind === 'bus') {
    return `<g fill="${fill}" transform="translate(${x},${y}) scale(${w/36},${h/36})">
      <path fill-rule="evenodd" d="M6 5Q6 2 10 2h16q4 0 4 3v22h-2v5h-5v-4H13v4H8v-5H6z M9 8v12h18V8z M11 23a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M25 23a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>
    </g>`;
  }
  if (kind === 'line') return `<line x1="${x}" y1="${y}" x2="${mark.x2}" y2="${mark.y2}"
    stroke="${fill}" stroke-width="${mark.stroke || 2}" stroke-linecap="round"/>`;
  if (kind === 'circle') return `<circle cx="${x}" cy="${y}" r="${w/2}" fill="${fill}"/>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
}

async function renderPrint(print) {
  const { width, height, base, lines, marks = [], ink = '#202527' } = print;
  if (width > cellWidth - 2*gutter || height > cellHeight - 2*gutter) throw Error(`Oversize print ${print.id}`);
  const stock = valleyPaperStock(print);
  const sheet = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${xml(base)}"/>
    ${marks.map(mark => markSvg(mark, ink)).join('')}
  </svg>`);
  const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${marks.map(mark => markSvg({...mark,color:'#fff'}, '#fff')).join('')}
  </svg>`);
  const text = [];
  for (const line of lines) {
    const [textWidth, textHeight, data] = glyphs[glyphIndex++];
    const left = Math.round(line.x - (line.align === 'right' ? textWidth : line.align === 'center' ? textWidth/2 : 0));
    if (left < 0 || line.y < 0 || left + textWidth > width || line.y + textHeight > height) {
      throw Error(`${print.id} print overflow: "${line.text}" at ${left},${line.y}, size ${textWidth}×${textHeight} within ${width}×${height}`);
    }
    text.push({ input: Buffer.from(data, 'base64'), left, top: line.y });
  }
  const image = stock
    ? await sharp(stock, { raw: { width, height, channels: 3 } })
      .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${marks.map(mark => markSvg(mark, ink)).join('')}
      </svg>`) }, ...text]).png().toBuffer()
    : await sharp(sheet).composite(text).png().toBuffer();
  const maskAlpha = await sharp(mask).composite(text).png().toBuffer();
  const coverage = await sharp(maskAlpha).extractChannel('alpha').raw().toBuffer();
  // Both halves use the atlas's sRGB upload. Encode coverage so GPU
  // interpolation and mipmaps average actual pigment area in linear space.
  for (let i = 0; i < coverage.length; i++) {
    const c = coverage[i] / 255;
    coverage[i] = Math.round(255 * (c <= .0031308 ? 12.92*c : 1.055*c**(1/2.4)-.055));
  }
  const coverageImage = await sharp(coverage, {raw:{width,height,channels:1}}).toColourspace('srgb').png().toBuffer();
  return Promise.all([image, coverageImage].map(layer =>
    sharp(layer).extend({ top: gutter, bottom: gutter, left: gutter, right: gutter, extendWith: 'copy' }).png().toBuffer()));
}

const target = resolve('public/assets/childhood-valley/signs.png');
const atlasHeight = Math.ceil(HOME_VALLEY_SIGN_PRINTS.length / columns)*cellHeight;
const atlas = [];
for (const [index, print] of HOME_VALLEY_SIGN_PRINTS.entries()) {
  const [input, coverage] = await renderPrint(print);
  const left = index % columns * cellWidth, top = Math.floor(index / columns)*cellHeight;
  atlas.push({ input, left, top }, { input:coverage, left, top:top+atlasHeight });
}
await mkdir(resolve('public/assets/childhood-valley'), { recursive: true });
await sharp({ create: { width: columns*cellWidth, height: atlasHeight*2,
  channels: 3, background: '#e4e1d8' } }).composite(atlas).png().toFile(target);
console.log(`Built ${HOME_VALLEY_SIGN_PRINTS.length} physical sign faces and their pigment masks at ${target}`);
