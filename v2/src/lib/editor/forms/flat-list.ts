/**
 * KP 编辑器 v0.8 — flat-list form module
 *
 * 字段：lead / items[].name / items[].desc。条目按数组 index 顺序渲染，无排序控件 (Q6)。
 * 见 KP-EDITOR-V0.8-PRD.md §6.4.2。
 */

import type { FlatListBody } from '~/schemas/kp-body-structured';
import { el, input, textarea, field, deleteX, addBtn } from '../dom-helpers';
import type { FormModule } from './narrative';

export function mountFlatListForm(
  host: HTMLElement,
  body: FlatListBody,
  onChange: (body: FlatListBody) => void,
): FormModule {
  let current: FlatListBody = {
    format: 'flat-list',
    lead: body.lead ?? '',
    items: body.items.length > 0 ? [...body.items] : [{ name: '', desc: '' }],
  };

  const render = () => {
    host.innerHTML = '';
    const wrap = el('div', 'kpe-body-editor');

    // lead
    wrap.appendChild(
      field({
        label: '导语 (lead)',
        hint: '一句话总起，可空',
        control: textarea({
          value: current.lead,
          rows: 2,
          placeholder: '一句话引出条目（可空）',
          cls: 'kpe-textarea is-lead',
          onInput: (v) => {
            current = { ...current, lead: v };
            onChange(current);
          },
        }),
      }),
    );

    // items
    const itemsWrap = el('div', 'kpe-list-items');
    current.items.forEach((it, i) => {
      const row = el('div', 'kpe-list-item');

      const bullet = el('span', 'kpe-list-bullet');
      bullet.textContent = String(i + 1);
      row.appendChild(bullet);

      const fields = el('div', 'kpe-list-fields');
      fields.appendChild(
        input({
          value: it.name,
          placeholder: '名称（必填）',
          cls: 'kpe-input kpe-list-name-input',
          ariaLabel: `条目 ${i + 1} 名称`,
          required: true,
          onInput: (v) => {
            current.items[i] = { ...current.items[i], name: v };
            onChange(current);
          },
        }),
      );
      fields.appendChild(
        textarea({
          value: it.desc,
          rows: 2,
          placeholder: '描述（必填）',
          cls: 'kpe-textarea kpe-list-desc-input',
          ariaLabel: `条目 ${i + 1} 描述`,
          required: true,
          onInput: (v) => {
            current.items[i] = { ...current.items[i], desc: v };
            onChange(current);
          },
        }),
      );
      row.appendChild(fields);

      // 删除按钮 — 仅在 items >1 时启用（zod 要求 ≥1）
      const delBtn = deleteX(() => {
        if (current.items.length <= 1) return;
        current = { ...current, items: current.items.filter((_, idx) => idx !== i) };
        onChange(current);
        render();
      }, `删除条目 ${i + 1}`);
      if (current.items.length <= 1) {
        delBtn.disabled = true;
        delBtn.title = '至少保留 1 个条目';
      }
      row.appendChild(delBtn);

      itemsWrap.appendChild(row);
    });

    itemsWrap.appendChild(
      addBtn('+ 添加条目', () => {
        current = { ...current, items: [...current.items, { name: '', desc: '' }] };
        onChange(current);
        render();
      }),
    );

    wrap.appendChild(
      field({
        label: `条目（${current.items.length}）`,
        control: itemsWrap,
      }),
    );

    host.appendChild(wrap);
  };

  render();
  return { destroy: () => (host.innerHTML = '') };
}
