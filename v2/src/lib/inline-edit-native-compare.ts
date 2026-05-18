/**
 * v0.11.84 KP 内联编辑 native — compare format（表格版）
 *
 * augment SSR 渲染的 .body-fmt-cmpc table：
 *   - .cmpc-th-col (列头) / .cmpc-th-row (行 label) / .cmpc-td (内容 cell) 都 contenteditable
 *   - hover col 头出 × 删列 / hover row 头出 × 删行（CSS opacity 控制）
 *   - thead 末尾 + 加列 cell；tbody 末尾 + 加行
 *   - lead (.body-narrative) 加 contenteditable，跟 accordion 一致
 *   - Cmd+B / Cmd+L 走 shared attachMdShortcuts
 *
 * 约束：
 *   - min cols 2, max cols 6
 *   - max rows 20 (cell max-height 200 + 内滚 by CSS)
 *
 * parseToBody 输出 new shape：{ format: 'compare', lead, headers, rows, cols: [] }
 */

import type { CompareBody } from '~/schemas/kp-body-structured';
import type { FormModule } from '~/lib/editor/forms/narrative';
import {
  serializeMd,
  setupContentEditable,
  attachMdShortcuts,
  escapeHtml,
} from '~/lib/inline-edit-md-shortcuts';

const MIN_COLS = 2;
const MAX_COLS = 6;
const MAX_ROWS = 20;

