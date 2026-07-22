# 时间系统设计

> 回合生命周期（扩展版）、天气×季节×时间深度绑定、NPC 并行处理、性能策略

---

## 一、设计理念

### 核心思路：文明式回合

和《文明》一样——你动一下，整个世界动一下。

```
你选择行动 → 你的行动生效 → 世界响应 → NPC 也动 → 世界推进 → 叙事呈现 → 新的一轮
```

但这里有个关键区别：这不是战棋游戏，是**文字冒险**。所以世界响应不是"扣血 5 点"，而是：

- 沈清岚在储藏坑那边查资料
- 格兰出去打猎了
- 米娅在煮药
- 暮河镇的周启明派出了巡逻队
- 苇水村的粮食又少了一天
- 天气转阴了，可能要下雨

所有这些都发生在同一个时段里，最终汇总成一段叙事文本给玩家看。

### 为什么回合需要这么多阶段？

因为每个阶段产生不同类型的**叙事素材**，需要分门别类收集，最后合成一段连贯的文本：

```
玩家行动叙事      → "你决定去集市碰碰运气..."
NPC 反应叙事      → "沈清岚听说你要去集市，托你带些药草回来。"
NPC 自主叙事      → "格兰一早就带着弓出去了。"
世界叙事          → "天空阴沉沉的，可能要下雨。"
事件叙事          → "你在路上听到一个消息：暮河镇昨晚有东西跑了。"
```

这些叙事来自不同的阶段，但玩家看到的是**一段话**。

---

## 二、回合生命周期（扩展版·12 阶段）

```
┌─────────────────────────────────────────────────┐
│               TURN_START (阶段 0-2)              │
│  初始化、时间推进、被动公告                        │
├─────────────────────────────────────────────────┤
│  0.  TURN_INIT         回合初始化                  │
│  1.  TIME_ADVANCE      时段推进 + 日历             │
│  2.  WORLD_ANNOUNCE    天气/季节/公告              │
├─────────────────────────────────────────────────┤
│               PLAYER_PHASE (阶段 3-5)             │
│  等待输入、执行行动、即时反馈                       │
├─────────────────────────────────────────────────┤
│  3.  PLAYER_INPUT      等待玩家选择                │
│  4.  PLAYER_ACTION     执行玩家行动                │
│  5.  ACTION_RESULT     行动即时结果                │
├─────────────────────────────────────────────────┤
│               RESOLUTION_PHASE (阶段 6-8)         │
│  规则评估、NPC 响应、世界推进                       │
├─────────────────────────────────────────────────┤
│  6.  RULE_EVALUATE     规则系统评估                │
│  7.  NPC_PHASE         NPC 反应 + 自主行动         │
│  8.  WORLD_TICK        资源/事件/势力              │
├─────────────────────────────────────────────────┤
│               NARRATIVE_PHASE (阶段 9-11)         │
│  叙事合成、异步 AI、收尾                            │
├─────────────────────────────────────────────────┤
│  9.  NARRATIVE_SYNC    叙事碎片合成 (模板)          │
│  10. AI_TRIGGER        判断是否→异步调AI润色        │
│  11. TURN_END          收尾 + 推送 (不阻塞)         │
│                        AI完成后→增量推送润色文本     │
└─────────────────────────────────────────────────┘
```

### ⚡ 回合级事务保护

如果第 7 阶段 NPC 抛异常，整个回合状态可能半更新——玩家扣了体力但 NPC 没动。

```typescript
class TurnManager {
  async executeTurn(ctx: TurnContext): Promise<void> {
    // 1. 快照当前状态（深拷贝）
    const snapshot = ctx.createSnapshot()

    try {
      for (const phase of this.phases) {
        if (phase.shouldSkip(ctx)) continue
        await phase.execute(ctx)
      }
    } catch (err) {
      // 2. 任何阶段抛出异常 → 回滚到快照
      console.error(`[TurnManager] Phase failed, rolling back:`, err)
      ctx.restoreSnapshot(snapshot)

      // 3. 通知客户端
      ctx.pushNarrative('发生了未知的干扰...')
      return
    }

    // 4. 正常完成 → 持久化
    await ctx.persistToDatabase()
  }
}
```

注意：快照只在内存中（`structuredClone` 或手动复制），不涉及数据库事务——SQLite 单线程写入，不太可能出现并发冲突。主要保护的是内存状态的一致性和客户端不看到半残数据。

### ⚡ 阶段跳过机制

不是每个回合都需要跑满 12 阶段。**每个阶段执行前先判断是否跳过**：

```
阶段执行前 → 检查前置条件 → 不满足 → 跳过（0 ms）
                             满足 → 执行
```

```typescript
interface Phase {
  id: string
  /** 是否应该跳过此阶段 */
  shouldSkip(ctx: TurnContext): boolean
  /** 执行阶段逻辑 */
  execute(ctx: TurnContext): void
}

class TurnManager {
  private phases: Phase[]

  executeTurn(ctx: TurnContext): void {
    for (const phase of this.phases) {
      if (phase.shouldSkip(ctx)) continue  // ← 跳过空转
      phase.execute(ctx)
    }
  }
}
```

**各阶段的跳过条件：**

| 阶段 | 跳过条件 |
|------|---------|
| 0. TURN_INIT | 从不跳过 |
| 1. TIME_ADVANCE | 从不跳过（每回合都要推进时段） |
| 2. WORLD_ANNOUNCE | 天气没变 + 无公告 = 跳过 |
| 3. PLAYER_INPUT | 从不跳过（等玩家输入） |
| 4. PLAYER_ACTION | 从不跳过（执行玩家选择） |
| 5. ACTION_RESULT | 只有"移动/社交/探索"需要即时结果叙事 |
| 6. RULE_EVALUATE | 当前场景无可评估的规则 = 跳过 |
| 7. NPC_PHASE | 同地点无活跃 NPC = 跳过 |
| 8. WORLD_TICK | 无跨天 + 无待发事件 = 跳过 |
| 9. NARRATIVE_SYNC | 无新叙事碎片 = 跳过 |
| 10. AI_TRIGGER | 无需 AI 润色 = 跳过 |
| 11. TURN_END | 从不跳过 |

**典型"日常回合"实际只跑 5-6 个阶段，不是 12 个。**

### 2.1 阶段 0-2：TURN_START 子阶段

```
TURN_INIT (阶段 0)
│
│  回合初始化。此时玩家行动已消耗完时段，
│  进入"世界推进"部分。
│
├── 回合计数器 +1
├── 清除上一轮的临时状态（session flags、一次性效果等）
└── 准备上下文容器（用于收集各阶段的叙事碎片）
```

```
TIME_ADVANCE (阶段 1)
│
│  时间推进——这是核心：所有"和时间挂钩"的东西都在这里更新
│
├── 1a. 时段推进
│   └── 玩家行动消耗了 N 个时段 → 推进 N 步
│       e.g. "上午(3)" → 消耗 2 时段 → "下午(5)"
│
├── 1b. 跨天检查
│   └── 如果跨过"夜晚"时段(7) → 触发跨天
│       ├── 日期 +1
│       ├── 每日资源消耗（粮食等）
│       ├── 红月倒计时 -1
│       ├── 任务截止检查
│       └── 月度更新（如果跨月）
│           ├── 季节变更检测
│           ├── 月度事件检测
│           └── 季度报告（可选）
│
├── 1c. 时段效果
│   └── 不同时段有不同效果（通过规则系统）
│       ├── 黎明 → 体力少量恢复，适合秘密行动
│       ├── 上午 → 效率最高，可连续 2 行动
│       ├── 正午 → 适合社交，可能触发"餐桌对话"
│       ├── 傍晚 → 室外行动受限
│       └── 夜晚 → 强制休息（除非特殊事件）
│
├── 1d. 季节效果
│   └── 当前月份决定季节
│       ├── 春季(3-5)  → 雨季，植物生长
│       ├── 夏季(6-8)  → 酷热，昼长夜短
│       ├── 秋季(9-11) → 收获季，天气多变
│       └── 冬季(12-2) → 寒冷，昼短夜长
│
└── 收集 TIME_ADVANCE 阶段的叙事碎片
    → "太阳西沉，天色渐暗。"
    → "已是深秋，风中带着寒意。"
```

