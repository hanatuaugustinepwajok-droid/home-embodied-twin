/**
 * Counterfactual Shadow Twin — 反事实双生对比类型
 * 主机器人（语义重规划）vs 影子机器人（静态栅格基线）可对比状态。
 */

import type { NavStatus, RobotPose, Vec3 } from './home';

/** 画布展示模式 */
export type DisplayMode = 'SPLIT_SCREEN' | 'OVERLAY' | 'MAIN_ONLY';

/** 分 agent 任务结果（相对 HomeTask.status 更粗粒度，便于对比 HUD） */
export type AgentTaskOutcome =
  | 'idle'
  | 'running'
  | 'success'
  | 'stalled'
  | 'failed';

/** 主端能力标记：动态语义图 / 置信度衰减 / 反事实规划器 */
export type MainAgentCapabilities = {
  dynamicSemanticMap: boolean;
  confidenceDecay: boolean;
  counterfactualPlanner: boolean;
};

/** 影子端能力标记：静态占用栅格 + A* 启发 */
export type ShadowAgentCapabilities = {
  staticOccupancyGrid: boolean;
  aStarHeuristic: boolean;
};

/** 两侧可对比的导航/代价摘要 */
export type AgentCompareMetrics = {
  pose: RobotPose;
  navStatus: NavStatus;
  pathHistory: Vec3[];
  plannedPath: Vec3[];
  replanCount: number;
  pathCostMeters: number;
  taskOutcome: AgentTaskOutcome;
};

/**
 * 影子机器人对外快照。
 * 语义地图仍由 main 的 HomeSnapshot 承载；影子只暴露位姿/路径/代价。
 */
export type ShadowSnapshot = {
  timestamp: number;
  robot: RobotPose;
  navStatus: NavStatus;
  pathHistory: Vec3[];
  plannedPath: Vec3[];
  replanCount: number;
  pathCostMeters: number;
  taskOutcome: AgentTaskOutcome;
  /** 静态障碍占用点（简化栅格） */
  staticOccupancy: Vec3[];
};
