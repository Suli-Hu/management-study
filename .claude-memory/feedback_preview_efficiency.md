---
name: Preview 工具使用效率优化
description: 2026-04-19 用户反馈 preview 处理耗时过长，以下是优化策略
type: feedback
originSessionId: 97f6e1e8-2ba0-4fd9-894f-791aa7a1f2af
---
**Preview 流程必须高效，不要 loop 折腾。**

**Why**：2026-04-19 生成 k625 KP 时，preview 来回折腾了十几步（截图缓存问题、滚动不生效、工具切换），用户明确指出"处理 preview 的时间每次都很久"，要求优化。

**How to apply**：

### 1. 数据验证不经 preview — 直接 `curl | grep` 或 `python` 读文件
数据改动的 sanity check（k625 是否存在、学派改名是否成功、Japanese 翻译是否入库）：
- ✅ 推荐：`curl -s http://localhost:8084/data.js | grep -c k625`
- ✅ 推荐：`python3 -c 'with open("data.js") as f: data=f.read(); ...'`
- ❌ 浪费：`preview_eval` 来读 window.DATA + screenshot

### 2. 视觉验证一次到位 — 不 loop
视觉渲染验证（卡片是否正确显示）：
- 直接导航到目标 URL（`window.location.href = 'xxx#kp:k625'`）
- 一次 `preview_eval` 做完 "跳转 + 展开 + 滚动到目标"
- 然后**只截一次图**
- 如果第一张图不对，**先用 `preview_eval` 查 DOM 状态**（textContent / rect / class）定位问题，不要盲目重新截图

### 3. 用户浏览器是最快的 preview
用户明确说过 "我在这里就能看到 preview：http://localhost:8084/..."
- 写完文件 → 同步到 server 目录 → 告诉用户 URL 并让他们自己看
- 我方截图只在需要"自己判断渲染是否符合规格"时做，不是每次都做

### 4. 一次性跑完编辑链，统一重载
多个文件改动（data.js + data_ja.js + 其他）：
- ✅ 推荐：全部 Edit 完成 → 全部同步到 /tmp → 一次 reload
- ❌ 浪费：每改一处就 reload + screenshot

### 5. 数据编辑要去对正确的 working tree
**血的教训**：Edit 用绝对路径时，容易写到 main 仓库而不是 worktree。
- 每次 Edit `.claude/worktrees/` 外的文件前，必须用 `git -C <path> branch --show-current` 确认
- 或直接用 worktree 路径 `/Users/.../worktrees/epic-thompson-1e293e/Main/...`

### 6. screenshot 失效时的救急
`preview_screenshot` 偶尔受 sandbox/缓存影响返回空白：
- 改用 `preview_eval` 查 `document.textContent` / `.body-card` 等验证
- 或让用户自己浏览器看

---

**核心原则**：preview 是为了"验证别走偏"，不是"每步都打卡"。数据改完先用 curl/grep 确认写入正确，再做一次性视觉验证。

---

## Git commit 也要快

2026-04-19 用户同样抱怨 commit 处理慢。

**优化**：commit 是例行操作，不需要多阶段分析。一条并行命令搞定：
```bash
git add <specific files> && git commit -m "<msg>" && git status --short
```

- **只 stage 真正的改动**，不 `git add -A`
- **commit message** 一句话 + 若干要点（参考 `git log` 风格）
- **不要先 status 再分析再 stage 再 commit** —— 除非有明显风险（secrets / 大量未知文件），否则一把梭
- **本地 dev artifacts**（demo_*.html / serve_dev_*.py）不要进 commit，除非用户明说
