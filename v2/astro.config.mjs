// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  // 'server' = 默认 SSR（页面运行时渲染，可访问 D1）
  // 后续个别静态页面可用 `export const prerender = true` 转 SSG
  output: 'server',
  devToolbar: {
    enabled: !process.env.CI,
  },
  adapter: cloudflare({
    platformProxy: {
      // 让 `astro dev` 本地开发也能连 wrangler.toml 里声明的 D1 binding
      enabled: true,
    },
  }),
  integrations: [
    tailwind({
      // 我们手动 import css，更可控
      applyBaseStyles: false,
    }),
  ],
  vite: {
    resolve: {
      // CF Workers 运行时不打包 node 内置模块，但 dev 时需要
      alias: import.meta.env.PROD ? { 'react-dom/server': 'react-dom/server.edge' } : {},
    },
  },
});
