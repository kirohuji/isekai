# 任务系统设计

> 任务目标、阶段推进、奖励、与事件/因果链的集成

---

## 一、核心概念

### 任务 vs 事件

```
事件 = "发生了某个事，你做个选择"
任务 = "你要达成某个目标，这是进度"

区别:
  ┌─ 事件是一次性的选择点
  ├─ 任务是持续性的目标追踪
  │
  └─ 关系和:
      事件 可以 → 触发 任务
      任务 可以 → 触发 事件
      事件 可以 → 推进 任务进度
```

**示例：**

```
事件"路边发现" → 捡到旧护符
    │
    ▼
任务"护符的秘密"（自动激活）
    ├── 阶段1: 调查护符的来历 (找人问问)
    │     ├── 和沈清岚交谈 → 她说"这像是边境的东西"
    │     └── 去暮河镇打听 → 有人说"这是亚人的东西"
    │
    ├── 阶段2: 找到护符的出处
    │     └── 去亚人聚落 → 老祭司认出了护符
    │
    └── 阶段3: 护符的归宿
          ├── 归还给亚人 → 声望+20, 获得情报
          └── 自己保留 → 获得一个永久buff
```

### 任务在回合阶段中的位置

```
阶段 8: WORLD_TICK
  ├── 事件检测
  └── 任务检查
        ├── 是否有新任务满足激活条件？
        ├── 活跃任务是否有阶段完成了？
        └── 是否有任务超时/失败？
```

---

## 二、任务定义

### 2.1 核心数据结构

```typescript
interface QuestDef {
  id: string
  name: string
  description: string

  /** 任务类别 */
  category: QuestCategory

  /** 激活条件（满足后自动接取） */
  activationCondition?: Condition

  /** 任务阶段列表 */
  stages: QuestStage[]

  /** 完成奖励 */
  rewards?: QuestReward[]

  /** 失败条件（可选） */
  failureCondition?: Condition

  /** 超时（回合数，可选） */
  timeoutTurns?: number

  /** 是否可放弃 */
  isAbandonable: boolean

  /** 是否主线 */
  isMainQuest: boolean
}

enum QuestCategory {
  main = 'main',         // 主线
  side = 'side',         // 支线
  character = 'character', // 角色个人任务
  settlement = 'settlement', // 建设任务
  exploration = 'exploration', // 探索任务
  daily = 'daily',       // 日常
}
```

### 2.2 任务阶段

```typescript
interface QuestStage {
  id: number
  name: string
  description: string

  /** 完成条件（满足任一即可） */
  completionConditions: StageCondition[]

  /** 进入此阶段时触发的事件 */
  onEnter?: EventTrigger

  /** 完成此阶段时触发的事件 */
  onComplete?: EventTrigger

  /** 此阶段的额外叙事（每回合展示在任务追踪中） */
  narrative?: string
}

interface StageCondition {
  type: 'reachLocation' | 'talkToNpc' | 'gatherItem' | 'setFlag'
      | 'killEnemy' | 'buildFacility' | 'gainReputation'
      | 'gainAffection' | 'surviveTurns' | 'custom'

  params: Record<string, any>
  /** 当前进度/目标值（用于展示"3/5"） */
  current?: number
  target: number
}
```

### 2.3 完整示例

```typescript
const questOldAmulet: QuestDef = {
  id: 'old_amulet_mystery',
  name: '护符的秘密',
  description: '你在路边挖到一块旧护符。它看起来不像王国的风格。',
  category: 'exploration',
  isMainQuest: false,
  isAbandonable: true,

  // 自动激活——捡到护符时
  activationCondition: new FlagCondition('found_old_amulet', '==', 'true'),

  stages: [
    {
      id: 1,
      name: '打听消息',
      description: '找人问问这块护符的来历。',
      completionConditions: [
        { type: 'talkToNpc', params: { npcId: 1 }, target: 1 },     // 问了沈清岚
        { type: 'talkToNpc', params: { npcId: 7 }, target: 1 },     // 或者在暮河镇打听了
      ],
      onComplete: {
        type: 'setFlag',
        params: { name: 'amulet_investigated', value: 'true' },
      },
      narrative: '护符上的纹路你不认识。也许有人认识。',
    },
    {
      id: 2,
      name: '追寻源头',
      description: '据说这护符和边境的亚人有关。',
      completionConditions: [
        { type: 'reachLocation', params: { locationId: 11 }, target: 1 }, // 到达亚人聚落
      ],
      onEnter: {
        type: 'chain',
        params: { eventId: 201 },  // 触发亚人老祭司认出护符的事件
      },
      narrative: '线索指向东南方向的亚人聚落。',
    },
    {
      id: 3,
      name: '护符的归宿',
      description: '老祭司说这护符属于一个失踪的亚人。',
      completionConditions: [
        { type: 'setFlag', params: { name: 'amulet_returned', value: 'true' }, target: 1 },
        // 或者
        { type: 'setFlag', params: { name: 'amulet_kept', value: 'true' }, target: 1 },
      ],
      rewards: [
        { type: 'reputation', faction: '亚人网络', value: 20 },
        { type: 'item', itemId: '亚人情报', quantity: 1 },
      ],
      narrative: '选择——归还还是保留？',
    },
  ],

  rewards: [
    { type: 'experience', skillId: 'survival', value: 50 },
    { type: 'silver', value: 15 },
  ],

  timeoutTurns: 100,
}
```