```
WORLD_ANNOUNCE (阶段 2)
│
│  公告——到达玩家眼前之前的世界变化
│
├── 2a. 天气更新
│   ├── 当前天气是否达到切换条件？
│   ├── 如果切换 → 生成天气切换叙事
│   └── 天气效果绑定 → 通过规则系统
│
├── 2b. 环境公告
│   ├── 红月状态（特殊日期公告）
│   ├── 特殊天象（血月、日食等）
│   └── 区域公告（远处传来的消息）
│
└── 收集 WORLD_ANNOUNCE 阶段的叙事碎片
    → "天空飘起了细雨。"
    → "远处的钟楼敲了六下。"
```

### 2.2 阶段 3-5：PLAYER_PHASE 子阶段

```
PLAYER_INPUT (阶段 3)
│
│  向客户端推送状态，等待玩家选择。
│
├── 组装状态栏（时间/资源/位置/队伍）
├── 组装 TURN_START 阶段的叙事（时间+天气+公告）
├── 可用行动列表（由规则系统/AI 生成）
├── 推送至客户端
└── 等待 room.onMessage('action')
```

```
PLAYER_ACTION (阶段 4)
│
│  执行玩家选择的行动。
│
├── 4a. 行动校验
│   ├── 该行动是否在当前可用列表中？
│   ├── 体力是否足够？
│   └── 资源是否满足条件？
│
├── 4b. 扣除消耗
│   ├── 体力 -= 行动消耗
│   ├── 银币 -= 成本
│   └── 物品 -= 消耗品
│
├── 4c. 执行行动效果
│   ├── 移动 → 更新 locationId
│   ├── 交易 → 更新银币/物品
│   ├── 社交 → 更新好感度
│   ├── 探索 → 触发探索规则
│   ├── 建设 → 更新 flag
│   ├── 工作 → 获得银币/物品
│   └── 休息 → 恢复 HP/SP/MP
│
└── 收集 PLAYER_ACTION 叙事碎片
    → "你决定前往苇水村。"
```

```
ACTION_RESULT (阶段 5)
│
│  玩家行动的即时反馈——行动直接影响的结果，
│  在 NPC 行动之前就展现的部分。
│
├── 移动 → "你沿着猎人小路走了近一个时辰，苇水村的炊烟已经依稀可见。"
├── 交易 → "你用 30 银币换到了一袋粮食和一卷绷带。"
├── 社交 → "沈清岚沉默了一会儿，然后说：'谢谢你还记得。'"
├── 探索 → 触发探索规则
│
└── 注意：这里只处理"玩家行动的直接结果"。
       NPC 的反应、世界的后续变化在后续阶段处理。
```

### 2.3 阶段 6-8：RESOLUTION_PHASE 子阶段

```
RULE_EVALUATE (阶段 6)
│
│  规则系统评估——玩家的行动触发了什么规则。
│
├── 收集当前场景所有相关 RuleBindable 对象
│   ├── 当前地点 (灰丘)
│   ├── 当前天气 (小雨)
│   ├── 当前时段 (傍晚)
│   ├── 当前季节 (深秋)
│   ├── 持有物品 (皮甲)
│   ├── 已学技能 (野外生存 Lv.2)
│   ├── 队伍成员 (沈清岚好感 55)
│   └── 全局规则 (红月倒计时相关)
│
├── RuleEngine.evaluateAll()
│   ├── 条件满足 → 执行效果
│   ├── modifiers → 修正数值
│   ├── narrativeAppend → 追加叙事
│   └── pendingEvents → 触发事件
│
└── 收集 RULE_EVALUATE 叙事碎片
    → "雨后的泥路比预想中更难走。" (雨天规则)
    → "沈清岚的野外经验帮了不少忙。" (技能规则)
```

```
NPC_PHASE (阶段 7)
│
│  NPC 阶段——分两层：反应 + 自主
│
├── 7a. NPC_REACTION (NPC 对玩家行动的反应)
│   ├── 只有和玩家同地点的 NPC 执行
│   ├── 根据 NPC 性格 + 好感度决定反应
│   ├── 沈清岚 (好感 55, 理性型)
│   │   → "沈清岚点了点头，没有说话，默默跟了上来。"
│   ├── 格兰 (好感 25, 务实型)
│   │   → "格兰检查了一下弓弦，'走吧，我掩护你。'"
│   └── 米娅 (好感 30, 依赖型)
│       → "米娅拖着伤腿挪到门口，欲言又止。"
│
├── 7b. NPC_AUTONOMOUS (NPC 自主行为)
│   ├── 所有活跃 NPC 执行（按分层 tick，详见第三节）
│   ├── 各 NPC 按职业/性格/状态做决策
│   ├── 收集行为结果
│   └── 应用 NPC 行为产生的效果（资源变化、flag 变更）
│
└── 收集 NPC_PHASE 叙事碎片
    → "格兰一早就出去打猎了，带回来一只野兔。"
    → "暮河镇方向有骑兵出城的动静。"
```

```
WORLD_TICK (阶段 8)
│
│  世界推进——不依赖玩家/NPC 个体的系统级更新
│
├── 8a. 跨天后续处理（如果跨天）
│   ├── 队伍粮食消耗（每人每天 1 单位）
│   ├── 任务截止日期检查
│   ├── 势力关系被动变化
│   └── 自动存档触发
│
├── 8b. 资源自然变化
│   ├── 休息时段 → HP/SP/MP 恢复
│   ├── 饥饿 → HP 减少
│   ├── 药品效果持续/过期
│   └── 作物生长（灰丘建设后续）
│
├── 8c. 事件系统检测
│   ├── EventSystem.checkTriggers()
│   ├── 按地点/flag/时间/随机概率检测
│   ├── 高优先级事件优先
│   ├── 冷却中的事件跳过
│   └── 触发的事件加入 pendingEvents
│
├── 8d. 势力状态更新
│   ├── 神殿行动（低概率随机）
│   ├── 暮河镇封锁状态
│   ├── 苇水村粮食变化
│   └── 亚人网络动态
│
└── 收集 WORLD_TICK 叙事碎片
    → "粮食又少了一天。"
    → "据说暮河镇北门加了岗哨。"
```

### 2.4 阶段 9-11：NARRATIVE_PHASE 子阶段

```
NARRATIVE_SYNC (阶段 9)
│
│  叙事合成——将前面 8 个阶段收集的叙事碎片
│  合并成一段连贯的文本。
│
├── 9a. 合并策略
│   ├── 按阶段顺序排列：时间→天气→公告→玩家行动→结果→规则→NPC→世界
│   ├── 去重：同一个 NPC 的多次行为合并成一段
│   ├── 过滤：无信息量的叙事省略（如"路人甲在睡觉"）
│   ├── 优先级：战斗/事件 > 社交 > 资源 > 日常
│   └── 长度控制：最多 15 条叙事片段，超出用"...还有 X 件事"概括
│
├── 9b. 叙事模板
│   ├── 日常叙事 → 模板拼接（不调 AI）
│   ├── 事件叙事 → 事件模板中的 narrativeBase
│   ├── 重要叙事 → 调 AI 润色
│   └── 对话叙事 → 调 AI 生成
│
└── 输出: 合并后的 narrative 字符串
```

