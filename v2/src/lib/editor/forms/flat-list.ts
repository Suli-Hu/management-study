/**
 * KP 编辑器 v0.8 — flat-list form module
 *
 * 字段：lead / items[].name / items[].desc。条目按数组 index 顺序渲染。
 * v0.11.53: 支持长按 bullet（"1"/"2"/"3"）拖动重排（共用 drag-reorder-client）。
 * 见 KP-EDITOR-V0.8-PRD.md §6.4.2。
 */

import type { FlatListBody } from '~/schemas/kp-body-structured';
import { el, input, textarea, field, deleteX, addBtn } from '../dom-helpers';
import { mountDragReorder } from '~/lib/drag-reorder-client';
import type { FormModule } from './narrative';

let _kSeq = 0;
function makeKey(): string {
  _kSeq = (_kSeq + 1) % 1_000_000;
  return `k${Date.now().toString(36)}${_kSeq.toString(36)}`;
}

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
  let itemKeys: string[] = current.items.map(() => makeKey());
  let drag: { destroy: () => void } | null = null;

  function destroyDrag() {
    if (drag) {
      drag.destroy();
      drag = null;
    }
  }

  const render = () => {
    destroyDrag();
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
      row.dataset.itemKey = itemKeys[i];

      const bullet = el('span', 'kpe-list-bullet kpe-drag-handle');
      bullet.textContent = String(i + 1);
      bullet.title = '长按拖动改变顺序';
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
        itemKeys = itemKeys.filter((_, idx) => idx !== i);
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
        itemKeys = [...itemKeys, makeKey()];
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

    // 挂 drag-reorder — items >= 2 才需要
    if (current.items.length >= 2) {
      drag = mountDragReorder(itemsWrap, {
        dragHandleSelector: '.kpe-drag-handle',
        skipSelector: 'input, textarea, button',
        getId: (el) => el.dataset.itemKey ?? null,
        onReorder: (idsByContainer) => {
          const newKeys = Array.from(idsByContainer.values())[0] ?? [];
          if (newKeys.length !== current.items.length) return;
          const oldKeyToItem = new Map<string, FlatListBody['items'][number]>();
          itemKeys.forEach((k, i) => oldKeyToItem.set(k, current.items[i]));
          const newItems = newKeys
            .map((k) => oldKeyToItem.get(k))
            .filter((x): x is FlatListBody['items'][number] => !!x);
          if (newItems.length !== current.items.length) return;
          itemKeys = newKeys;
          current = { ...current, items: newItems };
          onChange(current);
          render(); // 让 bullet 数字 1/2/3 跟着顺序刷新
        },
      });
    }
  };

  render();
  return {
    destroy: () => {
      destroyDrag();
      host.innerHTML = '';
    },
  };
}
