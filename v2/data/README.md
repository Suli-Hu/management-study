# 数据目录

## 目录结构

```
data/
  <discipline>/                    # 学科（keiei / marketing / ...）
    discipline.json                # 学科元信息 + 主题分组
    schools/
      <schoolKey>.json             # 一个学派一个文件
    scholars/
      <scholarKey>.json            # 一个学者一个文件
    kp/
      <kpId>.json                  # 一个 KP 一个文件
```

## 命名规则

| 类型 | id 格式 | 例子 |
|---|---|---|
| 学科 key | `discipline.json` 里的 `key` 字段 + 目录名（必须一致） | `keiei`, `marketing` |
| 学派 key | 小写蛇形 | `change`, `org_learning` |
| 学者 key | 小写蛇形 | `tushman`, `march` |
| KP id | 小写字母前缀 + 数字 | `k562`, `m1`（未来 marketing 用 m 开头） |

## 修改 / 新增 KP 工作流（learning Claude）

```bash
# 1. 找到对应学派目录
cd v2/data/keiei/

# 2. 改 / 加 KP
vim kp/k562.json              # 改已有
cp kp/_template.json kp/k627.json  # 加新（用 template）

# 3. 更新 schools/<key>.json 的 concepts[] 把新 KP id 加进显示顺序

# 4. 本地验证
cd v2 && pnpm validate        # schema + cross-ref + cn-ja parity
pnpm dev                      # 起 server 看渲染效果

# 5. push
git add v2/data/ && git commit -m "Add k627 脱学习" && git push
# Actions 自动 sync to D1，30s 后 v2.management-study.pages.dev 可见
```

## 关键约束（验证脚本会拦截）

- ✅ 每个 KP 的 `discipline` 必须等于所在目录名
- ✅ 每个 KP 的 `schools[]` 中每个 key 必须在 `<discipline>/schools/` 下有对应文件
- ✅ 每个 KP 的 `scholars[]` 中每个 key 必须在 `<discipline>/scholars/` 下有对应文件
- ✅ 每个学派的 `concepts[]` 中每个 KP id 必须在 `<discipline>/kp/` 下有对应文件
- ✅ 同 discipline 下 KP id 唯一
- ✅ `updatedAt` 必须是合法 ISO 8601 UTC（结尾 Z）
- ✅ `body.zh` 里出现 `<strong>` 加粗个数应 ≈ `body.ja` 里 `<strong>` 个数（差异 > 30% 报警）

## 字段语义快速参考

详见 `v2/src/schemas/*.ts`（Zod 定义即文档）。
