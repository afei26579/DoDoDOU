import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import sharp from 'sharp';
import { getPpocrv6Token, runPpocrv6LegendOcr } from './ppocrv6-api.mjs';

const DATA_IMAGE_PATTERN = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([\s\S]+)$/i;
const DEFAULT_JSON_LIMIT = '8mb';
const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_PIXELS = 16_000_000;
const DEFAULT_MAX_IMAGE_SIDE = 2400;
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_STDIO_CHARS = 2_000_000;
const MAX_ERROR_DETAIL_CHARS = 4_000;

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseDataImage(value) {
  if (typeof value !== 'string') return null;
  const match = DATA_IMAGE_PATTERN.exec(value.trim());
  if (!match) return null;

  return {
    mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function splitCommand(commandLine) {
  const value = String(commandLine || '').trim();
  if (!value) return ['python'];
  return value.match(/"[^"]+"|'[^']+'|\S+/g)?.map((part) => part.replace(/^["']|["']$/g, '')) ?? ['python'];
}

function parseWorkerPayload(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith('{')) continue;
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Keep scanning in case PaddleOCR logged JSON-like diagnostic output.
    }
  }

  return null;
}

function appendChunk(current, chunk) {
  if (current.length >= MAX_STDIO_CHARS) return current;
  return (current + chunk.toString('utf8')).slice(0, MAX_STDIO_CHARS);
}

function truncateDetail(value, maxLength = MAX_ERROR_DETAIL_CHARS) {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function runPaddleWorker({ rootDir, imagePath, maxItems }) {
  const timeoutMs = parseInteger(process.env.PADDLEOCR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, { min: 5_000, max: 180_000 });
  const scriptPath = path.join(rootDir, 'scripts', 'paddle_legend_ocr.py');
  const [command, ...commandArgs] = splitCommand(process.env.PADDLEOCR_PYTHON || 'python');
  const child = spawn(command, [...commandArgs, scriptPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = appendChunk(stdout, chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr = appendChunk(stderr, chunk);
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: 'PADDLEOCR_UNAVAILABLE',
        message: `PaddleOCR Python worker could not start: ${error.message}`,
        detail: `command=${[command, ...commandArgs, scriptPath].join(' ')}`,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          ok: false,
          code: 'PADDLEOCR_TIMEOUT',
          message: `PaddleOCR recognition timed out after ${timeoutMs}ms`,
          detail: truncateDetail(stderr || stdout),
        });
        return;
      }

      const payload = parseWorkerPayload(stdout);
      if (payload) {
        resolve(payload);
        return;
      }

      resolve({
        ok: false,
        code: code === 0 ? 'PADDLEOCR_BAD_OUTPUT' : 'PADDLEOCR_FAILED',
        message: stderr.trim() || stdout.trim() || 'PaddleOCR worker did not return valid JSON',
        detail: truncateDetail({ exitCode: code, stderr, stdout }),
      });
    });

    child.stdin.end(JSON.stringify({ imagePath, maxItems }));
  });
}

function normalizeHex(value) {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^#[0-9A-F]{6}$/.test(text) ? text : '#D8DEE6';
}

function normalizeEntry(entry, index) {
  const code = typeof entry?.code === 'string' ? entry.code.trim().toUpperCase().slice(0, 24) : '';
  const rawCount = Number(entry?.count);
  const count = Number.isInteger(rawCount) && rawCount >= 0 && rawCount <= 999_999 ? rawCount : null;
  const rawConfidence = Number(entry?.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0.65;
  const rawText = typeof entry?.rawText === 'string' ? entry.rawText.trim().slice(0, 240) : undefined;

  return {
    id: `legend-paddle-${index + 1}`,
    code,
    hex: normalizeHex(entry?.hex),
    count,
    confidence,
    source: 'paddleocr',
    ...(rawText ? { rawText } : {}),
  };
}

function normalizeEntries(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeEntry)
    .filter((entry) => entry.code || entry.count !== null)
    .slice(0, 80);
}

function responseStatusForWorkerCode(code) {
  if (code === 'PADDLEOCR_UNAVAILABLE' || code === 'PADDLEOCR_DISABLED') return 503;
  if (code === 'PPOCRV6_TOKEN_MISSING') return 503;
  if (code === 'PADDLEOCR_TIMEOUT') return 504;
  if (code === 'PADDLEOCR_BAD_INPUT') return 400;
  return 500;
}

function resolveOcrProvider() {
  const provider = String(process.env.PATTERN_IMPORT_OCR_PROVIDER || 'auto').trim().toLowerCase();
  if (['ppocrv6-api', 'paddle-worker', 'auto'].includes(provider)) return provider;
  return 'auto';
}

