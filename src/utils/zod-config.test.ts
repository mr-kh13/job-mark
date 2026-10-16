import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import './zod-config';

describe('zod-config', () => {
  it('turns off the code zod would build from strings', () => {
    expect(z.config().jitless).toBe(true);
  });

  // Zod reads the setting when it builds a schema, so the config has to run before any schema.
  it.each([
    'src/entrypoints/background/index.ts',
    'src/entrypoints/popup/main.tsx',
    'src/entrypoints/sheet/main.tsx',
  ])('is the first import of %s', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf-8');

    expect(source.match(/^import .*$/m)?.[0]).toBe("import '@/utils/zod-config';");
  });
});
