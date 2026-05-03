/**
 * v0.8.0 Stage 2 — 3 页面渲染调用 guard + parity 补强
 *
 * 用途：
 *   - 防止有人误改回旧 renderBody / 漏 SELECT 新列。
 *     PRD §6.3 防线 1 要求"渲染层默认读新列" — 这条必须在测试里钉死。
 *   - parity 补强（compare 6 字段、accordion 嵌套）— 现有 render-parity.test.ts 已覆盖
 *     但漏掉的 case 在这里加。
 *
 * 思路：
 *   - .astro 页面的运行时测试要 Astro 环境，工程量大且脆。
 *     用静态 grep — 简单、稳、能精准捕获回退。
 *   - 3 页面：[id].astro / [school]/index.astro / scholars/[key]/index.astro
 *     必须满足：(a) import renderBodyWithFallback (b) SELECT 含 body_zh_json
 */

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderBody, renderBodyForSchool } from '~/lib/render-body';
import { renderStructuredBody } from '~/lib/render-body-structured';
import { parseBody } from '~/lib/body-parser';
import { parsedToStructured } from '~/lib/kp-body-helpers';

const PAGES = [
  'src/pages/[discipline]/kp/[id].astro',
  'src/pages/[discipline]/[school]/index.astro',
  'src/pages/[discipline]/scholars/[key]/index.astro',
] as const;

function readPage(rel: string): string {
  const abs = fileURLToPath(new URL(`../${rel}`, import.meta.url));
  return readFileSync(abs, 'utf-8');
}

describe('Stage 2 静态 guard：3 页面必须读新列 + 用 fallback 入口', () => {
  for (const page of PAGES) {
    describe(page, () => {
      const src = readPage(page);

      test('import renderBodyWithFallback', () => {
        expect(
          src,
          `${page} 必须 import renderBodyWithFallback（PRD §6.3 防线 1 要求渲染层走 fallback 入口）`,
        ).toMatch(/from ['"]~\/lib\/render-body-with-fallback['"]/);
      });

      test('SELECT 含 body_zh_json (新列)', () => {
        expect(
          src,
          `${page} 必须 SELECT body_zh_json — 否则 fallback 入口拿不到新列只能走旧 renderer`,
        ).toMatch(/body_zh_json/);
      });

      test('未直接 import 旧 renderBody 用作主渲染（除非 renderEvalModule）', () => {
        // 旧 renderBody / renderBodyForSchool 不应作为主渲染 — 应通过 fallback 包装
        // renderEvalModule 是另一回事（评价模块），允许直接 import
        const importLine = src.match(/from ['"]~\/lib\/render-body['"]/g);
        if (importLine) {
          // 如果 import 了 render-body，验证只用 renderEvalModule / type
          const usesRenderBodyDirect = /\brenderBody\b\s*\(/.test(src) || /\brenderBodyForSchool\b\s*\(/.test(src);
          expect(
            usesRenderBodyDirect,
            `${page} 不应直接调 renderBody/renderBodyForSchool 作为主渲染（应通过 renderBodyWithFallback）`,
          ).toBe(false);
        }
      });
    });
  }
});

describe('Stage 2 parity 补强 — 现有 render-parity.test.ts 没覆盖的 case', () => {
  const ACCENT = '#007AFF';

  function normalizeHtml(html: string): string {
    return html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
  }

  function pairFor(
    body: string,
    fmt: 'narrative' | 'flat-list' | 'accordion' | 'compare' | 'quad',
    variant: 'detail' | 'school' = 'detail',
  ) {
    const parsed = parseBody(body, fmt);
    const structured = parsedToStructured(parsed);
    const oldHtml =
      variant === 'school'
        ? renderBodyForSchool({ fmt, body, accentHex: ACCENT })
        : renderBody({ fmt, body, accentHex: ACCENT });
    const newHtml = renderStructuredBody({ body: structured, accentHex: ACCENT, variant });
    return { oldHtml, newHtml };
  }

  test('compare 6 字段全填 (detail) — 双方都含全部内容', () => {
    const body =
      '<compare>X 理论|经济人|认为人是经济人|新古典|马歇尔|详细描述段落 X||Y 理论|社会人|认为人是社会人|行为|梅奥|详细描述段落 Y</compare>';
    const { oldHtml, newHtml } = pairFor(body, 'compare', 'detail');
    for (const s of ['X 理论', '经济人', '马歇尔', '详细描述段落 Y']) {
      expect(oldHtml, `old missing ${s}`).toContain(s);
      expect(newHtml, `new missing ${s}`).toContain(s);
    }
  });

  test('accordion 嵌套括号 sub + 多 item', () => {
    const body =
      '导语<br>【4 种类型（变革对象维度）】<br>①item 1——d 1<br>②item 2——d 2<br>③item 3——d 3';
    const { oldHtml, newHtml } = pairFor(body, 'accordion');
    // 新旧应等价（normalize 后）
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });

  test('flat-list 单 item（边界：刚好满足 min 1）', () => {
    const body = '◆唯一项——描述';
    const { oldHtml, newHtml } = pairFor(body, 'flat-list');
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });

  test('narrative 含 HTML 实体保留', () => {
    const body = '段 1 含 &amp; 字符<br>段 2 含 <em>斜体</em>';
    const { oldHtml, newHtml } = pairFor(body, 'narrative');
    expect(normalizeHtml(newHtml)).toBe(normalizeHtml(oldHtml));
  });

  test('compare school variant 6 字段全填 — 卡片版', () => {
    const body =
      '<compare>X 理论|经济人|认为人是经济人|新古典|马歇尔|详细 X||Y 理论|社会人|认为人是社会人|行为|梅奥|详细 Y</compare>';
    const { oldHtml, newHtml } = pairFor(body, 'compare', 'school');
    expect(oldHtml).toContain('cmpc-grid');
    expect(newHtml).toContain('cmpc-grid');
    for (const s of ['马歇尔', '梅奥', '详细 Y']) {
      expect(newHtml).toContain(s);
    }
  });
});
