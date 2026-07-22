// ============================================================
// 核心类型定义 · 异世界生存：灰丘领主
// ============================================================

/** 难度 */
export type Difficulty = 'story' | 'survival' | 'doom';

/** 人口规模（影响地图大小与NPC密度） */
export type PopulationScale = 'small' | 'medium' | 'large';

/** 时段（一天6个） */
export type Phase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night';

/** 四项核心生存属性 */
export type StatKey = 'health' | 'mental' | 'stamina' | 'hunger';

/** 行动类别 */
export type ActionKind =
  | 'move' | 'rest' | 'work' | 'explore' | 'socialize' | 'build' | 'trade'
  | 'combat' | 'scout' | 'hunt' | 'gather' | 'craft' | 'study' | 'pray' | 'wait'
  | 'eat' | 'sleep' | 'patrol' | 'train' | 'heal' | 'entertain' | 'night_interact';

/** 行动模板（存储在DB中，运行时按条件过滤） */
export interface ActionTemplate {
  id: string;
  kind: ActionKind;
  label: string;                // 显示名，如"在旅馆休息"
  detail?: string;              // 额外描述
  category: string;             // '生存'|'探索'|'经济'|'社交'|'建设'|'战斗'|'特殊'
  costPhases: number;           // 时段消耗
  costStamina: number;          // 体力消耗（负值=恢复）
  costHunger: number;           // 饥饿增长
  // 条件（全部满足才显示）
  conditions: ActionConditions;
}

export interface ActionConditions {
  locationType?: string[];       // 需要特定地点类型（'inn'|'market'|'wild'|'temple'|'any'）
  locationHas?: string[];        // 需要地点拥有（'shelter'|'water'|'bed'|'food_source'）
  phase?: Phase[];               // 需要特定时段
  requiresAsset?: string[];      // 需要拥有特定资产类型
  requiresPartySkill?: string;   // 需要队伍中有人拥有某技能
  requiresItem?: string;         // 需要持有某物品
  minStats?: Partial<Record<StatKey, number>>;  // 最低属性要求
  maxHunger?: number;            // 饥饿低于此值才能做
  playerOnly?: boolean;          // 只有玩家可执行
  emergencyAction?: boolean;     // 紧急行动（饥饿/残血时强制弹出）
}

/** 角色属性（用于技能检定） */
export interface Attributes {
  insight: number;   // 洞察
  composure: number; // 冷静
  tenacity: number;  // 坚韧
  charisma: number;  // 魅力
  cunning: number;   // 智谋
}

/** 角色技能 */
export interface Skill {
  name: string;
  level: number;      // 0-10
  experience: number; // 累计经验
}

/** 单个角色状态（用于个体追踪的角色） */
export interface CharacterState {
  id: string;
  name: string;
  race: string;           // 人类 / 亚人(狼系) / 亚人(猫系) / 魔族 等
  gender: 'male' | 'female';
  isPlayer: boolean;
  isCore: boolean;         // 是否为核心角色（重点追踪）
  alive: boolean;

  // 位置
  locationId: string;

  // 核心属性
  health: number;
  maxHealth: number;
  mental: number;
  maxMental: number;
  stamina: number;
  maxStamina: number;
  hunger: number;          // 0-100，越高越饿

  // 战斗属性
  combat: number;          // 攻击力
  defense: number;         // 防御力
  agility: number;         // 敏捷（影响行动顺序与逃跑）

  // 能力
  attributes: Attributes;
  skills: Skill[];

  // 状态效果
  statusEffects: StatusEffect[];

  // 关系
  factionId: string;       // 所属势力
  gold: number;            // 个人金币
  // 队伍
  partyRole?: 'leader' | 'member' | 'none'; // 在玩家队伍中的角色
}

/** 资产/契约 —— 抽象化：覆盖旅馆、土地、执照、合同等 */
export interface Asset {
  id: string;
  name: string;            // e.g. "旧鹿角旅馆契约"
  assetType: 'property' | 'business' | 'land' | 'license' | 'contract' | 'equipment';
  description: string;
  value: number;            // 市值（可出售价格）
  dailyIncome: number;      // 每日净收入（收入-维护费）
  dailyUpkeep: number;      // 每日维护费
  locationId: string;
  acquiredRound: number;
  isActive: boolean;
}

