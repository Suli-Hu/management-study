/**
 * KP 编辑器 v0.8 — compare form module
 *
 * 字段：lead / cols[].{title, keyword, desc, type, theories, detail}。
 * 每列 6 字段，全断点用 auto-fill minmax(260px, 1fr) 自动响应。
 * 见 KP-EDITOR-V0.8-PRD.md §6.4.4。
 */

import type { CompareBody } from '~/schemas/kp-body-structured';
import { el, input, textarea, field, deleteX, addBtn } from '../dom-helpers';
import type { FormModule } from './narrative';

const COL_FIELDS: Array<{
  key: 'keyword' | 'desc' | 'type' | 'theories' | 'detail';
  label: string;
  placeholder: string;
  multiline: boolean;
}> = [
  { key: 'keyword', label: '关键词', placeholder: 'What / How / Why', multiline: false },
  { key: 'desc', label: '描述', placeholder: '一句话定义', multiline: false },
  { key: 'type', label: '类型', placeholder: '如：内容理论', multiline: false },
  { key: 'theories', label: '理论', placeholder: "Maslow '43, Herzberg '59", multiline: false },
  { key: 'detail', label: '详情', placeholder: '展开后显示的详细文字', multiline: true },
];

export function mountCompareForm(
  host: HTMLElement,
  body: CompareBody,
  onChange: (body: CompareBody) => void,
): FormModule {
  let current: CompareBody = {
    format: 'compare',
    lead: body.lead ?? '',
    cols: body.cols.length >= 2
      ? body.cols.map((c) => ({ ...c }))
      : [
          { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
        ],
  };

  const render = () => {
    host.innerHTML = '';
    const wrap = el('div', 'kpe-body-editor');

    wrap.appendChild(
      field({
        label: '导语 (lead)',
        helpAnchor: 'lead',
        hint: '对对比关系的引言，可空',
        control: textarea({
          value: current.lead,
          rows: 2,
          placeholder: '对比关系的引言（可空）',
          cls: 'kpe-textarea is-lead',
          onInput: (v) => {
            current = { ...current, lead: v };
            onChange(current);
          },
        }),
      }),
    );

    const colsWrap = el('div', 'kpe-cmp-cols');
    current.cols.forEach((col, ci) => {
      const card = el('div', 'kpe-cmp-col');

      const head = el('div', 'kpe-cmp-col-head');
      const num = el('span', 'kpe-cmp-num');
      num.textContent = String(ci + 1);
      head.appendChild(num);
      head.appendChild(
        input({
          value: col.title,
          placeholder: '标题（必填）',
          cls: 'kpe-input kpe-cmp-title-input',
          ariaLabel: `列 ${ci + 1} 标题`,
          required: true,
          onInput: (v) => {
            current.cols[ci] = { ...current.cols[ci], title: v };
            onChange(current);
          },
        }),
      );
      const delBtn = deleteX(() => {
        if (current.cols.length <= 2) return;
        current = { ...current, cols: current.cols.filter((_, x) => x !== ci) };
        onChange(current);
        render();
      }, `删除列 ${ci + 1}`);
      if (current.cols.length <= 2) {
        delBtn.disabled = true;
        delBtn.title = '至少保留 2 列';
      }
      head.appendChild(delBtn);
      card.appendChild(head);

      const fieldsWrap = el('div', 'kpe-cmp-fields');
      COL_FIELDS.forEach((f) => {
        const fb = el('div', 'kpe-cmp-field');
        const labelEl = el('label', 'kpe-cmp-field-label');
        labelEl.textContent = f.label;
        fb.appendChild(labelEl);
        const onIn = (v: string) => {
          current.cols[ci] = { ...current.cols[ci], [f.key]: v };
          onChange(current);
        };
        const ctrl = f.multiline
          ? textarea({
              value: col[f.key],
              placeholder: f.placeholder,
              rows: 3,
              cls: 'kpe-textarea kpe-cmp-field-input',
              ariaLabel: `列 ${ci + 1} ${f.label}`,
              onInput: onIn,
            })
          : input({
              value: col[f.key],
              placeholder: f.placeholder,
              cls: 'kpe-input kpe-cmp-field-input',
              ariaLabel: `列 ${ci + 1} ${f.label}`,
              onInput: onIn,
            });
        fb.appendChild(ctrl);
        fieldsWrap.appendChild(fb);
      });
      card.appendChild(fieldsWrap);

      colsWrap.appendChild(card);
    });

    wrap.appendChild(
      field({
        label: `对比列（${current.cols.length}）`,
        helpAnchor: 'compare-cols',
        control: colsWrap,
      }),
    );

    wrap.appendChild(
      addBtn('+ 添加对比列', () => {
        current = {
          ...current,
          cols: [...current.cols, { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' }],
        };
        onChange(current);
        render();
      }),
    );

    host.appendChild(wrap);
  };

  render();
  return { destroy: () => (host.innerHTML = '') };
}
