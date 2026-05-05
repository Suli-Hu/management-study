/**
 * KP 编辑器 v0.8 — quad form module
 *
 * 字段：lead / yAxis / xAxis / cells (固定 4，位置不可调)。
 * yAxis / xAxis 各拆 3 input：低值（必填）/ 中间维度（可空）/ 高值（必填）。
 * 每 cell 标注"[N] 左上/右上/左下/右下"避免顺序错乱 (Q6/G)。
 * 见 KP-EDITOR-V0.8-PRD.md §6.4.5。
 */

import type { QuadBody, QuadAxis } from '~/schemas/kp-body-structured';
import { el, input, textarea, field } from '../dom-helpers';
import type { FormModule } from './narrative';

const POS_LABELS = ['左上 · 高 y · 低 x', '右上 · 高 y · 高 x', '左下 · 低 y · 低 x', '右下 · 低 y · 高 x'];

type AxisKey = 'yAxis' | 'xAxis';
type AxisField = keyof QuadAxis;

export function mountQuadForm(
  host: HTMLElement,
  body: QuadBody,
  onChange: (body: QuadBody) => void,
): FormModule {
  // pad cells to 4
  // v0.8.33: detailBack 字段 default ''；老数据没有该 field 时 zod parse 自动补 ''
  const padded = [...body.cells];
  while (padded.length < 4) padded.push({ name: '', emoji: '', sub: '', detail: '', detailBack: '' });
  const cells = padded.slice(0, 4) as [
    QuadBody['cells'][number],
    QuadBody['cells'][number],
    QuadBody['cells'][number],
    QuadBody['cells'][number],
  ];

  let current: QuadBody = {
    format: 'quad',
    lead: body.lead ?? '',
    yAxis: normalizeAxis(body.yAxis),
    xAxis: normalizeAxis(body.xAxis),
    cells,
  };

  const updateAxis = (axis: AxisKey, fld: AxisField, value: string): void => {
    current = { ...current, [axis]: { ...current[axis], [fld]: value } };
    onChange(current);
  };

  host.innerHTML = '';
  const wrap = el('div', 'kpe-body-editor');

  wrap.appendChild(
    field({
      label: '导语 (lead)',
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

  // axes — yAxis / xAxis 各 3 input（低 / 中间 / 高）
  const axes = el('div', 'kpe-quad-axes');
  axes.appendChild(buildAxisField('yAxis', 'Y 轴维度', current.yAxis, updateAxis));
  axes.appendChild(buildAxisField('xAxis', 'X 轴维度', current.xAxis, updateAxis));
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
        placeholder: '正面文字（特征 + 战略建议，扫读用）',
        cls: 'kpe-textarea',
        ariaLabel: `Cell ${i} detail (front)`,
        onInput: (v) => {
          current.cells[i] = { ...current.cells[i]!, detail: v };
          onChange(current);
        },
      }),
    );

    // v0.8.33: 背面 detail — 跟 compare 卡的 detail 同语义（详细描述段落）。
    // 空也可翻面，背面只显示小号 name；填了内容才有阅读价值。
    cell.appendChild(
      textarea({
        value: current.cells[i]!.detailBack ?? '',
        rows: 4,
        placeholder: '背面文字（详细描述段落，深入阅读；可空）',
        cls: 'kpe-textarea',
        ariaLabel: `Cell ${i} detail (back)`,
        onInput: (v) => {
          current.cells[i] = { ...current.cells[i]!, detailBack: v };
          onChange(current);
        },
      }),
    );

    grid.appendChild(cell);
  });
  wrap.appendChild(
    field({
      label: '四象限 cell（位置固定，按矩阵 [0]-[3] 顺序填）',
      control: grid,
    }),
  );

  host.appendChild(wrap);

  return { destroy: () => (host.innerHTML = '') };
}

/** 旧 v0.8.3 数据偶尔传 string yAxis 进来 — 防御性 normalize（其实 server 已 422，仅兜底）。 */
function normalizeAxis(raw: QuadBody['yAxis'] | string | undefined | null): QuadAxis {
  if (raw && typeof raw === 'object' && 'low' in raw) {
    return { low: raw.low ?? '', label: raw.label ?? '', high: raw.high ?? '' };
  }
  return { low: '', label: '', high: '' };
}

/** 一个轴 = label + 3 inputs（低 / 中间维度可空 / 高）。 */
function buildAxisField(
  axisKey: AxisKey,
  axisLabel: string,
  axis: QuadAxis,
  onUpdate: (axis: AxisKey, fld: AxisField, value: string) => void,
): HTMLElement {
  const axisName = axisKey === 'yAxis' ? 'Y 轴' : 'X 轴';
  const row = el('div', 'kpe-quad-axis-row');
  row.appendChild(
    input({
      value: axis.low,
      placeholder: '低值 *',
      cls: 'kpe-input kpe-quad-axis-input',
      ariaLabel: `${axisName}低值`,
      required: true,
      onInput: (v) => onUpdate(axisKey, 'low', v),
    }),
  );
  row.appendChild(
    input({
      value: axis.label,
      placeholder: '中间维度（可空）',
      cls: 'kpe-input kpe-quad-axis-input',
      ariaLabel: `${axisName}中间维度`,
      onInput: (v) => onUpdate(axisKey, 'label', v),
    }),
  );
  row.appendChild(
    input({
      value: axis.high,
      placeholder: '高值 *',
      cls: 'kpe-input kpe-quad-axis-input',
      ariaLabel: `${axisName}高值`,
      required: true,
      onInput: (v) => onUpdate(axisKey, 'high', v),
    }),
  );
  return field({ label: axisLabel, required: true, control: row });
}
