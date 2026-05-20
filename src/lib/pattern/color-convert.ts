import type { PatternRgb } from './color-system';

export type LabColor = {
  l: number;
  a: number;
  b: number;
};

function srgbToLinear(value: number) {
  const normalized = Math.max(0, Math.min(255, value)) / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function xyzToLabChannel(value: number) {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
}

export function rgbToLab(rgb: PatternRgb): LabColor {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / 1;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;

  const fx = xyzToLabChannel(x);
  const fy = xyzToLabChannel(y);
  const fz = xyzToLabChannel(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labDistance(a: LabColor, b: LabColor) {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}
