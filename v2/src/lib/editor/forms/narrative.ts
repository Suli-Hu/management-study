/**
 * KP 编辑器 v0.8 — narrative form module
 *
 * 仅 1 个字段：prose（textarea）。
 * 见 KP-EDITOR-V0.8-PRD.md §6.4.1。
 */

import type { NarrativeBody } from '~/schemas/kp-body-structured';
import { el, textarea, field } from '../dom-helpers';

export interface FormModule {
  /** Detach DOM nodes, free listeners. */
  destroy(): void;
}

export function mountNarrativeForm(
  host: HTMLElement,
  body: NarrativeBody,
  onChange: (body: NarrativeBody) => void,
): FormModule {
  host.innerHTML = '';
  const wrap = el('div', 'kpe-body-editor');

  let current: NarrativeBody = body;

  wrap.appendChild(
    field({
      label: '正文 (prose)',
      required: true,
      hint: '一段连续的散文 — 可含 HTML 标签 (<strong> / <em> / <br>)',
      control: textarea({
        value: current.prose,
        rows: 12,
        placeholder: '正文 — 一段或多段连续叙述',
        cls: 'kpe-textarea is-prose',
        ariaLabel: '正文 prose',
        onInput: (v) => {
          current = { ...current, prose: v };
          onChange(current);
        },
      }),
    }),
  );

  host.appendChild(wrap);

  return {
    destroy: () => {
      host.innerHTML = '';
    },
  };
}
