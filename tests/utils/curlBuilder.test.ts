import { describe, it, expect } from 'vitest';
import { buildCurl, resolveUrl } from '@/utils/curlBuilder';

// 书签小工具核心：把捕获到的微信读书 read 请求还原为完整 curl 命令。
// 关键要求：必须包含 x-wrpa-0 签名头、cookie、--data-raw 请求体——
// 缺任一都可能导致服务器校验失败（2026-08 实测：旧版仅拼 cookie+UA 无法正常工作）。

describe('curlBuilder（read 请求 → curl 命令）', () => {
  it('完整请求：含 URL、cookie、x-wrpa-0、--data-raw body', () => {
    const curl = buildCurl({
      url: 'https://weread.qq.com/web/book/read',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json;charset=UTF-8',
        cookie: 'wr_vid=379411343; wr_skey=ZWrus7sN',
        'x-wrpa-0': '56b13b4a4ed257ab4f11e12ea09972f375b7a5f4cab50d41f1c100fbdd89cc70d',
      },
      body: '{"appId":"wb182564874663h776775553","b":"ce032b305a9bc1ce0b0dd2a","rt":30,"rn":626}',
    });
    expect(curl).toContain("curl 'https://weread.qq.com/web/book/read'");
    expect(curl).toContain("-H 'cookie: wr_vid=379411343; wr_skey=ZWrus7sN'");
    expect(curl).toContain("-H 'x-wrpa-0: 56b13b4a4ed257ab4f11e12ea09972f375b7a5f4cab50d41f1c100fbdd89cc70d'");
    expect(curl).toContain("--data-raw '{\"appId\":\"wb182564874663h776775553\",\"b\":\"ce032b305a9bc1ce0b0dd2a\",\"rt\":30,\"rn\":626}'");
  });

  it('无显式 cookie 头时，从 documentCookie 补充', () => {
    const curl = buildCurl({
      url: 'https://weread.qq.com/web/book/read',
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      body: '{"rt":30}',
      documentCookie: 'wr_vid=379411343; wr_skey=ZWrus7sN',
    });
    expect(curl).toContain("-H 'cookie: wr_vid=379411343; wr_skey=ZWrus7sN'");
  });

  it('body 内含单引号时正确转义（curl 单引号规则）', () => {
    const curl = buildCurl({
      url: 'https://weread.qq.com/web/book/read',
      headers: {},
      body: '{"sm":"it\'s a test"}',
    });
    expect(curl).toContain("--data-raw '{\"sm\":\"it'\\''s a test\"}'");
  });

  it('过滤 host / content-length（curl 自动处理），保留其余头', () => {
    const curl = buildCurl({
      url: 'https://weread.qq.com/web/book/read',
      headers: {
        host: 'weread.qq.com',
        'content-length': '123',
        referer: 'https://weread.qq.com/web/reader/ce032b305a9bc1ce0b0dd2a',
      },
      body: '{}',
    });
    expect(curl).not.toContain('host:');
    expect(curl).not.toContain('content-length:');
    expect(curl).toContain("-H 'referer: https://weread.qq.com/web/reader/ce032b305a9bc1ce0b0dd2a'");
  });

  it('缺失常用头时自动补齐 accept / user-agent / origin / referer', () => {
    const curl = buildCurl({
      url: 'https://weread.qq.com/web/book/read',
      headers: {},
      body: '{}',
      referer: 'https://weread.qq.com/web/reader/abc',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });
    expect(curl).toContain("-H 'accept: application/json, text/plain, */*'");
    expect(curl).toContain("-H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)'");
    expect(curl).toContain("-H 'origin: https://weread.qq.com'");
    expect(curl).toContain("-H 'referer: https://weread.qq.com/web/reader/abc'");
  });

  it('输出为多行续行格式（每行以反斜杠结尾，最后是 --data-raw）', () => {
    const curl = buildCurl({
      url: 'https://weread.qq.com/web/book/read',
      headers: { cookie: 'a=1' },
      body: '{}',
    });
    const lines = curl.split('\n').map(l => l.trimEnd());
    expect(lines[0]).toBe("curl 'https://weread.qq.com/web/book/read' \\");
    expect(lines[1]).toBe("  -H 'cookie: a=1' \\");
    expect(lines[lines.length - 1]).toBe("  --data-raw '{}'");
  });

  describe('resolveUrl（相对路径 → 绝对 URL，v0.1.5 修复）', () => {
    it('以 / 开头的相对路径拼接页面源', () => {
      expect(resolveUrl('/web/book/read', 'https://weread.qq.com')).toBe('https://weread.qq.com/web/book/read');
    });

    it('绝对 URL 保持不变', () => {
      expect(resolveUrl('https://weread.qq.com/web/book/read', 'https://weread.qq.com')).toBe('https://weread.qq.com/web/book/read');
      expect(resolveUrl('http://weread.qq.com/web/book/read', 'https://weread.qq.com')).toBe('http://weread.qq.com/web/book/read');
    });

    it('无前导斜杠的相对路径自动补斜杠', () => {
      expect(resolveUrl('web/book/read', 'https://weread.qq.com')).toBe('https://weread.qq.com/web/book/read');
    });
  });
});
