// ============================================
// 回合管理器：完整 12 阶段 + 所有子系统集成
// ============================================
import type { TurnContext, ActionDef, RuleBindable } from '../types'
import { TimeBlock, Season, Weather, getSeason, TIME_BLOCK_SEQ } from '../types'
import { RuleEngine } from '../rules/rule-engine'
import { ActionGatingEngine } from '../gating/action-gating'
import { CharacterSystem } from '../character/character-system'
import { WeatherSystem } from '../weather/weather-system'
import { EventEngine } from '../events/event-engine'
import { QuestManager } from '../quests/quest-manager'
import { CombatEngine } from '../combat/combat-engine'
import { EconomySystem } from '../economy/economy-system'
import { NpcTickSystem } from '../npc/npc-tick'
import { BUILTIN_ACTIONS } from '../actions/builtin-actions'
import { locationRepo, npcRepo } from '../../repository'

export interface TurnConfig {
  playerName: string; locationId: number; locationName: string; region: string; locationTags: string[]
  weather: Weather; season: Season; year: number; month: number; day: number; timeBlock: TimeBlock
  initialFoodDays: number; initialMental: number
}

export class TurnManager {
  private ctx!: TurnContext
  private ruleEngine = new RuleEngine()
  private gatingEngine = new ActionGatingEngine(this.ruleEngine)
  private characterSystem = new CharacterSystem()
  private weatherSystem = new WeatherSystem()
  private eventEngine = new EventEngine()
  private questManager = new QuestManager()
  private combatEngine = new CombatEngine()
  private economySystem = new EconomySystem()
  private npcTickSystem = new NpcTickSystem()
  private actions: ActionDef[] = []

  initialize(config: TurnConfig): TurnContext {
    this.ctx = {
      turn: 0, year: config.year, month: config.month, day: config.day, timeBlock: config.timeBlock,
      season: config.season, weather: config.weather, locationId: config.locationId,
      player: createDefaultPlayer(config.playerName, config.initialFoodDays, config.initialMental),
      flags: new Map(), modifiers: [], narrativeFragments: [],
      pendingEvents: [], activeQuests: [],
    }
    this.ctx.flags.set('_locationTags', JSON.stringify(config.locationTags))
    this.ctx.flags.set('_locationName', config.locationName)
    this.ctx.flags.set('_region', config.region)
    this.actions = BUILTIN_ACTIONS
    return this.ctx
  }

  registerActions(actions: ActionDef[]): void { this.actions = actions }

