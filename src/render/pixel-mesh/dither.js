export const BAYER_4 = Object.freeze([
  0,  8,  2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map((v) => (v + 0.5) / 16));

export const BAYER_8 = Object.freeze([
  0, 48, 12, 60, 3, 51, 15, 63,
  32, 16, 44, 28, 35, 19, 47, 31,
  8, 56, 4, 52, 11, 59, 7, 55,
  40, 24, 36, 20, 43, 27, 39, 23,
  2, 50, 14, 62, 1, 49, 13, 61,
  34, 18, 46, 30, 33, 17, 45, 29,
  10, 58, 6, 54, 9, 57, 5, 53,
  42, 26, 38, 22, 41, 25, 37, 21,
].map((v) => (v + 0.5) / 64));

export function orderedDither(x, y, value, matrix = BAYER_4, size = 4) {
  const ix = Math.abs(Number(x) | 0) % size;
  const iy = Math.abs(Number(y) | 0) % size;
  const threshold = matrix[iy * size + ix] ?? 1;
  return Number(value) >= threshold;
}

export function ditherCoverage(value, matrix = BAYER_4) {
  return matrix.reduce((sum, threshold) => sum + (Number(value) >= threshold ? 1 : 0), 0) / matrix.length;
}
