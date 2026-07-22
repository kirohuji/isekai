# 事件系统设计

> 事件触发、选择、链式因果、与回合系统的集成

---

## 一、核心概念

### 事件是什么

事件 = "发生了某件事，玩家需要做出选择"

```
[触发] → [展示叙事 + 选项] → [玩家选择] → [执行结果 + 链式后续]
```

### 事件和行动的区别

| | 行动 (Action) | 事件 (Event) |
|--|-------------|-------------|
| 来源 | 玩家主动选 | 系统触发 |
| 频率 | 每回合必选一个 | 不一定每回合都有 |
| 选择 | 从行动列表选 | 从事件选项选 |
| 后果 | 常规资源变化 | 通常影响剧情/flag/关系 |
| 出现位置 | 行动面板 | 叙事中插入，特殊展示 |

**关系和优先级：**

```
回合开始
  ├── 事件系统检查是否有事件触发
  │     ├── 有 → 先展示事件，再展示行动列表
  │     └── 无 → 正常展示行动列表
  │
  └── 如果事件和行动冲突 → 事件优先
      （事件叙事中插入"你正要xxx，突然……"）
```

### 事件在回合阶段中的位置

```
阶段 2: WORLD_ANNOUNCE — 环境类事件（天气突变、远处消息）
   ...
阶段 5: ACTION_RESULT — 玩家行动直接触发的事件（踩到陷阱、发现东西）
   ...
阶段 6: RULE_EVALUATE — 规则触发的事件
   ...
阶段 8: WORLD_TICK — 事件系统检测 → 触发事件
  │
  ▼
事件触发后：如果事件需要玩家选择
  → 事件选项并入下一回合的展示
  → 玩家选择后，结果在当前回合的阶段 4-8 处理
```

---

## 二、事件模板

### 2.1 事件定义

```typescript
interface EventTemplate {
  id: number
  name: string
  /** 事件类别 */
  category: EventCategory

  /** 触发条件 */
  trigger: EventTrigger

  /** 叙事模板（支持 {param} 占位符） */
  narrativeTemplate: string

  /** 叙事参数填充器 */
  narrativeParams?: NarrativeParam[]

  /** 选项列表 */
  choices: EventChoice[]

  /** 冷却（触发后多少回合不再触发） */
  cooldownTurns: number

  /** 是否可重复触发 */
  isRepeatable: boolean

  /** 优先级（同时触发多个事件时取最高优先级的） */
  priority: number
}

enum EventCategory {
  exploration = 'exploration',  // 探索
  social = 'social',            // 社交
  resource = 'resource',        // 资源
  survival = 'survival',        // 生存
  combat = 'combat',            // 战斗
  romance = 'romance',          // 感情
  plot = 'plot',                // 剧情
  daily = 'daily',              // 日常
}
```

### 2.2 触发条件

```typescript
interface EventTrigger {
  /** 触发方式 */
  type: 'condition' | 'mttH' | 'chain' | 'manual'

  /** 方式1: 条件触发——条件满足即触发 */
  conditions?: EventCondition[]

  /** 方式2: MTTH 概率触发 */
  mttH?: MttHConfig

  /** 方式3: 链式触发——由另一个事件的选项触发 */
  chainFrom?: number[]  // 哪些事件可以链到这个事件

  /** 方式4: 手动触发——由代码/剧情直接调用 */
}

interface EventCondition {
  type: 'location' | 'timeBlock' | 'season' | 'flag' | 'skill'
      | 'resource' | 'relationship' | 'reputation' | 'random'
  // 每个 type 对应的参数
  params: Record<string, any>
}

interface MttHConfig {
  baseTurns: number
  modifiers?: MttHModifier[]
  /** 最短触发间隔（防止连续触发） */
  minTurnsSinceLast: number
}
```

**触发示例：**

