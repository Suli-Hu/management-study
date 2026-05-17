/**
 * v0.11.77 inline-edit 共享 helper — markdown serializer + keyboard shortcuts
 *
 * 4 个 native format editor 复用：
 *   - serializeMd: DOM (contenteditable) → markdown string
 *   - attachMdShortcuts: 监听 Cmd+B / Cmd+L / paste，调 onChange
 *   - setupContentEditable: 给元素加 contenteditable + 占位符
 */

/**
 * contenteditable DOM → markdown string serializer
 *   <strong>/<b>      → **xx**
 *   <span.md-fine>    → ~xx~
 *   <span.acc-sub>    → （xx）  — accordion title 末尾括号语法糖兼容
 *   <br>              → \n
 *   <div>/<p>         → \n + content (contenteditable 自动包 div 当换行)
 */
export function serializeMd(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as Element;
      const tag = e.tagName;
      if (tag === 'STRONG' || tag === 'B') {
        out += `**${serializeMd(e)}**`;
      } else if (tag === 'SPAN' && e.classList.contains('md-fine')) {
        out += `~${serializeMd(e)}~`;
      } else if (tag === 'SPAN' && e.classList.contains('acc-sub')) {
        out += `（${serializeMd(e)}）`;
      } else if (tag === 'BR') {
        out += '\n';
      } else if (tag === 'DIV' || tag === 'P') {
        if (out && !out.endsWith('\n')) out += '\n';
        out += serializeMd(e);
      } else {
        out += serializeMd(e);
      }
    }
  }
  return out.trim();
}

/**
 * 给元素加 contenteditable + 占位符 + .inline-edit-editable class
 */
export function setupContentEditable(el: HTMLElement, placeholder?: string): void {
  el.contentEditable = 'true';
  el.classList.add('inline-edit-editable');
  if (placeholder) el.dataset.placeholder = placeholder;
}

/**
 * 挂 markdown 快捷键 + paste handler 到 rootEl。
 * 返回 cleanup 函数。
 */
export function attachMdShortcuts(
  rootEl: HTMLElement,
  triggerChange: () => void,
): () => void {
  const onPaste = (e: ClipboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest?.('.inline-edit-editable')) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  };
  rootEl.addEventListener('paste', onPaste);

  const onKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest?.('.inline-edit-editable')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      toggleWrap('strong');
      triggerChange();
      return;
    }
    if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      toggleWrap('span', 'md-fine');
      triggerChange();
    }
  };

  /**
   * 通用：选中文字若已在指定 tag/class 内 → unwrap；否则包一层。
   * v0.11.79: 取代 execCommand('bold')，统一用 <strong>（execCommand 默认产 <b> 跟 SSR strong 字重不一致）。
   */
  function toggleWrap(tag: string, className?: string): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    const matchSelector = className ? `${tag}.${className}` : tag;
    const ancestor = range.commonAncestorContainer.parentElement;
    const existing = ancestor?.closest?.(matchSelector);
    if (existing) {
      const parent = existing.parentNode;
      while (existing.firstChild) {
        parent?.insertBefore(existing.firstChild, existing);
      }
      existing.remove();
      return;
    }
    const wrap = document.createElement(tag);
    if (className) wrap.className = className;
    try {
      range.surroundContents(wrap);
    } catch {
      const frag = range.extractContents();
      wrap.appendChild(frag);
      range.insertNode(wrap);
    }
  }
  rootEl.addEventListener('keydown', onKeydown);

  const onInput = () => triggerChange();
  rootEl.addEventListener('input', onInput);

  return () => {
    rootEl.removeEventListener('paste', onPaste);
    rootEl.removeEventListener('keydown', onKeydown);
    rootEl.removeEventListener('input', onInput);
  };
}

/** 创建一个 hover 才显示的 × 删除按钮 */
export function createDeleteButton(onClick: () => void, ariaLabel = '删除'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'inline-edit-del-btn';
  btn.textContent = '×';
  btn.setAttribute('aria-label', ariaLabel);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export { escapeHtml };
