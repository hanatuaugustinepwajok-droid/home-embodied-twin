/**
 * Counterfactual Shadow Twin — 家庭场景仿真 Hook
 * 职责：单一 50ms tick 推进主机器人（语义重规划）与影子机器人（静态基线），
 *       写入 useHomeStore.snapshot / shadowSnapshot。不含任何 UI / 3D 组件。
 *
 * 挑战标注约定：
 *   挑战1 建图导航不稳
 *   挑战2 空间理解不足
 *   挑战3 寻人寻物不闭环
 *   挑战4 任务执行易中断
 */

'use client';

import { useEffect, useRef } from 'react';
import { buildInsightLines } from '@/lib/insightTemplate';
import { useHomeStore } from '@/store/useHomeStore';
import type { AgentTaskOutcome, ShadowSnapshot } from '@/types/counterfactual';
import type {
  HomeMetrics,
  HomeSnapshot,
  HomeTask,
  NavStatus,
  ObjectNode,
  PendingCommand,
  PersonNode,
  RoomId,
  RoomNode,
  SemanticMap,
  TaskStep,
  TwinEvent,
  TwinEventType,
  Vec3,
} from '@/types/home';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const TICK_MS = 50;
const PATH_HISTORY_MAX = 100;
const EVENTS_MAX = 40;
/** 每 tick 前进距离（米） */
const SPEED_PER_TICK = 0.045;
/** 到达路径点判定半径 */
const WAYPOINT_EPS = 0.12;

const ROOM_NAMES: Record<RoomId, string> = {
  living_room: '客厅',
  bedroom: '卧室',
  kitchen: '厨房',
  corridor: '走廊',
};

