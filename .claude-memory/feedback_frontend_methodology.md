---
name: 前端问题排查方法论
description: 从iPad适配问题中总结的排查和自测方法论，避免反复修补
type: feedback
---

## 问题排查：先全局扫描，再动手修

**不要只修表面症状。** 用户说"底部有空白"，不能只改一处 padding 就交差。必须全局搜索所有相关属性（padding-bottom、margin-bottom、height、safe-area 等），列出完整清单，一次性修完。

**Why:** 今天底部空白问题来回改了5次，根因是 padding-bottom 散布在6个不同的 media query 里（默认、601-960px、<600px、分栏模式），每次只改一处，遗漏了其他断点。

**How to apply:**
1. 修改前先 `grep` 所有相关 CSS 属性，列出完整清单
2. 理解每个值在不同断点下的作用
3. 一次性统一修改，而不是逐个修补

---

## 自测：模拟真实设备尺寸

**改完代码必须用目标设备尺寸验证。** 不能只在默认视口看一眼就说"没问题"。

**Why:** 今天多次在预览工具里用缩放（zoom=0.5）看"大概没空白"就说修好了，但实际 iPad 上仍有问题。缩放不等于真实视口。

**How to apply:**
1. 用 `preview_resize` 设置为真实设备尺寸（iPad Mini: 1133x744 横屏, 744x1133 竖屏）
2. 竖屏和横屏都要测
3. 滚动到底部确认没有多余空白
4. 用 JS 验证 scrollHeight vs clientHeight 确认真正到底

---

## Safari/iOS 特有问题清单

1. **`opacity:0` 不阻止触摸** — 必须配合 `pointer-events:none`
2. **flex 嵌套高度不可靠** — Safari 中 `height:100%` 在 flex 子元素中常失效，用 `position:absolute; top:0; bottom:0` 或 `min-height:0` 替代
3. **`env(safe-area-inset-bottom)` 会叠加** — 如果外层和内层都加了安全区 padding，结果会双倍。只在最内层加一次
4. **viewport 缩放** — `user-scalable=no` + `maximum-scale=1.0` + `touch-action:manipulation` 三者配合才能彻底禁止缩放

---

## 回归测试检查清单

每次修改布局/间距相关 CSS 后，至少验证这些场景：
- [ ] iPhone 竖屏 (375x812)
- [ ] iPad Mini 竖屏 (744x1133)  
- [ ] iPad Mini 横屏 (1133x744) — 分栏模式
- [ ] 桌面宽屏 (1280x800)
- [ ] 滚动到底部确认无多余空白
- [ ] 滚动到顶部确认 header 正常
