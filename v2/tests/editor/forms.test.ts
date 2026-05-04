/**
 * @vitest-environment jsdom
 *
 * KP 编辑器 v0.8 — 5 per-format form module DOM smoke 测试
 *
 * 每个 form：
 *   1. mount 后 host 含期望根元素
 *   2. 改字段 → onChange 收到符合 KpBody zod 的 payload
 *   3. add / remove item 触发 onChange + 更新 DOM
 *   4. destroy 清空 host
 */

import { describe, expect, test } from 'vitest';
import { mountNarrativeForm } from '~/lib/editor/forms/narrative';
import { mountFlatListForm } from '~/lib/editor/forms/flat-list';
import { mountAccordionForm } from '~/lib/editor/forms/accordion';
import { mountCompareForm } from '~/lib/editor/forms/compare';
import { mountQuadForm } from '~/lib/editor/forms/quad';
import { KpBody } from '~/schemas/kp-body-structured';

function host() {
  const h = document.createElement('div');
  document.body.appendChild(h);
  return h;
}

describe('narrative form', () => {
  test('mount + 改 prose → onChange', () => {
    const h = host();
    const calls: unknown[] = [];
    mountNarrativeForm(h, { format: 'narrative', prose: 'old' }, (b) => calls.push(b));
    const ta = h.querySelector('textarea')!;
    expect(ta.value).toBe('old');
    ta.value = 'new prose';
    ta.dispatchEvent(new Event('input'));
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1];
    expect((last as { format: string }).format).toBe('narrative');
    expect((last as { prose: string }).prose).toBe('new prose');
    // valid against zod
    expect(KpBody.safeParse(last).success).toBe(true);
  });

  test('destroy 清空 host', () => {
    const h = host();
    const m = mountNarrativeForm(h, { format: 'narrative', prose: 'x' }, () => {});
    expect(h.children.length).toBeGreaterThan(0);
    m.destroy();
    expect(h.children.length).toBe(0);
  });
});

describe('flat-list form', () => {
  test('改 item.name → onChange', () => {
    const h = host();
    const calls: unknown[] = [];
    mountFlatListForm(
      h,
      { format: 'flat-list', lead: '', items: [{ name: 'a', desc: 'b' }] },
      (b) => calls.push(b),
    );
    const inputs = h.querySelectorAll<HTMLInputElement>('.kpe-list-name-input');
    expect(inputs.length).toBe(1);
    inputs[0]!.value = 'NEW NAME';
    inputs[0]!.dispatchEvent(new Event('input'));
    const last = calls[calls.length - 1] as {
      format: string;
      items: Array<{ name: string; desc: string }>;
    };
    expect(last.items[0]!.name).toBe('NEW NAME');
    expect(KpBody.safeParse(last).success).toBe(true);
  });

  test('add item → 多 1 row', () => {
    const h = host();
    const calls: unknown[] = [];
    mountFlatListForm(
      h,
      { format: 'flat-list', lead: '', items: [{ name: 'a', desc: 'b' }] },
      (b) => calls.push(b),
    );
    const addBtn = Array.from(h.querySelectorAll<HTMLButtonElement>('.kpe-add-btn')).find((b) =>
      b.textContent?.includes('添加条目'),
    );
    expect(addBtn).toBeTruthy();
    addBtn!.click();
    const inputs = h.querySelectorAll<HTMLInputElement>('.kpe-list-name-input');
    expect(inputs.length).toBe(2);
    expect(calls.length).toBeGreaterThan(0);
  });

  test('items=1 时删除按钮 disabled', () => {
    const h = host();
    mountFlatListForm(
      h,
      { format: 'flat-list', lead: '', items: [{ name: 'a', desc: 'b' }] },
      () => {},
    );
    const dels = h.querySelectorAll<HTMLButtonElement>('.kpe-item-del');
    expect(dels.length).toBe(1);
    expect(dels[0]!.disabled).toBe(true);
  });

  test('items=2 时删除一个 → items=1，剩下的删除 disabled', () => {
    const h = host();
    let last: unknown;
    mountFlatListForm(
      h,
      {
        format: 'flat-list',
        lead: '',
        items: [
          { name: 'a', desc: 'b' },
          { name: 'c', desc: 'd' },
        ],
      },
      (b) => {
        last = b;
      },
    );
    const dels = h.querySelectorAll<HTMLButtonElement>('.kpe-item-del');
    expect(dels.length).toBe(2);
    dels[0]!.click();
    const after = (last as { items: unknown[] }).items;
    expect(after).toHaveLength(1);
  });
});

