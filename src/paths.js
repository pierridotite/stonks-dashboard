// Where the dashboard reads its config and writes its cache.
//
// The cache used to live next to the source files, which does not work when
// the package is installed globally or run through npx (read-only or hidden
// directory). Everything user-specific now lives in ~/.stonks-dashboard.

import { existsSync, mkdirSync, copyFileSync, appendFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_CONFIG_FILE = path.join(PACKAGE_ROOT, 'config.json');

export const DATA_DIR = process.env.STONKS_HOME || path.join(os.homedir(), '.stonks-dashboard');
export const USER_CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
export const LOG_FILE = path.join(DATA_DIR, 'debug.log');

export function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Pick the config file to use, in order of precedence:
 *   1. --config <path> / -c <path> / --config=<path> on the command line
 *   2. ./config.json in the current working directory
 *   3. ~/.stonks-dashboard/config.json
 *   4. the config.json bundled with the package
 */
export function resolveConfigPath(argv = process.argv.slice(2), cwd = process.cwd()) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config' || arg === '-c') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a file path`);
      return { path: path.resolve(cwd, value), source: 'cli' };
    }
    if (arg.startsWith('--config=')) {
      return { path: path.resolve(cwd, arg.slice('--config='.length)), source: 'cli' };
    }
  }

  const local = path.join(cwd, 'config.json');
  if (existsSync(local)) return { path: local, source: 'cwd' };
  if (existsSync(USER_CONFIG_FILE)) return { path: USER_CONFIG_FILE, source: 'home' };
  return { path: DEFAULT_CONFIG_FILE, source: 'default' };
}

/** Copy the bundled config to ~/.stonks-dashboard/config.json (no overwrite). */
export function initUserConfig() {
  ensureDataDir();
  if (existsSync(USER_CONFIG_FILE)) return { path: USER_CONFIG_FILE, created: false };
  copyFileSync(DEFAULT_CONFIG_FILE, USER_CONFIG_FILE);
  return { path: USER_CONFIG_FILE, created: true };
}

/**
 * Debug logger. The TUI owns the terminal, so console output would corrupt
 * the screen; instead, set STONKS_DEBUG=1 to append messages to debug.log.
 */
const DEBUG = Boolean(process.env.STONKS_DEBUG);

export function log(...parts) {
  if (!DEBUG) return;
  try {
    ensureDataDir();
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${parts.join(' ')}\n`);
  } catch {
    // Logging must never break the dashboard.
  }
}
