import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const LOG_FILE = path.join(config.logsPath, `results_${RUN_TIMESTAMP}.log`);

function timestamp(): string {
  return new Date().toISOString();
}

function writeLine(line: string): void {
  fs.mkdirSync(config.logsPath, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

export const logger = {
  info(msg: string): void {
    const line = `[${timestamp()}] INFO  ${msg}`;
    console.log(line);
    writeLine(line);
  },
  success(msg: string): void {
    const line = `[${timestamp()}] OK    ${msg}`;
    console.log(`\x1b[32m${line}\x1b[0m`);
    writeLine(line);
  },
  warn(msg: string): void {
    const line = `[${timestamp()}] WARN  ${msg}`;
    console.warn(`\x1b[33m${line}\x1b[0m`);
    writeLine(line);
  },
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : String(err ?? '');
    const line = `[${timestamp()}] ERROR ${msg}${detail ? ': ' + detail : ''}`;
    console.error(`\x1b[31m${line}\x1b[0m`);
    writeLine(line);
  },
};
