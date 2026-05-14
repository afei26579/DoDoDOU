import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const mappingPath = path.join(rootDir, 'src', 'lib', 'pattern', 'colorSystemMapping.json');
const brandKeys = ['MARD', 'COCO', 'MANMAN', 'PANPAN', 'MIXIAOWO'];
const errors = [];
const warnings = [];
const seenCodes = new Map(brandKeys.map((brandKey) => [brandKey, new Map()]));

const mapping = JSON.parse(await readFile(mappingPath, 'utf8'));

for (const [hex, codes] of Object.entries(mapping)) {
  if (!/^#[0-9A-F]{6}$/.test(hex)) {
    errors.push(`Invalid hex: ${hex}`);
  }

  for (const brandKey of brandKeys) {
    const code = codes[brandKey];
    if (!code) {
      errors.push(`Missing ${brandKey} code for ${hex}`);
      continue;
    }

    const brandSeenCodes = seenCodes.get(brandKey);
    const previousHex = brandSeenCodes.get(code);
    if (previousHex && previousHex !== hex) {
      warnings.push(`Duplicate ${brandKey} code ${code}: ${previousHex} and ${hex}`);
    }
    brandSeenCodes.set(code, hex);
  }
}

if (warnings.length) {
  console.warn(warnings.join('\n'));
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${Object.keys(mapping).length} colors across ${brandKeys.length} brands`);
