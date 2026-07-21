function normalizeCode(value) {
  const text = String(value || '')
    .toUpperCase()
    .replace(/[|]/g, 'I')
    .replace(/[^A-Z0-9]/g, '');
  const match = text.match(/[A-Z]{1,3}\d{1,4}/);
  if (!match || /^X\d+$/i.test(match[0])) return '';
  return match[0];
}

function normalizeCount(value) {
  const text = String(value || '')
    .toUpperCase()
    .replace(/[OQD]/g, '0')
    .replace(/[IL|]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/[^0-9]/g, '');
  if (!text || text.length > 6) return null;
  const count = Number.parseInt(text, 10);
  return Number.isFinite(count) && count >= 0 && count <= 999_999 ? count : null;
}

function tokenize(texts) {
  return texts.join('\n')
    .split(/[^A-Za-z0-9OQDILSB|]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseInlinePairs(texts, pushPair) {
  const lines = texts.flatMap((text) => String(text || '').split(/\r?\n/));
  const inlinePattern = /(?<![A-Za-z0-9])([A-Za-z]{1,3}\s*\d{1,4})\s*(?:[(:（]\s*|[xX×*]\s+|\s+[xX×*]?\s*)([0-9OQDIL|SB]{1,6})\s*(?:[)）]|颗|粒|个|pcs?|beads?)?(?![A-Za-z0-9])/gi;

  for (const line of lines) {
    const normalizedLine = line.replace(/[\u00a0]/g, ' ');
    for (const match of normalizedLine.matchAll(inlinePattern)) {
      pushPair(match[1], match[2], 0.94);
    }
  }
}

function parseTokenPairs(texts, pushPair) {
  const tokens = tokenize(texts);
  const isCountToken = (token) => /^[0-9OQDIL|SB]{1,6}$/i.test(token) && normalizeCount(token) !== null;

  let index = 0;
  while (index < tokens.length) {
    const code = normalizeCode(tokens[index]);
    if (!code) {
      index += 1;
      continue;
    }

    const codeTokens = [];
    let cursor = index;
    while (cursor < tokens.length) {
      const nextCode = normalizeCode(tokens[cursor]);
      if (!nextCode || isCountToken(tokens[cursor])) break;
      codeTokens.push(tokens[cursor]);
      cursor += 1;
    }

    if (codeTokens.length >= 2) {
      const countTokens = [];
      while (cursor < tokens.length && isCountToken(tokens[cursor]) && countTokens.length < codeTokens.length) {
        countTokens.push(tokens[cursor]);
        cursor += 1;
      }
      if (countTokens.length >= 2) {
        for (let pairIndex = 0; pairIndex < Math.min(codeTokens.length, countTokens.length); pairIndex += 1) {
          pushPair(codeTokens[pairIndex], countTokens[pairIndex], 0.92);
        }
        index = cursor;
        continue;
      }
    }

    let paired = false;
    for (let offset = 1; offset <= 3 && index + offset < tokens.length; offset += 1) {
      if (isCountToken(tokens[index + offset]) && pushPair(tokens[index], tokens[index + offset], 0.85)) {
        index += offset + 1;
        paired = true;
        break;
      }
    }
    if (!paired) index += 1;
  }
}

export function parseLegendPairsFromTexts(texts) {
  const entries = [];
  const seen = new Set();
  const pushPair = (codeToken, countToken, confidence = 0.9) => {
    const code = normalizeCode(codeToken);
    const count = normalizeCount(countToken);
    if (!code || count === null || seen.has(code)) return false;
    seen.add(code);
    entries.push({ code, count, rawText: `${codeToken} ${countToken}`, confidence });
    return true;
  };

  parseInlinePairs(texts, pushPair);
  parseTokenPairs(texts, pushPair);
  return entries;
}

export function parseLegendKeyValue(texts) {
  return Object.fromEntries(parseLegendPairsFromTexts(texts).map((pair) => [pair.code, pair.count]));
}
