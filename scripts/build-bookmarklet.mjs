// 用 esbuild 将 bookmarklet.js 压缩为单行书签 URL，并同步到 index.html 的"拖我到书签栏"按钮
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = join(root, 'public/curl-helper/bookmarklet.js');
const htmlPath = join(root, 'public/curl-helper/index.html');

const res = await build({
  stdin: { contents: readFileSync(srcPath, 'utf8'), sourcefile: 'bookmarklet.js' },
  write: false,
  minify: true,
  format: 'iife',
  target: 'es2018',
});
const code = res.outputFiles[0].text.trim();

// HTML 属性用双引号包裹：先转义 &，再转义 "（浏览器解析属性时会解码回原字符）
const href = 'javascript:' + code.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

let html = readFileSync(htmlPath, 'utf8');
const before = html;
html = html.replace(/href="javascript:[^"]*"/, `href="${href}"`);
if (html === before) throw new Error('未找到 bookmark-link 的 href，替换失败');
writeFileSync(htmlPath, html);

console.log(`✅ bookmarklet 压缩版已同步：${href.length} 字符`);
