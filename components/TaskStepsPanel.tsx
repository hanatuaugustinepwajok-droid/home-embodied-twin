/**
 * TaskStepsPanel — 当前任务步骤面板（挑战3 / 挑战4）
 * 职责：展示 currentTask 元信息与逐步状态，只读 useHomeStore.snapshot。
 */

'use client';

import {
  CheckCircle2,
  Circle,
  CircleDashed,
  LoaderCircle,
  SkipForward,
  XCircle,
} from 'lucide-react';
import { useHomeStore } from '@/store/useHomeStore';
import type { TaskStatus, TaskStep } from '@/types/home';

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  idle: '空闲',
  planning: '规划中',
  navigating: '导航中',
  searching: '搜索中',
  replanning: '重规划',
  verifying: '确认中',
  success: '成功',
  failed: '失败',
};

const TYPE_LABEL: Record<string, string> = {
  find_person: '寻人',
  find_object: '寻物',
  goto_room: '去房间',
};

function StepIcon({ status }: { status: TaskStep['status'] }) {
  switch (status) {
    case 'running':
      return (
        <LoaderCircle className="h-4 w-4 animate-spin text-cyan-400" />
      );
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-rose-400" />;
    case 'skipped':
      return <SkipForward className="h-4 w-4 text-zinc-500" />;
    case 'pending':
    default:
      return <CircleDashed className="h-4 w-4 text-zinc-500" />;
  }
}

function stepTone(status: TaskStep['status']): string {
  switch (status) {
    case 'running':
      return 'border-cyan-500/40 bg-cyan-500/10';
    case 'success':
      return 'border-emerald-500/30 bg-emerald-500/5';
    case 'failed':
      return 'border-rose-500/40 bg-rose-500/10';
    case 'skipped':
      return 'border-zinc-700/50 bg-zinc-900/40 opacity-60';
    default:
      return 'border-zinc-700/50 bg-zinc-950/40';
  }
}

export function TaskStepsPanel() {
  const task = useHomeStore((s) => s.snapshot?.currentTask ?? null);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/80 p-3">
      <header className="mb-2 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-100">任务步骤</h2>
        <p className="text-[11px] text-zinc-500">挑战3 闭环 · 挑战4 中断恢复</p>
      </header>

      {!task ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700/60 bg-zinc-950/40 text-zinc-500">
          <Circle className="h-6 w-6 opacity-40" />
          <p className="text-sm">当前无任务</p>
          <p className="text-[11px]">从左侧发起「找爸爸 / 找遥控器」</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="shrink-0 rounded-lg border border-zinc-700/60 bg-zinc-950/50 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-zinc-100">
                  {TYPE_LABEL[task.type] ?? task.type} · {task.targetName}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                  {task.id}
                </div>
              </div>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[10px] ${
                  task.status === 'success'
                    ? 'border-emerald-500/40 text-emerald-300'
                    : task.status === 'failed'
                      ? 'border-rose-500/40 text-rose-300'
                      : 'border-cyan-500/40 text-cyan-300'
                }`}
              >
                {TASK_STATUS_LABEL[task.status]}
              </span>
            </div>
            <div className="mt-1.5 flex gap-3 font-mono text-[11px] text-zinc-400">
              <span>
                replanCount{' '}
                <span className="text-amber-300">{task.replanCount}</span>
              </span>
              <span>status {task.status}</span>
            </div>
            {task.failReason && (
              <p className="mt-1.5 text-xs text-rose-300/90">
                failReason: {task.failReason}
              </p>
            )}
          </div>

          <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {task.steps.map((step, idx) => (
              <li
                key={step.id}
                className={`rounded-lg border px-2.5 py-2 ${stepTone(step.status)}`}
              >
                <div className="flex items-start gap-2">
                  <StepIcon status={step.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-zinc-100">
                        {idx + 1}. {step.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                        {step.status}
                      </span>
                    </div>
                    {step.note && (
                      <p className="mt-0.5 text-[11px] text-amber-200/80">
                        {step.note}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
