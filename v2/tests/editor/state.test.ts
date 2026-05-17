/**
 * KP 编辑器 v0.8 — state.ts 单元测试
 *
 * 覆盖：
 *   - emptyKpBodyByFormat 5 format
 *   - extractLead / applyCarryLead 互逆
 *   - hasEvaluationContent
 *   - buildTitlePayload trim + omit empty
 *   - EditorStore.update / setBody / setFormat / setEvaluations / syncJaFormatToZh / markSaved
 */

import { describe, expect, test } from 'vitest';
import {
  EditorStore,
  emptyKpBodyByFormat,
  emptyEvaluationsLang,
  extractLead,
  applyCarryLead,
  hasEvaluationContent,
  buildTitlePayload,
  makeNewState,
  makeEditingState,
} from '~/lib/editor/state';

describe('emptyKpBodyByFormat', () => {
  test.each(['narrative', 'flat-list', 'accordion', 'compare', 'quad'] as const)(
    '%s 返合法 zod schema',
    (fmt) => {
      const body = emptyKpBodyByFormat(fmt);
      expect(body.format).toBe(fmt);
    },
  );

  test('flat-list 默认 1 个空 item（zod 至少 1 要求）', () => {
    const body = emptyKpBodyByFormat('flat-list');
    expect(body.format).toBe('flat-list');
    if (body.format !== 'flat-list') throw new Error('type narrowing');
    expect(body.items).toHaveLength(1);
  });

  test('quad 默认 4 个 cell', () => {
    const body = emptyKpBodyByFormat('quad');
    expect(body.format).toBe('quad');
    if (body.format !== 'quad') throw new Error('type narrowing');
    expect(body.cells).toHaveLength(4);
  });

  test('compare 默认 2 列（zod 至少 2 要求）', () => {
    const body = emptyKpBodyByFormat('compare');
    expect(body.format).toBe('compare');
    if (body.format !== 'compare') throw new Error('type narrowing');
    // v0.11.82: emptyKpBodyByFormat('compare') 仍生成 legacy cols shape
    expect(body.cols).toHaveLength(2);
  });

  test('accordion 默认 1 个 group', () => {
    const body = emptyKpBodyByFormat('accordion');
    expect(body.format).toBe('accordion');
    if (body.format !== 'accordion') throw new Error('type narrowing');
    expect(body.groups).toHaveLength(1);
  });
});

describe('extractLead / applyCarryLead', () => {
  test('narrative.prose ↔ lead 互转', () => {
    const narr = { format: 'narrative', prose: 'A prose paragraph' } as const;
    expect(extractLead(narr)).toBe('A prose paragraph');

    const flat = applyCarryLead({ format: 'flat-list', lead: '', items: [{ name: 'a', desc: 'b' }] }, 'A prose paragraph');
    expect(flat.format).toBe('flat-list');
    if (flat.format !== 'flat-list') throw new Error('narrow');
    expect(flat.lead).toBe('A prose paragraph');
  });

  test('flat-list.lead 反向 carry 到 narrative.prose', () => {
    const flat = {
      format: 'flat-list' as const,
      lead: 'Hello',
      items: [{ name: 'a', desc: 'b' }],
    };
    expect(extractLead(flat)).toBe('Hello');

    const narr = applyCarryLead(emptyKpBodyByFormat('narrative'), 'Hello');
    expect(narr.format).toBe('narrative');
    if (narr.format !== 'narrative') throw new Error('narrow');
    expect(narr.prose).toBe('Hello');
  });

  test('空 lead 不写入新 body（保持 default）', () => {
    const flat = applyCarryLead(emptyKpBodyByFormat('flat-list'), '');
    expect(flat.format).toBe('flat-list');
    if (flat.format !== 'flat-list') throw new Error('narrow');
    expect(flat.lead).toBe('');
  });

  test('5 format × 4 carry 路径全 round-trip', () => {
    const TARGETS = ['narrative', 'flat-list', 'accordion', 'compare', 'quad'] as const;
    for (const from of TARGETS) {
      for (const to of TARGETS) {
        if (from === to) continue;
        const fromBody =
          from === 'narrative'
            ? { format: 'narrative' as const, prose: `lead-${from}-${to}` }
            : { ...emptyKpBodyByFormat(from), lead: `lead-${from}-${to}` };
        const lead = extractLead(fromBody);
        const newBody = applyCarryLead(emptyKpBodyByFormat(to), lead);
        expect(extractLead(newBody)).toBe(`lead-${from}-${to}`);
      }
    }
  });
});

