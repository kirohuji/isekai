# 角色系统设计

> 属性、状态、物品、技能、行动门控

---

## 一、核心设计理念：行动由状态驱动

每个回合的行动列表不是固定的，而是由角色的**当前状态**动态计算出来的。

```
当前状态
├── 属性值 (HP/SP/MP 高低)
├── 状态效果 (受伤/饥饿/中毒/增益)
├── 持有物品 (有没有工具/材料)
├── 已学技能 (等级够不够)
├── 人际关系 (好感度阈值)
├── 时段/天气 (外部环境)
│
└── → 行动门控引擎
      ├── ✅ 可用行动 → 展示给玩家
      ├── ⚠️ 受限行动 → 灰色显示 + 原因
      └── ❌ 不可用行动 → 隐藏
```

**例子：**

```
体力 80/100 → ✅ 【工作】砍柴（消耗 20 体力）
体力 15/100 → ❌ 【工作】砍柴（体力不足，自动隐藏）

有"短刀" → ✅ 【探索】开路（需要刀具）
无"短刀" → ⚠️ 【探索】开路（缺少工具，灰色显示）

好感度 ≥ 30 → ✅ 【社交】深谈
好感度 < 30 → ❌ 【社交】深谈（信任不足，隐藏）

技能"野外生存 Lv.3" → ✅ 【探索】追踪猎物
技能"野外生存 < 3" → ❌ 【探索】追踪猎物（隐藏）

时段=夜晚 → ❌ 【户外】所有户外行动（隐藏）
时段=夜晚 → ✅ 【室内】休息/阅读/ crafting
```

---

## 二、角色属性

### 2.1 核心三属性

```typescript
interface CoreAttributes {
  // ─── 生命 ───
  hp: number
  maxHp: number

  // ─── 体力 ───
  sp: number
  maxSp: number

  // ─── 精神 ───
  mp: number
  maxMp: number
}
```

| 属性 | 含义 | 归零后果 | 恢复方式 |
|------|------|---------|---------|
| **HP (生命)** | 身体状态 | 死亡 | 休息、药品、食物 |
| **SP (体力)** | 行动能力 | 无法行动（强制休息） | 休息、食物 |
| **MP (精神)** | 心理状态 | 精神崩溃（决策出错） | 休息、社交、娱乐 |

### 2.2 属性对行动的门控

```typescript
/** 每个行动声明它的消耗和条件 */
interface ActionRequirement {
  /** 体力消耗 */
  spCost?: number
  /** 最低体力要求（低于此值不可用） */
  minSp?: number
  /** 最低精神要求 */
  minMp?: number
  /** 最低生命要求 */
  minHp?: number
}

// 每个行动定义自己的消耗
const ACTIONS: Record<string, ActionDefinition> = {
  '砍柴': {
    requirements: { spCost: 20, minSp: 25 }, // 要 20 体力，且至少剩 25
    gate: { timeBlock: ['上午', '下午'], weather: ['非暴雨'] },
  },
  '休息': {
    requirements: { spCost: 0 },  // 无消耗，任何时候可用
  },
  '激烈战斗': {
    requirements: { spCost: 40, minSp: 30, minHp: 30 },
    gate: { timeBlock: ['上午', '下午', '傍晚'] },
  },
}
```

### 2.3 派生属性

```typescript
interface DerivedAttributes {
  /** 负重——基于力量相关，影响可携带物品数 */
  carryWeight: number
  currentLoad: number

  /** 基础攻击力——基于力量/装备 */
  attack: number
  /** 基础防御力——基于耐力/装备 */
  defense: number

  /** 速度——影响行动顺序（多人时） */
  speed: number

  /** 感知——影响探索发现概率 */
  perception: number
}
```

---

## 三、状态效果系统

### 3.1 状态的定义

```typescript
interface StatusEffect {
  id: string
  name: string
  type: 'buff' | 'debuff' | 'condition' | 'injury'
  /** 持续回合数（-1 = 永久直到解除） */
  duration: number
  /** 已生效回合数 */
  elapsed: number

  /** 每回合自动触发效果 */
  tickEffect?: Partial<TickModifier>

  /** 对属性的修正 */
  modifiers?: AttributeModifier[]

  /** 对行动的门控 */
  actionGates?: ActionGate[]

  /** 叙事文本 */
  narrativeOnApply: string
  narrativeOnTick?: string
  narrativeOnExpire?: string
}

interface AttributeModifier {
  target: 'hp' | 'sp' | 'mp' | 'maxHp' | 'maxSp' | 'maxMp' | 'attack' | 'defense' | 'speed' | 'perception'
  operation: 'add' | 'multiply' | 'set'
  value: number
}

interface ActionGate {
  /** 禁用的行动类型 */
  blockActions?: ActionCategory[]
  /** 禁用的具体行动 ID */
  blockActionIds?: string[]
  /** 新增的可用行动（如"受伤"时解锁"包扎"行动） */
  unlockActions?: string[]
}
```