### 2.4 任务奖励

```typescript
type QuestReward =
  | { type: 'silver'; value: number }
  | { type: 'item'; itemId: string; quantity: number }
  | { type: 'reputation'; faction: string; value: number }
  | { type: 'experience'; skillId: string; value: number }
  | { type: 'unlockSkill'; skillId: string }
  | { type: 'unlockLocation'; locationId: number }
  | { type: 'setFlag'; name: string; value: string }
```

---

## 三、任务管理器

### 3.1 任务状态

```typescript
interface QuestState {
  questId: string
  status: 'inactive' | 'active' | 'completed' | 'failed' | 'abandoned'
  currentStage: number
  stageProgress: Record<string, number>  // conditionKey → currentValue

  /** 接取时的回合数 */
  acceptedAtTurn: number
  /** 接取时的日期 */
  acceptedAtDate: GameDate
  /** 完成时的日期 */
  completedAtDate?: GameDate
}
```

### 3.2 管理流程

```typescript
class QuestManager {
  private quests: Map<string, QuestState> = new Map()

  /** 每回合调用 */
  tick(ctx: TurnContext): void {
    // 1. 检查未激活的任务
    for (const [id, def] of QUEST_REGISTRY) {
      if (this.quests.has(id)) continue
      if (def.activationCondition?.evaluate(ctx)) {
        this.activateQuest(id, ctx)
      }
    }

    // 2. 检查活跃任务的进度
    for (const [id, state] of this.quests) {
      if (state.status !== 'active') continue

      const def = QUEST_REGISTRY.get(id)!
      const currentStage = def.stages[state.currentStage]

      // 检查完成条件
      for (const cond of currentStage.completionConditions) {
        const progress = this.evaluateStageCondition(cond, ctx)
        state.stageProgress[this.conditionKey(cond)] = progress

        if (progress >= cond.target) {
          this.completeStage(id, ctx)
          break
        }
      }

      // 检查失败条件
      if (def.failureCondition?.evaluate(ctx)) {
        this.failQuest(id, ctx)
      }

      // 检查超时
      if (def.timeoutTurns && ctx.turn - state.acceptedAtTurn >= def.timeoutTurns) {
        this.failQuest(id, ctx)
      }
    }
  }

  private activateQuest(id: string, ctx: TurnContext): void {
    const def = QUEST_REGISTRY.get(id)!
    this.quests.set(id, {
      questId: id,
      status: 'active',
      currentStage: 0,
      stageProgress: {},
      acceptedAtTurn: ctx.turn,
      acceptedAtDate: { ...ctx.date },
    })
    ctx.addNarrative(`📜 新任务：${def.name}`)
  }

  private completeStage(id: string, ctx: TurnContext): void {
    const state = this.quests.get(id)!
    const def = QUEST_REGISTRY.get(id)!
    const stage = def.stages[state.currentStage]

    // 触发完成事件
    if (stage.onComplete) this.triggerEvent(stage.onComplete, ctx)

    // 推进到下一阶段
    state.currentStage++

    // 如果是最后一阶段
    if (state.currentStage >= def.stages.length) {
      this.completeQuest(id, ctx)
    } else {
      // 进入下一阶段
      const nextStage = def.stages[state.currentStage]
      ctx.addNarrative(`【${def.name}】阶段更新：${nextStage.name}`)
      if (nextStage.onEnter) this.triggerEvent(nextStage.onEnter, ctx)
    }
  }

  private completeQuest(id: string, ctx: TurnContext): void {
    const state = this.quests.get(id)!
    const def = QUEST_REGISTRY.get(id)!

    state.status = 'completed'
    state.completedAtDate = { ...ctx.date }

    // 发放奖励
    for (const reward of def.rewards ?? []) {
      this.applyReward(reward, ctx)
    }

    ctx.addNarrative(`✅ 任务完成：${def.name}`)
  }

  private failQuest(id: string, ctx: TurnContext): void {
    const state = this.quests.get(id)!
    state.status = 'failed'
    ctx.addNarrative(`❌ 任务失败：${id}`)
  }
}
```

