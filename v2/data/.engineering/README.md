# .engineering/ — engineering prototype area

这个目录是 **gitignored**（见 `v2/.gitignore`）。

## 用途

engineering Claude 会话需要：
- 扩展性测试（加 marketing/finance/strategy 等学科确认架构不硬编码 keiei）
- 多学科 UI 原型验证
- 大型 refactor 前的数据隔离沙盒

都应该在 `.engineering/<discipline>/` 下做，**不要**直接写到 `data/<discipline>/`，否则：
- learning Claude 会话 (`epic-*` worktree) 读 `data/` 会看到陌生学科数据，产生认知混乱
- push 到 git 后学习流程被迫 pull 下来

## 正式上线某学科的流程

1. engineering 在 `.engineering/<discipline>/` 做原型 + 单元测试
2. engineering 告知 learning 新学科就绪
3. learning 审视 seed data 是否符合教学逻辑
4. learning 确认后，engineering 手动 `cp -r .engineering/<discipline> data/<discipline>` + commit
5. 此后 `data/<discipline>/` 归 learning 维护，engineering 不再改

## 目录约定

```
.engineering/
├── marketing/
│   ├── discipline.json
│   ├── schools/
│   ├── scholars/
│   └── kp/
├── finance/
│   └── ...
└── strategy/
    └── ...
```

## 测试 KP id 约定

临时测试用的 KP 应使用以下 id 前缀（也已 gitignored）：
- `kt*` — smoke test (e.g. `kt99999`)
- `kfix_*` — bug 复现测试
- `k8xxx` / `k9xxx` — 手测临时 KP（真实 KP 目前只到 k627）