### 3.2 内置状态列表

| 状态 | 类型 | 来源 | 效果 | 门控 |
|------|------|------|------|------|
| **轻伤** | injury | 战斗/事故 | 每回合 HP -2 | 无 |
| **重伤** | injury | 严重战斗 | 每回合 HP -5，SP -50% | 封锁所有消耗 >20 SP 的行动 |
| **饥饿** | condition | 无粮食 | 每回合 HP -3，SP 恢复减半 | 无 |
| **极度饥饿** | condition | 连续饥饿 | 每回合 HP -8，SP 不恢复 | 封锁所有行动，只剩"找食物" |
| **中毒** | debuff | 魔物/毒物 | 每回合 HP -5，MP -3 | 无 |
| **恐惧** | debuff | 黑暗事件 | MP 恢复为负 | 封锁"探索"类行动 |
| **鼓舞** | buff | 成功事件 | 攻击 +20%，SP 恢复 +50% | 无 |
| **专注** | buff | 休息/冥想 | MP 恢复 +100% | 无 |
| **疲劳** | condition | 连续工作 | SP 上限临时 -30% | 封锁高消耗行动 |
| **魔化** | special | 魔潮暴露 | 每回合 HP -3，MP -5 | 特殊——剧情相关 |

### 3.3 状态的生命周期

```
获得状态 → 每回合 tickEffect → 回合数到了 → 状态结束
  │                                          │
  │  tickEffect 每回合自动执行                │
  │  比如"中毒": 每回合 HP -5                │
  │                                          │
  │  叙事: "你感到伤口隐隐作痛。"             │
  │                                          │
  └──→ 可能还有"每X回合触发一次"的变体        │
      比如"中毒": 每 3 回合加重一级            │
                                            └──→ 叙事: "毒性终于退了。"
```

### 3.4 状态对行动的动态影响

```
"重伤"状态：
  │
  ├── 🚫 封锁行动：砍柴、战斗、长途移动
  ├── 🚫 封锁类别：[工作, 战斗]
  ├── ✅ 解锁行动：包扎（原本没有，受伤后出现）
  └── ✅ 可用行动：休息（恢复效果 +50%）

"饥饿"状态：
  ├── ⚠️ 砍柴：可用，但叙事中提示"你饿得手软"
  └── 实际效果：通过 AttributeModifier 降低 SP/攻击
```

---

## 四、物品系统

### 4.1 物品定义

```typescript
interface ItemDefinition {
  id: string
  name: string
  type: ItemType
  /** 重量（影响负重） */
  weight: number
  /** 是否可堆叠 */
  stackable: boolean
  /** 描述 */
  description: string

  /** 使用效果（如果是消耗品） */
  useEffect?: UseEffect

  /** 装备效果（如果是装备） */
  equipModifiers?: AttributeModifier[]

  /** 持有时的规则（通过规则系统绑定） */
  rules?: Rule[]
}

enum ItemType {
  weapon = 'weapon',       // 武器——影响攻击
  armor = 'armor',         // 防具——影响防御
  tool = 'tool',           // 工具——解锁行动
  consumable = 'consumable', // 消耗品——使用后消耗
  material = 'material',    // 材料——用于制作
  quest = 'quest',          // 任务道具
  key = 'key',             // 钥匙类
  misc = 'misc',           // 杂项
}
```

### 4.2 物品对行动的门控

```
持有"短刀" → ✅ 【探索】开路（需要刀具）
持有"铁镐" → ✅ 【工作】采矿（需要工具）
持有"药草" → ✅ 【制药】制作药水（需要材料）

未持有    → ⚠️ 行动灰色显示 + "需要：短刀"
```

**实现方式：**

```typescript
interface ItemRequirement {
  /** 需要的物品 */
  itemId: string
  /** 最小数量 */
  minQuantity?: number
  /** 是否消耗（使用后减少数量） */
  consumed?: boolean
}

// 行动定义中增加：
const actionDef = {
  id: 'mine_ore',
  name: '采矿',
  requirements: {
    spCost: 30,
    items: [  // ← 物品需求
      { itemId: 'iron_pickaxe', minQuantity: 1, consumed: false },
    ],
  },
}
```

