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

export interface TurnConfig { playerName: string; locationId: number; weather: Weather; season: Season }

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
      turn: 0, year: 847, month: 9, day: 15, timeBlock: TimeBlock.清晨,
      season: config.season, weather: config.weather, locationId: config.locationId,
      player: createDefaultPlayer(config.playerName),
      flags: new Map(), modifiers: [], narrativeFragments: [],
      pendingEvents: [], activeQuests: [],
    }
    this.ctx.flags.set('_locationTags', 'wild')
    this.ctx.flags.set('_locationName', '灰丘')
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
    const actionDef = this.actions.find(a => a.id === actionId)
    if (!actionDef) return this.ok('找不到该行动', [])

    const spCost = actionDef.requirements.spCost ?? 0
    this.ctx.player.sp = Math.max(0, this.ctx.player.sp - spCost)
    const ar = actionDef.execute(this.ctx)
    this.narr(ar.narrative, 10, 'player_action')
    for (const fc of ar.flagChanges) this.ctx.flags.set(fc.name, fc.value)
    for (const rc of ar.resourceChanges) this.ctx.modifiers.push(rc)

    // 5. ACTION_RESULT
    this.narr(`[行动: ${actionDef.name}]`, 8, 'action_result')

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

    const available = this.gatingEngine.gate(this.actions, this.ctx)
    return this.ok(narrative, available.filter(a => a.available))
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

  private ok(narrative: string, actions: any[]): TurnResult {
    return {
      narrative,
      actions: actions.map(a => ({ id: a.action.id, title: a.action.name, description: a.action.requirements.spCost ? `消耗 ${a.action.requirements.spCost} SP` : '', category: a.action.category, reason: a.reason })),
      state: {
        location: '灰丘', region: '东南边境',
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

function createDefaultPlayer(name: string) {
  return {
    name, gender: '男', hp: 100, maxHp: 100, sp: 100, maxSp: 100, mp: 100, maxMp: 100, silver: 120, copper: 0, foodDays: 7, medicineCount: 0,
    personality: { kindness: 50, bravery: 50, rationality: 50, independence: 50, honesty: 50 },
    psychology: { current: '正常' as any, duration: 0, elapsed: 0, triggers: [] },
    statusEffects: [], skills: [],
    inventory: [{ id: 1, itemId: 'food', itemName: '干粮', itemType: 'food', quantity: 7, isEquipped: false }],
    equipment: { weapon: null, armor: null, accessory: null, tool: null },
    relationships: new Map(), reputations: new Map(),
  }
}
