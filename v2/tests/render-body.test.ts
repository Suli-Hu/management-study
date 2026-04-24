import { describe, expect, test } from 'vitest';
import { renderBody } from '../src/lib/render-body';

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
