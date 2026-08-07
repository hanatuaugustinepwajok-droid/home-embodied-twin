/**
 * CostSparkline — MAIN vs SHADOW 路程随时间火花线
 */

'use client';

import type { CostSample } from '@/types/costSeries';

export type { CostSample };

const EMPTY: CostSample[] = [];

export function CostSparkline({
  samples,
  className = '',
}: {
  samples: CostSample[];
  className?: string;
}) {
  const data = samples.length > 0 ? samples : EMPTY;
  if (data.length < 2) {
    return (
      <div
        className={`flex h-10 items-center justify-center font-mono text-[9px] text-zinc-600 ${className}`}
      >
        cost series · waiting
      </div>
    );
  }

  const w = 280;
  const h = 40;
  const pad = 2;
  const maxY = Math.max(
    ...data.map((d) => Math.max(d.main, d.shadow)),
    0.01,
  );
  const toX = (i: number) =>
    pad + (i / (data.length - 1)) * (w - pad * 2);
  const toY = (v: number) => h - pad - (v / maxY) * (h - pad * 2);

  const mainPath = data
    .map((d, idx) => `${idx === 0 ? 'M' : 'L'}${toX(idx)},${toY(d.main)}`)
    .join(' ');
  const shadowPath = data
    .map(
      (d, idx) => `${idx === 0 ? 'M' : 'L'}${toX(idx)},${toY(d.shadow)}`,
    )
    .join(' ');

  return (
    <div className={className}>
      <div className="mb-0.5 flex items-center justify-between font-mono text-[9px] text-zinc-500">
        <span>代价曲线 · path cost</span>
        <span>
          <span className="text-cyan-400">MAIN</span>
          {' / '}
          <span className="text-rose-400">SHADOW</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-10 w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={shadowPath}
          fill="none"
          stroke="#f87171"
          strokeWidth="1.5"
          strokeDasharray="3 2"
          opacity="0.85"
        />
        <path
          d={mainPath}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.75"
          opacity="0.95"
        />
      </svg>
    </div>
  );
}
