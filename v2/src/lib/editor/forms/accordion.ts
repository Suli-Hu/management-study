/**
 * KP 编辑器 v0.8 — accordion form module
 *
 * 两层嵌套数组：groups[].items[]。每层独立"+添加 / ✕删除"。
 * v0.11.53: 支持长按 bullet 拖动重排：
 *   - 条目 bullet "1.1"/"1.2" 长按 → 组内 + 跨组拖（multi-container）
 *   - group bullet "1"/"2" 长按 → 改 group 整体顺序
 * 见 KP-EDITOR-V0.8-PRD.md §6.4.3。
 */

import type { AccordionBody } from '~/schemas/kp-body-structured';
import { el, input, textarea, field, deleteX, addBtn } from '../dom-helpers';
import { mountDragReorder } from '~/lib/drag-reorder-client';
import type { FormModule } from './narrative';

let _kSeq = 0;
function makeKey(): string {
  _kSeq = (_kSeq + 1) % 1_000_000;
  return `k${Date.now().toString(36)}${_kSeq.toString(36)}`;
}

// 每个 mount 实例独立 group key，多个编辑器实例不互窜
let _instSeq = 0;

type AccGroup = AccordionBody['groups'][number];
type AccItem = AccGroup['items'][number];

export function mountAccordionForm(
  host: HTMLElement,
  body: AccordionBody,
  onChange: (body: AccordionBody) => void,
): FormModule {
  const instId = ++_instSeq;
  const dragGroupGroups = `kpe-acc-groups-${instId}`;
  const dragGroupItems = `kpe-acc-items-${instId}`;

  let current: AccordionBody = {
    format: 'accordion',
    lead: body.lead ?? '',
    groups:
      body.groups.length > 0
        ? body.groups.map((g) => ({ ...g, items: [...g.items] }))
        : [{ title: '', items: [] }],
  };

  // stable client-side keys
  let groupKeys: string[] = current.groups.map(() => makeKey());
  const itemKeysByGroup = new Map<string, string[]>();
  groupKeys.forEach((gk, gi) => {
    itemKeysByGroup.set(
      gk,
      current.groups[gi].items.map(() => makeKey()),
    );
  });

  let drags: Array<{ destroy: () => void }> = [];

  function destroyDrags() {
    for (const d of drags) d.destroy();
    drags = [];
  }

  const render = () => {
    destroyDrags();
    host.innerHTML = '';
    const wrap = el('div', 'kpe-body-editor');

    // lead
    wrap.appendChild(
      field({
        label: '导语 (lead)',
        hint: '总论 / 串场，可空',
        control: textarea({
          value: current.lead,
          rows: 2,
          placeholder: '总论 / 串场（可空）',
          cls: 'kpe-textarea is-lead',
          onInput: (v) => {
            current = { ...current, lead: v };
            onChange(current);
          },
        }),
      }),
    );

    const groupsWrap = el('div', 'kpe-accordion-groups');
    current.groups.forEach((g, gi) => {
      const groupKey = groupKeys[gi];
      const groupBox = el('div', 'kpe-group');
      groupBox.dataset.groupKey = groupKey;

      const groupHead = el('div', 'kpe-group-head');

      const groupBullet = el('span', 'kpe-group-bullet kpe-drag-handle-group');
      groupBullet.textContent = String(gi + 1);
      groupBullet.title = '长按拖动改变分组顺序';
      groupHead.appendChild(groupBullet);

      groupHead.appendChild(
        input({
          value: g.title,
          placeholder: '分组名（必填，如「根本矛盾」）',
          cls: 'kpe-input kpe-group-title-input',
          ariaLabel: `分组 ${gi + 1} 标题`,
          required: true,
          onInput: (v) => {
            current.groups[gi] = { ...current.groups[gi], title: v };
            onChange(current);
          },
        }),
      );
      const delGroup = deleteX(() => {
        if (current.groups.length <= 1) return;
        const removedKey = groupKeys[gi];
        current = {
          ...current,
          groups: current.groups.filter((_, x) => x !== gi),
        };
        groupKeys = groupKeys.filter((_, x) => x !== gi);
        itemKeysByGroup.delete(removedKey);
        onChange(current);
        render();
      }, `删除分组 ${gi + 1}`);
      if (current.groups.length <= 1) {
        delGroup.disabled = true;
        delGroup.title = '至少保留 1 个分组';
      }
      groupHead.appendChild(delGroup);
      groupBox.appendChild(groupHead);

      // group items
      const itemsWrap = el('div', 'kpe-group-items');
      itemsWrap.dataset.groupKey = groupKey;
      const ikeys = itemKeysByGroup.get(groupKey) ?? [];
      g.items.forEach((it, ii) => {
        const pair = el('div', 'kpe-list-item');
        pair.dataset.itemKey = ikeys[ii];

        const bullet = el('span', 'kpe-list-bullet kpe-drag-handle');
        bullet.textContent = `${gi + 1}.${ii + 1}`;
        bullet.title = '长按拖动改变顺序（可跨组）';
        pair.appendChild(bullet);

        const fields = el('div', 'kpe-list-fields');
        fields.appendChild(
          input({
            value: it.name,
            placeholder: '标签（必填）',
            cls: 'kpe-input kpe-list-name-input',
            ariaLabel: `分组 ${gi + 1} 条目 ${ii + 1} 名`,
            required: true,
            onInput: (v) => {
              current.groups[gi].items[ii] = { ...current.groups[gi].items[ii], name: v };
              onChange(current);
            },
          }),
        );
        fields.appendChild(
          textarea({
            value: it.desc,
            rows: 2,
            placeholder: '内容（可空）',
            cls: 'kpe-textarea kpe-list-desc-input',
            ariaLabel: `分组 ${gi + 1} 条目 ${ii + 1} 描述`,
            onInput: (v) => {
              current.groups[gi].items[ii] = { ...current.groups[gi].items[ii], desc: v };
              onChange(current);
            },
          }),
        );
        pair.appendChild(fields);

        pair.appendChild(
          deleteX(() => {
            current.groups[gi] = {
              ...current.groups[gi],
              items: current.groups[gi].items.filter((_, x) => x !== ii),
            };
            const existing = itemKeysByGroup.get(groupKey) ?? [];
            itemKeysByGroup.set(
              groupKey,
              existing.filter((_, x) => x !== ii),
            );
            onChange(current);
            render();
          }, `删除条目 ${gi + 1}.${ii + 1}`),
        );

        itemsWrap.appendChild(pair);
      });

      itemsWrap.appendChild(
        addBtn('+ 组内添加条目', () => {
          current.groups[gi] = {
            ...current.groups[gi],
            items: [...current.groups[gi].items, { name: '', desc: '' }],
          };
          const existing = itemKeysByGroup.get(groupKey) ?? [];
          itemKeysByGroup.set(groupKey, [...existing, makeKey()]);
          onChange(current);
          render();
        }),
      );

      groupBox.appendChild(itemsWrap);
      groupsWrap.appendChild(groupBox);
    });

    wrap.appendChild(
      field({
        label: `分组（${current.groups.length}）`,
        control: groupsWrap,
      }),
    );

    wrap.appendChild(
      addBtn('+ 添加分组', () => {
        const newGroupKey = makeKey();
        current = { ...current, groups: [...current.groups, { title: '', items: [] }] };
        groupKeys = [...groupKeys, newGroupKey];
        itemKeysByGroup.set(newGroupKey, []);
        onChange(current);
        render();
      }),
    );

    host.appendChild(wrap);

    // ============================================================
    // drag-reorder mounts
    // ============================================================

    // 1. groups 重排 — 单容器，handle = .kpe-drag-handle-group
    if (current.groups.length >= 2) {
      drags.push(
        mountDragReorder(groupsWrap, {
          group: dragGroupGroups,
          dragHandleSelector: '.kpe-drag-handle-group',
          skipSelector: 'input, textarea, button',
          getId: (el) => el.dataset.groupKey ?? null,
          onReorder: (idsByContainer) => {
            const newKeys = Array.from(idsByContainer.values())[0] ?? [];
            if (newKeys.length !== current.groups.length) return;
            const oldKeyToGroup = new Map<string, AccGroup>();
            groupKeys.forEach((k, i) => oldKeyToGroup.set(k, current.groups[i]));
            const newGroups = newKeys
              .map((k) => oldKeyToGroup.get(k))
              .filter((x): x is AccGroup => !!x);
            if (newGroups.length !== current.groups.length) return;
            groupKeys = newKeys;
            current = { ...current, groups: newGroups };
            onChange(current);
            render();
          },
        }),
      );
    }

    // 2. items 重排 — multi-container（每 group 一个），同 group key 允许跨组拖
    const totalItems = current.groups.reduce((s, g) => s + g.items.length, 0);
    if (totalItems >= 2) {
      const itemsWraps = groupsWrap.querySelectorAll<HTMLElement>('.kpe-group-items');
      itemsWraps.forEach((iw) => {
        drags.push(
          mountDragReorder(iw, {
            group: dragGroupItems,
            dragHandleSelector: '.kpe-drag-handle',
            skipSelector: 'input, textarea, button',
            getId: (el) => el.dataset.itemKey ?? null,
            getContainerKey: (c) => c.dataset.groupKey ?? '__',
            onReorder: (idsByContainer) => {
              // 收集所有"老 itemKey → 老 item"映射
              const allOldItems = new Map<string, AccItem>();
              groupKeys.forEach((gk, gi) => {
                const ikeys = itemKeysByGroup.get(gk) ?? [];
                ikeys.forEach((ik, ii) => {
                  const it = current.groups[gi].items[ii];
                  if (it) allOldItems.set(ik, it);
                });
              });

              // 更新 itemKeysByGroup（只更新受影响的）
              idsByContainer.forEach((newItemKeys, gKey) => {
                itemKeysByGroup.set(gKey, [...newItemKeys]);
              });

              // 重建 current.groups
              const newGroups = current.groups.map((g, gi) => {
                const gk = groupKeys[gi];
                const ikeys = itemKeysByGroup.get(gk) ?? [];
                const newItems = ikeys
                  .map((ik) => allOldItems.get(ik))
                  .filter((x): x is AccItem => !!x);
                return { ...g, items: newItems };
              });

              current = { ...current, groups: newGroups };
              onChange(current);
              render();
            },
          }),
        );
      });
    }
  };

  render();
  return {
    destroy: () => {
      destroyDrags();
      host.innerHTML = '';
    },
  };
}
