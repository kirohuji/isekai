# 规则系统设计

> 核心抽象层：将游戏中所有的"条件判断 × 效果触发"统一为可组合的规则机制

---

## 一、设计理念

### 为什么要一个规则系统？

游戏中充满了各种"如果...那么..."的逻辑：

```
如果 天气 == 雨天     →  户外行动体力消耗 +50%
如果 时段 == 夜晚     →  探索范围 -50%
如果 持有物品"药草"  →  制药效果 +20%
如果 好感度 >= 50    →  交易价格 -10%
如果 技能"野外生存">=3 →   foraging 收益 +1
如果 flag"苇水危机"已解决 →  村长态度友好
```

散布在代码各处的 `if/else` 会迅速失控。规则系统就是把所有这种判断**统一成一个可组合的抽象层**。

### 核心思想

```
规则 = 条件(Condition) + 效果(Effect)

条件：对游戏状态的真/假判断
效果：当条件为真时执行的行为

对象绑定规则：规则挂载在具体的游戏对象上（地点、物品、角色、技能等）
```

### 为什么选择"对象绑定规则"而非"规则指定目标"？

| 方式 | 说明 | 优点 | 缺点 |
|------|------|------|------|
| **A. 规则绑定对象** | 规则作为对象的属性存在，如 `location.rules` | 直观、OOP 自然、新增对象类型时自带规则 | 规则复用性略低 |
| **B. 规则指定目标** | 规则独立存储，内部写明作用对象 | 复用性高 | 查询复杂，对象与规则解耦过远 |

**选择方案 A**——因为你的游戏是"先有东西，后有功能"，对象绑定的方式更自然：

1. 先定义 `Location`、`Item`、`NPC`、`Skill` 等对象
2. 每个对象有个 `rules: Rule[]` 字段
3. 后续想要什么效果，就往对应对象加规则
4. 规则引擎遍历相关对象的规则，评估触发

---

## 二、核心接口设计

### 2.1 规则容器 — 可绑定规则的对象

```typescript
/**
 * 可绑定规则的对象都应实现此接口
 *
 * 所有游戏对象：地点(Location)、物品(Item)、角色(NPC)、
 * 技能(Skill)、事件(EventTemplate) 等都实现此接口
 */
interface RuleBindable {
  /** 该对象绑定的规则列表 */
  rules: Rule[]
}
```

### 2.2 规则本体

```typescript
/**
 * 规则 = 条件 + 效果
 *
 * 条件满足时自动触发效果
 */
interface Rule {
  /** 规则唯一标识（用于日志/调试） */
  id: string
  /** 规则名称（如"雨天体力惩罚"） */
  name: string
  /** 触发条件 */
  condition: Condition
  /** 条件满足时执行的效果 */
  effects: Effect[]
  /** 优先级（多个规则冲突时，高优先级胜出） */
  priority?: number
  /** 描述（用于 UI 展示或调试） */
  description?: string
}
```

### 2.3 条件

