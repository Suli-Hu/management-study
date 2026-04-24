import { describe, expect, test } from 'vitest';
import { renderBody, escapeHtml, escInline } from '../src/lib/render-body';

describe('renderBody — passthrough', () => {
  test('plain HTML passes through unchanged', () => {
    const out = renderBody('<strong>plain</strong> text');
    expect(out).toBe('<strong>plain</strong> text');
  });

  test('single <br> without numbered items → passthrough', () => {
    const out = renderBody('foo<br>bar');
    expect(out).toBe('foo<br>bar');
  });
});

describe('renderBody — numbered items', () => {
  test('① ② ③ items → body-card list (v1: lead is text before first <br>)', () => {
    const body = 'lead<br>①A——desc A<br>②B——desc B<br>③C——desc C';
    const out = renderBody(body, '#007AFF');
    expect(out).toContain('class="body-lead"');
    expect(out).toContain('class="body-items"');
    expect(out).toContain('class="body-card"');
    expect(out.match(/class="body-card"/g)?.length).toBe(3);
    expect(out).toContain('desc A');
    expect(out).toContain('desc C');
  });

  test('◆ items → coerced to ①②③', () => {
    const body = '总论：◆A——desc A◆B——desc B';
    const out = renderBody(body);
    expect(out).toContain('class="body-items"');
    // 2 cards
    expect(out.match(/class="body-card"/g)?.length).toBe(2);
  });

  test('label keywords (义/限) get short badge, name cleared', () => {
    const body = '总论：◆意义——此概念的意义◆局限——此概念的局限';
    const out = renderBody(body);
    // 应包含「义」和「限」短标签
    expect(out).toContain('>义<');
    expect(out).toContain('>限<');
    // 不应再包含长的「意义」/「局限」作为 name
    // (注意 desc 里可能还有「意义」字样)
  });
});

describe('renderBody — grouped (accordion)', () => {
  test('【group】headers create body-group with toggle onclick', () => {
    const body =
      'lead<br>【组1】<br>①A——a<br>②B——b<br>【组2】<br>③C——c';
    const out = renderBody(body);
    expect(out).toContain('class="body-group"');
    expect(out).toContain('class="body-group-title"');
    expect(out).toContain("onclick=\"this.parentElement.classList.toggle('open')\"");
    expect(out).toContain('>组1<');
    expect(out).toContain('>组2<');
  });
});

describe('renderBody — compare', () => {
  test('<compare> with 3 columns produces flip cards', () => {
    const body =
      'lead<compare>T1|K1|D1|Type1|Theory1|Back1||T2|K2|D2|Type2|Theory2|Back2||T3|K3|D3|Type3|Theory3|Back3</compare>';
    const out = renderBody(body);
    expect(out).toContain('class="compare-grid"');
    expect(out.match(/class="compare-col"/g)?.length).toBe(3);
    expect(out).toContain("onclick=\"this.classList.toggle('flipped')\"");
    expect(out).toContain('T1');
    expect(out).toContain('Back1');
    // theories 拆分成 span
    expect(out).toContain('<span>Theory1</span>');
  });

  test('<compare> with no back detail omits .compare-back', () => {
    const body = '<compare>T|K|D|Ty|Th|</compare>';
    const out = renderBody(body);
    expect(out).not.toContain('compare-back');
    expect(out).toContain('compare-col');
  });
});

describe('renderBody — quad', () => {
  test('binary <quad> (Y has /) → 4 cells + binary axes', () => {
    const body =
      '<quad>新/旧,东/西||A|🔥|SA|Detail A||B|⭐|SB|Detail B||C|📈|SC|Detail C||D|💡|SD|Detail D</quad>';
    const out = renderBody(body);
    expect(out).toContain('class="quad-wrap"');
    expect(out).toContain('class="quad-grid"');
    expect(out.match(/class="quad-cell"/g)?.length).toBe(4);
    // binary y-axis: 2 labels (new/old)
    expect(out).toContain('>新<');
    expect(out).toContain('>旧<');
    // emoji + name
    expect(out).toContain('🔥');
    expect(out).toContain('Detail A');
  });

  test('continuous <quad> (no /) → 3-point axes', () => {
    const body =
      '<quad>重要度,紧急度||A|🔴|urgent+important|Do now||B|🟡|important|Plan||C|🟢|urgent|Delegate||D|⚪|neither|Drop</quad>';
    const out = renderBody(body);
    expect(out).toContain('class="quad-y-axis-3"');
    expect(out).toContain('class="quad-x-axis-3"');
    // 连续模式有「高」「低」标签
    expect(out).toContain('>高<');
    expect(out).toContain('>低<');
  });
});

describe('renderBody — output is a string and doesnt crash on real KPs', () => {
  test('k562 style accordion body', () => {
    const body =
      '<strong>James G. March</strong>（1991）提出概念——探索 vs 深化。<br>【根本矛盾】<br>①<strong>Exploration</strong>——试错<br>②<strong>Exploitation</strong>——精炼<br>◆意义——理论枢纽<br>◆局限——实证难';
    const out = renderBody(body, '#FF9500');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(body.length); // should expand, not shrink
    expect(out).toContain('body-group');
  });
});

// ===== v0.3.3 A9 XSS 防护测试 =====