### 4.3 装备系统

```typescript
interface EquipSlot {
  type: 'weapon' | 'armor' | 'accessory' | 'tool'
  equipped: ItemDefinition | null
}

// 装备自动修改属性
const leatherArmor: ItemDefinition = {
  id: 'leather_armor',
  name: '皮甲',
  type: 'armor',
  weight: 3,
  equipModifiers: [
    { target: 'defense', operation: 'add', value: 5 },
    { target: 'maxSp', operation: 'add', value: 10 },
  ],
}
```

### 4.4 物品的"持有者规则"

物品本身也是 `RuleBindable`——持有特定物品会激活规则：

```typescript
// 持有"草药学笔记"时，制药效果 +20%
{
  id: 'herb_note',
  name: '草药学笔记',
  type: 'misc',
  weight: 0.5,
  rules: [
    {
      id: 'herb_note_boost',
      condition: new CompositeCondition('and', [
        new ActionCategoryCondition('制药'),
        new HasItemCondition('草药学笔记'),
      ]),
      effects: [new ModifierEffect('craft_quality', 'multiply', 1.2)],
    },
  ],
}
```

---

## 五、技能系统

### 5.1 技能定义

```typescript
interface SkillDefinition {
  id: string
  name: string
  category: SkillCategory
  /** 最高等级 */
  maxLevel: number
  /** 每级效果 */
  levelEffects: SkillLevelEffect[]
}

enum SkillCategory {
  生存 = 'survival',
  战斗 = 'combat',
  社交 = 'social',
  工艺 = 'craft',
  知识 = 'knowledge',
  特殊 = 'special',
}

interface SkillLevelEffect {
  level: number
  /** 解锁的行动 ID */
  unlockActions?: string[]
  /** 属性修正 */
  modifiers?: AttributeModifier[]
  /** 规则（通过规则系统） */
  rules?: Rule[]
  /** 突破叙事 */
  narrativeOnLevelUp?: string
}
```

### 5.2 技能对行动的门控

```
野外生存 Lv.0 → ❌ 【探索】追踪（隐藏）
野外生存 Lv.1 → ✅ 【探索】追踪（基础——发现普通痕迹）
野外生存 Lv.3 → ✅ 【探索】追踪（高级——能追踪魔物）
野外生存 Lv.5 → ✅ 【探索】设陷阱（新增行动）

交涉 Lv.0 → 交易价格 = 标准价 × 100%
交涉 Lv.2 → 交易价格 = 标准价 × 90%
交涉 Lv.5 → 解锁【社交】讨价还价行动
```

```typescript
// 行动定义中增加：
const actionDef = {
  id: 'track_prey',
  name: '追踪猎物',
  category: '探索',
  requirements: {
    spCost: 15,
    skills: [  // ← 技能需求
      { skillId: 'survival', minLevel: 1 },
    ],
  },
}
```

### 5.3 技能升级机制

```
每次使用 → 获得经验
经验满 → 升级 → 解锁新行动/获得修正
```

```typescript
interface SkillProgression {
  skillId: string
  currentLevel: number
  currentXp: number
  /** 升级所需经验 = baseXp * level^1.5 */
  xpToNextLevel: number
}

function calculateXpToLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5))
}

// 每使用一次相关行动：
function gainSkillXp(skillId: string, amount: number = 10): void {
  const skill = player.skills[skillId]
  skill.currentXp += amount

  if (skill.currentXp >= calculateXpToLevel(skill.currentLevel)) {
    skill.currentLevel++
    skill.currentXp = 0
    // 触发升级效果
    applyLevelUpEffects(skillId, skill.currentLevel)
  }
}
```

### 5.4 技能组合检定

某些高难度行动需要**多个技能组合**：

```typescript
// "制药"需要：草药学 Lv.2 + 医术 Lv.1
const actionDef = {
  id: 'craft_potion',
  name: '制作治疗药水',
  requirements: {
    spCost: 20,
    skills: [
      { skillId: 'herbalism', minLevel: 2 },
      { skillId: 'medicine', minLevel: 1 },
    ],
    items: [{ itemId: 'herb', minQuantity: 2, consumed: true }],
  },
}

// 技能不够时 → 显示缺哪一项
// "需要：草药学 Lv.2（当前 Lv.1）、医术 Lv.1（当前 Lv.1）"
```

---

## 六、点数/资源系统

### 6.1 回合资源

