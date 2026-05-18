/**
 * v0.11.77 KP 内联编辑 native — flat-list format
 * (v0.11.75 PoC，v0.11.77 refactor 用 shared md-shortcuts lib)
 *
 * 视觉 mirror 阅读态：
 *   - 不 wipe bodyContainer，保留 SSR 渲染的 .body-fmt-flat HTML
 *   - .body-lead / .body-item-name / .body-item-desc 加 contenteditable
 *   - hover .body-card 显示右上角 × 删除
 *   - 末尾追加 + 添加条目 card（虚线 dashed）
 *   - listen input → parse DOM 还原 FlatListBody → onChange
 */

import type { FlatListBody } from '~/schemas/kp-body-structured';
import type { FormModule } from '~/lib/editor/forms/narrative';
import {
  serializeMd,
  setupContentEditable,
  attachMdShortcuts,
  createDeleteButton,
  escapeHtml,
} from '~/lib/inline-edit-md-shortcuts';
import { mountDragReorder } from '~/lib/drag-reorder-client';

let _dragInstanceSeq = 0;

export function mountNativeFlatListEditor(
  bodyContainer: HTMLElement,
  initial: FlatListBody,
  onChange: (body: FlatListBody) => void,
): FormModule {
  let fmt = bodyContainer.querySelector('.body-fmt-flat') as HTMLElement | null;
  if (!fmt) {
    bodyContainer.innerHTML = buildEmptyFlatListShell(initial);
    fmt = bodyContainer.querySelector('.body-fmt-flat') as HTMLElement;
  }

  let leadEl = fmt.querySelector('.body-lead') as HTMLElement | null;
  if (!leadEl) {
    leadEl = document.createElement('div');
    leadEl.className = 'body-lead';
    fmt.insertBefore(leadEl, fmt.firstChild);
  }
  setupContentEditable(leadEl, '一句话引出条目（可空）');

  let itemsEl = fmt.querySelector('.body-items') as HTMLElement | null;
  if (!itemsEl) {
    itemsEl = document.createElement('div');
    itemsEl.className = 'body-items';
    fmt.appendChild(itemsEl);
  }

  itemsEl.querySelectorAll<HTMLElement>('.body-card:not(.inline-edit-add-card)').forEach((card) => {
    setupCard(card);
  });

  let addCard = itemsEl.querySelector('.inline-edit-add-card') as HTMLElement | null;
  if (!addCard) {
    addCard = createAddCard();
    itemsEl.appendChild(addCard);
  }

  function setupCard(card: HTMLElement): void {
    const name = card.querySelector('.body-item-name') as HTMLElement | null;
    if (name) setupContentEditable(name, '名称（必填）');
    const desc = card.querySelector('.body-item-desc') as HTMLElement | null;
    if (desc) setupContentEditable(desc, '描述（必填）');
    if (!card.querySelector('.inline-edit-del-btn')) {
      const del = createDeleteButton(() => {
        card.remove();
        renumberCards();
        triggerChange();
      }, '删除条目');
      card.appendChild(del);
    }
    // v0.11.86: drag handle (hover 才显示，长按拖动改顺序)
    if (!card.querySelector('.inline-edit-drag-handle')) {
      const handle = document.createElement('span');
      handle.className = 'inline-edit-drag-handle';
      handle.textContent = '⋮⋮';
      handle.setAttribute('aria-hidden', 'true');
      handle.title = '长按拖动改顺序';
      card.appendChild(handle);
    }
    if (!card.dataset.dragId) {
      card.dataset.dragId = `c${++_dragInstanceSeq}`;
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
      items.push({
        name: nameEl ? serializeMd(nameEl) : '',
        desc: descEl ? serializeMd(descEl) : '',
      });
    });
    return { format: 'flat-list', lead, items };
  }

  function triggerChange(): void {
    onChange(parseToBody());
  }

  const cleanup = attachMdShortcuts(fmt, triggerChange);

  // v0.11.86 mount drag-reorder on items container
  const dragGroup = `inline-flat-${++_dragInstanceSeq}`;
  const drag = mountDragReorder(itemsEl, {
    group: dragGroup,
    dragHandleSelector: '.inline-edit-drag-handle',
    skipSelector: 'input, textarea, button, [contenteditable="true"]',
    getId: (el) => el.dataset.dragId ?? null,
    onReorder: () => {
      renumberCards();
      triggerChange();
    },
  });

  triggerChange();

  return {
    destroy: () => {
      drag.destroy();
      cleanup();
    },
  };
}

function buildEmptyFlatListShell(body: FlatListBody): string {
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
