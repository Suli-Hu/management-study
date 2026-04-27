/**
 * v0.5.66 视图系统 — TintedBadge 三档色生成
 *
 * 用户标签库存的是单个 hex（discipline.tags[].color）。设计稿要 soft/hex/deep 三档：
 *   - soft = 浅底（学派卡 count 徽章背景）
 *   - hex  = 中调（点状标识、强调线）
 *   - deep = 深字（徽章数字、tag 名）
 *
 * 思路（不依赖 oklch 库）：把 hex 转 HSL，soft 提亮+降饱和，deep 压暗+保饱和。
 * 同色相同饱和度系统化结果 ≈ oklch(L 0.12 H) 风格。
 */

export interface Tone {
  hex: string;
  soft: string;
  deep: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padStart(6, '0');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const k = (n: number) => {
    let t = h + n / 3;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [k(0) * 255, k(1) * 255, k(-1) * 255];
}

/**
 * 从单个 hex 生成 Tone 三档。
 *   soft: L≈0.92, S≈0.4 — 卡 badge 浅底
 *   deep: L≈0.32, S 保留 — 数字深字
 *   hex:  原值
 *
 * 规则：用 H（保留色相）+ 固定 L/S 模板，避免不同 tag 视觉冲突。
 */
export function toneFromHex(hex: string): Tone {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex.replace('#', '').padStart(6, '0'))) {
    // 无效 → 中性灰
    return { hex: '#737373', soft: '#f5f5f4', deep: '#404040' };
  }
  const [r, g, b] = hexToRgb(hex);
  const [h, s] = rgbToHsl(r, g, b);
  // soft: 高 L / 低 S → 浅静底色
  const [sr, sg, sb] = hslToRgb(h, Math.min(s, 0.42), 0.93);
  // deep: 低 L / 保 S → 深字色
  const [dr, dg, db] = hslToRgb(h, Math.max(s, 0.5), 0.32);
  return {
    hex: hex.startsWith('#') ? hex : `#${hex}`,
    soft: rgbToHex(sr, sg, sb),
    deep: rgbToHex(dr, dg, db),
  };
}

/** 中性 fallback（学派无 tag 时用） */
export const NEUTRAL_TONE: Tone = {
  hex: '#737373',
  soft: '#f5f5f4',
  deep: '#404040',
};