```typescript
interface TurnResources {
  /** 每日时段（共 7 个） */
  timeBlocks: {
    total: 7          // 一天 7 时段
    current: number   // 当前时段序号
    remaining: number // 本日剩余时段
  }

  /** 体力预算（每个行动消耗不等） */
  stamina: {
    current: number
    max: number
    /** 自然恢复量（跨过休息时段时） */
    restRecovery: number
  }
}
```

### 6.2 行动消耗矩阵

每个行动消耗不同的资源组合，由**当前状态动态调整**：

```typescript
function getActionCost(actionId: string, ctx: TurnContext): ActionCost {
  const base = ACTION_BASE_COSTS[actionId]

  // 规则系统修正
  const modifiers = ruleEngine.evaluateAll(ctx, getRelevantRules(ctx))

  return {
    timeBlocks: applyModifiers(base.timeBlocks, modifiers, 'timeBlocks'),
    sp: applyModifiers(base.sp, modifiers, 'sp'),
    items: base.items,  // 物品消耗不受规则修正
  }
}

// 基础消耗表
const ACTION_BASE_COSTS: Record<string, ActionCost> = {
  '砍柴':      { timeBlocks: 1, sp: 20 },
  '轻度工作':  { timeBlocks: 1, sp: 10 },
  '探索':      { timeBlocks: 1, sp: 15 },
  '长途移动':  { timeBlocks: 3, sp: 30 },
  '休息':      { timeBlocks: 1, sp: 0 },   // 回复 20 SP
  '深度休息':  { timeBlocks: 2, sp: 0 },   // 回复 40 SP
  '社交':      { timeBlocks: 1, sp: 5 },
  '战斗':      { timeBlocks: 1, sp: 25 },
}
```

### 6.3 动态消耗示例

```
基础砍柴消耗: 1 时段, 20 SP

规则修正后:
  雨天(×1.5 SP) + 疲劳(×1.2 SP) + 工具"铁斧"(×0.7 SP)
  = 20 × 1.5 × 1.2 × 0.7 = 25.2 SP
  → 实际消耗: 1 时段, 26 SP
```

---

## 七、行动门控引擎（核心）

### 7.1 门控检查流程

```
每回合生成行动列表时：

// 第一步：收集预定义行动（所有可能注册的行动）
// 第二步：AI 提供上下文临时行动（DeepSeek 根据叙事生成）
// 第三步：合并去重 → 对每个行动跑门控检查

for (每个候选行动) {
  ├── 1. 时间门控
  │   当前时段是否允许此行动？ → 否 → ❌ 隐藏
  │
  ├── 2. 属性门控
  │   SP/MP/HP 是否满足最低要求？ → 否 → ❌ 隐藏
  │   （但"休息"类行动不受此限——你永远可以休息）
  │
  ├── 3. 状态门控
  │   当前状态是否封锁此行动？ → 是 → ❌ 隐藏
  │   当前状态是否解锁此行动？ → 是 → ✅ 显示
  │
  ├── 4. 心理状态门控
  │   当前心理状态（恐惧/愤怒/愧疚等）是否禁止此行动？ → 是 → ❌ 隐藏
  │   是否有心理状态解锁的专属行动？ → 是 → ✅ 显示
  │
  ├── 5. 性格门控
  │   角色性格是否不匹配此行动？ → 是 → ❌ 隐藏
  │   角色性格是否特别适合此行动？ → 是 → ✅ 标记"擅长"
  │
  ├── 6. 物品门控
  │   需要工具？有吗？ → 无 → ⚠️ 灰色 + "需要：xxx"
  │
  ├── 7. 技能门控
  │   需要技能等级？够吗？ → 不够 → ⚠️ 灰色 + "需要：xxx Lv.X"
  │
  ├── 8. NPC 性格门控（社交类行动）
  │   NPC 性格是否排斥此行动？ → 是 → ❌ 隐藏
  │   好感度是否达标？ → 不够 → ⚠️ 灰色 + "信任不足"
  │   是否触犯 NPC 雷区？ → 是 → ❌ 隐藏（但仍然可用——后果自负）
  │
  ├── 9. 地点门控
  │   此行动是否需要特定设施？ → 当前地点有吗？ → 无 → ❌ 隐藏
  │   此行动是否需要特定地点 tag？ → 当前地点符合吗？ → 否 → ❌ 隐藏
  │   此行动是否需要 NPC 在场？ → NPC 在当前地点吗？ → 否 → ❌ 隐藏
  │
  └── 10. 通过所有门控 → ✅ 显示为可用行动
}
```