```typescript
/**
 * 条件——对游戏上下文的真/假判断
 *
 * 所有具体条件都实现此接口
 */
interface Condition {
  /** 类型标识，用于序列化和调试 */
  type: string
  /** 评估条件是否满足 */
  evaluate(ctx: RuleContext): boolean
}

// ─── 内置条件类型 ───

/** 天气条件 */
class WeatherCondition implements Condition {
  type = 'weather'
  constructor(public weather: Weather, public operator: '==' | '!=' = '==') {}
  evaluate(ctx: RuleContext): boolean {
    return operator === '=='
      ? ctx.gameState.weather === this.weather
      : ctx.gameState.weather !== this.weather
  }
}

/** 时段条件 */
class TimeBlockCondition implements Condition {
  type = 'timeBlock'
  constructor(public block: TimeBlock) {}
  evaluate(ctx: RuleContext): boolean {
    return ctx.gameState.timeBlock === this.block
  }
}

/** 资源条件（HP/SP/MP >= 或 <= 阈值） */
class ResourceCondition implements Condition {
  type = 'resource'
  constructor(
    public resource: 'hp' | 'sp' | 'mp' | 'silver' | 'foodDays',
    public operator: '>=' | '<=' | '>' | '<' | '==',
    public value: number,
  ) {}
  evaluate(ctx: RuleContext): boolean {
    const current = ctx.gameState.resources[this.resource]
    switch (this.operator) {
      case '>=': return current >= this.value
      case '<=': return current <= this.value
      case '>':  return current > this.value
      case '<':  return current < this.value
      case '==': return current === this.value
    }
  }
}

/** 标记条件（flag 判断） */
class FlagCondition implements Condition {
  type = 'flag'
  constructor(
    public flagName: string,
    public operator: '==' | '!=' | 'exists' | 'notExists',
    public value?: string,
  ) {}
  evaluate(ctx: RuleContext): boolean {
    const flag = ctx.gameState.flags[this.flagName]
    switch (this.operator) {
      case 'exists':    return flag !== undefined
      case 'notExists': return flag === undefined
      case '==':        return flag === this.value
      case '!=':        return flag !== this.value
    }
  }
}

/** 持有物品条件 */
class HasItemCondition implements Condition {
  type = 'hasItem'
  constructor(public itemName: string, public minQuantity: number = 1) {}
  evaluate(ctx: RuleContext): boolean {
    return ctx.gameState.inventory
      .filter(i => i.itemName === this.itemName)
      .reduce((sum, i) => sum + i.quantity, 0) >= this.minQuantity
  }
}

/** 好感度条件 */
class AffectionCondition implements Condition {
  type = 'affection'
  constructor(public npcName: string, public operator: '>=' | '<=' | '>' | '<', public value: number) {}
  evaluate(ctx: RuleContext): boolean {
    const rel = ctx.gameState.relationships[this.npcName]
    if (!rel) return false
    switch (this.operator) {
      case '>=': return rel.affection >= this.value
      case '<=': return rel.affection <= this.value
      case '>':  return rel.affection > this.value
      case '<':  return rel.affection < this.value
    }
  }
}

/** 复合条件（AND/OR/NOT 组合） */
class CompositeCondition implements Condition {
  type = 'composite'
  constructor(
    public logic: 'and' | 'or' | 'not',
    public conditions: Condition[],
  ) {}
  evaluate(ctx: RuleContext): boolean {
    switch (this.logic) {
      case 'and': return this.conditions.every(c => c.evaluate(ctx))
      case 'or':  return this.conditions.some(c => c.evaluate(ctx))
      case 'not': return !this.conditions[0]?.evaluate(ctx)
    }
  }
}
```

### 2.4 效果

```typescript
/**
 * 效果——条件满足时执行的行为
 */
interface Effect {
  type: string
  execute(ctx: RuleContext): void
}

// ─── 内置效果类型 ───

/** 数值修正：如"体力消耗 +10"、"生命恢复 +5" */
class ModifierEffect implements Effect {
  type = 'modifier'
  constructor(
    public target: 'hp' | 'sp' | 'mp' | 'silver' | 'foodDays',
    public operation: 'add' | 'multiply' | 'set',
    public value: number,
  ) {}
  execute(ctx: RuleContext): void {
    // 将修正值存入 ctx.modifiers，由调用方读取
    ctx.modifiers.push({ target: this.target, operation: this.operation, value: this.value })
  }
}

/** 设置标记 */
class SetFlagEffect implements Effect {
  type = 'setFlag'
  constructor(public flagName: string, public flagValue: string) {}
  execute(ctx: RuleContext): void {
    ctx.gameState.flags[this.flagName] = this.flagValue
  }
}

/** 触发事件 */
class TriggerEventEffect implements Effect {
  type = 'triggerEvent'
  constructor(public eventTemplateId: number) {}
  execute(ctx: RuleContext): void {
    ctx.pendingEvents.push(this.eventTemplateId)
  }
}

/** 追加叙事文本 */
class NarrativeEffect implements Effect {
  type = 'narrative'
  constructor(public text: string) {}
  execute(ctx: RuleContext): void {
    ctx.narrativeAppend.push(this.text)
  }
}

/** 禁用/启用某个行动 */
class ToggleActionEffect implements Effect {
  type = 'toggleAction'
  constructor(public actionId: string, public enabled: boolean) {}
  execute(ctx: RuleContext): void {
    ctx.actionToggles.push({ actionId: this.actionId, enabled: this.enabled })
  }
}
```