describe('escapeHtml — 基础 5 字符 encode', () => {
  test('转义 & < > " \'', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml(`say "hi" and 'bye'`)).toBe('say &quot;hi&quot; and &#39;bye&#39;');
  });
  test('null / undefined → 空字符串', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  test('& 先转，不会双重 escape 出错', () => {
    // 用户写 "&" → &amp;（浏览器渲染回 "&"）
    // 用户写 "&amp;" → &amp;amp;（浏览器渲染回 "&amp;"，刻意显示 entity）
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

describe('escInline — 白名单 inline tag', () => {
  test('<strong> <em> <br> 保留', () => {
    expect(escInline('<strong>bold</strong>')).toBe('<strong>bold</strong>');
    expect(escInline('<em>ital</em>')).toBe('<em>ital</em>');
    expect(escInline('a<br>b')).toBe('a<br>b');
    expect(escInline('a<br/>b')).toBe('a<br>b');
    expect(escInline('a<br />b')).toBe('a<br>b');
  });
  test('带属性的白名单 tag 也会被转义（只接受精确无属性形式）', () => {
    expect(escInline('<strong onclick="alert(1)">x</strong>'))
      .toBe('&lt;strong onclick=&quot;alert(1)&quot;&gt;x</strong>');
  });
  test('非白名单 tag 全部转义', () => {
    expect(escInline('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escInline('<img src=x onerror=alert(1)>'))
      .toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escInline('<iframe src=//evil></iframe>'))
      .toBe('&lt;iframe src=//evil&gt;&lt;/iframe&gt;');
  });
});

describe('renderBody — XSS 注入在各字段被中和', () => {
  test('passthrough 分支：<script> 直接 escape', () => {
    // 不匹配任何格式 → 原 return body → 现在 escInline(body)
    const out = renderBody('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  test('passthrough 保留 <strong>（现有测试补强）', () => {
    // ASCII quote 会被 escape → "plain" 里无 quote 无影响
    expect(renderBody('<strong>plain</strong> text')).toBe('<strong>plain</strong> text');
  });

  test('body-lead 里的 <script> 被中和', () => {
    const body = '<script>alert(1)</script>lead<br>①A——a<br>②B——b';
    const out = renderBody(body);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  test('body-card name / desc 里的 onerror 被中和', () => {
    const body = 'lead<br>①<img src=x onerror=alert(1)>——<img src=y onerror=alert(2)><br>②B——b';
    const out = renderBody(body);
    expect(out).not.toMatch(/<img[^>]*onerror/);
    expect(out).toContain('&lt;img');
    expect(out).toContain('onerror=alert(1)&gt;');
  });

  test('group 标题【...】里的 HTML 被中和', () => {
    const body = 'lead<br>【<script>x</script>】<br>①A——a<br>②B——b';
    const out = renderBody(body);
    expect(out).toContain('class="body-group-title"');
    expect(out).not.toMatch(/<script>x<\/script>/);
    expect(out).toContain('&lt;script&gt;');
  });

  test('compare 字段（title/keyword/desc/type/theories/detail）全部 escape', () => {
    const body =
      '<compare>' +
      '<script>t1</script>|<img onerror=a>|d1|ty1|th1|back1' +
      '||' +
      't2|k2|d2|ty2|th2|<script>back2</script>' +
      '</compare>';
    const out = renderBody(body);
    expect(out).not.toMatch(/<script>t1<\/script>/);
    expect(out).not.toMatch(/<img onerror/);
    expect(out).not.toMatch(/<script>back2<\/script>/);
    expect(out).toContain('&lt;script&gt;t1');
    expect(out).toContain('&lt;img onerror=a&gt;');
    expect(out).toContain('&lt;script&gt;back2');
  });

  test('quad 字段（emoji/name/sub/detail/axes）全部 escape', () => {
    const body =
      '<quad>' +
      '<script>yAx</script>/B,X/Y' +
      '||<script>n1</script>|<img onerror=x>|sub1|det1' +
      '||n2|e2|sub2|<script>d2</script>' +
      '||n3|e3|sub3|d3' +
      '||n4|e4|sub4|d4' +
      '</quad>';
    const out = renderBody(body);
    expect(out).not.toMatch(/<script>yAx/);
    expect(out).not.toMatch(/<script>n1/);
    expect(out).not.toMatch(/<img onerror/);
    expect(out).not.toMatch(/<script>d2/);
    expect(out).toContain('&lt;script&gt;');
  });

  test('compare theories 的 <span> 内容被 escape', () => {
    const body = '<compare>T|K|D|Ty|<script>th</script>,ok|Back</compare>';
    const out = renderBody(body);
    expect(out).toContain('<span>&lt;script&gt;th&lt;/script&gt;</span>');
    expect(out).toContain('<span>ok</span>');
  });

  test('renderBody 兼容性 — 所有现有真实 KP 用例的 <strong> <br> 应仍然保留', () => {
    const body =
      '<strong>James G. March</strong>（1991）<br>【根本矛盾】<br>①<strong>Exploration</strong>——试错<br>②<strong>Exploitation</strong>——精炼';
    const out = renderBody(body, '#FF9500');
    expect(out).toContain('<strong>James G. March</strong>');
    expect(out).toContain('<strong>Exploration</strong>');
    expect(out).toContain('<strong>Exploitation</strong>');
    expect(out).not.toContain('&lt;strong&gt;');
  });

  test('引号（"）被 escape —— 防属性断开注入', () => {
    // 假设字段值带引号尝试逃出属性
    const body = 'lead<br>①foo"bar——baz<br>②q——w';
    const out = renderBody(body);
    // escape 后的引号不应出现为裸 " 字符
    expect(out).toContain('foo&quot;bar');
  });
});
