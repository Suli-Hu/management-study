/**
 * KP 编辑器 v0.8 — relations panel
 *
 * 字段：schools (≥1, 必填) / scholars / tags / year / title.zh / title.ja / title.en。
 * 学派 chip 用 --tag-* token (PRD §13.4)；scholars/tags 用 neutral chip。
 *
 * 见 KP-EDITOR-V0.8-PRD.md §6.3。
 */

import { el, input, field, mountChipPicker } from './dom-helpers';
import type { EditorStore, EditorMetadata } from './state';

interface RelationsPanelOptions {
  store: EditorStore;
  metadata: EditorMetadata;
}

export function mountTitleAndYearFields(host: HTMLElement, opts: RelationsPanelOptions): void {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-section-body');

  // title.zh
  wrap.appendChild(
    field({
      label: '中文标题',
      required: true,
      control: input({
        value: opts.store.get().title.zh,
        placeholder: '中文标题',
        cls: 'kpe-input is-lg',
        ariaLabel: '中文标题',
        required: true,
        onInput: (v) => {
          const t = opts.store.get().title;
          opts.store.update({ title: { ...t, zh: v } });
        },
      }),
    }),
  );
  // title.ja
  wrap.appendChild(
    field({
      label: '日本語タイトル',
      control: input({
        value: opts.store.get().title.ja,
        placeholder: '日本語タイトル（可空）',
        cls: 'kpe-input',
        ariaLabel: '日本語標題',
        onInput: (v) => {
          const t = opts.store.get().title;
          opts.store.update({ title: { ...t, ja: v } });
        },
      }),
    }),
  );
  // title.en
  wrap.appendChild(
    field({
      label: 'English title',
      control: input({
        value: opts.store.get().title.en,
        placeholder: 'English title (optional)',
        cls: 'kpe-input',
        ariaLabel: 'English title',
        onInput: (v) => {
          const t = opts.store.get().title;
          opts.store.update({ title: { ...t, en: v } });
        },
      }),
    }),
  );
  // year
  wrap.appendChild(
    field({
      label: '年份',
      control: input({
        value: opts.store.get().year,
        placeholder: '1979 / 1980s / 19c-late',
        cls: 'kpe-input kpe-input-narrow',
        ariaLabel: '年份',
        onInput: (v) => opts.store.update({ year: v }),
      }),
    }),
  );

  host.appendChild(wrap);
}

// ============================================================
// Public mount points
// ============================================================

export function mountSchoolsField(host: HTMLElement, opts: RelationsPanelOptions): void {
  mountChipPicker(host, {
    current: opts.store.get().schools,
    options: opts.metadata.schools,
    placeholder: '搜索学派（必选 ≥1）',
    ariaLabel: '所属学派',
    colorize: 'schools',
    onChange: (next) => opts.store.update({ schools: next }),
  });
  // re-render when state changes externally (e.g. error highlight)
  opts.store.subscribe((s) => {
    // simple diff: 只有 schools 变了才重画
    const dom = host.querySelectorAll<HTMLElement>('.kpe-chip');
    if (dom.length !== s.schools.length) {
      mountChipPicker(host, {
        current: s.schools,
        options: opts.metadata.schools,
        placeholder: '搜索学派（必选 ≥1）',
        ariaLabel: '所属学派',
        colorize: 'schools',
        onChange: (next) => opts.store.update({ schools: next }),
      });
    }
  });
}

export function mountScholarsField(host: HTMLElement, opts: RelationsPanelOptions): void {
  mountChipPicker(host, {
    current: opts.store.get().scholars,
    options: opts.metadata.scholars,
    placeholder: '搜索学者（可空）',
    ariaLabel: '关联学者',
    colorize: 'none',
    onChange: (next) => opts.store.update({ scholars: next }),
  });
}

export function mountTagsField(host: HTMLElement, opts: RelationsPanelOptions): void {
  // v0.9.0 Stage C-1: 单选 + 必填 (Q2=① 单 tag 单源色)
  // colorize 用 metadata.tags.color 映射出每 chip 真实色 (跟 school/scholar form 统一)
  const tagColorMap = new Map(opts.metadata.tags.map((t) => [t.key, t.color] as const));
  mountChipPicker(host, {
    current: opts.store.get().tags,
    options: opts.metadata.tags.map((t) => ({ key: t.key, label: t.label })),
    placeholder: '搜索 / 选 1 个标签（必填）',
    ariaLabel: '标签',
    colorize: (key) => tagColorMap.get(key) ?? null,
    onChange: (next) => opts.store.update({ tags: next }),
    singleSelect: true,
  });
}
