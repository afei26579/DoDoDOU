import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { parseLegendKeyValue } from '../server/legend-pair-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DEFAULT_JOB_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs';
const DEFAULT_MODEL = 'PP-OCRv6';
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_PORT = 3011;

const defaultOptionalPayload = {
  useDocOrientationClassify: false,
  useDocUnwarping: false,
  useTextlineOrientation: false,
};

function getToken() {
  return process.env.PPOCRV6_TOKEN
    || process.env.AISTUDIO_OCR_TOKEN
    || process.env.PADDLEOCR_API_TOKEN
    || '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    file: '',
    fileUrl: '',
    outputDir: path.join(rootDir, 'tmp', 'ppocrv6-api-demo'),
    serve: false,
    port: Number(process.env.PPOCRV6_DEMO_PORT || DEFAULT_PORT),
    timeoutMs: Number(process.env.PPOCRV6_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    pollIntervalMs: Number(process.env.PPOCRV6_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--serve') args.serve = true;
    else if (item === '--file') args.file = argv[++index] || '';
    else if (item === '--file-url') args.fileUrl = argv[++index] || '';
    else if (item === '--output-dir') args.outputDir = argv[++index] || args.outputDir;
    else if (item === '--port') args.port = Number(argv[++index] || args.port);
    else if (item === '--timeout-ms') args.timeoutMs = Number(argv[++index] || args.timeoutMs);
    else if (item === '--poll-ms') args.pollIntervalMs = Number(argv[++index] || args.pollIntervalMs);
    else if (!item.startsWith('-') && !args.file) args.file = item;
  }

  return args;
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function submitOcrJob({ filePath, fileUrl, token, model = DEFAULT_MODEL, jobUrl = DEFAULT_JOB_URL }) {
  assertOk(token, 'Missing API token. Set PPOCRV6_TOKEN, AISTUDIO_OCR_TOKEN, or PADDLEOCR_API_TOKEN.');

  const headers = { Authorization: `bearer ${token}` };
  let response;

  if (fileUrl) {
    response = await fetch(jobUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileUrl,
        model,
        optionalPayload: defaultOptionalPayload,
      }),
    });
  } else {
    assertOk(filePath, 'Missing input. Pass --file <path> or --file-url <url>.');
    const absolutePath = path.resolve(filePath);
    await readFile(absolutePath);

    const form = new FormData();
    form.set('model', model);
    form.set('optionalPayload', JSON.stringify(defaultOptionalPayload));
    const blob = new Blob([await readFile(absolutePath)]);
    form.set('file', blob, path.basename(absolutePath));

    response = await fetch(jobUrl, {
      method: 'POST',
      headers,
      body: form,
    });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Submit failed: HTTP ${response.status} ${text}`);
  }

  const payload = JSON.parse(text);
  const jobId = payload?.data?.jobId;
  assertOk(jobId, `Submit response does not contain data.jobId: ${text}`);
  return jobId;
}

async function pollOcrJob({ jobId, token, jobUrl = DEFAULT_JOB_URL, pollIntervalMs, timeoutMs, onProgress }) {
  const startedAt = Date.now();
  const headers = { Authorization: `bearer ${token}` };

  while (Date.now() - startedAt <= timeoutMs) {
    const response = await fetch(`${jobUrl}/${jobId}`, { headers });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Poll failed: HTTP ${response.status} ${text}`);
    }

    const payload = JSON.parse(text);
    const data = payload?.data;
    const state = data?.state;
    onProgress?.(data);

    if (state === 'done') return data;
    if (state === 'failed') throw new Error(`OCR job failed: ${data?.errorMsg || text}`);

    await sleep(pollIntervalMs);
  }

  throw new Error(`OCR job timed out after ${timeoutMs}ms: ${jobId}`);
}

function collectTextFromJsonlLine(linePayload) {
  const texts = [];

  function walk(value) {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== 'object') return;

    for (const key of ['recText', 'rec_text', 'text', 'ocrText']) {
      if (typeof value[key] === 'string' && value[key].trim()) {
        texts.push(value[key].trim());
      }
    }
    for (const item of Object.values(value)) walk(item);
  }

  walk(linePayload);
  return [...new Set(texts)];
}

