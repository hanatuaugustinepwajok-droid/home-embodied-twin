/**
 * AboutExperiment — PRD 一页 + 风险边界诚实卡（折叠）
 */

'use client';

import { useState } from 'react';
import { ChevronDown, FileText, ShieldAlert } from 'lucide-react';

export function AboutExperiment() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
          <FileText className="h-3.5 w-3.5 text-zinc-500" />
          About this experiment
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-800 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-400">
          <div>
            <div className="mb-0.5 font-semibold text-zinc-300">假设</div>
            同环境种子下，开启语义时效与反事实重规划（MAIN）相对静态基线（SHADOW）能降低无效搜索与任务失败。
          </div>
          <div>
            <div className="mb-0.5 font-semibold text-zinc-300">指标</div>
            任务结局、重规划次数、移动代价(m)、A/B 增益（成功率 / 耗时）。
          </div>
          <div>
            <div className="mb-0.5 font-semibold text-zinc-300">成功标准</div>
            挑战触发后：SHADOW → STALLED/FAILED；MAIN → REPLAN → SUCCESS；Insight 三行可复述。
          </div>
          <div>
            <div className="mb-0.5 font-semibold text-zinc-300">非目标</div>
            非真机 SLAM/VLM；非完整位姿回放；不追求场景美观堆砌。
          </div>
          <div className="flex gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-amber-100/90">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <div>
              <div className="font-semibold text-amber-200">风险与边界</div>
              Web Mock 仿真，非真实硬件。SHADOW 失败是<strong>消融设计</strong>
              （关闭语义重规划的反事实），用于证明 AI 策略价值，而非物理引擎缺陷。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