### 2.5 规则上下文

```typescript
/**
 * 规则评估上下文——传递当前游戏状态和临时数据
 */
interface RuleContext {
  /** 当前游戏状态快照 */
  gameState: Readonly<GameState>
  /** 当前正在执行的操作（如"移动"、"休息"） */
  currentAction?: string
  /** 触发规则的对象（哪个 Location/Item/NPC 的规则被评估） */
  sourceObject?: RuleBindable
  /** 【输出】数值修正列表 */
  modifiers: ModifierRequest[]
  /** 【输出】待触发事件列表 */
  pendingEvents: number[]
  /** 【输出】追加叙事文本 */
  narrativeAppend: string[]
  /** 【输出】行动开关 */
  actionToggles: { actionId: string; enabled: boolean }[]
}
```

---

## 三、规则引擎

```typescript
/**
 * 规则引擎——遍历所有相关对象的规则并执行
 *
 * 用法：
 *   1. 收集当前场景中所有相关对象（当前地点、持有物品、已学技能等）
 *   2. 提取它们的 rules
 *   3. 按优先级排序
 *   4. 逐个 evaluate，条件满足则执行 effect
 *   5. 返回累积的修饰结果
 */
class RuleEngine {
  evaluateAll(ctx: RuleContext, objects: RuleBindable[]): RuleResult {
    const sorted = objects
      .flatMap(obj => obj.rules.map(r => ({ rule: r, source: obj })))
      .sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0))

    for (const { rule } of sorted) {
      if (rule.condition.evaluate(ctx)) {
        for (const effect of rule.effects) {
          effect.execute(ctx)
        }
      }
    }

    return {
      modifiers: ctx.modifiers,
      pendingEvents: ctx.pendingEvents,
      narrativeAppend: ctx.narrativeAppend,
      actionToggles: ctx.actionToggles,
    }
  }
}
```

---

## 四、实际应用示例

### 4.1 天气系统

```typescript
// 定义天气枚举
enum Weather { 晴朗, 多云, 雨天, 暴雨, 雾天, 魔潮 }

// 天气本身是一个规则容器
class WeatherState implements RuleBindable {
  constructor(public current: Weather) {}

  get rules(): Rule[] {
    switch (this.current) {
      case Weather.雨天:
        return [
          {
            id: 'rain_stamina_penalty',
            name: '雨天体力惩罚',
            condition: new CompositeCondition('and', [
              new TimeBlockCondition(TimeBlock.上午),
              new TimeBlockCondition(TimeBlock.下午),
            ]),
            // 也可以用 ActionCategoryCondition
            condition: new ActionCategoryCondition('户外行动'),
            effects: [
              new ModifierEffect('sp', 'multiply', 1.5), // 体力消耗 ×1.5
            ],
            description: '雨天路面泥泞，户外行动更耗体力',
          },
          {
            id: 'rain_foraging_bonus',
            name: '雨后 foraging 加成',
            condition: new CompositeCondition('and', [
              new ActionCategoryCondition('探索'),
              new HasItemCondition('篮子'),
            ]),
            effects: [
              new ModifierEffect('foraging_yield', 'add', 2), // 采集收益 +2
              new NarrativeEffect('雨后的泥土里冒出了不少菌菇。'),
            ],
          },
        ]
      case Weather.雾天:
        return [
          {
            id: 'fog_explore_penalty',
            name: '雾天探索受限',
            condition: new ActionCategoryCondition('探索'),
            effects: [
              new ModifierEffect('explore_range', 'multiply', 0.5),
              new NarrativeEffect('浓雾笼罩，看不清远方。'),
            ],
          },
        ]
      // ...
    }
  }
}
```

### 4.2 地点规则

