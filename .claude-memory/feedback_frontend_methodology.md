---
name: 前端问题排查方法论
description: 全局扫描再修、用真实设备尺寸自测、Safari/iOS 坑清单、回归测试断点清单
type: feedback
scope: engineering-only
originSessionId: 83912dfd-dab7-4ab8-81fc-2b38245f101f
---
## 1. 排查：先全局扫描，再动手修

**Why:** 曾经底部空白问题来回改 5 次，根因是 `padding-bottom` 散布在 6 个不同 media query 里（默认 / 601-960px / <600px / 分栏模式），每次只改一处遗漏其他断点。

**How to apply:**
1. 修改前先 grep 所有相关 CSS 属性（padding-bottom、margin-bottom、height、safe-area 等），列完整清单
2. 理解每个值在每个断点下的作用
3. 一次性统一改，不要逐个修补表面症状

## 2. 自测：用真实设备尺寸，不是缩放

**Why:** 曾用 zoom=0.5 的缩放预览"看起来没空白"就报修好了，但实际 iPad 上仍有问题。缩放 ≠ 真实视口。

**How to apply:**
1. `preview_resize` 到真实设备尺寸：
   - iPhone 竖屏 375×812
   - iPad Mini 竖屏 744×1133 / 横屏 1133×744
   - 桌面 1280×800
2. 竖横屏都测
3. 滚动到底部确认无多余空白
4. 用 JS 验证 `scrollHeight` vs `clientHeight` 确认真的到底

## 3. Safari/iOS 特有坑清单

1. **`opacity:0` 不阻止触摸** — 必须配 `pointer-events:none`
2. **flex 嵌套 `height:100%` 在 Safari 常失效** — 用 `position:absolute; top:0; bottom:0` 或 `min-height:0` 替代
3. **`env(safe-area-inset-bottom)` 会叠加** — 外层和内层都加会双倍，只在最内层加一次
4. **禁止 viewport 缩放** — 需要 `user-scalable=no` + `maximum-scale=1.0` + `touch-action:manipulation` 三者配合

## 4. 布局 CSS 改动后的回归清单

- [ ] iPhone 竖屏 (375×812)
- [ ] iPad Mini 竖屏 (744×1133)
- [ ] iPad Mini 横屏 (1133×744) — 分栏模式
- [ ] 桌面宽屏 (1280×800)
- [ ] 滚动到底部确认无多余空白
- [ ] 滚动到顶部确认 header 正常
