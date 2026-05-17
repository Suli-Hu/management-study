/**
 * v0.11.77 KP 内联编辑 native — accordion format
 *
 * 两层嵌套：groups + 每组多 items。视觉 mirror 阅读态：
 *   - .body-lead / .acc-title / .acc-li-name / .acc-li-desc 加 contenteditable
 *   - 每个 acc-block (group) hover 右上角 × 删除按钮
 *   - 每个 acc-li (item) hover 右上角 × 删除按钮
 *   - 每个 group 末尾追加 + 添加条目（在 acc-numbered 内）
 *   - groups 末尾追加 + 添加分组（虚线 acc-block）
 *
 * acc-title 末尾的 .acc-sub (来自 splitSectionName 解析的 ((sub)))：
 *   - mount 时仍是 SSR 渲染的 <span class="acc-sub">，inline 显示灰小字
 *   - serializeMd 会把它 wrap 成 「（sub）」拼回 title 字符串
 *   - save 后下次 SSR 重新 split，循环 closed
 */

import type { AccordionBody } from '~/schemas/kp-body-structured';
import type { FormModule } from '~/lib/editor/forms/narrative';
import {
  serializeMd,
  setupContentEditable,
  attachMdShortcuts,
  createDeleteButton,
  escapeHtml,
} from '~/lib/inline-edit-md-shortcuts';

