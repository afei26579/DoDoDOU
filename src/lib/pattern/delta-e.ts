import type { LabColor } from './color-convert';

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function normalizeHue(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function hueAngle(a: number, b: number) {
  if (a === 0 && b === 0) return 0;
  return normalizeHue(radiansToDegrees(Math.atan2(b, a)));
}

export function deltaE2000(first: LabColor, second: LabColor) {
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const c1 = Math.sqrt(first.a * first.a + first.b * first.b);
  const c2 = Math.sqrt(second.a * second.a + second.b * second.b);
  const cAvg = (c1 + c2) / 2;
  const cAvg7 = Math.pow(cAvg, 7);
  const g = 0.5 * (1 - Math.sqrt(cAvg7 / (cAvg7 + Math.pow(25, 7))));

  const a1Prime = (1 + g) * first.a;
  const a2Prime = (1 + g) * second.a;
  const c1Prime = Math.sqrt(a1Prime * a1Prime + first.b * first.b);
  const c2Prime = Math.sqrt(a2Prime * a2Prime + second.b * second.b);
  const h1Prime = hueAngle(a1Prime, first.b);
  const h2Prime = hueAngle(a2Prime, second.b);

  const deltaLPrime = second.l - first.l;
  const deltaCPrime = c2Prime - c1Prime;
  let deltaHPrime = 0;
  if (c1Prime * c2Prime !== 0) {
    const hueDiff = h2Prime - h1Prime;
    if (Math.abs(hueDiff) <= 180) {
      deltaHPrime = hueDiff;
    } else if (hueDiff > 180) {
      deltaHPrime = hueDiff - 360;
    } else {
      deltaHPrime = hueDiff + 360;
    }
  }
  const deltaBigHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(degreesToRadians(deltaHPrime / 2));

  const lAvgPrime = (first.l + second.l) / 2;
  const cAvgPrime = (c1Prime + c2Prime) / 2;
  let hAvgPrime = h1Prime + h2Prime;
  if (c1Prime * c2Prime === 0) {
    hAvgPrime = h1Prime + h2Prime;
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    hAvgPrime = (h1Prime + h2Prime) / 2;
  } else if (h1Prime + h2Prime < 360) {
    hAvgPrime = (h1Prime + h2Prime + 360) / 2;
  } else {
    hAvgPrime = (h1Prime + h2Prime - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(degreesToRadians(hAvgPrime - 30)) +
    0.24 * Math.cos(degreesToRadians(2 * hAvgPrime)) +
    0.32 * Math.cos(degreesToRadians(3 * hAvgPrime + 6)) -
    0.2 * Math.cos(degreesToRadians(4 * hAvgPrime - 63));

  const deltaTheta = 30 * Math.exp(-Math.pow((hAvgPrime - 275) / 25, 2));
  const cAvgPrime7 = Math.pow(cAvgPrime, 7);
  const rC = 2 * Math.sqrt(cAvgPrime7 / (cAvgPrime7 + Math.pow(25, 7)));
  const sL = 1 + (0.015 * Math.pow(lAvgPrime - 50, 2)) / Math.sqrt(20 + Math.pow(lAvgPrime - 50, 2));
  const sC = 1 + 0.045 * cAvgPrime;
  const sH = 1 + 0.015 * cAvgPrime * t;
  const rT = -Math.sin(degreesToRadians(2 * deltaTheta)) * rC;

  const lightness = deltaLPrime / (kL * sL);
  const chroma = deltaCPrime / (kC * sC);
  const hue = deltaBigHPrime / (kH * sH);

  return Math.sqrt(lightness * lightness + chroma * chroma + hue * hue + rT * chroma * hue);
}
