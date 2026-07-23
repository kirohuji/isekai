// ============================================
// 事件引擎：MTTH触发 + 选择 + 链式因果
// ============================================
import type { TurnContext, EventTemplateDef, EventChoice, PendingEvent } from '../types'
import { eventTemplateRepo } from '../../repository'

export class EventEngine {
  private cooldowns = new Map<number, number>()
  private triggeredThisTurn: number[] = []

  /** 每回合检测——返回触发的事件（如果需要玩家选择则标记为待处理） */
  check(ctx: TurnContext): TriggeredEvent | null {
    this.triggeredThisTurn = []
    // 召唤广场是手写开局场景；在玩家离开前，不允许随机世界事件打断引导。
    const locationTags = JSON.parse(ctx.flags.get('_locationTags') ?? '[]') as string[]
    if (locationTags.includes('summoning')) return null

    const templates = eventTemplateRepo.getAll().filter(t => !this.cooldowns.has(t.id) || this.cooldowns.get(t.id)! <= 0)

    // 按优先级排序，取最高
    let bestMatch: EventTemplateDef | null = null
    let bestPriority = -1
    for (const tpl of templates) {
      if (this.evaluateCondition(tpl, ctx) && tpl.priority > bestPriority) {
        bestMatch = tpl; bestPriority = tpl.priority
      }
    }

    if (!bestMatch) return null

    // 设置冷却
    this.cooldowns.set(bestMatch.id, bestMatch.cooldownTurns)
    this.triggeredThisTurn.push(bestMatch.id)

    // 解析选项
    const choices: EventChoice[] = JSON.parse(bestMatch.choicesJson)
    const narrative = fmt(bestMatch.narrativeBase, ctx)
    return { eventId: bestMatch.id, narrative, choices, category: bestMatch.category }
  }

  tickCooldowns(): void {
    for (const [id, remaining] of this.cooldowns) {
      this.cooldowns.set(id, remaining - 1)
    }
  }

  /** 执行玩家选择的选项 */
  executeChoice(eventId: number, choiceIdx: number, ctx: TurnContext): void {
    const tpl = eventTemplateRepo.getById(eventId)
    if (!tpl) return
    const choices: EventChoice[] = JSON.parse(tpl.choicesJson)
    const choice = choices[choiceIdx]
    if (!choice) return

    for (const eff of choice.effects) {
      this.applyEffect(eff as any, ctx)
    }
    if (choice.chain) {
      for (const link of choice.chain) {
        ctx.pendingEvents.push({
          eventId: link.eventId,
          remainingTurns: link.delay.turns ?? link.delay.baseTurns ?? 5,
          sourceTurn: ctx.turn,
        })
      }
    }
  }

  private applyEffect(eff: any, ctx: TurnContext): void {
    switch (eff.type) {
      case 'narrative': ctx.narrativeFragments.push({ text: eff.text, priority: 8, source: 'event' }); break
      case 'setFlag': ctx.flags.set(eff.name, eff.value); break
      case 'modifier': ctx.modifiers.push({ target: eff.target, operation: eff.operation, value: eff.value }); break
      case 'addItem': {
        const existing = ctx.player.inventory.find(i => i.itemId === eff.itemId)
        if (existing) existing.quantity += (eff.quantity ?? 1)
        else ctx.player.inventory.push({ id: Date.now(), itemId: eff.itemId, itemName: eff.itemId, itemType: 'misc', quantity: eff.quantity ?? 1, isEquipped: false })
        break
      }
      case 'triggerEvent': ctx.pendingEvents.push({ eventId: eff.eventId, remainingTurns: eff.delay ?? 0, sourceTurn: ctx.turn }); break
      case 'startQuest': break  // quest manager handles this
    }
  }

  /** 检查待处理的链式事件是否到期 */
  checkPendingChains(ctx: TurnContext): number[] {
    const ready: number[] = []
    for (const p of ctx.pendingEvents) {
      p.remainingTurns--
      if (p.remainingTurns <= 0) { ready.push(p.eventId); ctx.pendingEvents = ctx.pendingEvents.filter(e => e !== p) }
    }
    return ready
  }

  private evaluateCondition(tpl: EventTemplateDef, ctx: TurnContext): boolean {
    try {
      const cond = JSON.parse(tpl.conditionJson)
      if (cond.location_tags) {
        const locTags = JSON.parse(ctx.flags.get('_locationTags') ?? '[]') as string[]
        if (!cond.location_tags.some((tag: string) => locTags.includes(tag))) return false
      }
      if (cond.location !== undefined && Number(cond.location) !== ctx.locationId) return false
      if (cond.time_block && !matches(cond.time_block, ctx.timeBlock)) return false
      if (cond.season && !matches(cond.season, ctx.season)) return false
      if (cond.weather && !matches(cond.weather, ctx.weather)) return false
      if (cond.min_turn !== undefined && ctx.turn < Number(cond.min_turn)) return false

      if (cond.flag) {
        const actual = ctx.flags.get(cond.flag)
        if (cond.flag_op) {
          if (!compare(actual, cond.flag_op, cond.flag_val)) return false
        } else if (!actual || actual === 'false') {
          return false
        }
      }
      if (cond.food_days !== undefined || cond.food_val !== undefined) {
        const target = Number(cond.food_val ?? cond.food_days)
        if (!compare(ctx.player.foodDays, cond.food_op ?? '<=', target)) return false
      }
      if (cond.hp_ratio !== undefined || cond.hp_val !== undefined) {
        const target = Number(cond.hp_val ?? cond.hp_ratio)
        if (!compare(ctx.player.hp / ctx.player.maxHp, cond.hp_ratio ?? '<=', target)) return false
      }

      // 尚未实现 NPC/队伍/技能判断的事件必须等待对应系统接入，不能无条件触发。
      if (cond.npc || cond.npc_conflict || cond.npc_in_party || cond.npc_nearby || cond.skill || cond.minSkill || cond.affection_min || cond.red_moon_near) return false
      if (cond.random_chance && Math.random() * 100 > cond.random_chance) return false
      return true
    } catch { return false }
  }

  /** 处理链式事件 */
  fireChainEvent(eventId: number, ctx: TurnContext): void {
    const tpl = eventTemplateRepo.getById(eventId)
    if (!tpl) return
    this.cooldowns.set(eventId, tpl.cooldownTurns)
    const narrative = fmt(tpl.narrativeBase, ctx)
    ctx.narrativeFragments.push({ text: `⚡ ${tpl.name}: ${narrative}`, priority: 8, source: 'event' })
  }
}

function matches(condition: string | string[], actual: string): boolean {
  return Array.isArray(condition) ? condition.includes(actual) : condition === actual
}

function compare(actual: string | number | undefined, operator: string, expected: string | number | undefined): boolean {
  if (actual === undefined || expected === undefined) return false
  const actualNumber = Number(actual)
  const expectedNumber = Number(expected)
  const numeric = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)
  const left = numeric ? actualNumber : String(actual)
  const right = numeric ? expectedNumber : String(expected)
  if (operator === '>=') return left >= right
  if (operator === '<=') return left <= right
  if (operator === '!=') return left !== right
  return left === right
}

function fmt(text: string, ctx: TurnContext): string {
  return text.replace(/\{location\}/g, ctx.flags.get('_locationName') ?? '此处')
    .replace(/\{weather\}/g, ctx.weather)
    .replace(/\{timeBlock\}/g, ctx.timeBlock)
    .replace(/\{food\}/g, String(ctx.player.foodDays))
}

export interface TriggeredEvent {
  eventId: number; narrative: string; choices: EventChoice[]; category: string
}
