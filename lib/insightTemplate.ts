/**
 * 反事实 Insight 三行定稿模板（作品集/面试可背）
 */

import type { AgentTaskOutcome } from '@/types/counterfactual';
import type { RoomId } from '@/types/home';
import { ROOM_NAME_BY_ID } from '@/lib/roomFocus';

export type InsightLines = {
  /** 扰动 */
  perturbation: string;
  /** 反事实 */
  counterfactual: string;
  /** 收益 */
  gain: string;
  /** 合成单行（兼容事件流） */
  oneLiner: string;
  ready: boolean;
};

export type InsightInput = {
  mainOutcome: AgentTaskOutcome;
  shadowOutcome: AgentTaskOutcome;
  mainCost: number;
  shadowCost: number;
  mainReplan: number;
  shadowRoomId?: RoomId | string;
  didTargetLost: boolean;
  isObstacleInjected: boolean;
  taskRunning: boolean;
  /** 仿真已推送的事件文案（可选解析） */
  eventMessage?: string;
};

function roomLabel(id: string | undefined): string {
  if (id && id in ROOM_NAME_BY_ID) {
    return ROOM_NAME_BY_ID[id as RoomId];
  }
  return '目标区域';
}

export function buildInsightLines(input: InsightInput): InsightLines {
  const {
    mainOutcome,
    shadowOutcome,
    mainCost,
    shadowCost,
    mainReplan,
    shadowRoomId,
    didTargetLost,
    isObstacleInjected,
    taskRunning,
  } = input;

  const shadowFailed =
    shadowOutcome === 'stalled' || shadowOutcome === 'failed';
  const mainProven =
    shadowFailed &&
    (mainOutcome === 'success' || mainReplan > 0 || mainOutcome === 'running');

  if (!mainProven || (!shadowFailed && taskRunning)) {
    if (taskRunning || mainOutcome === 'running' || shadowOutcome === 'running') {
      return {
        perturbation: '扰动：对比进行中…',
        counterfactual: '反事实：等待 SHADOW 失败点与 MAIN 重规划',
        gain: '收益：—（结束后结算）',
        oneLiner: '对比进行中…等待 SHADOW 失败点与 MAIN 重规划/成功后再归因',
        ready: false,
      };
    }
    return {
      perturbation: '扰动：尚未触发挑战',
      counterfactual: '反事实：触发障碍/遮挡后生成',
      gain: '收益：—',
      oneLiner: '触发障碍或寻人/寻物挑战后，此处自动生成反事实归因结论',
      ready: false,
    };
  }

  const perturbation = didTargetLost
    ? '扰动：目标遮挡 / 丢失'
    : isObstacleInjected || shadowFailed
      ? '扰动：动态障碍 / 通路阻挡'
      : '扰动：场景挑战';

  const room = roomLabel(shadowRoomId);
  const reason = didTargetLost
    ? '遮挡且无语义时效'
    : '静态地图遇障无法重规划';

  const counterfactual = `反事实：若关闭语义重规划 → STALLED @ ${room}（${reason}）`;

  const waste = Math.max(0, shadowCost - mainCost);
  const gain = `收益：少走 ${waste.toFixed(1)} m · 成功率 0%→${
    mainOutcome === 'success' ? '100%' : '恢复中'
  } · replan ${mainReplan}`;

  const oneLiner = `${perturbation}；${counterfactual}；${gain}（MAIN ${mainCost.toFixed(1)}m / SHADOW ${shadowCost.toFixed(1)}m）`;

  return {
    perturbation,
    counterfactual,
    gain,
    oneLiner,
    ready: true,
  };
}

/** 导出本局结论纯文本 */
export function formatRunReport(args: {
  seed: number;
  insight: InsightLines;
  mainCost: number;
  shadowCost: number;
  mainReplan: number;
  mainOutcome: string;
  shadowOutcome: string;
}): string {
  return [
    'Counterfactual Shadow Twin · AI Value Proven',
    `seed=${args.seed}`,
    args.insight.perturbation,
    args.insight.counterfactual,
    args.insight.gain,
    `MAIN: outcome=${args.mainOutcome} cost=${args.mainCost.toFixed(2)}m replan=${args.mainReplan}`,
    `SHADOW: outcome=${args.shadowOutcome} cost=${args.shadowCost.toFixed(2)}m replan=0`,
    'Boundary: Web Mock · not real robot · SHADOW fail is ablation-by-design',
  ].join('\n');
}
