/**
 * SemanticMapPanel — 语义地图面板（挑战2：空间理解）
 * 职责：语义标签 + 置信度条；点击房间 → focusRoomId；无裸坐标。
 */

'use client';

import { Box, MapPinned, Users } from 'lucide-react';
import { useHomeStore } from '@/store/useHomeStore';
import type { ObjectNode, PersonNode, RoomNode, SemanticMap } from '@/types/home';

const EMPTY_MAP: SemanticMap = { rooms: [], objects: [], persons: [] };

function ConfidenceBar({
  value,
  warn = false,
}: {
  value: number;
  warn?: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const barColor =
    pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400';

  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`shrink-0 font-mono text-[10px] ${
          pct >= 80
            ? 'text-emerald-300'
            : pct >= 50
              ? 'text-amber-300'
              : 'text-rose-300'
        }`}
      >
        {pct}%
      </span>
      {warn && (
        <span className="shrink-0 text-[10px] text-amber-400" title="置信度偏低 / 可能变动">
          ⚠️ 变动
        </span>
      )}
    </div>
  );
}

function roomConfidence(
  room: RoomNode,
  objects: ObjectNode[],
  persons: PersonNode[],
): { value: number; stale: boolean } {
  const objs = objects.filter((o) => o.roomId === room.id);
  const pers = persons.filter((p) => p.roomId === room.id);
  const confs = [
    ...objs.map((o) => o.confidence),
    ...pers.map((p) => p.confidence),
  ];
  if (confs.length === 0) {
    return { value: 0.94, stale: false };
  }
  const avg = confs.reduce((a, b) => a + b, 0) / confs.length;
  return { value: avg, stale: avg < 0.55 };
}

export function SemanticMapPanel() {
  const map = useHomeStore((s) => s.snapshot?.semanticMap ?? EMPTY_MAP);
  const focusRoomId = useHomeStore((s) => s.focusRoomId);
  const setFocusRoomId = useHomeStore((s) => s.setFocusRoomId);

  const { rooms, objects, persons } = map;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/80 p-3">
      <header className="mb-2 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-100">语义地图</h2>
        <p className="text-[11px] text-zinc-500">
          点击房间聚焦 · 置信度条 · 挑战2
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            <MapPinned className="h-3 w-3 text-cyan-400" />
            房间
          </div>
          <ul className="space-y-1">
            {rooms.map((r) => {
              const conf = roomConfidence(r, objects, persons);
              const focused = focusRoomId === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setFocusRoomId(focused ? null : r.id)
                    }
                    className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      focused
                        ? 'border-cyan-500/50 bg-cyan-500/15'
                        : 'border-zinc-700/50 bg-zinc-950/50 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-zinc-200">{r.name}</span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        语义节点
                      </span>
                    </div>
                    <ConfidenceBar value={conf.value} warn={conf.stale} />
                  </button>
                </li>
              );
            })}
            {rooms.length === 0 && (
              <li className="text-xs text-zinc-500">等待仿真初始化…</li>
            )}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            <Box className="h-3 w-3 text-amber-400" />
            物品
          </div>
          <ul className="space-y-1">
            {objects.map((o) => {
              const roomName =
                rooms.find((r) => r.id === o.roomId)?.name ?? o.roomId;
              const low = o.confidence < 0.55;
              return (
                <li
                  key={o.id}
                  className="rounded-lg border border-zinc-700/50 bg-zinc-950/50 px-2.5 py-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-zinc-200">{o.name}</span>
                    <span className="text-[10px] text-cyan-400/80">
                      @ {roomName}
                    </span>
                  </div>
                  <ConfidenceBar value={o.confidence} warn={low} />
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            <Users className="h-3 w-3 text-cyan-400" />
            人员
          </div>
          <ul className="space-y-1">
            {persons.map((p) => {
              const roomName = p.roomId
                ? (rooms.find((r) => r.id === p.roomId)?.name ?? p.roomId)
                : '未知';
              const low = p.confidence < 0.55;
              return (
                <li
                  key={p.id}
                  className="rounded-lg border border-zinc-700/50 bg-zinc-950/50 px-2.5 py-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-zinc-200">{p.name}</span>
                    <span className="text-[10px] text-cyan-400/80">
                      @ {roomName}
                    </span>
                  </div>
                  <ConfidenceBar value={p.confidence} warn={low} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
