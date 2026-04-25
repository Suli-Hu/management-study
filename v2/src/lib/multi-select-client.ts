/**
 * Multi-select typeahead 组件 (v0.4.11)
 *
 * 用于 KP/学者 编辑页选学派/学者：搜索框 + 已选 chips（带 × 删除）+ 下拉过滤候选。
 * - 默认显示已选 + search input
 * - input focus → 显示下拉（默认列全部）
 * - input typing → label/sub 子串 filter
 * - 已选 hidden input 同步进 container（form collect() 直接 querySelectorAll）
 * - required=true 时空选会加红边提示（schema 也会拒）
 */

export interface MultiSelectOption {
  key: string;
  label: string;     // 主显示
  sub?: string;      // 副显示 + 也参与搜索（如 English 名）
}

export interface MultiSelectOptions {
  inputName: string;          // hidden input name，form collect() 读这个
  options: MultiSelectOption[];
  selected?: string[];
  placeholder?: string;
  required?: boolean;
  onChange?: (selected: string[]) => void;
}

export interface MultiSelectAPI {
  setSelected(keys: string[]): void;
  getSelected(): string[];
  destroy(): void;
}

export function mountMultiSelect(container: HTMLElement, opts: MultiSelectOptions): MultiSelectAPI {
  const optionByKey = new Map(opts.options.map((o) => [o.key, o]));
  let selected: string[] = [...(opts.selected ?? [])];

  // 根 wrapper
  container.classList.add('relative');
  container.innerHTML = '';

  const box = document.createElement('div');
  box.className = 'flex flex-wrap items-center gap-1 min-h-[34px] border rounded-md px-2 py-1 bg-bg-primary focus-within:border-accent-strategy';
  container.appendChild(box);

  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = opts.placeholder ?? '搜索...';
  search.className = 'flex-1 min-w-[120px] outline-none bg-transparent text-sm px-1 py-0.5';
  search.autocomplete = 'off';

  const dropdown = document.createElement('div');
  dropdown.className = 'absolute z-20 left-0 right-0 max-h-60 overflow-y-auto border rounded-md bg-bg-primary shadow-card hidden mt-1';
  container.appendChild(dropdown);

  function renderChips() {
    // 清掉旧 chips + hidden inputs，保留 search
    [...box.children].forEach((c) => { if (c !== search) box.removeChild(c); });
    selected.forEach((key) => {
      const opt = optionByKey.get(key);
      if (!opt) return;
      const chip = document.createElement('span');
      chip.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-tertiary text-xs';
      const lbl = document.createElement('span');
      lbl.textContent = opt.label;
      chip.appendChild(lbl);
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.className = 'text-quaternary hover:text-accent-warning text-sm leading-none -mr-0.5';
      x.addEventListener('click', () => {
        selected = selected.filter((k) => k !== key);
        renderChips();
        renderDropdown();
        opts.onChange?.(selected);
      });
      chip.appendChild(x);
      box.insertBefore(chip, search);

      // hidden input 给 form 用
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = opts.inputName;
      hidden.value = key;
      container.appendChild(hidden);
    });
    box.classList.toggle('border-accent-warning', !!opts.required && selected.length === 0);
  }

  function renderDropdown() {
    const q = search.value.trim().toLowerCase();
    dropdown.innerHTML = '';
    const candidates = opts.options.filter((o) => {
      if (selected.includes(o.key)) return false;
      if (!q) return true;
      const hay = `${o.label} ${o.sub ?? ''} ${o.key}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 50); // 上限 50 防爆

    if (candidates.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'px-3 py-2 text-xs text-quaternary';
      empty.textContent = q ? `无匹配「${q}」` : '已全部选完';
      dropdown.appendChild(empty);
      return;
    }
    candidates.forEach((opt) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'w-full text-left px-3 py-1.5 text-sm hover:bg-bg-tertiary flex items-center gap-2';
      const main = document.createElement('span');
      main.textContent = opt.label;
      row.appendChild(main);
      if (opt.sub) {
        const sub = document.createElement('span');
        sub.className = 'text-xs text-quaternary';
        sub.textContent = opt.sub;
        row.appendChild(sub);
      }
      // mousedown not click —— 防 input blur 先 fire 把 dropdown 关了
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!selected.includes(opt.key)) selected.push(opt.key);
        search.value = '';
        renderChips();
        renderDropdown();
        opts.onChange?.(selected);
        search.focus();
      });
      dropdown.appendChild(row);
    });
  }

  function showDropdown() { dropdown.classList.remove('hidden'); renderDropdown(); }
  function hideDropdown() { dropdown.classList.add('hidden'); }

  // 容器与 dropdown 绝对定位需要 top 紧贴 box
  function positionDropdown() {
    const rect = box.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom - containerRect.top}px`;
  }

  search.addEventListener('focus', () => { positionDropdown(); showDropdown(); });
  search.addEventListener('input', () => { positionDropdown(); renderDropdown(); });
  search.addEventListener('blur', () => {
    // 短延迟，让 mousedown 先 fire
    setTimeout(hideDropdown, 150);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && search.value === '' && selected.length > 0) {
      selected.pop();
      renderChips();
      renderDropdown();
      opts.onChange?.(selected);
    } else if (e.key === 'Escape') {
      hideDropdown();
      search.blur();
    }
  });
  // 点 box 外触发 input focus（更易用）
  box.addEventListener('click', (e) => {
    if (e.target === box) search.focus();
  });

  box.appendChild(search);
  renderChips();

  return {
    setSelected(keys: string[]) {
      selected = [...keys];
      renderChips();
      renderDropdown();
    },
    getSelected() { return [...selected]; },
    destroy() { container.innerHTML = ''; },
  };
}
