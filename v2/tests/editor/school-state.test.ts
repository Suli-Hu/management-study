/**
 * School editor v0.8 — state.ts 单元测试
 *
 * 覆盖：makeNew/Editing factory + Store update / setSaveStatus / markSaved
 *      + buildI18nTitle / buildSummary trim + omit empty
 */

import { describe, expect, test } from 'vitest';
import {
  SchoolEditorStore,
  makeNewSchoolState,
  makeEditingSchoolState,
  buildI18nTitle,
  buildSummary,
} from '~/lib/editor/school-state';

describe('makeNewSchoolState', () => {
  test('返干净 state — key=null + isDirty=false + saveStatus=idle', () => {
    const s = makeNewSchoolState('keiei');
    expect(s.key).toBeNull();
    expect(s.discipline).toBe('keiei');
    expect(s.isDirty).toBe(false);
    expect(s.saveStatus).toBe('idle');
    expect(s.title.zh).toBe('');
    expect(s.tags).toEqual([]);
    expect(s.themeKey).toBe('');
  });

  test('presetThemeKey 注入 themeKey', () => {
    const s = makeNewSchoolState('keiei', 'org_change');
    expect(s.themeKey).toBe('org_change');
  });
});

describe('makeEditingSchoolState', () => {
  test('从 init shape 还原 state（含 ja/en 可空字段）', () => {
    const s = makeEditingSchoolState({
      key: 'lewin_school',
      discipline: 'keiei',
      title: { zh: 'XXX' },
      era: '1947–',
      summary: { zh: '概述...' },
      themeKey: 'org_change',
      tags: ['mgmt'],
    });
    expect(s.key).toBe('lewin_school');
    expect(s.title.ja).toBe('');
    expect(s.title.en).toBe('');
    expect(s.summary.ja).toBe('');
    expect(s.tags).toEqual(['mgmt']);
    expect(s.isDirty).toBe(false);
  });
});

describe('SchoolEditorStore', () => {
  test('update 改 patch + 默认 mark dirty + 触发 listener', () => {
    const store = new SchoolEditorStore(makeNewSchoolState('keiei'));
    let calls = 0;
    store.subscribe(() => calls++);
    store.update({ themeKey: 'org_change' });
    expect(calls).toBe(1);
    expect(store.get().themeKey).toBe('org_change');
    expect(store.get().isDirty).toBe(true);
  });

  test('setSaveStatus 不触发 dirty', () => {
    const store = new SchoolEditorStore(makeNewSchoolState('keiei'));
    store.setSaveStatus('saving');
    expect(store.get().saveStatus).toBe('saving');
    expect(store.get().isDirty).toBe(false);
  });

  test('markSaved 清 dirty + 设 saved', () => {
    const store = new SchoolEditorStore(makeNewSchoolState('keiei'));
    store.update({ title: { zh: 'A', ja: '', en: '' } });
    expect(store.get().isDirty).toBe(true);
    store.markSaved();
    expect(store.get().isDirty).toBe(false);
    expect(store.get().saveStatus).toBe('saved');
  });
});

describe('buildI18nTitle / buildSummary', () => {
  test('空 ja / en 字段不送', () => {
    const out = buildI18nTitle({ zh: ' A ', ja: '', en: '   ' });
    expect(out).toEqual({ zh: 'A' });
  });

  test('ja / en 都填则送全部', () => {
    const out = buildI18nTitle({ zh: 'A', ja: 'あ', en: 'a' });
    expect(out).toEqual({ zh: 'A', ja: 'あ', en: 'a' });
  });

  test('summary.ja 空则不送', () => {
    expect(buildSummary({ zh: '中文', ja: '   ' })).toEqual({ zh: '中文' });
  });

  test('summary.ja 非空则送 ja（不 trim — 用户可能保段首空格）', () => {
    expect(buildSummary({ zh: '中文', ja: '日本語' })).toEqual({ zh: '中文', ja: '日本語' });
  });
});
