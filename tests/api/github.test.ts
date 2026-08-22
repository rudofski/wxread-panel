import { describe, it, expect } from 'vitest';
import { parseRepoUrl, parseRunError } from '@/api/github';

describe('GitHub API utils', () => {
  describe('parseRepoUrl', () => {
    it('解析标准 GitHub URL', () => {
      const r = parseRepoUrl('https://github.com/rudofski/wxread');
      expect(r).not.toBeNull();
      expect(r!.owner).toBe('rudofski');
      expect(r!.repo).toBe('wxread');
    });
    it('解析带 .git 的 URL', () => {
      const r = parseRepoUrl('https://github.com/rudofski/wxread.git');
      expect(r).not.toBeNull();
      expect(r!.repo).toBe('wxread');
    });
    it('无效 URL 返回 null', () => {
      expect(parseRepoUrl('not-a-url')).toBeNull();
      expect(parseRepoUrl('https://gitlab.com/a/b')).toBeNull();
    });
  });

  describe('parseRunError', () => {
    it('识别 Cookie 过期', () => {
      expect(parseRunError('Error: 401 Unauthorized, Cookie expired')).toContain('Cookie 已过期');
    });
    it('识别推送失败', () => {
      expect(parseRunError('WxPusher push error: invalid token')).toContain('推送失败');
    });
    it('无错误返回 null', () => {
      expect(parseRunError('reading success')).toBeNull();
    });
  });
});