```
AI_GENERATE (阶段 10) —— 异步两步走
│
│  ⚠️ DeepSeek API 调用耗时 2-10 秒，
│     不能阻塞回合流程让玩家干等。
│
│  ┌── 第一步：立即返回（不调 AI）──────────────┐
│  │  TURN_END 先用模板文本合成叙事 + 行动列表， │
│  │  立即推送给客户端。玩家可以开始下一回合。    │
│  │  叙事里加标记： "[AI 润色中...]"           │
│  └──────────────────────────────────────────┘
│                     │
│                     异步（不阻塞）
│                     ▼
│  ┌── 第二步：后台调 AI ───────────────────────┐
│  │  DeepSeek API 调用                         │
│  │  → 生成润色后的叙事文本                     │
│  │  → 通过 room.send('narrative_update', text) │
│  │  → 客户端收到后替换"[AI 润色中...]"部分     │
│  └──────────────────────────────────────────┘
│
│  触发条件（第一步决定是否需要走第二步）:
│   ├── 玩家执行了重大行动
│   ├── 有特殊事件触发
│   ├── 玩家主动请求对话
│   └── 连续 N 回合未调 AI
│
│  非必要时不走第二步：
│   ├── 只是资源变化 → 模板文本就够了
│   ├── NPC 日常行为 → 模板文本
│   └── 重复性操作 → 简略描述
│
│  频率控制：
│   └── 连续 3 回合内不重复调 AI
```

```
TURN_END (阶段 11)
│
│  回合收尾——检查、清理、推送。
│
├── 11a. 死亡检测
│   ├── HP ≤ 0 → 游戏结束
│   ├── 连续饥饿 → 饿死检测
│   ├── 精神崩溃 → 特殊失败
│   └── 魔化 → 特殊失败
│
├── 11b. 胜利条件检测
│   ├── 领地建立
│   ├── 预言破解
│   └── 存活至红月日
│
├── 11c. 状态推送
│   ├── 通过 Colyseus 更新 GameState
│   ├── narrative ← 合成的叙事文本
│   ├── availableActions ← 下一轮行动
│   └── isPlayerTurn ← true
│
├── 11d. 存档检查
│   ├── 每完成一个"卷"级事件
│   ├── 跨天时
│   └── 玩家主动要求
│
└── 11e. 清理
    ├── 临时 flag 清除
    ├── 一次性效果清除
    └── 叙事碎片容器清空
```

---

## 三、因果链系统

> 让玩家的每个选择都有分量——"因为我做了A，所以B发生了，然后整个世界都变了。"

### 3.1 什么是因果链？

```
第5回合：你决定帮助苇水村的亚人逃奴
    │
    ▼
第5回合 NPC_PHASE：亚人网络获得了你的口碑 (+声望)
    │
    ▼
第8回合 WORLD_TICK：暮河镇守备队发现了你的活动 (+周启明警觉度)
    │
    ▼
第12回合 EVENT：亚人联络人找到你，提供情报
    │
    ▼
第20回合：你获得了一个关键信息——暮河镇地下有秘密通道
    │
    ▼
第25回合：你利用这条通道营救了被囚禁的人
```

玩家的每个行动不是孤立事件——它通过因果链在整个游戏世界中传播、发酵、最终爆发。

### 3.2 因果链的三种类型

```
┌─────────────────────────────────────────────────┐
│  类型 A: 直接因果（当前回合内）                    │
│  你卖粮食 → 粮食减少、银币增加、对方好感上升       │
│  处理阶段: PLAYER_ACTION → ACTION_RESULT          │
├─────────────────────────────────────────────────┤
│  类型 B: 短链因果（N 回合后）                      │
│  你帮助某人 → N回合后他回报你                      │
│  机制: Flag + 事件模板条件检测                     │
├─────────────────────────────────────────────────┤
│  类型 C: 长链因果（蝴蝶效应）                      │
│  你在A地做了一件事 → 导致B地的势力动了             │
│  → 影响了C人物的决策 → 最终在D事件中爆发           │
│  机制: Flag传递 + 势力状态机 + 延迟事件队列         │
└─────────────────────────────────────────────────┘
```

### 3.3 核心机制一：Flag 传递系统（两级分级）

**⚠️ 问题**：每个选择都设 flag，100 回合后可能有 200+ 个 flag，大部分再也不会被读取。

**解决**：Flag 分两级——持久 Flag 和 Session Flag。

```typescript
class FlagSystem {
  /** 持久 Flag——存入数据库，游戏重启后仍在 */
  private persistentFlags: Map<string, string>

  /** Session Flag——仅当前运行时存在，session结束后自动丢弃 */
  private sessionFlags: Map<string, string>

  set(name: string, value: string, tier: 'persistent' | 'session' = 'session'): void {
    if (tier === 'persistent') {
      this.persistentFlags.set(name, value)
      // 同时写数据库
    } else {
      this.sessionFlags.set(name, value)
    }
  }

  get(name: string): string | undefined {
    return this.persistentFlags.get(name) ?? this.sessionFlags.get(name)
  }

  /** 清理所有 Session Flag（每回合 TURN_INIT 时调用） */
  clearSessionFlags(): void {
    this.sessionFlags.clear()
  }
}
```

**什么场景用哪一级：**

| Flag 类型 | 例子 | 级别 | 说明 |
|-----------|------|------|------|
| 剧情推进 | `helped_亚人逃奴` | persistent | 永久影响后续剧情 |
| 数值积累 | `亚人网络_声望: 15` | persistent | 持久追踪 |
| 一次对话 | `talked_to_沈清岚_今早` | session | 本轮对话用完后丢弃 |
| 临时效果 | `has_temporary_buff_防御` | session | 效果到期后丢弃 |
| 环境状态 | `weather_just_changed` | session | 公告用完后丢弃 |
| 场景标记 | `player_entered_暮河镇` | session | 跨场景后丢弃 |

Flag 是因果链的"记忆"。一个行动设置 flag，后续的事件/规则/NPC 行为通过 flag 感知到"发生过什么"。

```typescript
// 玩家选择帮助亚人逃奴
// PLAYER_ACTION 阶段执行：
flagSystem.set('helped_亚人逃奴', 'true', 'persistent')
flagSystem.set('亚人网络_声望', '+15', 'persistent')
flagSystem.set('周启明_警觉度', '+1', 'persistent')

// 8 回合后，事件系统检测：
// EventTemplate 的条件中：
{
  "conditionJson": {
    "requiredFlags": { "亚人网络_声望": { "operator": ">=", "value": 10 } },
    "minTurnDelay": 8  // 至少 8 回合后才能触发
  }
}
// → 触发"亚人联络人接触"事件
```

```typescript
interface FlagChange {
  name: string
  operator: 'set' | 'add' | 'multiply'
  value: string | number
  /** 延迟生效的回合数（0=立即生效） */
  delayTurns?: number
  /** 传播范围：local(仅当前地点) / region(整个区域) / global(全世界) */
  scope?: 'local' | 'region' | 'global'
}
```

**Flag 传播示例：**

```
玩家在"灰丘"帮助亚人逃奴
  ├── [local]  灰丘的亚人信任度 +10        → 灰丘亚人态度变化
  ├── [region] 东南边境亚人网络声望 +5      → 区域亚人网络知道你了
  └── [global] 神殿情报网"可疑人物"标记 +1  → 远在王都的神殿也在记录你
```

