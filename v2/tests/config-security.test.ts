import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('Astro security config', () => {
  test('uses custom CSRF middleware instead of the built-in Origin gate', () => {
    const configSource = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');

    expect(configSource).toContain('checkOrigin: false');
  });
});