### 7.2 门控的三种结果

```typescript
type GateResult =
  | { available: true }
  | { available: false; reason: string; unlockHint?: string }

// 示例
[
  { id: 1, title: '砍柴',     available: true },
  { id: 2, title: '采矿',     available: false, reason: '需要：铁镐' },
  { id: 3, title: '追踪猎物', available: false, reason: '需要：野外生存 Lv.1' },
  { id: 4, title: '和沈清岚深谈', available: false, reason: '需要好感度 ≥ 30（当前 25）' },
  { id: 5, title: '休息',     available: true },
]
```

### 7.3 性格门控

角色的**性格特质**会影响哪些行动可用。性格不是固定的——它在游戏中通过玩家的选择逐渐形成。

```typescript
interface PersonalityTrait {
  id: string
  name: string
  /** 当前值（0-100），越高越倾向该特质 */
  value: number
  /** 每次相关选择的变化量 */
  shiftAmount: number
}

/** 角色的性格档案 */
interface PersonalityProfile {
  /** 善良-冷酷 (0=冷酷, 100=善良) */
  kindness: number
  /** 勇敢-谨慎 (0=谨慎, 100=勇敢) */
  bravery: number
  /** 理性-感性 (0=感性, 100=理性) */
  rationality: number
  /** 独立-依赖 (0=依赖, 100=独立) */
  independence: number
  /** 诚实-狡诈 (0=狡诈, 100=诚实) */
  honesty: number
}
```

**性格如何门控行动：**

```
善良 ≥ 70 → 解锁【社交】救济穷人（消耗 10 银币，获得声望）
善良 ≤ 30 → 解锁【社交】敲诈勒索（获得银币，损失声望）
善良 < 20 → 隐藏【社交】帮助他人（"你没这个想法"）

勇敢 ≥ 60 → ✅ 【探索】进入危险区域
勇敢 ≤ 40 → ⚠️ "你感到害怕"（灰色，可选——强行进入会获得"恐惧"状态）

理性 ≥ 50 → ✅ 【社交】理性谈判（好感度变化小但稳定）
理性 < 50 → ✅ 【社交】情感倾诉（好感度变化大但风险高）
```

**性格在行动中的体现——同一个行动，不同性格有不同叙事：**

```
砍柴：
  善良 ≥ 50 → "你担心这片林子被砍光，只取了些枯枝。"
  善良 < 50 → "你挑了几棵好树，利落地砍倒了。"

和沈清岚对话：
  勇敢 ≥ 60 → "你直接问了那个最敏感的问题。"
  勇敢 < 60 → "你绕了几个弯，最终还是没敢开口。"
```

**性格由 AI 动态评估：**

每回合结束时，AI 可以评估玩家在这次行动中展现的性格倾向，微调性格值：

```typescript
// AI 在生成叙事时可以附带性格调整建议
interface AiPersonalityAdjustment {
  trait: keyof PersonalityProfile
  shift: number  // -5 ~ +5
  reason: string // "玩家选择了帮助弱者 → 善良 +3"
}

// TurnManager 收到后应用
function applyPersonalityShift(adjustment: AiPersonalityAdjustment): void {
  player.personality[adjustment.trait] = clamp(
    player.personality[adjustment.trait] + adjustment.shift,
    0, 100,
  )
}
```

### 7.4 心理状态门控

除了 MP（精神数值），还有更细粒度的**心理状态**：

```typescript
interface PsychologicalState {
  /** 当前心理状态标识 */
  current: '正常' | '焦虑' | '恐惧' | '愤怒' | '悲伤' | '愧疚' | '偏执' | '鼓舞'

  /** 心理状态的来源事件 */
  sourceEvent?: string

  /** 持续回合数 */
  duration: number

  /** 特定触发源（如"怕蜘蛛"——看到蜘蛛相关触发恐惧） */
  triggers?: Array<{
    condition: Condition
    forcedState: string
  }>
}
```

**心理状态的门控：**

```
正常 → 所有行动正常可用

恐惧 → ❌ 封锁【探索】类行动
     → ❌ 封锁【社交】和陌生人交谈
     → ✅ 解锁【社交】向信赖的人寻求安慰（新行动）
     → 叙事："你的手还在抖。"

愤怒 → ✅ 解锁【战斗】全力攻击（攻击 +30%，防御 -20%）
     → ❌ 封锁【社交】礼貌交谈
     → ⚠️ 【社交】所有社交选项标记"你正在气头上"

愧疚 → ⚠️ 面对相关NPC时，社交选项显示"你不敢看她的眼睛"
     → 🔓 解锁【行动】道歉/补偿（如果物品栏有相关物品）

偏执 → ❌ 封锁【社交】信任他人
     → ✅ 解锁【探索】仔细检查每个角落
     → 叙事："你觉得有人在盯着你。"
```