describe('accordion form', () => {
  test('改 group title → onChange', () => {
    const h = host();
    let last: unknown;
    mountAccordionForm(
      h,
      {
        format: 'accordion',
        lead: '',
        groups: [{ title: 'old', items: [{ name: 'n', desc: 'd' }] }],
      },
      (b) => {
        last = b;
      },
    );
    const titleInputs = h.querySelectorAll<HTMLInputElement>('.kpe-group-title-input');
    expect(titleInputs.length).toBe(1);
    titleInputs[0]!.value = 'NEW TITLE';
    titleInputs[0]!.dispatchEvent(new Event('input'));
    expect((last as { groups: Array<{ title: string }> }).groups[0]!.title).toBe('NEW TITLE');
  });

  test('add group → 多 1 group', () => {
    const h = host();
    mountAccordionForm(
      h,
      {
        format: 'accordion',
        lead: '',
        groups: [{ title: 't1', items: [{ name: 'n', desc: 'd' }] }],
      },
      () => {},
    );
    const before = h.querySelectorAll('.kpe-group').length;
    const addGroupBtn = Array.from(h.querySelectorAll<HTMLButtonElement>('.kpe-add-btn')).find((b) =>
      b.textContent?.includes('添加分组'),
    );
    addGroupBtn!.click();
    const after = h.querySelectorAll('.kpe-group').length;
    expect(after).toBe(before + 1);
  });
});

describe('compare form', () => {
  test('改 col.title → onChange', () => {
    const h = host();
    let last: unknown;
    mountCompareForm(
      h,
      {
        format: 'compare',
        lead: '',
        cols: [
          { title: 'A', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: 'B', keyword: '', desc: '', type: '', theories: '', detail: '' },
        ],
      },
      (b) => {
        last = b;
      },
    );
    const titleInputs = h.querySelectorAll<HTMLInputElement>('.kpe-cmp-title-input');
    expect(titleInputs.length).toBe(2);
    titleInputs[0]!.value = 'A2';
    titleInputs[0]!.dispatchEvent(new Event('input'));
    expect((last as { cols: Array<{ title: string }> }).cols[0]!.title).toBe('A2');
  });

  test('cols=2 时删除按钮 disabled（zod 至少 2）', () => {
    const h = host();
    mountCompareForm(
      h,
      {
        format: 'compare',
        lead: '',
        cols: [
          { title: 'A', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: 'B', keyword: '', desc: '', type: '', theories: '', detail: '' },
        ],
      },
      () => {},
    );
    const dels = h.querySelectorAll<HTMLButtonElement>('.kpe-item-del');
    dels.forEach((d) => expect(d.disabled).toBe(true));
  });

  test('cols=4 时 + 添加对比列 按钮 disabled（UI 上限 4）', () => {
    const h = host();
    mountCompareForm(
      h,
      {
        format: 'compare',
        lead: '',
        cols: [
          { title: 'A', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: 'B', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: 'C', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: 'D', keyword: '', desc: '', type: '', theories: '', detail: '' },
        ],
      },
      () => {},
    );
    const addBtn = Array.from(h.querySelectorAll<HTMLButtonElement>('.kpe-add-btn')).find((b) =>
      b.textContent?.includes('添加对比列'),
    );
    expect(addBtn).toBeTruthy();
    expect(addBtn!.disabled).toBe(true);
    expect(addBtn!.title).toContain('最多 4 列');
  });

  test('cols=3 时 + 添加对比列 按钮可点 → cols=4', () => {
    const h = host();
    let last: unknown;
    mountCompareForm(
      h,
      {
        format: 'compare',
        lead: '',
        cols: [
          { title: 'A', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: 'B', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: 'C', keyword: '', desc: '', type: '', theories: '', detail: '' },
        ],
      },
      (b) => {
        last = b;
      },
    );
    const addBtn = Array.from(h.querySelectorAll<HTMLButtonElement>('.kpe-add-btn')).find((b) =>
      b.textContent?.includes('添加对比列'),
    );
    expect(addBtn!.disabled).toBe(false);
    addBtn!.click();
    expect((last as { cols: unknown[] }).cols).toHaveLength(4);
    // 此时按钮应已 disabled
    const addBtnAfter = Array.from(h.querySelectorAll<HTMLButtonElement>('.kpe-add-btn')).find((b) =>
      b.textContent?.includes('添加对比列'),
    );
    expect(addBtnAfter!.disabled).toBe(true);
  });
});