```typescript
// T-001 路边发现
const event001: EventTemplate = {
  id: 1,
  name: '路边发现',
  category: 'exploration',
  trigger: {
    type: 'mttH',
    mttH: {
      baseTurns: 15,
      modifiers: [
        { factor: 0.7, condition: { type: 'skill', params: { skillId: 'survival', minLevel: 2 } } },
      ],
      minTurnsSinceLast: 5,
    },
    conditions: [
      { type: 'location', params: { tags: ['wild', 'forest'] } },
      { type: 'timeBlock', params: { blocks: ['上午', '下午'] } },
    ],
  },
  // ...
}

// T-010 粮食见底
const event010: EventTemplate = {
  id: 10,
  name: '粮食见底',
  category: 'survival',
  trigger: {
    type: 'condition',
    conditions: [
      { type: 'resource', params: { resource: 'foodDays', operator: '<=', value: 3 } },
    ],
  },
  // ...
}
```

### 2.3 叙事参数填充

事件叙事不是固定的，由**参数填充器**动态生成：

```typescript
interface NarrativeParam {
  key: string           // {location}, {weather}, {target_desc}
  source: 'context' | 'random' | 'custom'
  /** 从上下文获取 */
  contextKey?: string
  /** 随机从列表中选 */
  randomPool?: string[]
  /** 自定义函数 */
  resolver?: (ctx: EventContext) => string
}

// T-001 的参数填充
const params001: NarrativeParam[] = [
  { key: 'location', source: 'context', contextKey: 'currentLocationName' },
  { key: 'time_desc', source: 'context', contextKey: 'timeBlockDescription' },
  { key: 'weather', source: 'context', contextKey: 'weatherName' },
  { key: 'target_desc', source: 'random',
    randomPool: [
      '一个穿着斗篷的人影蹲在路边',
      '一只死去的动物，腹部有奇怪的伤口',
      '一个被遗弃的背囊，旁边散落着银币',
      '一块刻着符号的石板，半埋在土里',
    ]
  },
  { key: 'clue', source: 'random',
    randomPool: [
      '那人袖口绣着神殿的纹章',
      '伤口边缘有烧焦的痕迹',
      '背囊里有一封没写完的信',
      '石板上的符号和红月记载的描述一致',
    ]
  },
]
```

### 2.4 选项与结果

```typescript
interface EventChoice {
  label: string
  description?: string

  /** 选择条件（不满足时灰色显示） */
  condition?: EventCondition | Condition

  /** 技能检定（可选——成功/失败不同结果） */
  skillCheck?: SkillCheck

  /** 执行效果 */
  effects: EventEffect[]

  /** 后续链式事件 */
  chain?: ChainLink[]
}

interface SkillCheck {
  skillId: string
  dc: number                     // 难度等级
  successEffects: EventEffect[]  // 成功时额外效果
  failureEffects: EventEffect[]  // 失败时额外效果
  successNarrative: string
  failureNarrative: string
}

type EventEffect =
  | { type: 'modifier'; target: string; operation: 'add' | 'multiply' | 'set'; value: number }
  | { type: 'setFlag'; name: string; value: string }
  | { type: 'addMemory'; npcId: number; impression: number; narrative: string }
  | { type: 'narrative'; text: string }
  | { type: 'triggerEvent'; eventId: number; delay?: number }
  | { type: 'startQuest'; questId: string }
  | { type: 'advanceQuest'; questId: string; stage: number }
  | { type: 'addItem'; itemId: string; quantity: number }
  | { type: 'removeItem'; itemId: string; quantity: number }
```

**完整示例——T-001 路边发现：**