### 3.4 核心机制二：延迟事件队列

不是所有因果都立即发生。有些效果需要延时触发。

```typescript
interface DelayedEvent {
  id: string
  /** 触发延迟（回合数） */
  delay: number
  /** 已过去的回合数 */
  elapsed: number
  /** 触发条件（可选——即使倒计时到了，也可能不触发） */
  condition?: Condition
  /** 触发时的效果 */
  effects: Effect[]
  /** 叙事文本 */
  narrative: string
  /** 是否可被玩家行为取消 */
  cancellable: boolean
  /** 取消条件 */
  cancelCondition?: Condition
}

class DelayedEventQueue {
  private queue: DelayedEvent[] = []

  /** 每回合 TURN_START 时调用 */
  tick(): DelayedEvent[] {
    const triggered: DelayedEvent[] = []

    for (const event of this.queue) {
      event.elapsed++

      if (event.elapsed >= event.delay) {
        // 检查取消条件
        if (event.cancellable && event.cancelCondition?.evaluate(ctx)) {
          // 事件被取消——玩家做了别的事阻止了它
          this.addNarrative(`${event.id} 被阻止了`)
          this.queue.splice(this.queue.indexOf(event), 1)
          continue
        }

        // 检查触发条件
        if (!event.condition || event.condition.evaluate(ctx)) {
          triggered.push(event)
          this.queue.splice(this.queue.indexOf(event), 1)
        }
      }
    }

    return triggered
  }

  /** 添加一个延迟事件 */
  add(event: DelayedEvent): void {
    this.queue.push(event)
  }
}
```

**延迟事件示例：**

```typescript
// 玩家在暮河镇惹了事
delayedEventQueue.add({
  id: 'zhou_qiming_reinforcements',
  delay: 15,             // 15 回合后
  elapsed: 0,
  condition: new FlagCondition('周启明_警觉度', '>=', 3),
  effects: [
    new SetFlagEffect('暮河镇_增兵', 'true'),
    new NarrativeEffect('周启明从王都调来了一队佣兵。此后暮河镇的盘查严了很多。'),
  ],
  narrative: '你听说暮河镇最近来了些新面孔。',
  cancellable: true,
  cancelCondition: new CompositeCondition('and', [
    new FlagCondition('暮河镇_声望', '>=', 30),
    new FlagCondition('周启明_被牵制', '==', 'true'),
  ]),
})

// 如果 15 回合内玩家提升了暮河镇声望并牵制了周启明
// → 这队援兵就不会来——玩家的主动行为改变了因果
```

### 3.5 核心机制三：NPC 记忆与关系演化

NPC 不是每次都重新开始——他们记住玩家做过的事。

```typescript
interface NpcMemory {
  npcId: number
  /** NPC 记得的"玩家行为"列表 */
  memories: MemoryEntry[]
}

interface MemoryEntry {
  action: string           // 玩家做了什么
  turn: number             // 哪一回合
  location: string         // 在哪里
  impression: number       // 印象分 (-10 ~ +10)
  narrative: string        // NPC 会怎么提起这件事
}

// 玩家做了一件影响 NPC 的事
npcMemorySystem.addMemory(沈清岚, {
  action: '送了药草',
  turn: currentTurn,
  location: '灰丘',
  impression: +5,
  narrative: '你还记得那次你带回来的药草……挺及时的。',
})

// 后续对话中，NPC 会根据记忆自动生成回应
function getNpcDialogue(npc: Npc, context: DialogueContext): string {
  const recentMemory = npc.memories
    .sort((a, b) => b.impression - a.impression)
    .slice(0, 3)

  if (recentMemory.length > 0) {
    // NPC 会提及最近的记忆
    return `${npc.name}看了看你，说道：${recentMemory[0].narrative}`
  }

  return getDefaultDialogue(npc)
}
```

### 3.6 因果链在 12 阶段中的位置

因果链不是某一个阶段，而是贯穿多个阶段：

```
阶段 4: PLAYER_ACTION
  └── 设置 Flag / 添加延迟事件 / 写入 NPC 记忆
       ├── flagSystem.set('helped_某人', 'true')
       ├── delayedEventQueue.add({ delay: 10, ... })
       └── npcMemory.add(某人, { impression: +5 })

阶段 6: RULE_EVALUATE
  └── 规则读取 Flag → 产生即时修正
       └── flag 'helped_某人' == 'true' → 该势力交易价格 -10%

阶段 7: NPC_PHASE
  └── NPC 读取 Flag / 记忆 → 改变行为
       └── 亚人NPC 因为你的声望 → 主动提供情报

阶段 8: WORLD_TICK
  └── 延迟事件队列 tick → 达到延迟的事件触发
  └── 事件系统检测 Flag 条件 → 触发关联事件

阶段 10: AI_GENERATE
  └── AI 读取 Flag / 记忆 → 生成贴合因果的叙事
       └── "你还记得那个雨夜帮过的亚人吗？他来了。"
```

### 3.7 因果链可视化

```
时间 →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→

第5回合                        第20回合                      第40回合
   │                              │                            │
   ▼                              ▼                            ▼
┌────────┐                   ┌────────┐                  ┌────────┐
│ 帮助   │──flag──►          │ 事件   │──flag──►         │ 剧情   │
│ 亚人   │  声望+15          │ 联络人 │  情报获得        │ 营救   │
└────────┘                   └────────┘                  └────────┘
   │                              │
   │ 延迟队列                     │ NPC记忆
   ▼                              ▼
┌────────┐                   ┌────────┐
│ 周启明 │──15回合后──►      │ 沈清岚 │
│ 警觉度 │   增兵事件        │ 好感+10│
└────────┘                   └────────┘

每个决策都是一颗种子，在不同的时间发芽。
```

### 3.8 因果链与叙事呈现

因果链最终要体现在玩家看到的文本里。不能让玩家感觉"做了白做"。

```typescript
// 因果链叙事生成规则：
// 1. 直接结果 → 立即呈现
//    "你给了她药草。她感激地点了点头。"

// 2. 短链结果 → 在后续回合中自然提及
//    第6回合: "沈清岚今天气色好了一些。"
//    第10回合: "沈清岚采了些野菇回来，说是谢礼。"

// 3. 长链结果 → 在关键节点触发特殊叙事
//    第40回合: "沈清岚突然提到：'还记得那次你给我药草吗？
//    我欠你一次。'她递给你一张地图。"
//    → 玩家看到这个才会意识到：40回合前的一个小选择，在这里结出了果实

// 4. 被阻止的因果 → 也值得提及
//    "你听说原本周启明要从王都调援兵，但不知为何取消了。"
//    → 如果玩家做了阻止行动，这个叙事让玩家感到"我改变了世界"
```

---

### 3.9 借鉴 HOI3：大战略事件链如何适配回合制

#### HOI3 哪些设计值得我们借鉴

| HOI3 机制 | 核心思路 | 在我们的回合制中怎么用 |
|-----------|---------|---------------------|
| **MTTH（平均发生时间）** | 事件不设固定触发时间，而是"每回合有概率触发，平均 N 回合后触发" | 替代固定延迟，让因果链的发生时间更有机、更不可预测 |
| **事件链（event chaining）** | 一个事件选的选项可以 `fire_event = xxx` 链式触发后续事件 | 每个选项明确指定下一环：`choice → effect + chain to event Y` |
| **省份作用域** | 事件绑定到具体省份，只在该省份相关时才检查 | 事件绑定到具体 Location，只在该地点或相邻地点才检查 |
| **国策/精神系统** | 持久修正（national spirit）附加在国家上 | 就是我们的"规则系统"——规则绑在对象上持续生效 |
| **AI 决策加权** | AI 对每个行动算权重，选最高权重的执行 | NPC tick 已用优先级，但可以加入中断机制 |
| **交错 Tick** | 不同系统在不同频率 tick，不是所有系统每帧都跑 | 我们的 NPC 分层 tick 正是这个思路的体现 |

