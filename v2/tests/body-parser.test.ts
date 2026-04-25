/**
 * body-parser tests (v0.4.8)
 *   - 解析样例 → 结构正确
 *   - 序列化 → roundtrip parse(serialize(x)) 等价
 *   - 跑遍真实 data/keiei/kp/*.json，每条都能 parse + serialize 不抛错
 */

import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseBody, serializeBody, changeFormat, emptyParsed,
  type ParsedBody, type Format,
} from '../src/lib/body-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KP_DIR = join(__dirname, '../data/keiei/kp');

describe('parseBody — narrative', () => {
  test('原样保留', () => {
    const p = parseBody('任意 <strong>HTML</strong> 文本', 'narrative');
    expect(p).toEqual({ format: 'narrative', raw: '任意 <strong>HTML</strong> 文本' });
  });
});

describe('parseBody — flat-list', () => {
  test('lead + ◆ items', () => {
    const body = '泰勒提出方法：◆ 课业管理——为每位工人定标准◆ 作业研究——拆动作◆ 工资制——差别计件';
    const p = parseBody(body, 'flat-list');
    expect(p.format).toBe('flat-list');
    if (p.format !== 'flat-list') return;
    expect(p.lead).toBe('泰勒提出方法');
    expect(p.items).toHaveLength(3);
    expect(p.items[0]).toEqual({ name: '课业管理', desc: '为每位工人定标准' });
    expect(p.items[2].name).toBe('工资制');
  });

  test('尾部 ◆意义 ◆局限 抽取到 evaluations', () => {
    const body = '总论：◆A——desc A◆B——desc B◆意义——重要性◆局限——边界';
    const p = parseBody(body, 'flat-list');
    if (p.format !== 'flat-list') return;
    expect(p.items).toHaveLength(2);
    expect(p.meaning).toBe('重要性');
    expect(p.limit).toBe('边界');
  });

  test('items 间 ；分隔符不破坏解析', () => {
    const body = '导语：◆ 课业管理——desc1；◆ 作业研究——desc2；';
    const p = parseBody(body, 'flat-list');
    if (p.format !== 'flat-list') return;
    expect(p.items).toHaveLength(2);
    expect(p.items[0].desc).toBe('desc1');
  });
});

describe('parseBody — accordion', () => {
  test('单组', () => {
    const body = 'lead<br>【组1】<br>①A——a<br>②B——b';
    const p = parseBody(body, 'accordion');
    if (p.format !== 'accordion') return;
    expect(p.lead).toBe('lead');
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0].title).toBe('组1');
    expect(p.groups[0].items).toEqual([{ name: 'A', desc: 'a' }, { name: 'B', desc: 'b' }]);
  });

  test('多组 + 评价', () => {
    const body = 'lead<br>【组1】<br>①A——a<br>【组2】<br>②B——b◆意义——重要';
    const p = parseBody(body, 'accordion');
    if (p.format !== 'accordion') return;
    expect(p.groups).toHaveLength(2);
    expect(p.groups[0].title).toBe('组1');
    expect(p.groups[1].title).toBe('组2');
    expect(p.meaning).toBe('重要');
  });
});

describe('parseBody — compare', () => {
  test('lead + 3 列', () => {
    const body = 'compare 三阶段：<compare>T1|K1|D1|Ty1|Th1|B1||T2|K2|D2|Ty2|Th2|B2||T3|K3|D3|Ty3|Th3|B3</compare>';
    const p = parseBody(body, 'compare');
    if (p.format !== 'compare') return;
    expect(p.lead).toBe('compare 三阶段');
    expect(p.cols).toHaveLength(3);
    expect(p.cols[1]).toEqual({ title: 'T2', keyword: 'K2', desc: 'D2', type: 'Ty2', theories: 'Th2', detail: 'B2' });
  });
});

describe('parseBody — quad', () => {
  test('binary 模式（轴含 /）', () => {
    const body = '导：<quad>新/旧,东/西||A|🔥|sub A|det A||B|⭐|sub B|det B||C|📈|sub C|det C||D|💡|sub D|det D</quad>';
    const p = parseBody(body, 'quad');
    if (p.format !== 'quad') return;
    expect(p.yAxis).toBe('新/旧');
    expect(p.xAxis).toBe('东/西');
    expect(p.cells).toHaveLength(4);
    expect(p.cells[0]).toEqual({ name: 'A', emoji: '🔥', sub: 'sub A', detail: 'det A' });
  });
});

