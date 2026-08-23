// 生成访问密码的 SHA-256 哈希，用于 GitHub Actions Secret PANEL_PASSWORD_HASH。
//
// 用法（任选其一）：
//   1. 交互式（推荐，密码不显示、不落盘、不进 shell 历史）：
//        node scripts/password-hash.mjs
//   2. 环境变量（如 CI 或脚本化场景）：
//        PANEL_PASSWORD=xxx node scripts/password-hash.mjs
//
// 输出：64 位 SHA-256 hex，请完整复制后配置到 GitHub 仓库
//   Settings → Secrets and variables → Actions → Secrets → New repository secret
//   名称：PANEL_PASSWORD_HASH
import { createHash } from 'node:crypto';

const envPw = process.env.PANEL_PASSWORD;
if (envPw) {
  console.log(createHash('sha256').update(envPw).digest('hex'));
  process.exit(0);
}

// —— 交互式静默输入（不回显密码）——
function askHidden(question) {
  return new Promise((resolve) => {
    let pw = '';
    const input = process.stdin;
    const cleanup = (exitCode) => {
      try { input.setRawMode(false); } catch {}
      input.removeListener('data', onData);
      process.stdout.write('\n');
      if (exitCode != null) process.exit(exitCode);
      resolve(pw);
    };
    const onData = (char) => {
      char = String(char);
      if (char === '\n' || char === '\r' || char === '\u0004') return cleanup();
      if (char === '\u0003') return cleanup(130); // Ctrl+C
      if (char === '\u007f' || char === '\b') { pw = pw.slice(0, -1); return; } // 退格
      pw += char;
    };
    try { input.setRawMode(true); } catch { /* 非 TTY 环境忽略 */ }
    input.resume();
    input.setEncoding('utf8');
    input.on('data', onData);
    process.stdout.write(question);
  });
}

const pw = await askHidden('请输入访问密码（输入时不显示）: ');
const pw2 = await askHidden('再次输入确认: ');
if (!pw) {
  console.error('错误：密码不能为空');
  process.exit(1);
}
if (pw !== pw2) {
  console.error('错误：两次输入不一致');
  process.exit(1);
}
console.log('\nSHA-256 哈希（完整复制下面一行，配置到 GitHub Secret PANEL_PASSWORD_HASH）:');
console.log(createHash('sha256').update(pw).digest('hex'));
