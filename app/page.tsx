/**
 * Counterfactual Shadow Twin — Dashboard 总装（作品集成品）
 * 叙事：AI Value Proven = MAIN vs SHADOW 反事实验证
 */

'use client';

import {
  BadgeCheck,
  Copy,
  GitCompareArrows,
  RefreshCw,
  ShieldOff,
} from 'lucide-react';
import { useState } from 'react';
import { ControlPanel } from '@/components/ControlPanel';
import { EventTimeline } from '@/components/EventTimeline';
import { HomeTwinCanvas } from '@/components/HomeTwinCanvas';
import { MetricsBoard } from '@/components/MetricsBoard';
import { SemanticMapPanel } from '@/components/SemanticMapPanel';
import { TaskStepsPanel } from '@/components/TaskStepsPanel';
import { useHomeSimulation } from '@/hooks/useHomeSimulation';
import { ROOM_NAME_BY_ID } from '@/lib/roomFocus';
import { useHomeStore } from '@/store/useHomeStore';
import type { TwinEvent } from '@/types/home';

const EMPTY_EVENTS: TwinEvent[] = [];

const CF_EVENT_TYPES = new Set([
  'counterfactual_insight',
  'path_replanned',
  'task_replanned',
  'stuck_recovered',
]);

function buildDecisionEvidence(
  events: TwinEvent[],
  taskSteps: { name: string; status: string; note?: string }[] | undefined,
  focusedSummary: string | null,
): string {
  if (focusedSummary) return focusedSummary;

  const cf = events.find((e) => CF_EVENT_TYPES.has(e.type));
  if (cf) return cf.message;

  const running = taskSteps?.find((s) => s.status === 'running');
  if (running) {
    return `当前步骤：${running.name}${running.note ? `（${running.note}）` : ''}`;
  }

  const lastFailed = taskSteps?.find((s) => s.status === 'failed');
  if (lastFailed) {
    return `失败点：${lastFailed.name}${lastFailed.note ? ` — ${lastFailed.note}` : ''}`;
  }

  return '等待任务 / 挑战触发后，此处显示决策依据摘要';
}

export default function HomePage() {
  useHomeSimulation();

  const ablationEnabled = useHomeStore((s) => s.ablationEnabled);
  const displayMode = useHomeStore((s) => s.displayMode);
  const emphasizeNonAi = useHomeStore((s) => s.emphasizeNonAi);
  const focusRoomId = useHomeStore((s) => s.focusRoomId);
  const focusedEventSummary = useHomeStore((s) => s.focusedEventSummary);
  const whatIfAiDisabled = useHomeStore((s) => s.whatIfAiDisabled);
  const environmentSeed = useHomeStore((s) => s.environmentSeed);
  const rerunSameSeed = useHomeStore((s) => s.rerunSameSeed);
  const insightFrozen = useHomeStore((s) => s.insightFrozen);
  const verdictFlash = useHomeStore((s) => s.verdictFlash);
  const events = useHomeStore((s) => s.snapshot?.events ?? EMPTY_EVENTS);
  const taskSteps = useHomeStore((s) => s.snapshot?.currentTask?.steps);

  const [seedCopied, setSeedCopied] = useState(false);

  const evidence = buildDecisionEvidence(
    events,
    taskSteps,
    focusedEventSummary,
  );

  const copySeed = async () => {
    try {
      await navigator.clipboard.writeText(String(environmentSeed));
      setSeedCopied(true);
      window.setTimeout(() => setSeedCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* 结局闪色层 */}
      {verdictFlash === 'proven' && (
        <div className="pointer-events-none absolute inset-0 z-50 animate-pulse bg-emerald-500/5" />
      )}

      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/90 bg-zinc-900/90 px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10">
            <GitCompareArrows className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-zinc-50">
                Counterfactual Shadow Twin
              </h1>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                <BadgeCheck className="h-3 w-3" />
                AI Value Proven
              </span>
              {insightFrozen && (
                <span className="rounded border border-violet-500/50 bg-violet-500/15 px-1.5 py-0.5 font-mono text-[9px] text-violet-200">
                  INSIGHT FROZEN
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-zinc-500">
              AI World (MAIN) vs Non-AI World (SHADOW) · 反事实验证台
            </p>
          </div>
        </div>

        <div className="hidden min-w-0 max-w-md flex-1 flex-col px-3 lg:flex">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            Decision Evidence
          </div>
          <p className="truncate text-[11px] leading-snug text-zinc-300">
            {evidence}
          </p>
          {focusRoomId && (
            <p className="mt-0.5 font-mono text-[10px] text-cyan-400/90">
              focus · {ROOM_NAME_BY_ID[focusRoomId]}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1 rounded-lg border border-zinc-700/70 bg-zinc-950/60 px-2 py-1 sm:flex">
            <span className="font-mono text-[10px] text-zinc-400">
              seed={environmentSeed}
            </span>
            <button
              type="button"
              onClick={() => void copySeed()}
              className="rounded p-0.5 text-zinc-500 hover:text-cyan-300"
              title="复制 seed"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={rerunSameSeed}
              className="inline-flex items-center gap-0.5 rounded px-1 font-mono text-[9px] text-zinc-400 hover:text-cyan-200"
              title="同条件再跑"
            >
              <RefreshCw className="h-3 w-3" />
              {seedCopied ? 'copied' : '再跑'}
            </button>
          </div>

          <button
            type="button"
            onClick={whatIfAiDisabled}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              emphasizeNonAi
                ? 'border-rose-500/50 bg-rose-500/20 text-rose-100'
                : 'border-rose-500/35 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
            }`}
            title="强调 Non-AI / SHADOW（关闭 AI 策略视角）"
          >
            <ShieldOff className="h-3.5 w-3.5" />
            What if AI disabled
          </button>
          <div className="hidden font-mono text-[10px] tracking-wider text-zinc-500 md:block">
            <span
              className={
                ablationEnabled ? 'text-amber-400/90' : 'text-zinc-600'
              }
            >
              ABLATION {ablationEnabled ? 'ON' : 'OFF'}
            </span>
            <span className="mx-1.5 text-zinc-700">|</span>
            <span>{displayMode}</span>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-1.5 lg:hidden">
        <div className="text-[9px] uppercase tracking-wider text-zinc-500">
          Decision Evidence
        </div>
        <p className="truncate text-[11px] text-zinc-300">{evidence}</p>
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-12 grid-rows-[1fr_auto] gap-3 overflow-hidden p-3">
        <div className="col-span-3 flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="min-h-0 flex-[1.15] overflow-hidden">
            <ControlPanel />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <SemanticMapPanel />
          </div>
        </div>

        <div className="relative col-span-5 min-h-0 overflow-hidden rounded-xl border border-zinc-700/70">
          <HomeTwinCanvas />
        </div>

        <div className="col-span-4 flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="min-h-0 flex-[0.9] overflow-hidden">
            <TaskStepsPanel />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <EventTimeline />
          </div>
        </div>

        <div className="col-span-12">
          <MetricsBoard />
        </div>
      </main>
    </div>
  );
}
