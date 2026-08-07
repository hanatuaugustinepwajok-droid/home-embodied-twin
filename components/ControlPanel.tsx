/**
 * ControlPanel — Scenario Builds（作品集成品）
 * 挑战卡 + 一键反事实验证 + 消融矩阵；状态 Chip 二级折叠。
 */

'use client';

import {
  Clapperboard,
  Copy,
  Download,
  Eye,
  GitCompareArrows,
  OctagonAlert,
  Pause,
  Play,
  RefreshCw,
  Search,
  UserSearch,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AboutExperiment } from '@/components/AboutExperiment';
import {
  buildInsightLines,
  formatRunReport,
} from '@/lib/insightTemplate';
import { useHomeStore } from '@/store/useHomeStore';
import type { DisplayMode } from '@/types/counterfactual';
import type { NavStatus, TaskStatus } from '@/types/home';

const NAV_LABEL: Record<NavStatus, string> = {
  idle: '空闲',
  navigating: '导航中',
  avoiding: '避障中',
  stuck: '卡住',
  replanning: '重规划',
  recovered: '已恢复',
};

const TASK_LABEL: Record<TaskStatus, string> = {
  idle: '空闲',
  planning: '规划中',
  navigating: '导航中',
  searching: '搜索中',
  replanning: '重规划',
  verifying: '确认中',
  success: '成功',
  failed: '失败',
};

const DISPLAY_MODES: { id: DisplayMode; label: string }[] = [
  { id: 'SPLIT_SCREEN', label: '分屏' },
  { id: 'OVERLAY', label: '叠加' },
  { id: 'MAIN_ONLY', label: '仅主' },
];

const TASK_POLL_MS = 200;
const FREEZE_MS = 1800;
const PROVEN_WAIT_MAX_MS = 18_000;