### 3.3 进度评估

```typescript
class QuestManager {
  /** 评估一个阶段条件的当前进度 */
  private evaluateStageCondition(cond: StageCondition, ctx: TurnContext): number {
    switch (cond.type) {
      case 'reachLocation':
        return ctx.player.locationId === cond.params.locationId ? 1 : 0

      case 'talkToNpc':
        return ctx.flags.get(`talked_to_npc_${cond.params.npcId}`) === 'true' ? 1 : 0

      case 'gatherItem':
        return ctx.player.inventory
          .filter(i => i.itemId === cond.params.itemId)
          .reduce((sum, i) => sum + i.quantity, 0)

      case 'setFlag':
        return ctx.flags.get(cond.params.name) === cond.params.value ? 1 : 0

      case 'gainReputation':
        return ctx.reputations.get(cond.params.faction) ?? 0

      case 'surviveTurns':
        return ctx.turn - this.quests.get(cond.params.questId)!.acceptedAtTurn

      default:
        return 0
    }
  }
}
```

---

## 四、任务示例

### 4.1 建设任务——灰丘发展

```typescript
const questGrayHill: QuestDef = {
  id: 'gray_hill_development',
  name: '灰丘奠基',
  description: '把灰丘从一片废弃高地变成真正的据点。',
  category: 'settlement',
  isMainQuest: true,
  isAbandonable: false,

  activationCondition: new FlagCondition('arrived_at_gray_hill', '==', 'true'),

  stages: [
    {
      id: 1,
      name: '安顿下来',
      description: '先有个能住人的地方。修缮储藏坑，修补木屋屋顶。',
      completionConditions: [
        { type: 'setFlag', params: { name: 'storage_pit_repaired' }, target: 1 },
        { type: 'setFlag', params: { name: 'cabin_roof_fixed' }, target: 1 },
      ],
      narrative: '木屋漏风，储藏坑塌了。有很多事要做。',
    },
    {
      id: 2,
      name: '自给自足',
      description: '建立稳定的食物来源。',
      completionConditions: [
        { type: 'setFlag', params: { name: 'farmland_planted' }, target: 1 },
        { type: 'gatherItem', params: { itemId: 'food' }, target: 20 },
      ],
      narrative: '不能总靠苇水村接济。',
    },
    {
      id: 3,
      name: '防御设施',
      description: '灰丘需要基本的防御。',
      completionConditions: [
        { type: 'setFlag', params: { name: 'simple_fence_built' }, target: 1 },
        { type: 'setFlag', params: { name: 'watchtower_built' }, target: 1 },
      ],
      narrative: '魔潮越来越近了。',
    },
  ],

  rewards: [
    { type: 'reputation', faction: '苇水村', value: 30 },
    { type: 'setFlag', name: 'gray_hill_settlement', value: 'true' },
  ],
}
```

### 4.2 角色任务——沈清岚

```typescript
const questShenQinglan: QuestDef = {
  id: 'shen_qinglan_trust',
  name: '沈清岚的信任',
  description: '她有一份名单。但她还没决定要不要完全信任你。',
  category: 'character',
  isMainQuest: false,
  isAbandonable: false,

  activationCondition: new CompositeCondition('and', [
    new FlagCondition('met_shen_qinglan', '==', 'true'),
    new RelationshipCondition('沈清岚', 'affection', '>=', 20),
  ]),

  stages: [
    {
      id: 1,
      name: '了解她的过去',
      description: '她在神殿的档案馆工作过，知道很多事。',
      completionConditions: [
        { type: 'talkToNpc', params: { npcId: 1, topic: '神殿经历' }, target: 1 },
      ],
    },
    {
      id: 2,
      name: '名单',
      description: '她掌握着一份被召唤者的名单。问她。',
      completionConditions: [
        { type: 'setFlag', params: { name: 'got_list_from_shen' }, target: 1 },
      ],
      onComplete: {
        type: 'chain',
        params: { eventId: 301 },  // 触发"名单上的名字"事件
      },
    },
  ],

  rewards: [
    { type: 'item', itemId: '被召唤者名单_副本', quantity: 1 },
    { type: 'setFlag', name: 'shen_qinglan_fully_trusts', value: 'true' },
  ],
}
```

