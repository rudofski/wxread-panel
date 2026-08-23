// 线上部署健康检查（无需登录 token）
// 检查：入口 / 登录页 / 配置页路由守卫 / curl-helper / favicon / JS bundle
// 运行：node verify-health.mjs
// 部署后一键确认线上健康；配合 verify-save.mjs（需真实 PAT）可覆盖完整链路。
import { chromium } from '@playwright/test';

const BASE = process.env.PANEL_URL || 'https://rudofski.github.io/wxread-panel/';
const browser = await chromium.launch();
const page = await browser.newPage();
const req = page.request;

let failed = false;
function report(label, ok, detail = '') {
  console.log(`[${label}] ${ok ? '✅' : '❌'} ${detail}`);
  if (!ok) failed = true;
}

// 1. 入口
const r1 = await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
const h1 = await page.locator('h1').innerText().catch(() => '(未渲染)');
report('入口', r1.status() === 200 && h1.includes('wxread 控制面板'), `status=${r1.status()} h1="${h1}"`);

// 2. 登录页
await page.goto(BASE + '#/login', { waitUntil: 'load', timeout: 45000 });
const hasInput = (await page.getByPlaceholder('ghp_xxxxxxxxxxxx').count()) > 0;
const hasCreateLink = (await page.getByRole('link', { name: /创建 Token/ }).count()) > 0;
const hasOAuth = (await page.getByRole('button', { name: /GitHub 授权登录/ }).count()) > 0;
report('登录页', hasInput && hasCreateLink && !hasOAuth,
  `token输入=${hasInput} 创建链接=${hasCreateLink} OAuth按钮=${hasOAuth ? '存在(异常)' : '无(正确)'}`);

// 3. 配置页守卫（未登录应重定向登录页）
await page.goto(BASE + '#/config', { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(800);
const hash = await page.evaluate(() => location.hash);
const showsConfig = (await page.getByText('配置参数', { exact: false }).count()) > 0;
report('配置页守卫', hash === '#/login' && !showsConfig,
  `hash=${hash} 配置内容可见=${showsConfig ? '是(异常)' : '否(正确)'}`);

// 4. curl-helper
const r4 = await page.goto(BASE + 'curl-helper/index.html', { waitUntil: 'load', timeout: 45000 });
const title4 = await page.title();
report('curl-helper', r4.status() === 200 && title4.includes('curl_bash'), `status=${r4.status()} title="${title4}"`);

// 5. favicon / JS bundle
const html = await (await req.get(BASE)).text();
const m = html.match(/src="([^"]+\.js)"/);
const jsUrl = m ? (m[1].startsWith('http') ? m[1] : new URL(m[1], BASE).toString()) : null;
const jsStatus = jsUrl ? (await req.get(jsUrl)).status() : 0;
const favStatus = (await req.get(BASE + 'favicon.svg')).status();
report('JS bundle', !!jsUrl && jsStatus === 200, jsUrl ? `${jsUrl.split('/').pop()} status=${jsStatus}` : '(未找到)');
report('favicon', favStatus === 200, `status=${favStatus}`);

await browser.close();

console.log(failed ? '\n⚠️ 存在异常项，请排查' : '\n🎉 线上健康检查全部通过');
process.exit(failed ? 1 : 0);