export function createPatternImportRouter({ rootDir }) {
  const router = express.Router();
  const enabled = parseBoolean(process.env.PATTERN_IMPORT_OCR_ENABLED, true);
  const maxImageBytes = parseInteger(process.env.PATTERN_IMPORT_OCR_MAX_IMAGE_BYTES, DEFAULT_MAX_IMAGE_BYTES, {
    min: 64 * 1024,
    max: 32 * 1024 * 1024,
  });
  const maxImagePixels = parseInteger(process.env.PATTERN_IMPORT_OCR_MAX_IMAGE_PIXELS, DEFAULT_MAX_IMAGE_PIXELS, {
    min: 100_000,
    max: 64_000_000,
  });
  const maxImageSide = parseInteger(process.env.PATTERN_IMPORT_OCR_MAX_IMAGE_SIDE, DEFAULT_MAX_IMAGE_SIDE, {
    min: 320,
    max: 6000,
  });
  const jsonLimit = process.env.PATTERN_IMPORT_OCR_JSON_LIMIT || DEFAULT_JSON_LIMIT;
  const ocrProvider = resolveOcrProvider();

  router.post('/legend-ocr', express.json({ limit: jsonLimit, strict: true }), async (req, res, next) => {
    let tempFilePath = '';

    try {
      if (!enabled) {
        return res.status(503).json({
          code: 'PADDLEOCR_DISABLED',
          message: 'PaddleOCR legend recognition is disabled',
          requestId: req.id,
        });
      }

      const dataImage = parseDataImage(req.body?.imageDataUrl);
      if (!dataImage) {
        return res.status(400).json({
          code: 'PADDLEOCR_BAD_INPUT',
          message: 'imageDataUrl must be a png, jpeg, or webp data URL',
          requestId: req.id,
        });
      }
      if (dataImage.buffer.length > maxImageBytes) {
        return res.status(413).json({
          code: 'PADDLEOCR_IMAGE_TOO_LARGE',
          message: 'Legend image is too large',
          requestId: req.id,
        });
      }

      const tempDir = path.join(os.tmpdir(), 'dodoudou-pattern-import');
      await mkdir(tempDir, { recursive: true });
      tempFilePath = path.join(tempDir, `legend-${Date.now()}-${randomUUID()}.png`);

      const normalizedImage = await sharp(dataImage.buffer, { limitInputPixels: maxImagePixels })
        .rotate()
        .resize({
          width: maxImageSide,
          height: maxImageSide,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      await writeFile(tempFilePath, normalizedImage);

      const maxItems = parseInteger(req.body?.maxItems, 80, { min: 1, max: 80 });
      const shouldUseApi = ocrProvider === 'ppocrv6-api' || (ocrProvider === 'auto' && getPpocrv6Token());
      let workerResult = shouldUseApi
        ? await runPpocrv6LegendOcr({ imagePath: tempFilePath, maxItems })
        : await runPaddleWorker({ rootDir, imagePath: tempFilePath, maxItems });

      if (!workerResult?.ok && shouldUseApi && ocrProvider === 'auto') {
        console.warn(JSON.stringify({
          requestId: req.id,
          event: 'pattern-import.legend-ocr.api-fallback',
          code: workerResult?.code || 'PPOCRV6_FAILED',
          message: workerResult?.message || 'PP-OCRv6 API recognition failed',
          detail: truncateDetail(workerResult?.detail),
        }));
        workerResult = await runPaddleWorker({ rootDir, imagePath: tempFilePath, maxItems });
      }

      if (!workerResult?.ok) {
        const status = responseStatusForWorkerCode(workerResult?.code);
        const detail = truncateDetail(workerResult?.detail);
        console.error(JSON.stringify({
          requestId: req.id,
          event: 'pattern-import.legend-ocr.worker-failed',
          status,
          code: workerResult?.code || 'PADDLEOCR_FAILED',
          message: workerResult?.message || 'PaddleOCR recognition failed',
          detail,
        }));
        return res.status(status).json({
          code: workerResult?.code || 'PADDLEOCR_FAILED',
          message: workerResult?.message || 'PaddleOCR recognition failed',
          ...(detail ? { detail } : {}),
          requestId: req.id,
        });
      }

      const entries = normalizeEntries(workerResult.entries);
      return res.json({
        engine: workerResult.engine || 'paddleocr',
        entries,
        keyValue: workerResult.keyValue && typeof workerResult.keyValue === 'object' ? workerResult.keyValue : undefined,
        ocrText: typeof workerResult.ocrText === 'string' ? workerResult.ocrText.slice(0, 20_000) : '',
        warnings: Array.isArray(workerResult.warnings)
          ? workerResult.warnings.filter((item) => typeof item === 'string').slice(0, 5)
          : [],
      });
    } catch (error) {
      next(error);
    } finally {
      if (tempFilePath) {
        await rm(tempFilePath, { force: true }).catch(() => undefined);
      }
    }
  });

  return router;
}
