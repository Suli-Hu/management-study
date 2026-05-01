# Prototypes

静态产品样机放在这里，用来评审信息架构和交互流程，不代表最终实现代码。

## Stage 3 Discipline Admin

文件：

- `stage-3-admin-console-demo.html`

打开方式：

1. 在浏览器里直接打开该 HTML。
2. 评审重点：
   - 是否足够贴近当前 `/admin/disciplines`，不需要重新学习。
   - `+ 新建学科`、每行 `编辑`、空学科 `删除` 是否清楚。
   - “含内容不可删”的保护是否还保留。
   - Stage 3 新增的 D1 source / tenant auto-create / Git JSON legacy 提示是否够轻。
   - 后续学科详情页承接 owner / token / API guide 是否合理。

说明：

- 这是纯静态 demo，不连接后端。
- 按钮只做列表、drawer 和删除确认演示。
- 视觉方向是沿用当前 v2 admin 页，做渐进式重构，不做大改版。