#### 核心借鉴 1：MTTH 替代固定延迟

HOI3 最大的启发：**不用固定回合数，用概率**。

```typescript
// ❌ 之前的设计——固定延迟
delayedEventQueue.add({
  id: 'zhou_qiming_reinforcements',
  delay: 15,   // 死板——永远是 15 回合后
  ...
})

// ✅ 借鉴 HOI3——MTTH 概率触发
// "平均 15 回合触发，但实际可能在 5 回合或 30 回合"
// 每回合按概率判定，让玩家感觉"终于来了"而不是"到点了"
```

**MTTH 实现（适配回合制）：**

```typescript
interface MttHEvent {
  id: string
  /** 基础平均发生回合数（越大越慢） */
  baseMttH: number
  /** MTTH 修正系数（<1 = 加速, >1 = 减速） */
  mttHModifiers: MttHModifier[]
  /** 最低触发间隔——不能刚触发又来一次 */
  minTurnsSinceLastTrigger: number
  /** 触发条件 */
  condition: Condition
  /** 触发时的效果 */
  effects: Effect[]
  /** 是否可被取消 */
  cancellable: boolean
}

interface MttHModifier {
  factor: number        // 修正系数: 0.5 = 速度翻倍, 2 = 速度减半
  condition: Condition  // 满足此条件时应用修正
}

/** 每回合调用——计算触发概率 */
function getMttHTriggerChance(event: MttHEvent, ctx: RuleContext): number {
  let mttH = event.baseMttH

  // 应用所有修正
  for (const mod of event.mttHModifiers) {
    if (mod.condition.evaluate(ctx)) {
      mttH *= mod.factor
    }
  }

  // 计算本回合触发概率
  // MTTH 的公式：每回合触发概率 = 1 - e^(-1/mttH)
  // 当 mttH = 15 时，每回合约 6.45% 概率触发
  return 1 - Math.exp(-1 / mttH)
}

// 使用时：
class DelayedEventQueue {
  tick(ctx: RuleContext): TriggeredEvent[] {
    const triggered: TriggeredEvent[] = []

    for (const event of this.mttHEvents) {
      // 跳过冷却中的事件
      if (this.turnSinceLastTrigger(event.id) < event.minTurnsSinceLastTrigger) continue

      // 检查条件
      if (!event.condition.evaluate(ctx)) continue

      // 按 MTTH 概率判定
      const chance = getMttHTriggerChance(event, ctx)
      if (Math.random() < chance) {
        triggered.push(event)
      }
    }

    return triggered
  }
}
```

**MTTH 修正示例：**

```typescript
// 周启明调兵事件——平均 30 回合触发
event: {
  id: 'zhou_qiming_reinforcements',
  baseMttH: 30,
  mttHModifiers: [
    // 你的警觉度越高，他来越快
    { factor: 0.8, condition: new FlagCondition('周启明_警觉度', '>=', 1) },
    { factor: 0.5, condition: new FlagCondition('周启明_警觉度', '>=', 3) }, // 叠加: 3.2 → *0.8*0.5 = *0.4
    { factor: 2.0, condition: new FlagCondition('暮河镇_声望', '>=', 30) }, // 声望高反而来得慢（你有人脉）
  ],
  minTurnsSinceLastTrigger: 20,
  condition: new FlagCondition('周启明_警觉度', '>=', 1),
}
// 计算结果：
// 基础 MTTH = 30
// 警觉度=2 → ×0.8 → MTTH=24 → 每回合约 4.1%
// 警觉度=4 → ×0.8×0.5 → MTTH=12 → 每回合约 8.0%
// 警觉度高 + 声望高 → ×0.8×0.5×2.0 → MTTH=24
```

#### 核心借鉴 2：事件链（Event Chaining）

HOI3 的选项可以显式触发下一个事件。我们也这么做——**每个选项明确指定它引发的因果链后续**。

```typescript
// 事件模板中的选项结构（扩展版）
interface EventChoice {
  label: string
  description: string

  // 即时效果
  effects: Effect[]

  // 因果链：触发后续事件（MTTH 风格延迟）
  chain: ChainLink[]

  // 因果链：设置 Flag（给其他事件当条件）
  flags: FlagChange[]

  // 因果链：写入 NPC 记忆
  memories: MemoryEntry[]
}

interface ChainLink {
  /** 目标事件 ID */
  eventId: string
  /** 延迟方式 */
  delay: {
    type: 'fixed' | 'mttH'
    turns?: number     // fixed: 固定回合数
    baseTurns?: number  // mttH: 基础平均回合数
  }
}
```

**完整的事件链示例：**

```typescript
// 事件 101：你发现了受伤的亚人
{
  id: 101,
  name: '路边伤者',
  narrative: '你在路边发现了一个受伤的亚人少年。他的一条腿被捕兽夹夹住了，血流不止。看到你走近，他警觉地握紧了手里的短刀。',
  choices: [
    {
      label: '帮他解开捕兽夹，给他包扎',
      effects: [new ModifierEffect('medicineCount', 'add', -1)],
      flags: [{ name: 'helped_亚人少年', operator: 'set', value: 'true' }],
      memories: [{ npcName: '亚人少年_日后', impression: +15, narrative: '你还记得那次在路边帮了我...' }],
      chain: [
        { eventId: 102, delay: { type: 'mttH', baseTurns: 5 } },     // 5-10回合后：亚人网络联系你
        { eventId: 103, delay: { type: 'mttH', baseTurns: 20 } },    // 20-30回合后：少年康复来投奔
      ],
    },
    {
      label: '给他留了点干粮，然后离开',
      effects: [new ModifierEffect('foodDays', 'add', -1)],
      flags: [{ name: 'gave_food_to_亚人少年', operator: 'set', value: 'true' }],
      chain: [
        { eventId: 104, delay: { type: 'mttH', baseTurns: 10 } },    // 10-15回合后：在暮河镇听到他的消息
      ],
    },
    {
      label: '视而不见，继续赶路',
      effects: [],
      chain: [],  // 无事发生——但也有可能... (被其他模板检测到 flag=未帮助)
    },
  ],
}

// 事件 102：亚人网络联系你（由 101 的选项 A 链式触发）
{
  id: 102,
  name: '亚人联络人',
  condition: {
    requiredFlags: { 'helped_亚人少年': 'true' },
  },
  // 由 101 的 chain 触发，但额外检查条件
  narrative: '一天，一个兜帽人出现在你面前...',
}
```

**这解决了什么？**

```
之前的问题：
  事件系统是"扫描式"的——每回合扫描所有事件模板，看条件是否满足。
  如果模板很多（50+），扫描成本高，且容易误触。

HOI3 式事件链：
  事件是"链式"的——玩家选择 → 显式指定下一环。
  不再需要全局扫描，只需要检查"上一环链下来的事件"。
  性能更好，因果更明确。
```

#### 核心借鉴 3：交错 Tick 与排队

HOI3 不是所有系统每帧都跑。不同系统按不同频率 tick：

