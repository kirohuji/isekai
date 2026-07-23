// ============================================
// CSV 加载器 —— 读取 CSV 文件，解析为引擎类型
// ============================================
import * as fs from 'fs'
import * as path from 'path'
import type {
  LocationDef, NpcDef, ItemDef, SkillDef, EventTemplateDef,
  EnemyDef, MerchantDef,
  ConnectionDef, FacilityDef, HarvestableDef,
} from '../engine/types'
import { PersonalityProfile } from '../engine/types'
import type { RuleDef, QuestDefFlat, DialogueTopicDef, CraftingDef } from './types'

const DATA_DIR = path.join(__dirname, '..', '..', 'data')

function readCsv(filename: string): Record<string, string>[] {
  const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8')
  const lines = content.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i]?.trim() ?? '' })
    return row
  })
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // CSV 转义："" → 一个文字双引号
        current += '"'
        i++ // 跳过下一个引号
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue }
    current += ch
  }
  result.push(current)
  return result
}

function parseJsonArray(str: string): string[] {
  if (!str || str === '[]') return []
  try { return JSON.parse(str) } catch {
    return str.replace(/[\[\]"]/g, '').split(',').map(s => s.trim()).filter(Boolean)
  }
}

function parseJsonNumArray(str: string): number[] {
  if (!str || str === '[]') return []
  try { return JSON.parse(str) } catch {
    return str.replace(/[\[\]]/g, '').split(',').map(s => Number(s.trim())).filter(Boolean)
  }
}

function safeJsonParse<T>(str: string, fallback: T): T {
  if (!str || str === '[]' || str === '{}') return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// ─── 地点 ───
export function loadLocations(): LocationDef[] {
  return readCsv('locations.csv').map(row => {
    const connected = parseJsonNumArray(row.connected_locations)
    const tags = parseJsonArray(row.tags)
    return {
      id: Number(row.id), name: row.name, region: row.region, description: row.description,
      tags, isSafe: row.is_safe === '1',
      facilities: getDefaultFacilities(Number(row.id), tags),
      connections: connected.map(targetId => ({
        targetId, travelCost: Number(row.travel_cost),
        isKnown: true, status: 'open' as const,
        travelNarrative: `你前往 ${row.name}...`,
      })),
      harvestable: tags.includes('wild') ? getDefaultHarvestable() : [],
      residentNpcIds: [],
    }
  })
}

function getDefaultFacilities(_locId: number, tags: string[]): FacilityDef[] {
  const facilities: FacilityDef[] = []
  if (tags.includes('indoor')) {
    facilities.push({ id: 'rest_spot', name: '休息处', description: '可以休息的地方', actions: [{ actionId: 'rest' }], state: 'available' })
  }
  if (tags.includes('wild')) {
    facilities.push({ id: 'wilderness', name: '野外', description: '荒野地带', actions: [{ actionId: 'explore' }, { actionId: 'chop_wood' }], state: 'available' })
  }
  return facilities
}

function getDefaultHarvestable(): HarvestableDef[] {
  return [
    { resourceId: 'wood', name: '木材', yield: 2, respawnTurns: 3, remainingUses: -1 },
    { resourceId: 'herb', name: '药草', yield: 1, respawnTurns: 5, remainingUses: 10 },
  ]
}

// ─── NPC ───
const personalityMap: Record<string, PersonalityProfile> = {
  rational:     { kindness: 40, bravery: 50, rationality: 80, independence: 70, honesty: 60 },
  pragmatic:    { kindness: 30, bravery: 70, rationality: 60, independence: 80, honesty: 40 },
  dependent:    { kindness: 60, bravery: 20, rationality: 30, independence: 20, honesty: 50 },
  warm:         { kindness: 80, bravery: 30, rationality: 40, independence: 30, honesty: 70 },
  cautious:     { kindness: 40, bravery: 20, rationality: 60, independence: 40, honesty: 50 },
  stoic:        { kindness: 30, bravery: 80, rationality: 50, independence: 90, honesty: 60 },
  authoritarian:{ kindness: 10, bravery: 70, rationality: 60, independence: 90, honesty: 20 },
  cunning:      { kindness: 20, bravery: 30, rationality: 70, independence: 70, honesty: 10 },
  mysterious:   { kindness: 50, bravery: 40, rationality: 70, independence: 60, honesty: 30 },
  wise:         { kindness: 60, bravery: 40, rationality: 90, independence: 70, honesty: 80 },
  fragile:      { kindness: 70, bravery: 10, rationality: 30, independence: 20, honesty: 60 },
}

export function loadNpcs(): NpcDef[] {
  return readCsv('npcs.csv').map(row => ({
    id: Number(row.id), name: row.name, race: row.race, gender: row.gender,
    locationId: Number(row.location_id),
    description: row.description,
    personality: personalityMap[row.personality_type] ?? personalityMap.rational,
    personalityType: row.personality_type,
    occupation: row.occupation,
    isRecruitable: row.is_recruitable === 'true',
    dialogueTopics: ['daily'],
  }))
}

// ─── 物品 ───
export function loadItems(): ItemDef[] {
  return readCsv('items.csv').map(row => ({
    id: Number(row.id), name: row.name, type: row.type,
    weight: Number(row.weight), description: row.description,
    baseBuyPrice: Number(row.base_buy_price), baseSellPrice: Number(row.base_sell_price),
    equipModifiers: row.equip_modifiers ? JSON.parse(row.equip_modifiers) : undefined,
  }))
}

// ─── 事件模板 ───
export function loadEventTemplates(): EventTemplateDef[] {
  return readCsv('event-templates.csv').map(row => ({
    id: Number(row.id), name: row.name, category: row.category,
    narrativeBase: row.narrative_base,
    conditionJson: row.condition_json, choicesJson: row.choices_json,
    cooldownTurns: Number(row.cooldown_turns),
    isRepeatable: row.is_repeatable === '1',
    priority: Number(row.priority),
  }))
}

// ─── 技能 ───
export function loadSkills(): SkillDef[] {
  return readCsv('skills.csv').map(row => ({
    id: row.id, name: row.name, category: row.category,
    maxLevel: Number(row.max_level),
    levelEffects: safeJsonParse(row.level_effects, []),
  }))
}

// ─── 敌人 ───
export function loadEnemies(): EnemyDef[] {
  return readCsv('enemies.csv').map(row => ({
    id: Number(row.id), name: row.name,
    baseAttack: Number(row.attack), baseDefense: Number(row.defense),
    maxHp: Number(row.maxHp),
    loot: safeJsonParse(row.loot, []),
    region: row.region,
  }))
}

// ─── 商人 ───
export function loadMerchants(): MerchantDef[] {
  return readCsv('merchants.csv').map(row => ({
    id: Number(row.id), npcId: Number(row.npc_id), name: row.name,
    priceModifier: Number(row.price_modifier),
    sells: safeJsonParse(row.sells, []),
    buys: safeJsonParse(row.buys, []),
  }))
}

// ─── 规则 ───
export function loadRules(): RuleDef[] {
  return readCsv('rules.csv').map(row => ({
    id: row.id, name: row.name,
    bindType: row.bind_type, bindId: row.bind_id,
    conditionType: row.condition_type,
    conditionParams: safeJsonParse(row.condition_params, row.condition_params),
    effectType: row.effect_type,
    effectParams: safeJsonParse(row.effect_params, row.effect_params),
    priority: Number(row.priority),
    description: row.description,
  }))
}

// ─── 任务 ───
export function loadQuests(): QuestDefFlat[] {
  return readCsv('quests.csv').map(row => ({
    id: row.id, name: row.name, description: row.description,
    category: row.category,
    isMain: row.is_main === 'true',
    isAbandonable: row.is_abandonable === 'true',
    timeoutTurns: Number(row.timeout_turns),
    activationFlag: row.activation_flag,
    stage1Name: row.stage1_name, stage1Desc: row.stage1_desc, stage1Cond: row.stage1_cond,
    stage2Name: row.stage2_name, stage2Desc: row.stage2_desc, stage2Cond: row.stage2_cond,
    stage3Name: row.stage3_name, stage3Desc: row.stage3_desc, stage3Cond: row.stage3_cond,
    rewards: row.rewards,
  }))
}

// ─── 对话话题 ───
export function loadDialogueTopics(): DialogueTopicDef[] {
  return readCsv('dialogue_topics.csv').map(row => ({
    npcId: Number(row.npc_id), topicId: row.topic_id,
    topicLabel: row.topic_label, topicCategory: row.topic_category,
    condition: row.condition,
    oneTime: row.one_time === 'true',
    inkFile: row.ink_file || undefined,
  }))
}

// ─── 制作配方 ───
export function loadCrafting(): CraftingDef[] {
  return readCsv('crafting.csv').map(row => ({
    id: Number(row.id), name: row.name,
    inputItems: String(row.input_items).split(',').map(s => s.trim()),
    inputQuantities: String(row.input_quantities).split(',').map(Number),
    outputItem: row.output_item,
    outputQuantity: Number(row.output_quantity),
    requiredSkill: row.required_skill,
    requiredLevel: Number(row.required_level),
    craftTimeBlocks: Number(row.craft_time_blocks),
  }))
}

// ─── 统一加载 ───
export interface AllGameData {
  locations: LocationDef[]
  npcs: NpcDef[]
  items: ItemDef[]
  eventTemplates: EventTemplateDef[]
  skills: SkillDef[]
  enemies: EnemyDef[]
  merchants: MerchantDef[]
  rules: RuleDef[]
  quests: QuestDefFlat[]
  dialogueTopics: DialogueTopicDef[]
  crafting: CraftingDef[]
}

export function loadAllData(): AllGameData {
  return {
    locations: loadLocations(),
    npcs: loadNpcs(),
    items: loadItems(),
    eventTemplates: loadEventTemplates(),
    skills: loadSkills(),
    enemies: loadEnemies(),
    merchants: loadMerchants(),
    rules: loadRules(),
    quests: loadQuests(),
    dialogueTopics: loadDialogueTopics(),
    crafting: loadCrafting(),
  }
}
