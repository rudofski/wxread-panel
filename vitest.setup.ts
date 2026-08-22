// Node 22+ 提供实验性全局 localStorage（无文件路径时为空实现），
// 会遮蔽 happy-dom 的实现。这里注入完整的内存 mock 保证测试可运行。

const store = new Map<string, string>();

(globalThis as any).localStorage = {
  getItem: (key: string): string | null => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string): void => {
    store.set(key, String(value));
  },
  removeItem: (key: string): void => {
    store.delete(key);
  },
  clear: (): void => {
    store.clear();
  },
  key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
  get length(): number {
    return store.size;
  },
};