async function downloadResult({ resultUrl, outputDir }) {
  assertOk(resultUrl, 'OCR job finished without resultUrl.jsonUrl.');
  await mkdir(outputDir, { recursive: true });

  const response = await fetch(resultUrl);
  const jsonlText = await response.text();
  if (!response.ok) {
    throw new Error(`Download JSONL failed: HTTP ${response.status} ${jsonlText}`);
  }

  const jsonlPath = path.join(outputDir, 'result.jsonl');
  await writeFile(jsonlPath, jsonlText, 'utf8');

  const lines = jsonlText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsedLines = [];
  const recognizedTexts = [];
  const imageUrls = [];

  lines.forEach((line, lineIndex) => {
    const payload = JSON.parse(line);
    parsedLines.push(payload);
    recognizedTexts.push(...collectTextFromJsonlLine(payload));

    const ocrResults = payload?.result?.ocrResults;
    if (Array.isArray(ocrResults)) {
      ocrResults.forEach((item, itemIndex) => {
        if (typeof item?.ocrImage === 'string') {
          imageUrls.push({ url: item.ocrImage, lineIndex, itemIndex });
        }
      });
    }
  });

  for (let index = 0; index < imageUrls.length; index += 1) {
    const item = imageUrls[index];
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) continue;
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    await writeFile(path.join(outputDir, `ocr_image_${String(index + 1).padStart(2, '0')}.jpg`), bytes);
  }

  const summary = {
    jsonlPath,
    outputDir,
    pages: parsedLines.length,
    ocrImages: imageUrls.length,
    recognizedTexts: [...new Set(recognizedTexts)],
    keyValue: parseLegendKeyValue(recognizedTexts),
  };
  await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}

async function runOcr({ filePath, fileUrl, outputDir, timeoutMs, pollIntervalMs, onProgress }) {
  const token = getToken();
  const jobId = await submitOcrJob({ filePath, fileUrl, token });
  const data = await pollOcrJob({ jobId, token, timeoutMs, pollIntervalMs, onProgress });
  const summary = await downloadResult({
    resultUrl: data?.resultUrl?.jsonUrl,
    outputDir,
  });
  return { jobId, state: data?.state, extractProgress: data?.extractProgress, ...summary };
}

async function startServer(args) {
  const app = express();
  const upload = multer({ dest: path.join(rootDir, 'tmp', 'ppocrv6-api-demo-uploads') });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, model: DEFAULT_MODEL });
  });

  app.post('/ocr/file', upload.single('file'), async (req, res) => {
    try {
      const result = await runOcr({
        filePath: req.file?.path,
        outputDir: args.outputDir,
        timeoutMs: args.timeoutMs,
        pollIntervalMs: args.pollIntervalMs,
      });
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/ocr/url', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const result = await runOcr({
        fileUrl: req.body?.fileUrl,
        outputDir: args.outputDir,
        timeoutMs: args.timeoutMs,
        pollIntervalMs: args.pollIntervalMs,
      });
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.listen(args.port, () => {
    console.log(`PP-OCRv6 demo listening on http://127.0.0.1:${args.port}`);
    console.log('POST multipart file to /ocr/file with field name "file".');
    console.log('POST JSON {"fileUrl":"https://..."} to /ocr/url.');
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.serve) {
    await startServer(args);
    return;
  }

  const result = await runOcr({
    filePath: args.file,
    fileUrl: args.fileUrl,
    outputDir: args.outputDir,
    timeoutMs: args.timeoutMs,
    pollIntervalMs: args.pollIntervalMs,
    onProgress: (data) => {
      const progress = data?.extractProgress;
      if (progress?.totalPages) {
        console.log(`state=${data.state} pages=${progress.extractedPages}/${progress.totalPages}`);
      } else {
        console.log(`state=${data?.state || 'unknown'}`);
      }
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
