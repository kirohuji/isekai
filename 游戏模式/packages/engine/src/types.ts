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
  | 'move'
  | 'rest'
  | 'work'
  | 'explore'
  | 'socialize'
  | 'build'
  | 'trade'
  | 'combat'
  | 'scout'
  | 'hunt'
  | 'gather'
  | 'craft'
  | 'study'
  | 'pray'
  | 'wait';

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