export function mountNativeAccordionEditor(
  bodyContainer: HTMLElement,
  initial: AccordionBody,
  onChange: (body: AccordionBody) => void,
): FormModule {
  let fmt = bodyContainer.querySelector('.body-fmt-acc') as HTMLElement | null;
  if (!fmt) {
    bodyContainer.innerHTML = buildEmptyAccordionShell(initial);
    fmt = bodyContainer.querySelector('.body-fmt-acc') as HTMLElement;
  }

  // v0.11.78: accordion 的 lead SSR 是 `.body-narrative`（用 renderParas 输出），
  //           不是 `.body-lead`。用 :scope > 限定 fmt 直接 child 防匹配嵌套 group 内的
  //           `.body-narrative`（虽然 group 内当前没用，但防御）。
  let leadEl = fmt.querySelector(':scope > .body-narrative') as HTMLElement | null;
  if (!leadEl) {
    leadEl = document.createElement('div');
    leadEl.className = 'body-narrative';
    const p = document.createElement('p');
    p.className = 'narrative-p';
    leadEl.appendChild(p);
    fmt.insertBefore(leadEl, fmt.firstChild);
  }
  setupContentEditable(leadEl, '总论 / 串场（可空）');

  // setup 已有 groups
  fmt.querySelectorAll<HTMLElement>('details.acc-block:not(.inline-edit-add-card)').forEach((group) => {
    setupGroup(group);
  });

  // 末尾 + 添加分组 button
  let addGroupBtn = fmt.querySelector('.inline-edit-add-group') as HTMLElement | null;
  if (!addGroupBtn) {
    addGroupBtn = createAddGroupBtn();
    fmt.appendChild(addGroupBtn);
  }

  function setupGroup(group: HTMLElement): void {
    group.classList.add('inline-edit-card');
    // .acc-title contenteditable
    const title = group.querySelector('.acc-title') as HTMLElement | null;
    if (title) setupContentEditable(title, '分组标题');

    // 删除整 group 的 × 按钮 — 放 acc-head 内右上角
    const head = group.querySelector('.acc-head') as HTMLElement | null;
    if (head && !head.querySelector('.inline-edit-del-btn')) {
      const del = createDeleteButton(() => {
        if (group.parentElement && group.parentElement.querySelectorAll('details.acc-block:not(.inline-edit-add-card)').length <= 1) {
          alert('至少保留 1 个分组');
          return;
        }
        group.remove();
        triggerChange();
      }, '删除分组');
      head.appendChild(del);
    }

    // setup 每个 item
    const ol = group.querySelector('.acc-numbered') as HTMLElement | null;
    if (ol) {
      ol.querySelectorAll<HTMLElement>('li.acc-li:not(.inline-edit-add-card)').forEach((li) => {
        setupItem(li);
      });

      // 末尾 + 添加条目
      let addItemBtn = ol.querySelector('.inline-edit-add-li') as HTMLElement | null;
      if (!addItemBtn) {
        addItemBtn = createAddItemBtn(ol);
        ol.appendChild(addItemBtn);
      }
    } else {
      // group 没 acc-numbered（empty items 时 SSR 是 .acc-prose）→ 创建 ol
      const prose = group.querySelector('.acc-prose');
      if (prose) prose.remove();
      const newOl = document.createElement('ol');
      newOl.className = 'acc-numbered';
      const addItemBtn = createAddItemBtn(newOl);
      newOl.appendChild(addItemBtn);
      group.appendChild(newOl);
    }
  }

  function setupItem(li: HTMLElement): void {
    li.classList.add('inline-edit-card');
    const name = li.querySelector('.acc-li-name') as HTMLElement | null;
    if (name) setupContentEditable(name, '条目名');
    const desc = li.querySelector('.acc-li-desc') as HTMLElement | null;
    if (desc) setupContentEditable(desc, '条目描述');
    if (!li.querySelector('.inline-edit-del-btn')) {
      const del = createDeleteButton(() => {
        li.remove();
        renumberItems();
        triggerChange();
      }, '删除条目');
      li.appendChild(del);
    }
  }

  function createAddGroupBtn(): HTMLElement {
    const b = document.createElement('details');
    b.className = 'acc-block inline-edit-add-card inline-edit-add-group';
    b.innerHTML = `
      <summary class="acc-head">
        <h3 class="acc-title inline-edit-add-label">+ 添加分组</h3>
      </summary>
    `;
    b.addEventListener('click', (e) => {
      // 阻止 details 自带 toggle 行为
      e.preventDefault();
      const blank = createBlankGroup();
      fmt!.insertBefore(blank, b);
      setupGroup(blank);
      const titleEl = blank.querySelector('.acc-title') as HTMLElement | null;
      titleEl?.focus();
      triggerChange();
    });
    return b;
  }

  function createBlankGroup(): HTMLElement {
    const g = document.createElement('details');
    g.className = 'acc-block';
    g.setAttribute('open', '');
    g.innerHTML = `
      <summary class="acc-head">
        <h3 class="acc-title"></h3>
        <span class="acc-chev">▾</span>
      </summary>
      <ol class="acc-numbered"></ol>
    `;
    return g;
  }

  function createAddItemBtn(ol: HTMLElement): HTMLElement {
    const li = document.createElement('li');
    li.className = 'acc-li inline-edit-add-card inline-edit-add-li';
    li.innerHTML = `
      <span class="acc-li-n">+</span>
      <div class="acc-li-body">
        <span class="acc-li-name inline-edit-add-label">添加条目</span>
      </div>
    `;
    li.addEventListener('click', () => {
      const blank = createBlankItem();
      ol.insertBefore(blank, li);
      setupItem(blank);
      renumberItems();
      const name = blank.querySelector('.acc-li-name') as HTMLElement | null;
      name?.focus();
      triggerChange();
    });
    return li;
  }

  function createBlankItem(): HTMLElement {
    const li = document.createElement('li');
    li.className = 'acc-li';
    li.innerHTML = `
      <span class="acc-li-n"></span>
      <div class="acc-li-body">
        <span class="acc-li-name"></span>
        <div class="acc-li-desc"></div>
      </div>
    `;
    return li;
  }

  function renumberItems(): void {
    fmt!.querySelectorAll<HTMLElement>('.acc-block:not(.inline-edit-add-card) .acc-numbered').forEach((ol) => {
      let n = 1;
      ol.querySelectorAll<HTMLElement>('li.acc-li:not(.inline-edit-add-card)').forEach((li) => {
        const numEl = li.querySelector('.acc-li-n');
        if (numEl) numEl.textContent = String(n++);
      });
    });
  }

  function parseToBody(): AccordionBody {
    const lead = leadEl ? serializeMd(leadEl) : '';
    const groups: AccordionBody['groups'] = [];
    fmt!.querySelectorAll<HTMLElement>('details.acc-block:not(.inline-edit-add-card)').forEach((block) => {
      const titleEl = block.querySelector('.acc-title');
      const title = titleEl ? serializeMd(titleEl) : '';
      const items: AccordionBody['groups'][number]['items'] = [];
      block.querySelectorAll<HTMLElement>('li.acc-li:not(.inline-edit-add-card)').forEach((li) => {
        const nameEl = li.querySelector('.acc-li-name');
        const descEl = li.querySelector('.acc-li-desc');
        items.push({
          name: nameEl ? serializeMd(nameEl) : '',
          desc: descEl ? serializeMd(descEl) : '',
        });
      });
      groups.push({ title, items });
    });
    return { format: 'accordion', lead, groups };
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

function buildEmptyAccordionShell(body: AccordionBody): string {
  const groupsHtml = body.groups
    .map((g) => {
      const itemsHtml = g.items
        .map(
          (it, i) => `
        <li class="acc-li">
          <span class="acc-li-n">${i + 1}</span>
          <div class="acc-li-body">
            <span class="acc-li-name">${escapeHtml(it.name)}</span>
            <div class="acc-li-desc">${escapeHtml(it.desc)}</div>
          </div>
        </li>
      `,
        )
        .join('');
      return `
        <details class="acc-block" open>
          <summary class="acc-head">
            <h3 class="acc-title">${escapeHtml(g.title)}</h3>
            <span class="acc-chev">▾</span>
          </summary>
          <ol class="acc-numbered">${itemsHtml}</ol>
        </details>
      `;
    })
    .join('');
  // v0.11.78: lead 用 .body-narrative 与 SSR 一致（renderParas 输出）
  const leadHtml = body.lead
    ? `<div class="body-narrative"><p class="narrative-p">${escapeHtml(body.lead)}</p></div>`
    : `<div class="body-narrative"><p class="narrative-p"></p></div>`;
  return `
    <div class="body-fmt body-fmt-acc" style="--accent:var(--text-3)">
      ${leadHtml}
      ${groupsHtml}
    </div>
  `;
}