```typescript
// 地点实现了 RuleBindable
class Location implements RuleBindable {
  constructor(
    public id: number,
    public name: string,
    public rules: Rule[] = [],
  ) {}
}

// 实际使用时，创建地点并绑定规则
const oldDeerInn = new Location(1, '旧鹿角旅馆', [
  {
    id: 'inn_rest_bonus',
    name: '旅馆休息加成',
    condition: new ActionCategoryCondition('休息'),
    effects: [
      new ModifierEffect('hp', 'add', 10),   // 多恢复 10 HP
      new ModifierEffect('sp', 'add', 15),   // 多恢复 15 SP
      new NarrativeEffect('床铺虽然硬，但至少有个屋顶。'),
    ],
    description: '旅馆休息恢复效果提升',
  },
  {
    id: 'inn_dinner_event',
    name: '旅馆晚餐触发',
    condition: new CompositeCondition('and', [
      new TimeBlockCondition(TimeBlock.傍晚),
      new ResourceCondition('silver', '>=', 1),
    ]),
    effects: [
      new TriggerEventEffect(201), // 触发"旅馆晚餐"事件
    ],
  },
])

// 或是用 builder 模式更舒服
const grayHill = new LocationBuilder(10, '灰丘')
  .rule('灰丘夜晚寒冷', r => r
    .when(new TimeBlockCondition(TimeBlock.夜晚))
    .when(new ActionCategoryCondition('户外'))
    .effect(new ModifierEffect('hp', 'add', -5))
    .effect(new NarrativeEffect('灰丘的夜晚很冷，没有御寒装备的话会失温。'))
  )
  .rule('灰丘储藏坑', r => r
    .when(new FlagCondition('storage_pit_excavated', '==', 'true'))
    .effect(new ModifierEffect('storage_capacity', 'set', 50))
  )
  .build()
```

### 4.3 物品规则

```typescript
class Item implements RuleBindable {
  constructor(
    public id: number,
    public name: string,
    public type: ItemType,
    public rules: Rule[] = [],
  ) {}
}

// 装备类物品
const leatherArmor = new Item(1, '皮甲', ItemType.armor, [
  {
    id: 'leather_armor_defense',
    name: '皮甲防御',
    condition: new CompositeCondition('and', [
      new IsEquippedCondition(),  // 只有装备时才生效
      new ActionCategoryCondition('战斗'),
    ]),
    effects: [
      new ModifierEffect('damage_taken', 'add', -5), // 减伤 5
    ],
    priority: 10,
  },
])

// 消耗品
const herbalMedicine = new Item(2, '药草', ItemType.material, [
  {
    id: 'herb_medicine_boost',
    name: '药草制药加成',
    condition: new CompositeCondition('and', [
      new HasItemCondition('药草', 1),
      new ActionCategoryCondition('制药'),
    ]),
    effects: [
      new ModifierEffect('potion_effectiveness', 'multiply', 1.3),
      new NarrativeEffect('你加入了新鲜药草，药水颜色更深了一些。'),
    ],
  },
])
```

### 4.4 NPC / 关系规则

```typescript
class NPC implements RuleBindable {
  constructor(
    public id: number,
    public name: string,
    public rules: Rule[] = [],
  ) {}
}

// 当 NPC 在队伍中时生效的规则
const shenQinglan = new NPC(1, '沈清岚', [
  {
    id: 'shen_research_boost',
    name: '沈清岚的研究协助',
    condition: new CompositeCondition('and', [
      new IsInPartyCondition('沈清岚'),
      new ActionCategoryCondition('研究'),
    ]),
    effects: [
      new ModifierEffect('research_speed', 'multiply', 1.5),
      new NarrativeEffect('沈清岚在一旁帮你翻阅资料，速度快了不少。'),
    ],
  },
  {
    id: 'shen_morale_boost',
    name: '沈清岚的陪伴',
    condition: new AffectionCondition('沈清岚', '>=', 50),
    effects: [
      new ModifierEffect('mp', 'add', 5), // 精神恢复 +5
    ],
  },
])
```

### 4.5 技能规则

```typescript
class Skill implements RuleBindable {
  constructor(
    public name: string,
    public level: number,
    public rules: Rule[] = [],
  ) {}
}

// 技能升级自动获得新规则
function createSurvivalSkill(level: number): Skill {
  const rules: Rule[] = [
    {
      id: 'survival_foraging_bonus',
      name: '野外生存·采集加成',
      condition: new ActionCategoryCondition('探索'),
      effects: [new ModifierEffect('foraging_yield', 'add', level)],
    },
  ]

  if (level >= 3) {
    rules.push({
      id: 'survival_track',
      name: '野外生存·追踪',
      condition: new ActionCategoryCondition('探索'),
      effects: [new ModifierEffect('explore_range', 'add', 2)],
      description: '你学会了通过痕迹判断方向。',
    })
  }

  if (level >= 5) {
    rules.push({
      id: 'survival_shelter',
      name: '野外生存·搭建庇护所',
      condition: new TimeBlockCondition(TimeBlock.夜晚),
      effects: [
        new ModifierEffect('hp', 'add', 10),
        new NarrativeEffect('你熟练地搭建了一个临时庇护所。'),
      ],
    })
  }

  return new Skill('野外生存', level, rules)
}
```

