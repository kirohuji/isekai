// ============================================
// 引擎共享类型 —— 所有子系统的基础类型
// ============================================

// ─── 回合上下文 ───
export interface TurnContext {
  turn: number
  year: number; month: number; day: number
  timeBlock: TimeBlock
  season: Season
  weather: Weather
  locationId: number
  player: PlayerState
  flags: Map<string, string>
  modifiers: ModifierRequest[]
  narrativeFragments: NarrativeFragment[]
  pendingEvents: PendingEvent[]
  activeQuests: QuestInstance[]
}

// ─── 时间 ───
export enum TimeBlock {
  黎明 = '黎明', 清晨 = '清晨', 上午 = '上午',
  正午 = '正午', 下午 = '下午', 傍晚 = '傍晚', 夜晚 = '夜晚',
}
export const TIME_BLOCK_SEQ = [TimeBlock.黎明, TimeBlock.清晨, TimeBlock.上午, TimeBlock.正午, TimeBlock.下午, TimeBlock.傍晚, TimeBlock.夜晚]

export enum Season { 春 = '春', 夏 = '夏', 秋 = '秋', 冬 = '冬' }
export function getSeason(month: number): Season {
  if (month >= 3 && month <= 5) return Season.春
  if (month >= 6 && month <= 8) return Season.夏
  if (month >= 9 && month <= 11) return Season.秋
  return Season.冬
}

export enum Weather {
  晴朗 = '晴朗', 多云 = '多云', 阴天 = '阴天',
  小雨 = '小雨', 大雨 = '大雨', 暴雨 = '暴雨',
  雾 = '雾', 酷热 = '酷热', 寒潮 = '寒潮',
}

// ─── 玩家状态 ───
export interface PlayerState {
  name: string; gender: string
  hp: number; maxHp: number
  sp: number; maxSp: number
  mp: number; maxMp: number
  silver: number; copper: number
  foodDays: number; medicineCount: number
  personality: PersonalityProfile
  psychology: PsychologicalState
  statusEffects: StatusEffectInstance[]
  skills: SkillInstance[]
  inventory: InventoryItem[]
  equipment: EquipSlots
  relationships: Map<number, RelationshipState>
  reputations: Map<string, number>
}

export interface PersonalityProfile {
  kindness: number; bravery: number; rationality: number
  independence: number; honesty: number
}

export interface PsychologicalState {
  current: string
  sourceEvent?: string
  duration: number; elapsed: number
  triggers?: PsychoTrigger[]
}

export interface PsychoTrigger {
  condition: Condition; forcedState: string
}

// ─── 仓库接口（引擎通过接口读静态数据）───
export interface LocationDef {
  id: number; name: string; region: string; description: string
  tags: string[]; isSafe: boolean
  facilities: FacilityDef[]; connections: ConnectionDef[]
  harvestable?: HarvestableDef[]; residentNpcIds: number[]
  rules?: Rule[]
}

export interface ConnectionDef {
  targetId: number; travelCost: number; condition?: Condition
  isKnown: boolean; status: 'open' | 'blocked' | 'dangerous' | 'hidden'
  travelNarrative?: string
}

export interface FacilityDef {
  id: string; name: string; description: string
  actions: FacilityActionDef[]; state: string
}

export interface FacilityActionDef {
  actionId: string; narrativeOverride?: string
}

export interface HarvestableDef {
  resourceId: string; name: string; yield: number
  respawnTurns: number; remainingUses: number
}

export interface NpcDef {
  id: number; name: string; race: string; gender: string
  locationId: number; description: string
  personality: PersonalityProfile
  personalityType?: string
  occupation?: string; isRecruitable: boolean
  dialogueTopics?: string[]
}

export interface ItemDef {
  id: number; name: string; type: string; weight: number
  description: string; baseBuyPrice: number; baseSellPrice: number
  useEffect?: any; equipModifiers?: ModifierDef[]
}

export interface SkillDef {
  id: string; name: string; category: string; maxLevel: number
  levelEffects: SkillLevelEffect[]
}

export interface EventTemplateDef {
  id: number; name: string; category: string
  narrativeBase: string; conditionJson: string; choicesJson: string
  cooldownTurns: number; isRepeatable: boolean; priority: number
}

// ─── 规则系统基础类型 ───
export interface Condition {
  type: string
  evaluate(ctx: TurnContext): boolean
}

export interface Effect {
  type: string
  execute(ctx: TurnContext): void
}

export interface Rule {
  id: string; name: string
  condition: Condition; effects: Effect[]
  priority?: number; description?: string
}

export interface RuleBindable { rules: Rule[] }

