// 打包 chrome-extension/ 为 zip 到 public/curl-helper/wxread-curl-helper.zip
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const srcDir = join(root, 'chrome-extension');
const outDir = join(root, 'public', 'curl-helper');
const zipPath = join(outDir, 'wxread-curl-helper.zip');
const files = ['manifest.json', 'background.js', 'content-main.js', 'content-bridge.js', 'popup.html', 'popup.js'];

const tmp = join(tmpdir(), 'wxread-ext-pack');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

for (const f of files) {
  copyFileSync(join(srcDir, f), join(tmp, f));
}

// 用 PowerShell Compress-Archive 创建 zip
const psSrc = `'${tmp}\\*'`.replace(/\\/g, '\\\\');
const psDst = `'${zipPath}'`.replace(/\\/g, '\\\\');
const cmd = `powershell.exe -NoProfile -Command "Compress-Archive -Path ${psSrc} -DestinationPath ${psDst} -Force"`;
try {
  execSync(cmd, { stdio: 'pipe' });
  console.log('✓ zip 创建成功');
} catch (e) {
  console.error('PowerShell 压缩失败:', e.stderr?.toString() || e.message);
  process.exit(1);
}

if (existsSync(zipPath)) {
  const size = statSync(zipPath).size;
  console.log(`zip 大小: ${size} bytes → ${zipPath}`);
} else {
  console.error('zip 不存在');
  process.exit(1);
}