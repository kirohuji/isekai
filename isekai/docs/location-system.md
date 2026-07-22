# 地点系统设计

> 地点图、移动、发现、状态变化、与回合系统的集成

---

## 一、核心设计：地点就是"场景"

```
地点 = 场景节点
  ├── 有名字、描述、区域归属
  ├── 有 NPC 出没
  ├── 有可互动的物品/设施
  ├── 有绑定的规则（天气修正、安全判定）
  ├── 有状态（随时间变化）
  └── 有门控条件（不是所有地方一开始都能去）
```

**地点之间的关系是有向图：**

```
                          王都
                        /  |   \
                 旧鹿角旅馆 灰绳市场  神殿区
                      |      |       |
                   排水道──王都地下──第三圣殿
                      |
                东南沼泽·边缘
                      |
                 暮河镇 ──── 修道院
                  /    \
              苇水村    灰丘
                 |
           东南沼泽·深处 (亚人聚落)
```

---

## 二、地点定义

### 2.1 核心数据结构

```typescript
interface LocationDef {
  id: number
  name: string
  region: string
  description: string
  /** 详细探索描述（玩家执行"探索"时的完整文本） */
  exploreDescription?: string

  /** 地点类型标签 */
  tags: LocationTag[]

  /** 是否安全区（安全区不会随机遇敌） */
  isSafe: boolean

  /** 此地的设施/可互动点 */
  facilities: Facility[]

  /** 此地的 NPC（初始在此地的 NPC ID 列表） */
  residentNpcIds: number[]

  /** 在此地可以采集/收集的资源 */
  harvestable?: Harvestable[]

  /** 绑定的规则（通过规则系统） */
  rules?: Rule[]

  /** 连接的地点 */
  connections: Connection[]
}

enum LocationTag {
  city = 'city',           // 城市
  town = 'town',           // 城镇
  village = 'village',     // 村庄
  wild = 'wild',           // 野外
  dungeon = 'dungeon',     // 地下城
  safe = 'safe',           // 安全区
  danger = 'danger',       // 危险区
  secret = 'secret',       // 秘密地点
  indoor = 'indoor',       // 室内
  outdoor = 'outdoor',     // 室外
  water = 'water',         // 水域
  forest = 'forest',       // 林地
  mountain = 'mountain',   // 山地
  swamp = 'swamp',         // 沼泽
  border = 'border',       // 边境
  capital = 'capital',     // 王都
}
```

### 2.2 连接（移动边）

```typescript
interface Connection {
  /** 目标地点 ID */
  targetId: number
  /** 移动消耗的时段数 */
  travelCost: number
  /** 移动条件（可选——比如需要钥匙、需要通行证） */
  condition?: Condition
  /** 此路径是否已知（false=未被发现，需要探索才能解锁） */
  isKnown: boolean
  /** 移动时的叙事模板（不同路径不同文本） */
  travelNarrative?: string
  /** 路径状态（可被事件改变——如"道路被封锁"） */
  status: 'open' | 'blocked' | 'dangerous' | 'hidden'
}
```

**连接示例：**

```typescript
const connections: Connection[] = [
  { targetId: 2, travelCost: 1, isKnown: true, status: 'open',
    travelNarrative: '你穿过北门的集市，人声渐近。' },
  { targetId: 6, travelCost: 2, isKnown: false, status: 'hidden',
    travelNarrative: '你钻进排水道，在黑暗中摸索前行。' },
  // ↑ 排水道到沼泽边缘的路径一开始是 hidden 的
  //   玩家需要先探索排水道才能发现
]
```

### 2.3 设施

```typescript
interface Facility {
  id: string
  name: string
  description: string
  /** 此设施提供的行动 */
  actions: FacilityAction[]
  /** 使用条件 */
  condition?: Condition
  /** 设施状态 */
  state: 'available' | 'damaged' | 'underConstruction' | 'closed'
}

interface FacilityAction {
  actionId: string
  /** 覆盖基础行动消耗（可选——比如这里砍柴更累） */
  overrideCost?: Partial<ActionCost>
  /** 在此设施执行此行动的额外叙事 */
  narrativeOverride?: string
}
```

