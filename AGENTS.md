# Agent / Teacher Cold Start
本仓库包含两代系统：
1) **v2/**（当前线上）— Astro + TypeScript + Cloudflare Pages + D1（数据真值源）
2) **archive/v1/**（归档）— v0/v1 旧站点，仅历史参考

## 你应该先读什么
- **优先读**：`.claude-memory/MEMORY.md`（给新会话的“冷启动记忆”）
- **再读**：`v2/README.md`（架构、开发、部署、数据模型）
- **需要历史对照时**：`archive/v1/README.md` / `archive/v1/CONTRIBUTING.md`

## 约束（非常重要）
- 不要把任何敏感信息（token、密码、私钥、个人隐私）写入 `.claude-memory/`。
- `.claude-memory/` 的目标是“帮助新 agent 快速理解项目”，不是存放运行时配置。

