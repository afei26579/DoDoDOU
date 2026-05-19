import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function parseEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const values = {};

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;

      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[match[1]] = value;
    }

    return values;
  } catch {
    return {};
  }
}

function getLanAddress() {
  const override = mergedEnv.GALLERY_DEV_LAN_HOST?.trim();
  if (override) return override;

  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }

  return '127.0.0.1';
}

function appendOrigin(value, origin) {
  const origins = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!origins.includes(origin)) origins.push(origin);
  return origins.join(',');
}

function makeChildEnv() {
  const env = { ...mergedEnv };
  const lanEnabled = parseBoolean(env.GALLERY_DEV_LAN_ENABLED, false);

  if (!lanEnabled) return env;

  const frontendPort = env.VITE_DEV_SERVER_PORT || '5173';
  const backendPort = env.GALLERY_SERVER_PORT || '3001';
  const lanAddress = getLanAddress();
  const lanFrontendOrigin = `http://${lanAddress}:${frontendPort}`;
  const lanApiBaseUrl = `http://${lanAddress}:${backendPort}`;

  env.GALLERY_SERVER_HOST = '0.0.0.0';
  env.GALLERY_ALLOWED_ORIGINS = appendOrigin(
    env.GALLERY_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173',
    lanFrontendOrigin,
  );
  env.VITE_API_BASE_URL = lanApiBaseUrl;

  console.log(`LAN dev enabled: frontend ${lanFrontendOrigin}`);
  console.log(`LAN dev enabled: API ${lanApiBaseUrl}`);

  return env;
}

const fileEnv = {
  ...parseEnvFile(path.join(rootDir, '.env')),
  ...parseEnvFile(path.join(rootDir, '.env.local')),
};
const mergedEnv = { ...fileEnv, ...process.env };
const childEnv = makeChildEnv();

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: childEnv,
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
}

const backend = start('npm', ['run', 'gallery:server'], 'backend');
const frontend = start('npm', ['run', 'dev'], 'frontend');

function shutdown(signal) {
  backend.kill(signal);
  frontend.kill(signal);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