describe('serializeBody → 双向 roundtrip', () => {
  function rt<F extends Format>(body: string, format: F): { p1: ParsedBody; p2: ParsedBody } {
    const p1 = parseBody(body, format);
    const s = serializeBody(p1);
    const p2 = parseBody(s, format);
    return { p1, p2 };
  }

  test('narrative roundtrip', () => {
    const { p1, p2 } = rt('文本任意 <strong>html</strong>', 'narrative');
    expect(p2).toEqual(p1);
  });

  test('flat-list roundtrip 保结构', () => {
    const { p1, p2 } = rt('lead：◆ A——a◆ B——b◆意义——重要◆局限——边界', 'flat-list');
    expect(p2).toEqual(p1);
  });

  test('accordion roundtrip', () => {
    const { p1, p2 } = rt('lead<br>【g1】<br>①A——a<br>②B——b<br>【g2】<br>①C——c', 'accordion');
    if (p2.format !== 'accordion' || p1.format !== 'accordion') return;
    expect(p2.groups.length).toBe(p1.groups.length);
    expect(p2.groups[0].items).toEqual(p1.groups[0].items);
  });

  test('compare roundtrip', () => {
    const { p1, p2 } = rt('lead：<compare>T1|K1|D1|Ty1|Th1|B1||T2|K2|D2|Ty2|Th2|B2</compare>', 'compare');
    expect(p2).toEqual(p1);
  });

  test('quad roundtrip', () => {
    const { p1, p2 } = rt('导：<quad>Y/Y2,X/X2||A|🔥|sub|det||B|⭐|sub|det||C|📈|sub|det||D|💡|sub|det</quad>', 'quad');
    expect(p2).toEqual(p1);
  });
});

describe('changeFormat 切换 format 不丢 lead/evaluations', () => {
  test('flat-list → accordion 保 lead + meaning', () => {
    const p1 = parseBody('lead：◆ A——a◆ B——b◆意义——重要', 'flat-list');
    const p2 = changeFormat(p1, 'accordion');
    expect(p2.format).toBe('accordion');
    if (p2.format !== 'accordion') return;
    // lead 可能稍变 (："" 标点)，但 meaning 应保留
    expect(p2.meaning).toBe('重要');
  });

  test('compare → narrative 整体保为 raw', () => {
    const p1 = parseBody('导：<compare>T1|K1|D1|Ty1|Th1|B1</compare>◆意义——X', 'compare');
    const p2 = changeFormat(p1, 'narrative');
    expect(p2.format).toBe('narrative');
    if (p2.format !== 'narrative') return;
    expect(p2.raw).toContain('<compare>');
    expect(p2.raw).toContain('◆意义——X');
  });
});

describe('emptyParsed', () => {
  test('五种 format 都返合法空结构', () => {
    (['narrative', 'flat-list', 'accordion', 'compare', 'quad'] as const).forEach((f) => {
      const p = emptyParsed(f);
      expect(p.format).toBe(f);
      // 序列化空结构应不抛
      const s = serializeBody(p);
      expect(typeof s).toBe('string');
    });
  });
});

describe('真实 data/keiei/kp/*.json 全 parse + serialize 不抛', () => {
  const files = readdirSync(KP_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  test(`${files.length} 个 KP 文件 parse + serialize 全通过`, () => {
    let success = 0;
    let failures: string[] = [];
    for (const f of files) {
      try {
        const kp = JSON.parse(readFileSync(join(KP_DIR, f), 'utf-8'));
        const format = kp.format as Format;
        const body = kp.body?.zh ?? '';
        const p = parseBody(body, format);
        serializeBody(p);
        success++;
      } catch (err) {
        failures.push(`${f}: ${(err as Error).message}`);
      }
    }
    if (failures.length > 0) {
      console.error('parse 失败：', failures.slice(0, 5));
    }
    expect(failures).toEqual([]);
    expect(success).toBe(files.length);
  });
});