```
HOI3 tick 频率:
  每日: 资源生产、外交关系、间谍
  每周: 科技研发进度
  每月: 人力增长、补给消耗
  每季度: 战略评估

我们的回合制适配:
  每回合: 时段推进、规则评估、同地点 NPC
  每 3 回合: 中活跃 NPC、相邻地点更新
  每 10 回合: 低活跃 NPC、全面状态同步
  跨天时: 资源消耗、红月倒计时、任务检查
  跨月时: 季节变更、月度事件
```

#### 核心借鉴 4：中断机制

HOI3 中，如果军队被攻击，AI 会中断当前计划去应对。我们也需要这个：

```typescript
class NpcTickManager {
  /** NPC 每回合的决策 */
  tick(npc: Npc, ctx: TickContext): NpcDecision {
    // 1. 中断检查——有没有必须立即响应的事情？
    //    优先级最高，不管 NPC 原来在做什么
    const interrupt = this.checkInterrupts(npc, ctx)
    if (interrupt) return interrupt

    // 2. 日常行为——按优先级选择
    return this.decideRoutine(npc, ctx)
  }

  private checkInterrupts(npc: Npc, ctx: TickContext): NpcDecision | null {
    // 被攻击 → 反击或逃跑
    if (ctx.isUnderAttack(npc)) {
      return { action: 'combat', ... }
    }
    // 发现重要事件 → 去查看
    if (ctx.hasNearbyEvent(npc)) {
      return { action: 'investigate', target: ctx.nearbyEvent }
    }
    // 有紧急需求
    if (npc.health < 20) {
      return { action: 'flee', ... }
    }
    return null
  }
}
```

#### HOI3 借鉴总结

| 借鉴点 | HOI3 做法 | 我们怎么做 | 好处 |
|--------|----------|-----------|------|
| **触发时机** | MTTH 概率 | 每回合算概率，平均 N 回合触发 | 有机感、不可预测 |
| **事件关系** | chain / fire_event | 选项显式指定后续事件 | 因果明确，性能好 |
| **作用域** | 省/国作用域 | Location 作用域 | 避免全局扫描 |
| **持久修正** | national spirit | Rule 系统绑定对象 | 灵活，解耦 |
| **Tick 频率** | 日/周/月/季分层 | 1/3/10/跨天分层 | 性能可控 |
| **AI 中断** | 紧急情况打断日常 | 先检查中断，再做日常 | NPC 反应真实 |

---

## 四、天气 × 季节 × 时间深度绑定

### 4.1 季节系统

季节由月份决定，影响天气概率、昼夜时长、时段效果。

```typescript
enum Season {
  春 = 'spring',
  夏 = 'summer',
  秋 = 'autumn',
  冬 = 'winter',
}

function getSeason(month: number): Season {
  if (month >= 3 && month <= 5) return Season.春
  if (month >= 6 && month <= 8) return Season.夏
  if (month >= 9 && month <= 11) return Season.秋
  return Season.冬
}
```

### 4.2 季节对时间系统的影响

| 属性 | 春 | 夏 | 秋 | 冬 |
|------|-----|-----|-----|-----|
| **月份** | 3-5 | 6-8 | 9-11 | 12-2 |
| **昼长** | 均衡 | 长（黎明早、夜晚短） | 均衡 | 短（黎明晚、夜晚长） |
| **气温** | 温和 | 炎热 | 凉爽 | 寒冷 |
| **天气倾向** | 多雨 | 晴朗/酷热 | 多变 | 寒潮/雪 |
| **农业状态** | 播种 | 生长 | 收获 | 休耕 |
| **时段效果** | 无特殊 | 正午可能酷热 | 傍晚更快降温 | 夜晚有寒冷惩罚 |

### 4.3 昼夜时长变化

不同季节的昼夜长度不同，影响每个时段的"感受"：

```typescript
/** 季节对时段的基础修正 */
const SEASON_TIME_MODIFIERS: Record<Season, Partial<Record<TimeBlock, string>>> = {
  [Season.夏]: {
    黎明: '天亮得很早，东边已经泛白了。',
    夜晚: '天黑得晚，西边还有最后一抹暗红。',
  },
  [Season.冬]: {
    黎明: '快七点了天还没亮透。',
    夜晚: '刚过五点天就全黑了。',
  },
}
```

### 4.4 天气 × 季节 权重矩阵

天气生成时，季节直接影响各天气的出现概率：

```typescript
const WEATHER_BY_SEASON: Record<Season, WeatherRule[]> = {
  [Season.春]: [
    { weather: '晴朗', weight: 20, minDuration: 1, maxDuration: 4 },
    { weather: '多云', weight: 25, minDuration: 1, maxDuration: 3 },
    { weather: '小雨', weight: 30, minDuration: 1, maxDuration: 5 },
    { weather: '大雨', weight: 15, minDuration: 1, maxDuration: 3 },
    { weather: '雾',   weight: 10, minDuration: 1, maxDuration: 2 },
  ],
  [Season.夏]: [
    { weather: '晴朗', weight: 35, minDuration: 2, maxDuration: 8 },  // 夏天晴很久
    { weather: '多云', weight: 20, minDuration: 1, maxDuration: 3 },
    { weather: '小雨', weight: 10, minDuration: 1, maxDuration: 2 },
    { weather: '暴雨', weight: 10, minDuration: 1, maxDuration: 2 },  // 夏季暴雨
    { weather: '酷热', weight: 25, minDuration: 2, maxDuration: 6 },  // 夏季特有
  ],
  [Season.秋]: [
    { weather: '晴朗', weight: 25, minDuration: 1, maxDuration: 5 },
    { weather: '多云', weight: 20, minDuration: 1, maxDuration: 3 },
    { weather: '小雨', weight: 20, minDuration: 1, maxDuration: 3 },
    { weather: '大雨', weight: 15, minDuration: 1, maxDuration: 3 },
    { weather: '雾',   weight: 20, minDuration: 1, maxDuration: 4 },  // 秋雾多
  ],
  [Season.冬]: [
    { weather: '晴朗', weight: 20, minDuration: 1, maxDuration: 3 },
    { weather: '多云', weight: 25, minDuration: 1, maxDuration: 4 },
    { weather: '阴天', weight: 20, minDuration: 1, maxDuration: 4 },
    { weather: '寒潮', weight: 25, minDuration: 2, maxDuration: 6 },  // 冬季特有
    { weather: '小雪', weight: 10, minDuration: 1, maxDuration: 3 },
  ],
}
```

### 4.5 时段 × 天气 交互效果

天气效果不是固定的，同一个天气在不同时段效果不同：

```typescript
/** 天气效果 = 天气基础效果 × 时段修正 */
function getWeatherEffects(weather: Weather, timeBlock: TimeBlock, season: Season): Rule[] {
  const baseEffects = WEATHER_EFFECTS[weather]

  // 时段修正：比如"酷热"在正午更严重，在夜晚消退
  const timeModifier = TIME_BLOCK_MODIFIERS[timeBlock]?.[weather]

  // 季节修正：夏季的"小雨"可能反而是凉快的
  const seasonModifier = SEASON_MODIFIERS[season]?.[weather]

  return applyModifiers(baseEffects, timeModifier, seasonModifier)
}
```

**交互示例：**

| 天气 | 时段 | 效果 |
|------|------|------|
| 酷热 | 正午 | 户外行动体力消耗 ×2，可能中暑 |
| 酷热 | 夜晚 | 效果减半，但仍然闷热 |
| 大雨 | 上午 | 户外行动体力消耗 ×1.5 |
| 大雨 | 夜晚 | 户外行动不可用（看不清路） |
| 寒潮 | 夜晚 | 无御寒装备时 HP -5/时段 |
| 寒潮 | 正午 | 效果减半，但仍需御寒 |
| 雾 | 黎明 | 能见度极低，探索范围 ×0.3 |
| 雾 | 正午 | 能见度一般，探索范围 ×0.7 |