**心理状态的演变（因果链）：**

```
你亲眼看到同伴受伤
  → 获得"愧疚"状态（持续 20 回合）
  → 如果 20 回合内没有采取补救行动 → 愧疚加深为"偏执"
  → 如果采取了补救 → 愧疚转为"决心"
  → 决心持续期间 → 相关行动效果 +30%
```

### 7.5 NPC 性格对社交门控的影响

NPC 也有性格，直接影响玩家对它的社交选项：

```typescript
interface NpcPersonality {
  personality: PersonalityProfile  // 同样的五维
  /** 社交风格 */
  communicationStyle: 'direct' | 'indirect' | 'warm' | 'cold' | 'formal'
  /** 好感度阈值解锁 */
  affectionThresholds: Array<{
    threshold: number
    unlockAction: string
    narrative: string
  }>
  /** 雷区——触碰会降好感 */
  taboos: Array<{
    actionId: string
    affectionPenalty: number
    reactionNarrative: string
  }>
}
```

**NPC 性格影响示例：**

```
沈清岚 (理性型, 好感 55):
  ├── 好感 ≥ 20 → ✅ 【社交】请教问题 → "你说说看。"
  ├── 好感 ≥ 50 → ✅ 【社交】讨论计划 → "你的方案有漏洞，这里……"
  ├── 好感 ≥ 80 → ✅ 【社交】分享心事（解锁——只有高好感才有）
  └── 雷区 ❌ 【社交】轻浮玩笑 → 好感 -10 "她皱眉看了你一眼"

格兰 (务实型, 好感 25):
  ├── 好感 ≥ 0  → ✅ 【社交】请求帮忙打猎
  ├── 好感 ≥ 40 → ✅ 【社交】打听暮河镇消息
  ├── 好感 ≥ 70 → ✅ 【社交】请他训练你（解锁——提升战斗技能）
  └── 雷区 ❌ 【社交】浪费食物 → 好感 -15 "格兰脸色不太好看"
```

### 7.6 AI 提供的上下文行动

这是文字冒险区别于普通 RPG 的关键——AI 能根据**叙事上下文**动态生成不在预定义列表中的行动。

```typescript
interface AiGeneratedAction {
  id: string              // 临时 ID，格式 "ai_<turn>_<index>"
  title: string
  description: string
  category: 'ai_generated'
  /** 是否仅此回合有效 */
  isEphemeral: true
}
```

**AI 行动的来源：**

```
叙事上下文 → AI 觉得"这里玩家应该能做点特别的事" → 生成临时行动

例子：
  叙事: "你注意到墙角的地砖有一块颜色不太一样。"
  AI 生成行动: 【调查】检查那块地砖（可能发现暗格）

  叙事: "远处的树林里闪过一个人影。"
  AI 生成行动: 【追踪】追上去看看（也可能选择无视）

  叙事: "沈清岚的手在发抖，但她什么都没说。"
  AI 生成行动: 【关心】问她怎么了（好感变化）
```

**AI 行动与预定义行动的关系：**

```
行动列表 = 预定义行动（通过门控引擎过滤） + AI 生成行动（由 DeepSeek 提供）

预定义行动            AI 生成行动
────────────           ────────────
砍柴                  检查那块松动的地砖
休息                  追那个闪过的人影
和沈清岚交谈          问她在发抖什么
探索周边              去看看那扇半掩的门
```

AI 行动总是放在列表末尾，用 `[AI]` 标记区分：

```
1. 【工作】砍柴（消耗 1 时段）
2. 【社交】和沈清岚交谈（消耗 1 时段）
3. 【休息】休息一会儿（消耗 1 时段）
4. [AI] 检查墙角那块颜色不一样的地砖
5. [AI] 问沈清岚手为什么在发抖
```

### 7.7 特殊情况：强制行动

某些情况下，系统强制插入行动（不在常规列表里）：

```typescript
interface ForcedAction {
  id: string
  title: string
  description: string
  /** 强制原因 */
  reason: 'status_triggered' | 'event_triggered' | 'npc_initiated'
  /** 是否可拒绝 */
  isOptional: boolean
}

// 示例：
// HP ≤ 20 → 强制插入"包扎伤口"（可用药品时）
// 中毒 → 强制插入"服用解毒剂"（有解药时）
// NPC 找你 → 强制插入"和 xxx 对话"
```