/** 户型软边界（防止飞出太远） */
const HOUSE_BOUNDS = {
  min: { x: -0.5, y: 0, z: -0.5 },
  max: { x: 10.5, y: 0, z: 8.5 },
};

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}`;
}

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function cloneVec(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function dist2d(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function softClampPosition(p: Vec3): Vec3 {
  return {
    x: clamp(p.x, HOUSE_BOUNDS.min.x, HOUSE_BOUNDS.max.x),
    y: 0,
    z: clamp(p.z, HOUSE_BOUNDS.min.z, HOUSE_BOUNDS.max.z),
  };
}

function yawToward(from: Vec3, to: Vec3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function pointInBounds(p: Vec3, room: RoomNode): boolean {
  return (
    p.x >= room.bounds.min.x &&
    p.x <= room.bounds.max.x &&
    p.z >= room.bounds.min.z &&
    p.z <= room.bounds.max.z
  );
}

function resolveRoomId(pos: Vec3, rooms: RoomNode[]): RoomId {
  for (const r of rooms) {
    if (pointInBounds(pos, r)) return r.id;
  }
  // 挑战2：空间理解不足 — 越界时回退最近房间中心，模拟定位漂移
  let best: RoomId = 'living_room';
  let bestD = Infinity;
  for (const r of rooms) {
    const d = dist2d(pos, r.center);
    if (d < bestD) {
      bestD = d;
      best = r.id;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 初始语义地图（一室一厅）
// ---------------------------------------------------------------------------

function createInitialRooms(): RoomNode[] {
  return [
    {
      id: 'living_room',
      name: ROOM_NAMES.living_room,
      center: vec(3, 0, 3),
      bounds: { min: vec(0, 0, 0), max: vec(6, 0, 5.5) },
    },
    {
      id: 'bedroom',
      name: ROOM_NAMES.bedroom,
      center: vec(8.5, 0, 2.5),
      bounds: { min: vec(6.5, 0, 0), max: vec(10.5, 0, 5) },
    },
    {
      id: 'kitchen',
      name: ROOM_NAMES.kitchen,
      center: vec(2, 0, 7),
      bounds: { min: vec(0, 0, 5.5), max: vec(4.5, 0, 8.5) },
    },
    {
      id: 'corridor',
      name: ROOM_NAMES.corridor,
      center: vec(6.2, 0, 2.8),
      bounds: { min: vec(5.5, 0, 1.5), max: vec(7, 0, 4.5) },
    },
  ];
}

function createInitialObjects(now: number): ObjectNode[] {
  return [
    {
      id: 'obj_remote',
      name: '遥控器',
      roomId: 'living_room',
      position: vec(3.2, 0.45, 2.4), // 茶几附近
      lastSeenAt: now,
      confidence: 0.92,
      movable: true,
    },
    {
      id: 'obj_cup',
      name: '水杯',
      roomId: 'kitchen',
      position: vec(1.8, 0.85, 6.8),
      lastSeenAt: now,
      confidence: 0.88,
      movable: true,
    },
    {
      id: 'obj_charger',
      name: '充电器',
      roomId: 'bedroom',
      position: vec(9.2, 0.5, 1.6),
      lastSeenAt: now,
      confidence: 0.85,
      movable: true,
    },
  ];
}

function createInitialPersons(now: number): PersonNode[] {
  return [
    {
      id: 'person_dad',
      name: '爸爸',
      roomId: 'bedroom',
      position: vec(8.8, 0, 3.0),
      lastSeenAt: now,
      confidence: 0.9,
      faceId: 'face_dad',
      reId: 'reid_dad',
    },
    {
      id: 'person_mom',
      name: '妈妈',
      roomId: 'living_room',
      position: vec(2.5, 0, 3.5),
      lastSeenAt: now,
      confidence: 0.91,
      faceId: 'face_mom',
      reId: 'reid_mom',
    },
  ];
}

function createBaselineMetrics(): HomeMetrics {
  return {
    localizationStability: 92,
    avoidSuccessRate: 96,
    findSuccessRate: 80,
    avgSearchSeconds: 12,
    replanCount: 0,
    taskCompletionRate: 85,
    activeObstacles: 0,
  };
}

/** 客厅原点（机器人复位点） */
const LIVING_ORIGIN = vec(2.5, 0, 2.2);

function createInitialSemanticMap(now: number): SemanticMap {
  return {
    rooms: createInitialRooms(),
    objects: createInitialObjects(now),
    persons: createInitialPersons(now),
  };
}

// ---------------------------------------------------------------------------
// 路径规划（房间拓扑 Mock）
// ---------------------------------------------------------------------------

/** 房间连通拓扑：经走廊连接 */
const ROOM_GRAPH: Record<RoomId, RoomId[]> = {
  living_room: ['corridor', 'kitchen'],
  bedroom: ['corridor'],
  kitchen: ['living_room'],
  corridor: ['living_room', 'bedroom'],
};

function roomPath(from: RoomId, to: RoomId): RoomId[] {
  if (from === to) return [from];
  const queue: RoomId[][] = [[from]];
  const seen = new Set<RoomId>([from]);
  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) break;
    const last = path[path.length - 1];
    for (const next of ROOM_GRAPH[last]) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      if (next === to) return nextPath;
      seen.add(next);
      queue.push(nextPath);
    }
  }
  return [from, to];
}

function waypointsForRooms(
  rooms: RoomNode[],
  fromPos: Vec3,
  roomSequence: RoomId[],
  finalTarget?: Vec3,
): Vec3[] {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const points: Vec3[] = [cloneVec(fromPos)];
  for (let i = 1; i < roomSequence.length; i++) {
    const room = byId.get(roomSequence[i]);
    if (room) points.push(cloneVec(room.center));
  }
  if (finalTarget) {
    points.push(cloneVec(finalTarget));
  }
  return points;
}

/** 障碍绕行：在直线路径旁插入偏移点（挑战1 / 挑战4） */
function detourPath(path: Vec3[], offset = 1.1): Vec3[] {
  if (path.length < 2) return path.map(cloneVec);
  const result: Vec3[] = [cloneVec(path[0])];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    // 垂直偏移绕行
    const ox = (-dz / len) * offset;
    const oz = (dx / len) * offset;
    result.push(softClampPosition(vec(mx + ox, 0, mz + oz)));
    result.push(cloneVec(b));
  }
  return result;
}

// ---------------------------------------------------------------------------
// 内部仿真状态
// ---------------------------------------------------------------------------

type TaskPhase =
  | 'planning'
  | 'navigating_to_room'
  | 'searching'
  | 'target_lost'
  | 'replanning'
  | 'verifying'
  | 'done_success'
  | 'done_failed';

type SimInternal = {
  robotPos: Vec3;
  robotYaw: number;
  roomId: RoomId;
  navStatus: NavStatus;
  pathHistory: Vec3[];
  plannedPath: Vec3[];
  pathIndex: number;
  pathCostMeters: number;
  semanticMap: SemanticMap;
  currentTask: HomeTask | null;
  events: TwinEvent[];
  metrics: HomeMetrics;
  isObstacleInjected: boolean;
  isTargetOccluded: boolean;
  environmentSeed: number;

  /** 障碍注入后的导航子阶段计时（tick） */
  obstaclePhaseTicks: number;
  obstaclePhase:
    | 'none'
    | 'avoiding'
    | 'stuck'
    | 'replanning'
    | 'recovered';

  /** 任务内部阶段 */
  taskPhase: TaskPhase | null;
  taskPhaseTicks: number;
  didTargetLost: boolean;
  searchStartedAt: number | null;

  /** 历史任务统计（驱动指标） */
  tasksTotal: number;
  tasksSuccess: number;
  searchDurations: number[];
  avoidAttempts: number;
  avoidSuccesses: number;

  /** 本轮障碍对比是否已推送反事实洞察 */
  counterfactualInsightEmitted: boolean;
};

/** 影子基线：静态占用 + 遇障不重规划，最终 STALLED / FAILED */
type ShadowSim = {
  robotPos: Vec3;
  robotYaw: number;
  roomId: RoomId;
  navStatus: NavStatus;
  pathHistory: Vec3[];
  plannedPath: Vec3[];
  pathIndex: number;
  pathCostMeters: number;
  replanCount: number;
  taskOutcome: AgentTaskOutcome;
  staticOccupancy: Vec3[];
  obstaclePhase: 'none' | 'avoiding' | 'stuck' | 'stalled';
  obstaclePhaseTicks: number;
  /** 是否有进行中的寻人/寻物导航 */
  navigatingToTarget: boolean;
  stallSpinTicks: number;
  /**
   * 挑战已触发（障碍 / 目标丢失）：此后禁止 success，必须 stalled/failed。
   * 避免「SHADOW 成功且代价更低」反叙事。
   */
  challengeTriggered: boolean;
  /** 失败原因文案（Insight 归因） */
  failReason: string | null;
};

type TwinSim = {
  main: SimInternal;
  shadow: ShadowSim;
};

const DEFAULT_ENV_SEED = 42;

/** 由种子生成的静态占用点（走廊口附近，模拟基线地图盲区） */
function createStaticOccupancy(seed: number): Vec3[] {
  const s = seed % 1000;
  return [
    softClampPosition(vec(5.8 + (s % 7) * 0.01, 0, 2.9)),
    softClampPosition(vec(6.1, 0, 3.2 + (s % 5) * 0.02)),
    softClampPosition(vec(5.6, 0, 3.5)),
  ];
}

function deriveMainTaskOutcome(state: SimInternal): AgentTaskOutcome {
  const status = state.currentTask?.status;
  if (!status || status === 'idle') return 'idle';
  if (status === 'success') return 'success';
  if (status === 'failed') return 'failed';
  return 'running';
}

function createFreshShadow(seed: number): ShadowSim {
  return {
    robotPos: cloneVec(LIVING_ORIGIN),
    robotYaw: 0,
    roomId: 'living_room',
    navStatus: 'idle',
    pathHistory: [cloneVec(LIVING_ORIGIN)],
    plannedPath: [],
    pathIndex: 0,
    pathCostMeters: 0,
    replanCount: 0,
    taskOutcome: 'idle',
    staticOccupancy: createStaticOccupancy(seed),
    obstaclePhase: 'none',
    obstaclePhaseTicks: 0,
    navigatingToTarget: false,
    stallSpinTicks: 0,
    challengeTriggered: false,
    failReason: null,
  };
}

/** 强制 SHADOW 进入失败/卡住态（红）；代价继续微涨以体现无效搜索 */
function forceShadowChallengeFail(
  shadow: ShadowSim,
  reason: string,
  outcome: 'stalled' | 'failed' = 'stalled',
): void {
  shadow.challengeTriggered = true;
  shadow.failReason = reason;
  shadow.obstaclePhase = 'stalled';
  shadow.obstaclePhaseTicks = 0;
  shadow.navStatus = 'stuck';
  shadow.taskOutcome = outcome;
  shadow.navigatingToTarget = false;
  // 冻结规划：不再沿原路径完成任务
  shadow.plannedPath = [];
  shadow.pathIndex = 0;
}

function pushEvent(
  state: SimInternal,
  type: TwinEventType,
  message: string,
  severity: TwinEvent['severity'],
  relatedTaskId?: string,
): void {
  const ev: TwinEvent = {
    id: nextId('evt'),
    timestamp: Date.now(),
    type,
    message,
    severity,
    relatedTaskId,
  };
  // 最新在前
  state.events = [ev, ...state.events].slice(0, EVENTS_MAX);
}

function updateStep(
  task: HomeTask,
  stepId: string,
  patch: Partial<TaskStep>,
): void {
  task.steps = task.steps.map((s) =>
    s.id === stepId ? { ...s, ...patch } : s,
  );
  task.updatedAt = Date.now();
}

function recomputeMetrics(state: SimInternal): void {
  const m = state.metrics;

  // 挑战1：卡住/干扰时定位稳定度下降，恢复后回升
  if (state.navStatus === 'stuck' || state.navStatus === 'avoiding') {
    m.localizationStability = clamp(
      m.localizationStability - 0.8,
      35,
      98,
    );
  } else if (
    state.navStatus === 'recovered' ||
    state.navStatus === 'navigating'
  ) {
    m.localizationStability = clamp(
      m.localizationStability + 0.35,
      35,
      98,
    );
  } else {
    m.localizationStability = clamp(
      lerp(m.localizationStability, 92, 0.02),
      35,
      98,
    );
  }

  if (state.avoidAttempts > 0) {
    m.avoidSuccessRate = Math.round(
      (state.avoidSuccesses / state.avoidAttempts) * 100,
    );
  }

  if (state.tasksTotal > 0) {
    m.findSuccessRate = Math.round(
      (state.tasksSuccess / state.tasksTotal) * 100,
    );
    m.taskCompletionRate = m.findSuccessRate;
  }

  if (state.searchDurations.length > 0) {
    const sum = state.searchDurations.reduce((a, b) => a + b, 0);
    m.avgSearchSeconds = Math.round(
      (sum / state.searchDurations.length) * 10,
    ) / 10;
  }

  m.activeObstacles = state.isObstacleInjected ? 1 : 0;
}

function createFreshInternal(now: number, seed = DEFAULT_ENV_SEED): SimInternal {
  return {
    robotPos: cloneVec(LIVING_ORIGIN),
    robotYaw: 0,
    roomId: 'living_room',
    navStatus: 'idle',
    pathHistory: [cloneVec(LIVING_ORIGIN)],
    plannedPath: [],
    pathIndex: 0,
    pathCostMeters: 0,
    semanticMap: createInitialSemanticMap(now),
    currentTask: null,
    events: [],
    metrics: createBaselineMetrics(),
    isObstacleInjected: false,
    isTargetOccluded: false,
    environmentSeed: seed,
    obstaclePhaseTicks: 0,
    obstaclePhase: 'none',
    taskPhase: null,
    taskPhaseTicks: 0,
    didTargetLost: false,
    searchStartedAt: null,
    tasksTotal: 0,
    tasksSuccess: 0,
    searchDurations: [],
    avoidAttempts: 0,
    avoidSuccesses: 0,
    counterfactualInsightEmitted: false,
  };
}

function createFreshTwin(now: number, seed = DEFAULT_ENV_SEED): TwinSim {
  const main = createFreshInternal(now, seed);
  return {
    main,
    shadow: createFreshShadow(seed),
  };
}

function toSnapshot(state: SimInternal): HomeSnapshot {
  return {
    timestamp: Date.now(),
    robot: {
      position: cloneVec(state.robotPos),
      yaw: state.robotYaw,
      roomId: state.roomId,
    },
    navStatus: state.navStatus,
    pathHistory: state.pathHistory.map(cloneVec),
    plannedPath: state.plannedPath.map(cloneVec),
    pathCostMeters: Math.round(state.pathCostMeters * 100) / 100,
    taskOutcome: deriveMainTaskOutcome(state),
    semanticMap: {
      rooms: state.semanticMap.rooms.map((r) => ({
        ...r,
        center: cloneVec(r.center),
        bounds: {
          min: cloneVec(r.bounds.min),
          max: cloneVec(r.bounds.max),
        },
      })),
      objects: state.semanticMap.objects.map((o) => ({
        ...o,
        position: cloneVec(o.position),
      })),
      persons: state.semanticMap.persons.map((p) => ({
        ...p,
        position: p.position ? cloneVec(p.position) : null,
      })),
    },
    currentTask: state.currentTask
      ? {
          ...state.currentTask,
          steps: state.currentTask.steps.map((s) => ({ ...s })),
        }
      : null,
    events: state.events.map((e) => ({ ...e })),
    metrics: { ...state.metrics },
    isObstacleInjected: state.isObstacleInjected,
    isTargetOccluded: state.isTargetOccluded,
    environmentSeed: state.environmentSeed,
  };
}

function toShadowSnapshot(shadow: ShadowSim): ShadowSnapshot {
  return {
    timestamp: Date.now(),
    robot: {
      position: cloneVec(shadow.robotPos),
      yaw: shadow.robotYaw,
      roomId: shadow.roomId,
    },
    navStatus: shadow.navStatus,
    pathHistory: shadow.pathHistory.map(cloneVec),
    plannedPath: shadow.plannedPath.map(cloneVec),
    replanCount: shadow.replanCount,
    pathCostMeters: Math.round(shadow.pathCostMeters * 100) / 100,
    taskOutcome: shadow.taskOutcome,
    staticOccupancy: shadow.staticOccupancy.map(cloneVec),
  };
}

// ---------------------------------------------------------------------------
// 运动推进
// ---------------------------------------------------------------------------

function advanceAlongPath(state: SimInternal): boolean {
  if (state.plannedPath.length === 0) return true;
  if (state.pathIndex >= state.plannedPath.length) return true;

  // 卡住时不前进（挑战1 / 挑战4）
  if (state.navStatus === 'stuck' || state.navStatus === 'replanning') {
    return false;
  }

  const target = state.plannedPath[state.pathIndex];
  const d = dist2d(state.robotPos, target);

  if (d <= WAYPOINT_EPS) {
    state.pathIndex += 1;
    if (state.pathIndex >= state.plannedPath.length) {
      state.plannedPath = [];
      state.pathIndex = 0;
      return true;
    }
    return false;
  }

  const step = Math.min(SPEED_PER_TICK, d);
  const t = step / d;
  const next = softClampPosition(
    vec(
      lerp(state.robotPos.x, target.x, t),
      0,
      lerp(state.robotPos.z, target.z, t),
    ),
  );

  // 挑战1：轻微定位噪声
  const noise =
    state.navStatus === 'avoiding' || state.isObstacleInjected ? 0.02 : 0.006;
  next.x += (Math.random() - 0.5) * noise;
  next.z += (Math.random() - 0.5) * noise;

  const moved = dist2d(state.robotPos, next);
  state.pathCostMeters += moved;

  state.robotYaw = yawToward(state.robotPos, next);
  state.robotPos = softClampPosition(next);
  state.roomId = resolveRoomId(state.robotPos, state.semanticMap.rooms);

  state.pathHistory = [
    ...state.pathHistory,
    cloneVec(state.robotPos),
  ].slice(-PATH_HISTORY_MAX);

  return false;
}

function setPlannedPath(state: SimInternal, path: Vec3[]): void {
  // 去掉与当前位置重合的首点
  const cleaned =
    path.length > 0 && dist2d(path[0], state.robotPos) < WAYPOINT_EPS
      ? path.slice(1)
      : path;
  state.plannedPath = cleaned.map(cloneVec);
  state.pathIndex = 0;
  if (state.plannedPath.length > 0 && state.navStatus === 'idle') {
    // 挑战1：进入导航
    state.navStatus = 'navigating';
  }
}

// ---------------------------------------------------------------------------
// 障碍注入状态机
// ---------------------------------------------------------------------------

function handleObstacleLifecycle(state: SimInternal): void {
  if (state.obstaclePhase === 'none') return;

  state.obstaclePhaseTicks += 1;
  const t = state.obstaclePhaseTicks;

  // 挑战1 / 挑战4：avoiding → stuck → replanning → recovered → navigating
  if (state.obstaclePhase === 'avoiding') {
    state.navStatus = 'avoiding';
    if (t >= 20) {
      // ~1s 后卡住
      state.obstaclePhase = 'stuck';
      state.obstaclePhaseTicks = 0;
      state.navStatus = 'stuck';
      pushEvent(
        state,
        'obstacle_detected',
        '前方障碍导致停滞，定位稳定度下降',
        'warning',
        state.currentTask?.id,
      );
    }
  } else if (state.obstaclePhase === 'stuck') {
    state.navStatus = 'stuck';
    if (t >= 30) {
      // 消融：关闭反事实重规划 → MAIN 降级为长期卡住（证明该能力价值）
      const canReplan =
        useHomeStore.getState().mainCapabilities.counterfactualPlanner;
      if (!canReplan) {
        pushEvent(
          state,
          'task_step_failed',
          '消融：反事实重规划已关闭，MAIN 无法绕行（等同 Non-AI）',
          'critical',
          state.currentTask?.id,
        );
        return;
      }
      // ~1.5s 后开始重规划
      state.obstaclePhase = 'replanning';
      state.obstaclePhaseTicks = 0;
      state.navStatus = 'replanning';
      state.metrics.replanCount += 1;
      // 挑战1：路径改绕行
      const remaining = state.plannedPath.slice(state.pathIndex);
      const base =
        remaining.length > 0
          ? [cloneVec(state.robotPos), ...remaining]
          : [cloneVec(state.robotPos), cloneVec(LIVING_ORIGIN)];
      setPlannedPath(state, detourPath(base, 1.25));
      pushEvent(
        state,
        'path_replanned',
        `检测到障碍，已生成绕行路径（依据：动态语义图 + 反事实代价对比，replan=#${state.metrics.replanCount}）`,
        'warning',
        state.currentTask?.id,
      );
    }
  } else if (state.obstaclePhase === 'replanning') {
    state.navStatus = 'replanning';
    if (t >= 16) {
      state.obstaclePhase = 'recovered';
      state.obstaclePhaseTicks = 0;
      state.navStatus = 'recovered';
      state.avoidSuccesses += 1;
      pushEvent(
        state,
        'stuck_recovered',
        '脱困成功，恢复导航（决策依据：绕行路径代价低于原地重试）',
        'info',
        state.currentTask?.id,
      );
    }
  } else if (state.obstaclePhase === 'recovered') {
    state.navStatus = 'recovered';
    if (t >= 10) {
      // 挑战1：恢复后回到 navigating / idle
      state.obstaclePhase = 'none';
      state.obstaclePhaseTicks = 0;
      state.navStatus =
        state.plannedPath.length > 0 ? 'navigating' : 'idle';
      pushEvent(state, 'mode_switch', '导航模式恢复为正常巡航', 'info');
    }
  }
}