/** 雇佣关系 */
export interface Employment {
  id: string;
  employeeId: string;       // 被雇佣角色ID
  employerId: string;       // 雇主ID（通常是player）
  role: string;             // '厨娘', '守卫', '记账员', '农工' etc
  salary: number;           // 每日工资
  hiredRound: number;
  loyalty: number;          // 0-100，影响效率和是否离职
  isActive: boolean;
}

/** 队伍信息 */
export interface PartyInfo {
  leaderId: string;
  members: PartyMember[];
}

export interface PartyMember {
  characterId: string;
  role: string;             // '队长', '成员', '临时跟随'
  joinedRound: number;
}

/** 关系（双向） */
export interface Relationship {
  characterA: string;
  characterB: string;
  affection: number;       // -100 → +100
  trust: number;           // 0-100
  status: string;
  lastInteractionRound: number;
}

/** 奴隶状态 */
export interface SlaveState {
  ownerId: string;
  slaveType: 'labor' | 'domestic' | 'sex' | 'combat' | 'skilled';
  obedience: number;
  fear: number;
  breakingProgress: number;
  escapeAttempts: number;
  lastNightInteractRound: number;
}

/** 情报 */
export interface Intel {
  id: string;
  content: string;
  category: 'rumor' | 'military' | 'economic' | 'political' | 'personal' | 'threat';
  source: string;
  truthProbability: number; // 0-100
  acquiredRound: number;
  expiryDay: number;
  isVerified: boolean;
  relatedCharacterId?: string;
  relatedLocationId?: string;
}
// ============================================================
// 规则/效果引擎 —— 核心抽象
// ============================================================

/** 规则条件类型 */
export type ConditionType =
  | 'stat_check'       // {stat, op:'lt'|'gt'|'lte'|'gte', value}
  | 'location_has'     // {feature:'bed'|'shelter'|'water'|'temple'|'market'|'tavern'}
  | 'location_type'    // {type:'town'|'city'|'wild'|'village'|'border'}
  | 'phase_is'         // {phase:'night'|'dawn'|...}
  | 'weather_is'       // {weather:'rain'|'storm'|'clear'|'fog'|'snow'}
  | 'has_item'         // {itemType:'food'|'medicine'|'weapon'}
  | 'has_status'       // {statusType:'injured'|'sick'|'blessed'|'cursed'|'terrified'}
  | 'has_asset'        // {assetType:'property'|'license'|...}
  | 'has_relation'     // {withCharId, minAffection, maxAffection}
  | 'has_slave'        // {slaveType:'sex'|'labor'|...}
  | 'flag_check'       // {flagName, equals}
  | 'random_chance'    // {probability:0-1}
  | 'every_n_rounds'   // {interval}, fires when round % interval === 0
  | 'day_changed'      // {} fires when day increments
  | 'phase_changed'    // {} fires when phase changes
  | 'npc_nearby'       // {minCount, maxDistance}
  | 'player_did'       // {actionKind} — player performed specific action
  ;

/** 规则效果类型 */
export type EffectType =
  | 'stat_mod'          // {stat, delta}
  | 'add_status'        // {statusType, magnitude, duration}
  | 'remove_status'     // {statusType}
  | 'trigger_event'     // {eventId} — fire an event template
  | 'modify_relation'   // {charA, charB, affectionDelta, trustDelta}
  | 'spawn_npc'         // {npcTemplateId, atLocation}
  | 'spawn_item'        // {itemName, quantity, atLocation}
  | 'generate_intel'    // {category, truthBase} — AI fills content
  | 'modify_action_cost'// {actionKind, staminaMult, hungerMult}
  | 'unlock_action'     // {actionKind} — temporarily add to available actions
  | 'lock_action'       // {actionKind} — temporarily remove
  | 'narrative_hint'    // {topic, mood} — tells AI to mention in narrative
  | 'weather_change'    // {newWeather, intensity, duration}
  | 'set_flag'          // {flagName, value}
  | 'daily_income_mod'  // {delta} — modify asset income
  | 'spawn_event_chain' // {chainName} — seed a chain of related events
  | 'give_item'         // {itemName, itemType, quantity, value}
  | 'add_quest'         // {questId, name, description, objectives[], rewards{}}
  | 'update_quest'      // {questId, objectiveId, progress}
  ;