### 7.4 行动分类（完整列表）

```typescript
enum ActionCategory {
  // ─── 生存类 ───
  休息 = 'rest',           // 恢复 HP/SP/MP
  进食 = 'eat',            // 消耗食物，恢复 HP/SP
  治疗 = 'heal',           // 使用药品

  // ─── 工作类 ───
  砍柴 = 'chop_wood',      // 获得燃料
  采集 = 'forage',         // 获得食物/材料
  采矿 = 'mine',           // 获得矿石
  建造 = 'build',          // 建设设施
  制作 = 'craft',          // 制作物品
  种植 = 'farm',           // 农业

  // ─── 探索类 ───
  探索 = 'explore',        // 侦察周围
  追踪 = 'track',          // 追踪目标
  调查 = 'investigate',    // 调查特定目标

  // ─── 社交类 ───
  交谈 = 'talk',           // 普通对话
  深谈 = 'deep_talk',      // 深入交流（好感度要求）
  交易 = 'trade',          // 交易物品
  赠送 = 'gift',           // 赠送礼物

  // ─── 移动类 ───
  移动 = 'move',           // 前往相邻地点
  长途移动 = 'travel',     // 长途旅行

  // ─── 战斗类 ───
  攻击 = 'attack',         // 战斗
  防御 = 'defend',         // 防御姿态
  逃跑 = 'flee',           // 脱离战斗

  // ─── 特殊类 ───
  自定义 = 'custom',       // 玩家自由输入
}
```

---

## 八、行动门控完整示例

### 场景：清晨，体力 25/100，精神 60/100，持有"短刀"，技能"野外生存 Lv.2"
### 性格：善良 65、勇敢 40、理性 70、独立 55、诚实 80
### 心理状态：正常（但上一回合目睹了伤人事件）
### 当前地点：灰丘（废弃高地，有木屋和坍塌储藏坑）
### 附近NPC：沈清岚（理性型，好感 25）

```
门控引擎计算结果（含性格/心理/AI）：

┌─────────────────────────────────────────────┐
│ 📋 可选行动                                   │
├─────────────────────────────────────────────┤
│                                              │
│ 1. 【休息】休息一会儿（恢复 20 SP）           │ ✅
│    任何时候都可用                             │
│                                              │
│ 2. 【探索】在周边侦察（消耗 15 SP）           │ ⚠️
│    体力 25 ≥ 15 ✓ 时段=清晨 ✓               │
│    但勇敢=40 < 50 → "你还有些犹豫"            │
│    （可用，但叙事会表现你的犹豫）              │
│                                              │
│ 3. 【探索】追踪猎物（消耗 20 SP）            │ ❌
│    勇敢=40 < 50 → "你不太敢独自深入林中"     │
│    （性格门控——被你自己的谨慎挡住了）          │
│                                              │
│ 4. 【工作】砍柴（消耗 20 SP）                │ ❌
│    体力 25 < 最小要求 30                     │
│                                              │
│ 5. 【社交】和沈清岚交谈（消耗 5 SP）          │ ✅
│    体力 25 ≥ 5 ✓ 诚实=80 > 70 → "你决定坦诚"│
│    （性格正向影响——对话叙事会更直接真诚）      │
│                                              │
│ 6. 【社交】和沈清岚深谈（消耗 5 SP）          │ ❌
│    理性型NPC + 好感25 < 30 → "她还不够信任你"│
│    （NPC性格门控）                            │
│                                              │
│ 7. 【社交】向沈清岚倾诉（消耗 5 SP）          │ ✅
│    善良=65 > 60 → 当你状态不好时愿意寻求安慰 │
│    （心理状态"目睹伤人" + 性格解锁的专属行动） │
│    → "你憋了一晚上了，也许该和她说说。"       │
│                                              │
│ 8. 【建设】修缮储藏坑（消耗 2 时段, 30 SP）  │ ✅
│    地点门控：灰丘有"坍塌储藏坑"设施 ✓        │
│    "储藏坑里全是塌方的泥土和碎石。"           │
│    （仅当玩家在灰丘时显示）                    │
│                                              │
│ 9. 【采集】采集药草（消耗 1 时段, 15 SP）    │ ✅
│    地点门控：灰丘有可采集的野药草 ✓          │
│    需要短刀 ✓ 体力 25 ≥ 15 ✓                 │
│                                              │
│ 10. 【移动】前往苇水村（消耗 1 时段, 10 SP） │ ✅
│    地点门控：灰丘的 connections 包含苇水村 ✓ │
│    路径状态: open ✓                           │
│                                              │
│ 11. [AI] 去看看昨晚那片灌木丛                 │ ✅
│    AI 根据叙事上下文生成：                     │
│    "昨晚你好像看到那边有人影"                  │
│    （仅此回合有效，不选就没了）                │
│                                              │
│ 12. [AI] 问问沈清岚昨晚听到什么没有           │ ✅
│    AI 生成的社交选项                           │
│    （仅当沈清岚在当前地点时显示）              │
│                                              │
└─────────────────────────────────────────────┘
```

