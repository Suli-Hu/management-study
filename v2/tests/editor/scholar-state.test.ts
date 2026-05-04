/**
 * Scholar editor v0.8 — state.ts 单元测试
 *
 * 覆盖：4 section state shape + Store update + nobel 折叠区构造逻辑
 *      + payload builder（buildI18nName / buildContribution / nobelHasContent）
 */

import { describe, expect, test } from 'vitest';
import {
  ScholarEditorStore,
  makeNewScholarState,
  makeEditingScholarState,
  buildI18nName,
  buildContribution,
  nobelHasContent,
} from '~/lib/editor/scholar-state';

describe('makeNewScholarState', () => {
  test('返干净 state — 14 字段全空 + nobel=null', () => {
    const s = makeNewScholarState('keiei');
    expect(s.key).toBeNull();
    expect(s.discipline).toBe('keiei');
    expect(s.name.zh).toBe('');
    expect(s.schools).toEqual([]);
    expect(s.contribution.zh).toBe('');
    expect(s.tags).toEqual([]);
    expect(s.nobel).toBeNull();
    expect(s.field).toBe('');
    expect(s.flag).toBe('');
    expect(s.isDirty).toBe(false);
  });

  test('presetSchool 注入 schools[0]', () => {
    const s = makeNewScholarState('keiei', 'lewin_school');
    expect(s.schools).toEqual(['lewin_school']);
  });
});

describe('makeEditingScholarState', () => {
  test('从 init shape 还原 + nobel 已存在则保持', () => {
    const s = makeEditingScholarState({
      key: 'lewin',
      discipline: 'keiei',
      name: { zh: '勒温' },
      schools: ['lewin_school'],
      contribution: { zh: '场论...' },
      institution: 'MIT',
      born: '1890年9月9日',
      died: '1947',
      nationality: '德国/美国',
      flag: '🇩🇪 🇺🇸',
      origin: 'Mogilno',
      field: '社会心理学',
      tags: ['mgmt'],
      nobel: { year: '1947', detail: 'X' },
    });
    expect(s.name.zh).toBe('勒温');
    expect(s.schools).toEqual(['lewin_school']);
    expect(s.nobel).toEqual({ year: '1947', detail: 'X' });
    expect(s.flag).toBe('🇩🇪 🇺🇸');
  });

  test('init.nobel=null → state.nobel=null', () => {
    const s = makeEditingScholarState({
      key: 'lewin',
      discipline: 'keiei',
      name: { zh: '勒温' },
      schools: [],
      contribution: { zh: 'x' },
      institution: '',
      born: '',
      died: '',
      nationality: '',
      flag: '',
      origin: '',
      field: '',
      tags: [],
      nobel: null,
    });
    expect(s.nobel).toBeNull();
  });
});

describe('ScholarEditorStore', () => {
  test('update + listener 调度', () => {
    const store = new ScholarEditorStore(makeNewScholarState('keiei'));
    let calls = 0;
    store.subscribe(() => calls++);
    store.update({ flag: '🇩🇪' });
    expect(calls).toBe(1);
    expect(store.get().flag).toBe('🇩🇪');
    expect(store.get().isDirty).toBe(true);
  });

  test('update nobel 部分字段', () => {
    const store = new ScholarEditorStore(makeNewScholarState('keiei'));
    store.update({ nobel: { year: '1947', detail: '' } });
    expect(store.get().nobel?.year).toBe('1947');
  });

  test('markSaved 清 dirty', () => {
    const store = new ScholarEditorStore(makeNewScholarState('keiei'));
    store.update({ name: { zh: 'X', ja: '', en: '' } });
    store.markSaved();
    expect(store.get().isDirty).toBe(false);
    expect(store.get().saveStatus).toBe('saved');
  });
});

describe('buildI18nName / buildContribution / nobelHasContent', () => {
  test('name 空 ja/en 不送', () => {
    expect(buildI18nName({ zh: '勒温', ja: '', en: '' })).toEqual({ zh: '勒温' });
  });

  test('name 全送', () => {
    expect(buildI18nName({ zh: '勒温', ja: 'レヴィン', en: 'Lewin' })).toEqual({
      zh: '勒温',
      ja: 'レヴィン',
      en: 'Lewin',
    });
  });

  test('contribution.ja 空不送', () => {
    expect(buildContribution({ zh: 'x', ja: '' })).toEqual({ zh: 'x' });
  });

  test('nobelHasContent — null → false', () => {
    expect(nobelHasContent(null)).toBe(false);
  });

  test('nobelHasContent — year 空 → false', () => {
    expect(nobelHasContent({ year: '', detail: 'X' })).toBe(false);
  });

  test('nobelHasContent — year 有 → true', () => {
    expect(nobelHasContent({ year: '1947', detail: '' })).toBe(true);
  });
});