export function mountNativeCompareEditor(
  bodyContainer: HTMLElement,
  initial: CompareBody,
  onChange: (body: CompareBody) => void,
): FormModule {
  let fmt = bodyContainer.querySelector('.body-fmt-cmpc') as HTMLElement | null;
  if (!fmt) {
    bodyContainer.innerHTML = buildEmptyCompareShell(initial);
    fmt = bodyContainer.querySelector('.body-fmt-cmpc') as HTMLElement;
  }

  let table = fmt.querySelector('table.cmpc-table') as HTMLTableElement | null;
  if (!table) {
    const wrap = document.createElement('div');
    wrap.className = 'cmpc-table-wrap';
    wrap.innerHTML = buildEmptyCompareShell(initial);
    fmt.insertBefore(wrap, fmt.firstChild);
    table = wrap.querySelector('table.cmpc-table') as HTMLTableElement;
  }
  table.classList.add('inline-edit-active');

  // lead - SSR 用 .body-narrative
  let leadEl = fmt.querySelector(':scope > .body-narrative') as HTMLElement | null;
  if (!leadEl) {
    leadEl = document.createElement('div');
    leadEl.className = 'body-narrative';
    leadEl.style.marginTop = '18px';
    const p = document.createElement('p');
    p.className = 'narrative-p';
    leadEl.appendChild(p);
    fmt.appendChild(leadEl);
  }
  setupContentEditable(leadEl, '对比关系的引言（可空）');

  // Setup existing rows / cells
  setupAllCells();
  ensureAddButtons();
  updateButtonStates();

  function setupAllCells(): void {
    const thead = table!.querySelector('thead') as HTMLElement;
    const tbody = table!.querySelector('tbody') as HTMLElement;
    thead.querySelectorAll<HTMLElement>('.cmpc-th-col').forEach((th) => setupColHeader(th));
    tbody.querySelectorAll<HTMLElement>('tr').forEach((tr) => {
      if (tr.classList.contains('inline-edit-add-row-tr')) return;
      const label = tr.querySelector<HTMLElement>('.cmpc-th-row');
      if (label) setupRowHeader(label);
      tr.querySelectorAll<HTMLElement>('.cmpc-td').forEach((td) => setupCell(td));
    });
  }

  function setupColHeader(th: HTMLElement): void {
    setupContentEditable(th, '列头');
    if (!th.querySelector('.inline-edit-del-col')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inline-edit-del-col';
      btn.textContent = '×';
      btn.setAttribute('aria-label', '删除此列');
      btn.title = '删除此列';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentColCount() <= MIN_COLS) {
          alert(`至少保留 ${MIN_COLS} 列`);
          return;
        }
        const colIndex = colHeaderIndex(th);
        deleteColumn(colIndex);
      });
      th.appendChild(btn);
    }
  }

  function setupRowHeader(label: HTMLElement): void {
    setupContentEditable(label, '行字段名');
    if (!label.querySelector('.inline-edit-del-row')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inline-edit-del-row';
      btn.textContent = '×';
      btn.setAttribute('aria-label', '删除此行');
      btn.title = '删除此行';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = label.closest('tr');
        tr?.remove();
        triggerChange();
        updateButtonStates();
      });
      label.appendChild(btn);
    }
  }

  function setupCell(td: HTMLElement): void {
    setupContentEditable(td, '内容（可空）');
  }

  function colHeaderIndex(th: HTMLElement): number {
    const thead = table!.querySelector('thead') as HTMLElement;
    const heads = Array.from(thead.querySelectorAll<HTMLElement>('.cmpc-th-col'));
    return heads.indexOf(th);
  }

  function currentColCount(): number {
    return table!.querySelectorAll('thead .cmpc-th-col').length;
  }

  function currentRowCount(): number {
    return table!.querySelectorAll('tbody tr:not(.inline-edit-add-row-tr)').length;
  }

  function deleteColumn(colIndex: number): void {
    // 删 thead 对应 th
    const heads = table!.querySelectorAll<HTMLElement>('thead .cmpc-th-col');
    heads[colIndex]?.remove();
    // 删 tbody 每行的对应 td
    table!.querySelectorAll<HTMLElement>('tbody tr').forEach((tr) => {
      if (tr.classList.contains('inline-edit-add-row-tr')) return;
      const tds = tr.querySelectorAll<HTMLElement>('.cmpc-td');
      tds[colIndex]?.remove();
    });
    triggerChange();
    updateButtonStates();
  }

  function ensureAddButtons(): void {
    // 加列 button — thead tr 末尾插一个 th
    const headRow = table!.querySelector('thead tr') as HTMLElement;
    if (!headRow.querySelector('.inline-edit-add-col-th')) {
      const addColTh = document.createElement('th');
      addColTh.className = 'inline-edit-add-col-th';
      addColTh.innerHTML = `<button type="button" class="inline-edit-add-btn" aria-label="添加列">＋</button>`;
      addColTh.querySelector('button')!.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentColCount() >= MAX_COLS) {
          alert(`最多 ${MAX_COLS} 列`);
          return;
        }
        addColumn();
      });
      headRow.appendChild(addColTh);
    }
    // 加行 button — tbody 末尾插一个 tr
    const tbody = table!.querySelector('tbody') as HTMLElement;
    if (!tbody.querySelector('.inline-edit-add-row-tr')) {
      const addRowTr = document.createElement('tr');
      addRowTr.className = 'inline-edit-add-row-tr';
      // colspan = 当前 cols + 1 (label 列) + 1 (add col 占位)
      const colspan = currentColCount() + 2;
      addRowTr.innerHTML = `<td colspan="${colspan}" class="inline-edit-add-row-cell"><button type="button" class="inline-edit-add-btn" aria-label="添加行">＋ 添加行</button></td>`;
      addRowTr.querySelector('button')!.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentRowCount() >= MAX_ROWS) {
          alert(`最多 ${MAX_ROWS} 行`);
          return;
        }
        addRow();
      });
      tbody.appendChild(addRowTr);
    }
  }

  function addColumn(): void {
    // thead: 在最后一个 .cmpc-th-col 之后插一个新 th，再保证 add-col-th 在最后
    const thead = table!.querySelector('thead tr') as HTMLElement;
    const addBtn = thead.querySelector('.inline-edit-add-col-th') as HTMLElement;
    const newTh = document.createElement('th');
    newTh.className = 'cmpc-th-col';
    newTh.setAttribute('scope', 'col');
    thead.insertBefore(newTh, addBtn);
    setupColHeader(newTh);

    // tbody: 每行末尾插一个 .cmpc-td
    table!.querySelectorAll<HTMLElement>('tbody tr').forEach((tr) => {
      if (tr.classList.contains('inline-edit-add-row-tr')) {
        // 更新 colspan
        const cell = tr.querySelector('td');
        if (cell) cell.setAttribute('colspan', String(currentColCount() + 2));
        return;
      }
      const newTd = document.createElement('td');
      newTd.className = 'cmpc-td';
      tr.appendChild(newTd);
      setupCell(newTd);
    });

    newTh.focus();
    triggerChange();
    updateButtonStates();
  }

  function addRow(): void {
    const tbody = table!.querySelector('tbody') as HTMLElement;
    const addRowTr = tbody.querySelector('.inline-edit-add-row-tr');
    const newTr = document.createElement('tr');
    const labelTh = document.createElement('th');
    labelTh.className = 'cmpc-th-row';
    labelTh.setAttribute('scope', 'row');
    newTr.appendChild(labelTh);
    for (let i = 0; i < currentColCount(); i++) {
      const td = document.createElement('td');
      td.className = 'cmpc-td';
      newTr.appendChild(td);
    }
    tbody.insertBefore(newTr, addRowTr);
    setupRowHeader(labelTh);
    newTr.querySelectorAll<HTMLElement>('.cmpc-td').forEach((td) => setupCell(td));
    labelTh.focus();
    triggerChange();
    updateButtonStates();
  }

  function updateButtonStates(): void {
    const cols = currentColCount();
    const rows = currentRowCount();
    table!.querySelectorAll<HTMLButtonElement>('.inline-edit-del-col').forEach((b) => {
      b.disabled = cols <= MIN_COLS;
      b.title = cols <= MIN_COLS ? `至少保留 ${MIN_COLS} 列` : '删除此列';
    });
    const addColBtn = table!.querySelector<HTMLButtonElement>('.inline-edit-add-col-th button');
    if (addColBtn) {
      addColBtn.disabled = cols >= MAX_COLS;
      addColBtn.title = cols >= MAX_COLS ? `最多 ${MAX_COLS} 列` : '添加列';
    }
    const addRowBtn = table!.querySelector<HTMLButtonElement>('.inline-edit-add-row-tr button');
    if (addRowBtn) {
      addRowBtn.disabled = rows >= MAX_ROWS;
      addRowBtn.title = rows >= MAX_ROWS ? `最多 ${MAX_ROWS} 行` : '添加行';
    }
  }

  function parseToBody(): CompareBody {
    const lead = leadEl ? serializeMd(leadEl) : '';
    const thead = table!.querySelector('thead') as HTMLElement;
    const tbody = table!.querySelector('tbody') as HTMLElement;
    const headers: string[] = Array.from(thead.querySelectorAll<HTMLElement>('.cmpc-th-col')).map((th) => {
      // serializeMd 会把 button 节点内 text 也 serialize，所以先临时移除 button
      const btn = th.querySelector('.inline-edit-del-col');
      btn?.remove();
      const text = serializeMd(th);
      if (btn) th.appendChild(btn);
      return text;
    });
    const rows: Array<{ label: string; cells: string[] }> = [];
    tbody.querySelectorAll<HTMLElement>('tr').forEach((tr) => {
      if (tr.classList.contains('inline-edit-add-row-tr')) return;
      const labelEl = tr.querySelector<HTMLElement>('.cmpc-th-row');
      const cellEls = tr.querySelectorAll<HTMLElement>('.cmpc-td');
      let label = '';
      if (labelEl) {
        const btn = labelEl.querySelector('.inline-edit-del-row');
        btn?.remove();
        label = serializeMd(labelEl);
        if (btn) labelEl.appendChild(btn);
      }
      const cells = Array.from(cellEls).map((td) => serializeMd(td));
      rows.push({ label, cells });
    });
    return {
      format: 'compare',
      lead,
      headers,
      rows,
      cols: [], // 清空 legacy 字段
    };
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

function buildEmptyCompareShell(body: CompareBody): string {
  // 兜底空 shell（若 SSR 没 .body-fmt-cmpc）— 用 body 数据重建 minimal
  const headers = body.headers && body.headers.length > 0 ? body.headers : ['列 1', '列 2'];
  const rows = body.rows && body.rows.length > 0 ? body.rows : [];
  const headRow = `
    <tr>
      <th class="cmpc-th-corner" aria-hidden="true"></th>
      ${headers.map((h) => `<th class="cmpc-th-col" scope="col">${escapeHtml(h)}</th>`).join('')}
    </tr>
  `;
  const bodyRows = rows
    .map(
      (r) => `
    <tr>
      <th class="cmpc-th-row" scope="row">${escapeHtml(r.label)}</th>
      ${r.cells.map((c) => `<td class="cmpc-td">${escapeHtml(c)}</td>`).join('')}
    </tr>
  `,
    )
    .join('');
  return `
    <div class="body-fmt body-fmt-cmpc" style="--accent:var(--text-3)">
      <div class="cmpc-table-wrap">
        <table class="cmpc-table">
          <thead>${headRow}</thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <div class="body-narrative" style="margin-top:18px">
        <p class="narrative-p">${escapeHtml(body.lead ?? '')}</p>
      </div>
    </div>
  `;
}
