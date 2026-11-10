import { describe, it, expect } from 'vitest';
import { describeWorkflowState } from '@/utils/workflowStatus';

describe('describeWorkflowState', () => {
  it('未加载（null）显示检测中，且不是 ok', () => {
    const r = describeWorkflowState(null, '');
    expect(r.text).toContain('检测');
    expect(r.ok).toBe(false);
  });

  it('active 显示正常，ok 为 true', () => {
    const r = describeWorkflowState({ id: 1, name: 'wxread', path: '.github/workflows/deploy.yml', state: 'active' }, '');
    expect(r.text).toBe('🟢 Actions 工作流正常');
    expect(r.ok).toBe(true);
  });

  it('disabled_manually 提示已停用并指向 Enable 按钮', () => {
    const r = describeWorkflowState(
      { id: 1, name: 'wxread', path: '.github/workflows/deploy.yml', state: 'disabled_manually' },
      '',
    );
    expect(r.ok).toBe(false);
    expect(r.text).toContain('已停用');
    expect(r.text).toContain('Enable');
  });

  it('disabled_inactivity 也在非正常之列', () => {
    const r = describeWorkflowState(
      { id: 1, name: 'wxread', path: '.github/workflows/deploy.yml', state: 'disabled_inactivity' },
      '',
    );
    expect(r.ok).toBe(false);
    expect(r.text).toContain('停用');
  });

  it('读取失败时显示错误原因', () => {
    const r = describeWorkflowState(null, 'Bad credentials');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('Bad credentials');
  });

  it('未知 state 原样回显，不误判为正常', () => {
    const r = describeWorkflowState({ id: 1, name: 'w', path: 'p', state: 'weird_state' }, '');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('weird_state');
  });
});
