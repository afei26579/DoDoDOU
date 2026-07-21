import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseLegendPairsFromTexts } from './legend-pair-parser.mjs';

const DEFAULT_JOB_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs';
const DEFAULT_MODEL = 'PP-OCRv6';
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 180_000;

const optionalPayload = {
  useDocOrientationClassify: false,
  useDocUnwarping: false,
  useTextlineOrientation: false,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPpocrv6Token() {
  return process.env.PPOCRV6_TOKEN
    || process.env.AISTUDIO_OCR_TOKEN
    || process.env.PADDLEOCR_API_TOKEN
    || '';
}

function collectOcrTexts(value, texts = []) {
  if (value === null || value === undefined) return texts;
  if (Array.isArray(value)) {
    for (const item of value) collectOcrTexts(item, texts);
    return texts;
  }
  if (typeof value !== 'object') return texts;

  for (const key of ['recText', 'rec_text', 'text', 'ocrText']) {
    const text = value[key];
    if (typeof text === 'string' && text.trim()) texts.push(text.trim());
  }

  const recTexts = value.recTexts ?? value.rec_texts;
  if (Array.isArray(recTexts)) {
    for (const text of recTexts) {
      if (typeof text === 'string' && text.trim()) texts.push(text.trim());
    }
  }

  for (const item of Object.values(value)) collectOcrTexts(item, texts);
  return texts;
}

async function submitJob({ imagePath, token, jobUrl }) {
  const absolutePath = path.resolve(imagePath);
  const imageBytes = await readFile(absolutePath);
  const form = new FormData();
  form.set('model', DEFAULT_MODEL);
  form.set('optionalPayload', JSON.stringify(optionalPayload));
  form.set('file', new Blob([imageBytes]), path.basename(absolutePath));

  const response = await fetch(jobUrl, {
    method: 'POST',
    headers: { Authorization: `bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PP-OCRv6 submit failed: HTTP ${response.status} ${text}`);
  }
  const payload = JSON.parse(text);
  const jobId = payload?.data?.jobId;
  if (!jobId) throw new Error(`PP-OCRv6 submit response missing jobId: ${text}`);
  return jobId;
}

async function pollJob({ jobId, token, jobUrl, timeoutMs, pollIntervalMs }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const response = await fetch(`${jobUrl}/${jobId}`, {
      headers: { Authorization: `bearer ${token}` },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`PP-OCRv6 poll failed: HTTP ${response.status} ${text}`);
    }
    const payload = JSON.parse(text);
    const data = payload?.data;
    if (data?.state === 'done') return data;
    if (data?.state === 'failed') throw new Error(`PP-OCRv6 job failed: ${data?.errorMsg || text}`);
    await sleep(pollIntervalMs);
  }
  throw new Error(`PP-OCRv6 job timed out after ${timeoutMs}ms`);
}

async function downloadJsonl(resultUrl) {
  if (!resultUrl) throw new Error('PP-OCRv6 job finished without resultUrl.jsonUrl');
  const response = await fetch(resultUrl);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PP-OCRv6 result download failed: HTTP ${response.status} ${text}`);
  }
  return text;
}

export async function runPpocrv6LegendOcr({ imagePath, maxItems = 80 }) {
  const token = getPpocrv6Token();
  if (!token) {
    return {
      ok: false,
      code: 'PPOCRV6_TOKEN_MISSING',
      message: 'PP-OCRv6 API token is not configured',
    };
  }

  try {
    const jobUrl = process.env.PPOCRV6_JOB_URL || DEFAULT_JOB_URL;
    const timeoutMs = Number(process.env.PPOCRV6_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    const pollIntervalMs = Number(process.env.PPOCRV6_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS);
    const jobId = await submitJob({ imagePath, token, jobUrl });
    const job = await pollJob({ jobId, token, jobUrl, timeoutMs, pollIntervalMs });
    const jsonlText = await downloadJsonl(job?.resultUrl?.jsonUrl);
    const payloads = jsonlText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const texts = payloads.flatMap((payload) => collectOcrTexts(payload));
    const pairs = parseLegendPairsFromTexts(texts).slice(0, maxItems);

    return {
      ok: true,
      engine: 'ppocrv6-api',
      entries: pairs.map((pair) => ({
        code: pair.code,
        count: pair.count,
        hex: '#D8DEE6',
        confidence: pair.confidence,
        rawText: pair.rawText,
      })),
      keyValue: Object.fromEntries(pairs.map((pair) => [pair.code, pair.count])),
      ocrText: texts.join('\n'),
      warnings: pairs.length ? [] : ['PP-OCRv6 API returned text, but no color-code/count pairs were parsed.'],
    };
  } catch (error) {
    return {
      ok: false,
      code: 'PPOCRV6_FAILED',
      message: 'PP-OCRv6 API recognition failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