/** 规则条件 */
export interface RuleCondition {
  type: ConditionType;
  params: Record<string, unknown>;
}

/** 规则效果 */
export interface RuleEffect {
  type: EffectType;
  params: Record<string, unknown>;
}

/** 规则 = 条件集合 → 效果集合 */
export interface Rule {
  id: string;
  name: string;
  description: string;        // AI 填充
  category: 'weather' | 'location' | 'status' | 'asset' | 'relationship' | 'event' | 'world' | 'player_action' | 'ai_generated';
  conditions: RuleCondition[];
  effects: RuleEffect[];
  duration: number;           // 0=永久(条件满足即激活), >0=剩余回合
  removalConditions?: RuleCondition[]; // 提前解除条件
  source: string;             // 来源描述
  causalParent?: string;      // 父规则ID（因果链）
  priority: number;           // 越高越先执行
  activeSince: number;        // 激活回合
  isActive: boolean;
}

/** 天气 */
export interface Weather {
  type: 'clear' | 'rain' | 'storm' | 'fog' | 'snow' | 'heatwave';
  intensity: number; // 1-10
  description: string;
  remainingRounds: number;
}

/** 物品（背包中） */
export interface InventoryItem {
  id: string;
  name: string;
  itemType: 'food' | 'medicine' | 'weapon' | 'armor' | 'tool' | 'material' | 'document' | 'currency' | 'misc';
  quantity: number;
  description: string;
  value: number;          // 单价
  effects?: Record<string, number>; // e.g. {health_restore:15, hunger_restore:10}
  isEquipped: boolean;
  equippedSlot?: 'weapon' | 'armor' | 'accessory';
}

/** 任务 */
export interface Quest {
  id: string;
  name: string;
  description: string;
  category: 'main' | 'side' | 'personal' | 'faction' | 'survival' | 'ai_generated';
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  objectives: QuestObjective[];
  rewards: QuestReward;
  giverId?: string;         // 谁给的
  deadlineDay?: number;     // 截止日
  acquiredRound: number;
  completedRound?: number;
}

export interface QuestObjective {
  id: string;
  description: string;      // "收集5个药草"、"到达苇水村"
  type: 'collect' | 'reach' | 'kill' | 'talk' | 'build' | 'survive' | 'acquire_asset' | 'custom';
  target: string;           // 目标ID或名称
  required: number;         // 需要的数量
  current: number;          // 当前进度
  isCompleted: boolean;
}

export interface QuestReward {
  gold?: number;
  items?: Array<{ name: string; quantity: number }>;
  reputation?: Record<string, number>;  // faction → delta
  affection?: Record<string, number>;   // charId → delta
  unlockAsset?: string;                 // 资产ID
}
/** 状态效果 */
export interface StatusEffect {
  type: string;            // injured / sick / blessed / cursed / enraged / terrified
  magnitude: number;       // 强度
  remainingTurns: number;
}

/** 势力 / 群体（统计聚合） */
export interface FactionGroup {
  id: string;
  name: string;
  type: 'kingdom' | 'church' | 'merchant' | 'village' | 'tribe' | 'bandit' | 'monster';
  regionId: string;

  // 聚合统计（不从个体加总，直接存储）
  totalPopulation: number;
  activePopulation: number;  // 当前活着的
  
  // 统计分布
  avgHealth: number;
  avgMental: number;
  avgCombat: number;
  
  // 资源
  food: number;
  gold: number;
  morale: number;           // 士气 0-100

  // 态度（对各势力的态度）
  attitudes: Record<string, number>; // factionId -> -100 to +100

  // 当前主要行动倾向
  currentFocus: string;      // 'expanding' | 'defending' | 'trading' | 'raiding' | 'fleeing'
}

/** 地点 */
export interface Location {
  id: string;
  name: string;
  region: string;
  description: string;
  isSafe: boolean;
  travelCost: number;        // 从相邻地点到达消耗的时段数
  connectedLocations: string[];
  population: number;        // 当地人口
  factionControl: string;    // 控制势力
}

