/**
 * CounterfactualHud — 三行 Insight 定稿 + 数字表 + 代价火花线
 * 胜负色仅在结局/定格时出现，进行中保持中性。
 */

'use client';

import { useEffect, useMemo } from 'react';
import { CostSparkline } from '@/components/CostSparkline';
import { buildInsightLines } from '@/lib/insightTemplate';
import { useHomeStore } from '@/store/useHomeStore';
import type { AgentTaskOutcome } from '@/types/counterfactual';
import type { NavStatus } from '@/types/home';

const OUTCOME_LABEL: Record<AgentTaskOutcome, string> = {
  idle: '空闲',
  running: '执行中',
  success: '成功',
  stalled: '卡死',
  failed: '失败',
};

const NAV_LABEL: Record<NavStatus, string> = {
  idle: '空闲',
  navigating: '导航',
  avoiding: '避障',
  stuck: '卡住',
  replanning: '重规划',
  recovered: '恢复',
};

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className={`truncate font-mono text-xs font-medium ${tone ?? 'text-zinc-200'}`}
      >
        {value}
      </div>
    </div>
  );
}

export function CounterfactualHud() {
  const ablationEnabled = useHomeStore((s) => s.ablationEnabled);
  const snapshot = useHomeStore((s) => s.snapshot);
  const shadow = useHomeStore((s) => s.shadowSnapshot);
  const costSeries = useHomeStore((s) => s.costSeries);
  const insightFrozen = useHomeStore((s) => s.insightFrozen);
  const pinnedInsight = useHomeStore((s) => s.pinnedInsight);
  const setPinnedInsight = useHomeStore((s) => s.setPinnedInsight);
  const setVerdictFlash = useHomeStore((s) => s.setVerdictFlash);

  const liveInsight = useMemo(() => {
    if (!snapshot) {
      return buildInsightLines({
        mainOutcome: 'idle',
        shadowOutcome: 'idle',
        mainCost: 0,
        shadowCost: 0,
        mainReplan: 0,
        didTargetLost: false,
        isObstacleInjected: false,
        taskRunning: false,
      });
    }
    const taskStatus = snapshot.currentTask?.status;
    const taskRunning =
      !!taskStatus &&
      taskStatus !== 'idle' &&
      taskStatus !== 'success' &&
      taskStatus !== 'failed';

    return buildInsightLines({
      mainOutcome: snapshot.taskOutcome,
      shadowOutcome: shadow?.taskOutcome ?? 'idle',
      mainCost: snapshot.pathCostMeters,
      shadowCost: shadow?.pathCostMeters ?? 0,
      mainReplan: snapshot.metrics.replanCount,
      shadowRoomId: shadow?.robot.roomId,
      didTargetLost: snapshot.isTargetOccluded,
      isObstacleInjected: snapshot.isObstacleInjected,
      taskRunning,
    });
  }, [snapshot, shadow]);

  const insight = pinnedInsight?.ready ? pinnedInsight : liveInsight;
  const showVerdict = insight.ready || insightFrozen;

  // 自动钉选一次 ready insight（非脚本路径）
  useEffect(() => {
    if (liveInsight.ready && !pinnedInsight?.ready) {
      setPinnedInsight(liveInsight);
      setVerdictFlash('proven');
    }
    // 仅在 ready 翻转时钉选，避免每帧新对象重复 set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveInsight.ready, liveInsight.oneLiner, pinnedInsight?.ready, setPinnedInsight, setVerdictFlash]);

  if (!ablationEnabled || !snapshot) return null;

  const mainOutcome = snapshot.taskOutcome;
  const shadowOutcome = shadow?.taskOutcome ?? 'idle';

  const mainPanelClass = showVerdict
    ? mainOutcome === 'success' || snapshot.metrics.replanCount > 0
      ? 'border-emerald-500/50 bg-emerald-500/15 ring-1 ring-emerald-400/30'
      : 'border-cyan-500/30 bg-cyan-500/5'
    : 'border-zinc-600/50 bg-zinc-900/50';

  const shadowPanelClass = showVerdict
    ? shadowOutcome === 'stalled' || shadowOutcome === 'failed'
      ? 'border-rose-500/55 bg-rose-500/20 ring-1 ring-rose-400/35'
      : 'border-zinc-600/50 bg-zinc-900/50'
    : 'border-zinc-600/50 bg-zinc-900/50';

  return (
    <section
      className={`pointer-events-none absolute bottom-3 left-3 right-3 z-10 rounded-lg border bg-zinc-950/90 px-3 py-2 backdrop-blur transition-shadow ${
        insightFrozen
          ? 'border-violet-400/60 shadow-[0_0_24px_rgba(167,139,250,0.25)]'
          : 'border-zinc-600/50'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold text-zinc-200">
          反事实对比 · Counterfactual
        </h3>
        <span className="font-mono text-[9px] text-zinc-500">
          {showVerdict ? 'VERDICT' : 'RUNNING'} · seed {snapshot.environmentSeed}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-md border px-2.5 py-1.5 ${mainPanelClass}`}>
          <div
            className={`mb-1 font-mono text-[10px] font-semibold ${
              showVerdict ? 'text-emerald-300' : 'text-zinc-400'
            }`}
          >
            AI World · MAIN
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MetricCell
              label="task"
              value={OUTCOME_LABEL[mainOutcome]}
              tone={
                showVerdict && mainOutcome === 'success'
                  ? 'text-emerald-300'
                  : 'text-zinc-300'
              }
            />
            <MetricCell
              label="replan"
              value={String(snapshot.metrics.replanCount)}
            />
            <MetricCell
              label="cost(m)"
              value={snapshot.pathCostMeters.toFixed(2)}
            />
          </div>
          <div className="mt-1 font-mono text-[9px] text-zinc-500">
            nav · {NAV_LABEL[snapshot.navStatus]}
          </div>
        </div>

        <div className={`rounded-md border px-2.5 py-1.5 ${shadowPanelClass}`}>
          <div
            className={`mb-1 font-mono text-[10px] font-semibold ${
              showVerdict ? 'text-rose-300' : 'text-zinc-400'
            }`}
          >
            Non-AI · SHADOW
          </div>
          {shadow ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <MetricCell
                  label="task"
                  value={OUTCOME_LABEL[shadowOutcome]}
                  tone={
                    showVerdict &&
                    (shadowOutcome === 'stalled' || shadowOutcome === 'failed')
                      ? 'text-rose-300'
                      : 'text-zinc-300'
                  }
                />
                <MetricCell label="replan" value="0" tone="text-zinc-500" />
                <MetricCell
                  label="cost(m)"
                  value={shadow.pathCostMeters.toFixed(2)}
                  tone={
                    showVerdict ? 'text-rose-300' : 'text-zinc-300'
                  }
                />
              </div>
              <div className="mt-1 font-mono text-[9px] text-zinc-500">
                nav · {NAV_LABEL[shadow.navStatus]}
              </div>
            </>
          ) : (
            <div className="font-mono text-[10px] text-zinc-600">
              等待影子数据…
            </div>
          )}
        </div>
      </div>

      <CostSparkline samples={costSeries} className="mt-2" />

      {/* 三行定稿 Insight */}
      <div
        className={`mt-2 rounded-md border px-2.5 py-1.5 ${
          insight.ready
            ? 'border-violet-500/45 bg-violet-500/10'
            : 'border-zinc-700/50 bg-zinc-900/60'
        }`}
      >
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-violet-300/90">
          Counterfactual Insight
          {insightFrozen ? ' · FROZEN' : ''}
        </div>
        <ul className="space-y-0.5 text-[11px] leading-snug">
          <li className={insight.ready ? 'text-zinc-100' : 'text-zinc-500'}>
            {insight.perturbation}
          </li>
          <li className={insight.ready ? 'text-violet-100' : 'text-zinc-500'}>
            {insight.counterfactual}
          </li>
          <li
            className={
              insight.ready
                ? 'font-medium text-emerald-200'
                : 'text-zinc-500'
            }
          >
            {insight.gain}
          </li>
        </ul>
      </div>
    </section>
  );
}
