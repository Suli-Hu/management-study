import type { Config } from 'tailwindcss';

/**
 * v2 设计系统 — 从 v1 迁移过来的 design tokens
 * 修改这里 = 全站视觉跟着变（"design token 化"，L1 升级核心目的）
 *
 * 来源：v1 Main/CONTRIBUTING.md §0 + v1 实际 CSS 变量
 */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // === 文字色阶（5 级灰度，主要阅读层级） ===
        primary: '#1d1d1f',      // 标题、加粗关键词
        secondary: '#2c2c2e',    // 正文（默认阅读色）
        tertiary: '#48484a',     // 副标题、英文 sub
        quaternary: '#86868b',   // 时间戳、提示

        // === 背景 ===
        bg: {
          primary: '#ffffff',
          secondary: '#fafafa',
          tertiary: '#f5f5f7',
          warm: '#fdfaf6',       // 米色卡片背景
        },

        // === 学科 / 学派 accent 色（v1 group color） ===
        accent: {
          ob: '#34C759',         // 个体/群体（绿）— OB
          classic: '#FF9500',    // 古典/近代/组织环境（橙）— 组织论
          strategy: '#007AFF',   // 战略内/外/形成（蓝）— 战略
          warning: '#FF3B30',
        },

        // === 语义标签底色（义/限/例/应/用/喻 badge） ===
        badge: {
          meaning: '#fff4e0',
          limit: '#ffe5e5',
          example: '#e0f0ff',
          neutral: '#f0f0f3',
        },
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
