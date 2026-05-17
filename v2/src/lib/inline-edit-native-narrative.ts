/**
 * v0.11.77 KP 内联编辑 native — narrative format
 *
 * 单 prose 字段。视觉 mirror 阅读态：
 *   - 整个 .body-narrative 加 contenteditable
 *   - 段落 <p> 由浏览器 enter 自然处理（serializeMd 把 <p>/<div> 转 \n）
 *   - Cmd+B / Cmd+L 走 shared shortcuts
 */

import type { NarrativeBody } from '~/schemas/kp-body-structured';
import type { FormModule } from '~/lib/editor/forms/narrative';
import {
  serializeMd,
  setupContentEditable,
  attachMdShortcuts,
  escapeHtml,
} from '~/lib/inline-edit-md-shortcuts';

export function mountNativeNarrativeEditor(
  bodyContainer: HTMLElement,
  initial: NarrativeBody,
  onChange: (body: NarrativeBody) => void,
): FormModule {
  let fmt = bodyContainer.querySelector('.body-fmt-narr') as HTMLElement | null;
  if (!fmt) {
    bodyContainer.innerHTML = buildEmptyNarrativeShell(initial);
    fmt = bodyContainer.querySelector('.body-fmt-narr') as HTMLElement;
  }

  // .body-narrative wrapper (renderParas 输出)
  let narrEl = fmt.querySelector('.body-narrative') as HTMLElement | null;
  if (!narrEl) {
    narrEl = document.createElement('div');
    narrEl.className = 'body-narrative';
    fmt.appendChild(narrEl);
  }
  // 若 narrEl 内容为空，加一个空 <p> 让 contenteditable 有初始 block
  if (!narrEl.children.length && !narrEl.textContent?.trim()) {
    const p = document.createElement('p');
    p.className = 'narrative-p';
    narrEl.appendChild(p);
  }
  setupContentEditable(narrEl, '正文 — 一段或多段连续叙述');

  function parseToBody(): NarrativeBody {
    const prose = serializeMd(narrEl!);
    return { format: 'narrative', prose };
  }

  function triggerChange(): void {
    onChange(parseToBody());
  }

  const cleanup = attachMdShortcuts(fmt, triggerChange);
  triggerChange();

  return {
    destroy: () => cleanup(),
  };
}

function buildEmptyNarrativeShell(body: NarrativeBody): string {
  const paras = (body.prose ?? '').split(/\n/).map((p) => p.trim()).filter(Boolean);
  const paragraphsHtml =
    paras.length > 0
      ? paras.map((p) => `<p class="narrative-p">${escapeHtml(p)}</p>`).join('')
      : '<p class="narrative-p"></p>';
  return `
    <div class="body-fmt body-fmt-narr">
      <div class="body-narrative">${paragraphsHtml}</div>
    </div>
  `;
}