```typescript
const event001: EventTemplate = {
  id: 1,
  name: '路边发现',
  category: 'exploration',
  trigger: {
    type: 'mttH',
    mttH: { baseTurns: 15, minTurnsSinceLast: 5 },
    conditions: [
      { type: 'location', params: { tags: ['wild', 'forest'] } },
    ],
  },
  narrativeTemplate: '你走在{location}的路上。脚下的泥地被什么东西硌了一下。',
  narrativeParams: [
    { key: 'location', source: 'context', contextKey: 'currentLocationName' },
  ],
  cooldownTurns: 10,
  isRepeatable: true,
  priority: 3,
  choices: [
    {
      label: '挖开看看',
      effects: [
        { type: 'narrative', text: '你蹲下来拨开泥土……' },
      ],
      skillCheck: {
        skillId: 'survival',
        dc: 8,
        successEffects: [
          { type: 'narrative', text: '土里埋着几枚铜币和一块……石头？不，是一块旧护符。' },
          { type: 'addItem', itemId: 'old_amulet', quantity: 1 },
          { type: 'setFlag', name: 'found_old_amulet', value: 'true' },
        ],
        successNarrative: '你的野外经验告诉你这块泥土被动过。',
        failureEffects: [
          { type: 'narrative', text: '你挖了半天，只弄得一手泥。什么也没有。' },
        ],
        failureNarrative: '泥巴下面还是泥巴。',
      },
    },
    {
      label: '不管它，继续赶路',
      effects: [
        { type: 'narrative', text: '你迈过那块凸起，继续走了。' },
      ],
    },
  ],
}
```

---

## 三、事件检测引擎

### 3.1 检测流程

```
每回合阶段 8 (WORLD_TICK) 时：

EventEngine.check(ctx)
  │
  ├── 1. 收集候选事件
  │    ├── 所有 trigger.type === 'condition' 且条件满足的
  │    ├── 所有 trigger.type === 'mttH' 且概率命中的
  │    ├── 所有 trigger.type === 'chain' 且被链式触发的
  │    └── 跳过冷却中的、已触发的不可重复事件
  │
  ├── 2. 按优先级排序，取最高者
  │
  ├── 3. 填充叙事参数 → 生成事件文本
  │
  ├── 4. 如果是"无需选择"的事件 → 直接执行效果
  │
  ├── 5. 如果是"需要选择"的事件 →
  │    ├── 标记为"待处理事件"
  │    ├── 下一轮展示给玩家
  │    └── 玩家选择后执行对应效果 + chain
  │
  └── 6. 记录触发到 event_log
```

### 3.2 多个事件同时触发时的处理

```
如果多个事件同时满足条件，只触发优先级最高的一个：

  事件 A (priority=8): 剧情事件 🏆 选中
  事件 B (priority=5): 社交事件 ❌ 跳过
  事件 C (priority=3): 日常事件 ❌ 跳过

同一优先级 → 按 MTTH 值排序（MTTH 越小越优先）
```

### 3.3 事件冷却管理

```typescript
class EventCooldownManager {
  private cooldowns: Map<number, number> = {}  // eventId → remaining turns

  /** 触发事件时设置冷却 */
  setCooldown(eventId: number, turns: number): void {
    this.cooldowns[eventId] = turns
  }

  /** 每回合调用——减少冷却 */
  tick(): void {
    for (const id of Object.keys(this.cooldowns)) {
      this.cooldowns[Number(id)]--
      if (this.cooldowns[Number(id)] <= 0) {
        delete this.cooldowns[Number(id)]
      }
    }
  }

  /** 检查是否在冷却中 */
  isOnCooldown(eventId: number): boolean {
    return this.cooldowns[eventId] !== undefined && this.cooldowns[eventId] > 0
  }
}
```

### 3.4 事件在回合展示中的位置

```
当事件需要玩家选择时，它在界面上出现在叙事和行动列表之间：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 叙事文本
（上一回合的结果）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ 事件：路边发现
你走在路上，脚下的泥地被什么东西硌了一下。

A. 挖开看看
B. 不管它，继续赶路

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 可选行动
1. 【休息】...
2. 【移动】...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
你的选择（输入数字或字母）：
```

---

## 四、事件链（因果链集成）

事件链已经在 `time-system.md §3.9` 中以 HOI3 风格设计过了。这里给出事件系统侧的完整集成：

### 4.1 链式触发流程