describe('hasEvaluationContent', () => {
  test('null → false', () => {
    expect(hasEvaluationContent(null)).toBe(false);
  });
  test('全空 → false', () => {
    expect(hasEvaluationContent(emptyEvaluationsLang())).toBe(false);
  });
  test('任一字段非空 → true', () => {
    const e = emptyEvaluationsLang();
    e.meaning = 'X';
    expect(hasEvaluationContent(e)).toBe(true);
  });
});

describe('buildTitlePayload', () => {
  test('trim zh + omit empty ja/en', () => {
    expect(buildTitlePayload({ zh: '  hello  ', ja: '', en: '' })).toEqual({ zh: 'hello' });
  });
  test('保留 ja/en 非空（trim 后）', () => {
    expect(buildTitlePayload({ zh: 'A', ja: ' B ', en: 'C' })).toEqual({ zh: 'A', ja: 'B', en: 'C' });
  });
});

describe('EditorStore', () => {
  test('update markDirty 默认 true', () => {
    const s = makeNewState('keiei');
    expect(s.isDirty).toBe(false);
    const store = new EditorStore(s);
    store.update({ year: '1979' });
    expect(store.get().isDirty).toBe(true);
    expect(store.get().year).toBe('1979');
  });

  test('update markDirty=false 保持 isDirty', () => {
    const store = new EditorStore(makeNewState('keiei'));
    store.update({ activeLang: 'ja' }, false);
    expect(store.get().isDirty).toBe(false);
  });

  test('subscribe + unsubscribe', () => {
    const store = new EditorStore(makeNewState('keiei'));
    const fn = (s: typeof store extends EditorStore ? ReturnType<typeof store.get> : never) => calls.push(s.year);
    const calls: string[] = [];
    const unsub = store.subscribe(fn as never);
    store.update({ year: '1979' });
    expect(calls).toEqual(['1979']);
    unsub();
    store.update({ year: '1980' });
    expect(calls).toEqual(['1979']);
  });

  test('setBody zh / ja 独立', () => {
    const store = new EditorStore(makeNewState('keiei'));
    const fl = emptyKpBodyByFormat('flat-list');
    store.setBody('zh', fl);
    expect(store.get().body.zh).toBe(fl);
    expect(store.get().body.ja).toBeNull();
  });

  test('setFormat 重置 zh + (if ja exists) 重置 ja，carryLead 灌新', () => {
    const init = makeNewState('keiei');
    init.body.zh = { format: 'narrative', prose: 'OLD PROSE' };
    init.body.ja = { format: 'narrative', prose: 'OLD JA PROSE' };
    const store = new EditorStore(init);
    store.setFormat('flat-list', 'OLD PROSE');
    const next = store.get();
    expect(next.body.zh.format).toBe('flat-list');
    if (next.body.zh.format !== 'flat-list') throw new Error('narrow');
    expect(next.body.zh.lead).toBe('OLD PROSE');
    expect(next.body.zh.items).toHaveLength(1); // empty default
    expect(next.body.ja).toBeTruthy();
    expect(next.body.ja!.format).toBe('flat-list');
    if (next.body.ja!.format !== 'flat-list') throw new Error('narrow');
    expect(next.body.ja!.lead).toBe('OLD PROSE'); // 用 zh 的 carryLead，不抽 ja 自己的 lead
  });

  test('setFormat 仅 zh（ja 为 null）— ja 保持 null', () => {
    const store = new EditorStore(makeNewState('keiei'));
    store.setFormat('quad', '');
    expect(store.get().body.zh.format).toBe('quad');
    expect(store.get().body.ja).toBeNull();
  });

  test('syncJaFormatToZh — ja format 改成跟 zh，carry ja 自身 lead', () => {
    const init = makeNewState('keiei');
    init.body.zh = { format: 'narrative', prose: 'ZH PROSE' };
    init.body.ja = { format: 'flat-list', lead: 'JA LEAD', items: [{ name: 'a', desc: 'b' }] };
    const store = new EditorStore(init);
    store.syncJaFormatToZh();
    const next = store.get();
    expect(next.body.zh.format).toBe('narrative'); // zh 不动
    expect(next.body.ja!.format).toBe('narrative');
    if (next.body.ja!.format !== 'narrative') throw new Error('narrow');
    expect(next.body.ja!.prose).toBe('JA LEAD'); // ja 自己的 lead carry 进 prose
  });

  test('syncJaFormatToZh 当 ja 为 null → noop', () => {
    const store = new EditorStore(makeNewState('keiei'));
    store.syncJaFormatToZh();
    expect(store.get().body.ja).toBeNull();
  });

  test('syncJaFormatToZh 当已一致 → noop', () => {
    const init = makeNewState('keiei');
    init.body.ja = emptyKpBodyByFormat('narrative');
    const store = new EditorStore(init);
    const before = store.get().body.ja;
    store.syncJaFormatToZh();
    expect(store.get().body.ja).toBe(before); // 同 reference（不重建）
  });

  test('updateAxisField — quad active lang yAxis.low / xAxis.label / xAxis.high', () => {
    const init = makeNewState('keiei');
    init.body.zh = emptyKpBodyByFormat('quad');
    const store = new EditorStore(init);

    store.updateAxisField('yAxis', 'low', '低');
    store.updateAxisField('yAxis', 'high', '高');
    store.updateAxisField('xAxis', 'label', '增长率');

    const body = store.get().body.zh;
    if (body.format !== 'quad') throw new Error('narrow');
    expect(body.yAxis).toEqual({ low: '低', label: '', high: '高' });
    expect(body.xAxis).toEqual({ low: '', label: '增长率', high: '' });
  });

  test('updateAxisField — 非 quad format → no-op', () => {
    const store = new EditorStore(makeNewState('keiei'));
    store.updateAxisField('yAxis', 'low', '低');
    // body.zh 仍是 narrative 默认，没崩
    expect(store.get().body.zh.format).toBe('narrative');
  });

  test('updateAxisField — active lang = ja，仅改 ja，不动 zh', () => {
    const init = makeNewState('keiei');
    init.body.zh = emptyKpBodyByFormat('quad');
    init.body.ja = emptyKpBodyByFormat('quad');
    init.activeLang = 'ja';
    const store = new EditorStore(init);

    store.updateAxisField('yAxis', 'high', 'Y_JA_HIGH');
    const zh = store.get().body.zh;
    const ja = store.get().body.ja!;
    if (zh.format !== 'quad' || ja.format !== 'quad') throw new Error('narrow');
    expect(ja.yAxis.high).toBe('Y_JA_HIGH');
    expect(zh.yAxis.high).toBe('');
  });

  test('setEvaluations zh / ja 独立', () => {
    const store = new EditorStore(makeNewState('keiei'));
    const e = emptyEvaluationsLang();
    e.meaning = '意';
    store.setEvaluations('zh', e);
    expect(store.get().evaluations.zh).toBe(e);
    expect(store.get().evaluations.ja).toBeNull();
  });

  test('markSaved 清 dirty + 设 saved 状态 + 可选 setId', () => {
    const store = new EditorStore(makeNewState('keiei'));
    store.update({ year: '1979' }); // dirty
    expect(store.get().isDirty).toBe(true);
    store.markSaved('k123');
    expect(store.get().isDirty).toBe(false);
    expect(store.get().saveStatus).toBe('saved');
    expect(store.get().id).toBe('k123');
  });

  test('setSaveStatus error 携带 detail', () => {
    const store = new EditorStore(makeNewState('keiei'));
    store.setSaveStatus('error', { reason: 'body_structure_invalid', message: '...' });
    expect(store.get().saveStatus).toBe('error');
    expect(store.get().errorDetail?.reason).toBe('body_structure_invalid');
  });
});

