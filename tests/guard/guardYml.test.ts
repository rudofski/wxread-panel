import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

// guard.yml 是唯一一处「不写测试就会被悄悄改坏」的配置：cron 少一位、
// concurrency 一开 cancel-in-progress、PAT 名字拼错，本地全绿、线上静默失效。
const raw = readFileSync(resolve(__dirname, '../../.github/workflows/guard.yml'), 'utf8');
const wf = yaml.load(raw) as any;
const guardJob = wf.jobs.guard;
const step = (name: string) => guardJob.steps.find((s: any) => s.name === name);

describe('guard.yml 工作流', () => {
  it('名称固定为 wxread-guard（concurrency 组的语义依赖它）', () => {
    expect(wf.name).toBe('wxread-guard');
  });

  it('三个 cron 分别对应北京时间 04:45 / 05:30 / 12:00', () => {
    const crons = wf.on.schedule.map((s: any) => s.cron);
    expect(crons).toEqual(['45 20 * * *', '30 21 * * *', '0 4 * * *']);
  });

  it('支持手动触发，且只有 auto/preflight/inspect/all/check 五个模式', () => {
    const inputs = wf.on.workflow_dispatch.inputs;
    expect(inputs.mode.default).toBe('auto');
    expect(inputs.mode.options).toEqual(['auto', 'preflight', 'inspect', 'all', 'check']);
    expect(inputs.dry_run.type).toBe('boolean');
  });

  it('串行排队且绝不取消正在运行的守护（否则会伪造出「补跑被取消」）', () => {
    expect(wf.concurrency).toEqual({ group: 'wxread-guard', 'cancel-in-progress': false });
  });

  it('权限只读，不申请写入（写操作全走 PAT，避免默认 GITHUB_TOKEN 的越权面）', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  it('三段定时按 UTC 小时映射到正确模式', () => {
    const run = step('选择运行模式').run as string;
    expect(run).toContain('elif [ "$HOUR" = "20" ]');
    expect(run).toContain('MODE="preflight"');
    expect(run).toContain('elif [ "$HOUR" = "21" ]');
    expect(run).toContain('MODE="all"');
    expect(run).toContain('elif [ "$HOUR" = "04" ]');
    expect(run).toContain('MODE="inspect"');
  });

  it('守护脚本的非零退出码必须向外抛出，不能被 continue-on-error 吞掉', () => {
    const run = step('执行守护').run as string;
    expect(run).toContain('node scripts/guard/main.mjs');
    expect(run).toContain('exit "$CODE"');
  });

  it('PAT 与推送凭证全部通过 secrets 注入，仓库里不出现明文', () => {
    const env = step('执行守护').env as Record<string, string>;
    expect(env.WXREAD_GUARD_PAT).toBe('${{ secrets.WXREAD_GUARD_PAT }}');
    for (const key of ['PUSH_METHOD', 'WXPUSHER_SPT', 'PUSHPLUS_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'SERVERCHAN_SPT']) {
      expect(env[key]).toBe(`\${{ secrets.${key} }}`);
    }
    expect(raw).not.toMatch(/pat_[A-Za-z0-9]{10,}/);
  });

  it('目标仓库/工作流/参考分支有默认值，未配 Variable 也能跑', () => {
    const env = step('执行守护').env as Record<string, string>;
    expect(env.WXREAD_REPO).toContain("'rudofski/wxread'");
    expect(env.WXREAD_WORKFLOW).toContain("'deploy.yml'");
    expect(env.WXREAD_REF).toContain("'main'");
  });

  it('汇总步骤始终执行，job 超时受限', () => {
    expect(step('汇总').if).toBe('always()');
    expect(guardJob['timeout-minutes']).toBe(15);
  });
});
