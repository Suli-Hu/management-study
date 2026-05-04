/**
 * KP 编辑器 v0.8 — accordion form module
 *
 * 两层嵌套数组：groups[].items[]。每层独立"+添加 / ✕删除"，无排序 (Q6)。
 * 见 KP-EDITOR-V0.8-PRD.md §6.4.3。
 */

import type { AccordionBody } from '~/schemas/kp-body-structured';
import { el, input, textarea, field, deleteX, addBtn } from '../dom-helpers';
import type { FormModule } from './narrative';

export function mountAccordionForm(
  host: HTMLElement,
  body: AccordionBody,
  onChange: (body: AccordionBody) => void,
): FormModule {
  let current: AccordionBody = {
    format: 'accordion',
    lead: body.lead ?? '',
    groups: body.groups.length > 0 ? body.groups.map((g) => ({ ...g, items: [...g.items] })) : [{ title: '', items: [] }],
  };

  const render = () => {
    host.innerHTML = '';
    const wrap = el('div', 'kpe-body-editor');

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
      const groupBox = el('div', 'kpe-group');

      const groupHead = el('div', 'kpe-group-head');
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
        current = { ...current, groups: current.groups.filter((_, x) => x !== gi) };
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
      g.items.forEach((it, ii) => {
        const pair = el('div', 'kpe-list-item');
        const bullet = el('span', 'kpe-list-bullet');
        bullet.textContent = `${gi + 1}.${ii + 1}`;
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
        current = { ...current, groups: [...current.groups, { title: '', items: [] }] };
        onChange(current);
        render();
      }),
    );

    host.appendChild(wrap);
  };

  render();
  return { destroy: () => (host.innerHTML = '') };
}
