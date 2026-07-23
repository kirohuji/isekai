# 灰丘领主 · 后端架构设计 · v3

## 一、核心理念

> **规则引擎驱动一切。AI 只负责填充数据，不参与核心逻辑。**

```
┌─────────────────────────────────────────────────────────┐
│                     游戏主循环                            │
│                                                         │
│  所有角色提交意图 → 同步结算 → 规则评估 → 效果应用        │
│       ↑                                    ↓            │
│       └──── 新状态 ← 事件记录 ← 因果链 ←──┘            │
└─────────────────────────────────────────────────────────┘
```

---

## 二、Entity 体系（5 大实体）

每个 Entity 都是 `{ id, type, state }` 结构，state 随回合变化。

### 1. Actor（角色）
```
{
  id, name, race, gender, alive,
  stats:     { health, maxHealth, mental, maxMental, stamina, maxStamina, hunger },
  combat:    { attack, defense, agility },
  attributes:{ insight, composure, tenacity, charisma, cunning },
  skills:    [{ name, level }],
  statusEffects: [{ type, magnitude, remainingTurns }],
  // 关系
  locationId,
  factionId,
  relations:  [{ targetId, affection(-100~100), trust(0~100), status }],
  // 身份
  isPlayer, partyRole, employment, enslaved(ownerId?, type?, obedience?, fear?),
  // 随身
  inventory:  [{ itemId, quantity }],
  gold,
}
```

### 2. Location（地点）
```
{
  id, name, region, description,
  features: ['shelter','bed','water','temple','market','tavern','wild'],
  type: 'town'|'city'|'village'|'wild'|'border',
  connections: [{ targetId, travelCost }],
  isSafe,
  population,
  controllingFaction,
  // 地点上的人/物
  presentActors: [actorId],
  groundItems: [{ itemId, quantity }],
  // 地点拥有的服务
  services: ['trade','rest','heal','pray','train'],
}
```

### 3. Faction（势力）
```
{
  id, name, type: 'kingdom'|'church'|'guild'|'village'|'tribe'|'bandit',
  stats: { totalPop, activePop, avgCombat, morale, food, gold },
  relations: { factionId → attitude(-100~100) },
  currentFocus: 'expanding'|'defending'|'trading'|'raiding',
}
```

### 4. Item（物品）
```
{
  id, name, type: 'food'|'weapon'|'armor'|'medicine'|'material'|'tool'|'document'|'misc',
  rarity: 'common'|'uncommon'|'rare'|'legendary',
  baseValue,
  // 效果（佩戴/使用时触发 Rule）
  equipEffects: [RuleEffect],
  useEffects: [RuleEffect],
  // 谁持有
  ownerId: actorId | locationId | null,
  quantity,
}
```

### 5. Rule（规则 — 核心抽象）
```
{
  id, name, description,
  category: 'status'|'location'|'weather'|'relationship'|'item'|'quest'|'world'|'ai',
  // 触发条件
  conditions: [Condition],        // 全部 AND
  // 效果
  effects: [Effect],
  // 生命周期
  duration: number,               // 0=条件满足时永久激活
  removalConditions: [Condition], // 提前解除
  // 因果链
  source: string,                 // 描述来源
  causedBy: [ruleId],             // 父规则
  priority: number,               // 执行顺序
  activeSince: round,
}
```

---

## 三、Condition 系统（所有条件可组合）

| 条件类型 | 参数 | 示例 |
|---|---|---|
| `actor.stat` | actorId, stat, op(lt/gt/lte/gte/eq), value | 玩家生命<30 |
| `actor.has_status` | actorId, statusType | 玩家有"受伤" |
| `actor.has_item` | actorId, itemType | 玩家有"食物" |
| `actor.has_relation` | actorId, targetId, minAffection | 玩家对沈清岚好感>50 |
| `actor.at_location` | actorId, locationId | 玩家在旅馆 |
| `actor.did_action` | actorId, actionKind | 玩家执行了探索 |
| `location.has_feature` | locationId, feature | 地点有"床" |
| `location.has_service` | locationId, service | 地点有"交易" |
| `location.type_is` | locationId, type | 地点是城镇 |
| `world.phase_is` | phase | 现在是夜晚 |
| `world.weather_is` | weather | 下雨 |
| `world.day_gte` | day | 第10天之后 |
| `world.round_mod` | n | 每5回合 |
| `faction.stat` | factionId, stat, op, value | 神殿士气<30 |
| `faction.relation` | factionId, targetId, op, value | 神殿对灰丘敌意>50 |
| `random.chance` | probability | 30%概率 |
| `flag.check` | flagName, value | 标记"已买旅馆"为true |
| `quest.is_active` | questId | 任务"逃亡"进行中 |
| `quest.is_complete` | questId | 任务"买旅馆"已完成 |
| `any` | conditions[] | OR 关系 |

---

## 四、Effect 系统（所有效果可组合）

