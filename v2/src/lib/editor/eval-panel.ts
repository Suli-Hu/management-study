/**
 * KP 编辑器 v0.8 — evaluations panel (6 字段：义/限/例/应/用/喻)
 *
 * 跟 lang tab 切换；is-filled 状态高亮（subagent §H 决策）。
 * 单语种保存：6 字段全空 → 该语种不送（PRD §5.2）。
 *
 * 见 KP-EDITOR-V0.8-PRD.md §6.3 末尾 + §13.3 H。
 */

import type { KpEvaluationsLang } from '~/schemas/kp-body-structured';
import { el, textarea } from './dom-helpers';
import type { EditorStore, Lang } from './state';
import { emptyEvaluationsLang, hasEvaluationContent } from './state';

const EVAL_FIELDS: Array<{
  key: keyof KpEvaluationsLang;
  glyph: string;
  name: string;
  hint: string;
}> = [
  { key: 'meaning', glyph: '义', name: '意义', hint: 'KP 的学术 / 实务贡献' },
  { key: 'limit', glyph: '限', name: '限制', hint: '理论的不足 / 边界 / 被批判' },
  { key: 'example', glyph: '例', name: '案例', hint: '真实企业 / 事例' },
  { key: 'response', glyph: '应', name: '应对', hint: '基于 KP 的应对策略 / 处方' },
  { key: 'application', glyph: '用', name: '应用', hint: '实务应用场景' },
  { key: 'analogy', glyph: '喻', name: '比喻', hint: '类比 / 记忆点' },
];

interface EvalPanelOptions {
  store: EditorStore;
}

export function mountEvalPanel(host: HTMLElement, opts: EvalPanelOptions): void {
  const render = () => {
    host.innerHTML = '';
    const state = opts.store.get();
    const lang = state.activeLang;
    const evals = state.evaluations[lang] ?? emptyEvaluationsLang();

    const wrap = el('div', 'kpe-eval-rows');

    EVAL_FIELDS.forEach((f) => {
      const value = evals[f.key];
      const row = el('div', 'kpe-eval-row');
      if (value && value.trim()) row.classList.add('is-filled');

      const lhs = el('div', 'kpe-eval-lhs');
      const glyph = el('span', 'kpe-eval-glyph');
      glyph.textContent = f.glyph;
      lhs.appendChild(glyph);
      const name = el('span', 'kpe-eval-tag-name');
      name.textContent = f.name;
      lhs.appendChild(name);
      row.appendChild(lhs);

      row.appendChild(
        textarea({
          value,
          rows: 2,
          placeholder: f.hint,
          cls: 'kpe-eval-input',
          ariaLabel: `${f.name}（${f.glyph}）— ${lang}`,
          onInput: (v) => {
            const cur = opts.store.get().evaluations[lang] ?? emptyEvaluationsLang();
            const next: KpEvaluationsLang = { ...cur, [f.key]: v };
            // 6 全空 → 写 null（payload 时省略）；任一非空 → 写完整 record
            opts.store.setEvaluations(lang, hasEvaluationContent(next) ? next : null);
            // refresh row class without full re-render
            row.classList.toggle('is-filled', Boolean(v.trim()));
          },
        }),
      );

      wrap.appendChild(row);
    });

    host.appendChild(wrap);
  };

  render();
  let lastLang: Lang = opts.store.get().activeLang;
  opts.store.subscribe((s) => {
    // 仅 lang 切换时才整面重渲染 — 否则 user input 触发的 store.notify() 会重建 DOM 丢 caret
    if (s.activeLang !== lastLang) {
      lastLang = s.activeLang;
      render();
    }
  });
}

// ============================================================
// Helpers for save payload
// ============================================================

/** 任一字段非空 → 该语种应送；全空 → undefined（不送 ja） */
export function evalsForPayload(lang: Lang, store: EditorStore): KpEvaluationsLang | undefined {
  const evals = store.get().evaluations[lang];
  if (!evals) return undefined;
  return hasEvaluationContent(evals) ? evals : undefined;
}
