> **作用域**：两类 session 并行（engineering / learning），文件 `scope:` 决定归属。详见 [SCOPES.md](SCOPES.md)。

- [🔴 第一原则·真实性优先](feedback_truth_first.md) — 不编叙事弧、不编因果链、不装作知道；三级来源标注制；元规则凌驾其他一切
- [🔄 第一性原理解决问题](feedback_first_principles.md) — 累计 ≥2 次意外障碍时停下重估路径，别在兔子洞里继续打补丁
- [⚡ Preview 效率优化](feedback_preview_efficiency.md) — 数据验证走 curl/grep、视觉验证一次到位、用户浏览器是最快 preview
- [用户画像](user_sulihu.md) — 备考旧帝大+早慶神戸一橋经营学研究科，iPad Mini 主力，UI 细节敏感
- [部署 = git push](feedback_no_auto_deploy.md) — GitHub Actions 自动部署，验证后直接 push；CF secrets 改动要触发 redeploy；Astro 5 默认 CSRF 要带 Origin
- [多 Claude 会话分工](feedback_worktree_scope.md) — engineering 碰 js/CSS/UI，learning（epic-*）只碰 data；engineering 会话随 context 满轮替
- [前端排查方法论](feedback_frontend_methodology.md) 🔧 _engineering-only_ — 全局扫描再改、用真实设备尺寸自测、Safari 坑清单、回归断点表
- [KP 生成 6 原则](feedback_kp_generation.md) — 先查重+demo 页选颗粒度+先样后批，详见 CONTRIBUTING.md §8
- [经营学辅导工作流](feedback_tutoring_workflow.md) — 按学派推进·真题∪教材·6 步闭环（含用户答疑回合）·每 3–4 KP 一次 callback 综合回顾
- [经营学备考教材位置](reference_study_materials.md) — References/ 下按 Org/Strategy/HRM/OB/Other 分类，过去问在 Other/
- [🌐 v2 产品定位 + 4 层架构 + 用户模型](project_v2_product_model.md) — Anytime Study 多学科平台 / 学派组→学派→学者→KP / per-discipline RBAC / 邀请码 123
- [v2 D1 + Astro 坑清单](project_v2_d1_gotchas.md) 🔧 _engineering-only_ — D1 IN 上限 ~100、本地 D1 跨 worktree 不共享、学者按姓氏排、v2 实际 URL
- [v2 admin 权限边界](project_v2_admin_gate.md) 🔧 _engineering-only_ — husuli0623@gmail.com 是唯一 admin，写路径必 check locals.isAdmin（v0.4.25 后用 canEdit(d)）
- [📜 Memory 作用域注册](SCOPES.md) — 哪些 memory 属 engineering-only / learning-only / shared