### 4.6 天气变化规则

```
天气不能突变：

  晴朗 ─→ 多云 ─→ 阴天 ─→ 小雨 ─→ 大雨 ─→ 暴雨
    │                    │                    │
    └──→ 雾              └──→ 雾              └──→ 魔潮（特殊）
    
  酷热 ↔ 晴朗（夏季转换）
  寒潮 ↔ 阴天（冬季转换）
  
  不允许：晴朗 → 暴雨（跳过两级）
  不允许：酷热 → 寒潮（季节冲突）
```

---

## 五、NPC 分层 Tick 系统

### 4.1 NPC 活跃度分级

不是所有 NPC 每回合都执行完整 AI。按活跃度分三级：

```
层级 A: 高活跃（每回合执行）
  ├── 队伍成员（party 中的 NPC）
  ├── 同地点的 NPC（和玩家在同一 location）
  └── 有关联任务的 NPC

层级 B: 中活跃（每 N 回合执行一次）
  ├── 相邻地点的 NPC
  ├── 与玩家有过交互的 NPC（关系 > 0）
  └── 有进行中事件的 NPC

层级 C: 低活跃（每 M 回合执行一次，或事件触发时才动）
  ├── 远距离 NPC
  ├── 无关 NPC
  └── 待机状态 NPC
```

**配置示例：**

```typescript
interface NpcTickConfig {
  /** 层级 A：每回合都 tick */
  highActiveInterval: 1
  /** 层级 B：每 3 回合 tick 一次 */
  mediumActiveInterval: 3
  /** 层级 C：每 10 回合 tick 一次 */
  lowActiveInterval: 10

  /** 同屏最大 tick 数（防止一回合处理太多 NPC） */
  maxNpcsPerTick: 20
}
```

### 5.2 NPC 行为优先级

每个 NPC 每回合有一个"当前意图"，按优先级执行：

```
1. 生存行为（受伤时治疗、饥饿时找食物）→ 最高
2. 任务行为（如果有剧情任务指派）
3. 职业行为（猎人去打猎、商人在交易）
4. 社交行为（和附近 NPC 交互）
5. 移动行为（前往下一个地点）
6. 待机行为（什么也不做）
```

### 5.3 NPC 决策流程

```typescript
interface NpcDecision {
  action: string        // 行为类型：移动/工作/社交/休息/待机
  targetId?: number     // 目标对象ID（地点/NPC/物品）
  narrative: string     // 行为对应的叙事文本
  effects?: Effect[]    // 行为产生的效果
}

function decideNpcAction(npc: Npc, context: NpcContext): NpcDecision {
  // 1. 检查是否有紧急需求
  if (npc.isInjured) return { action: 'rest', narrative: `${npc.name}在养伤。` }

  // 2. 检查是否有指派任务
  if (npc.assignedQuest) return executeQuestAction(npc, context)

  // 3. 按职业执行默认行为
  switch (npc.occupation) {
    case 'hunter':  return hunt(npc, context)
    case 'merchant': return trade(npc, context)
    case 'farmer':  return farm(npc, context)
    case 'scholar': return research(npc, context)
    default:        return idle(npc, context)
  }
}

// 不同职业的默认行为
function hunt(npc: Npc, ctx: NpcContext): NpcDecision {
  // 30% 概率有收获，70% 空手而归
  const success = Math.random() < 0.3
  return {
    action: 'work',
    narrative: success
      ? `${npc.name}打到了一只野兔。`
      : `${npc.name}在林中转了一圈，没什么收获。`,
    effects: success ? [{ type: 'addFood', value: 2 }] : [],
  }
}
```

### 5.4 NPC 叙事合并

多个 NPC 的行动叙事不能简单罗列，需要合并和过滤：

```typescript
function mergeNpcNarratives(decisions: NpcDecision[]): string[] {
  // 1. 去重——同样的行为合并
  //    "格兰打到了一只野兔。格兰在林中转了一圈。"
  //    → "格兰外出打猎，收获了一只野兔。"

  // 2. 过滤——无趣的日常行为省略
  //    "路人甲在睡觉。路人乙在走路。"
  //    → 省略，除非玩家特别关注

  // 3. 按重要性排序——重要叙事在前
  //    战斗/事件 > 社交 > 资源变化 > 日常

  // 4. 长度控制——叙事文本不能太长
  //    最多展示 5 条 NPC 叙事，其余用"还有 X 个 NPC 做着日常事务"概括
}
```

---

## 六、性能设计

### 5.1 核心原则

```
1. 不处理看不见的东西
   - 不在玩家所在区域的 NPC 每 10 回合才 tick 一次
   - 不需要展示的叙事直接丢弃

2. 不重复计算
   - 规则系统有缓存：相同条件同一回合只评估一次
   - NPC 行为有缓存：同类型 NPC 共用行为模板

3. 延迟处理
   - 远处 NPC 的事件日志暂存，玩家到达时才生成叙事
   - 批量写库，不每条日志都 INSERT
```

### 5.2 NPC Tick 配额制

```typescript
class NpcTickManager {
  /** 每回合可用 tick 配额 */
  private readonly QUOTA_PER_TURN = {
    high: 10,   // 高活跃 NPC 最多 10 个
    medium: 15,  // 中活跃 NPC 最多 15 个
    low: 5,      // 低活跃 NPC 最多 5 个
  }

  getNpcsToTick(allNpcs: Npc[], context: TickContext): Npc[] {
    const { currentLocationId, turnCount } = context

    const high = allNpcs.filter(n =>
      n.locationId === currentLocationId || n.isInParty
    ).slice(0, this.QUOTA_PER_TURN.high)

    const medium = allNpcs.filter(n =>
      n.affection > 0 || n.hasActiveQuest
    ).slice(0, this.QUOTA_PER_TURN.medium)

    const low = allNpcs.filter(n =>
      turnCount % 10 === 0  // 每 10 回合全面 tick 一次
    ).slice(0, this.QUOTA_PER_TURN.low)

    return [...high, ...medium, ...low]
  }
}
```

### 5.3 事件检测优化

```typescript
class EventDetectionOptimizer {
  /** 事件模板索引 */
  private index: {
    byLocation: Map<number, EventTemplate[]>
    byCategory: Map<string, EventTemplate[]>
    byFlag: Map<string, EventTemplate[]>
  }

  /** 只在相关的模板中检测 */
  check(current: GameState): EventTemplate[] {
    const candidates = new Set<EventTemplate>()

    // 1. 通过地点索引
    for (const tpl of this.index.byLocation.get(current.locationId) ?? []) {
      candidates.add(tpl)
    }

    // 2. 通过 flag 索引
    for (const [flagName] of Object.entries(current.flags)) {
      for (const tpl of this.index.byFlag.get(flagName) ?? []) {
        candidates.add(tpl)
      }
    }

    // 3. 只评估候选模板
    return Array.from(candidates)
      .filter(tpl => this.evaluateCondition(tpl, current))
      .sort((a, b) => b.priority - a.priority)
  }
}
```

### 5.4 AI 叙事调用优化

AI 调用（DeepSeek API）是最大的性能瓶颈：

