// 推送接口状态判定（纯函数）：只做「凭证完整性」校验，不实发消息。
// 数据源：settings.remoteSecrets（GitHub Secrets 存在性，API 不返回明文）。

export type PushStatus = 'ok' | 'warn' | 'error' | 'unknown';

export interface PushStatusResult {
  status: PushStatus;
  /** 缺失的 Secret 名（status 为 error 时有值） */
  missing: string[];
  /** 面板直接可渲染的文案 */
  text: string;
}

const CHANNEL_REQUIREMENTS: Record<string, string[]> = {
  wxpusher: ['WXPUSHER_SPT'],
  pushplus: ['PUSHPLUS_TOKEN'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
  serverchan: ['SERVERCHAN_SPT'],
};

const CHANNEL_LABEL: Record<string, string> = {
  wxpusher: 'WxPusher',
  pushplus: 'PushPlus',
  telegram: 'Telegram',
  serverchan: 'ServerChan',
};

export function evaluatePushStatus(
  method: string,
  remoteSecrets: Record<string, boolean>,
): PushStatusResult {
  const channel = String(method ?? '').trim().toLowerCase();

  // 远程 Secrets 尚未回读（对象为空）→ 无法判定
  if (!remoteSecrets || Object.keys(remoteSecrets).length === 0) {
    return { status: 'unknown', missing: [], text: '🟡 正在检测推送接口...' };
  }

  if (!channel) {
    return { status: 'warn', missing: [], text: '🟡 未启用推送' };
  }

  const required = CHANNEL_REQUIREMENTS[channel];

  if (!required) {
    return {
      status: 'error',
      missing: ['PUSH_METHOD'],
      text: '🔴 推送接口渠道未知（PUSH_METHOD 值无效）',
    };
  }

  const missing = required.filter((name) => !remoteSecrets[name]);

  if (missing.length > 0) {
    return {
      status: 'error',
      missing,
      text: `🔴 推送接口未配置完整（缺少 ${missing.join('、')}）`,
    };
  }

  return {
    status: 'ok',
    missing: [],
    text: `🟢 推送接口正常（${CHANNEL_LABEL[channel] || channel}）`,
  };
}
