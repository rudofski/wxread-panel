#!/usr/bin/env bash
# 一键部署 wxread-panel
#
# 用法（Git Bash / WSL / macOS / Linux）：
#   ./deploy.sh            # 完整部署（Worker + 推送）
#   ./deploy.sh --skip-worker   # 只推送，跳过 Worker 部署
#
# 前提：
#   - 已配置 origin remote（git remote -v 可查）
#   - wrangler 已安装并登录（npm i -g wrangler && wrangler login），
#     跳过 Worker 部署时不需要
set -e
cd "$(dirname "$0")"

SKIP_WORKER=0
[ "$1" = "--skip-worker" ] && SKIP_WORKER=1

# 1. 部署 Cloudflare Worker（书城搜索 CORS 代理）
if [ "$SKIP_WORKER" = "0" ] && command -v wrangler >/dev/null 2>&1; then
  echo "==> [1/3] 部署 Cloudflare Worker ..."
  (cd worker && wrangler deploy)
else
  echo "==> [1/3] 跳过 Worker 部署（未安装 wrangler 或 --skip-worker）"
fi

# 2. 推送 master 触发 GitHub Actions 构建 + Pages 部署
echo "==> [2/3] 推送 master ..."
git push origin master

echo "==> [3/3] 推送标签 ..."
git push origin v0.1.0 || echo "(标签已存在则忽略)"

echo ""
echo "部署已触发。查看进度：https://github.com/<owner>/wxread-panel/actions"
echo "线上地址：https://<owner>.github.io/wxread-panel/"
echo ""
echo "若首次部署且未配置 CF secrets，请在仓库 Settings → Actions → Variables"
echo "手动添加 VITE_WEREAD_PROXY（Worker 地址），然后重新 push 一次。"
