import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('./src', import.meta.url));
const TESTS = fileURLToPath(new URL('./tests', import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'], // playwright 走 *.spec.ts，避免 vitest 误抓
    environment: 'node',
    testTimeout: 30000, // 加载 513 KP 一次 ~1s
    pool: 'forks',
  },
  resolve: {
    alias: [
      { find: 'astro:middleware', replacement: `${TESTS}/shims/astro-middleware.ts` },
      // 用 regex 精确匹配 `~/...` 前缀，避免误吞裸 `~`
      { find: /^~\/(.*)$/, replacement: `${SRC}/$1` },
    ],
  },
});
