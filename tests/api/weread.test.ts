import { describe, it, expect } from 'vitest';
import { isValidBookId, serializeBookLibrary, parseBookLibrary } from '@/api/weread';

describe('weread API utils', () => {
  describe('isValidBookId', () => {
    it('接受纯字母数字 ID', () => {
      expect(isValidBookId('ce032b305a9bc1ce0b0dd2a')).toBe(true);
      expect(isValidBookId('ab123')).toBe(true);
    });
    it('拒绝空字符串和空白', () => {
      expect(isValidBookId('')).toBe(false);
      expect(isValidBookId('   ')).toBe(false);
    });
    it('拒绝包含特殊字符的 ID', () => {
      expect(isValidBookId('book-123')).toBe(false);
      expect(isValidBookId('ce032 space')).toBe(false);
    });
  });

  describe('serializeBookLibrary', () => {
    it('正确序列化单个书目', () => {
      const result = serializeBookLibrary([{ bookId: 'abc123', title: '三体', author: '刘慈欣', cover: '' }]);
      const p = JSON.parse(result);
      expect(p[0].bookId).toBe('abc123');
      expect(p[0].title).toBe('三体');
    });
    it('过滤无效 bookId', () => {
      const result = serializeBookLibrary([{ bookId: 'abc', title: 'OK', author: '', cover: '' }, { bookId: 'inv@lid', title: 'Bad', author: '', cover: '' }]);
      const p = JSON.parse(result);
      expect(p).toHaveLength(1);
    });
  });

  describe('parseBookLibrary', () => {
    it('正确解析 JSON', () => {
      const json = JSON.stringify([{ bookId: 'abc123', title: '三体', author: '刘慈欣', cover: '' }]);
      const result = parseBookLibrary(json);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('三体');
    });
    it('空字符串返回空数组', () => { expect(parseBookLibrary('')).toEqual([]); });
    it('非法 JSON 返回空数组', () => { expect(parseBookLibrary('not json')).toEqual([]); });
  });
});