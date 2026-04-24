#!/usr/bin/env bash
#
# v2 一键 setup — 把 SETUP.md 里 Step 2-7 全自动化。
#
# 前置（你必须自己装一次）:
#   1. node + pnpm:    brew install node pnpm   或   npm i -g pnpm
#   2. 在 v2/ 目录跑:  ./scripts/setup.sh
#
# 脚本会:
#   - pnpm install
#   - migrate v1 data → JSON
#   - validate + test
#   - git commit data
#   - wrangler login (如果未登录会跳浏览器)
#   - 建 D1 数据库 + 自动写回 wrangler.toml + commit
#   - 应用 migrations
#   - 第一次部署 Pages
#   - 提示开启 auto-deploy (最后一步手动 1 行)
#
# 任何步骤失败就停 (set -e)，错误信息直接显示。

set -euo pipefail

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { echo -e "\n${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}! $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}" >&2; }

# 切到 v2 目录
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
V2_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
REPO_DIR=$(cd "$V2_DIR/.." && pwd)
cd "$V2_DIR"

# ============================================================
# Pre-flight: 检查依赖
# ============================================================

step "Pre-flight checks"

if ! command -v node >/dev/null 2>&1; then
  err "node 没装。请先: brew install node   或   nvm install 22"
  exit 1
fi
ok "node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm 没装。请先: brew install pnpm   或   npm i -g pnpm"
  exit 1
fi
ok "pnpm $(pnpm -v)"

# ============================================================
# Step 1: Install deps
# ============================================================

step "Step 1/7: pnpm install"
# 永远跑（fast no-op if up-to-date；package.json 改动会触发更新）
pnpm install
ok "deps installed"

# ============================================================
# Step 2: Migrate v1 data
# ============================================================

step "Step 2/7: migrate v1 → JSON"
pnpm migrate:from-v1
ok "data migrated"

# ============================================================
# Step 3: Validate + test
# ============================================================

step "Step 3/7: validate + test"
pnpm validate
pnpm test
ok "all checks green"

# ============================================================
# Step 4: Git commit data
# ============================================================

step "Step 4/7: commit data to git"
cd "$REPO_DIR"
if [ -n "$(git status --porcelain v2/data/)" ]; then
  git add v2/data/
  git commit -m "v2: migrate v1 data to JSON files (auto-generated)"
  ok "data committed"
else
  ok "no data changes to commit"
fi
cd "$V2_DIR"

# ============================================================
# Step 5: Wrangler login (interactive only if needed)
# ============================================================

step "Step 5/7: ensure wrangler logged in"
if ! npx wrangler whoami 2>&1 | grep -q '@'; then
  warn "需要登录 Cloudflare（会打开浏览器）"
  npx wrangler login
fi
ok "wrangler authenticated"

# ============================================================
# Step 6: D1 setup (idempotent)
# ============================================================

step "Step 6/7: D1 database setup"

# 6a. Create D1 if database_id is still placeholder
if grep -q 'TODO_REPLACE_AFTER_W1_3' wrangler.toml; then
  warn "creating D1 database 'management-study-v2'..."
  CREATE_OUT=$(npx wrangler d1 create management-study-v2 2>&1) || {
    err "wrangler d1 create failed:"
    echo "$CREATE_OUT" >&2
    exit 1
  }
  echo "$CREATE_OUT"

  # Parse database_id from wrangler output (format: database_id = "xxx" 或 "id": "xxx")
  DB_ID=$(echo "$CREATE_OUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
  if [ -z "$DB_ID" ]; then
    err "无法从 wrangler 输出 parse database_id。请手动填入 wrangler.toml 后重跑。"
    exit 1
  fi

  # Replace placeholder
  sed -i.bak "s/TODO_REPLACE_AFTER_W1_3/$DB_ID/" wrangler.toml
  rm -f wrangler.toml.bak
  ok "wrangler.toml updated with database_id=$DB_ID"

  cd "$REPO_DIR"
  git add v2/wrangler.toml
  git commit -m "v2: configure D1 database id"
  cd "$V2_DIR"
else
  ok "D1 database_id already configured"
fi

# 6b. Apply migrations (idempotent — D1 跟踪 applied state)
warn "applying D1 schema migrations..."
npx wrangler d1 migrations apply management-study-v2 --remote
ok "migrations applied"

# ============================================================
# Step 7: First deploy
# ============================================================

step "Step 7/7: first production deploy"

# 7a. Sync data to D1
pnpm sync:d1
npx wrangler d1 execute management-study-v2 --remote --file=.wrangler/sync.sql
ok "D1 data synced"

# 7b. Build Astro
pnpm build
ok "Astro built"

# 7c. Deploy Pages
SHA=$(cd "$REPO_DIR" && git rev-parse HEAD)
npx wrangler pages deploy dist \
  --project-name=management-study-v2 \
  --commit-hash="$SHA" \
  --commit-message="$SHA"
ok "deployed"

# ============================================================
# Done
# ============================================================

echo ""
echo "================================================"
echo -e "${GREEN}✅ v2 setup complete!${NC}"
echo "================================================"
echo ""
echo "  Visit: https://management-study-v2.pages.dev"
echo ""
echo "Last manual step (1 line edit, when ready):"
echo "  - Open .github/workflows/deploy-v2.yml"
echo "  - Uncomment the push: trigger block (4 lines)"
echo "  - git commit + push"
echo "  → from then on, any push to v2/** auto-deploys"
echo ""