---

## 五、规则评估流程

```
玩家选择行动 "探索灰丘周边"
    │
    ▼
RuleEngine.evaluateAll()
    │
    ├── 收集场景中所有相关对象的规则：
    │    当前地点(灰丘)           → 2 条规则
    │    当前天气(雨天)           → 2 条规则
    │    当前时段(下午)           → 0 条规则（时段本身不绑规则）
    │    持有物品(药草、短刀)     → 1 条规则
    │    已学技能(野外生存 Lv.2)  → 1 条规则
    │    队伍成员(沈清岚好感 55)  → 1 条规则
    │
    ├── 按优先级排序
    │
    ├── 逐条评估：
    │   ✓ "灰丘夜晚寒冷"   → 时段 != 夜晚 → 跳过
    │   ✓ "雨天体力惩罚"   → 当前行动 != 户外 → 跳过
    │   ✓ "野外生存采集加成" → action == 探索 → 触发
    │   ✓ "沈清岚的陪伴"   → 好感 >= 50 → 触发
    │
    └── 返回 RuleResult:
          modifiers:    [{ foraging_yield: +2 }, { mp: +5 }]
          narrativeAppend: []
          pendingEvents: []
          actionToggles: []
    │
    ▼
GameEngine 使用 modifiers 计算最终数值
    │
    ▼
生成叙事，更新状态，同步给客户端
```

---

## 六、规则的定义方式（轻量与完整）

### 6.1 硬编码（简单直接，适合少量规则）

```typescript
const inn = new Location(1, '旧鹿角旅馆', [
  {
    id: 'inn_rest',
    name: '旅馆休息',
    condition: new ActionCategoryCondition('休息'),
    effects: [new ModifierEffect('hp', 'add', 10)],
  },
])
```

好处：类型安全，IDE 补全，编译检查
坏处：修改规则需要改代码

### 6.2 JSON 配置（灵活，适合大量规则或策划配表）

```json
{
  "id": "rain_stamina",
  "name": "雨天体力惩罚",
  "condition": {
    "type": "and",
    "conditions": [
      { "type": "weather", "weather": "雨天" },
      { "type": "actionCategory", "category": "户外行动" }
    ]
  },
  "effects": [
    { "type": "modifier", "target": "sp", "operation": "multiply", "value": 1.5 }
  ]
}
```

需要写一个 JSON → Rule 的反序列化器。后续可视需求实现。

### 6.3 Builder 模式（推荐——平衡可读性和灵活性）

```typescript
// 建议实现的 builder
new LocationBuilder(10, '灰丘')
  .rule('夜晚寒冷', r => r
    .when(new TimeBlockCondition(TimeBlock.夜晚))
    .when(new ActionCategoryCondition('户外'))
    .effect(new ModifierEffect('hp', 'add', -5))
  )
  .rule('储藏坑', r => r
    .onlyOnce()                     // 只触发一次
    .when(new ActionCategoryCondition('建设'))
    .effect(new SetFlagEffect('storage_pit', 'built'))
    .effect(new NarrativeEffect('你修好了储藏坑，可以存放物资了。'))
  )
  .build()
```

---

## 七、后续可扩展方向

### 7.1 规则可视化

规则条件/效果都可以序列化为 JSON，可以用一个简单的管理面板查看/编辑所有规则：

```
地点: 灰丘
├── [生效] 夜晚寒冷 → 户外 HP -5/时段
├── [生效] 储藏坑 → 已标记 built
├── [未生效] 瞭望台 → 需要 flag watchtower_built

天气: 雨天
├── [生效] 体力惩罚 → 户外 SP ×1.5
├── [生效] 采集加成 → 持有篮子时 foraging +2
```