| 效果类型 | 参数 | 示例 |
|---|---|---|
| `actor.mod_stat` | actorId, stat, delta | 生命+5 |
| `actor.add_status` | actorId, statusType, magnitude, duration | 获得"受伤"3级5回合 |
| `actor.remove_status` | actorId, statusType | 移除"中毒" |
| `actor.mod_relation` | actorId, targetId, affectionDelta, trustDelta | 好感-10 |
| `actor.mod_gold` | actorId, delta | 金币+50 |
| `actor.give_item` | actorId, itemId, quantity | 获得"面包"×3 |
| `actor.remove_item` | actorId, itemId, quantity | 消耗"药品"×1 |
| `actor.move_to` | actorId, locationId | 移动到旅馆 |
| `actor.die` | actorId, reason | 死亡 |
| `location.spawn_item` | locationId, itemId, quantity | 地面出现物品 |
| `location.spawn_actor` | locationId, actorTemplateId | NPC出现 |
| `faction.mod_stat` | factionId, stat, delta | 士气-10 |
| `faction.mod_relation` | factionId, targetId, delta | 态度-20 |
| `world.mod_weather` | weather, intensity, duration | 开始下雨 |
| `world.mod_stability` | delta | 全局稳定-5 |
| `quest.start` | questId | 开始任务 |
| `quest.complete` | questId | 完成任务 |
| `quest.fail` | questId | 任务失败 |
| `quest.add_objective` | questId, objectiveId | 添加子目标 |
| `rule.activate` | ruleId | 激活另一条规则 |
| `rule.deactivate` | ruleId | 停用另一条规则 |
| `event.trigger` | eventTemplateId | 触发叙事事件 |
| `intel.generate` | category, source, truthBase | 生成情报 |
| `narrative.hint` | topic, mood, importance | 告诉AI叙事要点 |
| `flag.set` | flagName, value | 设置标记 |

---

## 五、回合结算流程

```
每个回合 = 所有角色同步提交意图，然后按以下顺序结算：

Phase 0: 规则预评估
  ├─ 评估所有规则的 conditions
  ├─ 激活满足条件的规则
  └─ 停用条件不再满足的规则

Phase 1: 时间推进
  ├─ 时段前进（dawn→morning→...→night→dawn）
  ├─ 跨天：饥饿增长、自然恢复/伤害、每日消耗
  ├─ 天气衰减
  └─ 状态效果 tick（remainingTurns--）

Phase 2: 意图收集
  ├─ 玩家提交意图
  ├─ 核心NPC：AI辅助+规则决策
  └─ 普通NPC：统计采样+随机

Phase 3: 行动执行（按敏捷排序）
  ├─ 消耗体力/饥饿
  ├─ 移动、工作、探索、社交、战斗…
  └─ 产生即时效果

Phase 4: 冲突结算
  ├─ 同地点敌对角色自动战斗
  ├─ 逃跑判定
  └─ 死亡记录

Phase 5: 势力行动（统计层面）
  ├─ 劫掠/交易/扩张/收缩
  ├─ 人口增减
  └─ 资源消耗

Phase 6: 任务检查
  ├─ 检查所有活跃任务的 objectives
  ├─ 自动完成/失败判定
  └─ 触发任务相关规则

Phase 7: 规则后评估
  ├─ 基于本回合新状态重新评估规则
  ├─ 触发因果链规则
  └─ 应用规则效果

Phase 8: AI 介入（可选，不阻塞）
  ├─ 生成叙事文本（基于本回合事件）
  ├─ 每5回合：世界回顾（因果链+蝴蝶效应）
  ├─ 随机事件触发（AI判断时机）
  └─ 生成新规则建议

Phase 9: 持久化
  ├─ 保存世界快照
  ├─ 保存事件日志
  ├─ 保存叙事
  └─ 同步可变数据（inventory/quests/relations）
```

---

## 六、数据存储策略

| 数据类型 | 存储方式 | 原因 |
|---|---|---|
| WorldState（完整快照） | SQLite `games.state_json` | 单一事实来源，可回滚 |
| 回合事件 | SQLite `events` 表（每事件一行） | 因果链可追溯 |
| 叙事文本 | SQLite `narratives` 表 | 可检索、可回放 |
| 可变数据（inventory/quests/relations） | 独立表 + 回合同步 | 查询效率 |
| 静态模板（NPC/地点/物品/事件/行动） | SQLite `*_templates` 表 | 种子数据，AI 可扩充 |
| 配置/常量 | 引擎代码 `types.ts` | 规则逻辑，不常变 |

---

## 七、AI 职责边界

```
✅ AI 负责：
  - 开局：生成世界种子（传闻、天气、随机地点描述）
  - 开局：生成初始规则（根据难度+地点+职业）
  - 回合叙事：将"事实列表"变成沉浸式文本
  - 动态行动建议：基于状态+环境生成3-5个情境行动
  - NPC 决策辅助：为关键NPC提供行动建议文本
  - 规则生成：生成新的上下文规则（条件+效果）
  - 事件触发判断：评估"现在是否该触发事件"
  - 世界回顾（每5回合）：因果链+蝴蝶效应分析

❌ AI 不负责：
  - 规则条件评估（引擎计算）
  - 规则效果应用（引擎计算）
  - 战斗结算（引擎计算）
  - 数值计算（引擎计算）
  - 死亡判定（引擎计算）
  - 任何涉及游戏平衡的数值决策
```

---

## 八、关键设计原则

1. **引擎是纯函数** — 不调 AI、不写 DB、不访问网络
2. **规则是第一公民** — 所有游戏逻辑最终都是 Rule(Condition→Effect)
3. **因果链可追溯** — 每个事件都可追溯到其根因
4. **AI 是数据填充器** — 提供叙事血肉，不参与骨架逻辑
5. **同步回合制** — 所有人同时行动，因果同时产生
6. **抽象覆盖具体** — 一个 Rule 系统覆盖 1000 个硬编码逻辑