// ---------------------------------------------------------------------------
// 任务闭环
// ---------------------------------------------------------------------------

function findPersonByName(
  map: SemanticMap,
  name: string,
): PersonNode | undefined {
  return map.persons.find((p) => p.name === name);
}

function findObjectByName(
  map: SemanticMap,
  name: string,
): ObjectNode | undefined {
  return map.objects.find((o) => o.name === name);
}

function buildFindTask(
  type: 'find_person' | 'find_object',
  targetName: string,
  targetId: string | undefined,
  highProbRoom: RoomId,
): HomeTask {
  const now = Date.now();
  const roomLabel = ROOM_NAMES[highProbRoom];
  const steps: TaskStep[] = [
    {
      id: nextId('step'),
      name: `前往${roomLabel}`,
      status: 'pending',
    },
    {
      id: nextId('step'),
      name: type === 'find_person' ? `搜索${targetName}` : `搜索${targetName}区域`,
      status: 'pending',
    },
    {
      id: nextId('step'),
      name: '确认目标',
      status: 'pending',
    },
  ];
  return {
    id: nextId('task'),
    type,
    targetName,
    targetId,
    status: 'planning',
    steps,
    createdAt: now,
    updatedAt: now,
    replanCount: 0,
  };
}

function startFindTask(
  state: SimInternal,
  type: 'find_person' | 'find_object',
  name: string,
): void {
  const person = type === 'find_person' ? findPersonByName(state.semanticMap, name) : undefined;
  const object = type === 'find_object' ? findObjectByName(state.semanticMap, name) : undefined;

  if (type === 'find_person' && !person) {
    pushEvent(
      state,
      'task_failed',
      `未知人员「${name}」，无法创建任务`,
      'critical',
    );
    return;
  }
  if (type === 'find_object' && !object) {
    pushEvent(
      state,
      'task_failed',
      `未知物体「${name}」，无法创建任务`,
      'critical',
    );
    return;
  }

  // 挑战2：高概率房间来自语义地图（可能过时）
  const highProbRoom: RoomId =
    type === 'find_person'
      ? (person?.roomId ?? 'living_room')
      : (object?.roomId ?? 'living_room');
  const targetId = type === 'find_person' ? person?.id : object?.id;
  const finalPos =
    type === 'find_person'
      ? (person?.position ?? state.semanticMap.rooms.find((r) => r.id === highProbRoom)?.center)
      : object?.position;

  const task = buildFindTask(type, name, targetId, highProbRoom);
  state.currentTask = task;
  state.tasksTotal += 1;
  state.taskPhase = 'planning';
  state.taskPhaseTicks = 0;
  state.didTargetLost = false;
  state.searchStartedAt = null;
  state.isTargetOccluded = false;
  state.counterfactualInsightEmitted = false;

  pushEvent(
    state,
    'mode_switch',
    type === 'find_person'
      ? `开始寻人任务：${name}`
      : `开始寻物任务：${name}`,
    'info',
    task.id,
  );

  // 规划路径：当前房间 → 高概率房间 → 目标点
  const rooms = roomPath(state.roomId, highProbRoom);
  const path = waypointsForRooms(
    state.semanticMap.rooms,
    state.robotPos,
    rooms,
    finalPos,
  );
  setPlannedPath(state, path);
}

