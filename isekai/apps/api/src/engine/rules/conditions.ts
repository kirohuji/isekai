// ============================================
// 规则系统：条件 (Condition)
// ============================================
import type { TurnContext, Condition } from '../types'

// ─── 天气条件 ───
export class WeatherCondition implements Condition {
  type = 'weather'
  constructor(private weather: string, private op: '==' | '!=' = '==') {}
  evaluate(ctx: TurnContext): boolean {
    return this.op === '==' ? ctx.weather === this.weather : ctx.weather !== this.weather
  }
}

// ─── 时段条件 ───
export class TimeBlockCondition implements Condition {
  type = 'timeBlock'
  constructor(private block: string) {}
  evaluate(ctx: TurnContext): boolean {
    return ctx.timeBlock === this.block
  }
}

// ─── 季节条件 ───
export class SeasonCondition implements Condition {
  type = 'season'
  constructor(private season: string) {}
  evaluate(ctx: TurnContext): boolean {
    return ctx.season === this.season
  }
}

// ─── 资源条件 ───
export class ResourceCondition implements Condition {
  type = 'resource'
  constructor(
    private resource: 'hp' | 'sp' | 'mp' | 'silver' | 'foodDays',
    private op: string, private value: number,
  ) {}
  evaluate(ctx: TurnContext): boolean {
    const p = ctx.player
    let current: number
    switch (this.resource) {
      case 'hp': current = p.hp; break
      case 'sp': current = p.sp; break
      case 'mp': current = p.mp; break
      case 'silver': current = p.silver; break
      case 'foodDays': current = p.foodDays; break
    }
    return compare(current, this.op as any, this.value)
  }
}

// ─── 标记条件 ───
export class FlagCondition implements Condition {
  type = 'flag'
  constructor(private name: string, private op: string, private value?: string) {}
  evaluate(ctx: TurnContext): boolean {
    const flag = ctx.flags.get(this.name)
    switch (this.op) {
      case 'exists': return flag !== undefined
      case 'notExists': return flag === undefined
      case '==': return flag === this.value
      case '!=': return flag !== this.value
      default: return false
    }
  }
}

// ─── 持有物品 ───
export class HasItemCondition implements Condition {
  type = 'hasItem'
  constructor(private itemId: string, private minQty: number = 1) {}
  evaluate(ctx: TurnContext): boolean {
    return ctx.player.inventory
      .filter(i => i.itemId === this.itemId)
      .reduce((sum, i) => sum + i.quantity, 0) >= this.minQty
  }
}

// ─── 好感度条件 ───
export class AffectionCondition implements Condition {
  type = 'affection'
  constructor(private npcId: number, private op: string, private value: number) {}
  evaluate(ctx: TurnContext): boolean {
    const rel = ctx.player.relationships.get(this.npcId)
    if (!rel) return false
    return compare(rel.affection, this.op as any, this.value)
  }
}

// ─── 声望条件 ───
export class ReputationCondition implements Condition {
  type = 'reputation'
  constructor(private faction: string, private op: string, private value: number) {}
  evaluate(ctx: TurnContext): boolean {
    const rep = ctx.player.reputations.get(this.faction) ?? 0
    return compare(rep, this.op as any, this.value)
  }
}

// ─── 行动类别条件（当前执行的行动）───
export class ActionCategoryCondition implements Condition {
  type = 'actionCategory'
  constructor(private category: string, private currentAction?: string) {}
  setContextAction(action: string) { this.currentAction = action }
  evaluate(_ctx: TurnContext): boolean {
    return this.currentAction === this.category
  }
}

// ─── 复合条件 ───
export class CompositeCondition implements Condition {
  type = 'composite'
  constructor(private logic: 'and' | 'or' | 'not', private conditions: Condition[]) {}
  evaluate(ctx: TurnContext): boolean {
    switch (this.logic) {
      case 'and': return this.conditions.every(c => c.evaluate(ctx))
      case 'or': return this.conditions.some(c => c.evaluate(ctx))
      case 'not': return !this.conditions[0]?.evaluate(ctx)
    }
  }
}

// ─── 技能条件 ───
export class SkillCondition implements Condition {
  type = 'skill'
  constructor(private skillId: string, private op: string, private level: number) {}
  evaluate(ctx: TurnContext): boolean {
    const skill = ctx.player.skills.find(s => s.skillId === this.skillId)
    return compare(skill?.level ?? 0, this.op as any, this.level)
  }
}

// ─── 性格条件 ───
export class PersonalityCondition implements Condition {
  type = 'personality'
  constructor(private trait: string, private op: string, private value: number) {}
  evaluate(ctx: TurnContext): boolean {
    const v = (ctx.player.personality as any)[this.trait] ?? 0
    return compare(v, this.op as any, this.value)
  }
}

// ─── 心理状态条件 ───
export class PsychologyCondition implements Condition {
  type = 'psychology'
  constructor(private state: string) {}
  evaluate(ctx: TurnContext): boolean {
    return ctx.player.psychology.current === this.state
  }
}

// ─── 辅助函数 ───
function compare(a: number, op: '>=' | '<=' | '>' | '<' | '==', b: number): boolean {
  switch (op) { case '>=': return a >= b; case '<=': return a <= b; case '>': return a > b; case '<': return a < b; case '==': return a === b }
}
