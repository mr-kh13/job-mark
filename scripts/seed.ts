// Writes a backup file of sample jobs: `pnpm seed [count]`, then Import it in the sheet.
import { mkdirSync, writeFileSync } from 'node:fs';
import { seedBackup } from '../src/test-utils/seed-jobs.ts';

const DEFAULT_COUNT = 500;
const MAX_COUNT = 20_000;
const OUTPUT_DIR = 'seed';
const OUTPUT_FILE = `${OUTPUT_DIR}/jobs.json`;

const argument = process.argv[2];
const count = argument === undefined ? DEFAULT_COUNT : Number(argument);

if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
  console.error(
    `Usage: pnpm seed [count]  (a whole number from 1 to ${MAX_COUNT}, default ${DEFAULT_COUNT})`,
  );
  process.exit(1);
}

const text = seedBackup(count, new Date());
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_FILE, text);

console.log(`Wrote ${count} jobs to ${OUTPUT_FILE} (${(text.length / 1024).toFixed(0)} KB).`);
console.log('Open the sheet, click Import and choose that file.');
