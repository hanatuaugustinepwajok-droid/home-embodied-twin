# Counterfactual Shadow Twin

**AI Value Proven** — 同环境种子下的 **MAIN（AI World）vs SHADOW（Non-AI World）** 反事实验证台。

一句话：不是又一个家庭机器人 3D 看板，而是用消融对比证明「语义时效 + 反事实重规划」是否真的创造价值。

> **边界**：Web Mock 仿真，**非**真机固件。SHADOW 失败是**消融设计**（关闭 AI 策略的反事实），用于论证，不是物理引擎 bug。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 框架 | Next.js（App Router）+ React + TypeScript |
| 状态 | Zustand（`useHomeStore`） |
| 仿真 | `hooks/useHomeSimulation.ts`（单一 50ms tick 推 MAIN+SHADOW） |
| 3D | React Three Fiber + Drei + Three.js |
| UI | Tailwind、Lucide、Framer Motion |

---

## 安装与启动

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。建议 **1920×1080** 一屏演示。

```bash
npx tsc --noEmit
```

---

## 界面分区

```
┌────────────────┬─────────────────────┬──────────────────┐
│ Scenario Builds│ AI World │ Non-AI   │ 任务步骤         │
│ 语义地图       │   3D 反事实双生      │ 事件时间轴       │
│ About / 消融   │ Insight + 代价曲线   │                  │
├────────────────┴─────────────────────┴──────────────────┤
│            MAIN vs SHADOW 增益看板（A/B）                 │
└─────────────────────────────────────────────────────────┘
```

| 区域 | 作用 |
|------|------|
| **Scenario Builds** | 一键反事实验证、挑战卡、消融开关、导出结论 |
| **中区双生** | AI World / Non-AI World 分屏或叠加 |
| **Insight** | 三行定稿：扰动 / 反事实 / 收益 |
| **指标** | 以 SHADOW 为基线的增益对比 |
| **顶栏** | AI Value Proven · seed 可复制 · What if AI disabled |

---

## 核心叙事：反事实验证

| 角色 | 策略 | 挑战下预期 |
|------|------|------------|
| **MAIN** | 动态语义地图 + 置信度衰减 + 反事实重规划 | 重规划 → SUCCESS（绿） |
| **SHADOW** | 静态占用 + 启发式，无语义时效 | STALLED / FAILED（红） |

四类扰动（原「四挑战」）降级为**实验刺激**：

1. 动态障碍  
2. 目标遮挡 / 丢失  
3. 语义过期（置信度）  
4. 任务中断后恢复  

### 30 秒演示（推荐）

1. 点 **「一键反事实验证」**  
2. 自动：开对比 → 找爸爸 → 注入障碍 → 等到 SHADOW 红失败 + MAIN 重规划  
3. **Insight 定格**（三行可背）+ 代价曲线 + 底部增益  
4. 可选：复制 `seed=` / **同 seed 再跑** / **导出结论**

手动路径：`What if AI disabled` → 挑战卡「动态障碍」或「目标遮挡」→ 看 Insight。

---

## 消融开关

左侧可勾选：

- 动态语义地图  
- 语义时效衰减  
- 反事实重规划  

关闭某一项时 MAIN 行为降级，用于回答：「价值来自哪一块能力」。

---

## 指标含义（A/B）

增益以 **SHADOW 为基线**。任务未结束显示「进行中」，避免误导性 0%。

典型字段：定位稳定度、避障成功率、寻人寻物成功率、平均耗时、重规划有效率。

---

## 作品集口径

- 标题：**Counterfactual Shadow Twin · AI Value Proven**  
- 详细方案：见 [`docs/proposal-summary.md`](docs/proposal-summary.md)  
- 诚实边界：Mock、非真机、影子失败=消融设计  

---

## 目录要点

```
types/          home.ts · counterfactual.ts
store/          useHomeStore.ts
hooks/          useHomeSimulation.ts
components/     ControlPanel · HomeTwinCanvas · CounterfactualHud …
lib/            insightTemplate.ts · roomFocus.ts
docs/           proposal-summary.md
```
