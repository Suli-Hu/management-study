/**
 * KP 编辑器 v0.8 — relations panel
 *
 * 字段：schools (≥1, 必填) / scholars / tags / year / title.zh / title.ja / title.en。
 * 学派 chip 用 --tag-* token (PRD §13.4)；scholars/tags 用 neutral chip。
 *
 * 见 KP-EDITOR-V0.8-PRD.md §6.3。
 */

import { el, input, field, chip } from './dom-helpers';
import type { EditorStore, EditorMetadata } from './state';

interface RelationsPanelOptions {
  store: EditorStore;
  metadata: EditorMetadata;
}

const TAG_TOKENS = [
  'tag-mgmt',
  'tag-mkt',
  'tag-soc',
  'tag-purple',
  'tag-pink',
  'tag-cyan',
  'tag-blue',
  'tag-orange',
] as const;

/** Map school key → tag token by hash, deterministic. */
function schoolColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TAG_TOKENS[Math.abs(h) % TAG_TOKENS.length]!;
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
// Chip multi-select 区
// ============================================================

interface ChipPickerOptions {
  current: string[];
  options: Array<{ key: string; label: string; sub?: string; color?: string | null }>;
  placeholder: string;
  ariaLabel: string;
  /** 学派 chip → 按 schoolColor 自动上 tag-* token；其它 chip = null neutral */
  colorize: 'schools' | 'none';
  onChange: (next: string[]) => void;
}

function mountChipPicker(host: HTMLElement, opts: ChipPickerOptions): void {
  let current = [...opts.current];

  const render = () => {
    host.innerHTML = '';
    const wrap = el('div', 'kpe-chips');

    const box = el('div', 'kpe-chips-box');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', opts.ariaLabel);

    current.forEach((key) => {
      const optDef = opts.options.find((o) => o.key === key);
      const label = optDef?.label ?? key;
      const tagToken = opts.colorize === 'schools' ? schoolColor(key) : null;
      box.appendChild(
        chip({
          label,
          removable: true,
          tagToken,
          onRemove: () => {
            current = current.filter((k) => k !== key);
            opts.onChange(current);
            render();
          },
        }),
      );
    });

    // search input
    const inputEl = el('input', 'kpe-chip-input');
    inputEl.type = 'text';
    inputEl.placeholder = opts.placeholder;
    inputEl.setAttribute('aria-label', `搜索并添加 ${opts.ariaLabel}`);
    box.appendChild(inputEl);

    // dropdown (filtered)
    const dd = el('div', 'kpe-chips-dd');
    dd.style.display = 'none';

    const refreshDd = () => {
      dd.innerHTML = '';
      const q = inputEl.value.trim().toLowerCase();
      const matches = opts.options
        .filter((o) => !current.includes(o.key))
        .filter(
          (o) =>
            !q || o.key.toLowerCase().includes(q) || o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q),
        )
        .slice(0, 20);
      if (matches.length === 0) {
        dd.style.display = 'none';
        return;
      }
      matches.forEach((m) => {
        const it = el('div', 'kpe-dd-item');
        const name = el('span', 'kpe-dd-name');
        name.textContent = m.label;
        it.appendChild(name);
        if (m.sub) {
          const sub = el('span', 'kpe-dd-key');
          sub.textContent = m.sub;
          it.appendChild(sub);
        }
        it.addEventListener('mousedown', (e) => {
          // mousedown beats blur — keeps dropdown open
          e.preventDefault();
          if (current.includes(m.key)) return;
          current = [...current, m.key];
          opts.onChange(current);
          inputEl.value = '';
          render();
          inputEl.focus();
        });
        dd.appendChild(it);
      });
      dd.style.display = '';
    };

    inputEl.addEventListener('focus', refreshDd);
    inputEl.addEventListener('input', refreshDd);
    inputEl.addEventListener('blur', () => {
      // 延迟关闭让 mousedown 有机会触发
      setTimeout(() => {
        dd.style.display = 'none';
      }, 100);
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dd.style.display = 'none';
        inputEl.blur();
      }
    });

    wrap.appendChild(box);
    wrap.appendChild(dd);
    host.appendChild(wrap);
  };

  render();
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
  mountChipPicker(host, {
    current: opts.store.get().tags,
    options: opts.metadata.tags.map((t) => ({ key: t.key, label: t.label })),
    placeholder: '搜索标签（可空）',
    ariaLabel: '标签',
    colorize: 'none',
    onChange: (next) => opts.store.update({ tags: next }),
  });
}
