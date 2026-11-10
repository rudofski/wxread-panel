// 工作流状态位文案（纯函数）：RepoInput 只负责渲染，判定逻辑集中在此便于测试。
import type { WorkflowState } from '@/api/github';

export interface WorkflowStatusView {
  ok: boolean;
  text: string;
}

export function describeWorkflowState(wf: WorkflowState | null, error: string): WorkflowStatusView {
  if (error) {
    return { ok: false, text: `🔴 Actions 工作流状态读取失败：${error}` };
  }

  if (!wf) {
    return { ok: false, text: '🟡 正在检测 Actions 工作流状态...' };
  }

  if (wf.state === 'active') {
    return { ok: true, text: '🟢 Actions 工作流正常' };
  }

  if (wf.state === 'deleted') {
    return { ok: false, text: '🔴 Actions 工作流已删除' };
  }

  if (String(wf.state).startsWith('disabled')) {
    return {
      ok: false,
      text: `🔴 Actions 工作流已停用（${wf.state}），请在 Actions 页面点击 Enable workflows（守护工作流会自动尝试启用）`,
    };
  }

  return { ok: false, text: `🟡 Actions 工作流状态未知：${wf.state}` };
}