/** 世界状态 */
export interface WorldState {
  // 标识
  gameId: string;
  round: number;
  day: number;
  phase: Phase;
  difficulty: Difficulty;
  populationScale: PopulationScale;
  seed: number;

  // 时间
  year: number;              // 光明历
  month: number;
  redMoonCountdown: number;  // 距红月重合剩余天数

  // 玩家
  playerId: string;

  // 个体角色（核心追踪的 ~50-200 人）
  characters: CharacterState[];

  // 势力群体（统计聚合）
  factions: FactionGroup[];

  // 地点
  locations: Location[];

  // 全局资源
  globalFood: number;
  globalStability: number;   // 全局稳定度 0-100

  // 玩家资产/契约
  assets: Asset[];
  // 雇佣关系
  employments: Employment[];
  // 队伍
  party: PartyInfo;
  // 关系网络
  relationships: Relationship[];
  // 奴隶
  slaves: SlaveState[];
  // 情报库
  intel: Intel[];
  // 活跃规则（条件→效果）
  rules: Rule[];
  // 天气
  weather: Weather;
  // 背包
  inventory: InventoryItem[];
  // 任务
  quests: Quest[];
}

/** 玩家意图 */
export interface Intent {
  actorId: string;
  kind: ActionKind;
  targetId?: string;        // 目标地点/NPC/物品
  detail?: string;          // 额外描述
  label?: string;
}

/** AI为NPC生成的决策 */
export interface NpcDecision {
  characterId: string;
  intent: Intent;
  reasoning: string;        // AI给出的理由
  aiGuided: boolean;        // true=AI决策, false=随机
}

/** 势力群体行动（统计层面的） */
export interface FactionAction {
  factionId: string;
  actionType: string;       // 'expand' | 'trade' | 'raid' | 'defend' | 'migrate'
  targetFactionId?: string;
  targetLocationId?: string;
  result: Record<string, number>; // 影响的数值变化
}

/** 游戏事件 */
export interface GameEvent {
  id: string;
  type: string;
  category: 'public' | 'local' | 'private' | 'faction' | 'world';
  actorId?: string;
  targetId?: string;
  locationId?: string;
  round: number;
  phase: Phase;
  day: number;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  // 因果链：此事件由哪些事件导致
  causedBy: string[];
}

/** 回合结算结果 */
export interface TurnResolution {
  state: WorldState;
  events: GameEvent[];
  playerEvents: GameEvent[];     // 玩家可见的事件
  factionActions: FactionAction[];
  deaths: DeathRecord[];
  narrativeHints: NarrativeHint[]; // 供AI生成叙事的提示
}

/** 死亡记录 */
export interface DeathRecord {
  characterId: string;
  name: string;
  reason: string;           // '生命耗尽' | '精神崩溃' | '饥饿致死' | '战斗死亡' | '疾病'
  locationId: string;
  round: number;
}

/** 叙事提示（传递给AI生成叙事用） */
export interface NarrativeHint {
  viewpoint: string;         // 视角角色ID
  category: 'action_result' | 'world_event' | 'character_event' | 'combat' | 'discovery';
  priority: number;          // 1-10，越高越重要
  facts: string[];           // 事实列表
  mood: string;              // 氛围
  relatedCharacters: string[];
  relatedLocations: string[];
}

// ============================================================
// 常量
// ============================================================

export const PHASES: Phase[] = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night'];

export const PHASE_LABELS: Record<Phase, string> = {
  dawn: '黎明',
  morning: '上午',
  noon: '正午',
  afternoon: '下午',
  dusk: '傍晚',
  night: '夜晚',
};

export const PHASE_HOURS: Record<Phase, { start: number; end: number }> = {
  dawn:    { start: 4,  end: 6  },
  morning:  { start: 6,  end: 10 },
  noon:     { start: 10, end: 14 },
  afternoon:{ start: 14, end: 18 },
  dusk:     { start: 18, end: 20 },
  night:    { start: 20, end: 4  },
};

export const RACES = ['人类', '亚人(狼系)', '亚人(猫系)', '亚人(兔系)', '亚人(狐系)', '矮人', '精灵', '魔族'] as const;

export const OCCUPATIONS = ['农民', '商人', '工匠', '佣兵', '学者', '神职者', '猎人', '盗贼', '流浪者', '贵族', '奴隶'] as const;

