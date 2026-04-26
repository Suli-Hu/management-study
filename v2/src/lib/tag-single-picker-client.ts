/**
 * Tag single-picker（v0.5.19 · Phase B/C）
 *
 * 单选 tag chip 行 + 「无」清空按钮。tags 数组的 UI 化简版：选 0 或 1 个 tag。
 *
 * 用法：
 *   const picker = mountTagSinglePicker(mount, {
 *     options: [{ key, label, color }, ...],
 *     initial: 'ob_classic' | null,
 *     onChange: (key | null) => ...
 *   });
 *   picker.getValue();   // string | null
 *   picker.setValue(k);  // 程序设值
 *
 * 输出：调用方 collect() 把 picker.getValue() 包成 tags 数组：
 *   tags: picker.getValue() ? [picker.getValue()!] : []
 */

export interface TagOption {
  key: string;
  label: string;
  color: string;
}

export interface MountTagSinglePickerOpts {
  options: TagOption[];
  initial?: string | null;
  onChange?: (key: string | null) => void;
  /** 没有任何 tag 库可选时显示的提示文字 */
  emptyHint?: string;
}

export function mountTagSinglePicker(
  mount: HTMLElement,
  opts: MountTagSinglePickerOpts,
): {
  getValue: () => string | null;
  setValue: (key: string | null) => void;
  destroy: () => void;
} {
  let current: string | null = opts.initial ?? null;
  const options = opts.options ?? [];

  mount.classList.add('tsp-root');

  if (options.length === 0) {
    mount.innerHTML = `
      <div class="tsp-empty">
        ${opts.emptyHint ?? '暂无标签可选 — '}<a href="../admin/tags">先去标签库添加</a>
      </div>
    `;
    return {
      getValue: () => null,
      setValue: () => {},
      destroy: () => { mount.innerHTML = ''; mount.classList.remove('tsp-root'); },
    };
  }

  function render() {
    const chips: string[] = [];
    chips.push(`
      <button type="button" class="tsp-chip tsp-chip--none ${current === null ? 'is-active' : ''}" data-tag-key="">
        无
      </button>
    `);
    for (const o of options) {
      const isActive = current === o.key;
      chips.push(`
        <button type="button" class="tsp-chip ${isActive ? 'is-active' : ''}" data-tag-key="${o.key}" style="--tsp-color:${o.color}">
          <span class="tsp-dot"></span>${o.label}
        </button>
      `);
    }
    mount.innerHTML = `<div class="tsp-row">${chips.join('')}</div>`;
    bind();
  }

  function bind() {
    const buttons = Array.from(mount.querySelectorAll('[data-tag-key]')) as HTMLButtonElement[];
    for (const btn of buttons) {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-tag-key') ?? '';
        const next = key === '' ? null : key;
        if (next === current) return;
        current = next;
        render();
        opts.onChange?.(current);
      });
    }
  }

  function setValue(key: string | null) {
    if (key !== null && !options.some((o) => o.key === key)) return; // unknown key, ignore
    if (key === current) return;
    current = key;
    render();
    opts.onChange?.(current);
  }

  render();

  return {
    getValue: () => current,
    setValue,
    destroy: () => { mount.innerHTML = ''; mount.classList.remove('tsp-root'); },
  };
}