---

## 九、与规则系统的关系

角色系统的门控逻辑和规则系统的评估是**同一套机制**：

```
规则系统 (RuleEngine) — 通用条件评估
  │
  ├── 天气规则: 雨天 SP ×1.5
  ├── 地点规则: 旅馆休息 HP +10
  ├── 物品规则: 持有药草时制药 +20%
  │
  └── 行动门控: 技能不够 → 灰色显示
                体力不够 → 隐藏
                状态封锁 → 隐藏
```

**两者关系：**

| | 规则系统 (RuleEngine) | 行动门控 (ActionGating) |
|--|----------------------|------------------------|
| 职责 | "条件满足时修改数值/触发效果" | "条件不满足时隐藏/禁用行动" |
| 评估时机 | 每回合执行阶段 6 | 每回合生成行动列表时 |
| 输出 | modifiers / pendingEvents | available/hidden/greyed out |
| 共同点 | 都用 Condition 做判断 | 都用 Condition 做判断 |

行动门控可以**复用规则系统的 Condition**：

```typescript
// 同一个 Condition 类，两种用途
const survivalCheck = new SkillCondition('survival', '>=', 1)

// 规则系统：技能满足时获得 foraging 加成
ruleEngine.addRule({
  condition: survivalCheck,
  effects: [new ModifierEffect('forageYield', 'add', 2)],
})

// 行动门控：技能不满足时隐藏"追踪"行动
actionGating.addGate('track', {
  condition: survivalCheck,
  // 不满足时的处理
  onFailed: { hide: true, reason: '需要：野外生存 Lv.1' },
})
```

---

## 十、代码结构规划

```
apps/api/src/engine/
├── character/
│   ├── attributes.ts          # 属性定义 + 计算
│   ├── status-effects.ts      # 状态效果定义 + 生命周期
│   ├── status-effect.factory.ts # 内置状态工厂
│   └── status-manager.ts      # 状态管理器（tick/apply/expire）
│
├── items/
│   ├── item.types.ts          # 物品类型定义
│   ├── item-database.ts       # 物品数据（预置物品列表）
│   ├── inventory.ts           # 背包逻辑（增删改查）
│   └── equipment.ts           # 装备系统
│
├── skills/
│   ├── skill.types.ts         # 技能定义
│   ├── skill-database.ts      # 技能数据
│   ├── skill-manager.ts       # 技能管理（升级/经验）
│   └── skill-effects.ts       # 技能效果（升级解锁）
│
├── personality/
│   ├── personality-profile.ts  # 性格五维定义
│   ├── personality-gate.ts     # 性格门控检查器
│   └── personality-evolution.ts # 性格演变逻辑
│
├── psychology/
│   ├── psychological-state.ts  # 心理状态定义
│   ├── psychology-gate.ts      # 心理状态门控
│   └── psychology-evolution.ts # 心理状态演变
│
├── gating/
│   ├── action-gating.ts        # 行动门控引擎（核心）
│   ├── gate-checkers.ts        # 各门控检查器
│   │   ├── time-gate.ts        #   时段门控
│   │   ├── attribute-gate.ts   #   属性门控
│   │   ├── status-gate.ts      #   状态门控
│   │   ├── psychology-gate.ts  #   心理状态门控
│   │   ├── personality-gate.ts #   性格门控
│   │   ├── skill-gate.ts       #   技能门控
│   │   ├── item-gate.ts        #   物品门控
│   │   ├── location-gate.ts      # 地点门控（设施/NPC在场/地点tag）
│   └── relationship-gate.ts   # 关系+NPC性格门控
│   ├── action-registry.ts      # 所有行动的定义注册
│   └── ai-action-generator.ts  # AI 上下文行动生成
│
└── modifiers/
    └── modifier-resolver.ts   # 修正值解析器
```
