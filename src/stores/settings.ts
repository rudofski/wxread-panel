import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { detectRepo, parseRepoUrl, wxreadAdapter, listWorkflows, secretExists, type RepoInfo, type WorkflowInfo } from '@/api/github';
import type { PanelSettings } from '@/api/github';

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

  async function connectRepo(url: string) {
    repoUrl.value = url;
    repoStatus.value = 'connecting';
    repoMessage.value = '';
    const parsed = parseRepoUrl(url);
    if (!parsed) { repoStatus.value = 'error'; repoMessage.value = '无效的 GitHub 仓库地址'; return; }
    const result = await detectRepo(url);
    if (result.ok) {
      repoInfo.value = parsed;
      repoStatus.value = 'connected';
      repoMessage.value = result.message;
      try {
        const wfList = await listWorkflows(parsed.owner, parsed.repo);
        workflows.value = wfList;
        if (wfList.length > 0) selectedWorkflowId.value = wfList[0].id;
      } catch {}
      try {
        const settings = await wxreadAdapter.fromGitHub(parsed.owner, parsed.repo);
        readMinutes.value = settings.readMinutes;
        if (settings.pushMethod) pushMethod.value = settings.pushMethod;
      } catch {}
      await refreshSecretStatus();
    } else { repoStatus.value = 'error'; repoMessage.value = result.message; }
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
    for (const n of names) {
      try {
        status[n] = await secretExists(repoInfo.value.owner, repoInfo.value.repo, n);
      } catch {
        status[n] = false;
      }
    }
    remoteSecrets.value = status;
  }

  return { repoUrl, repoInfo, repoStatus, repoMessage, workflows, selectedWorkflowId, readMinutes, pushMethod, wxpusherToken, curlBash, pushplusToken, tgBotToken, tgChatId, serverchanToken, remoteSecrets, refreshSecretStatus, pushMethods, quickReadOptions, readCount, connectRepo, saveConfig };
});