function tickTask(state: SimInternal): void {
  const task = state.currentTask;
  if (!task || !state.taskPhase) return;
  if (
    state.taskPhase === 'done_success' ||
    state.taskPhase === 'done_failed'
  ) {
    return;
  }

  state.taskPhaseTicks += 1;
  const stepGoto = task.steps[0];
  const stepSearch = task.steps[1];
  const stepVerify = task.steps[2];

  // ---- planning ----
  if (state.taskPhase === 'planning') {
    // 挑战3：规划拆步
    task.status = 'planning';
    if (state.taskPhaseTicks >= 8) {
      updateStep(task, stepGoto.id, {
        status: 'running',
        startedAt: Date.now(),
      });
      task.status = 'navigating';
      state.taskPhase = 'navigating_to_room';
      state.taskPhaseTicks = 0;
      if (state.navStatus === 'idle') {
        state.navStatus = 'navigating';
      }
    }
    return;
  }

  // ---- navigating ----
  if (state.taskPhase === 'navigating_to_room') {
    task.status = 'navigating';
    const arrived = advanceAlongPath(state);
    // 障碍生命周期单独处理，这里若卡住则等待
    if (!arrived) return;

    updateStep(task, stepGoto.id, {
      status: 'success',
      finishedAt: Date.now(),
    });
    updateStep(task, stepSearch.id, {
      status: 'running',
      startedAt: Date.now(),
    });
    task.status = 'searching';
    state.taskPhase = 'searching';
    state.taskPhaseTicks = 0;
    state.searchStartedAt = Date.now();
    pushEvent(
      state,
      'search_started',
      `抵达目标区域，开始搜索「${task.targetName}」`,
      'info',
      task.id,
    );
    return;
  }

  // ---- searching（可模拟一次 target_lost）----
  if (state.taskPhase === 'searching') {
    task.status = 'searching';
    // 挑战3 / 挑战4：约 1.2s 后模拟目标丢失（遮挡/移动）
    if (!state.didTargetLost && state.taskPhaseTicks >= 24) {
      state.didTargetLost = true;
      state.isTargetOccluded = true;
      state.taskPhase = 'target_lost';
      state.taskPhaseTicks = 0;
      updateStep(task, stepSearch.id, {
        status: 'failed',
        finishedAt: Date.now(),
        note: '目标短暂丢失',
      });
      pushEvent(
        state,
        'target_lost',
        `「${task.targetName}」被遮挡或离开视野`,
        'warning',
        task.id,
      );
      pushEvent(
        state,
        'task_step_failed',
        '搜索步骤失败，准备重规划',
        'warning',
        task.id,
      );
      return;
    }

    // 若已经经历过丢失并回到 searching，则继续到 verifying
    if (state.didTargetLost && state.taskPhaseTicks >= 20) {
      updateStep(task, stepSearch.id, {
        status: 'success',
        finishedAt: Date.now(),
        note: '重新锁定目标',
      });
      updateStep(task, stepVerify.id, {
        status: 'running',
        startedAt: Date.now(),
      });
      task.status = 'verifying';
      state.taskPhase = 'verifying';
      state.taskPhaseTicks = 0;
      state.isTargetOccluded = false;
      return;
    }

    // 首次搜索且未触发丢失的快速路径（一般不会走到这里）
    if (state.taskPhaseTicks >= 40) {
      updateStep(task, stepSearch.id, {
        status: 'success',
        finishedAt: Date.now(),
      });
      updateStep(task, stepVerify.id, {
        status: 'running',
        startedAt: Date.now(),
      });
      task.status = 'verifying';
      state.taskPhase = 'verifying';
      state.taskPhaseTicks = 0;
    }
    return;
  }

  // ---- target_lost → replanning ----
  if (state.taskPhase === 'target_lost') {
    // 挑战3：丢失后重规划（可消融）
    if (state.taskPhaseTicks >= 10) {
      const caps = useHomeStore.getState().mainCapabilities;
      if (!caps.counterfactualPlanner) {
        task.status = 'failed';
        task.failReason = '消融：反事实重规划已关闭，无法从目标丢失恢复';
        task.updatedAt = Date.now();
        state.taskPhase = 'done_failed';
        pushEvent(
          state,
          'task_failed',
          task.failReason,
          'critical',
          task.id,
        );
        return;
      }
      task.status = 'replanning';
      task.replanCount += 1;
      state.metrics.replanCount += 1;
      state.taskPhase = 'replanning';
      state.taskPhaseTicks = 0;
      pushEvent(
        state,
        'task_replanned',
        `任务重规划（第 ${task.replanCount} 次）· 依据：语义置信度衰减 + 相邻房间假设更新`,
        'warning',
        task.id,
      );

      // 挑战2：更新语义位置 — 可被「动态语义地图」消融关闭
      const useDynamicMap =
        useHomeStore.getState().mainCapabilities.dynamicSemanticMap;
      if (task.type === 'find_person' && task.targetId) {
        const idx = state.semanticMap.persons.findIndex(
          (p) => p.id === task.targetId,
        );
        if (idx >= 0) {
          const p = state.semanticMap.persons[idx];
          if (useDynamicMap) {
            const altRoom: RoomId =
              p.roomId === 'bedroom' ? 'living_room' : 'bedroom';
            const room = state.semanticMap.rooms.find((r) => r.id === altRoom);
            const newPos = room
              ? vec(room.center.x + 0.4, 0, room.center.z - 0.2)
              : cloneVec(LIVING_ORIGIN);
            state.semanticMap.persons[idx] = {
              ...p,
              roomId: altRoom,
              position: newPos,
              lastSeenAt: Date.now(),
              confidence: 0.55,
            };
            const via = roomPath(state.roomId, altRoom);
            setPlannedPath(
              state,
              waypointsForRooms(
                state.semanticMap.rooms,
                state.robotPos,
                via,
                newPos,
              ),
            );
          } else {
            const room = state.semanticMap.rooms.find(
              (r) => r.id === (p.roomId ?? state.roomId),
            );
            setPlannedPath(
              state,
              [
                cloneVec(state.robotPos),
                cloneVec(room?.center ?? LIVING_ORIGIN),
              ],
            );
          }
        }
      } else if (task.type === 'find_object' && task.targetId) {
        const idx = state.semanticMap.objects.findIndex(
          (o) => o.id === task.targetId,
        );
        if (idx >= 0) {
          const o = state.semanticMap.objects[idx];
          if (useDynamicMap) {
            const newPos = softClampPosition(
              vec(o.position.x + 0.6, o.position.y, o.position.z - 0.3),
            );
            state.semanticMap.objects[idx] = {
              ...o,
              position: newPos,
              lastSeenAt: Date.now(),
              confidence: 0.6,
            };
            setPlannedPath(
              state,
              detourPath([cloneVec(state.robotPos), newPos], 0.8),
            );
          } else {
            setPlannedPath(state, [
              cloneVec(state.robotPos),
              cloneVec(o.position),
            ]);
          }
        }
      }
    }
    return;
  }

  // ---- replanning：前往新假设位置再搜索 ----
  if (state.taskPhase === 'replanning') {
    task.status = 'replanning';
    const arrived = advanceAlongPath(state);
    if (!arrived) return;

    // 重新打开搜索步骤
    updateStep(task, stepSearch.id, {
      status: 'running',
      startedAt: Date.now(),
      note: '重规划后再次搜索',
    });
    task.status = 'searching';
    state.taskPhase = 'searching';
    state.taskPhaseTicks = 0;
    pushEvent(
      state,
      'search_started',
      `按新假设位置重新搜索「${task.targetName}」`,
      'info',
      task.id,
    );
    return;
  }

  // ---- verifying → success / failed ----
  if (state.taskPhase === 'verifying') {
    task.status = 'verifying';
    if (state.taskPhaseTicks >= 16) {
      // 简单规则：障碍仍在且定位过低时失败，否则成功
      const fail =
        state.isObstacleInjected &&
        state.metrics.localizationStability < 50;

      if (fail) {
        updateStep(task, stepVerify.id, {
          status: 'failed',
          finishedAt: Date.now(),
          note: '确认失败',
        });
        task.status = 'failed';
        task.failReason = '环境干扰过强，无法确认目标';
        task.updatedAt = Date.now();
        state.taskPhase = 'done_failed';
        pushEvent(
          state,
          'task_failed',
          `任务失败：${task.failReason}`,
          'critical',
          task.id,
        );
      } else {
        updateStep(task, stepVerify.id, {
          status: 'success',
          finishedAt: Date.now(),
        });
        task.status = 'success';
        task.updatedAt = Date.now();
        state.tasksSuccess += 1;
        state.taskPhase = 'done_success';
        state.isTargetOccluded = false;

        // 提升目标置信度
        if (task.type === 'find_person' && task.targetId) {
          state.semanticMap.persons = state.semanticMap.persons.map((p) =>
            p.id === task.targetId
              ? {
                  ...p,
                  confidence: 0.97,
                  lastSeenAt: Date.now(),
                  roomId: state.roomId,
                  position: cloneVec(state.robotPos),
                }
              : p,
          );
        } else if (task.type === 'find_object' && task.targetId) {
          state.semanticMap.objects = state.semanticMap.objects.map((o) =>
            o.id === task.targetId
              ? { ...o, confidence: 0.96, lastSeenAt: Date.now() }
              : o,
          );
        }

        pushEvent(
          state,
          'target_found',
          `已确认找到「${task.targetName}」`,
          'info',
          task.id,
        );
        pushEvent(
          state,
          'task_success',
          `任务完成：${task.targetName}`,
          'info',
          task.id,
        );
      }

      if (state.searchStartedAt !== null) {
        const sec = (Date.now() - state.searchStartedAt) / 1000;
        state.searchDurations = [...state.searchDurations, sec].slice(-20);
      }

      state.navStatus = 'idle';
      state.plannedPath = [];
      state.pathIndex = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// 影子基线步进
// ---------------------------------------------------------------------------

function setShadowPlannedPath(shadow: ShadowSim, path: Vec3[]): void {
  const cleaned =
    path.length > 0 && dist2d(path[0], shadow.robotPos) < WAYPOINT_EPS
      ? path.slice(1)
      : path;
  shadow.plannedPath = cleaned.map(cloneVec);
  shadow.pathIndex = 0;
  if (shadow.plannedPath.length > 0) {
    shadow.navStatus = 'navigating';
    shadow.navigatingToTarget = true;
    if (shadow.taskOutcome === 'idle') {
      shadow.taskOutcome = 'running';
    }
  }
}

function advanceShadowAlongPath(
  shadow: ShadowSim,
  rooms: RoomNode[],
): boolean {
  if (shadow.plannedPath.length === 0) return true;
  if (shadow.pathIndex >= shadow.plannedPath.length) return true;

  if (
    shadow.navStatus === 'stuck' ||
    shadow.obstaclePhase === 'stalled' ||
    shadow.obstaclePhase === 'stuck'
  ) {
    return false;
  }

  const target = shadow.plannedPath[shadow.pathIndex];
  const d = dist2d(shadow.robotPos, target);

  if (d <= WAYPOINT_EPS) {
    shadow.pathIndex += 1;
    if (shadow.pathIndex >= shadow.plannedPath.length) {
      shadow.plannedPath = [];
      shadow.pathIndex = 0;
      return true;
    }
    return false;
  }

  const step = Math.min(SPEED_PER_TICK * 0.95, d);
  const t = step / d;
  const next = softClampPosition(
    vec(
      lerp(shadow.robotPos.x, target.x, t),
      0,
      lerp(shadow.robotPos.z, target.z, t),
    ),
  );

  const moved = dist2d(shadow.robotPos, next);
  shadow.pathCostMeters += moved;
  shadow.robotYaw = yawToward(shadow.robotPos, next);
  shadow.robotPos = next;
  shadow.roomId = resolveRoomId(shadow.robotPos, rooms);
  shadow.pathHistory = [
    ...shadow.pathHistory,
    cloneVec(shadow.robotPos),
  ].slice(-PATH_HISTORY_MAX);

  return false;
}

/** 影子遇障：顶障 / 原地打转，plannedPath 不变，replanCount 恒为 0 */
function bumpShadowAgainstObstacle(shadow: ShadowSim, rooms: RoomNode[]): void {
  shadow.stallSpinTicks += 1;
  const angle = shadow.stallSpinTicks * 0.35;
  const amp = 0.04 + (shadow.stallSpinTicks % 5) * 0.008;
  const prev = cloneVec(shadow.robotPos);
  const next = softClampPosition(
    vec(
      shadow.robotPos.x + Math.cos(angle) * amp,
      0,
      shadow.robotPos.z + Math.sin(angle) * amp,
    ),
  );
  shadow.pathCostMeters += dist2d(prev, next) + 0.02; // 无效重试代价膨胀
  shadow.robotYaw = angle;
  shadow.robotPos = next;
  shadow.roomId = resolveRoomId(shadow.robotPos, rooms);
  shadow.pathHistory = [
    ...shadow.pathHistory,
    cloneVec(shadow.robotPos),
  ].slice(-PATH_HISTORY_MAX);
  // 故意不改 plannedPath / replanCount — 死板无效循环
}

function applyShadowCommand(
  shadow: ShadowSim,
  main: SimInternal,
  cmd: PendingCommand,
): void {
  if (cmd === null) return;

  if (cmd.type === 'inject_obstacle') {
    if (shadow.obstaclePhase !== 'none' && shadow.obstaclePhase !== 'stalled') {
      return;
    }
    // 与主端同步收到扰动；基线无法真正绕行 → 最终必失败
    shadow.challengeTriggered = true;
    shadow.failReason = '静态栅格遇障无法重规划';
    shadow.obstaclePhase = 'avoiding';
    shadow.obstaclePhaseTicks = 0;
    shadow.navStatus = 'avoiding';
    if (shadow.taskOutcome === 'idle' || shadow.taskOutcome === 'success') {
      shadow.taskOutcome = 'running';
    }
    return;
  }

  if (cmd.type === 'clear_obstacle') {
    if (shadow.obstaclePhase === 'stalled') {
      // 清除后仍保持 stalled 语义至复位：基线地图未更新，继续卡在无效路径
      shadow.navStatus = 'stuck';
      return;
    }
    shadow.obstaclePhase = 'none';
    shadow.obstaclePhaseTicks = 0;
    shadow.navStatus =
      shadow.plannedPath.length > 0 ? 'navigating' : 'idle';
    return;
  }

  if (cmd.type === 'find_person' || cmd.type === 'find_object') {
    const type = cmd.type === 'find_person' ? 'find_person' : 'find_object';
    const person =
      type === 'find_person'
        ? findPersonByName(main.semanticMap, cmd.name)
        : undefined;
    const object =
      type === 'find_object'
        ? findObjectByName(main.semanticMap, cmd.name)
        : undefined;
    const highProbRoom: RoomId =
      type === 'find_person'
        ? (person?.roomId ?? 'living_room')
        : (object?.roomId ?? 'living_room');
    const finalPos =
      type === 'find_person'
        ? (person?.position ??
          main.semanticMap.rooms.find((r) => r.id === highProbRoom)?.center)
        : object?.position;

    const rooms = roomPath(shadow.roomId, highProbRoom);
    const path = waypointsForRooms(
      main.semanticMap.rooms,
      shadow.robotPos,
      rooms,
      finalPos,
    );
    // 新任务：若当前无障碍注入，允许重新开跑；否则保持挑战失败路径
    if (!main.isObstacleInjected) {
      shadow.obstaclePhase = 'none';
      shadow.obstaclePhaseTicks = 0;
      shadow.challengeTriggered = false;
      shadow.failReason = null;
    }
    shadow.taskOutcome = 'running';
    shadow.navigatingToTarget = true;
    // 静态 A* 启发：仅房间中心拓扑，不感知动态障碍
    setShadowPlannedPath(shadow, path);
    return;
  }

  if (cmd.type === 'reset') {
    const fresh = createFreshShadow(main.environmentSeed);
    Object.assign(shadow, fresh);
    return;
  }
}

function stepShadowAgent(shadow: ShadowSim, main: SimInternal): void {
  const rooms = main.semanticMap.rooms;

  // 主端目标丢失 → SHADOW 无语义重规划，强制 FAILED/STUCK（红）
  if (
    main.didTargetLost &&
    !shadow.challengeTriggered &&
    (shadow.taskOutcome === 'running' ||
      shadow.navigatingToTarget ||
      shadow.plannedPath.length > 0)
  ) {
    forceShadowChallengeFail(
      shadow,
      '目标丢失后无语义时效更新，陷入无效搜索',
      'failed',
    );
  }

  // 已进入挑战失败态：代价继续微涨，冻结成功路径
  if (
    shadow.obstaclePhase === 'stalled' ||
    shadow.taskOutcome === 'stalled' ||
    shadow.taskOutcome === 'failed'
  ) {
    bumpShadowAgainstObstacle(shadow, rooms);
    shadow.navStatus = 'stuck';
    if (shadow.taskOutcome !== 'failed') {
      shadow.taskOutcome = 'stalled';
    }
    return;
  }

  // 障碍生命周期：avoiding → stuck → stalled（永不重规划）
  if (shadow.obstaclePhase === 'avoiding') {
    shadow.obstaclePhaseTicks += 1;
    shadow.navStatus = 'avoiding';
    // 仍沿原路径硬闯一小段，代价上涨
    if (shadow.plannedPath.length > 0) {
      advanceShadowAlongPath(shadow, rooms);
    }
    if (shadow.obstaclePhaseTicks >= 18) {
      shadow.obstaclePhase = 'stuck';
      shadow.obstaclePhaseTicks = 0;
      shadow.navStatus = 'stuck';
    }
    return;
  }

  if (shadow.obstaclePhase === 'stuck') {
    shadow.obstaclePhaseTicks += 1;
    shadow.navStatus = 'stuck';
    bumpShadowAgainstObstacle(shadow, rooms);
    if (shadow.obstaclePhaseTicks >= 24) {
      forceShadowChallengeFail(
        shadow,
        shadow.failReason ?? '静态栅格遇障无法重规划',
        'stalled',
      );
    }
    return;
  }

  // 无障碍且未触发挑战终态：沿静态路径前进
  if (shadow.plannedPath.length > 0) {
    shadow.navStatus = 'navigating';
    const arrived = advanceShadowAlongPath(shadow, rooms);
    if (arrived) {
      shadow.navStatus = 'idle';
      if (shadow.navigatingToTarget) {
        shadow.navigatingToTarget = false;
        // 挑战已触发则禁止 success（反叙事防护）
        if (
          shadow.challengeTriggered ||
          main.didTargetLost ||
          main.isObstacleInjected
        ) {
          forceShadowChallengeFail(
            shadow,
            shadow.failReason ?? '挑战下无反事实重规划，任务失败',
            'failed',
          );
        } else {
          // 仅在无挑战、安静路径完成时允许 success（极少见演示路径）
          shadow.taskOutcome = 'success';
        }
      }
    }
    return;
  }

  // 无路径：收尾 running → success / failed
  if (!shadow.navigatingToTarget && shadow.taskOutcome === 'running') {
    if (shadow.challengeTriggered || main.didTargetLost) {
      forceShadowChallengeFail(
        shadow,
        shadow.failReason ?? '无语义重规划导致失败',
        'failed',
      );
    } else {
      shadow.taskOutcome = 'success';
      shadow.navStatus = 'idle';
    }
    return;
  }

  if (shadow.taskOutcome === 'idle' || shadow.taskOutcome === 'success') {
    shadow.navStatus = 'idle';
  }
}

function maybeEmitCounterfactualInsight(twin: TwinSim): void {
  const { main, shadow } = twin;
  if (main.counterfactualInsightEmitted) return;

  const shadowFailed =
    shadow.taskOutcome === 'stalled' || shadow.taskOutcome === 'failed';
  if (!shadowFailed) return;

  const mainOutcome = deriveMainTaskOutcome(main);
  const mainReplanned =
    main.metrics.replanCount > 0 ||
    (main.currentTask?.replanCount ?? 0) > 0;
  const mainSuccess = mainOutcome === 'success';
  const mainRecovered =
    main.obstaclePhase === 'recovered' ||
    (main.obstaclePhase === 'none' &&
      main.metrics.replanCount > 0 &&
      mainOutcome === 'running');

  // 进行中不宣布胜负：须 shadow 已失败，且 main 已 replan 或 success
  if (!mainReplanned && !mainSuccess && !mainRecovered) return;
  // 若 main 仍在 running 且尚未 replan，再等一等
  if (mainOutcome === 'running' && !mainReplanned) return;

  main.counterfactualInsightEmitted = true;
  const lines = buildInsightLines({
    mainOutcome: deriveMainTaskOutcome(main),
    shadowOutcome: shadow.taskOutcome,
    mainCost: main.pathCostMeters,
    shadowCost: shadow.pathCostMeters,
    mainReplan: main.metrics.replanCount,
    shadowRoomId: shadow.roomId,
    didTargetLost: main.didTargetLost,
    isObstacleInjected: main.isObstacleInjected,
    taskRunning: false,
  });

  pushEvent(
    main,
    'counterfactual_insight',
    lines.oneLiner,
    'warning',
    main.currentTask?.id,
  );
}

// ---------------------------------------------------------------------------
// 指令处理
// ---------------------------------------------------------------------------

function applyCommand(state: SimInternal, cmd: PendingCommand): void {
  if (cmd === null) return;

  if (cmd.type === 'inject_obstacle') {
    if (state.isObstacleInjected) return;
    state.isObstacleInjected = true;
    state.avoidAttempts += 1;
    state.obstaclePhase = 'avoiding';
    state.obstaclePhaseTicks = 0;
    state.navStatus = 'avoiding';
    state.counterfactualInsightEmitted = false;
    // 挑战1 / 挑战4：注入障碍打断导航
    pushEvent(
      state,
      'obstacle_detected',
      '用户注入临时障碍物',
      'warning',
      state.currentTask?.id,
    );
    pushEvent(state, 'mode_switch', '导航进入避障模式', 'info');
    return;
  }

  if (cmd.type === 'clear_obstacle') {
    state.isObstacleInjected = false;
    state.metrics.activeObstacles = 0;
    if (state.obstaclePhase !== 'none') {
      state.obstaclePhase = 'recovered';
      state.obstaclePhaseTicks = 0;
      state.navStatus = 'recovered';
      state.avoidSuccesses += 1;
      pushEvent(
        state,
        'stuck_recovered',
        '障碍已清除，准备恢复导航',
        'info',
      );
    } else {
      state.navStatus =
        state.plannedPath.length > 0 ? 'navigating' : 'idle';
    }
    return;
  }

  if (cmd.type === 'find_person') {
    startFindTask(state, 'find_person', cmd.name);
    return;
  }

  if (cmd.type === 'find_object') {
    startFindTask(state, 'find_object', cmd.name);
    return;
  }

  if (cmd.type === 'reset') {
    // reset：事件清空（便于演示重放）；语义与机器人回初始态
    const now = Date.now();
    const seed = state.environmentSeed;
    const fresh = createFreshInternal(now, seed);
    Object.assign(state, fresh);
    pushEvent(state, 'mode_switch', '系统已复位：机器人回到客厅原点', 'info');
    return;
  }

  if (cmd.type === 'demo_complete') {
    pushEvent(state, 'demo_complete', '演示完成', 'info');
  }
}

// ---------------------------------------------------------------------------
// 单帧 tick（主端）
// ---------------------------------------------------------------------------

function stepMainAgent(state: SimInternal, cmd: PendingCommand): void {
  applyCommand(state, cmd);

  // 障碍状态机（挑战1 / 挑战4）
  handleObstacleLifecycle(state);

  // 无任务时：若有路径则前进，否则 idle 巡航保持
  if (!state.currentTask || !state.taskPhase) {
    if (state.plannedPath.length > 0) {
      const arrived = advanceAlongPath(state);
      if (arrived && state.obstaclePhase === 'none') {
        state.navStatus = 'idle';
      }
    } else if (state.obstaclePhase === 'none') {
      state.navStatus = 'idle';
    }
  } else {
    // 有任务时：任务状态机内部会调用 advanceAlongPath
    // 若正处于障碍 stuck/replanning，任务推进会自然等待
    tickTask(state);
  }

  // 语义置信度缓慢衰减（可被消融开关关闭）
  const caps = useHomeStore.getState().mainCapabilities;
  if (caps.confidenceDecay) {
    const now = Date.now();
    state.semanticMap.objects = state.semanticMap.objects.map((o) => ({
      ...o,
      confidence: clamp(
        o.confidence - (now - o.lastSeenAt > 8000 ? 0.0004 : 0.00005),
        0.2,
        1,
      ),
    }));
    state.semanticMap.persons = state.semanticMap.persons.map((p) => ({
      ...p,
      confidence: clamp(
        p.confidence - (now - p.lastSeenAt > 8000 ? 0.0004 : 0.00005),
        0.2,
        1,
      ),
    }));
  }

  recomputeMetrics(state);
}

function tickTwin(
  twin: TwinSim,
  cmd: PendingCommand,
  ablationEnabled: boolean,
): void {
  stepMainAgent(twin.main, cmd);

  if (ablationEnabled) {
    applyShadowCommand(twin.shadow, twin.main, cmd);
    stepShadowAgent(twin.shadow, twin.main);
    maybeEmitCounterfactualInsight(twin);
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type UseHomeSimulationResult = {
  snapshot: HomeSnapshot | null;
  isRunning: boolean;
  setRunning: (v: boolean) => void;
  injectObstacle: () => void;
  clearObstacle: () => void;
  startFindPerson: (name: string) => void;
  startFindObject: (name: string) => void;
  resetAll: () => void;
};

export function useHomeSimulation(): UseHomeSimulationResult {
  const snapshot = useHomeStore((s) => s.snapshot);
  const isRunning = useHomeStore((s) => s.isRunning);
  const setRunning = useHomeStore((s) => s.setRunning);
  const setSnapshot = useHomeStore((s) => s.setSnapshot);
  const setShadowSnapshot = useHomeStore((s) => s.setShadowSnapshot);
  const injectObstacle = useHomeStore((s) => s.injectObstacle);
  const clearObstacle = useHomeStore((s) => s.clearObstacle);
  const startFindPerson = useHomeStore((s) => s.startFindPerson);
  const startFindObject = useHomeStore((s) => s.startFindObject);
  const resetAll = useHomeStore((s) => s.resetAll);
  const consumePendingCommand = useHomeStore((s) => s.consumePendingCommand);

  const simRef = useRef<TwinSim | null>(null);

  // 初始化内部状态 + 首帧快照
  useEffect(() => {
    if (!simRef.current) {
      const now = Date.now();
      const seed = useHomeStore.getState().environmentSeed;
      simRef.current = createFreshTwin(now, seed);
      pushEvent(
        simRef.current.main,
        'mode_switch',
        '反事实双生仿真已启动（主端语义策略）',
        'info',
      );
      setSnapshot(toSnapshot(simRef.current.main));
      const ablationOn = useHomeStore.getState().ablationEnabled;
      setShadowSnapshot(
        ablationOn ? toShadowSnapshot(simRef.current.shadow) : null,
      );
    }
  }, [setSnapshot, setShadowSnapshot]);

  // 50ms 仿真循环（单一 timer，推进两个 agent）
  useEffect(() => {
    if (!isRunning) return;

    const timer = window.setInterval(() => {
      const twin = simRef.current;
      if (!twin) return;
      const cmd = consumePendingCommand();
      const ablationEnabled = useHomeStore.getState().ablationEnabled;

      // reset 时同步重建影子
      if (cmd?.type === 'reset') {
        const now = Date.now();
        const seed = twin.main.environmentSeed;
        const fresh = createFreshTwin(now, seed);
        pushEvent(
          fresh.main,
          'mode_switch',
          '系统已复位：主/影机器人均回客厅原点',
          'info',
        );
        simRef.current = fresh;
        setSnapshot(toSnapshot(fresh.main));
        setShadowSnapshot(
          ablationEnabled ? toShadowSnapshot(fresh.shadow) : null,
        );
        return;
      }

      tickTwin(twin, cmd, ablationEnabled);
      setSnapshot(toSnapshot(twin.main));
      setShadowSnapshot(
        ablationEnabled ? toShadowSnapshot(twin.shadow) : null,
      );
      if (ablationEnabled) {
        useHomeStore
          .getState()
          .appendCostSample(
            twin.main.pathCostMeters,
            twin.shadow.pathCostMeters,
          );
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    isRunning,
    consumePendingCommand,
    setSnapshot,
    setShadowSnapshot,
  ]);

  return {
    snapshot,
    isRunning,
    setRunning,
    injectObstacle,
    clearObstacle,
    startFindPerson,
    startFindObject,
    resetAll,
  };
}
