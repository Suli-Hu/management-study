/**
 * Color picker — 6 预设色 + hex 兜底（v0.5.18 · Phase A）
 *
 * 由 admin/tags.astro 调用：
 *   const cp = mountColorPicker(mount, { initial: '#3B82F6', onChange: (hex) => ... });
 *   cp.getValue();        // 当前 hex
 *   cp.setValue('#abc');  // 程序设值
 *   cp.destroy();
 *
 * UI: 6 个圆点（点选）+ 一行小 hex 输入（自由色 / 显示当前值）
 */

export const TAG_COLOR_PRESETS = [
  { hex: '#3B82F6', label: '蓝' },
  { hex: '#10B981', label: '翠' },
  { hex: '#F59E0B', label: '琥珀' },
  { hex: '#EF4444', label: '朱' },
  { hex: '#8B5CF6', label: '紫' },
  { hex: '#8A7A6A', label: 'taupe' },
] as const;

export interface MountColorPickerOpts {
  initial?: string;
  onChange?: (hex: string) => void;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
function normalizeHex(s: string): string | null {
  const v = s.trim();
  if (!HEX_RE.test(v)) return null;
  return '#' + v.slice(1).toUpperCase();
}

export function mountColorPicker(
  mount: HTMLElement,
  opts: MountColorPickerOpts = {},
): { getValue: () => string; setValue: (hex: string) => void; destroy: () => void } {
  const initial = (opts.initial && normalizeHex(opts.initial)) ?? TAG_COLOR_PRESETS[0].hex;
  let current = initial;

  mount.classList.add('cp-root');
  mount.innerHTML = `
    <div class="cp-presets">
      ${TAG_COLOR_PRESETS.map((p) => `
        <button type="button" class="cp-swatch" data-cp-preset="${p.hex}" aria-label="${p.label} ${p.hex}" title="${p.label} ${p.hex}" style="background:${p.hex}"></button>
      `).join('')}
    </div>
    <div class="cp-hex">
      <span class="cp-hex-dot" data-cp-dot></span>
      <input type="text" class="cp-hex-input" data-cp-input maxlength="7" placeholder="#RRGGBB" />
    </div>
  `;

  const dot = mount.querySelector('[data-cp-dot]') as HTMLElement | null;
  const input = mount.querySelector('[data-cp-input]') as HTMLInputElement | null;
  const swatches = Array.from(mount.querySelectorAll('[data-cp-preset]')) as HTMLButtonElement[];

  function syncUI() {
    if (dot) dot.style.background = current;
    if (input && input.value !== current) input.value = current;
    for (const sw of swatches) {
      const isActive = (sw.getAttribute('data-cp-preset') ?? '').toUpperCase() === current.toUpperCase();
      sw.classList.toggle('is-active', isActive);
    }
  }

  function setValue(next: string) {
    const norm = normalizeHex(next);
    if (!norm) return;
    if (norm === current) return;
    current = norm;
    syncUI();
    opts.onChange?.(current);
  }

  for (const sw of swatches) {
    sw.addEventListener('click', () => {
      const v = sw.getAttribute('data-cp-preset');
      if (v) setValue(v);
    });
  }
  if (input) {
    input.addEventListener('input', () => {
      const norm = normalizeHex(input.value);
      if (norm) {
        if (norm !== current) {
          current = norm;
          syncUI();
          opts.onChange?.(current);
        }
      }
    });
    input.addEventListener('blur', () => {
      // 失焦时若不合法，恢复成 current
      if (!normalizeHex(input.value)) input.value = current;
    });
  }

  syncUI();

  return {
    getValue: () => current,
    setValue,
    destroy: () => { mount.innerHTML = ''; mount.classList.remove('cp-root'); },
  };
}