function ActionButton({
  onClick,
  icon,
  children,
  variant = 'default',
  disabled = false,
  className = '',
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'danger' | 'amber' | 'violet';
  disabled?: boolean;
  className?: string;
}) {
  const variantClass =
    variant === 'primary'
      ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
      : variant === 'danger'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20'
        : variant === 'amber'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
          : variant === 'violet'
            ? 'border-violet-500/45 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25'
            : 'border-zinc-600/60 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700/80';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${className}`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span>{children}</span>
    </button>
  );
}

function ChallengeCard({
  title,
  proof,
  onClick,
  disabled,
  icon,
}: {
  title: string;
  proof: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 px-2.5 py-2 text-left transition-colors hover:border-cyan-500/35 hover:bg-zinc-900/80 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-100">
        {icon}
        {title}
      </div>
      <p className="mt-1 text-[10px] leading-snug text-zinc-500">{proof}</p>
    </button>
  );
}

export function ControlPanel() {
  const snapshot = useHomeStore((s) => s.snapshot);
  const shadow = useHomeStore((s) => s.shadowSnapshot);
  const isRunning = useHomeStore((s) => s.isRunning);
  const setRunning = useHomeStore((s) => s.setRunning);
  const injectObstacle = useHomeStore((s) => s.injectObstacle);
  const startFindPerson = useHomeStore((s) => s.startFindPerson);
  const startFindObject = useHomeStore((s) => s.startFindObject);
  const resetAll = useHomeStore((s) => s.resetAll);
  const completeDemo = useHomeStore((s) => s.completeDemo);
  const ablationEnabled = useHomeStore((s) => s.ablationEnabled);
  const displayMode = useHomeStore((s) => s.displayMode);
  const toggleCounterfactualCompare = useHomeStore(
    (s) => s.toggleCounterfactualCompare,
  );
  const setDisplayMode = useHomeStore((s) => s.setDisplayMode);
  const mainCapabilities = useHomeStore((s) => s.mainCapabilities);
  const setMainCapability = useHomeStore((s) => s.setMainCapability);
  const experimentLocked = useHomeStore((s) => s.experimentLocked);
  const setInsightFrozen = useHomeStore((s) => s.setInsightFrozen);
  const setExperimentLocked = useHomeStore((s) => s.setExperimentLocked);
  const setPinnedInsight = useHomeStore((s) => s.setPinnedInsight);
  const setVerdictFlash = useHomeStore((s) => s.setVerdictFlash);
  const clearCostSeries = useHomeStore((s) => s.clearCostSeries);
  const rerunSameSeed = useHomeStore((s) => s.rerunSameSeed);
  const pinnedInsight = useHomeStore((s) => s.pinnedInsight);

  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const busy = isDemoRunning || experimentLocked;

  const clearDemoTimers = () => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  };

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const id = window.setTimeout(() => {
        timersRef.current = timersRef.current.filter((t) => t !== id);
        resolve();
      }, ms);
      timersRef.current.push(id);
    });

  /** 等到 SHADOW 红失败 + MAIN 已重规划/成功 */
  const waitForProven = async (timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (abortRef.current) return false;
      const st = useHomeStore.getState();
      const main = st.snapshot;
      const sh = st.shadowSnapshot;
      if (!main || !sh) {
        await delay(TASK_POLL_MS);
        continue;
      }
      const shadowFail =
        sh.taskOutcome === 'stalled' || sh.taskOutcome === 'failed';
      const mainOk =
        main.taskOutcome === 'success' ||
        main.metrics.replanCount > 0 ||
        (main.navStatus === 'recovered' && shadowFail);
      if (shadowFail && mainOk) return true;
      await delay(TASK_POLL_MS);
    }
    return false;
  };

  const freezeVerdict = async () => {
    const st = useHomeStore.getState();
    const main = st.snapshot;
    const sh = st.shadowSnapshot;
    if (!main) return;

    const lines = buildInsightLines({
      mainOutcome: main.taskOutcome,
      shadowOutcome: sh?.taskOutcome ?? 'idle',
      mainCost: main.pathCostMeters,
      shadowCost: sh?.pathCostMeters ?? 0,
      mainReplan: main.metrics.replanCount,
      shadowRoomId: sh?.robot.roomId,
      didTargetLost: main.isTargetOccluded,
      isObstacleInjected: main.isObstacleInjected,
      taskRunning: false,
    });

    setPinnedInsight(lines);
    setInsightFrozen(true);
    setVerdictFlash('proven');
    setRunning(false);
    setExperimentLocked(true);
    await delay(FREEZE_MS);
  };

  useEffect(() => {
    return () => {
      abortRef.current = true;
      clearDemoTimers();
    };
  }, []);

  /** 一键反事实验证剧本 */
  const runCounterfactualScript = async () => {
    if (isDemoRunning) return;
    abortRef.current = false;
    clearDemoTimers();
    setIsDemoRunning(true);
    setRunning(true);
    setExperimentLocked(false);
    setInsightFrozen(false);
    setPinnedInsight(null);
    setVerdictFlash('none');
    clearCostSeries();

    try {
      const store = useHomeStore.getState();
      if (!store.ablationEnabled) {
        store.toggleCounterfactualCompare();
      }
      store.setDisplayMode('SPLIT_SCREEN');
      resetAll();
      await delay(600);
      if (abortRef.current) return;

      // 同任务
      startFindPerson('爸爸');
      await delay(1600);
      if (abortRef.current) return;

      // 注入扰动
      injectObstacle();
      await waitForProven(PROVEN_WAIT_MAX_MS);
      if (abortRef.current) return;

      await freezeVerdict();
      if (abortRef.current) return;
      completeDemo();
    } finally {
      clearDemoTimers();
      setIsDemoRunning(false);
    }
  };

  const exportConclusion = async () => {
    const st = useHomeStore.getState();
    const main = st.snapshot;
    const sh = st.shadowSnapshot;
    if (!main) return;
    const insight =
      st.pinnedInsight ??
      buildInsightLines({
        mainOutcome: main.taskOutcome,
        shadowOutcome: sh?.taskOutcome ?? 'idle',
        mainCost: main.pathCostMeters,
        shadowCost: sh?.pathCostMeters ?? 0,
        mainReplan: main.metrics.replanCount,
        shadowRoomId: sh?.robot.roomId,
        didTargetLost: main.isTargetOccluded,
        isObstacleInjected: main.isObstacleInjected,
        taskRunning: false,
      });
    const text = formatRunReport({
      seed: st.environmentSeed,
      insight,
      mainCost: main.pathCostMeters,
      shadowCost: sh?.pathCostMeters ?? 0,
      mainReplan: main.metrics.replanCount,
      mainOutcome: main.taskOutcome,
      shadowOutcome: sh?.taskOutcome ?? 'idle',
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cf-twin-seed-${st.environmentSeed}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const navStatus = snapshot?.navStatus ?? 'idle';
  const taskStatus = snapshot?.currentTask?.status;

  return (
    <section className="flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/80 p-3">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            Scenario Builds
          </h2>
          <p className="text-[11px] text-zinc-500">场景构建 · AI Value Proven</p>
        </div>
        {experimentLocked && (
          <span className="rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-300">
            LOCKED
          </span>
        )}
      </header>

      <ActionButton
        onClick={() => void runCounterfactualScript()}
        icon={<Clapperboard className="h-4 w-4" />}
        variant="violet"
        disabled={isDemoRunning}
      >
        {isDemoRunning ? '验证中…' : '一键反事实验证'}
      </ActionButton>

      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        挑战卡 · 验证什么
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        <ChallengeCard
          title="动态障碍"
          proof="验证：反事实重规划 vs 静态栅格卡死"
          icon={<OctagonAlert className="h-3.5 w-3.5 text-amber-400" />}
          disabled={busy}
          onClick={() => {
            if (!ablationEnabled) toggleCounterfactualCompare();
            injectObstacle();
          }}
        />
        <ChallengeCard
          title="目标遮挡"
          proof="验证：语义时效丢失恢复（找爸爸）"
          icon={<UserSearch className="h-3.5 w-3.5 text-cyan-400" />}
          disabled={busy}
          onClick={() => {
            if (!ablationEnabled) toggleCounterfactualCompare();
            startFindPerson('爸爸');
          }}
        />
        <ChallengeCard
          title="语义过期"
          proof="验证：动态语义地图驱动寻物（遥控器）"
          icon={<Search className="h-3.5 w-3.5 text-emerald-400" />}
          disabled={busy}
          onClick={() => {
            if (!ablationEnabled) toggleCounterfactualCompare();
            startFindObject('遥控器');
          }}
        />
      </div>

      <div className="rounded-lg border border-zinc-700/50 bg-zinc-950/50 p-2">
        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
          消融开关 · 价值来自哪一块
        </div>
        <div className="space-y-1">
          {(
            [
              ['dynamicSemanticMap', '动态语义地图'],
              ['confidenceDecay', '语义时效衰减'],
              ['counterfactualPlanner', '反事实重规划'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300"
            >
              <input
                type="checkbox"
                checked={mainCapabilities[key]}
                disabled={busy}
                onChange={(e) => setMainCapability(key, e.target.checked)}
                className="rounded border-zinc-600"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <ActionButton
          onClick={toggleCounterfactualCompare}
          icon={<GitCompareArrows className="h-3.5 w-3.5" />}
          variant={ablationEnabled ? 'amber' : 'default'}
          disabled={isDemoRunning}
          className="!py-1.5 text-xs"
        >
          {ablationEnabled ? '关闭对比' : '开启对比'}
        </ActionButton>
        <ActionButton
          onClick={rerunSameSeed}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          className="!py-1.5 text-xs"
          disabled={isDemoRunning}
        >
          同 seed 再跑
        </ActionButton>
        <ActionButton
          onClick={() => void exportConclusion()}
          icon={
            copied ? (
              <Copy className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )
          }
          className="!py-1.5 text-xs"
        >
          {copied ? '已复制' : '导出结论'}
        </ActionButton>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {DISPLAY_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={!ablationEnabled && m.id !== 'MAIN_ONLY'}
            onClick={() => setDisplayMode(m.id)}
            className={`rounded-md border px-1 py-1 font-mono text-[10px] transition-colors disabled:opacity-40 ${
              displayMode === m.id
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                : 'border-zinc-700/60 bg-zinc-900 text-zinc-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <AboutExperiment />

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
      >
        <Eye className="h-3 w-3" />
        {showAdvanced ? '收起状态' : '高级状态'}
      </button>

      {showAdvanced && (
        <div className="flex flex-wrap gap-1 font-mono text-[10px]">
          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-400">
            {taskStatus ? TASK_LABEL[taskStatus] : '无任务'}
          </span>
          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-400">
            {NAV_LABEL[navStatus]}
          </span>
          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-400">
            sh {shadow?.taskOutcome ?? '—'}
          </span>
          {pinnedInsight?.ready && (
            <span className="rounded border border-violet-500/40 px-1.5 py-0.5 text-violet-300">
              insight pinned
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex gap-1">
        <ActionButton
          onClick={() => setRunning(!isRunning)}
          icon={
            isRunning ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )
          }
          disabled={isDemoRunning}
          className="!py-1.5 flex-1 text-xs"
        >
          {isRunning ? '暂停' : '继续'}
        </ActionButton>
        <ActionButton
          onClick={resetAll}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          variant="danger"
          disabled={isDemoRunning}
          className="!py-1.5 flex-1 text-xs"
        >
          重置
        </ActionButton>
      </div>
    </section>
  );
}