**设施示例：**

```typescript
const grayHillFacilities: Facility[] = [
  {
    id: 'stone_cabin',
    name: '石基木屋',
    description: '灰丘上唯一的遮蔽所。屋顶有些漏，但勉强能住。',
    actions: [
      { actionId: 'rest', narrativeOverride: '你在木屋角落的草堆上躺下，听着风声。' },
      { actionId: 'store_items', narrativeOverride: '你把东西塞进墙角的木箱。' },
    ],
    state: 'available',
  },
  {
    id: 'collapsed_storage',
    name: '坍塌的储藏坑',
    description: '半塌的地窖，里面黑漆漆的。',
    actions: [
      { actionId: 'excavate', narrativeOverride: '你开始清理塌方的泥土……' },
    ],
    state: 'damaged',
  },
]
```

### 2.4 可采集资源

```typescript
interface Harvestable {
  resourceId: string
  name: string
  /** 每次采集获得的数量 */
  yield: number
  /** 采集所需的技能/工具 */
  requirement?: ItemRequirement | SkillRequirement
  /** 刷新回合数（采集后多久可以再来） */
  respawnTurns: number
  /** 剩余次数（-1 = 无限） */
  remainingUses: number
}
```

**示例：**

```typescript
const grayHillHarvest: Harvestable[] = [
  { resourceId: 'wood', name: '枯枝', yield: 2, respawnTurns: 3, remainingUses: -1 },
  { resourceId: 'herb', name: '野药草', yield: 1,
    requirement: { skillId: 'survival', minLevel: 1 },
    respawnTurns: 10, remainingUses: 5 },
  { resourceId: 'stone', name: '碎石', yield: 3, respawnTurns: 5, remainingUses: -1 },
]
```

---

## 三、地点状态变化

### 3.1 为什么地点会变化？

游戏世界不是静止的。同一个地点在不同阶段可能完全不同：

```
灰丘 第1天:  废弃高地，只有一间破木屋
灰丘 第30天: 修复了储藏坑，建了简易围栏
灰丘 第100天: 小型定居点，有农田和简易工坊

暮河镇 第1天:  自由贸易，周启明刚到此地
暮河镇 第50天: 封锁加强，盘查变严
暮河镇 第100天: 增兵，宵禁
```

### 3.2 地点状态机

```typescript
/** 地点的渐进变化通过 state + flags 实现 */
interface LocationState {
  locationId: number

  /** 当前阶段（不同阶段有不同的描述/可用设施） */
  phase: string

  /** 地点专属 flag（追踪此地点特有的状态） */
  flags: Record<string, string>

  /** 设施状态覆盖 */
  facilityStates: Record<string, FacilityState>

  /** 当前在此地点的 NPC ID 列表 */
  currentNpcIds: number[]

  /** 路径状态覆盖 */
  connectionStatuses: Record<number, Connection['status']>
}

/** 地点阶段变化示例——灰丘的演进： */
const GRAY_HILL_PHASES = {
  abandoned: {
    name: '废弃',
    description: '一片荒芜的废弃高地。只有一间破木屋和一个塌了的坑。',
    availableFacilities: ['stone_cabin', 'collapsed_storage'],
  },
  preliminary: {
    name: '初步定居',
    description: '储藏坑修好了，木屋补了屋顶，周边清出了一小片空地。',
    availableFacilities: ['stone_cabin', 'repaired_storage', 'simple_fence'],
    // ↑ 新增 repaired_storage 设施
    unlockCondition: { flag: 'storage_pit_repaired', value: 'true' },
  },
  settlement: {
    name: '小型定居点',
    description: '有了简易工坊和小块农田。围栏外挖了排水沟。',
    availableFacilities: ['stone_cabin', 'repaired_storage', 'workshop', 'farmland'],
    unlockCondition: { flag: 'gray_hill_settlement', value: 'true' },
  },
}
```

### 3.3 地点变化的触发方式

