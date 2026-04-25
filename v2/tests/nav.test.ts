import { describe, expect, test } from 'vitest';
import { editHref, parseFrom, fromLabel } from '../src/lib/nav';

describe('editHref', () => {
  test('无 currentPath 返原 target', () => {
    expect(editHref('/a/b/edit')).toBe('/a/b/edit');
    expect(editHref('/a/b/edit', undefined)).toBe('/a/b/edit');
  });
  test('附 ?from=encoded(currentPath)', () => {
    expect(editHref('/keiei/kp/k1/edit', '/keiei/scientific')).toBe('/keiei/kp/k1/edit?from=%2Fkeiei%2Fscientific');
  });
  test('target 已有 query → 用 & 拼', () => {
    expect(editHref('/x?a=1', '/y')).toBe('/x?a=1&from=%2Fy');
  });
});

describe('parseFrom', () => {
  test('null/empty → fallback', () => {
    expect(parseFrom(null, '/fb')).toBe('/fb');
    expect(parseFrom('', '/fb')).toBe('/fb');
  });
  test('合法相对路径 → decoded', () => {
    expect(parseFrom(encodeURIComponent('/keiei/scientific'), '/fb')).toBe('/keiei/scientific');
  });
  test('protocol-relative URL → fallback（防钓鱼）', () => {
    expect(parseFrom('//evil.com', '/fb')).toBe('/fb');
  });
  test('反斜杠 → fallback', () => {
    expect(parseFrom('/foo\\bar', '/fb')).toBe('/fb');
  });
  test('双 // → fallback', () => {
    expect(parseFrom('/foo//bar', '/fb')).toBe('/fb');
  });
  test('不以 / 开头 → fallback', () => {
    expect(parseFrom('http://x.com', '/fb')).toBe('/fb');
    expect(parseFrom('keiei', '/fb')).toBe('/fb');
  });
});

describe('fromLabel', () => {
  test('discipline 全览', () => {
    expect(fromLabel('/keiei')).toBe('学派全览');
  });
  test('学派 detail', () => {
    expect(fromLabel('/keiei/scientific')).toBe('学派');
  });
  test('学者列表 / 学者 detail', () => {
    expect(fromLabel('/keiei/scholars')).toBe('学者列表');
    expect(fromLabel('/keiei/scholars/march')).toBe('学者');
  });
  test('知识点列表 / 知识点 detail', () => {
    expect(fromLabel('/keiei/kp')).toBe('知识点列表');
    expect(fromLabel('/keiei/kp/k001')).toBe('知识点');
  });
  test('?查询参数被忽略', () => {
    expect(fromLabel('/keiei/scientific?kp=k1')).toBe('学派');
  });
});