describe('makeEditingState', () => {
  test('从 ExistingKpInit 完整接管', () => {
    const init = {
      id: 'k123',
      discipline: 'keiei',
      title: { zh: 'A', ja: 'B', en: 'C' },
      body: {
        zh: { format: 'narrative' as const, prose: 'X' },
        ja: { format: 'narrative' as const, prose: 'Y' },
      },
      evaluations: { zh: emptyEvaluationsLang() },
      schools: ['s1', 's2'],
      scholars: ['sc1'],
      tags: [],
      year: '1979',
    };
    const state = makeEditingState(init);
    expect(state.id).toBe('k123');
    expect(state.title.zh).toBe('A');
    expect(state.title.en).toBe('C');
    expect(state.body.ja).toBeTruthy();
    expect(state.evaluations.zh).toBeTruthy();
    expect(state.evaluations.ja).toBeNull();
    expect(state.schools).toEqual(['s1', 's2']);
    expect(state.activeLang).toBe('zh');
    expect(state.isDirty).toBe(false);
  });

  test('缺 ja / 缺 evaluations 时安全 default', () => {
    const init = {
      id: 'k123',
      discipline: 'keiei',
      title: { zh: 'A' },
      body: { zh: { format: 'narrative' as const, prose: 'X' } },
      schools: ['s1'],
      scholars: [],
      tags: [],
      year: '',
    };
    const state = makeEditingState(init);
    expect(state.title.ja).toBe('');
    expect(state.title.en).toBe('');
    expect(state.body.ja).toBeNull();
    expect(state.evaluations.zh).toBeNull();
  });
});
