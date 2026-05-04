/**
 * KP 编辑器 v0.8 — quad form module
 *
 * 字段：lead / yAxis / xAxis / cells (固定 4，位置不可调)。
 * 每 cell 标注"[N] 左上/右上/左下/右下"避免顺序错乱 (Q6/G)。
 * 见 KP-EDITOR-V0.8-PRD.md §6.4.5。
 */

import type { QuadBody } from '~/schemas/kp-body-structured';
import { el, input, textarea, field } from '../dom-helpers';
import type { FormModule } from './narrative';

const POS_LABELS = ['左上 · 高 y · 低 x', '右上 · 高 y · 高 x', '左下 · 低 y · 低 x', '右下 · 低 y · 高 x'];

export function mountQuadForm(
  host: HTMLElement,
  body: QuadBody,
  onChange: (body: QuadBody) => void,
): FormModule {
  // pad cells to 4
  const padded = [...body.cells];
  while (padded.length < 4) padded.push({ name: '', emoji: '', sub: '', detail: '' });
  const cells = padded.slice(0, 4) as [
    QuadBody['cells'][number],
    QuadBody['cells'][number],
    QuadBody['cells'][number],
    QuadBody['cells'][number],
  ];

  let current: QuadBody = {
    format: 'quad',
    lead: body.lead ?? '',
    yAxis: body.yAxis ?? '',
    xAxis: body.xAxis ?? '',
    cells,
  };

  host.innerHTML = '';
  const wrap = el('div', 'kpe-body-editor');

  wrap.appendChild(
    field({
      label: '导语 (lead)',
      helpAnchor: 'lead',
      hint: '对四象限的引言，可空',
      control: textarea({
        value: current.lead,
        rows: 2,
        placeholder: '四象限的引言（可空）',
        cls: 'kpe-textarea is-lead',
        onInput: (v) => {
          current = { ...current, lead: v };
          onChange(current);
        },
      }),
    }),
  );

  // axes
  const axes = el('div', 'kpe-quad-axes');
  axes.appendChild(
    field({
      label: 'Y 轴维度',
      required: true,
      helpAnchor: 'quad-yaxis',
      hint: '如「市场增长率」',
      control: input({
        value: current.yAxis,
        placeholder: '如：市场增长率',
        cls: 'kpe-input',
        ariaLabel: 'Y 轴维度名',
        required: true,
        onInput: (v) => {
          current = { ...current, yAxis: v };
          onChange(current);
        },
      }),
    }),
  );
  axes.appendChild(
    field({
      label: 'X 轴维度',
      required: true,
      helpAnchor: 'quad-xaxis',
      hint: '如「相对市场份额」',
      control: input({
        value: current.xAxis,
        placeholder: '如：相对市场份额',
        cls: 'kpe-input',
        ariaLabel: 'X 轴维度名',
        required: true,
        onInput: (v) => {
          current = { ...current, xAxis: v };
          onChange(current);
        },
      }),
    }),
  );
  wrap.appendChild(axes);

  // 4 cells — fixed position
  const grid = el('div', 'kpe-quad-grid');
  POS_LABELS.forEach((posLabel, i) => {
    const cell = el('div', 'kpe-quad-cell');

    const pos = el('div', 'kpe-quad-cell-pos');
    pos.textContent = `[${i}] ${posLabel}`;
    cell.appendChild(pos);

    const head = el('div', 'kpe-quad-cell-head');
    head.appendChild(
      input({
        value: current.cells[i]!.emoji,
        placeholder: '⭐',
        cls: 'kpe-input kpe-quad-emoji-input',
        ariaLabel: `Cell ${i} emoji`,
        maxLength: 4,
        onInput: (v) => {
          current.cells[i] = { ...current.cells[i]!, emoji: v };
          onChange(current);
        },
      }),
    );
    head.appendChild(
      input({
        value: current.cells[i]!.name,
        placeholder: '象限名（必填）',
        cls: 'kpe-input',
        ariaLabel: `Cell ${i} name`,
        required: true,
        onInput: (v) => {
          current.cells[i] = { ...current.cells[i]!, name: v };
          onChange(current);
        },
      }),
    );
    cell.appendChild(head);

    cell.appendChild(
      input({
        value: current.cells[i]!.sub,
        placeholder: '副标题（可空）',
        cls: 'kpe-input',
        ariaLabel: `Cell ${i} sub`,
        onInput: (v) => {
          current.cells[i] = { ...current.cells[i]!, sub: v };
          onChange(current);
        },
      }),
    );

    cell.appendChild(
      textarea({
        value: current.cells[i]!.detail,
        rows: 3,
        placeholder: '详情（特征 + 战略建议）',
        cls: 'kpe-textarea',
        ariaLabel: `Cell ${i} detail`,
        onInput: (v) => {
          current.cells[i] = { ...current.cells[i]!, detail: v };
          onChange(current);
        },
      }),
    );

    grid.appendChild(cell);
  });
  wrap.appendChild(
    field({
      label: '四象限 cell（位置固定，按矩阵 [0]-[3] 顺序填）',
      helpAnchor: 'quad-cells',
      control: grid,
    }),
  );

  host.appendChild(wrap);

  return { destroy: () => (host.innerHTML = '') };
}
