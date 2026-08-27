import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { detectRepo, parseRepoUrl, wxreadAdapter, listWorkflows, secretExists, type RepoInfo, type WorkflowInfo } from '@/api/github';
import type { PanelSettings } from '@/api/github';

// 记忆存储：配置持久化到 localStorage，重开面板自动恢复（wxread 回读依赖此恢复仓库地址）
const PERSIST_KEY = 'wxread_panel_settings';

interface PersistedSettings {
  repoUrl?: string;
  readMinutes?: number;
  pushMethod?: string;
  curlBash?: string;
  wxpusherToken?: string;
  pushplusToken?: string;
  tgBotToken?: string;
  tgChatId?: string;
  serverchanToken?: string;
}

export const useSettingsStore = defineStore('settings', () => {
  const repoUrl = ref('');
  const repoInfo = ref<RepoInfo | null>(null);
  const repoStatus = ref<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const repoMessage = ref('');
  const workflows = ref<WorkflowInfo[]>([]);
  const selectedWorkflowId = ref<number | string>('');

  const readMinutes = ref(40);
  const pushMethod = ref('wxpusher');
  const wxpusherToken = ref('');
  const curlBash = ref('');
  const pushplusToken = ref('');
  // 远程 Secrets 存在性（GitHub API 只返回元数据，不返回明文值）
  const remoteSecrets = ref<Record<string, boolean>>({});
  const tgBotToken = ref('');
  const tgChatId = ref('');
  const serverchanToken = ref('');

  // 从 localStorage 恢复持久化配置（记忆存储；损坏/缺失时回退默认值）
  try {
    const saved = JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}') as PersistedSettings;
    if (saved.repoUrl) repoUrl.value = saved.repoUrl;
    if (typeof saved.readMinutes === 'number') readMinutes.value = saved.readMinutes;
    if (saved.pushMethod) pushMethod.value = saved.pushMethod;
    if (saved.curlBash) curlBash.value = saved.curlBash;
    if (saved.wxpusherToken) wxpusherToken.value = saved.wxpusherToken;
    if (saved.pushplusToken) pushplusToken.value = saved.pushplusToken;
    if (saved.tgBotToken) tgBotToken.value = saved.tgBotToken;
    if (saved.tgChatId) tgChatId.value = saved.tgChatId;
    if (saved.serverchanToken) serverchanToken.value = saved.serverchanToken;
  } catch { /* 损坏数据回退默认值 */ }

  // 自动持久化：任一持久化字段变化即写入 localStorage
  watch(
    [repoUrl, readMinutes, pushMethod, curlBash, wxpusherToken, pushplusToken, tgBotToken, tgChatId, serverchanToken],
    persist,
    { deep: true }
  );

  function persist() {
    const data: PersistedSettings = {
      repoUrl: repoUrl.value, readMinutes: readMinutes.value, pushMethod: pushMethod.value,
      curlBash: curlBash.value, wxpusherToken: wxpusherToken.value, pushplusToken: pushplusToken.value,
      tgBotToken: tgBotToken.value, tgChatId: tgChatId.value, serverchanToken: serverchanToken.value,
    };
    try { localStorage.setItem(PERSIST_KEY, JSON.stringify(data)); } catch { /* 存储满等异常忽略 */ }
  }

  const pushMethods = ['', 'pushplus', 'wxpusher', 'telegram', 'serverchan'] as const;
  const quickReadOptions = [
    { label: '签到(2次)', value: 1 },
    { label: '10分钟', value: 10 },
    { label: '20分钟', value: 20 },
    { label: '40分钟', value: 40 },
    { label: '60分钟', value: 60 },
    { label: '100分钟', value: 100 },
  ];

  const readCount = computed(() => readMinutes.value * 2);

  let connectRequestId = 0;

  async function connectRepo(url: string) {
    const requestId = ++connectRequestId;
    repoUrl.value = url;
    repoStatus.value = 'connecting';
    repoMessage.value = '';
    const parsed = parseRepoUrl(url);
    if (!parsed) { repoStatus.value = 'error'; repoMessage.value = '无效的 GitHub 仓库地址'; return; }
    const result = await detectRepo(url);
    if (result.ok) {
      if (requestId !== connectRequestId) return;
      repoInfo.value = parsed;
      repoStatus.value = 'connected';
      repoMessage.value = result.message;
      // 并行加载工作流列表、配置变量、Secrets 状态（显著加快面板启动）
      const [wfList, remoteSettings] = await Promise.allSettled([
        listWorkflows(parsed.owner, parsed.repo),
        wxreadAdapter.fromGitHub(parsed.owner, parsed.repo),
      ]);
      if (wfList.status === 'fulfilled' && wfList.value.length > 0) {
        workflows.value = wfList.value;
        selectedWorkflowId.value = wfList.value[0].id;
      }
      if (remoteSettings.status === 'fulfilled') {
        readMinutes.value = remoteSettings.value.readMinutes;
        if (remoteSettings.value.pushMethod) pushMethod.value = remoteSettings.value.pushMethod;
      }
      // Secrets 仅用于状态卡展示，不阻塞工作流与运行记录加载。
      void refreshSecretStatus();
    } else {
      if (requestId !== connectRequestId) return;
      repoStatus.value = 'error'; repoMessage.value = result.message;
    }
  }

  async function saveConfig() {
    if (!repoInfo.value) throw new Error('未连接仓库');
    const s: PanelSettings = {
      readMinutes: readMinutes.value, pushMethod: pushMethod.value,
      wxpusherToken: wxpusherToken.value, curlBash: curlBash.value,
      pushplusToken: pushplusToken.value, tgBotToken: tgBotToken.value, tgChatId: tgChatId.value, serverchanToken: serverchanToken.value,
    };
    await wxreadAdapter.toGitHub(repoInfo.value.owner, repoInfo.value.repo, s);
    await wxreadAdapter.pushSecrets(repoInfo.value.owner, repoInfo.value.repo, s);
    await refreshSecretStatus();
  }

  // 检测目标仓库中关键 Secrets 是否存在
  async function refreshSecretStatus() {
    if (!repoInfo.value) return;
    const names = ['WXREAD_CURL_BASH', 'WXPUSHER_SPT', 'PUSHPLUS_TOKEN', 'TELEGRAM_BOT_TOKEN', 'SERVERCHAN_SPT'];
    const status: Record<string, boolean> = {};
    const info = repoInfo.value; // 提前取出，避免 TS 在 Promise.allSettled 回调中报 null
    // 并行检测所有 Secrets（每个 secretExists 一次 API 调用，并行后只等一次网络往返）
    const results = await Promise.allSettled(
      names.map(n => secretExists(info.owner, info.repo, n))
    );
    names.forEach((n, i) => { status[n] = results[i].status === 'fulfilled' ? results[i].value : false; });
    remoteSecrets.value = status;
  }

  return { repoUrl, repoInfo, repoStatus, repoMessage, workflows, selectedWorkflowId, readMinutes, pushMethod, wxpusherToken, curlBash, pushplusToken, tgBotToken, tgChatId, serverchanToken, remoteSecrets, refreshSecretStatus, pushMethods, quickReadOptions, readCount, connectRepo, saveConfig };
});