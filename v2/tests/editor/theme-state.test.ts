/**
 * Theme editor v0.8 — state.ts 单元测试
 *
 * 覆盖：makeNew/Editing factory + Store update + buildI18nTitle / buildDesc
 */

import { describe, expect, test } from 'vitest';
import {
  ThemeEditorStore,
  makeNewThemeState,
  makeEditingThemeState,
  buildI18nTitle,
  buildDesc,
} from '~/lib/editor/theme-state';

describe('makeNewThemeState', () => {
  test('返干净 state — 5 字段全空', () => {
    const s = makeNewThemeState('keiei');
    expect(s.key).toBeNull();
    expect(s.title.zh).toBe('');
    expect(s.desc.zh).toBe('');
    expect(s.tags).toEqual([]);
    expect(s.isDirty).toBe(false);
  });
});

describe('makeEditingThemeState', () => {
  test('从 init shape 还原（含可空 desc）', () => {
    const s = makeEditingThemeState({
      key: 'org_change',
      discipline: 'keiei',
      title: { zh: '组织变革', ja: '組織変革' },
      desc: { zh: '副标题' },
      tags: ['mgmt'],
    });
    expect(s.key).toBe('org_change');
    expect(s.title.ja).toBe('組織変革');
    expect(s.title.en).toBe('');
    expect(s.desc.zh).toBe('副标题');
    expect(s.desc.ja).toBe('');
  });

  test('init 无 desc → state.desc 全空', () => {
    const s = makeEditingThemeState({
      key: 'x',
      discipline: 'keiei',
      title: { zh: 'X' },
      tags: [],
    });
    expect(s.desc.zh).toBe('');
    expect(s.desc.ja).toBe('');
  });
});

describe('ThemeEditorStore', () => {
  test('update + listener', () => {
    const store = new ThemeEditorStore(makeNewThemeState('keiei'));
    let calls = 0;
    store.subscribe(() => calls++);
    store.update({ key: 'org_change' });
    expect(calls).toBe(1);
    expect(store.get().key).toBe('org_change');
    expect(store.get().isDirty).toBe(true);
  });

  test('markSaved', () => {
    const store = new ThemeEditorStore(makeNewThemeState('keiei'));
    store.update({ title: { zh: 'X', ja: '', en: '' } });
    store.markSaved();
    expect(store.get().isDirty).toBe(false);
    expect(store.get().saveStatus).toBe('saved');
  });
});

describe('buildI18nTitle / buildDesc', () => {
  test('空 ja/en 不送', () => {
    expect(buildI18nTitle({ zh: '组织变革', ja: '', en: '' })).toEqual({ zh: '组织变革' });
  });

  test('desc 全空 → undefined', () => {
    expect(buildDesc({ zh: '', ja: '' })).toBeUndefined();
    expect(buildDesc({ zh: '   ', ja: '   ' })).toBeUndefined();
  });

  test('desc 部分填 → 仅送非空字段', () => {
    expect(buildDesc({ zh: '副标题', ja: '' })).toEqual({ zh: '副标题' });
    expect(buildDesc({ zh: '', ja: '副題' })).toEqual({ ja: '副題' });
  });

  test('desc 都填 → 都送', () => {
    expect(buildDesc({ zh: '副标题', ja: '副題' })).toEqual({ zh: '副标题', ja: '副題' });
  });
});