```typescript
type LocationChangeTrigger =
  /** 玩家建设行为 */
  | { type: 'player_action'; actionId: string }
  /** 事件触发 */
  | { type: 'event'; eventId: number }
  /** 跨天自动变化 */
  | { type: 'time'; turnsElapsed: number }
  /** NPC 行为导致 */
  | { type: 'npc_action'; npcId: number }
  /** 因果链——另一个地点的变化连锁影响此地 */
  | { type: 'chain'; sourceLocationId: number }
```

**示例——灰丘从 abandoned → preliminary：**

```typescript
// 方式 1：玩家手动建设
// 玩家选择"修缮储藏坑"行动 → actionId = 'repair_storage'
// → locationState.flags['storage_pit_repaired'] = 'true'
// → 触发阶段检测 → 满足 preliminary 条件

// 方式 2：NPC 自动建设
// 格兰在灰丘停留超过 20 回合
// → NpcTick 自动执行"帮忙修缮"
// → 同样触发阶段变化

// 方式 3：事件触发
// 事件 "流浪工匠路过" → NPC帮忙修好了储藏坑
```

---

## 四、移动系统

### 4.1 移动流程

```
玩家选择"移动 → 暮河镇"
  │
  ├── 1. 检查连接
  │   ├── 暮河镇是否在当前位置的 connections 中？
  │   └── connection.status 是否为 'open' 或 'dangerous'？
  │
  ├── 2. 检查条件
  │   └── connection.condition 是否满足？（如果有）
  │
  ├── 3. 扣除消耗
  │   ├── travelCost 个时段
  │   └── 基础体力消耗（按距离）
  │
  ├── 4. 执行移动
  │   ├── 更新 player.currentLocationId
  │   ├── 触发"进入新地点"事件
  │   ├── 应用新地点的 rules
  │   └── 生成移动叙事
  │
  └── 5. 移动结果
      ├── 叙事: "你沿着猎人小路走了近两个时辰……"
      ├── 新地点的 NPC 列表
      └── 新地点的可用设施/行动
```

### 4.2 移动耗时与体力

```typescript
function calculateTravelCost(connection: Connection, ctx: TurnContext): ActionCost {
  let cost = connection.travelCost

  // 天气修正
  if (ctx.weather === '大雨' || ctx.weather === '暴雨') cost += 1
  if (ctx.weather === '雾') cost += 0.5

  // 状态修正
  if (ctx.playerStatus.has('重伤')) cost += 1

  // 技能修正
  if (ctx.hasSkill('survival', 2)) cost -= 0.5

  // 最低 1 时段
  return { timeBlocks: Math.max(1, Math.floor(cost)), sp: cost * 10 }
}
```

### 4.3 移动中的事件

移动过程中可能触发事件（不是在目的地，是在路上）：

```typescript
interface TravelEvent {
  id: string
  /** 在哪条路径上触发 */
  connectionId: number
  /** 触发概率 */
  chance: number
  /** 触发条件 */
  condition?: Condition
  /** 事件叙事 */
  narrative: string
  /** 选项 */
  choices: EventChoice[]
  /** 只能触发一次 */
  oneTime?: boolean
}
```

**示例：**

```typescript
// 从暮河镇到苇水村的路上可能遇到巡逻队
const travelEvents: TravelEvent[] = [
  {
    id: 'river_patrol',
    connectionId: 7,  // 暮河镇→苇水村
    chance: 0.3,
    condition: new FlagCondition('zhou_qiming_alert', '>=', '2'),
    narrative: '你在半路上听到前方有马蹄声……是周启明的巡逻队。',
    choices: [
      { label: '躲进路边的灌木丛', effects: [new SetFlagEffect('evaded_patrol', 'true')] },
      { label: '装作普通路人', effects: [/* 概率被盘问 */] },
    ],
  },
]
```

---

## 五、地点发现

### 5.1 发现机制

不是所有地点一开始就可见。有些需要探索才能发现：

```typescript
interface DiscoveryRule {
  /** 被发现的地点 ID */
  locationId: number
  /** 从哪里可以发现 */
  fromLocationId: number
  /** 发现方式 */
  method: 'explore' | 'talk' | 'event' | 'follow'
  /** 发现条件 */
  condition: Condition
  /** 发现概率（每次满足条件时的概率） */
  chance: number
  /** 发现时的叙事 */
  discoveryNarrative: string
}
```