  executeTurn(actionId: string, _customInput?: string): TurnResult {
    // 0. TURN_INIT
    this.ctx.turn++; this.ctx.modifiers = []; this.ctx.narrativeFragments = []

    // 1. TIME_ADVANCE
    this.advanceTime()

    // 2. WORLD_ANNOUNCE
    this.weatherSystem.update(this.ctx)

    // 4. PLAYER_ACTION
    let actionName: string
    let ar: { narrative: string; resourceChanges: any[]; flagChanges: any[] }
    const moveTargetId = actionId.startsWith('move:') ? Number(actionId.slice(5)) : NaN
    const talkTargetId = actionId.startsWith('talk:') ? Number(actionId.slice(5)) : NaN

    if (Number.isInteger(moveTargetId)) {
      const connection = locationRepo.getConnected(this.ctx.locationId).find(c => c.targetId === moveTargetId)
      const destination = locationRepo.getById(moveTargetId)
      if (!connection || !destination) return this.ok('这个地点目前无法前往。')
      const originName = this.ctx.flags.get('_locationName') ?? '此处'
      const cost = Math.max(0, connection.travelCost * 10)
      if (this.ctx.player.sp < cost) return this.ok(`体力不足，前往 ${destination.name} 需要 ${cost} 点体力。`)
      this.ctx.player.sp -= cost
      this.ctx.locationId = destination.id
      this.ctx.flags.set('_locationName', destination.name)
      this.ctx.flags.set('_region', destination.region)
      this.ctx.flags.set('_locationTags', JSON.stringify(destination.tags))
      actionName = `前往 ${destination.name}`
      ar = { narrative: `你离开 ${originName}，前往 ${destination.name}。\n\n${destination.description}`, resourceChanges: [], flagChanges: [] }
    } else if (Number.isInteger(talkTargetId)) {
      const npc = npcRepo.getById(talkTargetId)
      if (!npc || npc.locationId !== this.ctx.locationId) return this.ok('对方现在不在这里。')
      actionName = `与 ${npc.name} 交谈`
      ar = { narrative: `你走向 ${npc.name}。${npc.description}\n\n“有什么事？”${npc.name}看着你，等待你开口。`, resourceChanges: [], flagChanges: [] }
    } else {
      const actionDef = this.availableActionDefs().find(a => a.id === actionId)
      if (!actionDef) return this.ok('这个行动在当前场景不可用。')
      const spCost = actionDef.requirements.spCost ?? 0
      this.ctx.player.sp = Math.max(0, this.ctx.player.sp - spCost)
      actionName = actionDef.name
      ar = actionDef.execute(this.ctx)
    }
    this.narr(ar.narrative, 10, 'player_action')
    for (const fc of ar.flagChanges) this.ctx.flags.set(fc.name, fc.value)
    for (const rc of ar.resourceChanges) this.ctx.modifiers.push(rc)

    // 5. ACTION_RESULT
    this.narr(`[行动: ${actionName}]`, 8, 'action_result')

    // 6. RULE_EVALUATE
    this.ruleEngine.evaluateAll(this.ctx, [] as RuleBindable[])

    // 7. NPC_PHASE
    const npcNarratives = this.npcTickSystem.tick(this.ctx)
    for (const nn of npcNarratives) this.narr(nn, 3, 'npc')

    // 8. WORLD_TICK
    this.characterSystem.tickStatusEffects(this.ctx)
    this.eventEngine.tickCooldowns()

    const evt = this.eventEngine.check(this.ctx)
    if (evt) {
      this.narr(`⚡ ${evt.narrative}`, 9, 'event')
      if (evt.choices.length > 0) {
        this.ctx.flags.set('_pendingEvent', evt.eventId.toString())
        this.ctx.flags.set('_pendingEventChoices', JSON.stringify(evt.choices))
      }
    }
    for (const ce of this.eventEngine.checkPendingChains(this.ctx)) {
      this.eventEngine.fireChainEvent(ce, this.ctx)
    }
    this.questManager.tick(this.ctx)

    // 9. NARRATIVE_SYNC
    const narrative = this.ctx.narrativeFragments.sort((a, b) => b.priority - a.priority).map(f => f.text).join('\n\n')

    // 11. TURN_END + 死亡检测
    const alive = this.ctx.player.hp > 0
    if (!alive) this.narr('💀 你的生命走到了尽头。', 100, 'death')

    return this.ok(narrative)
  }

  getContext(): TurnContext { return this.ctx }

  // ─── 私有 ───
  private advanceTime(): void {
    const idx = TIME_BLOCK_SEQ.indexOf(this.ctx.timeBlock)
    const next = (idx + 1) % TIME_BLOCK_SEQ.length
    this.ctx.timeBlock = TIME_BLOCK_SEQ[next]
    if (next <= idx) {
      this.ctx.day++
      this.ctx.player.foodDays = Math.max(0, this.ctx.player.foodDays - 1)
      if (this.ctx.player.foodDays <= 0) { this.ctx.player.hp = Math.max(0, this.ctx.player.hp - 15); this.narr('饥饿感像钝刀一样刮着你的胃。', 9, 'time') }
      if (this.ctx.day > 30) { this.ctx.day = 1; this.ctx.month++; this.ctx.season = getSeason(this.ctx.month) }
      if (this.ctx.month > 12) { this.ctx.month = 1; this.ctx.year++ }
    }
    if (this.ctx.timeBlock === TimeBlock.夜晚) {
      const [sr, hr, mr] = [Math.min(15, this.ctx.player.maxSp - this.ctx.player.sp), Math.min(5, this.ctx.player.maxHp - this.ctx.player.hp), Math.min(10, this.ctx.player.maxMp - this.ctx.player.mp)]
      this.ctx.player.sp += sr; this.ctx.player.hp += hr; this.ctx.player.mp += mr
      this.narr(`夜色降临。你歇下了。恢复 ${hr} HP, ${sr} SP。`, 5, 'time')
    }
  }

