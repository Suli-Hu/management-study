#!/usr/bin/env bash
# v0.3.1 — Pre-push safety check
#
# 作用：防止 engineering 的测试/原型数据误入 git，污染 learning session
#
# 用法（手动）：
#   bash scripts/pre-push-check.sh
#
# 用法（自动 git hook）：
#   ln -s ../../scripts/pre-push-check.sh .git/hooks/pre-push
#   chmod +x .git/hooks/pre-push
#
# 退出码：0 = 安全，1 = 检测到违规

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# 检查即将 push 的 commits 里新增/修改的文件
# 如果作为 git hook 调用（pre-push），从 stdin 读 refs；手动调用则对比 HEAD vs origin/main
if [ -t 0 ]; then
  # 手动运行：比对 HEAD vs origin/main
  DIFF=$(git diff --name-only origin/main...HEAD 2>/dev/null || git ls-files)
else
  # git hook：stdin 格式 "local-ref local-sha remote-ref remote-sha"
  DIFF=""
  while read -r local_ref local_sha remote_ref remote_sha; do
    if [ "$local_sha" != "0000000000000000000000000000000000000000" ]; then
      if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
        # 新分支，对比默认分支
        range="origin/main..$local_sha"
      else
        range="$remote_sha..$local_sha"
      fi
      DIFF+=$(git diff --name-only "$range" 2>/dev/null)$'\n'
    fi
  done
fi

VIOLATIONS=()

# 1. 测试 KP id 不应入 git
TEST_KPS=$(echo "$DIFF" | grep -E 'v2/data/.*/kp/(kt|kfix_)[a-z0-9_]+\.json|v2/data/.*/kp/k[89][0-9]{3}\.json' || true)
if [ -n "$TEST_KPS" ]; then
  VIOLATIONS+=("❌ 测试 KP 文件（kt*/kfix_*/k8xxx/k9xxx）入 git：")
  while IFS= read -r f; do
    [ -n "$f" ] && VIOLATIONS+=("   - $f")
  done <<< "$TEST_KPS"
fi

# 2. .engineering/ 原型数据不应入 git（README 除外）
ENG_LEAK=$(echo "$DIFF" | grep -E 'v2/data/\.engineering/' | grep -v 'README\.md$' || true)
if [ -n "$ENG_LEAK" ]; then
  VIOLATIONS+=("❌ .engineering/ 原型数据入 git（应该只在本地）：")
  while IFS= read -r f; do
    [ -n "$f" ] && VIOLATIONS+=("   - $f")
  done <<< "$ENG_LEAK"
fi

# 3. 未宣布的新学科（除 keiei + 已占位的 marketing/finance）入 git
# 如果真要上新学科要走 SOP，不应突然出现
NEW_DISCIPLINE=$(echo "$DIFF" | grep -E 'v2/data/(hr|strategy_g|org_g|other)/' || true)
if [ -n "$NEW_DISCIPLINE" ]; then
  VIOLATIONS+=("⚠️ 未走 SOP 新增学科目录（需先跟 learning 协调）：")
  while IFS= read -r f; do
    [ -n "$f" ] && VIOLATIONS+=("   - $f")
  done <<< "$NEW_DISCIPLINE"
fi

# 4. .dev.vars / .env 凭证入 git（双重保险，虽然 .gitignore 也拦）
CREDS=$(echo "$DIFF" | grep -E '\.dev\.vars$|\.env$|\.env\.local$|credentials\.json' || true)
if [ -n "$CREDS" ]; then
  VIOLATIONS+=("🔐 凭证文件入 git（严重）：")
  while IFS= read -r f; do
    [ -n "$f" ] && VIOLATIONS+=("   - $f")
  done <<< "$CREDS"
fi

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo -e "${RED}✗ Pre-push check 失败${NC}"
  for v in "${VIOLATIONS[@]}"; do
    echo -e "${YELLOW}$v${NC}"
  done
  echo ""
  echo -e "${RED}解决办法：${NC}"
  echo "  1. 看看是不是测试遗留 → 删掉后重新 commit"
  echo "  2. 如果是故意加的，要跟 learning 协调 → 暂停 push"
  echo "  3. 如果误报 → 检查 pre-push-check.sh 规则"
  exit 1
fi

echo -e "${GREEN}✓ Pre-push check 通过（无 learning 污染风险）${NC}"
exit 0