**示例：**

```typescript
const discoveries: DiscoveryRule[] = [
  {
    locationId: 11,         // 东南沼泽·深处（亚人聚落）
    fromLocationId: 6,      // 从沼泽边缘可以发现
    method: 'explore',
    condition: new CompositeCondition('and', [
      new SkillCondition('survival', '>=', 3),
      new FlagCondition('亚人网络_声望', '>=', 5),
    ]),
    chance: 0.4,
    discoveryNarrative: '你在沼泽深处发现了一条几乎被植被掩盖的小径……尽头有火光。',
  },
  {
    locationId: 12,         // 叹息之墙
    fromLocationId: 6,
    method: 'talk',
    condition: new FlagCondition('talked_to_veteran', '==', 'true'),
    chance: 1.0,
    discoveryNarrative: '那个老兵指着北方："那边有个老墙，据说以前是防魔物的。"',
  },
]
```

### 5.2 地点可见性

```typescript
interface LocationVisibility {
  locationId: number
  /** 对玩家的可见状态 */
  visibility: 'known' | 'discovered' | 'undiscovered'
  /** 知道这个地点（有传闻但没去过） */
  known?: {
    source: string       // 从谁/哪听说的
    description: string  // 听说的描述（可能不准确）
  }
  /** 首次到达的时间 */
  firstVisitedAt?: { year: number; month: number; day: number }
  /** 最后访问时间 */
  lastVisitedAt?: { year: number; month: number; day: number }
}
```

**三种状态：**

```
undiscovered（未发现）
  → 地图上不存在，玩家不知道有这个地点
  → 通过探索/交谈/事件 → discovered

discovered（已发现但未到访）
  → 地图上显示名称 + "?"
  → 玩家知道有这个地方但没去过
  → 通过移动到达 → known

known（已知）
  → 地图上显示完整信息
  → 去过，知道描述和路径
```

---

## 六、地点规则（通过规则系统绑定）

地点也是 `RuleBindable`——进入地点时激活其规则：

```typescript
// 地点规则示例
const grayHillRules: Rule[] = [
  {
    id: 'gray_hill_cold_night',
    name: '灰丘夜晚寒冷',
    condition: new CompositeCondition('and', [
      new TimeBlockCondition(TimeBlock.夜晚),
      new ActionCategoryCondition('户外'),
    ]),
    effects: [
      new ModifierEffect('hp', 'add', -3),
      new NarrativeEffect('灰丘的夜晚很冷，风从破木屋的缝隙里灌进来。'),
    ],
  },
]

const innRules: Rule[] = [
  {
    id: 'inn_rest_bonus',
    name: '旅馆休息加成',
    condition: new ActionCategoryCondition('休息'),
    effects: [
      new ModifierEffect('hp', 'add', 10),
      new ModifierEffect('sp', 'add', 15),
    ],
  },
  {
    id: 'inn_meal',
    name: '旅馆晚餐',
    condition: new CompositeCondition('and', [
      new TimeBlockCondition(TimeBlock.傍晚),
      new ResourceCondition('silver', '>=', 1),
    ]),
    effects: [
      new NarrativeEffect('玛莎端来了热汤——虽然只是野菜汤，但在这种时候算奢侈了。'),
    ],
  },
]

const swampRules: Rule[] = [
  {
    id: 'swamp_poison_risk',
    name: '沼泽毒瘴',
    condition: new ActionCategoryCondition('探索'),
    effects: [
      new ModifierEffect('hp', 'add', -2),
      new NarrativeEffect('沼泽的瘴气让你有些头晕。'),
    ],
    // 有"防毒面具"或技能"药剂学"可以抵消
  },
]
```

---

## 七、地点与回合系统的集成

### 7.1 移动在 12 阶段中的位置

