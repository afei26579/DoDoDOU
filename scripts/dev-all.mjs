import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: process.env,
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