export const POPULATION_SCALES: Record<PopulationScale, { total: number; coreCount: number; factionCount: number; locationCount: number; description: string }> = {
  small:  { total: 5_000_000,  coreCount: 40,  factionCount: 12, locationCount: 30,  description: '小王国（500万人）' },
  medium: { total: 10_000_000, coreCount: 80,  factionCount: 20, locationCount: 50,  description: '中等王国（1000万人）' },
  large:  { total: 20_000_000, coreCount: 150, factionCount: 30, locationCount: 80,  description: '大王国（2000万人）' },
};

export const DIFFICULTY_CONFIG: Record<Difficulty, {
  label: string;
  desc: string;
  hungerRate: number;
  damageMult: number;
  mentalDrainMult: number;
  startingGold: number;
  startingFood: number;
  startingMedicine: number;
  negativeEventChance: number;
  escapeBonus: number;
}> = {
  story: {
    label: '故事模式', desc: '资源充裕，负面事件较少，适合体验剧情',
    hungerRate: 0.6, damageMult: 0.7, mentalDrainMult: 0.7,
    startingGold: 150, startingFood: 10, startingMedicine: 3,
    negativeEventChance: 0.15, escapeBonus: 0.3,
  },
  survival: {
    label: '生存模式', desc: '资源与风险均衡，推荐体验',
    hungerRate: 1.0, damageMult: 1.0, mentalDrainMult: 1.0,
    startingGold: 120, startingFood: 5, startingMedicine: 1,
    negativeEventChance: 0.25, escapeBonus: 0.0,
  },
  doom: {
    label: '末日模式', desc: '资源匮乏，伤害加剧，每一步都是生死抉择',
    hungerRate: 1.4, damageMult: 1.35, mentalDrainMult: 1.3,
    startingGold: 80, startingFood: 2, startingMedicine: 0,
    negativeEventChance: 0.35, escapeBonus: -0.2,
  },
};

/** 行动消耗配置 */
export const ACTION_COST: Record<ActionKind, { stamina: number; phases: number; hunger: number }> = {
  move:      { stamina: 8,  phases: 1, hunger: 3  },
  rest:      { stamina: -20, phases: 1, hunger: 1  },  // 负值=恢复
  work:      { stamina: 12, phases: 1, hunger: 4  },
  explore:   { stamina: 10, phases: 1, hunger: 3  },
  socialize: { stamina: 5,  phases: 1, hunger: 2  },
  build:     { stamina: 16, phases: 2, hunger: 5  },
  trade:     { stamina: 6,  phases: 1, hunger: 2  },
  combat:    { stamina: 20, phases: 1, hunger: 6  },
  scout:     { stamina: 8,  phases: 1, hunger: 2  },
  hunt:      { stamina: 14, phases: 1, hunger: 4  },
  gather:    { stamina: 8,  phases: 1, hunger: 2  },
  craft:     { stamina: 10, phases: 1, hunger: 3  },
  study:     { stamina: 6,  phases: 1, hunger: 2  },
  pray:      { stamina: 3,  phases: 1, hunger: 1  },
  wait:      { stamina: 3,  phases: 1, hunger: 2  },
  eat:       { stamina: -5, phases: 1, hunger: -15 },
  sleep:     { stamina: -20,phases: 2, hunger: 2  },
  patrol:    { stamina: 10, phases: 1, hunger: 3  },
  train:     { stamina: 14, phases: 2, hunger: 4  },
  heal:      { stamina: 10, phases: 1, hunger: 2  },
  entertain: { stamina: 6,  phases: 2, hunger: 3  },
  night_interact: { stamina: -5, phases: 1, hunger: 1 },
};

/** 死亡阈值 */
export const DEATH_THRESHOLDS = {
  health: 0,       // 生命归零 → 死亡
  mental: 0,       // 精神归零 → 精神崩溃，若持续3回合 → 死亡
  hunger: 100,     // 饥饿达到100 → 开始快速掉血
  hungerDamage: 15,// 饥饿≥85时每天扣血
  hungerCritThreshold: 85,
  staminaDepletionDamage: 5, // 体力归零时每回合扣血
  starvationDays: 7, // 连续无粮天数致死
} as const;
