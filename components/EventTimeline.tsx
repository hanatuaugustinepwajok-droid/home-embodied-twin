/**
 * EventTimeline — 事件时间轴
 * 职责：INFO / WARNING 区分；反事实事件 [COUNTERFACTUAL] 高亮；
 *       点击 warning/critical/CF → focusRoom + Insight 摘要。
 */

'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, GitCompareArrows, Info, Siren } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { parseRoomIdFromMessage } from '@/lib/roomFocus';
import { useHomeStore } from '@/store/useHomeStore';
import type { TwinEvent, TwinEventType } from '@/types/home';

const EMPTY_EVENTS: TwinEvent[] = [];

const COUNTERFACTUAL_TYPES = new Set<TwinEventType>([
  'counterfactual_insight',
  'path_replanned',
  'task_replanned',
  'stuck_recovered',
]);

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function isCounterfactual(type: TwinEventType): boolean {
  return COUNTERFACTUAL_TYPES.has(type);
}

function severityStyle(ev: TwinEvent): {
  border: string;
  icon: React.ReactNode;
  label: string;
} {
  if (isCounterfactual(ev.type)) {
    return {
      border: 'border-l-violet-500 bg-violet-500/10',
      icon: <GitCompareArrows className="h-3.5 w-3.5 text-orange-400" />,
      label: 'COUNTERFACTUAL',
    };
  }
  switch (ev.severity) {
    case 'critical':
      return {
        border: 'border-l-rose-500 bg-rose-500/5',
        icon: <Siren className="h-3.5 w-3.5 text-rose-400" />,
        label: 'CRITICAL',
      };
    case 'warning':
      return {
        border: 'border-l-amber-500 bg-amber-500/5',
        icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
        label: 'WARNING',
      };
    case 'info':
    default:
      return {
        border: 'border-l-cyan-500 bg-cyan-500/5',
        icon: <Info className="h-3.5 w-3.5 text-cyan-400" />,
        label: 'INFO',
      };
  }
}

export function EventTimeline() {
  const events = useHomeStore((s) => s.snapshot?.events ?? EMPTY_EVENTS);
  const setFocusRoomId = useHomeStore((s) => s.setFocusRoomId);
  const setFocusedEventSummary = useHomeStore((s) => s.setFocusedEventSummary);

  /** 重规划类事件首次出现闪烁一次 */
  const [blinkIds, setBlinkIds] = useState<Set<string>>(() => new Set());
  const seenReplanRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fresh: string[] = [];
    for (const ev of events) {
      if (
        (ev.type === 'path_replanned' ||
          ev.type === 'task_replanned' ||
          ev.type === 'counterfactual_insight') &&
        !seenReplanRef.current.has(ev.id)
      ) {
        seenReplanRef.current.add(ev.id);
        fresh.push(ev.id);
      }
    }
    if (fresh.length === 0) return;
    setBlinkIds((prev) => {
      const next = new Set(prev);
      for (const id of fresh) next.add(id);
      return next;
    });
    const timer = window.setTimeout(() => {
      setBlinkIds((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [events]);

  const onEventClick = (ev: TwinEvent) => {
    const clickable =
      ev.severity === 'warning' ||
      ev.severity === 'critical' ||
      isCounterfactual(ev.type);
    if (!clickable) return;

    const roomId = parseRoomIdFromMessage(ev.message);
    if (roomId) setFocusRoomId(roomId);
    setFocusedEventSummary(ev.message);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/80 p-3">
      <header className="mb-2 flex shrink-0 items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">事件时间轴</h2>
          <p className="text-[11px] text-zinc-500">
            点击 warning / 反事实 → 聚焦房间
          </p>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">
          {events.length} events
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-700/60 text-xs text-zinc-500">
            暂无事件
          </div>
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {events.map((ev) => {
                const style = severityStyle(ev);
                const cf = isCounterfactual(ev.type);
                const clickable =
                  ev.severity === 'warning' ||
                  ev.severity === 'critical' ||
                  cf;
                const blinking = blinkIds.has(ev.id);

                return (
                  <motion.li
                    key={ev.id}
                    layout
                    initial={{ opacity: 0, x: 12, height: 0 }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      height: 'auto',
                      boxShadow: blinking
                        ? '0 0 0 1px rgba(167,139,250,0.7)'
                        : '0 0 0 0px rgba(0,0,0,0)',
                    }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    onClick={() => onEventClick(ev)}
                    className={`overflow-hidden rounded-lg border border-zinc-700/40 border-l-2 ${style.border} px-2.5 py-2 ${
                      clickable
                        ? 'cursor-pointer hover:bg-zinc-800/40'
                        : ''
                    } ${blinking ? 'animate-pulse' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {style.icon}
                      <span className="font-mono text-[10px] text-zinc-500">
                        {formatTime(ev.timestamp)}
                      </span>
                      {cf ? (
                        <span className="rounded bg-orange-500/20 px-1 py-px font-mono text-[9px] tracking-wider text-orange-300">
                          [COUNTERFACTUAL]
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] tracking-wider text-zinc-600">
                          {style.label}
                        </span>
                      )}
                      <span className="ml-auto truncate font-mono text-[9px] text-zinc-600">
                        {ev.type}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-zinc-200">
                      {ev.message}
                    </p>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}
