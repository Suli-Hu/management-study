import { describe, expect, test } from 'vitest';
import { formatTrustedProseHtml, inlineMdDoubleStarToStrong } from '../src/lib/format-trusted-prose-html';
import { renderNarrativeStructured, renderEvalModule } from '../src/lib/render-body-structured';

describe('inlineMdDoubleStarToStrong', () => {
  test('pairs ** become strong', () => {
    expect(inlineMdDoubleStarToStrong('a **b** c')).toBe('a <strong>b</strong> c');
  });

  test('multiple pairs', () => {
    expect(inlineMdDoubleStarToStrong('**x** and **y**')).toBe('<strong>x</strong> and <strong>y</strong>');
  });

  test('dangling opener preserved', () => {
    expect(inlineMdDoubleStarToStrong('a **b')).toBe('a **b');
  });

  test('no ** unchanged', () => {
    expect(inlineMdDoubleStarToStrong('plain')).toBe('plain');
  });

  test('empty inner still wraps', () => {
    expect(inlineMdDoubleStarToStrong('a****b')).toBe('a<strong></strong>b');
  });

  test('newline inside pair stays inside strong', () => {
    expect(inlineMdDoubleStarToStrong('**line1\nline2**')).toBe('<strong>line1\nline2</strong>');
  });
});

describe('formatTrustedProseHtml', () => {
  test('md then nlToBr', () => {
    expect(formatTrustedProseHtml('**a**\nb')).toBe('<strong>a</strong><br>b');
  });

  test('null/undefined', () => {
    expect(formatTrustedProseHtml(null)).toBe('');
    expect(formatTrustedProseHtml(undefined)).toBe('');
  });
});

describe('render integration', () => {
  test('narrative prose renders strong', () => {
    const html = renderNarrativeStructured({
      format: 'narrative',
      prose: '与 **k363 控制点** 不同。',
    });
    expect(html).toContain('<strong>k363 控制点</strong>');
    expect(html).toContain('narrative-p');
  });

  test('eval module uses formatTrustedProseHtml', () => {
    const html = renderEvalModule({
      meaning: '**贡献**一句',
      limit: '',
      example: '',
      response: '',
      application: '',
      analogy: '',
    });
    expect(html).toContain('<strong>贡献</strong>');
  });
});