```
事件 A: 玩家帮助了受伤的亚人
  └── choice: "帮他包扎"
        ├── effects: [medicine -1, flag 'helped_亚人' = true]
        └── chain: [{ eventId: 102, delay: { type: 'mttH', baseTurns: 5 } }]
              │
              ▼ 5-10 回合后
         事件 102: 亚人网络联络人接触
              │
              ├── 检测: flag 'helped_亚人' === true? ✓
              ├── 执行: narrative + 选项
              ├── effects: [声望+10, flag 'contacted_亚人网络' = true]
              └── chain: [{ eventId: 103, delay: { type: 'mttH', baseTurns: 15 } }]
                    │
                    ▼ 15-25 回合后
               事件 103: 亚人少年康复来访
```

### 4.2 ChainLink 数据结构

```typescript
interface ChainLink {
  eventId: number
  delay: {
    type: 'fixed' | 'mttH'
    turns?: number       // fixed 时
    baseTurns?: number   // mttH 时
  }
  /** 额外条件（除事件自身条件外，可加附加条件） */
  extraCondition?: Condition
}
```

### 4.3 链式事件的注册机制

```typescript
class EventChainRegistry {
  /** 被链式触发的事件不会全局扫描，而是直接注册到待触发列表 */
  private pendingChains: PendingChain[] = []

  /** 当选项选择 chain 时调用 */
  registerChain(link: ChainLink, ctx: EventContext): void {
    this.pendingChains.push({
      eventId: link.eventId,
      remainingTurns: link.delay.type === 'fixed'
        ? link.delay.turns!
        : this.rollMttH(link.delay.baseTurns!),
      extraCondition: link.extraCondition,
      sourceTurn: ctx.currentTurn,
    })
  }

  /** 每回合检查有哪些链式事件到期 */
  getReadyChains(ctx: EventContext): number[] {
    const ready: number[] = []

    for (const chain of this.pendingChains) {
      chain.remainingTurns--
      if (chain.remainingTurns <= 0) {
        if (!chain.extraCondition || chain.extraCondition.evaluate(ctx)) {
          ready.push(chain.eventId)
        }
        // 到期移除（即使条件不满足也不再保留）
        this.pendingChains.splice(this.pendingChains.indexOf(chain), 1)
      }
    }

    return ready
  }
}
```

---

## 五、事件分类数据

基于 `游戏模式/03-事件系统设计.md` 的分类，以下是事件系统需要承载的模板结构：

```typescript
// 所有事件模板的注册
const EVENT_REGISTRY: EventTemplate[] = [
  // 探索类 (8 模板)
  roadsideFind,         // T-001 路边发现
  abandonedBuilding,    // T-002 废弃建筑线索
  strangeTrack,         // T-003 异常痕迹
  // ...

  // 社交类 (10 模板)
  npcApproach,          // T-004 NPC主动搭话
  beggar,               // T-005 求助者
  tenseConfrontation,   // T-006 紧张对峙
  // ...

  // 资源类 (6 模板)
  priceFluctuation,     // T-007 物价波动
  unexpectedFind,       // T-008 意外收获
  // ...

  // 生存类 (5 模板)
  woundInfection,       // T-009 伤口恶化
  foodRunningOut,       // T-010 粮食见底
  magicTideApproach,    // T-011 魔潮逼近
  // ...

  // 战斗类 (5 模板)
 腐兽遭遇,              // T-012
  // ...

  // 感情类 (6 模板)
  silentApproach,       // T-013 沉默的靠近
  // ...

  // 剧情类 (8 模板)
  // ...

  // 日常类 (4 模板)
  // ...
]
// 总计 ~52 模板
```

---

## 六、代码结构规划

```
apps/api/src/engine/events/
├── event.types.ts              # 事件核心类型（EventTemplate, EventTrigger, EventChoice）
├── event-engine.ts             # 事件引擎（检测/触发/执行）
├── event-templates.ts          # 所有事件模板注册（52个）
├── event-narrative.ts          # 叙事参数填充器
├── event-cooldown.ts           # 冷却管理
├── event-chain.ts              # 链式事件注册 + 到期检查
├── event-priority.ts           # 优先级排序
└── event-log.ts                # 事件日志记录
```
