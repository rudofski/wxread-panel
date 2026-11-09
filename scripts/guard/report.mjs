// 异常报告 Markdown 生成：纯函数，输入即上下文，输出可直推微信/Telegram。

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const CONCLUSION_ICON = {
  success: '✅',
  failure: '❌',
  cancelled: '⏭',
  skipped: '⏭',
  timed_out: '⏱',
};

const pad2 = (n) => String(n).padStart(2, '0');

function formatShanghai(date) {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())} ${pad2(
    shifted.getUTCHours(),
  )}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())}`;
}

function formatClock(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '时间未知';
  const shifted = new Date(t + SHANGHAI_OFFSET_MS);
  return `${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())} ${pad2(shifted.getUTCHours())}:${pad2(
    shifted.getUTCMinutes(),
  )}`;
}

function formatDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return '';
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
}

function describeRun(run) {
  const icon = CONCLUSION_ICON[run.conclusion] || '•';
  const verdict = run.conclusion || run.status || 'unknown';
  const duration = formatDuration(run.durationSec);
  return `- ${icon} ${formatClock(run.when)} ${verdict}${duration ? `，耗时 ${duration}` : ''}`;
}

export function buildReport({
  now,
  owner,
  repo,
  workflowPath,
  workflowState,
  scheduledHour = 5,
  runs = [],
  actions = [],
  reason = '',
  hasSuccess = false,
}) {
  const stateLabel = workflowState === 'active' ? 'active（正常）' : `${workflowState}（停用）`;
  const lines = [];

  lines.push('## ⚠️ wxread 每日运行异常报告', '');
  lines.push(`**检查时间**：${formatShanghai(now)}（Asia/Shanghai）`);
  lines.push(`**目标仓库**：${owner}/${repo} · ${workflowPath}`);
  lines.push(`**工作流状态**：${stateLabel}`);
  lines.push(`**今日计划运行**：${pad2(scheduledHour)}:00（cron）`, '');

  lines.push('### 今天的运行情况');
  lines.push(`- 共 ${runs.length} 条记录`);
  if (runs.length === 0) lines.push('- 今日没有任何运行记录');
  else lines.push(...runs.map(describeRun));
  lines.push('');

  lines.push('### 判定');
  lines.push(reason ? reason : hasSuccess ? '今日已有成功运行' : '今日无成功运行');
  lines.push('');

  if (actions.length > 0) {
    lines.push('### 已执行的动作');
    lines.push(...actions.map((a) => `- ${a}`));
    lines.push('');
  }

  lines.push('### 建议');
  lines.push(`1. 打开 Actions 页面查看失败日志：https://github.com/${owner}/${repo}/actions`);
  lines.push('2. 高频原因：WXREAD_CURL_BASH 的 Cookie 过期 → 重新用 F12 复制 curl 并保存');
  if (workflowState !== 'active') {
    lines.push('3. 工作流被停用：守护自动启用失败，需到 Actions 页面手工点击 Enable workflows');
  }

  return lines.join('\n');
}
