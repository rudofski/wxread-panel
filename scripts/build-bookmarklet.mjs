// 用 esbuild 将 bookmarklet.js 压缩为单行书签 URL，输出到 public/curl-helper/bookmarklet.min.js。
// 注意（v0.1.8）：书签小工具已被 Chrome 扩展取代（扩展可读取 HttpOnly cookie，
// 书签受浏览器安全限制无法获得 wr_vid/wr_skey/wr_rt），curl-helper 页面不再内嵌书签。
// 此脚本仅保留书签源码的压缩产物，供历史参考；不再改写 index.html。
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = join(root, 'public/curl-helper/bookmarklet.js');
const outPath = join(root, 'public/curl-helper/bookmarklet.min.js');

const res = await build({
  stdin: { contents: readFileSync(srcPath, 'utf8'), sourcefile: 'bookmarklet.js' },
  write: false,
  minify: true,
  format: 'iife',
  target: 'es2018',
});
const code = res.outputFiles[0].text.trim();
const href = 'javascript:' + code.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
writeFileSync(outPath, href + '\n');

console.log(`✅ bookmarklet 压缩版已输出：${outPath}（${href.length} 字符）`);
console.log('⚠️ 书签已停用（v0.1.8 起由 Chrome 扩展取代，扩展可读取 HttpOnly cookie）');