export interface ModifierRequest {
  target: string; operation: 'add' | 'multiply' | 'set'; value: number
  priority?: number; source?: string
}

export interface ModifierDef {
  target: string; operation: 'add' | 'multiply' | 'set'; value: number
}

// ─── 行动 ───
export interface ActionDef {
  id: string; name: string; category: string; icon: string
  requirements: ActionReq
  narrativeTemplate: string
  execute(ctx: TurnContext): ActionResult
}

export interface ActionReq {
  spCost?: number; minSp?: number; minHp?: number; minMp?: number
  skills?: SkillReq[]; items?: ItemReq[]
  timeBlocks?: TimeBlock[]; locationTags?: string[]
  personality?: Partial<PersonalityProfile & Record<string, { min: number; max?: number }>>
}

export interface SkillReq { skillId: string; minLevel: number }
export interface ItemReq { itemId: string; minQuantity?: number; consumed?: boolean }

export interface ActionResult {
  narrative: string
  resourceChanges: ModifierRequest[]
  flagChanges: Array<{ name: string; value: string; tier: 'persistent' | 'session' }>
}

export interface NarrativeFragment { text: string; priority: number; source: string }

// ─── 事件 ───
export interface EventChoice {
  label: string; description?: string
  condition?: Condition; effects: EventEffect[]
  chain?: EventChainLink[]
}

export interface EventChainLink {
  eventId: number; delay: { type: 'fixed' | 'mttH'; turns?: number; baseTurns?: number }
}

export type EventEffect =
  | { type: 'modifier'; target: string; operation: string; value: number }
  | { type: 'setFlag'; name: string; value: string }
  | { type: 'narrative'; text: string }
  | { type: 'triggerEvent'; eventId: number; delay?: number }
  | { type: 'startQuest'; questId: string }
  | { type: 'advanceQuest'; questId: string; stage: number }
  | { type: 'addItem'; itemId: string; quantity: number }
  | { type: 'removeItem'; itemId: string; quantity: number }

// ─── 任务 ───
export interface QuestDef {
  id: string; name: string; description: string
  category: string; isMainQuest: boolean; isAbandonable: boolean
  activationCondition?: Condition; failureCondition?: Condition
  timeoutTurns?: number
  stages: QuestStageDef[]; rewards?: QuestReward[]
}

export interface QuestStageDef {
  id: number; name: string; description: string
  completionConditions: StageCondition[]; onEnter?: any; onComplete?: any
  narrative?: string
}

export interface StageCondition {
  type: string; params: Record<string, any>; target: number
}

export interface QuestInstance {
  questId: string; status: string; currentStage: number
  stageProgress: Record<string, number>
  acceptedAtTurn: number
}

export type QuestReward =
  | { type: 'silver'; value: number }
  | { type: 'item'; itemId: string; quantity: number }
  | { type: 'reputation'; faction: string; value: number }
  | { type: 'experience'; skillId: string; value: number }
  | { type: 'setFlag'; name: string; value: string }

// ─── 运行时状态实例 ───
export interface StatusEffectInstance {
  id: string; name: string; type: string
  duration: number; elapsed: number
  modifiers?: ModifierDef[]; blockActions?: string[]
  unlockActions?: string[]
}

export interface SkillInstance { skillId: string; level: number; xp: number }

export interface InventoryItem {
  id: number; itemId: string; itemName: string; itemType: string
  quantity: number; isEquipped: boolean
}

export interface EquipSlots {
  weapon: InventoryItem | null
  armor: InventoryItem | null
  accessory: InventoryItem | null
  tool: InventoryItem | null
}

export interface RelationshipState {
  npcId: number; affection: number; trust: number; status: string
}

export interface SkillLevelEffect {
  level: number; unlockActions?: string[]
  modifiers?: ModifierDef[]; rules?: Rule[]
  narrativeOnLevelUp?: string
}

export interface PendingEvent {
  eventId: number; remainingTurns: number
  extraCondition?: Condition; sourceTurn: number
}

// ─── 战斗 ───
export interface CombatResult {
  winner: 'player' | 'enemy' | 'flee'; playerHpLost: number
  enemyDefeated: boolean; narrative: string; duration: number; spCost: number
}

export interface EnemyDef {
  id: number; name: string; baseAttack: number; baseDefense: number
  maxHp: number; loot?: Array<{ itemId: string; chance: number; quantity: number }>
  region?: string
}

// ─── 商人 ───
export interface MerchantDef {
  id: number; npcId: number; name: string; priceModifier: number
  sells: Array<{ itemId: string; stock: number; limited: boolean; restockTurns: number }>
  buys: string[]; rules?: Rule[]
}
