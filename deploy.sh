#!/usr/bin/env bash
# 一键部署 wxread-panel（GitHub Pages）
#
# 用法（Git Bash / WSL / macOS / Linux）：
#   ./deploy.sh
#
# 前提：已配置 origin remote（git remote -v 可查）
set -e
cd "$(dirname "$0")"

echo "==> [1/2] 推送 master 触发 GitHub Actions 构建 + Pages 部署 ..."
git push origin master

echo "==> [2/2] 推送标签 ..."
git push origin v0.1.16 || echo "(标签已存在则忽略)"

echo ""
echo "部署已触发。查看进度：https://github.com/<owner>/wxread-panel/actions"
echo "线上地址：https://<owner>.github.io/wxread-panel/"
echo "curl_bash 获取工具：https://<owner>.github.io/wxread-panel/curl-helper/"
