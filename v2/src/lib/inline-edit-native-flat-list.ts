/**
 * v0.11.75 KP 内联编辑 phase 3 PoC — flat-list format native 编辑器
 *
 * 真"原生"路径：
 *   - 不 wipe bodyContainer，保留 SSR 渲染的 .body-fmt-flat HTML 结构
 *   - 给 .body-lead / .body-item-name / .body-item-desc 加 contenteditable
 *   - hover .body-card 显示右上角 × 删除按钮
 *   - 末尾追加 + 添加条目 card（虚线 dashed）
 *   - listen input → parse DOM 还原 FlatListBody → onChange
 *
 * 视觉天然 mirror 阅读态（同一段 SSR HTML 加 contenteditable）。
 *
 * PoC scope：
 *   - 仅 flat-list
 *   - 仅 zh（ja 走老 mountFlatListForm，避免 PoC 膨胀）
 *   - inline 格式标记（**bold**）暂用 plaintext，不 serialize markdown
 */

import type { FlatListBody } from '~/schemas/kp-body-structured';
import type { FormModule } from '~/lib/editor/forms/narrative';

export function mountNativeFlatListEditor(
  bodyContainer: HTMLElement,
  initial: FlatListBody,
  onChange: (body: FlatListBody) => void,
): FormModule {
  // 找 SSR 渲染的 .body-fmt-flat 容器
  let fmt = bodyContainer.querySelector('.body-fmt-flat') as HTMLElement | null;
  if (!fmt) {
    // SSR 时可能因为 empty body 没渲染 — 兜底从 initial 重建结构
    bodyContainer.innerHTML = buildEmptyFlatListShell(initial);
    fmt = bodyContainer.querySelector('.body-fmt-flat') as HTMLElement;
  }

  // 1. Lead — 若不存在 SSR 节点（lead 为空 KP）创建一个 placeholder
  let leadEl = fmt.querySelector('.body-lead') as HTMLElement | null;
  if (!leadEl) {
    leadEl = document.createElement('div');
    leadEl.className = 'body-lead';
    fmt.insertBefore(leadEl, fmt.firstChild);
  }
  leadEl.contentEditable = 'true';
  leadEl.classList.add('inline-edit-editable');
  leadEl.dataset.placeholder = '一句话引出条目（可空）';

  // 2. Items container — 确保存在
  let itemsEl = fmt.querySelector('.body-items') as HTMLElement | null;
  if (!itemsEl) {
    itemsEl = document.createElement('div');
    itemsEl.className = 'body-items';
    fmt.appendChild(itemsEl);
  }

  // 3. 给每个 card setup contenteditable + 删除按钮
  itemsEl.querySelectorAll<HTMLElement>('.body-card:not(.inline-edit-add-card)').forEach((card) => {
    setupCard(card);
  });

  // 4. 在 items 末尾插入 + 添加 card
  let addCard = itemsEl.querySelector('.inline-edit-add-card') as HTMLElement | null;
  if (!addCard) {
    addCard = createAddCard();
    itemsEl.appendChild(addCard);
  }

  function setupCard(card: HTMLElement): void {
    const name = card.querySelector('.body-item-name') as HTMLElement | null;
    if (name) {
      name.contentEditable = 'true';
      name.classList.add('inline-edit-editable');
      name.dataset.placeholder = '名称（必填）';
    }
    const desc = card.querySelector('.body-item-desc') as HTMLElement | null;
    if (desc) {
      desc.contentEditable = 'true';
      desc.classList.add('inline-edit-editable');
      desc.dataset.placeholder = '描述（必填）';
    }
    // 添加 × 删除按钮 (hover 显示)
    if (!card.querySelector('.inline-edit-del-btn')) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'inline-edit-del-btn';
      del.textContent = '×';
      del.setAttribute('aria-label', '删除条目');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        card.remove();
        renumberCards();
        triggerChange();
      });
      card.appendChild(del);
    }
    card.classList.add('inline-edit-card');
  }

  function createAddCard(): HTMLElement {
    const c = document.createElement('div');
    c.className = 'body-card inline-edit-add-card';
    c.innerHTML = `
      <div class="body-num">+</div>
      <div class="body-card-content">
        <div class="body-item-name inline-edit-add-label">添加条目</div>
      </div>
    `;
    c.addEventListener('click', () => {
      const blank = createBlankCard();
      itemsEl!.insertBefore(blank, c);
      setupCard(blank);
      renumberCards();
      (blank.querySelector('.body-item-name') as HTMLElement)?.focus();
      triggerChange();
    });
    return c;
  }

  function createBlankCard(): HTMLElement {
    const c = document.createElement('div');
    c.className = 'body-card';
    c.innerHTML = `
      <div class="body-num"></div>
      <div class="body-card-content">
        <div class="body-item-name"></div>
        <div class="body-item-desc"></div>
      </div>
    `;
    return c;
  }

  function renumberCards(): void {
    let n = 1;
    itemsEl!.querySelectorAll<HTMLElement>('.body-card').forEach((card) => {
      if (card.classList.contains('inline-edit-add-card')) return;
      const num = card.querySelector('.body-num');
      if (num) num.textContent = String(n++);
    });
  }

  function parseToBody(): FlatListBody {
    const lead = leadEl ? serializeMd(leadEl) : '';
    const items: FlatListBody['items'] = [];
    itemsEl!.querySelectorAll<HTMLElement>('.body-card:not(.inline-edit-add-card)').forEach((card) => {
      const nameEl = card.querySelector('.body-item-name');
      const descEl = card.querySelector('.body-item-desc');
      const name = nameEl ? serializeMd(nameEl) : '';
      const desc = descEl ? serializeMd(descEl) : '';
      items.push({ name, desc });
    });
    return { format: 'flat-list', lead, items };
  }

  function triggerChange(): void {
    onChange(parseToBody());
  }

  // Listen input + paste (plaintext only)
  const onInput = () => triggerChange();
  fmt.addEventListener('input', onInput);

  const onPaste = (e: ClipboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest?.('.inline-edit-editable')) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  };
  fmt.addEventListener('paste', onPaste);

  // v0.11.76 keyboard shortcuts — Cmd+B 加粗 / Cmd+L 灰细字
  const onKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest?.('.inline-edit-editable')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      // execCommand bold 在 contenteditable 内插入 <b> / <strong>
      document.execCommand('bold');
      triggerChange();
      return;
    }
    if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return; // 没选中文字 → no-op
      // 如果已在 .md-fine 内 → 取消标记
      const ancestor = range.commonAncestorContainer.parentElement;
      const existingFine = ancestor?.closest?.('.md-fine');
      if (existingFine) {
        // unwrap: 把 .md-fine 内容提到 parent，删 .md-fine 节点
        const parent = existingFine.parentNode;
        while (existingFine.firstChild) {
          parent?.insertBefore(existingFine.firstChild, existingFine);
        }
        existingFine.remove();
      } else {
        // wrap: 选中文字包 <span class="md-fine">
        const span = document.createElement('span');
        span.className = 'md-fine';
        try {
          range.surroundContents(span);
        } catch {
          // 选区跨多节点 surroundContents 会抛 — fallback：extractContents 重新插入
          const frag = range.extractContents();
          span.appendChild(frag);
          range.insertNode(span);
        }
      }
      triggerChange();
    }
  };
  fmt.addEventListener('keydown', onKeydown);

  // Initial trigger，避免 initial state.currentBody 没 sync
  triggerChange();

  return {
    destroy: () => {
      fmt!.removeEventListener('input', onInput);
      fmt!.removeEventListener('paste', onPaste);
      fmt!.removeEventListener('keydown', onKeydown);
    },
  };
}

/**
 * v0.11.76 contenteditable DOM → markdown string serializer
 * <strong>/<b> → **xx**, <span.md-fine> → ~xx~, <br> → \n, 其他 → textContent
 */
function serializeMd(el: Element): string {
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
      } else if (tag === 'BR') {
        out += '\n';
      } else if (tag === 'DIV' || tag === 'P') {
        // contenteditable 自动插入 div / p 作为换行 — 转换为 \n
        if (out && !out.endsWith('\n')) out += '\n';
        out += serializeMd(e);
      } else {
        out += serializeMd(e);
      }
    }
  }
  return out.trim();
}

function buildEmptyFlatListShell(body: FlatListBody): string {
  // 兜底：用最简结构构建（accentHex 不重要，inline edit 不显示样式色）
  return `
    <div class="body-fmt body-fmt-flat" style="--accent:var(--text-3)">
      <div class="body-lead">${escapeHtml(body.lead ?? '')}</div>
      <div class="body-items">
        ${body.items
          .map(
            (it, i) => `
          <div class="body-card">
            <div class="body-num">${i + 1}</div>
            <div class="body-card-content">
              <div class="body-item-name">${escapeHtml(it.name)}</div>
              <div class="body-item-desc">${escapeHtml(it.desc)}</div>
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
