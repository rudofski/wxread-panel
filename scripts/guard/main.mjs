#!/usr/bin/env node
// wxread 守护入口：读状态 → 决策 → 修复/补跑 → 巡检告警。
// 退出码：0 = 一切正常或已完成应做动作；2 = 需要人工介入（启用失败等）；1 = 自身异常。
import process from 'node:process';
import { parseGuardEnv, classifyHttpError } from './github.mjs';
import { getTargetWorkflow, enableWorkflow, dispatchWorkflow, listTodayRuns } from './workflow.mjs';
import { decide } from './decide.mjs';
import { buildReport } from './report.mjs';
import { sendPush, credsFromEnv } from './push.mjs';
import { emptyGuardState, readGuardState, writeGuardState, shouldDispatch, shouldAlert } from './state.mjs';

const EXIT_OK = 0;
const EXIT_NEED_HUMAN = 2;
const EXIT_ERROR = 1;

function parseArgs(argv) {
  const args = { mode: 'auto', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--mode') args.mode = argv[++i];
    else if (a.startsWith('--mode=')) args.mode = a.slice('--mode='.length);
    else if (a === '--check') args.mode = 'check';
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...parts) => console.log('[guard]', ...parts);

function nowStamp() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ') + '+08:00';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode;
  const now = new Date();
  log(`模式=${mode} 本地时间=${nowStamp()} dryRun=${args.dryRun}`);

  let cfg;
  try {
    cfg = parseGuardEnv(process.env);
  } catch (err) {
    log('配置错误：', err.message);
    return EXIT_ERROR;
  }
  // check 模式只读：不需要写权限，token 缺失也允许（会跳过检查）
  const creds = credsFromEnv(process.env);

  const actions = [];
  let exitCode = EXIT_OK;

  const wf = await getTargetWorkflow(cfg);
  if (!wf) {
    log(`未找到工作流 ${cfg.workflowPath}`);
    const report = buildReport({
      now, owner: cfg.owner, repo: cfg.repo, workflowPath: cfg.workflowPath,
      workflowState: 'missing', scheduledHour: cfg.scheduledHour, runs: [], actions,
      reason: `仓库 ${cfg.owner}/${cfg.repo} 中找不到 ${cfg.workflowPath}`, hasSuccess: false,
    });
    const res = await sendPush({ method: process.env.PUSH_METHOD, content: report, title: '微信阅读-异常', creds });
    log('告警推送：', res.ok, res.detail);
    return EXIT_NEED_HUMAN;
  }

  log(`目标工作流：${wf.name}（id=${wf.id}, state=${wf.state}）`);

  if (mode === 'check') {
    // 本地体检：只读，不写任何状态
    const runs = await listTodayRuns({ ...cfg, workflowId: wf.id });
    const decision = decide({
      mode: 'inspect', now, workflowState: wf.state, runs,
      scheduledHour: cfg.scheduledHour, graceMin: cfg.graceMin, inspectHour: cfg.inspectHour,
    });
    log('决策：', JSON.stringify(decision));
    log(`今日运行 ${runs.length} 条：`, runs.slice(0, 5).map((r) => `${r.when} ${r.conclusion || r.status}`).join(' | ') || '无');
    return wf.state === 'active' ? EXIT_OK : EXIT_NEED_HUMAN;
  }

  // ---- 阶段 A：修复被停用的工作流 ----
  let currentState = wf.state;
  let state = await readGuardState(cfg, now);
  if (currentState !== 'active') {
    actions.push(`${nowStamp()} 检测到工作流状态 ${currentState}，调用 enable`);
    if (!args.dryRun) {
      try {
        await enableWorkflow(cfg, wf.id);
        await sleep(2000);
        const recheck = await getTargetWorkflow(cfg);
        currentState = recheck?.state || currentState;
        actions.push(`启用后复核状态：${currentState}`);
        if (currentState !== 'active') {
          actions.push('启用未生效，需要人工到 Actions 页面点击 Enable workflows');
          exitCode = EXIT_NEED_HUMAN;
        }
      } catch (err) {
        actions.push(`启用失败：${err.message}`);
        exitCode = EXIT_NEED_HUMAN;
      }
    } else {
      actions.push('dry-run：跳过 enable');
    }
  }

  // ---- 阶段 B：决策 + 补跑 + 告警 ----
  const modeForDecision = mode === 'auto' ? 'inspect' : mode;
  state.lastState = currentState;

  // auto/all：先按 preflight 语义补跑（05:00 宽限后今日零运行），再按 inspect 语义判告警。
  // 12:00 那次如果只走 inspect，会只告警不补跑，白等一天。
  for (const pass of mode === 'auto' || mode === 'all' ? ['preflight', 'inspect'] : [modeForDecision]) {
    const runs = await listTodayRuns({ ...cfg, workflowId: wf.id });
    const decision = decide({
      mode: pass, now, workflowState: currentState, runs,
      scheduledHour: cfg.scheduledHour, graceMin: cfg.graceMin, inspectHour: cfg.inspectHour,
    });
    log(`${pass} 决策：`, JSON.stringify(decision));

    if (decision.needDispatch && currentState === 'active') {
      if (shouldDispatch(state)) {
        actions.push(`${nowStamp()} 今日尚无成功运行，触发 workflow_dispatch（ref=${cfg.ref}）`);
        if (!args.dryRun) {
          try {
            await dispatchWorkflow(cfg, wf.id);
            state.dispatchedAt = nowStamp();
            await writeGuardState(cfg, state);
          } catch (err) {
            state.lastError = err.message;
            actions.push(`补跑失败：${err.message}`);
            exitCode = EXIT_NEED_HUMAN;
          }
        } else {
          actions.push('dry-run：跳过 dispatch');
        }
      } else {
        actions.push('今日已补跑过，跳过重复 dispatch');
      }
    }

    if (pass === 'inspect' && decision.needAlert && shouldAlert(state)) {
      const report = buildReport({
        now, owner: cfg.owner, repo: cfg.repo, workflowPath: cfg.workflowPath,
        workflowState: currentState, scheduledHour: cfg.scheduledHour, runs, actions,
        reason: decision.reason, hasSuccess: runs.some((r) => r.conclusion === 'success'),
      });
      const res = await sendPush({ method: process.env.PUSH_METHOD, content: report, title: '微信阅读-异常', creds });
      log('告警推送：', res.ok, res.channel, res.detail);
      if (res.ok) {
        state.alertedAt = nowStamp();
        await writeGuardState(cfg, state);
      } else {
        // 推送失败不阻断下次尝试：保留 alertedAt 为空，并在日志里明确原因
        actions.push(`告警推送失败：${res.detail}`);
      }
    }
  }

  if (actions.length === 0) actions.push('无需动作');
  // 动作清单也写进 GUARD_STATE，次日排查「昨天到底做了什么」不必翻 workflow 日志
  state.lastActions = actions.slice(-12);

  if (!args.dryRun) await writeGuardState(cfg, state);
  log('动作汇总：', actions.join(' / '));
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[guard] 未捕获异常：', err?.stack || err);
    if (err?.status) console.error('[guard]', classifyHttpError(err.status, err.body || ''));
    process.exit(EXIT_ERROR);
  });