```
阶段 4: PLAYER_ACTION
  └── 玩家选择"移动→暮河镇"
      ├── 校验：连接是否存在、状态是否 open
      ├── 扣除：travelCost 时段 + 体力
      └── 执行：切换 locationId

阶段 5: ACTION_RESULT
  └── 移动叙事 + 路途事件检查

阶段 6: RULE_EVALUATE
  └── 旧地点的 rules 移除 + 新地点的 rules 加载

阶段 7: NPC_PHASE
  └── 新地点的 NPC 加入活跃 tick 列表
  └── 旧地点的 NPC 移出活跃 tick 列表

阶段 8: WORLD_TICK
  └── 新地点的 harvestable 刷新检查
  └── 新地点的阶段变化检查
```

### 7.2 地点切换时的上下文变更

```
玩家进入新地点时，以下内容自动更新：

✅ 更新：
  ├── locationId → 新地点
  ├── 可用行动 → 新地点的设施/采集物/社交对象
  ├── 活跃规则 → 新地点的 rules
  ├── NPC 列表 → 新地点的 residentNpcIds + 当前在此的 NPC
  └── 连接 → 新地点的 connections

❌ 不再适用：
  ├── 旧地点的设施行动
  ├── 旧地点的采集物
  └── 旧地点的 NPC（除非他们跟随/队伍中有）
```

### 7.3 跨地点的事件传播

某些事件可以从一个地点传播到另一个地点：

```typescript
interface LocationEventPropagation {
  sourceLocationId: number
  targetLocationId: number
  /** 传播延迟（回合数） */
  delayTurns: number
  /** 传播条件 */
  condition: Condition
  /** 到达目标地点后触发的事件 */
  eventOnArrival: string
}
```

**示例——消息传播：**

```
你在灰丘惹了事 → 消息传到暮河镇（延迟 10 回合）
  → 到达暮河镇后 → 周启明警觉度 +1
  → 再传到苇水村（延迟 5 回合）
  → 到达苇水村后 → 村民对你的态度变化
```

---

## 八、地点数据与数据库

### 8.1 基础地点数据（预置）

结合 `游戏模式/02-数据库设计.md` 的初始数据，15 个地点的关系图：

```
旧鹿角旅馆(1) ── 北门集市(2) ── 神殿区南门(5) ── 第三圣殿(14)
     │                                               │
     ├── 灰绳市场(3)                                 大圣堂(15)
     │
     └── 排水道入口(4) ── 沼泽边缘(6) ── 沼泽深处(11)
                              │
                          暮河镇(7) ──── 修道院(9)
                          /      \
                     苇水村(8)──灰丘(10)

叹息之墙(12) —（远处，暂未连接）
铁脊矿区(13) —（远处，暂未连接）
```

### 8.2 预置的地点阶段

```typescript
const LOCATION_INITIAL_PHASES: Record<number, string> = {
  1:  'operating',     // 旧鹿角旅馆——仍在营业（但主角已离开）
  7:  'guarded',       // 暮河镇——周启明加强守备
  8:  'starving',      // 苇水村——粮食危机
  10: 'abandoned',     // 灰丘——废弃状态，等待建设
}
```

---

## 九、代码结构规划

```
apps/api/src/engine/
├── locations/
│   ├── location.types.ts         # 地点核心类型
│   ├── location-database.ts      # 预置地点数据（15个初始地点）
│   ├── location-manager.ts       # 地点管理（切换/发现/状态）
│   ├── location-state.ts         # 地点状态变化（阶段演进）
│   ├── location-rules.ts         # 地点规则绑定
│   └── location-visibility.ts    # 地点可见性管理
│
├── travel/
│   ├── travel-system.ts          # 移动系统（耗时计算/移动执行）
│   ├── travel-events.ts          # 路途事件
│   └── connection-manager.ts     # 连接管理（解锁/封锁）
│
├── facilities/
│   ├── facility.types.ts         # 设施定义
│   └── facility-actions.ts       # 设施提供的行动
│
├── gating/
│   └── location-gate.ts          # 地点门控（第9道门控）
│
└── data/
    └── locations/                # 每个地点的 JSON 数据文件
        ├── 01-old-deer-inn.json
        ├── 02-north-gate-market.json
        ├── ...
        └── 15-gray-hill.json
```