### 4.3 生存任务——粮食危机

```typescript
const questFoodCrisis: QuestDef = {
  id: 'wei_shui_food_crisis',
  name: '苇水村的粮食',
  description: '苇水村的粮食只剩十余天了。他们帮过你。',
  category: 'side',
  isMainQuest: false,
  isAbandonable: true,

  activationCondition: new CompositeCondition('and', [
    new FlagCondition('arrived_at_wei_shui', '==', 'true'),
    new ReputationCondition('苇水村', '>=', 5),
  ]),

  timeoutTurns: 30,  // 30回合内要解决

  stages: [
    {
      id: 1,
      name: '评估情况',
      description: '先搞清楚苇水村缺多少粮食。',
      completionConditions: [
        { type: 'talkToNpc', params: { npcId: 8 }, target: 1 },  // 和村长奥森谈
      ],
    },
    {
      id: 2,
      name: '筹集粮食',
      description: '需要 30 单位粮食。',
      completionConditions: [
        { type: 'gatherItem', params: { itemId: 'food' }, target: 30 },
      ],
      narrative: '可以通过购买、采集、打猎或向暮河镇赊账。',
    },
  ],

  rewards: [
    { type: 'reputation', faction: '苇水村', value: 40 },
    { type: 'reputation', faction: '亚人网络', value: 10 },
    { type: 'setFlag', name: 'wei_shui_crisis_solved', value: 'true' },
  ],

  failureCondition: new FlagCondition('wei_shui_crisis_solved', '==', 'false'),
  // ↑ 超时自动失败
}
```

---

## 五、任务与事件/因果链的集成

### 5.1 事件 → 任务

```
事件"捡到护符" → 任务"护符的秘密"自动激活
事件"沈清岚坦白" → 任务"沈清岚的信任"进入下一阶段
事件"魔潮逼近" → 任务"灰丘防御"紧迫性提升（超时倒计时减半）
```

### 5.2 任务 → 事件

```
任务"灰丘奠基"完成阶段1 → 触发事件"灰丘有了第一间像样的屋子"
任务"粮食危机"超时 → 触发事件"苇水村开始饿死人了"
任务"护符的秘密"完成 → 触发事件"亚人老祭司告诉你一个秘密"
```

### 5.3 任务 → 因果链

```
任务"粮食危机" → 玩家选择去暮河镇买粮
  → 触发因果链:
      在暮河镇大量买粮 → 周启明察觉（警觉度+1）
      → 延迟 10 回合: 周启明开始调查你
      → 如果此时你在暮河镇还有未完成的任务 → 难度增加
```

### 5.4 集成实现

```typescript
// 任务完成时触发事件
interface QuestDef {
  // ...
  /** 完成时触发的事件列表 */
  onCompleteEvents?: Array<{ eventId: number; delay?: number }>
  /** 失败时触发的事件列表 */
  onFailEvents?: Array<{ eventId: number; delay?: number }>
}

// 事件系统中引用任务
interface EventEffect {
  // ...
  | { type: 'startQuest'; questId: string }
  | { type: 'advanceQuest'; questId: string }
  | { type: 'failQuest'; questId: string }
}

// 任务进度更新事件系统
class QuestManager {
  completeStage(id: string, ctx: TurnContext): void {
    // ... 完成阶段逻辑

    // 触发链式事件
    for const chain of def.onCompleteEvents ?? [] {
      ctx.eventEngine.fireEvent(chain.eventId, chain.delay)
    }
  }
}
```

---

## 六、代码结构规划

```
apps/api/src/engine/quests/
├── quest.types.ts              # 任务核心类型
├── quest.registry.ts           # 所有任务定义注册
├── quest-manager.ts            # 任务管理器（激活/推进/完成/失败）
├── quest-progress.ts           # 进度评估
├── quest-rewards.ts            # 奖励发放
└── quest-examples/             # 示例任务数据
    ├── gray-hill-dev.ts        # 灰丘建设
    ├── shen-qinglan.ts         # 沈清岚信任
    └── wei-shui-crisis.ts      # 苇水村粮食
```

### 任务在引擎中的位置

```
apps/api/src/engine/
├── turn.manager.ts             # 回合管理器
├── phases/
│   └── 8-world-tick.phase.ts   # ← 事件检测 + 任务检查
├── events/
│   └── event-engine.ts         # 事件引擎
├── quests/
│   └── quest-manager.ts        # 任务管理器
└── causality/
    ├── flag.system.ts          # Flag 系统（事件和任务共用）
    └── delayed-event.queue.ts  # 延迟事件（事件链使用）
```
