/**
 * KP 编辑器 v0.8 — zh / ja lang tab + F5 sync 按钮
 *
 * tab 在 body section 内部（不全局）— PRD §6.6 决策 C。
 * F5 sync 按钮：仅 zh.format != ja.format 时 enable（refine 已在 backend 强制，
 * UI 仍展示 sync 路径以便迁移老数据 — 但 v0.8.2 之后 schema 拒不一致写入，所以
 * F5 button 仅显示给历史脏数据；新数据不可能进入这个状态）。
 *
 * 见 KP-EDITOR-V0.8-PRD.md §6.6。
 */

import { el } from './dom-helpers';
import type { EditorStore, Lang } from './state';

interface LangTabsOptions {
  store: EditorStore;
  /** Caller 控制切 lang 后的 hook（如重渲染 form） */
  onLangChange?: (lang: Lang) => void;
}

export function mountLangTabs(host: HTMLElement, opts: LangTabsOptions): void {
  const render = () => {
    host.innerHTML = '';
    const state = opts.store.get();
    const wrap = el('div', 'kpe-lang-bar');
    const tabs = el('div', 'kpe-lang-tabs');

    (['zh', 'ja'] as const).forEach((l) => {
      const b = el('button', 'kpe-lang-tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(l === state.activeLang));
      if (l === state.activeLang) b.classList.add('is-active');
      const labelText = l === 'zh' ? '中' : '日';
      b.textContent = labelText;
      // 另一语种已有内容 → 显示 dot
      const otherLang: Lang = l === 'zh' ? 'ja' : 'zh';
      void otherLang; // dot reserved for future visual hint
      b.addEventListener('click', () => {
        if (state.activeLang === l) return;
        opts.store.update({ activeLang: l }, false);
        opts.onLangChange?.(l);
      });
      tabs.appendChild(b);
    });
    wrap.appendChild(tabs);

    // F5 sync 按钮（仅 zh.format != ja.format 时 enable）
    const ja = state.body.ja;
    if (ja && ja.format !== state.body.zh.format) {
      const aux = el('button', 'kpe-lang-aux');
      aux.type = 'button';
      aux.textContent = `F5 同步 format (ja: ${ja.format} → ${state.body.zh.format})`;
      aux.title = 'zh / ja format 不一致 — 点击同步到 zh.format（清空 ja 主体内容，导语保留）';
      aux.addEventListener('click', () => {
        opts.store.syncJaFormatToZh();
      });
      wrap.appendChild(aux);
    }

    host.appendChild(wrap);
  };

  render();
  opts.store.subscribe(render);
}
