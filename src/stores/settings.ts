import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { detectRepo, parseRepoUrl, wxreadAdapter, listWorkflows, type RepoInfo, type WorkflowInfo } from '@/api/github';
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
  const selectedBooks = ref<string[]>([]);

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
        if (settings.selectedBooks.length > 0) selectedBooks.value = settings.selectedBooks;
      } catch {}
    } else { repoStatus.value = 'error'; repoMessage.value = result.message; }
  }

  async function saveConfig() {
    if (!repoInfo.value) throw new Error('未连接仓库');
    const s: PanelSettings = { readMinutes: readMinutes.value, pushMethod: pushMethod.value, wxpusherToken: wxpusherToken.value, curlBash: curlBash.value, selectedBooks: selectedBooks.value };
    await wxreadAdapter.toGitHub(repoInfo.value.owner, repoInfo.value.repo, s);
    await wxreadAdapter.pushSecrets(repoInfo.value.owner, repoInfo.value.repo, s);
  }

  return { repoUrl, repoInfo, repoStatus, repoMessage, workflows, selectedWorkflowId, readMinutes, pushMethod, wxpusherToken, curlBash, selectedBooks, pushMethods, quickReadOptions, readCount, connectRepo, saveConfig };
});