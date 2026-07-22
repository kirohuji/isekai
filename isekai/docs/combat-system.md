# 战斗系统设计

> 自动结算、叙事驱动、非交互

---

## 一、核心设计：自动结算

战斗不是独立子系统——它是**一个行动类型**，选了就自动算结果，不进入战斗界面。

```
玩家选择 [战斗] 攻击腐兽
  │
  ├── 系统自动结算（无需玩家操作）
  ├── 生成战斗叙事
  └── 回到常规回合
```

### 战斗 vs 常规行动

| | 常规行动（砍柴/采集/交谈） | 战斗行动 |
|--|--------------------------|---------|
| 交互方式 | 选 → 消耗 → 结果 | 选 → 自动结算 → 叙事 |
| 消耗 | SP + 时段 | SP + 时段 + 可能有物品消耗 |
| 结果 | 确定的（成功/失败） | 概率的（胜负/伤亡/逃跑） |
| 叙事 | 模板拼接 | 根据战况动态生成 |

---

## 二、战斗结算

### 2.1 战力计算

```typescript
interface CombatPower {
  /** 基础攻击力 */
  attack: number
  /** 基础防御力 */
  defense: number
  /** 速度（决定先手/逃跑成功率） */
  speed: number
  /** 命中率修正 */
  accuracy: number
  /** 闪避率修正 */
  evasion: number
}

function calculateCombatPower(entity: CombatEntity, ctx: TurnContext): CombatPower {
  let attack = entity.baseAttack
  let defense = entity.baseDefense

  // 装备修正
  if (entity.equipment?.weapon) attack += entity.equipment.weapon.attackBonus
  if (entity.equipment?.armor) defense += entity.equipment.armor.defenseBonus

  // 状态修正
  if (entity.statusEffects.has('鼓舞')) attack = Math.floor(attack * 1.2)
  if (entity.statusEffects.has('重伤')) attack = Math.floor(attack * 0.5)

  // 技能修正
  if (entity.skills?.战斗) attack += entity.skills.战斗.level * 2

  return { attack, defense, speed: entity.baseSpeed, accuracy: 0.9, evasion: 0.1 }
}
```

### 2.2 胜负判定

```typescript
interface CombatResult {
  winner: 'player' | 'enemy' | 'flee' | 'draw'
  playerHpLost: number
  enemyHpLost: number
  enemyDefeated: boolean
  itemsConsumed: string[]
  narrative: string
  duration: number           // 消耗的时段数
  spCost: number
}

function autoResolve(
  player: CombatEntity,
  enemy: CombatEntity,
  ctx: TurnContext,
): CombatResult {
  const pp = calculateCombatPower(player, ctx)
  const ep = calculateCombatPower(enemy, ctx)

  // 战力比
  const powerRatio = (pp.attack + pp.defense) / (ep.attack + ep.defense + 1)

  // 基础胜负概率
  const winChance = 0.3 + powerRatio * 0.4  // 0.3~0.7 范围
  const fleeChance = pp.speed / (pp.speed + ep.speed + 1) * 0.5

  const roll = Math.random()

  if (roll < fleeChance) {
    return buildFleeResult(player, enemy, ctx)
  } else if (roll < fleeChance + winChance) {
    return buildWinResult(player, enemy, ctx)
  } else {
    return buildLoseResult(player, enemy, ctx)
  }
}
```

### 2.3 三种结果

```typescript
function buildWinResult(player: CombatEntity, enemy: CombatEntity, ctx: TurnContext): CombatResult {
  const hpLoss = Math.max(1, enemy.attack - player.defense + random(0, 5))
  return {
    winner: 'player',
    playerHpLost: hpLoss,
    enemyHpLost: enemy.maxHp,
    enemyDefeated: true,
    itemsConsumed: [],
    narrative: generateCombatNarrative('win', player, enemy, hpLoss, ctx),
    duration: 1,
    spCost: 25,
  }
}

function buildLoseResult(...): CombatResult {
  // 玩家不会死——在 HP 归零前强制逃跑
  // 但会承受损失：HP 损失、可能掉落物品
}

function buildFleeResult(...): CombatResult {
  // 成功逃脱，无损失但消耗了时段
}
```

### 2.4 战斗叙事

```typescript
function generateCombatNarrative(
  outcome: 'win' | 'lose' | 'flee',
  player: CombatEntity,
  enemy: CombatEntity,
  hpLoss: number,
  ctx: TurnContext,
): string {
  const templates = NARRATIVE_TEMPLATES[outcome]

  // 根据场景替换参数
  let narrative = randomFrom(templates)
  narrative = narrative.replace('{enemy}', enemy.name)
  narrative = narrative.replace('{damage}', String(hpLoss))

  // 如果有装备/技能，加入细节
  if (player.equipment?.weapon) {
    narrative += `你的${player.equipment.weapon.name}上沾着${enemy.name}的血。`
  }

  return narrative
}

const NARRATIVE_TEMPLATES = {
  win: [
    '你侧身闪过{enemy}的扑击，趁它重心不稳时狠狠还击。它倒下了。',
    '{enemy}比你想象的弱。几个回合下来，它就不再动弹了。',
    '你抓住{enemy}的一个破绽——干净利落地解决了。',
  ],
  lose: [
    '{enemy}比你强。你勉强挡住了几次攻击，但身上已经多了{damage}处伤口。你不得不撤退。',
    '你被打退了。{enemy}的爪子在肩上抓出一道血痕，火辣辣地疼。',
  ],
  flee: [
    '你判断这不是能赢的战斗。趁{enemy}还没扑上来，你转身就跑。',
    '你边打边退，在{enemy}追上之前消失在了树林里。',
  ],
}
```

### 2.5 特殊敌人属性

```typescript
interface EnemyDef {
  id: number
  name: string
  baseAttack: number
  baseDefense: number
  baseSpeed: number
  maxHp: number
  /** 掉落物品 */
  loot?: Array<{ itemId: string; chance: number; quantity: number }>
  /** 特殊能力 */
  abilities?: EnemyAbility[]
  /** 叙事描述（首次遭遇时展示） */
  description: string
}

interface EnemyAbility {
  name: string
  narrative: string
  effect: (ctx: TurnContext) => void
}
```

---

## 三、战斗与回合系统的集成

战斗作为`PLAYER_ACTION`的一个子类型：

```
阶段 4: PLAYER_ACTION
  └── 玩家选择 [战斗]
      ├── 校验：目标是否存在、SP 是否足够
      ├── 自动结算（autoResolve）
      ├── 扣除消耗（时段 + SP + 物品）
      └── 记录结果

阶段 5: ACTION_RESULT
  └── 展示战斗叙事

阶段 6: RULE_EVALUATE
  └── 战斗相关的规则（装备/技能/状态）

阶段 7: NPC_PHASE
  └── 附近的 NPC 对战斗的反应
```

---

## 四、代码结构

```
apps/api/src/engine/combat/
├── combat.types.ts           # CombatPower, CombatResult, EnemyDef
├── combat-resolver.ts        # 自动结算（战力计算/胜负判定）
├── combat-narrative.ts       # 战斗叙事生成
├── combat-rules.ts           # 战斗规则绑定
└── enemy-data.ts             # 敌人数据
```
