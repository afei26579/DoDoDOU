import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sourcePath = path.join(rootDir, 'colorSystemMapping.json');
const outputPath = path.join(rootDir, 'src', 'lib', 'pattern', 'colorSystemMapping.json');

const brandKeyMap = {
  MARD: 'MARD',
  COCO: 'COCO',
  '漫漫': 'MANMAN',
  '盼盼': 'PANPAN',
  '咪小窝': 'MIXIAOWO',
};

function normalizeHex(hex) {
  const normalized = hex.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex value: ${hex}`);
  }
  return normalized;
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const output = {};

for (const [hex, codes] of Object.entries(source)) {
  const normalizedHex = normalizeHex(hex);
  output[normalizedHex] = {};

  for (const [sourceBrand, targetBrand] of Object.entries(brandKeyMap)) {
    const code = codes[sourceBrand];
    if (typeof code === 'string' && code.trim() && code.trim() !== '-') {
      output[normalizedHex][targetBrand] = code.trim();
    }
  }
}

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(`Generated ${Object.keys(output).length} colors at ${path.relative(rootDir, outputPath)}`);