  private narr(text: string, p: number, src: string): void { this.ctx.narrativeFragments.push({ text, priority: p, source: src }) }

  private availableActionDefs(): ActionDef[] {
    const location = locationRepo.getById(this.ctx.locationId)
    if (!location) return []
    const facilityActionIds = new Set(location.facilities.flatMap(facility => facility.actions.map(action => action.actionId)))
    const sceneActions = this.actions.filter(action =>
      action.requirements.locationTags?.includes('summoning') || facilityActionIds.has(action.id),
    )
    return sceneActions
  }

  private ok(narrative: string): TurnResult {
    const location = locationRepo.getById(this.ctx.locationId)
    const gated = this.gatingEngine.gate(this.availableActionDefs(), this.ctx).filter(action => action.available)
    const actions = gated.map(({ action }) => ({
      id: action.id, title: action.name,
      description: action.requirements.spCost ? `消耗 ${action.requirements.spCost} 点体力` : '',
      category: action.category,
    }))

    const canLeaveSummoning = !location?.tags.includes('summoning') || this.ctx.flags.get('received_settlement_fund') === 'true'
    if (location && canLeaveSummoning) {
      for (const connection of location.connections) {
        const destination = locationRepo.getById(connection.targetId)
        if (destination && connection.status === 'open') {
          actions.push({ id: `move:${destination.id}`, title: `前往 ${destination.name}`, description: `消耗 ${connection.travelCost * 10} 点体力`, category: '移动' })
        }
      }
    }
    if (location) {
      for (const npc of npcRepo.getByLocation(location.id)) {
        actions.push({ id: `talk:${npc.id}`, title: `与 ${npc.name} 交谈`, description: npc.occupation ?? '交谈', category: '社交' })
      }
    }
    if (actions.length === 0) {
      const rest = this.actions.find(action => action.id === 'rest')
      if (rest) actions.push({ id: rest.id, title: rest.name, description: '暂时无其他可做之事', category: rest.category })
    }

    return {
      narrative,
      actions,
      state: {
        location: this.ctx.flags.get('_locationName') ?? '未知地点',
        region: this.ctx.flags.get('_region') ?? '未知区域',
        dateDisplay: `光明历${this.ctx.year}年 ${this.ctx.month}月 第${this.ctx.day}天`, timeBlock: this.ctx.timeBlock,
        hp: this.ctx.player.hp, maxHp: this.ctx.player.maxHp, sp: this.ctx.player.sp, maxSp: this.ctx.player.maxSp,
        mp: this.ctx.player.mp, maxMp: this.ctx.player.maxMp, silver: this.ctx.player.silver, foodDays: this.ctx.player.foodDays,
        weather: this.ctx.weather, season: this.ctx.season, turn: this.ctx.turn,
      },
      isAlive: this.ctx.player.hp > 0, isPlayerTurn: true,
    }
  }
}

export interface TurnResult {
  narrative: string
  actions: Array<{ id: string; title: string; description: string; category: string; reason?: string }>
  state: { location: string; region: string; dateDisplay: string; timeBlock: string; hp: number; maxHp: number; sp: number; maxSp: number; mp: number; maxMp: number; silver: number; foodDays: number; weather: string; season: string; turn: number }
  isAlive: boolean; isPlayerTurn: boolean
}

function createDefaultPlayer(name: string, foodDays: number, mental: number) {
  return {
    name, gender: '男', hp: 100, maxHp: 100, sp: 100, maxSp: 100, mp: mental, maxMp: 100, silver: 120, copper: 0, foodDays, medicineCount: 0,
    personality: { kindness: 50, bravery: 50, rationality: 50, independence: 50, honesty: 50 },
    psychology: { current: '正常' as any, duration: 0, elapsed: 0, triggers: [] },
    statusEffects: [], skills: [],
    inventory: [],
    equipment: { weapon: null, armor: null, accessory: null, tool: null },
    relationships: new Map(), reputations: new Map(),
  }
}
