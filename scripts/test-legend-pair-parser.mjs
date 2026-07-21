import assert from 'node:assert/strict';
import { parseLegendKeyValue } from '../server/legend-pair-parser.mjs';

const cases = [
  {
    name: 'inline pairs',
    texts: ['H06 199  A10 200'],
    expected: { H06: 199, A10: 200 },
  },
  {
    name: 'inline pairs with parentheses',
    texts: ['H06(199)  A10 (200)'],
    expected: { H06: 199, A10: 200 },
  },
  {
    name: 'two-line code row and count row',
    texts: ['H06  A10', '199 200'],
    expected: { H06: 199, A10: 200 },
  },
  {
    name: 'x count',
    texts: ['H06 x199   A10 X 200'],
    expected: { H06: 199, A10: 200 },
  },
  {
    name: 'unit suffix',
    texts: ['H06 199颗 A10 200粒 C22 19pcs'],
    expected: { H06: 199, A10: 200, C22: 19 },
  },
  {
    name: 'ocr line list from legend',
    texts: [
      [
        'H07',
        'A08',
        'C22',
        'F23',
        'F01',
        'C06',
        'T01',
        'G02',
        '141',
        '22',
        '19',
        '1',
        '3',
        '4',
        '13',
        '3',
        'A10',
        '10',
        '嘟豆豆',
      ].join('\n'),
    ],
    expected: { H07: 141, A08: 22, C22: 19, F23: 1, F01: 3, C06: 4, T01: 13, G02: 3, A10: 10 },
  },
  {
    name: 'vertical cards in multiple rows',
    texts: [
      [
        'T01',
        'G03',
        'H16',
        '1442',
        '1023',
        '687',
        'H07',
        'H17',
        'M07',
        '98',
        '51',
        '46',
      ].join('\n'),
    ],
    expected: { T01: 1442, G03: 1023, H16: 687, H07: 98, H17: 51, M07: 46 },
  },
];

for (const item of cases) {
  assert.deepEqual(parseLegendKeyValue(item.texts), item.expected, item.name);
}

console.log(`legend pair parser: ${cases.length} cases passed`);