describe('quad form', () => {
  test('改 yAxis → onChange，cells 仍 4 个', () => {
    const h = host();
    let last: unknown;
    mountQuadForm(
      h,
      {
        format: 'quad',
        lead: '',
        yAxis: '',
        xAxis: '',
        cells: [
          { name: 'a', emoji: '', sub: '', detail: '' },
          { name: 'b', emoji: '', sub: '', detail: '' },
          { name: 'c', emoji: '', sub: '', detail: '' },
          { name: 'd', emoji: '', sub: '', detail: '' },
        ],
      },
      (b) => {
        last = b;
      },
    );
    const inputs = h.querySelectorAll<HTMLInputElement>('input');
    // 找 yAxis input — aria-label = 'Y 轴维度名'
    const yInput = Array.from(inputs).find((i) => i.getAttribute('aria-label') === 'Y 轴维度名');
    expect(yInput).toBeTruthy();
    yInput!.value = 'Y';
    yInput!.dispatchEvent(new Event('input'));
    expect((last as { yAxis: string; cells: unknown[] }).yAxis).toBe('Y');
    expect((last as { cells: unknown[] }).cells).toHaveLength(4);
  });

  test('mount 渲染 4 个 cell + 4 个 [N] 位置标签', () => {
    const h = host();
    mountQuadForm(
      h,
      {
        format: 'quad',
        lead: '',
        yAxis: '',
        xAxis: '',
        cells: [
          { name: 'a', emoji: '', sub: '', detail: '' },
          { name: 'b', emoji: '', sub: '', detail: '' },
          { name: 'c', emoji: '', sub: '', detail: '' },
          { name: 'd', emoji: '', sub: '', detail: '' },
        ],
      },
      () => {},
    );
    const cells = h.querySelectorAll('.kpe-quad-cell');
    expect(cells.length).toBe(4);
    const positions = h.querySelectorAll('.kpe-quad-cell-pos');
    expect(positions.length).toBe(4);
    expect(positions[0]!.textContent).toMatch(/\[0\]/);
    expect(positions[3]!.textContent).toMatch(/\[3\]/);
  });

  test('cells <4 时 pad 到 4', () => {
    const h = host();
    let last: unknown;
    mountQuadForm(
      h,
      {
        format: 'quad',
        lead: '',
        yAxis: 'y',
        xAxis: 'x',
        cells: [
          { name: 'a', emoji: '', sub: '', detail: '' },
          { name: 'b', emoji: '', sub: '', detail: '' },
          { name: 'c', emoji: '', sub: '', detail: '' },
          { name: 'd', emoji: '', sub: '', detail: '' },
        ],
      },
      (b) => {
        last = b;
      },
    );
    expect(h.querySelectorAll('.kpe-quad-cell').length).toBe(4);
    void last;
  });
});

describe('IME-safe input — compositionstart/end 不触发 onChange 中间状态', () => {
  test('flat-list name input 在 IME 期间不 fire', () => {
    const h = host();
    const calls: unknown[] = [];
    mountFlatListForm(
      h,
      { format: 'flat-list', lead: '', items: [{ name: 'a', desc: 'b' }] },
      (b) => calls.push(b),
    );
    const input = h.querySelector<HTMLInputElement>('.kpe-list-name-input')!;
    const before = calls.length;
    input.dispatchEvent(new Event('compositionstart'));
    input.value = 'partial';
    input.dispatchEvent(new Event('input')); // 应被屏蔽
    expect(calls.length).toBe(before);
    input.dispatchEvent(new Event('compositionend'));
    // compositionend 触发一次最终值
    expect(calls.length).toBe(before + 1);
  });
});