```typescript
class NarrativeOptimizer {
  /**
   * 不是每个 NPC 行为都调 AI。
   * AI 只负责：
   *   1. 主叙事（玩家行动结果 + 最重要的 1-2 个事件）
   *   2. 对话（玩家主动选择交谈）
   *   3. 特殊事件（首次触发的事件）
   *
   * NPC 日常行为用模板文本拼接，不调 AI。
   */
  shouldCallAi(context: NarrativeContext): boolean {
    // AI 调用条件：以下任一满足
    return (
      context.hasPlayerAction        // 玩家执行了主要行动
      || context.hasSpecialEvent     // 有特殊事件触发
      || context.isPlayerInitiated   // 玩家主动请求
    )
  }

  /**
   * AI 调用频率限制：
   * - 连续 3 个回合内不重复调 AI
   * - 如果只是资源变化（粮食-1、银币+5），不调 AI
   * - 用模板文本代替
   */
  private turnSinceLastAiCall: number = 0

  shouldThrottle(): boolean {
    return this.turnSinceLastAiCall < 3
  }
}
```

### 5.5 性能预算总结

| 操作 | 每回合上限 | 说明 |
|------|-----------|------|
| NPC tick | 30 个 | 高 10 + 中 15 + 低 5 |
| 规则评估 | 50 条 | 过滤不相关规则，命中即停 |
| 事件检测 | 20 个模板 | 通过索引预过滤 |
| AI 调用 | 0-1 次 | 非必须回合不调 |
| 数据库写入 | 按需批量 | 攒一批再写 |

---

## 七、时序图：一个完整回合（12 阶段）

```
时间线:

[Server]                                               [Client]
   │                                                      │
   ├── 0. TURN_INIT                                      │
   │   ├─ 回合计数 +1                                    │
   │   ├─ 清除临时状态                                   │
   │   └─ 准备叙事容器                                   │
   │                                                      │
   ├── 1. TIME_ADVANCE                                   │
   │   ├─ 时段推进 (玩家消耗)                             │
   │   ├─ 跨天检查 (粮食/红月/任务)                       │
   │   ├─ 时段效果 (黎明恢复/夜晚强制休息)                 │
   │   └─ 季节效果 (冬季寒冷/夏季酷热)                    │
   │                                                      │
   ├── 2. WORLD_ANNOUNCE                                 │
   │   ├─ 天气更新 (季节权重判定)                         │
   │   ├─ 天气切换叙事                                   │
   │   └─ 环境公告 (红月/远处消息)                        │
   │                                                      │
   ├── 推送状态 ────────────────────────────────────►    │
   │                                                      │
   │                                                ┌────┴────┐
   │                                                │ 显示状态  │
   │                                                │ + 叙事    │
   │                                                │ + 行动    │
   │                                                │ 等待选择  │
   │                                                └────┬────┘
   │                                                      │
   │  ◄────── send('action', {id: 3}) ────────────────────┤
   │                                                      │
   ├── 3. PLAYER_INPUT                                   │
   │   └─ (已收到消息)                                    │
   │                                                      │
   ├── 4. PLAYER_ACTION                                  │
   │   ├─ 校验可用性                                      │
   │   ├─ 扣除资源 (体力/银币)                            │
   │   └─ 执行效果 (移动/交易/社交/探索/建设/工作/休息)    │
   │                                                      │
   ├── 5. ACTION_RESULT                                  │
   │   └─ 行动即时反馈叙事                                │
   │                                                      │
   ├── 6. RULE_EVALUATE                                  │
   │   ├─ 收集相关对象 (地点/天气/季节/时段/物品/技能/NPC) │
   │   ├─ RuleEngine.evaluateAll()                       │
   │   └─ modifiers → 修正数值 / narrativeAppend         │
   │                                                      │
   ├── 7. NPC_PHASE                                      │
   │   ├─ 7a. NPC_REACTION (同地点NPC对玩家行动的反应)     │
   │   ├─ 7b. NPC_AUTONOMOUS (分层tick, 按职业决策)       │
   │   └─ 收集NPC叙事碎片                                 │
   │                                                      │
   ├── 8. WORLD_TICK                                     │
   │   ├─ 跨天后继 (粮食消耗/任务截止)                    │
   │   ├─ 资源变化 (HP/SP/MP恢复或衰减)                   │
   │   ├─ 事件检测 (按索引预过滤)                         │
   │   └─ 势力状态 (神殿/暮河镇/苇水村)                   │
   │                                                      │
   ├── 9. NARRATIVE_SYNC                                 │
   │   ├─ 合并8个阶段的叙事碎片                           │
   │   ├─ 去重/过滤/排序/长度控制                        │
   │   └─ 输出完整叙事文本                               │
   │                                                      │
   ├── 10. AI_GENERATE (按需)                             │
   │   ├─ 重大行动/首次事件/对话 → 调DeepSeek             │
   │   ├─ 日常行为 → 模板拼接，不调AI                    │
   │   └─ 频率控制: 连续3回合内不重复调                  │
   │                                                      │
   ├── 11. TURN_END                                      │
   │   ├─ 死亡/胜利检测                                  │
   │   ├─ Colyseus状态推送                               │
   │   ├─ 存档检查                                       │
   │   └─ 临时清理                                       │
   │                                                      │
   ├── 推送新状态 ──────────────────────────────────►    │
   │                                                ┌────┴────┐
   │                                                │ 渲染更新  │
   │                                                │ 回到循环  │
   │                                                └─────────┘
```

---

## 八、代码结构规划

```
apps/api/src/engine/
├── engine.module.ts              # 引擎模块
├── turn.manager.ts               # 回合管理器（编排12阶段）
│
├── phases/
│   ├── 0-turn-init.phase.ts      # TURN_INIT
│   ├── 1-time-advance.phase.ts   # TIME_ADVANCE (日历/时段/季节)
│   ├── 2-world-announce.phase.ts # WORLD_ANNOUNCE (天气/公告)
│   ├── 3-player-input.phase.ts   # PLAYER_INPUT
│   ├── 4-player-action.phase.ts  # PLAYER_ACTION
│   ├── 5-action-result.phase.ts  # ACTION_RESULT
│   ├── 6-rule-evaluate.phase.ts  # RULE_EVALUATE
│   ├── 7-npc-phase.phase.ts      # NPC_PHASE (反应+自主)
│   ├── 8-world-tick.phase.ts     # WORLD_TICK (资源/事件/势力)
│   ├── 9-narrative-sync.phase.ts # NARRATIVE_SYNC
│   ├── 10-ai-generate.phase.ts   # AI_GENERATE
│   └── 11-turn-end.phase.ts      # TURN_END
│
├── causality/                    # ← 因果链系统
│   ├── flag.system.ts            # Flag 传递系统
│   ├── delayed-event.queue.ts    # 延迟事件队列
│   ├── npc-memory.ts             # NPC 记忆系统
│   └── causality-narrative.ts    # 因果链叙事呈现
│
├── time/
│   ├── calendar.ts               # 日历系统（年月日）
│   ├── time-block.ts             # 时段定义 (7时段/天)
│   └── season.ts                 # 季节系统 (四季 + 效果)
│
├── weather/
│   ├── weather-system.ts         # 天气系统 (生成/切换)
│   ├── weather-seasons.ts        # 天气×季节权重矩阵
│   └── weather-rules.ts          # 天气规则绑定
│
├── npc/
│   ├── npc-tick.manager.ts       # NPC 活跃度分层管理
│   ├── npc-behaviors.ts          # NPC 行为决策（职业模板）
│   └── npc-narrative.ts          # NPC 叙事合并策略
│
└── performance/
    ├── tick-budget.ts            # 每回合配额管理
    ├── event-optimizer.ts        # 事件检测索引优化
    └── narrative-optimizer.ts    # AI 调用频率控制
```
