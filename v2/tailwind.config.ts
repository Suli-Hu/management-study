import type { Config } from 'tailwindcss';

/**
 * v2 设计系统 — 从 v1 迁移过来的 design tokens
 * 修改这里 = 全站视觉跟着变（"design token 化"，L1 升级核心目的）
 *
 * 来源：v1 Main/CONTRIBUTING.md §0 + v1 实际 CSS 变量
 */
export default {
  // v0.3.9: class-based dark mode（html.dark 切换；受用户 toggle + prefers-color-scheme 驱动）
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // 文字 + bg 走 CSS 变量（见 global.css :root / html.dark），accent/badge 保持固定 hex
        // === 文字色阶（5 级灰度） ===
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        tertiary: 'var(--color-text-tertiary)',
        quaternary: 'var(--color-text-quaternary)',

        // === 背景 ===
        bg: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
          warm: 'var(--color-bg-warm)',
        },

        // === 学科 / 学派 accent 色（亮暗模式均可用） ===
        accent: {
          ob: '#34C759',
          classic: '#FF9500',
          strategy: '#007AFF',
          warning: '#FF3B30',
        },

        // === 语义标签底色（义/限/例/应/用/喻 badge） ===
        badge: {
          meaning: 'var(--color-badge-meaning)',
          limit: 'var(--color-badge-limit)',
          example: 'var(--color-badge-example)',
          neutral: 'var(--color-badge-neutral)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--color-border)',
      },
      fontFamily: {
        // SF Pro 优先（macOS / iOS 原生），Noto Sans CJK fallback
        sans: [
          '-apple-system', 'BlinkMacSystemFont',
          '"SF Pro Text"', '"SF Pro Display"',
          '"PingFang SC"', '"Hiragino Sans"', '"Noto Sans CJK SC"',
          '"Microsoft YaHei"', 'sans-serif',
        ],
      },
      fontWeight: {
        regular: '400',
        semibold: '600',
        // light: 300 (不再用于正文)
      },
      fontSize: {
        // 阅读为先：基础 14px，比常规 web app 略小（信息密度优先）
        'xs': ['11px', '1.5'],
        'sm': ['12px', '1.5'],
        'body': ['13.5px', '1.7'],   // 默认正文
        'base': ['14px', '1.7'],
        'lg': ['16px', '1.6'],
        'xl': ['20px', '1.4'],
        '2xl': ['24px', '1.3'],
        '3xl': ['28px', '1.25'],
      },
      spacing: {
        // 4px 网格
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '8px',
        'lg': '10px',
        'xl': '12px',
        '2xl': '16px',
      },
      boxShadow: {
        'card': '0 1px 4px rgba(0,0,0,0.06)',
        'card-hover': '0 2px 8px rgba(0,0,0,0.08)',
        'kp': '0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)',
      },
      maxWidth: {
        'reading': '720px',     // 正文最大宽度（阅读舒适度）
        'panel': '900px',       // 单栏 KP 详情
      },
    },
  },
  plugins: [],
} satisfies Config;
