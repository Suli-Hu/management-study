import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000, // 加载 513 KP 一次 ~1s
    pool: 'forks',
  },
  resolve: {
    alias: [
      // 用 regex 精确匹配 `~/...` 前缀，避免误吞裸 `~`
      { find: /^~\/(.*)$/, replacement: `${SRC}/$1` },
    ],
  },
});
