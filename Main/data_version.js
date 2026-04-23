// 部署时间戳 — 由 .github/workflows/deploy.yml 在部署时用 sed 注入实际 ISO 时间
// 用途：utils.js 的 delta merge 用此时间戳判断 KV overlay 条目是 fresh 还是 stale
// - entry.updatedAt > DATA_DEPLOY_TIME  → fresh overlay（编辑器最新修改，生效）
// - entry.updatedAt < DATA_DEPLOY_TIME  → stale（learning 已 commit 到 data.js 并部署，忽略）
//
// 本地开发（localhost）里 placeholder 不会被替换，merge 逻辑回退为"所有 overlay 都视为 fresh"
// 这样本地编辑器试验行为与当前一致，无侵入。
window.DATA_DEPLOY_TIME = '__DEPLOY_TIME__';
