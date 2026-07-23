// ============================================
// 行动门控引擎 —— 10 道门控过滤
// ============================================
import type { TurnContext, ActionDef, ActionReq } from '../types'
import { RuleEngine } from '../rules/rule-engine'

export interface GatedAction {
  action: ActionDef
  available: boolean
  reason?: string
  unlockHint?: string
}

export class ActionGatingEngine {
  constructor(private ruleEngine: RuleEngine) {}

  /** 过滤出当前可用的行动 */
  gate(actions: ActionDef[], ctx: TurnContext): GatedAction[] {
    return actions.map(action => this.gateOne(action, ctx))
  }

  private gateOne(action: ActionDef, ctx: TurnContext): GatedAction {
    const req = action.requirements

    if (req.requiredFlags?.some(flag => !ctx.flags.get(flag) || ctx.flags.get(flag) === 'false')) {
      return { action, available: false, reason: '尚未满足前置条件' }
    }
    if (req.forbiddenFlags?.some(flag => ctx.flags.get(flag) && ctx.flags.get(flag) !== 'false')) {
      return { action, available: false, reason: '此行动已完成' }
    }

    // 1. 时间门控
    if (req.timeBlocks && !req.timeBlocks.includes(ctx.timeBlock as any)) {
      return { action, available: false, reason: `仅限${req.timeBlocks.join('、')}` }
    }

    // 2. 属性门控
    if (req.minSp && ctx.player.sp < req.minSp) {
      return { action, available: false, reason: `体力不足（需要≥${req.minSp}，当前${ctx.player.sp}）` }
    }
    if (req.minHp && ctx.player.hp < req.minHp) {
      return { action, available: false, reason: `生命不足（需要≥${req.minHp}，当前${ctx.player.hp}）` }
    }
    if (req.minMp && ctx.player.mp < req.minMp) {
      return { action, available: false, reason: `精神不足（需要≥${req.minMp}，当前${ctx.player.mp}）` }
    }

    // 3. 状态门控
    for (const se of ctx.player.statusEffects) {
      if (se.blockActions?.includes(action.id)) {
        return { action, available: false, reason: `状态[${se.name}]禁止此行动` }
      }
    }

    // 4. 心理门控
    if (ctx.player.psychology.current === '恐惧' && action.category === '探索') {
      return { action, available: false, reason: '你太害怕了，不敢去' }
    }

    // 5. 性格门控
    if (req.personality) {
      for (const [trait, range] of Object.entries(req.personality)) {
        const v = (ctx.player.personality as any)[trait] ?? 0
        if (typeof range === 'object' && range !== null) {
          if (v < (range as any).min) return { action, available: false, reason: `性格不匹配` }
        }
      }
    }

    // 6. 物品门控
    if (req.items) {
      for (const itemReq of req.items) {
        const owned = ctx.player.inventory
          .filter(i => i.itemId === itemReq.itemId)
          .reduce((s, i) => s + i.quantity, 0)
        if (owned < (itemReq.minQuantity ?? 1)) {
          return { action, available: false, reason: `需要: ${itemReq.itemId}`, unlockHint: `缺少${itemReq.itemId}` }
        }
      }
    }

    // 7. 技能门控
    if (req.skills) {
      for (const skReq of req.skills) {
        const skill = ctx.player.skills.find(s => s.skillId === skReq.skillId)
        if (!skill || skill.level < skReq.minLevel) {
          return { action, available: false, reason: `需要: ${skReq.skillId} Lv.${skReq.minLevel}` }
        }
      }
    }

    // 8. 地点门控
    if (req.locationTags && req.locationTags.length > 0) {
      const locationTags = ctx.flags.get('_locationTags') ?? ''
      const match = req.locationTags.some(t => locationTags.includes(t))
      if (!match) return { action, available: false, reason: '当前地点不可用' }
    }

    // 通过所有门控
    return { action, available: true }
  }
}