### 7.2 规则冲突解决

多条规则可能修改同一个目标（如多个来源都修改 `sp` 消耗）。

```
规则 A: 雨天 → 体力消耗 ×1.5 (multiply)
规则 B: 室内行动 → 体力消耗 ×0.5 (multiply)

雨天在室内行动，体力消耗到底是多少？
```

**修正叠加规则（显式）：**

```typescript
class ModifierResolver {
  /** 按目标分组的所有 modifiers */
  resolve(modifiers: ModifierRequest[]): ModifierResult {
    // 按 target 分组
    const grouped = this.groupByTarget(modifiers)

    const result: ModifierResult = {}

    for (const [target, mods] of Object.entries(grouped)) {
      result[target] = this.resolveOneTarget(mods)
    }

    return result
  }

  private resolveOneTarget(mods: ModifierRequest[]): number {
    // 1. 先按优先级排序（高优先级覆盖低优先级）
    const sorted = mods.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

    // 2. set 操作最高优先级胜出（覆盖一切）
    const setOp = sorted.find(m => m.operation === 'set')
    if (setOp) return setOp.value

    // 3. 所有 add 先求和
    const addSum = sorted
      .filter(m => m.operation === 'add')
      .reduce((sum, m) => sum + m.value, 0)

    // 4. 所有 multiply 后求积
    const multiplyProduct = sorted
      .filter(m => m.operation === 'multiply')
      .reduce((product, m) => product * m.value, 1)

    // 5. 最终 = 加法结果 × 乘法结果
    return addSum * multiplyProduct
  }
}
```

**示例：**

```
雨天(priority=5):    sp消耗 multiply 1.5
室内(priority=3):    sp消耗 multiply 0.5
技能"敏捷"(pri=10): sp消耗 add -5

雨天在室内有敏捷技能 → 结果:
  1. set 操作: 无
  2. add 求和: -5
  3. multiply 求积: 1.5 × 0.5 = 0.75
  4. 最终: -5 × 0.75

注意：如果结果是"体力消耗"这种基础值，先加再乘。
如果结果是百分比修正，则按具体情况决定。
```

**同 priority 时的叠加顺序：**
```
同一优先级内：add 先于 multiply
不同优先级：高优先级先计算，低优先级修正叠加在其上
```

### 7.3 规则的临时禁用/启用

```typescript
// 通过 tag 批量控制
interface Rule {
  tags?: string[]   // 如 ['weather', 'combat']
  enabled?: boolean  // 可临时禁用
}

// 场景切换时批量禁用
ruleEngine.disableByTag('weather')   // 进入室内时关闭天气规则
```

### 7.4 规则的链式触发

```typescript
// 一个规则的 effect 可以生成新的 Condition 上下文
class ChainEffect implements Effect {
  type = 'chain'
  constructor(public nextRuleId: string) {}
  execute(ctx: RuleContext): void {
    ctx.chainRules.push(this.nextRuleId)
  }
}
```

---

## 八、与现有架构的集成

```
apps/api/src/engine/
├── rules/
│   ├── rule.engine.ts           # RuleEngine — 规则引擎核心
│   ├── rule.types.ts            # Rule, Condition, Effect 接口
│   ├── conditions.ts            # 内置条件实现
│   ├── effects.ts               # 内置效果实现
│   ├── rule.builder.ts          # Builder 辅助
│   └── rule.serializer.ts       # JSON ⇔ Rule 序列化（可选）
│
├── game.objects.ts              # 游戏对象：Location, Item, NPC, Skill 等
│                                  （都实现 RuleBindable）
│
└── game.engine.ts               # 回合引擎中调用 RuleEngine
```

**回合引擎中的集成点：**

```
GameEngine.advanceTurn(action)
  │
  ├── 1. 基础消耗（时段/体力）
  │
  ├── 2. RuleEngine.evaluateAll()
  │     → 收集所有相关对象（地点/物品/技能/天气/NPC）
  │     → 获取 modifiers 修正值
  │
  ├── 3. 应用修正后的消耗
  │
  ├── 4. 处理 narrativeAppend → 追加到叙事文本
  │
  ├── 5. 处理 pendingEvents → 触发新事件
  │
  └── 6. 返回最终结果
```
