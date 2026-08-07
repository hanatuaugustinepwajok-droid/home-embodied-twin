/**
 * Counterfactual Shadow Twin — 全局状态（zustand）
 * 职责：主/影子快照、展示模式、消融能力开关、seed、Insight 定格、代价序列。
 */

import { create } from 'zustand';
import type { InsightLines } from '@/lib/insightTemplate';
import type {
  DisplayMode,
  MainAgentCapabilities,
  ShadowAgentCapabilities,
  ShadowSnapshot,
} from '@/types/counterfactual';
import type { CostSample } from '@/types/costSeries';
import type { HomeSnapshot, PendingCommand, RoomId } from '@/types/home';

const DEFAULT_MAIN_CAPS: MainAgentCapabilities = {
  dynamicSemanticMap: true,
  confidenceDecay: true,
  counterfactualPlanner: true,
};

const DEFAULT_SHADOW_CAPS: ShadowAgentCapabilities = {
  staticOccupancyGrid: true,
  aStarHeuristic: true,
};

const COST_SERIES_MAX = 120;

type HomeStoreState = {
  snapshot: HomeSnapshot | null;
  shadowSnapshot: ShadowSnapshot | null;
  isRunning: boolean;
  pendingCommand: PendingCommand;

  environmentSeed: number;
  displayMode: DisplayMode;
  ablationEnabled: boolean;
  emphasizeNonAi: boolean;
  mainCapabilities: MainAgentCapabilities;
  shadowCapabilities: ShadowAgentCapabilities;

  focusRoomId: RoomId | null;
  focusedEventSummary: string | null;

  /** Insight 定格 / 关键帧 */
  insightFrozen: boolean;
  experimentLocked: boolean;
  pinnedInsight: InsightLines | null;
  costSeries: CostSample[];
  /** 结局闪色：none | proven | failed */
  verdictFlash: 'none' | 'proven' | 'shadow_fail';

  setSnapshot: (snapshot: HomeSnapshot) => void;
  setShadowSnapshot: (snapshot: ShadowSnapshot | null) => void;
  setRunning: (v: boolean) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setAblationEnabled: (v: boolean) => void;
  setFocusRoomId: (id: RoomId | null) => void;
  setFocusedEventSummary: (summary: string | null) => void;
  setMainCapability: (
    key: keyof MainAgentCapabilities,
    value: boolean,
  ) => void;
  setInsightFrozen: (v: boolean) => void;
  setExperimentLocked: (v: boolean) => void;
  setPinnedInsight: (lines: InsightLines | null) => void;
  setVerdictFlash: (v: 'none' | 'proven' | 'shadow_fail') => void;
  appendCostSample: (main: number, shadow: number) => void;
  clearCostSeries: () => void;
  toggleCounterfactualCompare: () => void;
  whatIfAiDisabled: () => void;
  /** 同 seed 再跑：复位但保留 seed */
  rerunSameSeed: () => void;
  injectObstacle: () => void;
  clearObstacle: () => void;
  startFindPerson: (name: string) => void;
  startFindObject: (name: string) => void;
  resetAll: () => void;
  completeDemo: () => void;
  consumePendingCommand: () => PendingCommand;
};

export const useHomeStore = create<HomeStoreState>((set, get) => ({
  snapshot: null,
  shadowSnapshot: null,
  isRunning: true,
  pendingCommand: null,

  environmentSeed: 42,
  displayMode: 'MAIN_ONLY',
  ablationEnabled: false,
  emphasizeNonAi: false,
  mainCapabilities: { ...DEFAULT_MAIN_CAPS },
  shadowCapabilities: { ...DEFAULT_SHADOW_CAPS },

  focusRoomId: null,
  focusedEventSummary: null,

  insightFrozen: false,
  experimentLocked: false,
  pinnedInsight: null,
  costSeries: [],
  verdictFlash: 'none',

  setSnapshot: (snapshot) => set({ snapshot }),

  setShadowSnapshot: (shadowSnapshot) => set({ shadowSnapshot }),

  setRunning: (v) => set({ isRunning: v }),

  setDisplayMode: (displayMode) => set({ displayMode }),

  setAblationEnabled: (ablationEnabled) => set({ ablationEnabled }),

  setFocusRoomId: (focusRoomId) => set({ focusRoomId }),

  setFocusedEventSummary: (focusedEventSummary) =>
    set({ focusedEventSummary }),

  setMainCapability: (key, value) =>
    set((s) => ({
      mainCapabilities: { ...s.mainCapabilities, [key]: value },
    })),

  setInsightFrozen: (insightFrozen) => set({ insightFrozen }),

  setExperimentLocked: (experimentLocked) => set({ experimentLocked }),

  setPinnedInsight: (pinnedInsight) => set({ pinnedInsight }),

  setVerdictFlash: (verdictFlash) => set({ verdictFlash }),

  appendCostSample: (main, shadow) =>
    set((s) => {
      const next: CostSample = {
        i: s.costSeries.length,
        main,
        shadow,
      };
      return {
        costSeries: [...s.costSeries, next].slice(-COST_SERIES_MAX),
      };
    }),

  clearCostSeries: () => set({ costSeries: [] }),

  toggleCounterfactualCompare: () => {
    const { ablationEnabled } = get();
    if (ablationEnabled) {
      set({
        ablationEnabled: false,
        displayMode: 'MAIN_ONLY',
        emphasizeNonAi: false,
      });
    } else {
      set({
        ablationEnabled: true,
        displayMode: 'SPLIT_SCREEN',
        emphasizeNonAi: false,
      });
    }
  },

  whatIfAiDisabled: () => {
    set({
      ablationEnabled: true,
      displayMode: 'SPLIT_SCREEN',
      emphasizeNonAi: true,
    });
  },

  rerunSameSeed: () =>
    set({
      pendingCommand: { type: 'reset' },
      focusRoomId: null,
      focusedEventSummary: null,
      emphasizeNonAi: false,
      insightFrozen: false,
      experimentLocked: false,
      pinnedInsight: null,
      costSeries: [],
      verdictFlash: 'none',
      isRunning: true,
    }),

  injectObstacle: () => {
    if (get().experimentLocked) return;
    set({ pendingCommand: { type: 'inject_obstacle' } });
  },

  clearObstacle: () => {
    if (get().experimentLocked) return;
    set({ pendingCommand: { type: 'clear_obstacle' } });
  },

  startFindPerson: (name) => {
    if (get().experimentLocked) return;
    set({ pendingCommand: { type: 'find_person', name } });
  },

  startFindObject: (name) => {
    if (get().experimentLocked) return;
    set({ pendingCommand: { type: 'find_object', name } });
  },

  resetAll: () =>
    set({
      pendingCommand: { type: 'reset' },
      focusRoomId: null,
      focusedEventSummary: null,
      emphasizeNonAi: false,
      insightFrozen: false,
      experimentLocked: false,
      pinnedInsight: null,
      costSeries: [],
      verdictFlash: 'none',
    }),

  completeDemo: () => set({ pendingCommand: { type: 'demo_complete' } }),

  consumePendingCommand: () => {
    const cmd = get().pendingCommand;
    if (cmd !== null) {
      set({ pendingCommand: null });
    }
    return cmd;
  },
}));
