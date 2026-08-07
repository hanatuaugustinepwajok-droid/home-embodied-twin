/**
 * HomeEmbodied Twin — 领域类型定义
 * 职责：语义地图、机器人位姿、导航/任务状态机、事件与指标等核心类型。
 * 不包含任何 UI / 渲染逻辑。
 */

import type { AgentTaskOutcome } from './counterfactual';

/** 三维坐标（单位：米，Y 轴向上） */
export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

/** 房间标识 */
export type RoomId = 'living_room' | 'bedroom' | 'kitchen' | 'corridor';

/** 房间节点（建图语义） */
export type RoomNode = {
  id: RoomId;
  /** 中文名，如「客厅」 */
  name: string;
  center: Vec3;
  bounds: { min: Vec3; max: Vec3 };
};

/** 物体节点（可移动物体带 movable） */
export type ObjectNode = {
  id: string;
  /** 如「遥控器」「水杯」 */
  name: string;
  roomId: RoomId;
  position: Vec3;
  /** 最近观测时间戳（ms） */
  lastSeenAt: number;
  /** 置信度 0~1 */
  confidence: number;
  movable: boolean;
};

/** 人员节点 */
export type PersonNode = {
  id: string;
  /** 如「爸爸」「妈妈」 */
  name: string;
  roomId: RoomId | null;
  position: Vec3 | null;
  lastSeenAt: number;
  /** 置信度 0~1 */
  confidence: number;
  faceId?: string;
  reId?: string;
};

/** 家庭语义地图 */
export type SemanticMap = {
  rooms: RoomNode[];
  objects: ObjectNode[];
  persons: PersonNode[];
};

/** 机器人位姿 */
export type RobotPose = {
  position: Vec3;
  /** 偏航角，单位：弧度（绕 Y 轴，0 朝 +Z） */
  yaw: number;
  roomId: RoomId;
};

/** 导航状态机 */
export type NavStatus =
  | 'idle'
  | 'navigating'
  | 'avoiding'
  | 'stuck'
  | 'replanning'
  | 'recovered';

/** 任务类型 */
export type TaskType = 'find_person' | 'find_object' | 'goto_room';

/** 任务生命周期状态 */
export type TaskStatus =
  | 'idle'
  | 'planning'
  | 'navigating'
  | 'searching'
  | 'replanning'
  | 'verifying'
  | 'success'
  | 'failed';

/** 单步任务进度 */
export type TaskStep = {
  id: string;
  /** 如「前往客厅」「搜索茶几区域」 */
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: number;
  finishedAt?: number;
  note?: string;
};

/** 家庭任务（寻人/寻物/去房间） */
export type HomeTask = {
  id: string;
  type: TaskType;
  /** 「爸爸」或「遥控器」 */
  targetName: string;
  targetId?: string;
  status: TaskStatus;
  steps: TaskStep[];
  createdAt: number;
  updatedAt: number;
  failReason?: string;
  replanCount: number;
};

/** 数字孪生事件类型 */
export type TwinEventType =
  | 'obstacle_detected'
  | 'path_replanned'
  | 'stuck_recovered'
  | 'search_started'
  | 'target_lost'
  | 'target_found'
  | 'task_step_failed'
  | 'task_replanned'
  | 'task_success'
  | 'task_failed'
  | 'mode_switch'
  | 'demo_complete'
  | 'counterfactual_insight';

// 反事实双生类型再导出，便于单入口 import
export type {
  AgentCompareMetrics,
  AgentTaskOutcome,
  DisplayMode,
  MainAgentCapabilities,
  ShadowAgentCapabilities,
  ShadowSnapshot,
} from './counterfactual';

/** 时间轴事件 */
export type TwinEvent = {
  id: string;
  timestamp: number;
  type: TwinEventType;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  relatedTaskId?: string;
};

/** 运行指标面板 */
export type HomeMetrics = {
  /** 定位稳定度 0~100 */
  localizationStability: number;
  /** 避障成功率 0~100 */
  avoidSuccessRate: number;
  /** 寻人寻物成功率 0~100 */
  findSuccessRate: number;
  /** 平均搜索时长（秒） */
  avgSearchSeconds: number;
  /** 累计重规划次数 */
  replanCount: number;
  /** 任务完成率 0~100 */
  taskCompletionRate: number;
  /** 当前活跃障碍数 */
  activeObstacles: number;
};

/**
 * 仿真每一帧对外输出的完整快照（主机器人视角）。
 * 页面 / 3D / 图表均只消费此结构；影子侧见 ShadowSnapshot。
 */
export type HomeSnapshot = {
  timestamp: number;
  robot: RobotPose;
  navStatus: NavStatus;
  /** 真实轨迹，滑动窗口 */
  pathHistory: Vec3[];
  /** 当前规划路径点序列 */
  plannedPath: Vec3[];
  /** 累计移动代价（米） */
  pathCostMeters: number;
  /** 主端粗粒度任务结果（对比 HUD） */
  taskOutcome: AgentTaskOutcome;
  semanticMap: SemanticMap;
  currentTask: HomeTask | null;
  /** 最新在前，最多保留 40 条 */
  events: TwinEvent[];
  metrics: HomeMetrics;
  isObstacleInjected: boolean;
  isTargetOccluded: boolean;
  /** 同种子环境编号 */
  environmentSeed: number;
};

/** 用户通过 store 下发、由仿真 Hook 消费的待处理指令 */
export type PendingCommand =
  | null
  | { type: 'inject_obstacle' }
  | { type: 'clear_obstacle' }
  | { type: 'find_person'; name: string }
  | { type: 'find_object'; name: string }
  | { type: 'reset' }
  | { type: 'demo_complete' };
