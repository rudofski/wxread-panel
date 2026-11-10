#!/usr/bin/env node
// 一键升级项目版本号，三处同步（防漂移）：package.json / package-lock.json / deploy.sh。
// 界面版本号从 package.json 读取（Sidebar.vue 单一事实来源），
// 发版流程：node scripts/bump-version.mjs <x.y.z> → 提交 → 推送。
import { readFileSync, writeFileSync } from 'node:fs';

const target = process.argv[2];
if (!target || !/^\d+\.\d+\.\d+$/.test(target)) {
  console.error('用法: node scripts/bump-version.mjs <x.y.z>  （如 0.1.8）');
  process.exit(1);
}

for (const file of ['package.json', 'package-lock.json']) {
  const text = readFileSync(file, 'utf8');
  const cur = text.match(/"version": "(\d+\.\d+\.\d+)"/)?.[1];
  if (!cur) {
    console.error(`✗ ${file} 中未找到版本号`);
    process.exit(1);
  }
  const next = text.split(`"version": "${cur}"`).join(`"version": "${target}"`);
  writeFileSync(file, next);
  console.log(`✓ ${file}: ${cur} → ${target}`);
}

// deploy.sh 已改为从 package.json 派生版本号；这里只做兼容性清理（若仍有硬编码就顺手对齐）
const sh = readFileSync('deploy.sh', 'utf8');
const shNext = sh.replace(/v\d+\.\d+\.\d+/g, `v${target}`);
if (shNext !== sh) {
  writeFileSync('deploy.sh', shNext);
  console.log('✓ deploy.sh: 硬编码标签已对齐');
} else {
  console.log('✓ deploy.sh: 无需改动（从 package.json 派生）');
}

console.log(`\n✅ 版本已同步至 ${target}。接下来：git add -A && git commit && git push`);
