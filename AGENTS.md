# Agent / Teacher Cold Start
本仓库包含两代系统：
1) **v2/**（当前线上）— Astro + TypeScript + Cloudflare Pages + D1（数据真值源）
2) **archive/v1/**（归档）— v0/v1 旧站点，仅历史参考

## 你应该先读什么（所有模型通用）
- **优先读**：`agent/README.md`（模型无关的冷启动入口：工作法/项目事实/老师工作流）
- **再读**：`v2/README.md`（架构、开发、部署、数据模型）
- **可选**：`.claude-memory/`（历史记忆源，未来可能弃用；不要依赖它才能启动）
- **需要历史对照时**：`archive/v1/README.md` / `archive/v1/CONTRIBUTING.md`

## 约束（非常重要）
- 不要把任何敏感信息（token、密码、私钥、个人隐私）写入仓库（包括 `agent/` 与 `.claude-memory/`）。
- `agent/` 的目标是“所有模型统一冷启动入口”；`.claude-memory/` 仅作历史参考。

