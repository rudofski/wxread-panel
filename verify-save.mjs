// 线上"保存配置"验证脚本
// 验证目标：GitHub Secrets 加密修复后，面板保存配置不再报
// "improperly encrypted secret"（422）。
//
// 用法（任选其一，token 不进对话）：
//   1) 环境变量：
//      GITHUB_PAT=ghp_xxx GITHUB_REPO=https://github.com/<owner>/<repo> node verify-save.mjs
//   2) 或编辑项目根 .env.local（已被 gitignore）：
//      GITHUB_PAT=ghp_xxx
//      GITHUB_REPO=https://github.com/rudofski/wxread
//      WXREAD_CURL="curl 'https://weread.qq.com/web/book/read' ..."
//      WXPUSHER_TOKEN=AT_xxx
//   未提供 WXREAD_CURL / WXPUSHER_TOKEN 时使用占位值（同样能验证加密链路）。
//
// 注意：脚本会真实写入目标仓库的 Variables 与 Secrets（面板的正常功能）。
import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE = 'https://rudofski.github.io/wxread-panel/';

// ---- 读取本地配置（环境变量 > .env.local）----
function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = fs.readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* 无 .env.local */ }
  return env;
}

const env = loadEnv();
const PAT = env.GITHUB_PAT;
if (!PAT) {
  console.error('❌ 缺少 GITHUB_PAT。请设置环境变量或在 .env.local 中提供（勿粘贴到对话）。');
  process.exit(1);
}
const REPO_URL = env.GITHUB_REPO || 'https://github.com/rudofski/wxread';
const CURL_BASH = env.WXREAD_CURL || "curl 'https://weread.qq.com/web/book/read' -H 'user-agent: verify' -b 'wr_vid=verify-placeholder'";
const WXPUSHER = env.WXPUSHER_TOKEN || 'AT_verify_placeholder_123456';

console.log('目标仓库:', REPO_URL);
console.log('curl_bash:', CURL_BASH.includes('verify-placeholder') ? '(占位值)' : '(真实值)');
console.log('wxpusher:', WXPUSHER.includes('verify_placeholder') ? '(占位值)' : '(真实值)');

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[页面错误]', m.text().slice(0, 200)); });

try {
  // 1. 登录
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15000 });
  const input = page.getByPlaceholder('ghp_xxxxxxxxxxxx');
  if ((await input.count()) === 0) {
    // 可能已登录或密码门；尝试直接进配置页
    console.log('（未发现登录框，可能已有会话）');
  } else {
    await input.fill(PAT);
    await page.getByRole('button', { name: '使用 Token 登录' }).click();
    await page.waitForURL(/dashboard|#\//, { timeout: 15000 });
    console.log('✅ 登录成功');
  }

  // 2. 进入配置页
  await page.goto(BASE + '#/config', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=配置参数', { timeout: 15000 });

  // 3. 填写仓库地址并检测连接
  const repoInput = page.locator('input[placeholder*="github.com"]').first();
  if (await repoInput.count()) {
    await repoInput.fill(REPO_URL);
    await page.getByRole('button', { name: /检测连接/ }).click();
    await page.waitForSelector('.status-msg.ok', { timeout: 20000 });
    console.log('✅ 仓库连接成功');
  } else {
    console.log('（配置页无仓库输入框，可能已有仓库连接）');
  }

  // 4. 填写 curl_bash
  const curlTa = page.locator('textarea[placeholder*="curl"]').first();
  if (await curlTa.count()) {
    await curlTa.fill(CURL_BASH);
  }

  // 5. 填写推送 token（WXPUSHER_SPT）
  const wxp = page.locator('input[placeholder*="AT_"]').first();
  if (await wxp.count()) {
    await wxp.fill(WXPUSHER);
  }

  // 6. 保存全部配置
  await page.getByRole('button', { name: /保存全部配置/ }).click();
  await page.waitForSelector('.save-msg', { timeout: 30000 });

  const msg = (await page.locator('.save-msg').innerText()).trim();
  const ok = msg.includes('配置已保存');
  console.log(ok ? '✅ 保存成功（无 422）' : '❌ 保存失败');
  console.log('保存结果:', msg);
  console.log(ok ? '\n🎉 422 加密错误已修复，线上验证通过' : '\n⚠️ 仍失败，需进一步排查');
} finally {
  await browser.close();
}
